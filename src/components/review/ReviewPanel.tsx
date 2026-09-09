"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Label, TextArea, StatusBadge, ErrorList } from "@/components/ui";

interface ReviewRow {
  id: string;
  reviewerRole: string;
  status: string;
  reviewedBy: string | null;
  comment: string | null;
  reviewedAt: string | null;
}

interface Viewer {
  name: string;
  role: string | null;
}

function ReviewRowCard({ journeyId, review, viewer }: { journeyId: string; review: ReviewRow; viewer: Viewer }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Mirrors the server-side check in the PATCH route — this is a UI hint so
  // the button isn't offered when it would just get rejected, not the real
  // guardrail. The real one lives server-side and can't be bypassed by
  // editing client state.
  const canReviewThis = viewer.role !== null && viewer.role.toLowerCase() === review.reviewerRole.toLowerCase();

  async function submit() {
    setSaving(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/journeys/${journeyId}/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors([body?.error ?? "Could not submit review"]);
        return;
      }
      router.refresh();
    } catch (err) {
      console.error("Review submission failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setErrors([`Request failed: ${message}`]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{review.reviewerRole}</p>
          {review.status === "reviewed" && (
            <p className="text-xs text-neutral-400">
              by {review.reviewedBy} · {review.reviewedAt ? new Date(review.reviewedAt).toLocaleString() : ""}
            </p>
          )}
        </div>
        <StatusBadge status={review.status} />
      </div>

      {review.status === "reviewed" && review.comment && (
        <p className="mt-2 rounded bg-neutral-50 px-3 py-2 text-sm text-neutral-600">{review.comment}</p>
      )}

      {review.status === "pending" && (
        <div className="mt-3">
          {!canReviewThis ? (
            <p className="text-xs text-neutral-400">
              You're logged in as <span className="font-medium">{viewer.name}</span>
              {viewer.role ? ` (${viewer.role})` : " with no role set"} — only someone logged in as{" "}
              <span className="font-medium">{review.reviewerRole}</span> can mark this reviewed.{" "}
              <a href="/login" className="text-route-600 hover:underline">
                Switch identity
              </a>{" "}
              to test this review.
            </p>
          ) : !expanded ? (
            <Button type="button" variant="secondary" onClick={() => setExpanded(true)}>
              Review as {review.reviewerRole} ({viewer.name})
            </Button>
          ) : (
            <div className="space-y-2">
              <div>
                <Label>Comment (optional)</Label>
                <TextArea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              <ErrorList errors={errors} />
              <div className="flex gap-2">
                <Button type="button" onClick={submit} disabled={saving}>
                  {saving ? "Submitting…" : `Mark reviewed as ${viewer.name}`}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setExpanded(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function ReviewPanel({ journeyId, reviews, viewer }: { journeyId: string; reviews: ReviewRow[]; viewer: Viewer }) {
  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <ReviewRowCard key={r.id} journeyId={journeyId} review={r} viewer={viewer} />
      ))}
    </div>
  );
}
