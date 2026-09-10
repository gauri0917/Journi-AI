import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserName } from "@/lib/current-user";

export async function GET() {
  try {
    const journeys = await prisma.journey.findMany({
      orderBy: { updatedAt: "desc" },
      include: { currentVersion: true, reviews: true },
    });
    // Drafts are only visible to the profile that created them — in_review,
    // published, and archived stay visible to everyone (reviewers need to
    // see in_review; published/archived are the org-wide record).
    const me = await currentUserName();
    const visible = journeys.filter((j) => j.status !== "draft" || j.createdBy === me);
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
