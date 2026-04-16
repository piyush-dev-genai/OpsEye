import type { AppLogger } from "@opseye/observability";
import type { EmbeddedLogChunk } from "@opseye/types";
import { RedisVectorRepository } from "@opseye/vector-store";

export interface IndexChunksResult {
  readonly indexedCount: number;
  readonly dimensions: number;
}

function validateEmbeddingDimensions(
  chunks: readonly EmbeddedLogChunk[],
): number {
  const [firstChunk] = chunks;

  if (firstChunk === undefined) {
    return 0;
  }

  const expectedDimensions = firstChunk.embedding.length;

  if (expectedDimensions === 0) {
    throw new Error("Embedded chunks must contain at least one dimension.");
  }

  for (const chunk of chunks) {
    if (chunk.embedding.length !== expectedDimensions) {
      throw new Error(
        `Embedding dimension mismatch for chunk ${chunk.chunkId}: expected ${expectedDimensions}, received ${chunk.embedding.length}.`,
      );
    }

    if (chunk.embedding.some((value) => !Number.isFinite(value))) {
      throw new Error(
        `Embedding for chunk ${chunk.chunkId} contains a non-finite value.`,
      );
    }
  }

  return expectedDimensions;
}

export class IndexingService {
  public constructor(
    private readonly vectorRepository: RedisVectorRepository,
    private readonly logger: AppLogger,
  ) {}

  public async indexChunks(
    chunks: readonly EmbeddedLogChunk[],
  ): Promise<IndexChunksResult> {
    if (chunks.length === 0) {
      return {
        indexedCount: 0,
        dimensions: 0,
      };
    }

    const dimensions = validateEmbeddingDimensions(chunks);
    const [firstChunk] = chunks;

    await this.vectorRepository.ensureConnected();
    await this.vectorRepository.ensureIndex({
      dimensions,
    });
    await this.vectorRepository.upsertChunks(chunks);

    this.logger.info("Indexed embedded log chunks.", {
      chunkCount: chunks.length,
      embeddingModel: firstChunk?.embeddingModel,
      dimensions,
    });

    return {
      indexedCount: chunks.length,
      dimensions,
    };
  }

  public async disconnect(): Promise<void> {
    await this.vectorRepository.disconnect();
  }
}
