import { describe, it, expect } from "vitest";
import { namesMatch, evaluateThreshold, stageRequiresApproval, missingRequiredFields } from "@/lib/deal-run";
import type { JourneyStage } from "@/lib/types";

describe("namesMatch", () => {
  it("matches case- and whitespace-insensitively", () => {
    expect(namesMatch("Priya Sharma", "priya sharma")).toBe(true);
    expect(namesMatch("  Priya Sharma  ", "Priya Sharma")).toBe(true);
  });
  it("does not match different names", () => {
    expect(namesMatch("Priya Sharma", "Jordan Lee")).toBe(false);
  });
  it("returns false for null/undefined/empty", () => {
    expect(namesMatch(null, "Priya")).toBe(false);
    expect(namesMatch("Priya", undefined)).toBe(false);
    expect(namesMatch("", "")).toBe(false);
  });
});

describe("evaluateThreshold", () => {
  it("evaluates numeric operators correctly", () => {
    expect(evaluateThreshold({ field: "discount_pct", operator: "gt", value: 20 }, { discount_pct: 25 })).toBe(true);
    expect(evaluateThreshold({ field: "discount_pct", operator: "gt", value: 20 }, { discount_pct: 15 })).toBe(false);
    expect(evaluateThreshold({ field: "discount_pct", operator: "lte", value: 20 }, { discount_pct: 20 })).toBe(true);
    expect(evaluateThreshold({ field: "discount_pct", operator: "eq", value: 20 }, { discount_pct: 20 })).toBe(true);
    expect(evaluateThreshold({ field: "discount_pct", operator: "neq", value: 20 }, { discount_pct: 25 })).toBe(true);
  });
  it("handles string values submitted as numbers (form inputs are strings)", () => {
    expect(evaluateThreshold({ field: "discount_pct", operator: "gt", value: 20 }, { discount_pct: "25" })).toBe(true);
  });
  it("returns false when the referenced field is missing, null, or empty", () => {
    expect(evaluateThreshold({ field: "discount_pct", operator: "gt", value: 20 }, {})).toBe(false);
    expect(evaluateThreshold({ field: "discount_pct", operator: "gt", value: 20 }, { discount_pct: null })).toBe(false);
    expect(evaluateThreshold({ field: "discount_pct", operator: "gt", value: 20 }, { discount_pct: "" })).toBe(false);
  });
});

function baseStage(overrides: Partial<JourneyStage> = {}): JourneyStage {
  return {
    id: "stage_1",
    name: "Approval",
    order: 0,
    owner_role: "Jordan Lee",
    fields: [{ id: "discount_pct", label: "Discount %", type: "number", required: true }],
    required_documents: [],
    approval_required: false,
    reassignable_to: [],
    ...overrides,
  };
}

describe("stageRequiresApproval", () => {
  it("returns false when approval_required is false", () => {
    expect(stageRequiresApproval(baseStage({ approval_required: false }), { discount_pct: 50 })).toBe(false);
  });
  it("returns true unconditionally when approval_required is true with no threshold", () => {
    expect(stageRequiresApproval(baseStage({ approval_required: true }), {})).toBe(true);
  });
  it("returns true only when the threshold condition is met", () => {
    const stage = baseStage({
      approval_required: true,
      approver_role: "VP Sales",
      approval_threshold: { field: "discount_pct", operator: "gt", value: 20 },
    });
    expect(stageRequiresApproval(stage, { discount_pct: 25 })).toBe(true);
    expect(stageRequiresApproval(stage, { discount_pct: 10 })).toBe(false);
  });
});

describe("missingRequiredFields", () => {
  it("lists labels of required fields with no value", () => {
    const stage = baseStage({
      fields: [
        { id: "a", label: "Company", type: "text", required: true },
        { id: "b", label: "Notes", type: "text", required: false },
      ],
    });
    expect(missingRequiredFields(stage, { a: "" })).toEqual(["Company"]);
    expect(missingRequiredFields(stage, { a: "Acme" })).toEqual([]);
  });
});
