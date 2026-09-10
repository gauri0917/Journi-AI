#!/usr/bin/env bash
# Overwrites the 9 files for: (1) draft + in_review journey visibility
# limited to creator/assigned reviewers, and (2) the dedicated
# Draft-with-AI intake step.
# Run this from your project root (same folder as package.json).
set -euo pipefail

mkdir -p "$(dirname "src/lib/journey-access.ts")"
cat > "src/lib/journey-access.ts" << 'JOURNI_EOF'
import { roleMatches } from "@/lib/deal-run";

type JourneyLike = { status: string; createdBy: string };
type ReviewLike = { reviewerRole: string };

// Single source of truth for "who can see this journey" — used by the
// dashboard listing, the list API, the detail page, and the single-journey
// API, so the rule can't drift between them.
//
// - draft: creator only.
// - in_review: creator, or anyone whose profile role matches one of the
//   assigned reviewer roles (so the review workflow keeps working) — NOT
//   just anyone, since "reviewed but not released" is still private to the
//   creator and the specific people reviewing it.
// - published / archived: visible to everyone (the org-wide record).
export function canViewJourney(
  journey: JourneyLike,
  reviews: ReviewLike[],
  viewerName: string,
  viewerRole: string | null
): boolean {
  if (journey.status === "published" || journey.status === "archived") return true;
  if (journey.createdBy === viewerName) return true;
  if (journey.status === "in_review") {
    return reviews.some((r) => roleMatches(viewerRole, r.reviewerRole));
  }
  return false;
}
JOURNI_EOF

mkdir -p "$(dirname "src/app/api/journeys/route.ts")"
cat > "src/app/api/journeys/route.ts" << 'JOURNI_EOF'
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserName, currentUserRole } from "@/lib/current-user";
import { canViewJourney } from "@/lib/journey-access";

export async function GET() {
  try {
    const journeys = await prisma.journey.findMany({
      orderBy: { updatedAt: "desc" },
      include: { currentVersion: true, reviews: true },
    });
    // Drafts and in_review are only visible to their creator (and, for
    // in_review, whoever is actually assigned to review it) — published and
    // archived stay visible to everyone as the org-wide record.
    const me = await currentUserName();
    const myRole = await currentUserRole();
    const visible = journeys.filter((j) => canViewJourney(j, j.reviews, me, myRole));
    return NextResponse.json({ journeys: visible });
  } catch (err) {
    console.error("GET /api/journeys failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "failed to list journeys", details: [message] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.name !== "string" || body.name.trim() === "") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (typeof body.productType !== "string" || body.productType.trim() === "") {
      return NextResponse.json({ error: "productType is required" }, { status: 400 });
    }

    const journey = await prisma.journey.create({
      data: {
        name: body.name.trim(),
        description: typeof body.description === "string" ? body.description.trim() : null,
        productType: body.productType.trim(),
        status: "draft",
        createdBy: await currentUserName(),
      },
    });

    return NextResponse.json({ journey }, { status: 201 });
  } catch (err) {
    console.error("POST /api/journeys failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "failed to create journey", details: [message] }, { status: 500 });
  }
}
JOURNI_EOF

mkdir -p "$(dirname "src/app/api/journeys/[id]/route.ts")"
cat > "src/app/api/journeys/[id]/route.ts" << 'JOURNI_EOF'
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserName, currentUserRole } from "@/lib/current-user";
import { canViewJourney } from "@/lib/journey-access";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const journey = await prisma.journey.findUnique({
      where: { id: id },
      include: {
        currentVersion: true,
        versions: { orderBy: { versionNumber: "desc" } },
        reviews: true,
      },
    });
    if (!journey) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    // Drafts and in_review are private to their creator (and, for
    // in_review, whoever is assigned to review it) — respond as not-found
    // for anyone else so the API doesn't leak what the pages already hide.
    const me = await currentUserName();
    if (!canViewJourney(journey, journey.reviews, me, await currentUserRole())) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ journey });
  } catch (err) {
    console.error("GET /api/journeys/[id] failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "failed to load journey", details: [message] }, { status: 500 });
  }
}

// Edits journey basics (name/description/productType) only — the schema
// itself is versioned separately via submit-review. Allowed while draft or
// in_review (an owner may tweak basics while waiting on reviewers); locked
// once published or archived, same as the schema edit path.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

    const journey = await prisma.journey.findUnique({ where: { id: id } });
    if (!journey) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (journey.status === "draft" && journey.createdBy !== (await currentUserName())) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (journey.status === "published" || journey.status === "archived") {
      return NextResponse.json(
        { error: `cannot edit basics from status "${journey.status}"` },
        { status: 409 }
      );
    }

    const data: { name?: string; description?: string | null; productType?: string } = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim() === "") {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      data.name = body.name.trim();
    }
    if (body.description !== undefined) {
      data.description = typeof body.description === "string" ? body.description.trim() : null;
    }
    if (body.productType !== undefined) {
      if (typeof body.productType !== "string" || body.productType.trim() === "") {
        return NextResponse.json({ error: "productType must be a non-empty string" }, { status: 400 });
      }
      data.productType = body.productType.trim();
    }

    const updated = await prisma.journey.update({ where: { id: id }, data });
    return NextResponse.json({ journey: updated });
  } catch (err) {
    console.error("PATCH /api/journeys/[id] failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "failed to update journey", details: [message] }, { status: 500 });
  }
}
JOURNI_EOF

mkdir -p "$(dirname "src/app/api/journeys/[id]/submit-review/route.ts")"
cat > "src/app/api/journeys/[id]/submit-review/route.ts" << 'JOURNI_EOF'
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
  if (journey.status === "draft" && journey.createdBy !== (await currentUserName())) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
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
  const actor = await currentUserName();

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
JOURNI_EOF

mkdir -p "$(dirname "src/app/journeys/[id]/page.tsx")"
cat > "src/app/journeys/[id]/page.tsx" << 'JOURNI_EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { StatusBadge, Card } from "@/components/ui";
import { PublishButton, ArchiveButton } from "@/components/JourneyActions";
import { StartDealForm } from "@/components/deals/StartDealForm";
import { currentUserName, currentUserRole } from "@/lib/current-user";
import { canViewJourney } from "@/lib/journey-access";

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

  const myName = await currentUserName();
  const isOwner = journey.createdBy === myName;
  // Drafts and in_review journeys are private to their creator (and, for
  // in_review, whoever is actually assigned to review it). Treat it as
  // not-found for anyone else rather than a 403, so its existence isn't
  // revealed either.
  if (!canViewJourney(journey, journey.reviews, myName, await currentUserRole())) notFound();
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
JOURNI_EOF

mkdir -p "$(dirname "src/app/journeys/[id]/edit/page.tsx")"
cat > "src/app/journeys/[id]/edit/page.tsx" << 'JOURNI_EOF'
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { BuilderWizard } from "@/components/builder/BuilderWizard";
import { currentUserName } from "@/lib/current-user";
import type { SchemaSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const journey = await prisma.journey.findUnique({
    where: { id: id },
    include: { currentVersion: true },
  });
  if (!journey) notFound();
  // Drafts are private to their creator — nobody else should even be able
  // to reach the editor for one via a direct URL.
  if (journey.status === "draft" && journey.createdBy !== (await currentUserName())) notFound();
  if (journey.status === "published" || journey.status === "archived") {
    redirect(`/journeys/${journey.id}`);
  }

  const schema = journey.currentVersion?.schemaSnapshot as unknown as SchemaSnapshot | undefined;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Edit journey</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Editing writes a new version on submit — the previous version is kept, never overwritten.
      </p>
      <BuilderWizard
        journeyId={journey.id}
        initialBasics={{
          name: journey.name,
          description: journey.description ?? "",
          productType: journey.productType,
        }}
        initialStages={schema?.stages ?? []}
        startStep="stages"
      />
    </div>
  );
}
JOURNI_EOF

mkdir -p "$(dirname "src/app/page.tsx")"
cat > "src/app/page.tsx" << 'JOURNI_EOF'
import { prisma } from "@/lib/db";
import { JourneysTabs } from "@/components/JourneysTabs";
import { currentUserName, currentUserRole } from "@/lib/current-user";
import { roleMatches, stageRequiresApproval } from "@/lib/deal-run";
import { canViewJourney } from "@/lib/journey-access";
import type { SchemaSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const journeys = await prisma.journey.findMany({
    orderBy: { updatedAt: "desc" },
    include: { currentVersion: true, reviews: true },
  });

  const myName = await currentUserName();
  const myRole = await currentUserRole();

  // Drafts and in_review journeys are private to their creator (and, for
  // in_review, to whoever is actually assigned to review it) — published
  // and archived stay visible to everyone as the org-wide record. Filtering
  // here, before anything below reads `journeys`, keeps other people's
  // drafts/reviews out of both the tab lists and Action needed.
  const visibleJourneys = journeys.filter((j) => canViewJourney(j, j.reviews, myName, myRole));

  // Action needed = three distinct reasons, each surfaced with why:
  //   1. A pending review assigned to the profile type you logged in as
  //      (only computable if you gave one at login — see /login).
  //   2. Your own journey still sitting in draft, never submitted.
  //   3. A live deal whose current stage is waiting on your profile type,
  //      either to fill in the stage (owner_role) or approve it
  //      (approver_role) — see src/lib/deal-run.ts for the matching logic.
  // All three are real "this needs YOU specifically" states, as opposed to
  // "Live"/"Drafts" which show everything regardless of who it's waiting on.
  const actionNeeded = visibleJourneys
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

  const rows = visibleJourneys.map(toRow);
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
JOURNI_EOF

mkdir -p "$(dirname "src/components/builder/AIGenerateModal.tsx")"
cat > "src/components/builder/AIGenerateModal.tsx" << 'JOURNI_EOF'
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
JOURNI_EOF

mkdir -p "$(dirname "src/components/builder/BuilderWizard.tsx")"
cat > "src/components/builder/BuilderWizard.tsx" << 'JOURNI_EOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Label, TextInput, TextArea, Card, ErrorList } from "@/components/ui";
import { StageCard } from "./StageCard";
import { AIGenerateModal } from "./AIGenerateModal";
import { ClientStage, blankStage, lowestConfidence, markAsAi, newStageId, stripAiMarkers } from "./types";
import { validateSchemaSnapshot, type StageConfidence } from "@/lib/validation";

// "ai-intake" is the dedicated Draft-with-AI entry: basic details + the
// process description/document, in one step, before any stages exist. It's
// only ever the *first* step of a session — once stages exist (generated or
// manual), the flow is the same "stages" → "review" for everyone.
type Step = "ai-intake" | "basics" | "stages" | "review";

export function BuilderWizard({
  journeyId: initialJourneyId,
  initialBasics,
  initialStages,
  startStep,
  autoOpenAi,
}: {
  journeyId?: string;
  initialBasics?: { name: string; description: string; productType: string };
  initialStages?: ClientStage[];
  startStep?: Step;
  autoOpenAi?: boolean;
}) {
  const router = useRouter();
  // Defaulting from the autoOpenAi prop lets the dashboard's "Draft with AI"
  // entry point (/journeys/new?ai=1) land straight on the dedicated intake
  // step instead of making the person click the button again after arriving.
  const [step, setStep] = useState<Step>(startStep ?? (autoOpenAi ? "ai-intake" : "basics"));
  const [journeyId, setJourneyId] = useState<string | undefined>(initialJourneyId);
  const [name, setName] = useState(initialBasics?.name ?? "");
  const [description, setDescription] = useState(initialBasics?.description ?? "");
  const [productType, setProductType] = useState(initialBasics?.productType ?? "");
  const [stages, setStages] = useState<ClientStage[]>(initialStages ?? []);
  const [reviewerRoles, setReviewerRoles] = useState<string>("");
  const [aiSourceDescription, setAiSourceDescription] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const basicsValid = name.trim() !== "" && productType.trim() !== "";

  function updateStage(idx: number, next: ClientStage) {
    const copy = [...stages];
    copy[idx] = next;
    setStages(copy);
  }

  function addStage() {
    setStages([...stages, blankStage(stages.length)]);
  }

  function removeStage(idx: number) {
    setStages(stages.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })));
  }

  function moveStage(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const copy = [...stages];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setStages(copy.map((s, i) => ({ ...s, order: i })));
  }

  function handleAiGenerated(schema: { stages: any[] }, stageConfidence: StageConfidence, sourceDescription: string) {
    setStages(markAsAi(schema as any, stageConfidence));
    setAiSourceDescription(sourceDescription);
    setStep("stages");
  }

  const lowConfidence = lowestConfidence(stages);
  const lowConfidenceStages = stages.filter((s) => typeof s.__confidence === "number" && s.__confidence < 0.7);

  async function handleSubmitForReview() {
    setErrors([]);
    if (!basicsValid) {
      setErrors(["Journey name and product type are required."]);
      setStep("basics");
      return;
    }
    const roles = reviewerRoles.split(",").map((r) => r.trim()).filter(Boolean);
    if (roles.length === 0) {
      setErrors(["At least one reviewer role is required to submit for review."]);
      return;
    }

    const schemaSnapshot = stripAiMarkers(stages);
    const localCheck = validateSchemaSnapshot(schemaSnapshot);
    if (!localCheck.valid) {
      setErrors(localCheck.errors);
      setStep("stages");
      return;
    }

    setSaving(true);
    try {
      let id = journeyId;
      const basicsPayload = { name: name.trim(), description: description.trim(), productType: productType.trim() };

      if (!id) {
        const res = await fetch("/api/journeys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(basicsPayload),
        });
        const body = await res.json();
        if (!res.ok) {
          setErrors([body.error ?? "Could not create journey"]);
          return;
        }
        id = body.journey.id;
        setJourneyId(id);
      } else {
        await fetch(`/api/journeys/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(basicsPayload),
        });
      }

      const res2 = await fetch(`/api/journeys/${id}/submit-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaSnapshot, reviewerRoles: roles, sourceDescription: aiSourceDescription }),
      });
      const body2 = await res2.json();
      if (!res2.ok) {
        setErrors(body2.details ?? [body2.error ?? "Could not submit for review"]);
        return;
      }
      router.push(`/journeys/${id}`);
    } catch (err) {
      console.error("Submit-for-review request failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setErrors([`Request failed: ${message}`]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {step !== "ai-intake" && (
        <div className="mb-6 flex gap-1 rounded-lg border border-neutral-200 bg-white p-1 text-sm">
          {(["basics", "stages", "review"] as Step[]).map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`flex-1 rounded-md px-3 py-2 font-medium capitalize transition-colors ${
                step === s ? "bg-route-600 text-white" : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {s === "review" ? "Reviewers & submit" : s}
            </button>
          ))}
        </div>
      )}

      <ErrorList errors={errors} />

      {step === "ai-intake" && (
        <Card className="space-y-5 p-6">
          <div>
            <h2 className="text-base font-semibold text-ink">Draft with AI</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Start with the basics, then paste or upload a process description — AI drafts the stages, fields,
              approvals, and required documents from it. You'll review and edit everything on the next step.
            </p>
          </div>
          <div>
            <Label>Journey name</Label>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mid-Market SaaS Onboarding" />
          </div>
          <div>
            <Label>Description</Label>
            <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this journey is for, and who it's for." />
          </div>
          <div>
            <Label>Product type</Label>
            <TextInput value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="e.g. SaaS Subscription" />
          </div>

          {basicsValid ? (
            <div className="border-t border-neutral-200 pt-5">
              <AIGenerateModal variant="inline" onGenerated={handleAiGenerated} />
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-500">
              Fill in the journey name and product type above to continue.
            </p>
          )}

          <div>
            <button
              type="button"
              onClick={() => setStep("basics")}
              className="text-xs font-medium text-neutral-400 underline hover:text-ink"
            >
              Build manually instead
            </button>
          </div>
        </Card>
      )}

      {step === "basics" && (
        <Card className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-4 rounded-md border border-dashed border-route-300 bg-route-50/50 p-4">
            <div>
              <p className="text-sm font-medium text-ink">Have a process description already?</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Paste it (or upload a .pdf/.docx/.txt) and skip straight to a drafted set of stages — you can still
                fill in the name and product type after.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setStep("ai-intake")} className="shrink-0">
              ✦ Draft with AI
            </Button>
          </div>
          <div>
            <Label>Journey name</Label>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mid-Market SaaS Onboarding" />
          </div>
          <div>
            <Label>Description</Label>
            <TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this journey is for, and who it's for." />
          </div>
          <div>
            <Label>Product type</Label>
            <TextInput value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="e.g. SaaS Subscription" />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setStep("stages")} disabled={!basicsValid}>
              Continue to stages →
            </Button>
          </div>
        </Card>
      )}

      {step === "stages" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">
              {stages.length} stage{stages.length === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={addStage}>
                + Add stage
              </Button>
            </div>
          </div>

          {stages.length === 0 && (
            <Card className="px-6 py-10 text-center text-sm text-neutral-500">
              No stages yet. Add one manually, or draft the whole journey from a process description.
            </Card>
          )}

          {stages
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((stage, idx) => (
              <StageCard
                key={stage.id}
                stage={stage}
                index={idx}
                total={stages.length}
                onChange={(next) => updateStage(idx, next)}
                onRemove={() => removeStage(idx)}
                onMove={(dir) => moveStage(idx, dir)}
              />
            ))}

          <div className="flex justify-end">
            <Button type="button" onClick={() => setStep("review")} disabled={stages.length === 0}>
              Continue to reviewers →
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <Card className="space-y-5 p-6">
          {lowConfidenceStages.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">
                {lowConfidenceStages.length} stage{lowConfidenceStages.length === 1 ? "" : "s"} had lower AI
                confidence and would benefit from a closer look before publish:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {lowConfidenceStages.map((s) => (
                  <li key={s.id}>
                    <span className="font-medium">{s.name || "Untitled stage"}</span>
                    {s.__rationale ? ` — ${s.__rationale}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <Label>Reviewer roles (comma separated)</Label>
            <TextInput
              value={reviewerRoles}
              onChange={(e) => setReviewerRoles(e.target.value)}
              placeholder="e.g. legal_counsel, deal_desk, finance"
            />
            <p className="mt-1 text-xs text-neutral-400">
              Publish is blocked until every reviewer here has marked this version reviewed.
            </p>
          </div>

          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <p className="font-medium">{name || "Untitled journey"}</p>
            <p className="text-neutral-500">{productType || "no product type set"}</p>
            <p className="mt-2 font-mono text-xs text-neutral-400">
              {stages.length} stage{stages.length === 1 ? "" : "s"} · this will be written as a new, immutable version
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSubmitForReview} disabled={saving}>
              {saving ? "Submitting…" : "Submit for review"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
JOURNI_EOF

echo "Done. Now run: npx tsc --noEmit"
