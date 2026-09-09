# RAG for AI-assisted draft generation

## What this adds

The AI draft generation feature (`src/app/api/ai/generate/route.ts`) used a
single, static, hand-written few-shot example for every input. That's fine
as a cold-start baseline, but it means generation quality never improves —
the 500th journey generated gets exactly as much guidance as the 1st.

This adds retrieval: before calling the model, the system embeds the user's
process description and searches for similar **previously published**
journeys. If it finds close matches, their (description → schema) pairs are
injected as additional, more relevant few-shot examples alongside the static
one. As real usage accumulates, generation quality is meant to improve
without touching the prompt.

## Architecture

```
User types description
        │
        ▼
retrieveSimilarExamples()  ──▶  embed description (OpenAI embeddings)
        │                       │
        │                       ▼
        │                  pgvector cosine search over ai_draft_examples
        │                  (top-k, distance-thresholded)
        ▼
callDraftModel(history, retrievedExamples)
        │
        ▼
  [ SYSTEM_PROMPT (static, cached) ]
  [ retrieved examples (dynamic, NOT cached) ]   ← separate message, see below
  [ conversation history ]
        │
        ▼
  emit_journey_draft / request_clarification (unchanged agentic behavior)
```

### Corpus storage: Postgres + pgvector, not a separate vector DB

`ai_draft_examples` (`prisma/schema.prisma`) is a plain Postgres table with
one `vector(1536)` column. Given the corpus size this tool will realistically
have (hundreds to low thousands of published journeys, not millions), a
dedicated vector database is unjustified infrastructure — one more service
to run, pay for, and keep in sync. pgvector's brute-force cosine search
(`<=>` operator) is fast enough at this scale, and it means the RAG corpus
lives in the same database, transaction, and backup story as everything
else. If this ever needed to scale past that, an IVFFlat or HNSW index on
the `embedding` column would be the first lever — not a database migration
to a different system.

**Setup requirement**: pgvector must be enabled once, before running
migrations:

```sql
-- Run this once against your database (Supabase: SQL Editor; self-hosted:
-- psql) BEFORE running `npx prisma migrate dev`.
CREATE EXTENSION IF NOT EXISTS vector;
```

Prisma doesn't have a native `vector` type, so the column is declared
`Unsupported("vector(1536)")` in the schema — it passes through to Postgres
as-is, but Prisma Client can't read/write it directly. All access goes
through raw SQL in `src/lib/rag.ts` (`$queryRawUnsafe` / `$executeRawUnsafe`),
confined to that one file.

### The quality gate: retrieval learns from *published* outcomes only

This is the most important design decision here, not the vector search
itself. A row is written to `ai_draft_examples` **only** when:

1. A journey was drafted via AI (its current version has a
   `sourceDescription` — see the new column on `JourneyVersion`), **and**
2. That journey survives the full review gate and reaches `published` status.

The write happens in the publish route (`src/app/api/journeys/[id]/publish/route.ts`),
not at generation time. A draft that gets rejected in review, abandoned, or
never submitted never enters the corpus. This matters because naive RAG
("retrieve whatever was generated before") compounds its own mistakes — a
bad early draft becomes a bad few-shot example for the next similar
description, which produces another bad draft, and so on. Gating on
`published` means the corpus can only be *reinforced by human judgment*, not
by the model's own output.

The honest limitation: this still isn't gated on the drafted content being
unedited. A heavily-corrected AI draft that eventually gets published still
feeds its *original* AI-generated schema back into the corpus, not the
corrected version, because the source description is stored once at
submit-for-review time and the schema recorded at publish time is whatever
the current version holds (which may include manual edits made during
review). In practice, this means the corpus reflects "descriptions that led
to an eventually-good outcome," not "descriptions the AI got exactly right
the first time" — a reasonable proxy, but worth knowing precisely what's
being measured.

### Preserving prompt caching

`SYSTEM_PROMPT` (`src/lib/openai.ts`) contains the compressed schema
definition, the tool-use rules, and the static example — it's byte-identical
across every request, which is what makes it eligible for OpenAI's automatic
prefix caching. Retrieved examples vary per request by definition, so they
are **never** appended into that string. Instead, `callDraftModel` builds
them into a **second, separate system message** inserted right after
`SYSTEM_PROMPT`:

```
messages = [
  { role: "system", content: SYSTEM_PROMPT },        // static → cached
  { role: "system", content: retrievedExamplesBlock }, // dynamic → uncached
  ...history,
]
```

Folding retrieval into the cached prompt would still produce correct output
— it would just silently stop being cached on every request with different
retrieved content, quietly increasing cost and latency with no visible
error. This is the kind of mistake that's easy to make and easy to miss,
which is why it's called out explicitly here and in the code comment at the
call site.

### Retrieval is best-effort, never a hard dependency

`retrieveSimilarExamples` catches every failure internally (embedding API
error, DB unreachable, empty corpus) and returns `[]` rather than throwing.
Generation must keep working with zero retrieved examples — falling back to
the static few-shot baked into `SYSTEM_PROMPT` — because retrieval is a
quality enhancement layered on top of a feature that already had to work
without it. A RAG outage should never mean the AI generation feature is down.

A distance threshold (`MAX_USEFUL_DISTANCE` in `src/lib/rag.ts`, currently
`0.4` cosine distance) also filters out weak matches. An unrelated process
description surfaced as a "similar example" is worse than no retrieval —
it anchors the model on the wrong stage structure. This threshold is a
judgment call, not derived from data; if generation quality looks off with
retrieval on, this is the first thing to tune, ideally against eval results
(see below).

## What's NOT built here

- **No re-ranking or hybrid search.** Pure vector similarity on the
  description text. A production version might weight by product type or
  recency too — deliberately out of scope for a first pass.
- **No corpus curation UI.** There's no way to browse, edit, or remove
  entries from `ai_draft_examples` short of direct DB access. Fine for a
  portfolio-scale corpus; a real product would need this.
- **No feedback loop from edits.** As noted above, the corpus doesn't
  distinguish "AI got it exactly right" from "AI got it roughly right and a
  human fixed it before publishing." Both look the same to the retrieval
  system.
- **No embedding cache.** Every generation call re-embeds the input
  description even if it's been seen before. Not worth optimizing at this
  volume — embeddings are cheap and this is a low-traffic internal tool.

## How to verify it's working

1. Publish at least one AI-drafted journey (generate a draft, submit for
   review, get all reviewers to mark reviewed, publish). Check
   `ai_draft_examples` has a new row.
2. Generate a new draft with a description similar in domain/structure to
   the one you just published. The response includes `retrievedCount` — if
   it's `> 0`, retrieval found and used your published example.
3. To see it more directly: temporarily log the formatted retrieval message
   in `buildRetrievedExamplesMessage` (`src/lib/openai.ts`) to confirm what
   the model actually received.

If you build out `eval/run.ts`-style testing for this project, the most
useful addition would be an A/B comparison: run the same eval case set
through generation with an empty vs. populated corpus, and diff the rubric
pass rates. That turns "I added RAG" into "I measured a N-point improvement
in rubric pass rate on ambiguous cases once the corpus had 10+ published
examples" — a substantially stronger claim, and one this architecture is
already set up to support since retrieval and generation are cleanly
separated functions.
