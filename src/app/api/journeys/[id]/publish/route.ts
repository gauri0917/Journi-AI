import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordDraftExample } from "@/lib/rag";
import { currentUserName } from "@/lib/current-user";
import type { SchemaSnapshot } from "@/lib/types";

// This is the review-gated status transition: in_review -> published.
// It does NOT create a new journey_versions row — that already happened in
// submit-review. This route only flips journeys.status, and only when every
// reviewer has moved off "pending".
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const journey = await prisma.journey.findUnique({
      where: { id: id },
      include: { reviews: true },
    });
    if (!journey) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Restricted to the journey's owner — this action is now tied to who's
    // logged in, not anonymous. No separate "admin" or "publisher" role
    // exists in this prototype, so ownership is the only available line.
    if (journey.createdBy !== currentUserName()) {
      return NextResponse.json(
        { error: `only ${journey.createdBy} (who created this journey) can publish it` },
        { status: 403 }
      );
    }

    if (journey.status !== "in_review") {
      return NextResponse.json(
        { error: `cannot publish from status "${journey.status}" — must be "in_review"` },
        { status: 409 }
      );
    }

    if (!journey.currentVersionId) {
      return NextResponse.json({ error: "journey has no version to publish" }, { status: 409 });
    }

    const pending = journey.reviews.filter((r: (typeof journey.reviews)[number]) => r.status === "pending");
    if (pending.length > 0) {
      return NextResponse.json(
        {
          error: "publish blocked — reviewers still pending",
          pendingReviewers: pending.map((r: (typeof journey.reviews)[number]) => r.reviewerRole),
        },
        { status: 409 }
      );
    }

    const updated = await prisma.journey.update({
      where: { id: journey.id },
      data: { status: "published" },
      include: { currentVersion: true, reviews: true },
    });

    // RAG corpus write — deliberately placed here, not at generation time.
    // This is the quality gate: only a description that produced a draft good
    // enough to survive the FULL review gate becomes a future retrieval
    // example. Awaited so a failure is visible in logs, but never allowed to
    // fail the publish response itself (see try/catch inside recordDraftExample).
    if (updated.currentVersion?.sourceDescription) {
      await recordDraftExample(
        updated.currentVersion.sourceDescription,
        updated.currentVersion.schemaSnapshot as unknown as SchemaSnapshot
      );
    }

    return NextResponse.json({ journey: updated });
  } catch (err) {
    console.error("publish failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "publish failed", details: [message] }, { status: 500 });
  }
}
