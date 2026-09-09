import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { embedText, toVectorLiteral } from "./embeddings";
import type { SchemaSnapshot } from "./types";

export interface RetrievedExample {
  description: string;
  schemaSnapshot: SchemaSnapshot;
  distance: number; // cosine distance, lower = more similar
}

// Only take examples that are reasonably close. An unrelated process (high
// distance) as a "similar" few-shot example is worse than no retrieval at
// all — it anchors the model on the wrong stage structure. This threshold
// is a judgment call, not a principled constant; tune it against
// eval/run.ts results if retrieval quality looks off in practice.
const MAX_USEFUL_DISTANCE = 0.4;

// Retrieves up to `k` published-quality examples most similar to
// `description`, via pgvector cosine distance (`<=>` operator). Returns []
// on any failure (embedding call fails, DB unreachable, corpus empty) —
// retrieval is a quality enhancement, never a hard dependency; generation
// must still work with zero examples (falling back to the static few-shot
// baked into SYSTEM_PROMPT).
export async function retrieveSimilarExamples(
  description: string,
  k: number = 2
): Promise<RetrievedExample[]> {
  try {
    const embedding = await embedText(description);
    const literal = toVectorLiteral(embedding);

    // Raw SQL because pgvector's <=> operator and the `vector` column type
    // aren't things Prisma's query builder can express — this is the one
    // place in the codebase that talks to Postgres directly instead of
    // through Prisma Client, and it's confined to this function.
    //
    // Cast after the call rather than passing a generic type argument to
    // $queryRawUnsafe — keeps this correct whether or not the generated
    // Prisma Client's own type signature is available in a given build
    // environment, rather than relying on that generic overload existing.
    type RagRow = { description: string; schema_snapshot: unknown; distance: number };
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT description, schema_snapshot, embedding <=> $1::vector AS distance
       FROM ai_draft_examples
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      literal,
      k
    )) as RagRow[];

    return rows
      .filter((r: RagRow) => r.distance <= MAX_USEFUL_DISTANCE)
      .map((r: RagRow) => ({
        description: r.description,
        schemaSnapshot: r.schema_snapshot as SchemaSnapshot,
        distance: r.distance,
      }));
  } catch (err) {
    console.error("RAG retrieval failed (continuing without retrieved examples):", err);
    return [];
  }
}

// Called from the publish route ONLY, and only when the published version
// has a sourceDescription — i.e. this journey was AI-drafted AND survived
// the full review gate. Never call this on a bare successful generation;
// that would let unreviewed (possibly wrong) drafts pollute the corpus that
// future generations learn from.
export async function recordDraftExample(description: string, schemaSnapshot: SchemaSnapshot): Promise<void> {
  try {
    const embedding = await embedText(description);
    const literal = toVectorLiteral(embedding);
    // UUID generated in JS (not gen_random_uuid()) so this doesn't depend on
    // pgcrypto being enabled — one less extension requirement beyond vector.
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO ai_draft_examples (id, description, schema_snapshot, embedding, created_at)
       VALUES ($1, $2, $3::jsonb, $4::vector, now())`,
      id,
      description,
      JSON.stringify(schemaSnapshot),
      literal
    );
  } catch (err) {
    // Never let corpus-recording failure affect the publish response —
    // this is a background quality improvement, not part of the publish
    // transaction's correctness.
    console.error("Failed to record AI draft example for RAG corpus:", err);
  }
}
