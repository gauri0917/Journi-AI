import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock BEFORE importing generate.ts, since generate.ts imports these at
// module load time. vi.mock is hoisted by Vitest, so this ordering is safe
// even though it looks backwards.
vi.mock("@/lib/openai", () => ({
  callDraftModel: vi.fn(),
}));
vi.mock("@/lib/rag", () => ({
  retrieveSimilarExamples: vi.fn(),
}));

import { callDraftModel } from "@/lib/openai";
import { retrieveSimilarExamples } from "@/lib/rag";
import { generateWithRetry } from "@/lib/generate";

const mockCallDraftModel = vi.mocked(callDraftModel);
const mockRetrieve = vi.mocked(retrieveSimilarExamples);

function validDraftToolInput() {
  return {
    stages: [
      {
        id: "stage_1",
        name: "Qualification",
        order: 0,
        owner_role: "sales_rep",
        fields: [{ id: "f1", label: "Company", type: "text", required: true }],
        required_documents: [],
        approval_required: false,
        reassignable_to: [],
        confidence: 0.9,
        rationale: "clearly stated in the text",
      },
    ],
  };
}

beforeEach(() => {
  mockCallDraftModel.mockReset();
  mockRetrieve.mockReset();
  mockRetrieve.mockResolvedValue([]); // no retrieved examples by default
});

describe("generateWithRetry", () => {
  it("returns a validated draft on the first successful attempt (1 model call)", async () => {
    mockCallDraftModel.mockResolvedValueOnce({
      kind: "draft",
      toolInput: validDraftToolInput(),
      toolCallId: "call_1",
      updatedHistory: [],
    });

    const result = await generateWithRetry("A clear process description with 100+ words...");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(1);
      expect(result.data.stages).toHaveLength(1);
      expect(result.stageConfidence.stage_1.confidence).toBe(0.9);
    }
    expect(mockCallDraftModel).toHaveBeenCalledTimes(1);
  });

  it("returns needsClarification immediately when the model asks, without retrying", async () => {
    mockCallDraftModel.mockResolvedValueOnce({
      kind: "clarify",
      question: "Do these four products share one journey or need separate branches?",
      reason: "input names 4 products with no stated branching logic",
      updatedHistory: [],
    });

    const result = await generateWithRetry("Sales journey for four products: A, B, C, D.");

    expect(result.ok).toBe(false);
    if (!result.ok && result.needsClarification) {
      expect(result.question).toMatch(/share one journey/);
      expect(result.attempts).toBe(1);
    }
    // Clarification is a legitimate outcome, not a failure to retry from.
    expect(mockCallDraftModel).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once on validation failure, then succeeds", async () => {
    mockCallDraftModel
      .mockResolvedValueOnce({
        kind: "draft",
        toolInput: { stages: [{ id: "stage_1" /* missing required fields */ }] },
        toolCallId: "call_1",
        updatedHistory: [{ role: "assistant", content: "" } as any],
      })
      .mockResolvedValueOnce({
        kind: "draft",
        toolInput: validDraftToolInput(),
        toolCallId: "call_2",
        updatedHistory: [],
      });

    const result = await generateWithRetry("A description that produces a bad draft first try.");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attempts).toBe(2);
    expect(mockCallDraftModel).toHaveBeenCalledTimes(2);

    // The retry call must carry the specific validation errors, not a full
    // re-explanation of the schema (see generate.ts comments).
    const secondCallArgs = mockCallDraftModel.mock.calls[1][0];
    const toolMessage = secondCallArgs.find((m: any) => m.role === "tool");
    expect(toolMessage).toBeDefined();
    expect(String(toolMessage!.content)).toMatch(/name: required non-empty string/);
  });

  it("fails after exactly 2 attempts (hard cap) when both attempts are invalid", async () => {
    mockCallDraftModel.mockResolvedValue({
      kind: "draft",
      toolInput: { stages: [] },
      toolCallId: "call_x",
      updatedHistory: [],
    });

    const result = await generateWithRetry("A description that never produces a valid draft.");

    expect(result.ok).toBe(false);
    if (!result.ok && !result.needsClarification) {
      expect(result.attempts).toBe(2);
      expect(result.errors.length).toBeGreaterThan(0);
    }
    expect(mockCallDraftModel).toHaveBeenCalledTimes(2);
  });

  it("never exceeds 2 model calls even when the model returns no tool call at all", async () => {
    mockCallDraftModel.mockResolvedValue({ kind: "none", updatedHistory: [] });

    const result = await generateWithRetry("Some input the model doesn't respond to with a tool call.");

    expect(result.ok).toBe(false);
    expect(mockCallDraftModel).toHaveBeenCalledTimes(2);
  });

  it("passes retrieved examples through to every model call in the attempt", async () => {
    const examples = [{ description: "similar past case", schemaSnapshot: { stages: [] }, distance: 0.1 }];
    mockRetrieve.mockResolvedValueOnce(examples as any);
    mockCallDraftModel.mockResolvedValueOnce({
      kind: "draft",
      toolInput: validDraftToolInput(),
      toolCallId: "call_1",
      updatedHistory: [],
    });

    const result = await generateWithRetry("A description with a similar past example available.");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.retrievedCount).toBe(1);
    expect(mockCallDraftModel).toHaveBeenCalledWith(expect.anything(), examples);
  });

  it("skips retrieval entirely when useRag is false (the eval harness's A/B lever)", async () => {
    mockCallDraftModel.mockResolvedValueOnce({
      kind: "draft",
      toolInput: validDraftToolInput(),
      toolCallId: "call_1",
      updatedHistory: [],
    });

    await generateWithRetry("Some description.", { useRag: false });

    expect(mockRetrieve).not.toHaveBeenCalled();
  });
});
