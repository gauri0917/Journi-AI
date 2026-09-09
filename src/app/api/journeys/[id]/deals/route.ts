import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserName } from "@/lib/current-user";
import type { SchemaSnapshot } from "@/lib/types";

// Starts a new Deal against a journey's CURRENT (published) version.
// Only published journeys can have deals started against them — a
// draft/in_review schema could still change, which would make "which stage
// is this" and "which field values were validated against what schema"
// ambiguous.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const journey = await prisma.journey.findUnique({ where: { id }, include: { currentVersion: true } });
  if (!journey) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (journey.status !== "published" || !journey.currentVersion) {
    return NextResponse.json({ error: "can only start a deal on a published journey" }, { status: 409 });
  }

  const schema = journey.currentVersion.schemaSnapshot as unknown as SchemaSnapshot;
  const stages = [...schema.stages].sort((a, b) => a.order - b.order);
  if (stages.length === 0) {
    return NextResponse.json({ error: "this journey has no stages" }, { status: 409 });
  }

  const deal = await prisma.deal.create({
    data: {
      journeyId: journey.id,
      journeyVersionId: journey.currentVersion.id,
      name,
      currentStageId: stages[0].id,
      createdBy: currentUserName(),
    },
  });

  return NextResponse.json({ deal });
}
