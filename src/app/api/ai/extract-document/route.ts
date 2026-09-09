import { NextRequest, NextResponse } from "next/server";
import { detectDocType, extractText, cleanExtractedText, wordCount } from "@/lib/document-extract";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

// Pure text extraction — no AI call happens in this route. The result is
// handed back to the client to drop into the same description textarea
// used by /api/ai/generate, so everything downstream (tool-choice,
// clarification, confidence, validation) is unchanged and unaware this
// text came from a file rather than being typed.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file is required (multipart form field 'file')" }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `file too large — max ${MAX_FILE_BYTES / (1024 * 1024)}MB` }, { status: 413 });
  }

  const docType = detectDocType(file.name);
  if (!docType) {
    return NextResponse.json(
      { error: "unsupported file type — upload a .pdf, .docx, or .txt file" },
      { status: 415 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const raw = await extractText(buffer, docType);
    const text = cleanExtractedText(raw);

    if (!text) {
      return NextResponse.json(
        { error: "no extractable text found — the file may be a scanned image without a text layer" },
        { status: 422 }
      );
    }

    return NextResponse.json({ text, wordCount: wordCount(text), docType });
  } catch (err) {
    console.error("Document extraction error:", err);
    return NextResponse.json({ error: "failed to extract text from this file" }, { status: 502 });
  }
}
