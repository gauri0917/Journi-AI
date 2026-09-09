// Types for the journey_versions.schema_snapshot JSONB payload.
// This is the single source of truth for "what a journey config looks like" —
// the manual builder, the preview renderer, and the AI generator all target
// this shape, and src/lib/validation.ts is what enforces it.

export const FIELD_TYPES = [
  "text",
  "number",
  "date",
  "dropdown",
  "boolean",
  "currency",
  "file",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const THRESHOLD_OPERATORS = ["gt", "gte", "lt", "lte", "eq", "neq"] as const;
export type ThresholdOperator = (typeof THRESHOLD_OPERATORS)[number];

export interface StageField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // only meaningful for type === "dropdown"
  help_text?: string;
}

export interface RequiredDocument {
  id: string;
  name: string;
  required: boolean;
}

export interface ApprovalThreshold {
  field: string; // must reference a field id within the same stage
  operator: ThresholdOperator;
  value: string | number;
}

export interface JourneyStage {
  id: string;
  name: string;
  order: number;
  owner_role: string;
  fields: StageField[];
  required_documents: RequiredDocument[];
  approval_required: boolean;
  approver_role?: string;
  approval_threshold?: ApprovalThreshold | null;
  reassignable_to: string[]; // eligible roles/people for handoff — config only
}

export interface SchemaSnapshot {
  stages: JourneyStage[];
}

export const JOURNEY_STATUSES = ["draft", "in_review", "published", "archived"] as const;
export type JourneyStatusT = (typeof JOURNEY_STATUSES)[number];

export const REVIEW_STATUSES = ["pending", "reviewed"] as const;
export type ReviewStatusT = (typeof REVIEW_STATUSES)[number];
