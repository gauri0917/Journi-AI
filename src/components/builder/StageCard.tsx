"use client";

import { useState } from "react";
import { Button, Label, TextInput, Select, Checkbox, Card, AiFlag } from "@/components/ui";
import {
  ClientStage,
  FIELD_TYPE_OPTIONS,
  OPERATOR_OPTIONS,
  newFieldId,
  newDocId,
} from "./types";

export function StageCard({
  stage,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  stage: ClientStage;
  index: number;
  total: number;
  onChange: (next: ClientStage) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(true);

  function patch(partial: Partial<ClientStage>) {
    onChange({ ...stage, ...partial });
  }

  function patchMeta(partial: Partial<Pick<ClientStage, "name" | "owner_role">>) {
    onChange({ ...stage, ...partial, __aiMeta: false });
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 bg-neutral-50 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs text-neutral-400">{String(index + 1).padStart(2, "0")}</span>
          <span className="truncate text-sm font-medium">{stage.name || "Untitled stage"}</span>
          {stage.__aiMeta && <AiFlag>meta</AiFlag>}
          {typeof stage.__confidence === "number" && (
            <span
              title={stage.__rationale}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                stage.__confidence < 0.7
                  ? "border border-dashed border-amber-400 bg-amber-50 text-amber-700"
                  : "border border-dashed border-emerald-400 bg-emerald-50 text-emerald-700"
              }`}
            >
              {Math.round(stage.__confidence * 100)}% confidence
            </span>
          )}
          {stage.approval_required && (
            <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] uppercase text-neutral-500">
              approval
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs text-neutral-400">{open ? "collapse" : "expand"}</span>
      </button>

      {open && (
        <div className="space-y-6 border-t border-neutral-200 px-4 py-5">
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onMove(-1)} disabled={index === 0}>
              ↑ move up
            </Button>
            <Button type="button" variant="ghost" onClick={() => onMove(1)} disabled={index === total - 1}>
              ↓ move down
            </Button>
            <Button type="button" variant="danger" onClick={onRemove}>
              Remove stage
            </Button>
          </div>

          {/* --- Stage meta --- */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Stage name</Label>
              <TextInput
                value={stage.name}
                onChange={(e) => patchMeta({ name: e.target.value })}
                placeholder="e.g. Legal Review"
              />
            </div>
            <div>
              <Label>Owner role</Label>
              <TextInput
                value={stage.owner_role}
                onChange={(e) => patchMeta({ owner_role: e.target.value })}
                placeholder="e.g. legal_counsel"
              />
            </div>
          </div>

          {/* --- Fields --- */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">Intake fields</Label>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  patch({
                    fields: [
                      ...stage.fields,
                      { id: newFieldId(stage), label: "", type: "text", required: false },
                    ],
                  })
                }
              >
                + Add field
              </Button>
            </div>
            <div className="space-y-2">
              {stage.fields.length === 0 && <p className="text-sm text-neutral-400">No fields yet.</p>}
              {stage.fields.map((field, fIdx) => (
                <div key={field.id} className="rounded-md border border-neutral-200 p-3">
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 grid-cols-12 gap-2">
                      <div className="col-span-4">
                        <TextInput
                          value={field.label}
                          placeholder="Field label"
                          onChange={(e) => {
                            const fields = [...stage.fields];
                            fields[fIdx] = { ...field, label: e.target.value, __ai: false };
                            patch({ fields });
                          }}
                        />
                      </div>
                      <div className="col-span-3">
                        <Select
                          value={field.type}
                          onChange={(e) => {
                            const fields = [...stage.fields];
                            fields[fIdx] = { ...field, type: e.target.value as any, __ai: false };
                            patch({ fields });
                          }}
                        >
                          {FIELD_TYPE_OPTIONS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </Select>
                      </div>
                      <div className="col-span-3">
                        <TextInput
                          value={field.help_text ?? ""}
                          placeholder="Help text (optional)"
                          onChange={(e) => {
                            const fields = [...stage.fields];
                            fields[fIdx] = { ...field, help_text: e.target.value || undefined, __ai: false };
                            patch({ fields });
                          }}
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-2">
                        <Checkbox
                          label="required"
                          checked={field.required}
                          onChange={(e) => {
                            const fields = [...stage.fields];
                            fields[fIdx] = { ...field, required: e.target.checked, __ai: false };
                            patch({ fields });
                          }}
                        />
                      </div>
                      {field.type === "dropdown" && (
                        <div className="col-span-12">
                          <TextInput
                            value={(field.options ?? []).join(", ")}
                            placeholder="Options, comma separated"
                            onChange={(e) => {
                              const fields = [...stage.fields];
                              fields[fIdx] = {
                                ...field,
                                options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                                __ai: false,
                              };
                              patch({ fields });
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {field.__ai && <AiFlag>{""}</AiFlag>}
                      <button
                        type="button"
                        className="text-xs text-neutral-400 hover:text-red-600"
                        onClick={() => patch({ fields: stage.fields.filter((_, i) => i !== fIdx) })}
                      >
                        remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* --- Approval config --- */}
          <div className="rounded-md border border-neutral-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">Approval</Label>
              {stage.__aiApproval && <AiFlag>approval</AiFlag>}
            </div>
            <Checkbox
              label="Requires approval before this stage can proceed"
              checked={stage.approval_required}
              onChange={(e) =>
                patch({
                  approval_required: e.target.checked,
                  approver_role: e.target.checked ? stage.approver_role : undefined,
                  __aiApproval: false,
                })
              }
            />
            {stage.approval_required && (
              <div className="mt-3 space-y-3">
                <div>
                  <Label>Approver role</Label>
                  <TextInput
                    value={stage.approver_role ?? ""}
                    placeholder="e.g. deal_desk"
                    onChange={(e) => patch({ approver_role: e.target.value, __aiApproval: false })}
                  />
                </div>
                <div>
                  <Label>Threshold (optional — approval only required past this condition)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Select
                      value={stage.approval_threshold?.field ?? ""}
                      onChange={(e) => {
                        const field = e.target.value;
                        patch({
                          approval_threshold: field
                            ? { field, operator: stage.approval_threshold?.operator ?? "gte", value: stage.approval_threshold?.value ?? "" }
                            : null,
                          __aiApproval: false,
                        });
                      }}
                    >
                      <option value="">No threshold — always require</option>
                      {stage.fields.map((f) => (
                        <option key={f.id} value={f.id}>{f.label || f.id}</option>
                      ))}
                    </Select>
                    <Select
                      value={stage.approval_threshold?.operator ?? "gte"}
                      disabled={!stage.approval_threshold}
                      onChange={(e) =>
                        patch({
                          approval_threshold: stage.approval_threshold
                            ? { ...stage.approval_threshold, operator: e.target.value as any }
                            : null,
                          __aiApproval: false,
                        })
                      }
                    >
                      {OPERATOR_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                    <TextInput
                      value={stage.approval_threshold?.value ?? ""}
                      disabled={!stage.approval_threshold}
                      placeholder="value"
                      onChange={(e) =>
                        patch({
                          approval_threshold: stage.approval_threshold
                            ? { ...stage.approval_threshold, value: e.target.value }
                            : null,
                          __aiApproval: false,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <Label className="mb-0">Reassignable to (roles eligible for handoff)</Label>
                {stage.__aiReassign && <AiFlag>{""}</AiFlag>}
              </div>
              <TextInput
                value={stage.reassignable_to.join(", ")}
                placeholder="e.g. sales_manager, deal_desk"
                onChange={(e) =>
                  patch({
                    reassignable_to: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    __aiReassign: false,
                  })
                }
              />
              <p className="mt-1 text-xs text-neutral-400">Config only — no reassignment action in this prototype.</p>
            </div>
          </div>

          {/* --- Required documents --- */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">Required documents</Label>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  patch({
                    required_documents: [
                      ...stage.required_documents,
                      { id: newDocId(stage), name: "", required: true },
                    ],
                  })
                }
              >
                + Add document
              </Button>
            </div>
            <div className="space-y-2">
              {stage.required_documents.length === 0 && <p className="text-sm text-neutral-400">None required.</p>}
              {stage.required_documents.map((doc, dIdx) => (
                <div key={doc.id} className="flex items-center gap-2">
                  <TextInput
                    value={doc.name}
                    placeholder="Document name"
                    onChange={(e) => {
                      const docs = [...stage.required_documents];
                      docs[dIdx] = { ...doc, name: e.target.value, __ai: false };
                      patch({ required_documents: docs });
                    }}
                  />
                  <Checkbox
                    label="required"
                    checked={doc.required}
                    onChange={(e) => {
                      const docs = [...stage.required_documents];
                      docs[dIdx] = { ...doc, required: e.target.checked, __ai: false };
                      patch({ required_documents: docs });
                    }}
                  />
                  {doc.__ai && <AiFlag>{""}</AiFlag>}
                  <button
                    type="button"
                    className="text-xs text-neutral-400 hover:text-red-600"
                    onClick={() => patch({ required_documents: stage.required_documents.filter((_, i) => i !== dIdx) })}
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
