import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/ui";
import { ReviewPanel } from "@/components/review/ReviewPanel";
import { currentUserName, currentUserRole } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const journey = await prisma.journey.findUnique({
    where: { id: id },
    include: { reviews: { orderBy: { reviewerRole: "asc" } }, currentVersion: true },
  });
  if (!journey) notFound();

  const viewer = { name: await currentUserName(), role: await currentUserRole() };

  const pending = journey.reviews.filter((r: (typeof journey.reviews)[number]) => r.status === "pending").length;

  return (
    <div>
      <Link href={`/journeys/${journey.id}`} className="text-sm text-neutral-500 hover:text-route-600">
        ← back to journey
      </Link>
      <div className="mb-2 mt-2 flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{journey.name}</h1>
        <StatusBadge status={journey.status} />
      </div>
      <p className="mb-6 text-sm text-neutral-500">
        Reviewing v{journey.currentVersion?.versionNumber}.
        {journey.status === "in_review"
          ? ` Publish is blocked until all ${journey.reviews.length} reviewer${journey.reviews.length === 1 ? "" : "s"} mark this reviewed (${pending} pending).`
          : " This journey is no longer in review."}
      </p>
      <ReviewPanel
        journeyId={journey.id}
        viewer={viewer}
        reviews={journey.reviews.map((r: (typeof journey.reviews)[number]) => ({
          id: r.id,
          reviewerRole: r.reviewerRole,
          status: r.status,
          reviewedBy: r.reviewedBy,
          comment: r.comment,
          reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
        }))}
      />
    </div>
  );
}
