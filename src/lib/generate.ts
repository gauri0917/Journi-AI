import { callDraftModel, type OpenAITurn, type RetrievedExampleInput } from "./openai";
import { validateSchemaSnapshot, formatErrorsForRetry, extractStageConfidence, type StageConfidence } from "./validation";
import { retrieveSimilarExamples } from "./rag";
import type { SchemaSnapshot } from "./types";

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export type GenerateResult =
  | { ok: true; data: SchemaSnapshot; stageConfidence: StageConfidence; attempts: number; retrievedCount: number }
  | { ok: false; needsClarification: true; question: string; reason: string; attempts: number; retrievedCount: number }
  | { ok: false; needsClarification: false; errors: string[]; attempts: number; retrievedCount: number };

export interface GenerateOptions {
  // Lets the eval harness run an A/B comparison (retrieval on vs. off)
  // against otherwise identical code. The live app never sets this to
  // false — it's a testing lever, not a product toggle.
  useRag?: boolean;
}

// SINGLE SOURCE OF TRUTH for AI draft generation. The API route
// (src/app/api/ai/generate/route.ts) and the eval harness (eval/run.ts)
// both call this function directly — an eval result is therefore a true
// measurement of production behavior, not a simulation of it.
//
// Runs the model call, which may either:
//   (a) emit_journey_draft — validated through the exact same validator the
//       manual builder uses, retried ONCE on failure with only the specific
//       errors appended (never a full re-explanation of the schema); or
//   (b) request_clarification — the model's own judgment that the input is
//       ambiguous about overall journey structure. This is returned
//       immediately, not treated as a failure and not retried — asking is
//       the correct outcome here, not a fallback from one.
// Hard cap unchanged: 2 model calls total, no matter which path is taken.
//
// Retrieval happens ONCE per generation (not once per model call) — the
// same retrieved examples are reused across the initial attempt and the
// retry, since they're both attempting the same underlying description.
export async function generateWithRetry(
  description: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const useRag = options.useRag ?? true;
  const retrieved: RetrievedExampleInput[] = useRag ? await retrieveSimilarExamples(description) : [];

  const history: OpenAITurn[] = [
    { role: "user", content: `Process description:\n\n${description}` },
  ];

  const first = await callDraftModel(history, retrieved);

  if (first.kind === "clarify") {
    return { ok: false, needsClarification: true, question: first.question, reason: first.reason, attempts: 1, retrievedCount: retrieved.length };
  }

  if (first.kind === "draft") {
    const check = validateSchemaSnapshot(first.toolInput);
    if (check.valid && check.data) {
      return { ok: true, data: check.data, stageConfidence: extractStageConfidence(first.toolInput), attempts: 1, retrievedCount: retrieved.length };
    }

    const retryHistory: OpenAITurn[] = [
      ...first.updatedHistory,
      {
        role: "tool",
        tool_call_id: first.toolCallId,
        content: formatErrorsForRetry(check.errors),
      },
    ];
    const second = await callDraftModel(retryHistory, retrieved);
    if (second.kind === "clarify") {
      return { ok: false, needsClarification: true, question: second.question, reason: second.reason, attempts: 2, retrievedCount: retrieved.length };
    }
    if (second.kind === "draft") {
      const check2 = validateSchemaSnapshot(second.toolInput);
      if (check2.valid && check2.data) {
        return { ok: true, data: check2.data, stageConfidence: extractStageConfidence(second.toolInput), attempts: 2, retrievedCount: retrieved.length };
      }
      return { ok: false, needsClarification: false, errors: check2.errors, attempts: 2, retrievedCount: retrieved.length };
    }
    return { ok: false, needsClarification: false, errors: ["model did not return a tool call on retry"], attempts: 2, retrievedCount: retrieved.length };
  }

  // first.kind === "none" — model returned no tool call at all
  const retryHistory: OpenAITurn[] = [
    ...first.updatedHistory,
    { role: "user", content: "You must call either emit_journey_draft or request_clarification. Try again." },
  ];
  const second = await callDraftModel(retryHistory, retrieved);
  if (second.kind === "clarify") {
    return { ok: false, needsClarification: true, question: second.question, reason: second.reason, attempts: 2, retrievedCount: retrieved.length };
  }
  if (second.kind === "draft") {
    const check2 = validateSchemaSnapshot(second.toolInput);
    if (check2.valid && check2.data) {
      return { ok: true, data: check2.data, stageConfidence: extractStageConfidence(second.toolInput), attempts: 2, retrievedCount: retrieved.length };
    }
    return { ok: false, needsClarification: false, errors: check2.errors, attempts: 2, retrievedCount: retrieved.length };
  }
  return { ok: false, needsClarification: false, errors: ["model did not return a tool call"], attempts: 2, retrievedCount: retrieved.length };
}
