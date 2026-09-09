import { getOpenAIClient } from "./openai";

// text-embedding-3-small: 1536 dimensions, matches the vector(1536) column
// in prisma/schema.prisma. If you swap models, the dimension count MUST
// match the column — changing this without a migration will break inserts.
// Override via env if OpenAI's current lineup has moved on by the time
// you're reading this; verify the dimension count in their docs either way.
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export async function embedText(text: string): Promise<number[]> {
  const response = await getOpenAIClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  const embedding = response.data[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `embedding model returned ${embedding?.length ?? 0} dimensions, expected ${EMBEDDING_DIMENSIONS} — ` +
        `check OPENAI_EMBEDDING_MODEL matches the vector(${EMBEDDING_DIMENSIONS}) column`
    );
  }
  return embedding;
}

// pgvector literal format: '[0.1,0.2,...]'. Used when interpolating into
// raw SQL, since Prisma's query builder can't construct vector literals itself.
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
