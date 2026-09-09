"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Label, TextInput, TextArea, Card, ErrorList } from "@/components/ui";
import { StageCard } from "./StageCard";
import { AIGenerateModal } from "./AIGenerateModal";
import { ClientStage, blankStage, lowestConfidence, markAsAi, newStageId, stripAiMarkers } from "./types";
import { validateSchemaSnapshot, type StageConfidence } from "@/lib/validation";

type Step = "basics" | "stages" | "review";

export function BuilderWizard({
  journeyId: initialJourneyId,
  initialBasics,
  initialStages,
  startStep,
  autoOpenAi,
}: {
  journeyId?: string;
  initialBasics?: { name: string; description: string; productType: string };
  initialStages?: ClientStage[];
  startStep?: Step;
  autoOpenAi?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(startStep ?? "basics");
  const [journeyId, setJourneyId] = useState<string | undefined>(initialJourneyId);
  const [name, setName] = useState(initialBasics?.name ?? "");
  const [description, setDescription] = useState(initialBasics?.description ?? "");
  const [productType, setProductType] = useState(initialBasics?.productType ?? "");
  const [stages, setStages] = useState<ClientStage[]>(initialStages ?? []);
  const [reviewerRoles, setReviewerRoles] = useState<string>("");
  // Defaulting from the autoOpenAi prop lets the dashboard's "Draft with AI"
  // entry point (/journeys/new?ai=1) land straight in the modal instead of
  // making the person click the button again after arriving.
  const [aiModalOpen, setAiModalOpen] = useState(autoOpenAi ?? false);
  const [aiSourceDescription, setAiSourceDescription] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const basicsValid = name.trim() !== "" && productType.trim() !== "";

  function updateStage(idx: number, next: ClientStage) {
    const copy = [...stages];
    copy[idx] = next;
    setStages(copy);
  }

  function addStage() {
    setStages([...stages, blankStage(stages.length)]);
  }

  function removeStage(idx: number) {
    setStages(stages.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })));
  }

  function moveStage(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const copy = [...stages];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setStages(copy.map((s, i) => ({ ...s, order: i })));
  }

  function handleAiGenerated(schema: { stages: any[] }, stageConfidence: StageConfidence, sourceDescription: string) {
    setStages(markAsAi(schema as any, stageConfidence));
    setAiSourceDescription(sourceDescription);
    setAiModalOpen(false);
    setStep("stages");
  }

  const lowConfidence = lowestConfidence(stages);
  const lowConfidenceStages = stages.filter((s) => typeof s.__confidence === "number" && s.__confidence < 0.7);

  async function handleSubmitForReview() {
    setErrors([]);
    if (!basicsValid) {
      setErrors(["Journey name and product type are required."]);
      setStep("basics");
      return;
    }
    const roles = reviewerRoles.split(",").map((r) => r.trim()).filter(Boolean);
    if (roles.length === 0) {
      setErrors(["At least one reviewer role is required to submit for review."]);
      return;
    }

    const schemaSnapshot = stripAiMarkers(stages);
    const localCheck = validateSchemaSnapshot(schemaSnapshot);
    if (!localCheck.valid) {
      setErrors(localCheck.errors);
      setStep("stages");
      return;
    }

    setSaving(true);
    try {
      let id = journeyId;
      const basicsPayload = { name: name.trim(), description: description.trim(), productType: productType.trim() };

      if (!id) {
        const res = await fetch("/api/journeys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(basicsPayload),
        });
        const body = await res.json();
        if (!res.ok) {
          setErrors([body.error ?? "Could not create journey"]);
          return;
        }
        id = body.journey.id;
        setJourneyId(id);
      } else {
        await fetch(`/api/journeys/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(basicsPayload),
        });
      }

      const res2 = await fetch(`/api/journeys/${id}/submit-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaSnapshot, reviewerRoles: roles, sourceDescription: aiSourceDescription }),
      });
      const body2 = await res2.json();
      if (!res2.ok) {
        setErrors(body2.details ?? [body2.error ?? "Could not submit for review"]);
        return;
      }
      router.push(`/journeys/${id}`);
    } catch (err) {
      console.error("Submit-for-review request failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setErrors([`Request failed: ${message}`]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex gap-1 rounded-lg border border-neutral-200 bg-white p-1 text-sm">
        {(["basics", "stages", "review"] as Step[]).map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`flex-1 rounded-md px-3 py-2 font-medium capitalize transition-colors ${
              step === s ? "bg-route-600 text-white" : "text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            {s === "review" ? "Reviewers & submit" : s}
          </button>
        ))}
      </div>

      <ErrorList errors={errors} />

      {step === "basics" && (
        <Card className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-4 rounded-md border border-dashed border-route-300 bg-route-50/50 p-4">
            <div>
              <p className="text-sm font-medium text-ink">Have a process description already?</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Paste it (or upload a .pdf/.docx/.txt) and skip straight to a drafted set of stages — you can still
                fill in the name and product type after.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setAiModalOpen(true)} className="shrink-0">
              ✦ Draft with AI
            </Button>
          </div>
          <div>
            <Label>Journey name</Label>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mid-Market SaaS Onboarding" />
          </div>
          <div>
            <Label>Description</Label>
            <TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this journey is for, and who it's for." />
          </div>
          <div>
            <Label>Product type</Label>
            <TextInput value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="e.g. SaaS Subscription" />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setStep("stages")} disabled={!basicsValid}>
              Continue to stages →
            </Button>
          </div>
        </Card>
      )}

      {step === "stages" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">
              {stages.length} stage{stages.length === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setAiModalOpen(true)}>
                ✦ Draft with AI
              </Button>
              <Button type="button" variant="secondary" onClick={addStage}>
                + Add stage
              </Button>
            </div>
          </div>

          {stages.length === 0 && (
            <Card className="px-6 py-10 text-center text-sm text-neutral-500">
              No stages yet. Add one manually, or draft the whole journey from a process description.
            </Card>
          )}

          {stages
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((stage, idx) => (
              <StageCard
                key={stage.id}
                stage={stage}
                index={idx}
                total={stages.length}
                onChange={(next) => updateStage(idx, next)}
                onRemove={() => removeStage(idx)}
                onMove={(dir) => moveStage(idx, dir)}
              />
            ))}

          <div className="flex justify-end">
            <Button type="button" onClick={() => setStep("review")} disabled={stages.length === 0}>
              Continue to reviewers →
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <Card className="space-y-5 p-6">
          {lowConfidenceStages.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">
                {lowConfidenceStages.length} stage{lowConfidenceStages.length === 1 ? "" : "s"} had lower AI
                confidence and would benefit from a closer look before publish:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {lowConfidenceStages.map((s) => (
                  <li key={s.id}>
                    <span className="font-medium">{s.name || "Untitled stage"}</span>
                    {s.__rationale ? ` — ${s.__rationale}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <Label>Reviewer roles (comma separated)</Label>
            <TextInput
              value={reviewerRoles}
              onChange={(e) => setReviewerRoles(e.target.value)}
              placeholder="e.g. legal_counsel, deal_desk, finance"
            />
            <p className="mt-1 text-xs text-neutral-400">
              Publish is blocked until every reviewer here has marked this version reviewed.
            </p>
          </div>

          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <p className="font-medium">{name || "Untitled journey"}</p>
            <p className="text-neutral-500">{productType || "no product type set"}</p>
            <p className="mt-2 font-mono text-xs text-neutral-400">
              {stages.length} stage{stages.length === 1 ? "" : "s"} · this will be written as a new, immutable version
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSubmitForReview} disabled={saving}>
              {saving ? "Submitting…" : "Submit for review"}
            </Button>
          </div>
        </Card>
      )}

      {aiModalOpen && <AIGenerateModal onClose={() => setAiModalOpen(false)} onGenerated={handleAiGenerated} />}
    </div>
  );
}
