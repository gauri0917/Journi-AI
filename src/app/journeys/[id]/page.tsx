import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { StatusBadge, Card } from "@/components/ui";
import { PublishButton, ArchiveButton } from "@/components/JourneyActions";
import { StartDealForm } from "@/components/deals/StartDealForm";
import { currentUserName } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function JourneyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const journey = await prisma.journey.findUnique({
    where: { id: id },
    include: {
      currentVersion: true,
      versions: { orderBy: { versionNumber: "desc" } },
      reviews: true,
      deals: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!journey) notFound();

  const isOwner = journey.createdBy === await currentUserName();
  // Drafts are private to their creator. Treat it as not-found for anyone
  // else rather than a 403, so a draft's existence isn't revealed either.
  if (journey.status === "draft" && !isOwner) notFound();
  const pending = journey.reviews.filter((r: (typeof journey.reviews)[number]) => r.status === "pending");
  const canEdit = journey.status === "draft" || journey.status === "in_review";
  const canPreview = !!journey.currentVersionId;
  const canPublish = journey.status === "in_review" && pending.length === 0;
  const stageCount = Array.isArray((journey.currentVersion?.schemaSnapshot as any)?.stages)
    ? (journey.currentVersion!.schemaSnapshot as any).stages.length
    : 0;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{journey.name}</h1>
            <StatusBadge status={journey.status} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">{journey.productType}</p>
          {journey.description && <p className="mt-2 max-w-2xl text-sm text-neutral-600">{journey.description}</p>}
          <p className="mt-2 font-mono text-xs text-neutral-400">created by {journey.createdBy}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {canEdit && (
            <Link href={`/journeys/${journey.id}/edit`} className="text-sm font-medium text-route-600 hover:underline">
              Edit journey →
            </Link>
          )}
          {canPreview && (
            <Link href={`/journeys/${journey.id}/preview`} className="text-sm font-medium text-route-600 hover:underline">
              Preview intake form →
            </Link>
          )}
          {journey.status === "in_review" && (
            <Link href={`/journeys/${journey.id}/review`} className="text-sm font-medium text-route-600 hover:underline">
              Review panel →
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Current version</h2>
            {journey.currentVersion ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm">v{journey.currentVersion.versionNumber}</p>
                  <p className="text-xs text-neutral-400">
                    {stageCount} stage{stageCount === 1 ? "" : "s"} · published by {journey.currentVersion.publishedBy}
                    {journey.currentVersion.publishedAt ? ` · ${new Date(journey.currentVersion.publishedAt).toLocaleString()}` : ""}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-400">No version yet — this journey has never been submitted for review.</p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Version history</h2>
            {journey.versions.length === 0 ? (
              <p className="text-sm text-neutral-400">No versions yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {journey.versions.map((v: (typeof journey.versions)[number]) => (
                  <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-mono">v{v.versionNumber}</span>
                    <span className="text-neutral-500">
                      {v.publishedBy} · {v.publishedAt ? new Date(v.publishedAt).toLocaleString() : "—"}
                    </span>
                    {v.id === journey.currentVersionId && <span className="text-xs font-semibold text-route-600">current</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-neutral-400">
              Versions are append-only — editing never rewrites history, it always adds a new row.
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Reviewers</h2>
            {journey.reviews.length === 0 ? (
              <p className="text-sm text-neutral-400">No reviewers assigned yet.</p>
            ) : (
              <ul className="space-y-2">
                {journey.reviews.map((r: (typeof journey.reviews)[number]) => (
                  <li key={r.id} className="flex items-center justify-between text-sm">
                    <span>{r.reviewerRole}</span>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Actions</h2>
            {journey.status === "in_review" && (
              <PublishButton journeyId={journey.id} canPublish={canPublish} pendingCount={pending.length} isOwner={isOwner} ownerName={journey.createdBy} />
            )}
            {(journey.status === "published" || journey.status === "in_review" || journey.status === "draft") && (
              <ArchiveButton journeyId={journey.id} isOwner={isOwner} ownerName={journey.createdBy} />
            )}
          </Card>

          {journey.status === "published" && (
            <Card className="space-y-3 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Deals</h2>
              <p className="text-xs text-neutral-500">
                A deal moves a real customer through this journey's stages, live — each stage's owner/approver
                only unlocks for the guest logged in under that exact name.
              </p>
              {journey.deals.length > 0 && (
                <ul className="space-y-1 border-t border-neutral-100 pt-2">
                  {journey.deals.map((d: (typeof journey.deals)[number]) => (
                    <li key={d.id}>
                      <Link href={`/deals/${d.id}`} className="flex items-center justify-between py-1 text-sm hover:text-route-600">
                        <span>{d.name}</span>
                        <span className={`text-xs font-medium ${d.status === "completed" ? "text-emerald-700" : "text-amber-700"}`}>
                          {d.status === "completed" ? "✓ closed" : "in progress"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-neutral-100 pt-3">
                <StartDealForm journeyId={journey.id} />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
