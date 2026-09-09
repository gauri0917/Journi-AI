import { prisma } from "@/lib/db";
import { JourneysTabs } from "@/components/JourneysTabs";
import { currentUserName, currentUserRole } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const journeys = await prisma.journey.findMany({
    orderBy: { updatedAt: "desc" },
    include: { currentVersion: true, reviews: true },
  });

  const myName = currentUserName();
  const myRole = currentUserRole();

  // Action needed = two distinct reasons, both surfaced with why:
  //   1. A pending review assigned to a role you logged in as (only
  //      computable if you gave a role at login — see /login).
  //   2. Your own journey still sitting in draft, never submitted for
  //      review — i.e. it hasn't been validated/moved forward yet and
  //      nothing happens to it until you act.
  // Both are real "this needs YOU specifically" states, as opposed to
  // "Live"/"Drafts" which just show everything regardless of who it's
  // waiting on.
  const actionNeeded = journeys
    .map((j: (typeof journeys)[number]) => {
      const reasons: string[] = [];

      if (myRole && j.status === "in_review") {
        const myPendingReview = j.reviews.find(
          (r: (typeof j.reviews)[number]) =>
            r.status === "pending" && r.reviewerRole.trim().toLowerCase() === myRole.trim().toLowerCase()
        );
        if (myPendingReview) reasons.push(`Your review is needed (as ${myPendingReview.reviewerRole})`);
      }

      if (j.createdBy === myName && j.status === "draft") {
        reasons.push("Draft not yet submitted for review");
      }

      return { journey: j, reasons };
    })
    .filter((x: { reasons: string[] }) => x.reasons.length > 0);

  // Shape down to exactly what the client tabs component needs — keeps the
  // server/client boundary explicit rather than passing raw Prisma rows
  // (which include fields like createdBy that aren't rendered here) across it.
  const toRow = (j: (typeof journeys)[number]) => ({
    id: j.id,
    name: j.name,
    status: j.status,
    productType: j.productType,
    currentVersion: j.currentVersion
      ? { versionNumber: j.currentVersion.versionNumber, schemaSnapshot: j.currentVersion.schemaSnapshot }
      : null,
    pendingReviewCount: j.reviews.filter((r: (typeof j.reviews)[number]) => r.status === "pending").length,
  });

  const rows = journeys.map(toRow);
  const actionRows = actionNeeded.map((x: { journey: (typeof journeys)[number]; reasons: string[] }) => ({
    ...toRow(x.journey),
    reasons: x.reasons,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Journeys</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Configure a deal journey yourself — no CRM admin ticket required.
        </p>
      </div>
      <JourneysTabs journeys={rows} actionNeeded={actionRows} />
    </div>
  );
}
