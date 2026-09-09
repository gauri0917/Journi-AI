// Deterministic document → plain text extraction. No model call happens
// here — this is pure parsing, same philosophy as validation.ts: don't
// spend a model call on something a library can do for free and exactly.
//
// Output feeds straight into the existing description textarea / generate
// flow (see api/ai/generate/route.ts) — this module has no awareness of
// journeys, schemas, or the AI drafting tools at all. It only ever produces
// plain text.

export type SupportedDocType = "pdf" | "docx" | "txt";

export function detectDocType(filename: string): SupportedDocType | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "txt" || ext === "md") return "txt";
  return null;
}

export async function extractText(buffer: Buffer, docType: SupportedDocType): Promise<string> {
  switch (docType) {
    case "pdf": {
      // pdf-parse's default export runs its own debug/test path if required
      // in unusual ways — import the lib file directly to avoid that.
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(buffer);
      return data.text;
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "txt": {
      return buffer.toString("utf-8");
    }
  }
}

// Light cleanup only — collapse excess blank lines/whitespace that PDF
// extraction commonly produces. Deliberately NOT summarizing or truncating:
// trimming a document down to the relevant process description is a human
// judgment call, so the UI surfaces word count and lets the user edit
// before generating, rather than silently cutting content here.
export function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
