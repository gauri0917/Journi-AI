"use client";

import { useState } from "react";
import { Button, Label, TextArea, ErrorList } from "@/components/ui";
import type { SchemaSnapshot } from "@/lib/types";
import type { StageConfidence } from "@/lib/validation";

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function AIGenerateModal({
  onClose,
  onGenerated,
  variant = "modal",
}: {
  onClose?: () => void;
  onGenerated: (schema: SchemaSnapshot, stageConfidence: StageConfidence, sourceDescription: string) => void;
  // "modal" (default) keeps the original popup-over-the-page behavior.
  // "inline" renders the same form/generate/clarification logic as a plain
  // block with no overlay, header, or close button — used to embed this as
  // a step of the wizard (the dedicated "Draft with AI" flow) rather than a
  // popup shown on top of the basics/stages steps.
  variant?: "modal" | "inline";
}) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  // When the agent asks instead of guessing, we show the question and let
  // the user fold their answer back into the description before retrying —
  // same endpoint, no separate "clarification" API surface needed.
  const [clarification, setClarification] = useState<{ question: string; reason: string } | null>(null);
  const [answer, setAnswer] = useState("");

  const words = wordCount(description);
  const wordsValid = words >= 100 && words <= 1500;

  async function generate(effectiveDescription: string) {
    setLoading(true);
    setErrors([]);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: effectiveDescription }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErrors(body.details ?? [body.error ?? "Generation failed"]);
        return;
      }
      if (body.needsClarification) {
        setClarification({ question: body.question, reason: body.reason });
        return;
      }
      onGenerated(body.schemaSnapshot as SchemaSnapshot, (body.stageConfidence ?? {}) as StageConfidence, body.description as string);
    } catch (err) {
      console.error("AI generation request failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setErrors([`Request failed: ${message}`]);
    } finally {
      setLoading(false);
    }
  }

  function submitAnswer() {
    if (!answer.trim()) return;
    const combined = `${description}\n\nAdditional detail: ${answer.trim()}`;
    setDescription(combined);
    setClarification(null);
    setAnswer("");
    generate(combined);
  }

  // File upload is pure text extraction (see api/ai/extract-document) — no
  // AI call happens here. It just fills the same textarea a person would
  // otherwise type into; everything after this point is identical to the
  // manual-paste flow, including the 100-1500 word gate below.
  async function handleFileUpload(file: File) {
    setExtracting(true);
    setErrors([]);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ai/extract-document", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setErrors([body.error ?? "Could not extract text from that file."]);
        return;
      }
      setDescription(body.text as string);
    } catch (err) {
      console.error("Document extraction request failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setErrors([`Request failed: ${message}`]);
    } finally {
      setExtracting(false);
    }
  }

  const body = (
    <>
        {clarification ? (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">Before I draft this, one thing is unclear:</p>
              <p className="mt-1 text-sm text-amber-900">{clarification.question}</p>
              <p className="mt-2 text-xs text-amber-700">{clarification.reason}</p>
            </div>
            <div>
              <Label>Your answer</Label>
              <TextArea
                rows={4}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Add the missing detail here — it'll be appended to your description and redrafted."
              />
            </div>
            <ErrorList errors={errors} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setClarification(null)}>
                Back to description
              </Button>
              <Button type="button" onClick={submitAnswer} disabled={!answer.trim() || loading}>
                {loading ? "Redrafting…" : "Redraft with this detail"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-600 hover:text-ink">
                <span>{extracting ? "Extracting…" : "Upload a .pdf, .docx, or .txt to fill this in"}</span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  disabled={extracting}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <Label>Process description</Label>
            <TextArea
              rows={10}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. We onboard new mid-market SaaS accounts. The sales rep collects company info and desired plan..."
            />
            <p className={`mt-1 text-xs ${wordsValid ? "text-neutral-400" : "text-amber-600"}`}>
              {words} words (needs 100–1500)
            </p>

            <ErrorList errors={errors} />

            <div className="mt-4 flex justify-end gap-2">
              {onClose && (
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              )}
              <Button type="button" onClick={() => generate(description)} disabled={!wordsValid || loading}>
                {loading ? "Generating…" : "Generate draft"}
              </Button>
            </div>
          </>
        )}
    </>
  );

  if (variant === "inline") {
    return <div>{body}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Draft with AI</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Paste a plain-text description of the product or process. AI drafts stages, fields,
              approvals, and required documents — every value stays flagged until you review it.
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
