import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateSchemaSnapshot } from "@/lib/validation";
import { currentUserName } from "@/lib/current-user";

// Submits the builder's in-progress schema for review.
//
// Design note: journey_reviews has no version_id (not in the spec'd schema),
// so it can only represent "the reviewers for this journey's current cycle."
// Re-submitting after edits therefore replaces the review set rather than
// appending to it — journey_versions stays append-only (a new row every
// time), but journey_reviews reflects only the latest cycle.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.schemaSnapshot !== "object") {
    return NextResponse.json({ error: "schemaSnapshot is required" }, { status: 400 });
  }
  const reviewerRoles: unknown = body.reviewerRoles;
  if (!Array.isArray(reviewerRoles) || reviewerRoles.length === 0 || !reviewerRoles.every((r) => typeof r === "string" && r.trim())) {
    return NextResponse.json({ error: "reviewerRoles must be a non-empty string array" }, { status: 400 });
  }

  const journey = await prisma.journey.findUnique({ where: { id: id } });
  if (!journey) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (journey.status === "published" || journey.status === "archived") {
    return NextResponse.json(
      { error: `cannot submit for review from status "${journey.status}"` },
      { status: 409 }
    );
  }

  const result = validateSchemaSnapshot(body.schemaSnapshot);
  if (!result.valid) {
    return NextResponse.json({ error: "schema validation failed", details: result.errors }, { status: 422 });
  }

  const sourceDescription: string | undefined =
    typeof body.sourceDescription === "string" && body.sourceDescription.trim()
      ? body.sourceDescription.trim()
      : undefined;

  const lastVersion = await prisma.journeyVersion.findFirst({
    where: { journeyId: journey.id },
    orderBy: { versionNumber: "desc" },
  });
  const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1;
  const actor = currentUserName();

  const [version] = await prisma.$transaction([
    prisma.journeyVersion.create({
      data: {
        journeyId: journey.id,
        versionNumber: nextVersionNumber,
        schemaSnapshot: result.data as any,
        publishedBy: actor,
        sourceDescription,
      },
    }),
    prisma.journeyReview.deleteMany({ where: { journeyId: journey.id } }),
  ]);

  await prisma.journeyReview.createMany({
    data: reviewerRoles.map((role: string) => ({
      journeyId: journey.id,
      reviewerRole: role.trim(),
      status: "pending" as const,
    })),
  });

  const updated = await prisma.journey.update({
    where: { id: journey.id },
    data: { status: "in_review", currentVersionId: version.id },
    include: { currentVersion: true, reviews: true },
  });

  return NextResponse.json({ journey: updated });
  } catch (err) {
    console.error("submit-review failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "submit-review failed", details: [message] }, { status: 500 });
  }
}
