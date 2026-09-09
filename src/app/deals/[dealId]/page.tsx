import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUserName, currentUserRole } from "@/lib/current-user";
import { DealView } from "@/components/deals/DealView";
import type { SchemaSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DealDetailPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { journey: true, journeyVersion: true },
  });
  if (!deal) notFound();

  const schema = deal.journeyVersion.schemaSnapshot as unknown as SchemaSnapshot;

  return (
    <div>
      <Link href={`/journeys/${deal.journeyId}`} className="text-sm text-neutral-500 hover:text-route-600">
        ← back to journey
      </Link>
      <div className="mb-2 mt-2">
        <h1 className="text-2xl font-semibold tracking-tight">{deal.name}</h1>
        <p className="text-sm text-neutral-500">
          Deal on <span className="font-medium text-ink">{deal.journey.name}</span> · started by {deal.createdBy}
        </p>
      </div>
      <DealView
        deal={{
          id: deal.id,
          name: deal.name,
          status: deal.status,
          currentStageId: deal.currentStageId,
          fieldValues: deal.fieldValues as Record<string, Record<string, unknown>>,
          stageApprovals: deal.stageApprovals as Record<string, { approvedBy: string; approvedAt: string; comment?: string }>,
        }}
        schema={schema}
        actorName={await currentUserName()}
        actorRole={await currentUserRole()}
      />
    </div>
  );
}
