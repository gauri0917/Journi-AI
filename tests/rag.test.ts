import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/embeddings", () => ({
  embedText: vi.fn(),
  toVectorLiteral: vi.fn((embedding: number[]) => `[${embedding.join(",")}]`),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
  },
}));

import { embedText } from "@/lib/embeddings";
import { prisma } from "@/lib/db";
import { retrieveSimilarExamples, recordDraftExample } from "@/lib/rag";

const mockEmbedText = vi.mocked(embedText);
const mockQuery = vi.mocked(prisma.$queryRawUnsafe);
const mockExecute = vi.mocked(prisma.$executeRawUnsafe);

beforeEach(() => {
  mockEmbedText.mockReset();
  mockQuery.mockReset();
  mockExecute.mockReset();
});

describe("retrieveSimilarExamples", () => {
  it("returns matches within the usefulness distance threshold", async () => {
    mockEmbedText.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockQuery.mockResolvedValueOnce([
      { description: "close match", schema_snapshot: { stages: [] }, distance: 0.15 },
    ]);

    const result = await retrieveSimilarExamples("some description");

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("close match");
  });

  it("filters out matches beyond the usefulness distance threshold", async () => {
    mockEmbedText.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockQuery.mockResolvedValueOnce([
      { description: "close match", schema_snapshot: { stages: [] }, distance: 0.1 },
      { description: "unrelated process", schema_snapshot: { stages: [] }, distance: 0.9 },
    ]);

    const result = await retrieveSimilarExamples("some description");

    // Only the close match should survive — an unrelated "similar" example
    // is worse than no retrieval at all (see rag.ts comment on this constant).
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("close match");
  });

  it("returns an empty array (never throws) when the embedding call fails", async () => {
    mockEmbedText.mockRejectedValueOnce(new Error("embedding API is down"));

    const result = await retrieveSimilarExamples("some description");

    expect(result).toEqual([]);
  });

  it("returns an empty array (never throws) when the database query fails", async () => {
    mockEmbedText.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const result = await retrieveSimilarExamples("some description");

    expect(result).toEqual([]);
  });

  it("returns an empty array when the corpus has no rows at all", async () => {
    mockEmbedText.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockQuery.mockResolvedValueOnce([]);

    const result = await retrieveSimilarExamples("some description");

    expect(result).toEqual([]);
  });

  it("respects the k parameter as the LIMIT passed to the query", async () => {
    mockEmbedText.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockQuery.mockResolvedValueOnce([]);

    await retrieveSimilarExamples("some description", 5);

    const limitArg = mockQuery.mock.calls[0][2];
    expect(limitArg).toBe(5);
  });
});

describe("recordDraftExample", () => {
  it("writes the description, schema, and embedding to the corpus table", async () => {
    mockEmbedText.mockResolvedValueOnce([0.4, 0.5]);
    mockExecute.mockResolvedValueOnce(1 as any);

    await recordDraftExample("a published, human-approved process description", { stages: [] } as any);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, , description] = mockExecute.mock.calls[0];
    expect(String(sql)).toMatch(/INSERT INTO ai_draft_examples/);
    expect(description).toBe("a published, human-approved process description");
  });

  it("never throws even if the embedding call fails (corpus writes are best-effort)", async () => {
    mockEmbedText.mockRejectedValueOnce(new Error("embedding API is down"));

    await expect(recordDraftExample("desc", { stages: [] } as any)).resolves.toBeUndefined();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("never throws even if the database write fails", async () => {
    mockEmbedText.mockResolvedValueOnce([0.1]);
    mockExecute.mockRejectedValueOnce(new Error("db unreachable"));

    await expect(recordDraftExample("desc", { stages: [] } as any)).resolves.toBeUndefined();
  });
});
