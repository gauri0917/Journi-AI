import { prisma } from "@/lib/db";
import { JourneysTabs } from "@/components/JourneysTabs";
import { currentUserName, currentUserRole } from "@/lib/current-user";
import { roleMatches, stageRequiresApproval } from "@/lib/deal-run";
import type { SchemaSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const journeys = await prisma.journey.findMany({
    orderBy: { updatedAt: "desc" },
    include: { currentVersion: true, reviews: true },
  });

  const myName = await currentUserName();
  const myRole = await currentUserRole();

  // Action needed = three distinct reasons, each surfaced with why:
  //   1. A pending review assigned to the profile type you logged in as
  //      (only computable if you gave one at login — see /login).
  //   2. Your own journey still sitting in draft, never submitted.
  //   3. A live deal whose current stage is waiting on your profile type,
  //      either to fill in the stage (owner_role) or approve it
  //      (approver_role) — see src/lib/deal-run.ts for the matching logic.
  // All three are real "this needs YOU specifically" states, as opposed to
  // "Live"/"Drafts" which show everything regardless of who it's waiting on.
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

  // Live deals whose current stage is waiting on my profile type.
  const dealActionNeeded: { dealId: string; dealName: string; journeyName: string; reason: string }[] = [];
  if (myRole) {
    const inProgressDeals = await prisma.deal.findMany({
      where: { status: "in_progress" },
      include: { journey: true, journeyVersion: true },
    });
    for (const deal of inProgressDeals) {
      if (!deal.currentStageId) continue;
      const schema = deal.journeyVersion.schemaSnapshot as unknown as SchemaSnapshot;
      const stage = schema.stages.find((s) => s.id === deal.currentStageId);
      if (!stage) continue;

      const fieldValues = (deal.fieldValues as Record<string, Record<string, unknown>>) ?? {};
      const stageValues = fieldValues[stage.id];

      if (!stageValues && roleMatches(myRole, stage.owner_role)) {
        dealActionNeeded.push({
          dealId: deal.id,
          dealName: deal.name,
          journeyName: deal.journey.name,
          reason: `Your input is needed at "${stage.name}" (as ${stage.owner_role})`,
        });
      } else if (stageValues && stageRequiresApproval(stage, stageValues)) {
        const approvals = (deal.stageApprovals as Record<string, unknown>) ?? {};
        if (!approvals[stage.id] && roleMatches(myRole, stage.approver_role)) {
          dealActionNeeded.push({
            dealId: deal.id,
            dealName: deal.name,
            journeyName: deal.journey.name,
            reason: `Your approval is needed at "${stage.name}" (as ${stage.approver_role})`,
          });
        }
      }
    }
  }

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
      <JourneysTabs journeys={rows} actionNeeded={actionRows} dealActionNeeded={dealActionNeeded} />
    </div>
  );
}
