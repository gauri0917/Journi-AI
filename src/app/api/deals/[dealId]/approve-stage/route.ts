import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUserName } from "@/lib/current-user";
import { namesMatch, stageRequiresApproval, type StageFieldValues } from "@/lib/deal-run";
import type { SchemaSnapshot } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const body = await req.json().catch(() => null);
  const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, 500) : undefined;

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { journeyVersion: true } });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (deal.status === "completed" || !deal.currentStageId) {
    return NextResponse.json({ error: "this deal is already completed" }, { status: 409 });
  }

  const schema = deal.journeyVersion.schemaSnapshot as unknown as SchemaSnapshot;
  const stages = [...schema.stages].sort((a, b) => a.order - b.order);
  const stageIndex = stages.findIndex((s) => s.id === deal.currentStageId);
  const stage = stages[stageIndex];
  if (!stage) return NextResponse.json({ error: "current stage not found in schema" }, { status: 500 });

  const fieldValues = (deal.fieldValues as Record<string, StageFieldValues>) ?? {};
  const stageValues = fieldValues[stage.id];
  if (!stageValues) {
    return NextResponse.json({ error: "this stage's fields haven't been submitted yet" }, { status: 409 });
  }
  if (!stageRequiresApproval(stage, stageValues)) {
    return NextResponse.json({ error: "this stage doesn't require approval" }, { status: 409 });
  }

  const approvals = (deal.stageApprovals as Record<string, unknown>) ?? {};
  if (approvals[stage.id]) {
    return NextResponse.json({ error: "this stage was already approved" }, { status: 409 });
  }

  const actor = await currentUserName();
  if (!namesMatch(actor, stage.approver_role)) {
    return NextResponse.json(
      { error: `only "${stage.approver_role}" can approve this stage — you're logged in as "${actor}"` },
      { status: 403 }
    );
  }

  const updatedApprovals = {
    ...approvals,
    [stage.id]: { approvedBy: actor, approvedAt: new Date().toISOString(), comment },
  };

  const next = stages[stageIndex + 1];
  const nextStageId = next ? next.id : null;
  const nextStatus: "in_progress" | "completed" = next ? "in_progress" : "completed";

  const updated = await prisma.deal.update({
    where: { id: deal.id },
    data: {
      stageApprovals: updatedApprovals as Prisma.InputJsonValue,
      currentStageId: nextStageId,
      status: nextStatus,
    },
  });

  return NextResponse.json({ deal: updated });
}
