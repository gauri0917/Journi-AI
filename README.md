# Journi — Journey Builder

Self-serve B2B deal-journey configuration tool. Portfolio project: a journey owner
configures stages, intake fields, approval gates, and required documents without
routing through a CRM admin — and can optionally draft the first pass from a plain-text
process description via the OpenAI API.

## Stack

Next.js 14 (App Router, TS) · Postgres via Docker Compose · Prisma · Tailwind ·
OpenAI API (tool-use / structured output, `gpt-5.6-terra`) · pgvector (RAG corpus, see `RAG.md`).

## Setup

```bash
npm install
cp .env.example .env        # fill in OPENAI_API_KEY
docker compose up -d        # starts local Postgres on :5432
```

Before migrating, enable pgvector once (required for the RAG feature — see `RAG.md`):

```sql
-- Supabase: run in the SQL Editor. Self-hosted/Docker Postgres: run via psql.
CREATE EXTENSION IF NOT EXISTS vector;
```

```bash
npx prisma migrate dev --name init
npm run dev
```

No auth system in scope. `CURRENT_USER_NAME` in `.env` stands in for whoever is
"logged in" and fills `created_by` / `published_by`. Reviewer identity is entered
per-action on the review screen instead (see below), since a single demo session
needs to represent several different reviewers.

> The core builder/review/publish flow and the two-tool AI generation call were built
> in a sandboxed environment with no network egress and not run end-to-end there — the
> code is internally consistent and each route/component was checked by hand, but
> budget time for a first-boot pass (likely Prisma client typing nits or a stray
> import) before treating it as production-ready. The document-upload feature (added
> later) *was* installed and unit-tested in-sandbox against real `.pdf`/`.docx` files —
> see the extraction functions in `src/lib/document-extract.ts`.

## Data model

Exactly the three tables specified — `journeys`, `journey_versions` (append-only),
`journey_reviews` (separate table, not nested in the JSONB). See `prisma/schema.prisma`.
`schema_snapshot` shape and its validator live in `src/lib/types.ts` /
`src/lib/validation.ts` — **one** validator, used by both the manual builder's submit
path and the AI generation route. That sharing is the main architectural point of the
AI feature: a candidate draft is not a different kind of object, it's the same
`SchemaSnapshot` under review by the same rules.

## Lifecycle

```
draft --submit for review--> in_review --publish (gated)--> published --archive--> archived
  ^                              |
  '------ edit + resubmit -------'
```

- **Submit for review** (`POST /journeys/:id/submit-review`) is the one place a new
  `journey_versions` row gets written. It's re-callable — editing and resubmitting
  writes version 2, 3, ... and replaces the *pending* reviewer set for the new cycle,
  but never touches an existing version row.
- **Publish** (`POST /journeys/:id/publish`) only flips `status`. It's blocked with a
  409 if any reviewer is still `pending`. No new version is written here — the
  version being published is whatever `submit-review` already wrote.
- There's no deal-level approval runtime, no reassignment action, no document upload —
  all explicitly out of scope. `reassignable_to`, `approval_required`, etc. are config
  fields that render in preview but do nothing beyond that.

## AI generation (`POST /api/ai/generate`, `src/lib/openai.ts`)

- Tool-calling with **two** tools — `emit_journey_draft` and `request_clarification` —
  offered with `tool_choice: "auto"` (not forced), `temperature: 0`, `reasoning_effort:
  "none"` (GPT-5.6 models default to a reasoning effort that OpenAI's Chat Completions
  endpoint doesn't support alongside function/tool calling — this must stay set or
  every generation call fails with an `invalid_request_error`), on `gpt-5.6-terra`
  (OpenAI's balanced-cost tier — swap to `gpt-5.6-luna` for cheaper/faster, or
  `gpt-5.6-sol` for the flagship). The model itself decides which tool fits: draft a
  journey, or ask a clarifying question when the input is ambiguous about overall
  structure (e.g. several products named with no stated branching). This is one call
  with autonomous tool-choice, not a multi-step agent pipeline — see the interview-prep
  doc for the fuller reasoning on that distinction.
- Every stage in `emit_journey_draft` also carries a required `confidence` (0-1) and
  one-line `rationale`, extracted separately in `extractStageConfidence()`
  (`src/lib/validation.ts`) and never persisted to `schema_snapshot` — client-only,
  same lifecycle as the `__ai` markers below. Low-confidence stages get an amber badge
  in the builder and a warning at the reviewer-roles step.
- System prompt is compressed field-by-field (not prose). OpenAI caches repeated
  prompt prefixes over ~1024 tokens automatically — no manual cache markers needed,
  unlike the Anthropic API — so this being byte-identical across the first call and
  the retry call is what makes it eligible.
- One few-shot example, embedded in the same system prompt.
- Output is validated with the *exact* function the manual builder uses
  (`validateSchemaSnapshot`). On failure, the retry appends only the specific error
  list as a `tool` role message — not a restatement of the schema. Hard cap: 2 model
  calls, enforced in code (`generateWithRetry`), not by convention — the clarification
  path counts against this same cap, it doesn't add a third call.
- A failed second attempt returns a 422 with no draft attached — the UI never shows a
  partially-invalid candidate.
- Every AI-populated stage/field/document/approval-bundle carries a client-only `__ai`
  marker (`src/components/builder/types.ts`) that renders as a small "✦ AI draft" flag
  and clears the moment the user edits that specific value. The markers never reach
  the server — `stripAiMarkers()` removes them before any API call, so the DB and the
  validator only ever see plain `SchemaSnapshot` data.
- **Retrieval-augmented generation**: before calling the model, `retrieveSimilarExamples()`
  (`src/lib/rag.ts`) embeds the description and searches `ai_draft_examples` (pgvector)
  for similar *published* journeys, injecting matches as extra few-shot context in a
  separate, uncached message — the static `SYSTEM_PROMPT` stays untouched so prompt
  caching still applies. The corpus only grows from journeys that survive the full
  review gate, not raw generations. Full writeup: `RAG.md`.
- **Eval harness**: `npm run eval` (RAG on), `npm run eval:no-rag`, `npm run eval:ab`
  (A/B diff) — 13 hand-curated cases across 5 industries, scored on stage structure,
  approval-threshold correctness, role grounding, field-type coverage, and confidence
  calibration (including one case purpose-built to test the clarification judgment
  call). Runs the exact same `generateWithRetry()` the live route calls — see
  `eval/README.md`.

## Document upload (`POST /api/ai/extract-document`, `src/lib/document-extract.ts`)

Lets the AI-draft modal be seeded from a `.pdf`, `.docx`, or `.txt` file instead of
typing a description by hand. This is **not** an additional model call or an
extraction "agent" — it's plain text parsing (`pdf-parse` / `mammoth`), and the result
just fills the same textarea a person would otherwise type into. Everything downstream
(the two-tool generation call, clarification, confidence, validation) is identical
either way and has no awareness the text came from a file. If a document produces more
than the existing 1500-word cap, the same word-count UI that already existed asks the
user to trim it — no silent truncation or hidden summarization call was added.

## Deals (`/deals`, `/deals/[dealId]`, `src/lib/deal-run.ts`)

A deliberate reopening of something the original spec explicitly excluded: *"Deal-level approval runtime — no 'deal' entity, no live approval-action screen — approval_required/approver_role/threshold are config fields only."* That line was crossed on purpose, not drifted into — a Deal is now a first-class entity: created from any published journey, listed globally at `/deals` (not just buried per-journey), and walked through stage by stage for real.

- A `Deal` walks through one published journey's stages, in order, collecting real field values and real approvals as it goes.
- **"Profile name, not role" is the core mechanic.** `owner_role` and `approver_role` are NOT renamed or restructured anywhere else in the codebase — a stage configured with `owner_role: "Priya Sharma"` just means the guest logged in under that exact name (see `src/lib/current-user.ts`) is the one who can fill that stage in. `namesMatch()` in `deal-run.ts` is a case/whitespace-insensitive string comparison, not a real identity system — good enough for a guest-login-gated app, not a substitute for real auth if this ever handles real customer data.
- `approval_threshold` is evaluated against the deal's actually-submitted field values (`evaluateThreshold`) — a stage with `{ field: "discount_pct", operator: "gt", value: 20 }` only blocks on approval if the submitted discount really is above 20, mirroring how the threshold is described everywhere else in the app.
- `required_documents`/`file`-type fields stay a text acknowledgment here too, same convention as `PreviewForm` — no real file upload has been built anywhere in the app yet.
- `reassignable_to` is still NOT a live action on a Deal — it renders as information only. That line stays deliberately un-crossed unless asked for separately.
- A deal's `fieldValues` and `stageApprovals` are plain JSON columns keyed by stage id rather than their own relational tables — a reasonable simplicity tradeoff at this scale, worth revisiting if per-field querying/reporting across deals becomes a real need.
- No multi-deal orchestration (parallel-stage routing, SLAs, notifications) and no CRM sync — those remain out of scope until asked for explicitly, same principle as everything else marked "config only" in this codebase: state the boundary, don't drift past it quietly.



Unit tests target the pure/mockable logic layer, run with Vitest:

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # coverage report (text + html)
```

- `tests/validation.test.ts` — `validateSchemaSnapshot`, the single source of truth
  used by both the manual builder and the AI path. Covers required fields, duplicate
  IDs, dropdown option requirements, and — the case worth calling out — an
  `approval_threshold` whose `field` doesn't match any field id actually defined in
  that stage.
- `tests/generate.test.ts` — the orchestration in `generateWithRetry` (success on
  first try, the clarify branch never retrying, exactly one retry on validation
  failure with only the specific errors appended, the hard 2-call cap holding even
  when the model returns no tool call at all). `callDraftModel` and
  `retrieveSimilarExamples` are mocked — this suite tests the *logic*, not the live
  OpenAI API.
- `tests/rag.test.ts` — the property that matters most here: retrieval failure
  (embedding API down, DB unreachable, empty corpus) always degrades to an empty
  array, never throws. Also covers the distance-threshold filter and that corpus
  writes are equally best-effort.
- `tests/document-extract.test.ts` — `detectDocType` and the text-cleanup helpers.
- `tests/deal-run.test.ts` — the Deal progression gating logic (`namesMatch`, `evaluateThreshold`,
  `stageRequiresApproval`) — fully unit-testable since it's pure functions with no
  database dependency, unlike the Deal Prisma routes themselves.

Deliberately NOT unit-tested: `openai.ts`, `embeddings.ts`, `db.ts` — these are thin
wrappers around external APIs (OpenAI, Postgres). They're exercised indirectly by
mocking them at their boundary in the tests above, which is the right level for a
unit test; testing them directly would mean either hitting the real API in CI or
testing that a library call was made, neither of which is worth much.

This is a different concern from `eval/run.ts` (see `eval/README.md`): the tests here
check that the *code* behaves correctly given a controlled model response; the eval
harness checks that the *model's actual output* is good. Both matter, and neither
substitutes for the other — a green test suite here says nothing about whether the
AI drafts sensible journeys, and a good eval score says nothing about whether the
retry logic or the RAG fallback are implemented correctly.

### End-to-end tests (`e2e/`, Playwright)

A third, different layer: `npm run test:e2e:headed` drives an actual browser against
your actual running app and database, creating a journey through the real UI from
end to end (basics → stages → review → submit → mark reviewed → publish). This is
what to reach for if you want to *watch* a journey get created rather than read a
pass/fail line in a terminal. See `e2e/README.md` — it needs the real stack running
(`docker compose up`, migrations applied, `npm run dev`), unlike the Vitest suite
above, which mocks everything and needs none of that.



- `journey_reviews` has no `version_id` column (matches the spec as given), so it can
  only represent "reviewers for the current cycle" — resubmitting for review replaces
  the pending set rather than keeping a per-version review history. Worth confirming
  that's the intended semantics before this goes further.
- No auth. `created_by`/`published_by` come from one env var; reviewer names are
  self-reported free text on the review screen. Fine for a demo, not for production.
