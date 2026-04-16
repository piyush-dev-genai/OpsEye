import type { AppConfig } from "@opseye/config";
import { retrieveByVector } from "@opseye/retrieval";
import type { AppLogger } from "@opseye/observability";
import type { QueryEmbedding, QueryRequest } from "@opseye/types";
import { RedisVectorRepository } from "@opseye/vector-store";

import type { RetrievedChunkRecord } from "../workflow/state";

export interface RetrievalRequest {
  readonly queryRequest: QueryRequest;
  readonly queryEmbedding: QueryEmbedding;
}

const DEFAULT_RETRIEVAL_LIMIT = 12;

export class RetrievalService {
  public constructor(
    private readonly vectorRepository: RedisVectorRepository,
    private readonly logger: AppLogger,
    private readonly appConfig: AppConfig,
  ) {}

  public async retrieve(
    request: RetrievalRequest,
  ): Promise<readonly RetrievedChunkRecord[]> {
    await this.vectorRepository.ensureConnected();

    const retrievedChunks = await retrieveByVector({
      repository: this.vectorRepository,
      queryEmbedding: request.queryEmbedding.vector,
      limit: DEFAULT_RETRIEVAL_LIMIT,
      ...(request.queryRequest.filters !== undefined
        ? { filters: request.queryRequest.filters }
        : {}),
    });

    const records: readonly RetrievedChunkRecord[] = retrievedChunks.map(
      (chunk) => ({
        chunkId: chunk.chunkId,
        content: chunk.content,
        metadata: {
          service: chunk.metadata.service,
          environment: chunk.metadata.environment,
          timestamp: chunk.metadata.timestamp,
          level: chunk.metadata.level,
          ...(chunk.metadata.traceId !== undefined
            ? { traceId: chunk.metadata.traceId }
            : {}),
          chunkStrategy: chunk.metadata.chunkStrategy,
          sourceLogIds: chunk.metadata.sourceLogIds,
        },
        embeddingModel: chunk.embeddingModel,
        vectorDistance: chunk.vectorDistance,
        vectorScore: chunk.vectorScore,
      }),
    );

    this.logger.info("Retrieved candidate chunks for query.", {
      queryId: request.queryRequest.id,
      retrievalCount: records.length,
      vectorIndex: this.appConfig.vectorStore.indexName,
      embeddingModel: request.queryEmbedding.model,
    });

    return records;
  }

  public async disconnect(): Promise<void> {
    await this.vectorRepository.disconnect();
  }
}
