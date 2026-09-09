import { NextRequest, NextResponse } from "next/server";
import { generateWithRetry, wordCount } from "@/lib/generate";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.description !== "string") {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const description = body.description.trim();
  const words = wordCount(description);
  if (words < 100 || words > 1500) {
    return NextResponse.json(
      { error: `description must be 100-1500 words (got ${words})` },
      { status: 400 }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured on the server" }, { status: 500 });
  }

  try {
    const result = await generateWithRetry(description);

    if (!result.ok && result.needsClarification) {
      return NextResponse.json(
        { needsClarification: true, question: result.question, reason: result.reason, attempts: result.attempts },
        { status: 200 }
      );
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: "AI draft failed validation twice — not shown", details: result.errors, attempts: result.attempts },
        { status: 422 }
      );
    }
    return NextResponse.json({
      schemaSnapshot: result.data,
      stageConfidence: result.stageConfidence,
      attempts: result.attempts,
      retrievedCount: result.retrievedCount,
      description,
    });
  } catch (err) {
    console.error("AI generation error:", err);
    return NextResponse.json({ error: "AI generation failed" }, { status: 502 });
  }
}
