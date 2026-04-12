import { createAppConfig, type AppConfig } from "@opseye/config";
import type { ChunkMetadata } from "@opseye/types";

import {
  createRedisVectorStoreClient,
  type RedisVectorStoreClient,
} from "./redis.client";

export interface MetadataRepositoryOptions {
  readonly appConfig?: AppConfig;
  readonly client?: RedisVectorStoreClient;
  readonly keyPrefix?: string;
}

export interface ChunkMetadataRecord {
  readonly chunkId: string;
  readonly metadata: ChunkMetadata;
}

type MetadataFieldsReply = readonly [
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
];

function buildChunkKey(chunkId: string, prefix: string): string {
  return `${prefix}${chunkId}`;
}

export class RedisMetadataRepository {
  private readonly client: RedisVectorStoreClient;
  private readonly keyPrefix: string;

  public constructor(options: MetadataRepositoryOptions = {}) {
    const appConfig = options.appConfig ?? createAppConfig();
    this.client = options.client ?? createRedisVectorStoreClient({ appConfig });
    this.keyPrefix = options.keyPrefix ?? "chunk:";
  }

  public async ensureConnected(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  public async getByChunkId(
    chunkId: string,
  ): Promise<ChunkMetadataRecord | null> {
    const fields = await this.client.hmGet(
      buildChunkKey(chunkId, this.keyPrefix),
      [
        "service",
        "environment",
        "timestamp",
        "level",
        "traceId",
        "chunkStrategy",
        "sourceLogIds",
      ],
    );

    const [
      service,
      environment,
      timestamp,
      level,
      traceId,
      chunkStrategy,
      sourceLogIds,
    ] = fields;

    if (
      service === null ||
      service === undefined ||
      environment === null ||
      environment === undefined ||
      timestamp === null ||
      timestamp === undefined ||
      level === null ||
      level === undefined ||
      chunkStrategy === null ||
      chunkStrategy === undefined ||
      sourceLogIds === null ||
      sourceLogIds === undefined
    ) {
      return null;
    }

    const normalizedService = service;
    const normalizedEnvironment = environment;
    const normalizedTimestamp = timestamp;
    const normalizedLevel = level;
    const normalizedChunkStrategy = chunkStrategy;
    const normalizedSourceLogIds = sourceLogIds;

    return {
      chunkId,
      metadata: {
        service: normalizedService,
        environment: normalizedEnvironment as ChunkMetadata["environment"],
        timestamp: normalizedTimestamp,
        level: normalizedLevel as ChunkMetadata["level"],
        ...(traceId !== null && traceId !== undefined ? { traceId } : {}),
        chunkStrategy:
          normalizedChunkStrategy as ChunkMetadata["chunkStrategy"],
        sourceLogIds: JSON.parse(normalizedSourceLogIds) as readonly string[],
      },
    };
  }

  public async getByChunkIds(
    chunkIds: readonly string[],
  ): Promise<readonly ChunkMetadataRecord[]> {
    if (chunkIds.length === 0) {
      return [];
    }

    const pipeline = this.client.multi();

    for (const chunkId of chunkIds) {
      pipeline.hmGet(buildChunkKey(chunkId, this.keyPrefix), [
        "service",
        "environment",
        "timestamp",
        "level",
        "traceId",
        "chunkStrategy",
        "sourceLogIds",
      ]);
    }

    const results = await pipeline.exec();
    const metadata: ChunkMetadataRecord[] = [];

    for (let index = 0; index < chunkIds.length; index += 1) {
      const chunkId = chunkIds[index];
      const rawFields = results[index];

      if (chunkId === undefined || rawFields == null) {
        continue;
      }

      const [
        service,
        environment,
        timestamp,
        level,
        traceId,
        chunkStrategy,
        sourceLogIds,
      ] = rawFields as unknown as MetadataFieldsReply;

      if (
        service == null ||
        environment == null ||
        timestamp == null ||
        level == null ||
        chunkStrategy == null ||
        sourceLogIds == null
      ) {
        continue;
      }

      metadata.push({
        chunkId,
        metadata: {
          service,
          environment: environment as ChunkMetadata["environment"],
          timestamp,
          level: level as ChunkMetadata["level"],
          ...(traceId != null ? { traceId } : {}),
          chunkStrategy: chunkStrategy as ChunkMetadata["chunkStrategy"],
          sourceLogIds: JSON.parse(sourceLogIds) as readonly string[],
        },
      });
    }

    return metadata;
  }
}
