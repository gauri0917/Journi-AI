import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
