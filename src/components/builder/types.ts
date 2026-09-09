import type {
  ApprovalThreshold,
  FieldType,
  JourneyStage,
  RequiredDocument,
  SchemaSnapshot,
  StageField,
  ThresholdOperator,
} from "@/lib/types";

// Client-only extension: every AI-populated unit carries an __ai marker until
// the user edits it (onChange clears the marker) or explicitly confirms it.
// These markers never leave the browser — stripAiMarkers() removes them
// before any payload is sent to the API, so the server-side validator never
// sees them and the DB schema is untouched.

export type ClientField = StageField & { __ai?: boolean };
export type ClientDoc = RequiredDocument & { __ai?: boolean };

export interface ClientStage {
  id: string;
  name: string;
  order: number;
  owner_role: string;
  __aiMeta?: boolean; // covers name + owner_role
  fields: ClientField[];
  required_documents: ClientDoc[];
  approval_required: boolean;
  approver_role?: string;
  approval_threshold?: ApprovalThreshold | null;
  __aiApproval?: boolean; // covers approval_required + approver_role + threshold
  reassignable_to: string[];
  __aiReassign?: boolean;
  // Agent's own confidence that this stage is correctly grounded in the
  // source text (see StageConfidence in lib/validation.ts). Client-only,
  // like the __ai* markers — stripAiMarkers() removes it before any payload
  // reaches the server, so it never touches schema_snapshot or the DB.
  __confidence?: number;
  __rationale?: string;
}

export function newStageId(existing: ClientStage[]): string {
  return `stage_${existing.length + 1}_${Math.random().toString(36).slice(2, 6)}`;
}

export function newFieldId(stage: ClientStage): string {
  return `field_${stage.fields.length + 1}_${Math.random().toString(36).slice(2, 6)}`;
}

export function newDocId(stage: ClientStage): string {
  return `doc_${stage.required_documents.length + 1}_${Math.random().toString(36).slice(2, 6)}`;
}

export function blankStage(order: number): ClientStage {
  return {
    id: `stage_new_${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    order,
    owner_role: "",
    fields: [],
    required_documents: [],
    approval_required: false,
    approver_role: undefined,
    approval_threshold: null,
    reassignable_to: [],
  };
}

// AI candidates come back as plain SchemaSnapshot (no markers) — this wraps
// every stage/field/doc/approval-bundle with __ai: true so the UI flags them.
// stageConfidence (keyed by stage id, from the generate route) is attached
// per stage as __confidence/__rationale so StageCard can flag low-confidence
// stages for review — same "carried in the browser only" pattern as __ai.
export function markAsAi(
  schema: SchemaSnapshot,
  stageConfidence?: Record<string, { confidence: number; rationale: string }>
): ClientStage[] {
  return schema.stages.map((s) => ({
    ...s,
    __aiMeta: true,
    __aiApproval: true,
    __aiReassign: true,
    __confidence: stageConfidence?.[s.id]?.confidence,
    __rationale: stageConfidence?.[s.id]?.rationale,
    fields: s.fields.map((f) => ({ ...f, __ai: true })),
    required_documents: s.required_documents.map((d) => ({ ...d, __ai: true })),
  }));
}

export function stripAiMarkers(stages: ClientStage[]): SchemaSnapshot {
  return {
    stages: stages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => {
        const { __aiMeta, __aiApproval, __aiReassign, __confidence, __rationale, fields, required_documents, ...rest } = s;
        return {
          ...rest,
          fields: fields.map(({ __ai, ...f }) => f),
          required_documents: required_documents.map(({ __ai, ...d }) => d),
        } as JourneyStage;
      }),
  };
}

// Lowest stage confidence across the draft, or null if none carry a score
// (manually-built stages, or stages already edited past the AI draft).
// Used to nudge the reviewer-roles step, not to block anything.
export function lowestConfidence(stages: ClientStage[]): number | null {
  const scores = stages.map((s) => s.__confidence).filter((c): c is number => typeof c === "number");
  return scores.length ? Math.min(...scores) : null;
}

export const FIELD_TYPE_OPTIONS: FieldType[] = ["text", "number", "date", "dropdown", "boolean", "currency", "file"];
export const OPERATOR_OPTIONS: { value: ThresholdOperator; label: string }[] = [
  { value: "gt", label: "> greater than" },
  { value: "gte", label: "≥ greater or equal" },
  { value: "lt", label: "< less than" },
  { value: "lte", label: "≤ less or equal" },
  { value: "eq", label: "= equal" },
  { value: "neq", label: "≠ not equal" },
];
