# Eval harness — AI-assisted draft generation

## Why this exists

The AI generation feature has several hard reliability guarantees already:
every candidate draft passes the same validator the manual builder uses, the
retry is capped at once, and a failed second attempt is never shown. That's
structural safety. It says nothing about whether the output is *good* —
whether the model picked sensible stage boundaries, got approval logic
right, or is honestly calibrated about its own uncertainty.

This harness measures the second thing. It's 13 hand-curated cases, not a
large statistical sample — the goal is a repeatable, inspectable check that
catches regressions and produces an actual failure taxonomy, not a vague
"seems fine" impression.

## What it checks

Same rubric dimensions as before (stage count, approval logic, role
grounding, field-type coverage, no dangling threshold references), plus two
things specific to this codebase's features:

**Confidence calibration.** Every stage in this implementation carries a
model-reported `confidence` (0-1) and `rationale`. The harness checks:
- Every stage actually has both (structural check — the tool schema requires
  it, but worth verifying the model doesn't game it with empty rationales).
- On clearly-specified cases, average confidence should be reasonably high
  (`minAvgConfidence`, generally 0.6) — a model that hedges on unambiguous
  input isn't being appropriately careful, it's being uninformative.
- On the deliberately underspecified case (`telecom-vague-underspecified`),
  average confidence should stay *below* a ceiling (`maxAvgConfidenceIfDrafted`)
  if the model drafts at all — the system prompt explicitly instructs lower
  confidence when structure is inferred rather than stated. A model that's
  equally "confident" about clear and vague input has a calibration problem,
  and this is the check that would catch it.

**Clarification judgment.** One case (`saas-multi-product-ambiguous-branching`)
is purpose-built to hit the system prompt's own stated bar for asking instead
of guessing: two distinct products, no stated branching logic. Whether the
model actually asks, or picks one reasonable structure and flags it with low
confidence instead, is itself the interesting observation — the harness
reports which happened (`clarificationPlausible` on the case, actual outcome
in the result) rather than scoring it pass/fail, since both are legitimate
agent behaviors and the point is observing the judgment call, not asserting
a "correct" answer.

## Running it

```bash
npm install              # picks up tsx + dotenv, added for this harness
npm run eval              # RAG on — matches production behavior
npm run eval:no-rag       # RAG off — baseline
npm run eval:ab           # runs both back-to-back, prints the delta
```

Requires `OPENAI_API_KEY` in `.env`. Each full run is roughly 13-26 model
calls (1-2 per case) plus up to 13 embedding calls if RAG is on — at current
pricing, a full run costs a small fraction of a cent.

## Reading the output

Per-case, the console shows outcome (drafted / asked for clarification /
failed), attempt count, average confidence, and how many examples were
retrieved from the RAG corpus. The summary aggregates:

- **Rubric passed (of drafts)** — the most informative single number. A case
  can generate a structurally valid schema and still fail the rubric (wrong
  stage count, hallucinated threshold, generic roles) — that gap is exactly
  what schema validation alone can't catch.
- **First-attempt success** — if most passes need the retry, the system
  prompt or few-shot examples need work, not the retry logic.
- **Overall avg confidence** — a sanity gauge across the whole set. If this
  creeps toward 1.0 on every case including the deliberately vague one,
  that's a sign confidence has become decorative rather than informative.
- **Failure taxonomy** — which specific checks fail most often. A spike in
  one category points at a specific prompt fix, not a vague "make it better."

Every run writes a full JSON report to `eval/results/`, so results are
diffable across prompt or corpus changes over time.

## The RAG A/B mode

`npm run eval:ab` runs the full case set twice — once with retrieval
disabled, once with it enabled — using the exact same `useRag` flag the
production code path supports (`GenerateOptions.useRag` in
`src/lib/generate.ts`; the live app never sets this false, it exists for
this harness). It then prints the delta in rubric pass rate, first-attempt
success rate, and average confidence.

**Honest caveat**: this is only meaningful once `ai_draft_examples` actually
has published examples in it. Against an empty corpus, "on" and "off" should
be identical — which is itself a useful sanity check that retrieval fails
soft as designed, not evidence RAG doesn't help. To get a real signal:
publish a handful of AI-drafted journeys first (see `RAG.md`), then run
`npm run eval:ab` and look for the delta to show up specifically on cases
similar in structure to what's now in the corpus.

## What this deliberately doesn't do

- No LLM-as-judge scoring — every check is a deterministic rule against
  structured output, appropriate here since correctness has a clear
  right/wrong shape (a schema), not open-ended text.
- No adversarial/red-team cases (prompt injection via the description field,
  contradictory instructions) — worth adding for a security-focused pass,
  out of scope for a quality-focused first one.
- No load/latency testing — low-volume internal tool, not the priority.
- The clarification-triggering case tests judgment, not correctness — there
  is no "right answer" being asserted, only an observation being reported.
