import type { AppConfig } from "@opseye/config";
import { embedTexts } from "@opseye/llm";
import type { EmbeddedLogChunk, LogChunk } from "@opseye/types";

export interface EmbedChunksOptions {
  readonly appConfig?: AppConfig;
  readonly model?: string;
}

export async function embedChunks(
  chunks: readonly LogChunk[],
  options: EmbedChunksOptions = {},
): Promise<readonly EmbeddedLogChunk[]> {
  if (chunks.length === 0) {
    return [];
  }

  const result = await embedTexts({
    ...(options.appConfig !== undefined
      ? { appConfig: options.appConfig }
      : {}),
    texts: chunks.map((chunk) => chunk.content),
    ...(options.model !== undefined ? { model: options.model } : {}),
  });

  return chunks.map((chunk, index) => {
    const embedding = result.embeddings[index];

    if (embedding === undefined) {
      throw new Error(`Missing embedding output for chunk ${chunk.chunkId}.`);
    }

    return {
      ...chunk,
      embeddingModel: result.model,
      embedding,
    };
  });
}
