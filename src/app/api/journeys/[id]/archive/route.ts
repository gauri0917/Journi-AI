import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserName } from "@/lib/current-user";

// Archiving is a terminal, one-way transition available from any non-archived
// status. No new version is written — archiving is a status change only.
// Restricted to the journey's owner, same reasoning as publish/route.ts.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const journey = await prisma.journey.findUnique({ where: { id: id } });
    if (!journey) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (journey.createdBy !== currentUserName()) {
      return NextResponse.json(
        { error: `only ${journey.createdBy} (who created this journey) can archive it` },
        { status: 403 }
      );
    }

    if (journey.status === "archived") {
      return NextResponse.json({ error: "already archived" }, { status: 409 });
    }

    const updated = await prisma.journey.update({
      where: { id: journey.id },
      data: { status: "archived" },
    });
    return NextResponse.json({ journey: updated });
  } catch (err) {
    console.error("archive failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "archive failed", details: [message] }, { status: 500 });
  }
}
