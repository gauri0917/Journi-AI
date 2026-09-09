import { describe, it, expect } from "vitest";
import { roleMatches, evaluateThreshold, stageRequiresApproval, missingRequiredFields } from "@/lib/deal-run";
import type { JourneyStage } from "@/lib/types";

describe("roleMatches", () => {
  it("matches case- and whitespace-insensitively", () => {
    expect(roleMatches("legal_counsel", "Legal_Counsel")).toBe(true);
    expect(roleMatches("  legal_counsel  ", "legal_counsel")).toBe(true);
  });
  it("does not match different profile types", () => {
    expect(roleMatches("sales_rep", "legal_counsel")).toBe(false);
  });
  it("returns false for null/undefined/empty", () => {
    expect(roleMatches(null, "legal_counsel")).toBe(false);
    expect(roleMatches("legal_counsel", undefined)).toBe(false);
    expect(roleMatches("", "")).toBe(false);
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
    owner_role: "sales_rep",
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
      approver_role: "vp_sales",
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
