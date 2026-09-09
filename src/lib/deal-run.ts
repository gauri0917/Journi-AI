import type { ApprovalThreshold, JourneyStage } from "./types";

// Compares a logged-in guest's PROFILE TYPE (e.g. "legal_counsel", set at
// login — see current-user.ts / login/page.tsx) against a stage's
// owner_role / approver_role. These are always profile-type strings, the
// same convention journey creation uses everywhere else in this schema —
// never a specific person's name. Case/whitespace-insensitive.
export function roleMatches(actorRole: string | null | undefined, stageRole: string | null | undefined): boolean {
  if (!actorRole || !stageRole) return false;
  return actorRole.trim().toLowerCase() === stageRole.trim().toLowerCase();
}

export type StageFieldValues = Record<string, unknown>;

// Evaluates one stage's approval_threshold against that stage's submitted
// field values. Returns true if the condition is met (i.e. approval is
// actually triggered) — used alongside stage.approval_required, since a
// stage can require approval unconditionally (no threshold) or only past a
// threshold (e.g. "requires approval if discount_pct > 20").
export function evaluateThreshold(threshold: ApprovalThreshold, values: StageFieldValues): boolean {
  const raw = values[threshold.field];
  if (raw === undefined || raw === null || raw === "") return false;

  const numericThreshold = typeof threshold.value === "number" ? threshold.value : Number(threshold.value);
  const numericRaw = Number(raw);
  const bothNumeric = !Number.isNaN(numericThreshold) && !Number.isNaN(numericRaw);

  switch (threshold.operator) {
    case "gt":
      return bothNumeric ? numericRaw > numericThreshold : String(raw) > String(threshold.value);
    case "gte":
      return bothNumeric ? numericRaw >= numericThreshold : String(raw) >= String(threshold.value);
    case "lt":
      return bothNumeric ? numericRaw < numericThreshold : String(raw) < String(threshold.value);
    case "lte":
      return bothNumeric ? numericRaw <= numericThreshold : String(raw) <= String(threshold.value);
    case "eq":
      return bothNumeric ? numericRaw === numericThreshold : String(raw) === String(threshold.value);
    case "neq":
      return bothNumeric ? numericRaw !== numericThreshold : String(raw) !== String(threshold.value);
    default:
      return false;
  }
}

// Whether a stage's approval gate is actually active for the values
// submitted — true for an unconditional approval_required stage, or a
// conditional one whose threshold evaluates true. False otherwise, meaning
// the run can advance past this stage without anyone approving it.
export function stageRequiresApproval(stage: JourneyStage, values: StageFieldValues): boolean {
  if (!stage.approval_required) return false;
  if (!stage.approval_threshold) return true;
  return evaluateThreshold(stage.approval_threshold, values);
}

// Basic required-field check — mirrors the spirit of validation.ts without
// being as exhaustive, since this validates end-user SUBMITTED VALUES, not
// the schema itself (a different concern, already covered elsewhere).
export function missingRequiredFields(stage: JourneyStage, values: StageFieldValues): string[] {
  return stage.fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = values[f.id];
      return v === undefined || v === null || v === "";
    })
    .map((f) => f.label);
}
