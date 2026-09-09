import { describe, it, expect } from "vitest";
import { detectDocType, extractText, cleanExtractedText, wordCount } from "@/lib/document-extract";

describe("detectDocType", () => {
  it("detects supported extensions", () => {
    expect(detectDocType("contract.pdf")).toBe("pdf");
    expect(detectDocType("Process Description.DOCX")).toBe("docx");
    expect(detectDocType("notes.txt")).toBe("txt");
    expect(detectDocType("notes.md")).toBe("txt");
  });

  it("returns null for unsupported or missing extensions", () => {
    expect(detectDocType("image.png")).toBeNull();
    expect(detectDocType("no-extension")).toBeNull();
    expect(detectDocType("")).toBeNull();
  });
});

describe("extractText", () => {
  it("reads plain text buffers directly as utf-8", async () => {
    const buffer = Buffer.from("Sales onboarding process description.", "utf-8");
    const text = await extractText(buffer, "txt");
    expect(text).toBe("Sales onboarding process description.");
  });
});

describe("cleanExtractedText", () => {
  it("collapses 3+ blank lines down to a single blank line", () => {
    const raw = "Line one.\n\n\n\n\nLine two.";
    expect(cleanExtractedText(raw)).toBe("Line one.\n\nLine two.");
  });

  it("normalizes Windows line endings", () => {
    const raw = "Line one.\r\nLine two.";
    expect(cleanExtractedText(raw)).toBe("Line one.\nLine two.");
  });

  it("trims leading/trailing whitespace and strips trailing spaces before newlines", () => {
    const raw = "  \n  Line one.   \n  Line two.  \n\n  ";
    const result = cleanExtractedText(raw);
    expect(result.startsWith("Line one")).toBe(true);
    expect(result.endsWith("Line two.")).toBe(true);
  });
});

describe("wordCount", () => {
  it("counts words separated by arbitrary whitespace", () => {
    expect(wordCount("one two   three\nfour")).toBe(4);
  });

  it("returns 0 for empty or whitespace-only input", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   \n  ")).toBe(0);
  });
});
