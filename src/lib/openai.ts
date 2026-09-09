import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { FIELD_TYPES, THRESHOLD_OPERATORS } from "./types";

// Balanced tier of the current GPT-5.6 family: strong tool-calling, far
// cheaper than the flagship (Sol), which is overkill for this task. Swap to
// "gpt-5.6-luna" if you want it even cheaper, or "gpt-5.6-sol" for max quality.
const MODEL = "gpt-5.6-terra";

// Lazily instantiated, not a module-level `export const openai = new OpenAI(...)`.
// That eager pattern breaks Next.js's build-time page-data collection step —
// importing this module (which happens just to collect route metadata, not
// to actually call the API) would construct the client immediately and
// throw if OPENAI_API_KEY isn't set in that environment. Deferring
// construction until a request actually needs it means a missing key only
// ever surfaces as a real runtime error on an actual generation attempt,
// not as a mysterious build failure.
let _client: OpenAI | null = null;
export function getOpenAIClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

// --- System prompt -----------------------------------------------------
// Compressed schema definition: "field: type — one-line purpose" rather than
// prose. OpenAI automatically caches repeated prompt prefixes over ~1024
// tokens (no manual cache_control needed, unlike the Anthropic API) — this
// block being byte-identical across both calls in a generation is what makes
// it eligible.

const SCHEMA_DEFINITION = `
JOURNEY SCHEMA (schema_snapshot.stages[]):
id: string — unique stage id, slug-like
name: string — stage display name
order: number — 0-based position, unique per stage
owner_role: string — role that owns this stage
fields[]: intake fields collected in this stage
  id: string — unique within stage
  label: string — field display label
  type: ${FIELD_TYPES.join("|")} — input type
  required: boolean
  options[]: string[] — REQUIRED only when type is "dropdown", the choices
  help_text?: string — optional inline guidance
required_documents[]: docs to collect in this stage
  id: string — unique within stage
  name: string — document name
  required: boolean
approval_required: boolean — does this stage need sign-off
approver_role?: string — REQUIRED when approval_required is true
approval_threshold?: { field, operator, value } | null
  field: string — must match a field id in THIS stage
  operator: ${THRESHOLD_OPERATORS.join("|")}
  value: string|number — comparison value
reassignable_to: string[] — roles/people eligible for handoff (config only, can be empty)
`.trim();

const FEW_SHOT_EXAMPLE = `
Example input: "Onboarding new mid-market SaaS accounts. Sales rep collects
company info and desired plan. Then legal reviews the contract for deals
over $50k. Finally implementation team schedules kickoff."

Example output (emit_journey_draft tool call arguments):
{
  "stages": [
    {
      "id": "intake",
      "name": "Account Intake",
      "order": 0,
      "owner_role": "sales_rep",
      "fields": [
        { "id": "company_name", "label": "Company Name", "type": "text", "required": true },
        { "id": "plan", "label": "Desired Plan", "type": "dropdown", "required": true, "options": ["Starter", "Growth", "Enterprise"] },
        { "id": "deal_value", "label": "Deal Value", "type": "currency", "required": true }
      ],
      "required_documents": [],
      "approval_required": false,
      "approval_threshold": null,
      "reassignable_to": ["sales_manager"]
    },
    {
      "id": "legal_review",
      "name": "Legal Review",
      "order": 1,
      "owner_role": "legal_counsel",
      "fields": [
        { "id": "contract_notes", "label": "Contract Notes", "type": "text", "required": false }
      ],
      "required_documents": [
        { "id": "signed_contract", "name": "Signed Contract", "required": true }
      ],
      "approval_required": true,
      "approver_role": "legal_counsel",
      "approval_threshold": { "field": "deal_value", "operator": "gte", "value": 50000 },
      "reassignable_to": []
    },
    {
      "id": "implementation",
      "name": "Implementation Kickoff",
      "order": 2,
      "owner_role": "implementation_manager",
      "fields": [
        { "id": "kickoff_date", "label": "Kickoff Date", "type": "date", "required": true }
      ],
      "required_documents": [],
      "approval_required": false,
      "approval_threshold": null,
      "reassignable_to": []
    }
  ]
}
`.trim();

export const SYSTEM_PROMPT = `You convert a plain-text description of a B2B product/process into a Journi journey configuration by calling exactly one tool: either emit_journey_draft or request_clarification.

${SCHEMA_DEFINITION}

Rules:
- Break the described process into 2-6 sequential stages in the order they occur.
- Only mark approval_required true if the text implies a sign-off/gate. Only set approval_threshold when the text gives a specific numeric or comparable condition, and its "field" must reference a field id you defined in that same stage.
- Infer role names from the text (snake_case). Do not invent unrelated roles.
- Keep field sets minimal and directly grounded in the text — do not pad with unrelated fields.

Confidence (required on every stage):
- confidence: your honest 0-1 estimate that this stage's owner_role, fields, and approval config are correct as grounded in the text. 1.0 only when the text explicitly states the stage's details. Lower it (e.g. 0.4-0.6) when you inferred structure the text did not spell out — e.g. multiple products or stages mentioned with no stated difference in handling between them, so you picked one reasonable structure among several.
- rationale: one sentence — what in the text supports this stage, or what you had to assume.
- Do not inflate confidence to seem more certain than the text supports. A low-confidence honest draft is more useful than a high-confidence guess, because low-confidence stages get flagged for human review before anything goes live.

When to ask instead of guess (call request_clarification instead of emit_journey_draft):
- The text names multiple distinct products/offerings but does not say whether they share one journey or need separate branches/stages per product.
- The text is too short or vague to identify even a rough stage sequence.
- Do NOT ask for minor gaps (missing role names, missing thresholds) — infer those and reflect the gap via lower confidence instead. Only ask when the ambiguity would change the overall journey structure, not just one field's value.

Always call exactly one tool. Never respond with plain text.

${FEW_SHOT_EXAMPLE}`;

// --- Tool (structured output) definition --------------------------------
// A JSON Schema mirror of SchemaSnapshot. This constrains the shape the
// model can emit; src/lib/validation.ts remains the authoritative check run
// server-side afterward — this tool schema is a first line of defense, not
// a substitute for it.

export const DRAFT_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "emit_journey_draft",
    description: "Emit a candidate journey schema_snapshot for the described process.",
    parameters: {
      type: "object",
      properties: {
        stages: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              order: { type: "number" },
              owner_role: { type: "string" },
              fields: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    label: { type: "string" },
                    type: { type: "string", enum: FIELD_TYPES as unknown as string[] },
                    required: { type: "boolean" },
                    options: { type: "array", items: { type: "string" } },
                    help_text: { type: "string" },
                  },
                  required: ["id", "label", "type", "required"],
                },
              },
              required_documents: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    required: { type: "boolean" },
                  },
                  required: ["id", "name", "required"],
                },
              },
              approval_required: { type: "boolean" },
              approver_role: { type: "string" },
              approval_threshold: {
                type: ["object", "null"],
                properties: {
                  field: { type: "string" },
                  operator: { type: "string", enum: THRESHOLD_OPERATORS as unknown as string[] },
                  value: { type: ["string", "number"] },
                },
                required: ["field", "operator", "value"],
              },
              reassignable_to: { type: "array", items: { type: "string" } },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1,
                description: "Honest 0-1 confidence that this stage is correctly grounded in the input text.",
              },
              rationale: {
                type: "string",
                description: "One sentence: what supports this stage, or what was assumed.",
              },
            },
            required: [
              "id", "name", "order", "owner_role", "fields", "required_documents",
              "approval_required", "reassignable_to", "confidence", "rationale",
            ],
          },
        },
      },
      required: ["stages"],
    },
  },
};

// A distinct tool the model calls INSTEAD of emit_journey_draft when the
// input is ambiguous about journey structure (not just missing minor detail —
// see SYSTEM_PROMPT). This is what lets the model ask rather than guess —
// an autonomous choice made via tool selection, not a separate step.
export const CLARIFY_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "request_clarification",
    description:
      "Ask the user a clarifying question instead of drafting a journey, because the input is ambiguous about overall journey structure.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The specific question to show the user.",
        },
        reason: {
          type: "string",
          description: "One sentence: what in the text is ambiguous and why it changes the journey structure.",
        },
      },
      required: ["question", "reason"],
    },
  },
};

export type OpenAITurn = ChatCompletionMessageParam;

export type DraftModelResult =
  | { kind: "draft"; toolInput: unknown; toolCallId: string; updatedHistory: OpenAITurn[] }
  | { kind: "clarify"; question: string; reason: string; updatedHistory: OpenAITurn[] }
  | { kind: "none"; updatedHistory: OpenAITurn[] };

// Minimal shape needed here — avoids importing from rag.ts and creating a
// module cycle (rag.ts -> embeddings.ts -> openai.ts).
export interface RetrievedExampleInput {
  description: string;
  schemaSnapshot: unknown;
}

// Formats retrieved examples as a SEPARATE system message, not folded into
// SYSTEM_PROMPT. This is the key design choice for combining RAG with
// prompt caching: SYSTEM_PROMPT stays byte-identical across every request
// (eligible for OpenAI's automatic prefix caching), while this block varies
// per-request and is never cached. Folding retrieval into the cached prompt
// would silently break caching on every request with different retrieved
// content — worse, it would look like it worked (still valid output), just
// quietly cost more and respond slower.
function buildRetrievedExamplesMessage(examples: RetrievedExampleInput[]): OpenAITurn | null {
  if (examples.length === 0) return null;
  const formatted = examples
    .map(
      (ex, i) =>
        `Similar real example ${i + 1} (from a published journey — prefer this stage/field structure over the generic example above when it fits):\nInput: "${ex.description}"\nOutput: ${JSON.stringify(ex.schemaSnapshot)}`
    )
    .join("\n\n");
  return {
    role: "system",
    content: `RETRIEVED EXAMPLES — real, published journeys similar to the current input. These are more relevant than the generic few-shot example in your main instructions; weight them accordingly, but still ground everything in the CURRENT input text, not these examples' specifics.\n\n${formatted}`,
  };
}

// Cap: this function makes exactly one model call. The route caller is
// responsible for enforcing the "at most 2 calls total" budget by calling
// this at most twice, threading `history` through.
//
// tool_choice is "auto" (not forced to emit_journey_draft) so the model can
// pick request_clarification instead — the model's own judgment call about
// which tool fits, made via tool_choice: "auto" inside this one call. Not a
// separate classification step or agent; one call, two tools, model decides.
export async function callDraftModel(
  history: OpenAITurn[],
  retrievedExamples: RetrievedExampleInput[] = []
): Promise<DraftModelResult> {
  const retrievalMessage = buildRetrievedExamplesMessage(retrievedExamples);
  const messages: OpenAITurn[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(retrievalMessage ? [retrievalMessage] : []),
    ...history,
  ];

  const response = await getOpenAIClient().chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_completion_tokens: 4096,
    // GPT-5.6 models default to a non-"none" reasoning effort, which the
    // Chat Completions endpoint doesn't support alongside function/tool
    // calling (see OpenAI's error: "Function tools with reasoning_effort
    // are not supported for gpt-5.6-terra in /v1/chat/completions"). This
    // app relies on tool calls for every draft/clarify decision, so
    // reasoning is explicitly turned off rather than switching to the
    // Responses API — keeps this on the simpler, more widely-documented
    // Chat Completions surface.
    // Cast needed: this SDK version's ReasoningEffort type is still
    // 'low' | 'medium' | 'high' | null — it hasn't caught up to GPT-5.6's
    // newer effort levels (OpenAI's own error message names "none" as a
    // valid value; see comment above). This is a real gap between the API
    // and this npm package snapshot, not a typo — revisit if a newer SDK
    // release adds "none" to its own type and this cast can be dropped.
    reasoning_effort: "none" as unknown as "low",
    tools: [DRAFT_TOOL, CLARIFY_TOOL],
    tool_choice: "auto",
    messages,
  });

  const message = response.choices[0]?.message;
  const toolCall = message?.tool_calls?.[0];
  const updatedHistory: OpenAITurn[] = [
    ...history,
    message ? (message as OpenAITurn) : { role: "assistant", content: "" },
  ];

  if (!toolCall || toolCall.type !== "function") {
    return { kind: "none", updatedHistory };
  }

  let parsedArgs: unknown = null;
  try {
    parsedArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    return { kind: "none", updatedHistory };
  }

  if (toolCall.function.name === "request_clarification") {
    const args = parsedArgs as { question?: unknown; reason?: unknown };
    return {
      kind: "clarify",
      question: typeof args.question === "string" ? args.question : "Could you clarify the journey structure?",
      reason: typeof args.reason === "string" ? args.reason : "",
      updatedHistory,
    };
  }

  return { kind: "draft", toolInput: parsedArgs, toolCallId: toolCall.id, updatedHistory };
}
