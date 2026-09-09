import type { SchemaSnapshot } from "../src/lib/types";
import type { StageConfidence } from "../src/lib/validation";
import type { EvalCase } from "./cases";

export interface RubricCheckResult {
  passed: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
  avgConfidence: number | null;
}

export function scoreAgainstRubric(
  data: SchemaSnapshot,
  stageConfidence: StageConfidence,
  evalCase: EvalCase
): RubricCheckResult {
  const { rubric } = evalCase;
  const checks: RubricCheckResult["checks"] = [];

  const stageCount = data.stages.length;
  checks.push({
    name: "stage_count_in_range",
    passed: stageCount >= rubric.minStages && stageCount <= rubric.maxStages,
    detail: `expected ${rubric.minStages}-${rubric.maxStages}, got ${stageCount}`,
  });

  const approvalStages = data.stages.filter((s) => s.approval_required);
  checks.push({
    name: "min_approval_stages",
    passed: approvalStages.length >= rubric.minApprovalStages,
    detail: `expected >= ${rubric.minApprovalStages}, got ${approvalStages.length}`,
  });

  if (rubric.expectedRoleKeywords.length > 0) {
    const allRoles = data.stages
      .flatMap((s) => [s.owner_role, s.approver_role ?? "", ...s.reassignable_to])
      .join(" ")
      .toLowerCase();
    const missingKeywords = rubric.expectedRoleKeywords.filter((kw) => !allRoles.includes(kw.toLowerCase()));
    checks.push({
      name: "expected_role_keywords_present",
      passed: missingKeywords.length === 0,
      detail: missingKeywords.length === 0 ? "all expected role keywords found" : `missing: ${missingKeywords.join(", ")}`,
    });
  }

  if (rubric.expectedFieldTypes.length > 0) {
    const allFieldTypes = new Set(data.stages.flatMap((s) => s.fields.map((f) => f.type)));
    const missingTypes = rubric.expectedFieldTypes.filter((t) => !allFieldTypes.has(t as never));
    checks.push({
      name: "expected_field_types_present",
      passed: missingTypes.length === 0,
      detail: missingTypes.length === 0 ? "all expected field types found" : `missing: ${missingTypes.join(", ")}`,
    });
  }

  const stagesWithThreshold = data.stages.filter((s) => s.approval_threshold != null);
  if (rubric.expectsThreshold) {
    checks.push({
      name: "has_threshold_where_expected",
      passed: stagesWithThreshold.length > 0,
      detail: stagesWithThreshold.length > 0 ? `${stagesWithThreshold.length} stage(s) with a threshold` : "expected at least one approval_threshold, found none",
    });
  }
  if (rubric.expectsNoThresholdOnApprovals) {
    const approvalStagesWithThreshold = approvalStages.filter((s) => s.approval_threshold != null);
    checks.push({
      name: "no_hallucinated_threshold_on_unconditional_approvals",
      passed: approvalStagesWithThreshold.length === 0,
      detail: approvalStagesWithThreshold.length === 0 ? "no thresholds on unconditional approval stages" : `${approvalStagesWithThreshold.length} approval stage(s) wrongly have a threshold`,
    });
  }

  const danglingThresholds = data.stages.filter(
    (s) => s.approval_threshold != null && !s.fields.some((f) => f.id === s.approval_threshold!.field)
  );
  checks.push({
    name: "no_dangling_threshold_references",
    passed: danglingThresholds.length === 0,
    detail: danglingThresholds.length === 0 ? "all threshold field references resolve" : `${danglingThresholds.length} stage(s) reference a field id not defined in that stage`,
  });

  // --- Confidence quality checks -----------------------------------------
  const confidenceValues = data.stages.map((s) => stageConfidence[s.id]?.confidence).filter((c): c is number => typeof c === "number");
  const avgConfidence = confidenceValues.length > 0 ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length : null;

  checks.push({
    name: "every_stage_has_confidence_and_rationale",
    passed: data.stages.every((s) => {
      const c = stageConfidence[s.id];
      return c && typeof c.confidence === "number" && c.confidence >= 0 && c.confidence <= 1 && c.rationale.trim().length > 0;
    }),
    detail: "every stage must carry a 0-1 confidence and a non-empty rationale",
  });

  if (rubric.minAvgConfidence != null && avgConfidence != null) {
    checks.push({
      name: "avg_confidence_above_floor",
      passed: avgConfidence >= rubric.minAvgConfidence,
      detail: `expected avg confidence >= ${rubric.minAvgConfidence}, got ${avgConfidence.toFixed(2)}`,
    });
  }
  if (rubric.maxAvgConfidenceIfDrafted != null && avgConfidence != null) {
    checks.push({
      name: "avg_confidence_appropriately_hedged",
      passed: avgConfidence <= rubric.maxAvgConfidenceIfDrafted,
      detail: `expected avg confidence <= ${rubric.maxAvgConfidenceIfDrafted} (text was ambiguous — overconfidence here is the failure mode), got ${avgConfidence.toFixed(2)}`,
    });
  }

  return { passed: checks.every((c) => c.passed), checks, avgConfidence };
}
