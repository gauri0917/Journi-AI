import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserName, currentUserRole } from "@/lib/current-user";

// Marks one reviewer's row as reviewed. reviewedBy is no longer
// client-supplied — it's derived from the logged-in guest identity, and
// that guest's declared role MUST match this review's reviewerRole or the
// request is rejected (403). This is what makes "only Legal can approve the
// Legal review step" a real, testable guarantee instead of a UI label that
// any name typed into a box could bypass.
//
// One comment field per reviewer, no thread, matches spec: this route only
// ever sets status pending -> reviewed. There is no "un-review" action.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
  try {
    const { id, reviewId } = await params;

    const reviewerName = await currentUserName();
    const reviewerRole = await currentUserRole();
    if (!reviewerRole) {
      return NextResponse.json(
        { error: "no role set for your login — add one at /login to review anything" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    if (body?.comment !== undefined && typeof body.comment !== "string") {
      return NextResponse.json({ error: "comment must be a string if present" }, { status: 400 });
    }

    const review = await prisma.journeyReview.findUnique({ where: { id: reviewId } });
    if (!review || review.journeyId !== id) {
      return NextResponse.json({ error: "review not found" }, { status: 404 });
    }
    if (review.status === "reviewed") {
      return NextResponse.json({ error: "this reviewer has already submitted their review" }, { status: 409 });
    }
    if (reviewerRole.toLowerCase() !== review.reviewerRole.toLowerCase()) {
      return NextResponse.json(
        {
          error: `only someone logged in as "${review.reviewerRole}" can mark this reviewed — you're logged in as "${reviewerRole}"`,
        },
        { status: 403 }
      );
    }

    const journey = await prisma.journey.findUnique({ where: { id: id } });
    if (!journey || journey.status !== "in_review") {
      return NextResponse.json({ error: "journey is not currently in_review" }, { status: 409 });
    }

    const updated = await prisma.journeyReview.update({
      where: { id: reviewId },
      data: {
        status: "reviewed",
        reviewedBy: reviewerName,
        comment: typeof body?.comment === "string" ? body.comment.trim() : null,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({ review: updated });
  } catch (err) {
    console.error("review update failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "review update failed", details: [message] }, { status: 500 });
  }
}
