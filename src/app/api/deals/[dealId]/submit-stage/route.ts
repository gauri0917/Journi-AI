import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUserRole } from "@/lib/current-user";
import { roleMatches, stageRequiresApproval, missingRequiredFields, type StageFieldValues } from "@/lib/deal-run";
import type { SchemaSnapshot } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const body = await req.json().catch(() => null);
  const values: StageFieldValues = body?.fieldValues && typeof body.fieldValues === "object" ? body.fieldValues : {};

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

  const actorRole = await currentUserRole();
  if (!roleMatches(actorRole, stage.owner_role)) {
    return NextResponse.json(
      { error: `only profile type "${stage.owner_role}" can fill in this stage — you're logged in as "${actorRole ?? "no profile type set"}"` },
      { status: 403 }
    );
  }

  const existingValues = (deal.fieldValues as Record<string, StageFieldValues>) ?? {};
  if (existingValues[stage.id]) {
    return NextResponse.json({ error: "this stage's fields were already submitted" }, { status: 409 });
  }

  const missing = missingRequiredFields(stage, values);
  if (missing.length > 0) {
    return NextResponse.json({ error: `missing required field(s): ${missing.join(", ")}` }, { status: 400 });
  }

  const updatedValues = { ...existingValues, [stage.id]: values };
  const needsApproval = stageRequiresApproval(stage, values);

  let nextStageId: string | null = deal.currentStageId;
  let nextStatus: "in_progress" | "completed" = "in_progress";
  if (!needsApproval) {
    const next = stages[stageIndex + 1];
    nextStageId = next ? next.id : null;
    nextStatus = next ? "in_progress" : "completed";
  }

  const updated = await prisma.deal.update({
    where: { id: deal.id },
    data: {
      fieldValues: updatedValues as Prisma.InputJsonValue,
      currentStageId: nextStageId,
      status: nextStatus,
    },
  });

  return NextResponse.json({ deal: updated });
}
