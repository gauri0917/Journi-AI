import { describe, it, expect } from "vitest";
import { validateSchemaSnapshot, extractStageConfidence } from "@/lib/validation";

function validStage(overrides: Record<string, unknown> = {}) {
  return {
    id: "stage_1",
    name: "Qualification",
    order: 0,
    owner_role: "sales_rep",
    fields: [{ id: "field_1", label: "Company name", type: "text", required: true }],
    required_documents: [],
    approval_required: false,
    reassignable_to: [],
    ...overrides,
  };
}

describe("validateSchemaSnapshot", () => {
  it("accepts a minimal valid schema", () => {
    const result = validateSchemaSnapshot({ stages: [validStage()] });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data?.stages).toHaveLength(1);
  });

  it("rejects a non-object root", () => {
    expect(validateSchemaSnapshot("not an object").valid).toBe(false);
    expect(validateSchemaSnapshot(null).valid).toBe(false);
    expect(validateSchemaSnapshot([1, 2, 3]).valid).toBe(false);
  });

  it("rejects an empty stages array", () => {
    const result = validateSchemaSnapshot({ stages: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/non-empty array/);
  });

  it("rejects duplicate stage ids", () => {
    const result = validateSchemaSnapshot({
      stages: [validStage({ id: "dup", order: 0 }), validStage({ id: "dup", order: 1 })],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate stage id "dup"'))).toBe(true);
  });

  it("rejects duplicate stage order values", () => {
    const result = validateSchemaSnapshot({
      stages: [validStage({ id: "a", order: 0 }), validStage({ id: "b", order: 0 })],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate order value"))).toBe(true);
  });

  it("requires at least one field per stage", () => {
    const result = validateSchemaSnapshot({ stages: [validStage({ fields: [] })] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("fields: must be a non-empty array"))).toBe(true);
  });

  it("rejects an unknown field type", () => {
    const result = validateSchemaSnapshot({
      stages: [validStage({ fields: [{ id: "f1", label: "X", type: "not_a_real_type", required: true }] })],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes(".type: must be one of"))).toBe(true);
  });

  it("requires non-empty options when field type is dropdown", () => {
    const result = validateSchemaSnapshot({
      stages: [validStage({ fields: [{ id: "f1", label: "Plan", type: "dropdown", required: true }] })],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes(".options: required non-empty string array"))).toBe(true);
  });

  it("accepts a dropdown field with options", () => {
    const result = validateSchemaSnapshot({
      stages: [
        validStage({
          fields: [{ id: "f1", label: "Plan", type: "dropdown", required: true, options: ["Basic", "Pro"] }],
        }),
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects duplicate field ids within the same stage", () => {
    const result = validateSchemaSnapshot({
      stages: [
        validStage({
          fields: [
            { id: "f1", label: "A", type: "text", required: true },
            { id: "f1", label: "B", type: "text", required: false },
          ],
        }),
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate field id "f1"'))).toBe(true);
  });

  it("requires approver_role when approval_required is true", () => {
    const result = validateSchemaSnapshot({
      stages: [validStage({ approval_required: true })],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("approver_role: required"))).toBe(true);
  });

  it("accepts approval_required true with an approver_role", () => {
    const result = validateSchemaSnapshot({
      stages: [validStage({ approval_required: true, approver_role: "finance" })],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects an approval_threshold whose field does not exist in the stage", () => {
    const result = validateSchemaSnapshot({
      stages: [
        validStage({
          approval_required: true,
          approver_role: "finance",
          approval_threshold: { field: "discount_pct", operator: "gt", value: 20 },
        }),
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("does not match any field id"))).toBe(true);
  });

  it("accepts an approval_threshold referencing a real field id", () => {
    const result = validateSchemaSnapshot({
      stages: [
        validStage({
          fields: [
            { id: "field_1", label: "Company name", type: "text", required: true },
            { id: "discount_pct", label: "Discount %", type: "number", required: true },
          ],
          approval_required: true,
          approver_role: "finance",
          approval_threshold: { field: "discount_pct", operator: "gt", value: 20 },
        }),
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.data?.stages[0].approval_threshold).toEqual({ field: "discount_pct", operator: "gt", value: 20 });
  });

  it("rejects an invalid threshold operator", () => {
    const result = validateSchemaSnapshot({
      stages: [
        validStage({
          approval_required: true,
          approver_role: "finance",
          approval_threshold: { field: "field_1", operator: "startswith", value: "x" },
        }),
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes(".operator: must be one of"))).toBe(true);
  });

  it("collects multiple independent errors in a single pass rather than stopping at the first", () => {
    const result = validateSchemaSnapshot({
      stages: [
        {
          // missing id, missing name, bad order, missing owner_role, no fields
          order: "not-a-number",
          fields: [],
          required_documents: [],
          approval_required: false,
          reassignable_to: [],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe("extractStageConfidence", () => {
  it("extracts confidence and rationale keyed by stage id", () => {
    const raw = {
      stages: [
        { id: "stage_1", confidence: 0.9, rationale: "explicitly stated in the text" },
        { id: "stage_2", confidence: 0.4, rationale: "inferred, not stated" },
      ],
    };
    const result = extractStageConfidence(raw);
    expect(result).toEqual({
      stage_1: { confidence: 0.9, rationale: "explicitly stated in the text" },
      stage_2: { confidence: 0.4, rationale: "inferred, not stated" },
    });
  });

  it("defaults missing confidence to 0.5 and missing rationale to empty string", () => {
    const raw = { stages: [{ id: "stage_1" }] };
    const result = extractStageConfidence(raw);
    expect(result.stage_1).toEqual({ confidence: 0.5, rationale: "" });
  });

  it("returns an empty object for malformed input rather than throwing", () => {
    expect(extractStageConfidence(null)).toEqual({});
    expect(extractStageConfidence("garbage")).toEqual({});
    expect(extractStageConfidence({})).toEqual({});
    expect(extractStageConfidence({ stages: "not an array" })).toEqual({});
  });

  it("skips stage entries with no id rather than crashing", () => {
    const raw = { stages: [{ confidence: 0.8 }, { id: "stage_2", confidence: 0.6, rationale: "ok" }] };
    const result = extractStageConfidence(raw);
    expect(Object.keys(result)).toEqual(["stage_2"]);
  });
});
