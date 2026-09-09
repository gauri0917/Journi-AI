// The one and only schema_snapshot validator.
//
// This is called from two places, deliberately:
//   1. POST /api/journeys/[id]/publish — validates a manually-built draft
//   2. POST /api/ai/generate — validates a Claude-produced candidate
//
// There is no second, "looser" AI-specific check. A candidate that fails
// this function is not shown to the user; see ai/generate/route.ts for the
// retry-once-then-fail behavior built on top of this.

import { FIELD_TYPES, THRESHOLD_OPERATORS, type SchemaSnapshot, type ThresholdOperator } from "./types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: SchemaSnapshot;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateSchemaSnapshot(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(input)) {
    return { valid: false, errors: ["root: schema_snapshot must be an object"] };
  }

  const stagesRaw = input.stages;
  if (!Array.isArray(stagesRaw) || stagesRaw.length === 0) {
    return { valid: false, errors: ["stages: must be a non-empty array"] };
  }

  const seenStageIds = new Set<string>();
  const seenStageOrders = new Set<number>();

  const stages = stagesRaw.map((rawStage, sIdx) => {
    const prefix = `stages[${sIdx}]`;
    if (!isPlainObject(rawStage)) {
      errors.push(`${prefix}: must be an object`);
      return null;
    }

    const { id, name, order, owner_role, fields, required_documents,
      approval_required, approver_role, approval_threshold, reassignable_to } = rawStage as Record<string, unknown>;

    if (!isNonEmptyString(id)) errors.push(`${prefix}.id: required non-empty string`);
    else if (seenStageIds.has(id)) errors.push(`${prefix}.id: duplicate stage id "${id}"`);
    else seenStageIds.add(id);

    if (!isNonEmptyString(name)) errors.push(`${prefix}.name: required non-empty string`);

    if (typeof order !== "number" || !Number.isFinite(order)) {
      errors.push(`${prefix}.order: required number`);
    } else if (seenStageOrders.has(order)) {
      errors.push(`${prefix}.order: duplicate order value ${order}`);
    } else {
      seenStageOrders.add(order);
    }

    if (!isNonEmptyString(owner_role)) errors.push(`${prefix}.owner_role: required non-empty string`);

    // --- fields ---
    const fieldIds = new Set<string>();
    let fieldsOut: SchemaSnapshot["stages"][number]["fields"] = [];
    if (!Array.isArray(fields) || fields.length === 0) {
      errors.push(`${prefix}.fields: must be a non-empty array`);
    } else {
      fieldsOut = fields.map((rawField, fIdx) => {
        const fPrefix = `${prefix}.fields[${fIdx}]`;
        if (!isPlainObject(rawField)) {
          errors.push(`${fPrefix}: must be an object`);
          return null;
        }
        const { id: fid, label, type, required, options, help_text } = rawField as Record<string, unknown>;

        if (!isNonEmptyString(fid)) errors.push(`${fPrefix}.id: required non-empty string`);
        else if (fieldIds.has(fid)) errors.push(`${fPrefix}.id: duplicate field id "${fid}" in stage`);
        else fieldIds.add(fid);

        if (!isNonEmptyString(label)) errors.push(`${fPrefix}.label: required non-empty string`);

        if (typeof type !== "string" || !(FIELD_TYPES as readonly string[]).includes(type)) {
          errors.push(`${fPrefix}.type: must be one of ${FIELD_TYPES.join("/")}`);
        }
        if (typeof required !== "boolean") errors.push(`${fPrefix}.required: must be boolean`);

        if (type === "dropdown") {
          if (!Array.isArray(options) || options.length === 0 || !options.every(isNonEmptyString)) {
            errors.push(`${fPrefix}.options: required non-empty string array when type is "dropdown"`);
          }
        }
        if (help_text !== undefined && typeof help_text !== "string") {
          errors.push(`${fPrefix}.help_text: must be a string if present`);
        }

        return {
          id: fid as string,
          label: label as string,
          type: type as SchemaSnapshot["stages"][number]["fields"][number]["type"],
          required: required as boolean,
          options: Array.isArray(options) ? (options as string[]) : undefined,
          help_text: typeof help_text === "string" ? help_text : undefined,
        };
      }).filter((f): f is NonNullable<typeof f> => f !== null);
    }

    // --- required_documents ---
    const docIds = new Set<string>();
    let docsOut: SchemaSnapshot["stages"][number]["required_documents"] = [];
    if (!Array.isArray(required_documents)) {
      errors.push(`${prefix}.required_documents: must be an array (can be empty)`);
    } else {
      docsOut = required_documents.map((rawDoc, dIdx) => {
        const dPrefix = `${prefix}.required_documents[${dIdx}]`;
        if (!isPlainObject(rawDoc)) {
          errors.push(`${dPrefix}: must be an object`);
          return null;
        }
        const { id: did, name: dname, required: dreq } = rawDoc as Record<string, unknown>;
        if (!isNonEmptyString(did)) errors.push(`${dPrefix}.id: required non-empty string`);
        else if (docIds.has(did)) errors.push(`${dPrefix}.id: duplicate document id "${did}" in stage`);
        else docIds.add(did);
        if (!isNonEmptyString(dname)) errors.push(`${dPrefix}.name: required non-empty string`);
        if (typeof dreq !== "boolean") errors.push(`${dPrefix}.required: must be boolean`);
        return { id: did as string, name: dname as string, required: dreq as boolean };
      }).filter((d): d is NonNullable<typeof d> => d !== null);
    }

    // --- approval config ---
    if (typeof approval_required !== "boolean") {
      errors.push(`${prefix}.approval_required: must be boolean`);
    }
    if (approval_required === true && !isNonEmptyString(approver_role)) {
      errors.push(`${prefix}.approver_role: required non-empty string when approval_required is true`);
    }
    if (approver_role !== undefined && approver_role !== null && !isNonEmptyString(approver_role)) {
      errors.push(`${prefix}.approver_role: must be a non-empty string if present`);
    }

    let thresholdOut: SchemaSnapshot["stages"][number]["approval_threshold"] = null;
    if (approval_threshold !== undefined && approval_threshold !== null) {
      const tPrefix = `${prefix}.approval_threshold`;
      if (!isPlainObject(approval_threshold)) {
        errors.push(`${tPrefix}: must be an object or null`);
      } else {
        const { field: tField, operator, value } = approval_threshold as Record<string, unknown>;
        if (!isNonEmptyString(tField)) {
          errors.push(`${tPrefix}.field: required non-empty string`);
        } else if (!fieldIds.has(tField)) {
          errors.push(`${tPrefix}.field: "${tField}" does not match any field id in this stage`);
        }
        if (typeof operator !== "string" || !(THRESHOLD_OPERATORS as readonly string[]).includes(operator)) {
          errors.push(`${tPrefix}.operator: must be one of ${THRESHOLD_OPERATORS.join("/")}`);
        }
        if (value === undefined || value === null || (typeof value !== "string" && typeof value !== "number")) {
          errors.push(`${tPrefix}.value: required string or number`);
        }
        if (isNonEmptyString(tField) && typeof operator === "string" && value !== undefined && value !== null) {
          thresholdOut = {
            field: tField,
            operator: operator as ThresholdOperator,
            value: value as string | number,
          };
        }
      }
    }

    if (!Array.isArray(reassignable_to) || !reassignable_to.every((r) => typeof r === "string")) {
      errors.push(`${prefix}.reassignable_to: must be a string array (can be empty)`);
    }

    return {
      id: id as string,
      name: name as string,
      order: order as number,
      owner_role: owner_role as string,
      fields: fieldsOut,
      required_documents: docsOut,
      approval_required: approval_required as boolean,
      approver_role: isNonEmptyString(approver_role) ? approver_role : undefined,
      approval_threshold: thresholdOut,
      reassignable_to: Array.isArray(reassignable_to) ? (reassignable_to as string[]) : [],
    };
  }).filter((s): s is NonNullable<typeof s> => s !== null);

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: { stages } as SchemaSnapshot };
}

// Formats errors for the AI retry prompt: compact, one per line, no prose.
export function formatErrorsForRetry(errors: string[]): string {
  return errors.map((e) => `- ${e}`).join("\n");
}

// --- Agent confidence extraction -----------------------------------------
// confidence/rationale ride on the raw tool-call arguments per stage (see
// DRAFT_TOOL in lib/openai.ts) but are NOT part of SchemaSnapshot — they
// never reach the DB. validateSchemaSnapshot() above only reads known keys
// off each raw stage object, so these two extra keys are silently ignored by
// it; this function is the only place that reads them, straight off the raw
// tool input, before/independent of validation. Keyed by stage id so the
// caller can zip it back onto validated stages (which are ordered the same,
// but keyed by id is more robust to future changes).
export interface StageConfidence {
  [stageId: string]: { confidence: number; rationale: string };
}

export function extractStageConfidence(rawInput: unknown): StageConfidence {
  const out: StageConfidence = {};
  if (!isPlainObject(rawInput) || !Array.isArray(rawInput.stages)) return out;
  for (const raw of rawInput.stages) {
    if (!isPlainObject(raw)) continue;
    const { id, confidence, rationale } = raw as Record<string, unknown>;
    if (!isNonEmptyString(id)) continue;
    out[id] = {
      confidence: typeof confidence === "number" ? confidence : 0.5,
      rationale: typeof rationale === "string" ? rationale : "",
    };
  }
  return out;
}
