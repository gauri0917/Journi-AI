"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Label, TextInput, Select, Checkbox, ErrorList } from "@/components/ui";
import { namesMatch, stageRequiresApproval, missingRequiredFields } from "@/lib/deal-run";
import type { SchemaSnapshot, StageField } from "@/lib/types";

type DealData = {
  id: string;
  name: string;
  status: string;
  currentStageId: string | null;
  fieldValues: Record<string, Record<string, unknown>>;
  stageApprovals: Record<string, { approvedBy: string; approvedAt: string; comment?: string }>;
};

function StageFieldInput({
  field,
  value,
  onChange,
}: {
  field: StageField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.type) {
    case "dropdown":
      return (
        <Select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    case "boolean":
      return (
        <Checkbox
          label="Yes"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "file":
      // This app treats "file" fields as a text acknowledgment everywhere
      // (see PreviewForm's disabled mock) — a live Deal keeps that same
      // convention rather than building real file upload for a demo feature.
      return (
        <TextInput
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. site-survey.pdf uploaded"
        />
      );
    case "currency":
      return (
        <TextInput
          type="number"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
        />
      );
    case "date":
      return <TextInput type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return <TextInput type="number" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <TextInput value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

function CompletedStageCard({
  stage,
  values,
  approval,
}: {
  stage: SchemaSnapshot["stages"][number];
  values: Record<string, unknown> | undefined;
  approval: { approvedBy: string; approvedAt: string; comment?: string } | undefined;
}) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/40 p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{stage.name}</h3>
        <span className="text-xs font-medium text-emerald-700">✓ complete</span>
      </div>
      {values && (
        <dl className="space-y-1 text-sm">
          {stage.fields.map((f) => (
            <div key={f.id} className="flex justify-between gap-4">
              <dt className="text-neutral-500">{f.label}</dt>
              <dd className="font-medium text-ink">{String(values[f.id] ?? "—")}</dd>
            </div>
          ))}
        </dl>
      )}
      {approval && (
        <p className="mt-2 text-xs text-emerald-700">
          Approved by {approval.approvedBy} · {new Date(approval.approvedAt).toLocaleString()}
          {approval.comment ? ` — "${approval.comment}"` : ""}
        </p>
      )}
    </Card>
  );
}

export function DealView({ deal, schema, actorName }: { deal: DealData; schema: SchemaSnapshot; actorName: string }) {
  const router = useRouter();
  const stages = [...schema.stages].sort((a, b) => a.order - b.order);
  const currentIndex = stages.findIndex((s) => s.id === deal.currentStageId);

  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const currentStage = currentIndex >= 0 ? stages[currentIndex] : null;
  const currentValues = currentStage ? deal.fieldValues[currentStage.id] : undefined;
  const currentApproval = currentStage ? deal.stageApprovals[currentStage.id] : undefined;
  const needsApproval = currentStage && currentValues ? stageRequiresApproval(currentStage, currentValues) : false;
  const isOwnerOfCurrent = currentStage ? namesMatch(actorName, currentStage.owner_role) : false;
  const isApproverOfCurrent = currentStage ? namesMatch(actorName, currentStage.approver_role) : false;

  async function submitStage() {
    if (!currentStage) return;
    setLoading(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/deals/${deal.id}/submit-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldValues: formValues }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErrors([body.error ?? "Could not submit this stage"]);
        return;
      }
      setFormValues({});
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function approveStage() {
    setLoading(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/deals/${deal.id}/approve-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comment.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErrors([body.error ?? "Could not approve this stage"]);
        return;
      }
      setComment("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {deal.status === "completed" && (
        <Card className="border-route-300 bg-route-50 p-5 text-center">
          <p className="font-semibold text-route-700">✦ Deal closed</p>
          <p className="mt-1 text-sm text-neutral-500">Every stage was filled in and approved where required — this deal is closed.</p>
        </Card>
      )}

      {/* Completed stages, in order */}
      {stages.slice(0, currentIndex === -1 ? stages.length : currentIndex).map((stage) => (
        <CompletedStageCard
          key={stage.id}
          stage={stage}
          values={deal.fieldValues[stage.id]}
          approval={deal.stageApprovals[stage.id]}
        />
      ))}

      {/* Current stage */}
      {currentStage && (
        <Card className="border-route-300 p-6">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="font-mono text-xs text-neutral-400">
                Stage {currentIndex + 1} of {stages.length}
              </p>
              <h3 className="text-lg font-semibold">{currentStage.name}</h3>
              <p className="text-sm text-neutral-500">Owner: {currentStage.owner_role}</p>
            </div>
            {currentStage.approval_required && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                requires approval · {currentStage.approver_role}
              </span>
            )}
          </div>

          {!currentValues ? (
            // Fields not yet submitted for this stage.
            isOwnerOfCurrent ? (
              <div className="space-y-4">
                {currentStage.fields.map((field) => (
                  <div key={field.id}>
                    <Label>
                      {field.label}
                      {field.required && <span className="ml-1 text-red-500">*</span>}
                    </Label>
                    <StageFieldInput
                      field={field}
                      value={formValues[field.id]}
                      onChange={(v) => setFormValues((prev) => ({ ...prev, [field.id]: v }))}
                    />
                  </div>
                ))}
                <ErrorList errors={errors} />
                <Button type="button" onClick={submitStage} disabled={loading}>
                  {loading ? "Submitting…" : "Submit stage"}
                </Button>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
                Waiting for <span className="font-medium text-ink">{currentStage.owner_role}</span> to fill this
                stage in — you're logged in as {actorName}.
              </p>
            )
          ) : needsApproval && !currentApproval ? (
            // Fields submitted, approval required and not yet given.
            <div className="space-y-4">
              <dl className="space-y-1 text-sm">
                {currentStage.fields.map((f) => (
                  <div key={f.id} className="flex justify-between gap-4">
                    <dt className="text-neutral-500">{f.label}</dt>
                    <dd className="font-medium text-ink">{String(currentValues[f.id] ?? "—")}</dd>
                  </div>
                ))}
              </dl>
              {isApproverOfCurrent ? (
                <div className="space-y-2 border-t border-neutral-100 pt-4">
                  <Label>Approval comment (optional)</Label>
                  <TextInput value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Looks good" />
                  <ErrorList errors={errors} />
                  <Button type="button" onClick={approveStage} disabled={loading}>
                    {loading ? "Approving…" : `Approve as ${currentStage.approver_role}`}
                  </Button>
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-4 py-4 text-center text-sm text-amber-800">
                  Waiting for <span className="font-medium">{currentStage.approver_role}</span> to approve — you're
                  logged in as {actorName}.
                </p>
              )}
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
