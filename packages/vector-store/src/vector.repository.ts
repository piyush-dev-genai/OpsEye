import type { RedisClientType } from "redis";

import { createAppConfig, type AppConfig } from "@opseye/config";
import type {
  ChunkMetadata,
  EmbeddedLogChunk,
  QueryFilters,
} from "@opseye/types";

import {
  createRedisVectorStoreClient,
  getVectorStoreIndexName,
  type RedisVectorStoreClient,
} from "./redis.client";

export type VectorDistanceMetric = "COSINE" | "IP" | "L2";
export type VectorIndexAlgorithm = "FLAT" | "HNSW";

export interface VectorIndexOptions {
  readonly dimensions: number;
  readonly distanceMetric?: VectorDistanceMetric;
  readonly algorithm?: VectorIndexAlgorithm;
  readonly prefix?: string;
}

export interface VectorSearchRequest {
  readonly embedding: readonly number[];
  readonly limit: number;
  readonly filters?: QueryFilters;
}

export interface VectorSearchResult extends EmbeddedLogChunk {
  readonly vectorDistance: number;
}

export interface VectorRepositoryOptions {
  readonly appConfig?: AppConfig;
  readonly client?: RedisVectorStoreClient;
  readonly indexName?: string;
  readonly keyPrefix?: string;
}

interface StoredChunkRecord {
  readonly chunkId: string;
  readonly content: string;
  readonly embeddingModel: string;
  readonly embedding: Buffer;
  readonly embeddingJson: string;
  readonly service: string;
  readonly environment: ChunkMetadata["environment"];
  readonly timestamp: string;
  readonly timestampEpoch: string;
  readonly level: ChunkMetadata["level"];
  readonly traceId?: string;
  readonly chunkStrategy: ChunkMetadata["chunkStrategy"];
  readonly sourceLogIds: string;
}

interface ParsedSearchDocument {
  readonly id: string;
  readonly fields: Record<string, string>;
}

interface StoredChunkHashFields {
  readonly chunkId: string;
  readonly content: string;
  readonly embeddingModel: string;
  readonly embeddingJson: string;
  readonly service: string;
  readonly environment: string;
  readonly timestamp: string;
  readonly level: string;
  readonly traceId?: string;
  readonly chunkStrategy: string;
  readonly sourceLogIds: string;
}

function serializeEmbedding(embedding: readonly number[]): Buffer {
  const vector = new Float32Array(embedding);
  return Buffer.from(vector.buffer);
}

function escapeTagValue(value: string): string {
  return value.replace(/([\\\-@{}[\]|><~:"'()*!])/g, "\\$1");
}

function buildChunkKey(chunkId: string, prefix: string): string {
  return `${prefix}${chunkId}`;
}

function toStoredChunkRecord(chunk: EmbeddedLogChunk): StoredChunkRecord {
  return {
    chunkId: chunk.chunkId,
    content: chunk.content,
    embeddingModel: chunk.embeddingModel,
    embedding: serializeEmbedding(chunk.embedding),
    embeddingJson: JSON.stringify(chunk.embedding),
    service: chunk.metadata.service,
    environment: chunk.metadata.environment,
    timestamp: chunk.metadata.timestamp,
    timestampEpoch: Date.parse(chunk.metadata.timestamp).toString(),
    level: chunk.metadata.level,
    ...(chunk.metadata.traceId !== undefined
      ? { traceId: chunk.metadata.traceId }
      : {}),
    chunkStrategy: chunk.metadata.chunkStrategy,
    sourceLogIds: JSON.stringify(chunk.metadata.sourceLogIds),
  };
}

function parseEmbedding(buffer: Buffer): readonly number[] {
  const view = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    Math.floor(buffer.byteLength / Float32Array.BYTES_PER_ELEMENT),
  );

  return Array.from(view);
}

function parseStoredChunkRecord(
  chunkId: string,
  record: StoredChunkHashFields,
  vectorDistance?: number,
): VectorSearchResult {
  return {
    chunkId,
    content: record.content,
    embeddingModel: record.embeddingModel,
    embedding: JSON.parse(record.embeddingJson) as readonly number[],
    metadata: {
      service: record.service,
      environment: record.environment as ChunkMetadata["environment"],
      timestamp: record.timestamp,
      level: record.level as ChunkMetadata["level"],
      ...(record.traceId !== undefined ? { traceId: record.traceId } : {}),
      chunkStrategy: record.chunkStrategy as ChunkMetadata["chunkStrategy"],
      sourceLogIds: JSON.parse(record.sourceLogIds) as readonly string[],
    },
    vectorDistance: vectorDistance ?? Number.NaN,
  };
}

function requireField(
  record: Record<string, string>,
  fieldName: keyof StoredChunkHashFields,
): string {
  const value = record[fieldName];

  if (value === undefined) {
    throw new Error(`Missing stored chunk field: ${fieldName}`);
  }

  return value;
}

function toStoredChunkHashFields(
  record: Record<string, string>,
): StoredChunkHashFields {
  const traceId = record.traceId;

  return {
    chunkId: requireField(record, "chunkId"),
    content: requireField(record, "content"),
    embeddingModel: requireField(record, "embeddingModel"),
    embeddingJson: requireField(record, "embeddingJson"),
    service: requireField(record, "service"),
    environment: requireField(record, "environment"),
    timestamp: requireField(record, "timestamp"),
    level: requireField(record, "level"),
    ...(traceId !== undefined ? { traceId } : {}),
    chunkStrategy: requireField(record, "chunkStrategy"),
    sourceLogIds: requireField(record, "sourceLogIds"),
  };
}

function buildFilterQuery(filters?: QueryFilters): string {
  if (filters === undefined) {
    return "*";
  }

  const clauses: string[] = [];

  if (filters.service !== undefined) {
    clauses.push(`@service:{${escapeTagValue(filters.service)}}`);
  }

  if (filters.environment !== undefined) {
    clauses.push(`@environment:{${escapeTagValue(filters.environment)}}`);
  }

  if (filters.traceId !== undefined) {
    clauses.push(`@traceId:{${escapeTagValue(filters.traceId)}}`);
  }

  if (
    filters.fromTimestamp !== undefined ||
    filters.toTimestamp !== undefined
  ) {
    const from =
      filters.fromTimestamp !== undefined
        ? Date.parse(filters.fromTimestamp)
        : "-inf";
    const to =
      filters.toTimestamp !== undefined
        ? Date.parse(filters.toTimestamp)
        : "+inf";
    clauses.push(`@timestampEpoch:[${from} ${to}]`);
  }

  return clauses.length > 0 ? clauses.join(" ") : "*";
}

function parseHashResult(response: unknown): readonly ParsedSearchDocument[] {
  if (!Array.isArray(response)) {
    return [];
  }

  const documents: ParsedSearchDocument[] = [];

  for (let index = 1; index < response.length; index += 2) {
    const id = response[index];
    const fields = response[index + 1];

    if (typeof id !== "string" || !Array.isArray(fields)) {
      continue;
    }

    const normalizedFields: Record<string, string> = {};

    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 2) {
      const fieldName = fields[fieldIndex];
      const fieldValue = fields[fieldIndex + 1];

      if (typeof fieldName !== "string") {
        continue;
      }

      if (typeof fieldValue === "string") {
        normalizedFields[fieldName] = fieldValue;
        continue;
      }

      if (Buffer.isBuffer(fieldValue)) {
        normalizedFields[fieldName] = fieldValue.toString("utf8");
      }
    }

    documents.push({
      id,
      fields: normalizedFields,
    });
  }

  return documents;
}

async function sendCommand(
  client: RedisVectorStoreClient,
  command: readonly (string | Buffer)[],
): Promise<unknown> {
  // node-redis typing is string-based, but RediSearch vector commands
  // also need Buffer arguments for binary embeddings.
  return client.sendCommand(command as unknown as [string, ...string[]]);
}

async function indexExists(
  client: RedisVectorStoreClient,
  indexName: string,
): Promise<boolean> {
  try {
    await sendCommand(client, ["FT.INFO", indexName]);
    return true;
  } catch {
    return false;
  }
}

export class RedisVectorRepository {
  private readonly client: RedisVectorStoreClient;
  private readonly indexName: string;
  private readonly keyPrefix: string;

  public constructor(options: VectorRepositoryOptions = {}) {
    const appConfig = options.appConfig ?? createAppConfig();
    this.client = options.client ?? createRedisVectorStoreClient({ appConfig });
    this.indexName = options.indexName ?? getVectorStoreIndexName(appConfig);
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

  public async ensureIndex(options: VectorIndexOptions): Promise<void> {
    if (await indexExists(this.client, this.indexName)) {
      return;
    }

    const algorithm = options.algorithm ?? "HNSW";
    const distanceMetric = options.distanceMetric ?? "COSINE";
    const prefix = options.prefix ?? this.keyPrefix;

    await sendCommand(this.client, [
      "FT.CREATE",
      this.indexName,
      "ON",
      "HASH",
      "PREFIX",
      "1",
      prefix,
      "SCHEMA",
      "chunkId",
      "TAG",
      "service",
      "TAG",
      "environment",
      "TAG",
      "level",
      "TAG",
      "traceId",
      "TAG",
      "chunkStrategy",
      "TAG",
      "timestampEpoch",
      "NUMERIC",
      "SORTABLE",
      "embeddingModel",
      "TAG",
      "content",
      "TEXT",
      "embedding",
      "VECTOR",
      algorithm,
      "6",
      "TYPE",
      "FLOAT32",
      "DIM",
      String(options.dimensions),
      "DISTANCE_METRIC",
      distanceMetric,
    ]);
  }

  public async upsertChunk(chunk: EmbeddedLogChunk): Promise<void> {
    const key = buildChunkKey(chunk.chunkId, this.keyPrefix);
    const stored = toStoredChunkRecord(chunk);
    await sendCommand(this.client, [
      "HSET",
      key,
      "chunkId",
      stored.chunkId,
      "content",
      stored.content,
      "embeddingModel",
      stored.embeddingModel,
      "embeddingJson",
      stored.embeddingJson,
      "embedding",
      stored.embedding,
      "service",
      stored.service,
      "environment",
      stored.environment,
      "timestamp",
      stored.timestamp,
      "timestampEpoch",
      stored.timestampEpoch,
      "level",
      stored.level,
      ...(stored.traceId !== undefined ? ["traceId", stored.traceId] : []),
      "chunkStrategy",
      stored.chunkStrategy,
      "sourceLogIds",
      stored.sourceLogIds,
    ]);
  }

  public async upsertChunks(
    chunks: readonly EmbeddedLogChunk[],
  ): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const pipeline = this.client.multi();

    for (const chunk of chunks) {
      const key = buildChunkKey(chunk.chunkId, this.keyPrefix);
      const stored = toStoredChunkRecord(chunk);

      pipeline.hSet(key, {
        chunkId: stored.chunkId,
        content: stored.content,
        embeddingModel: stored.embeddingModel,
        embeddingJson: stored.embeddingJson,
        embedding: stored.embedding,
        service: stored.service,
        environment: stored.environment,
        timestamp: stored.timestamp,
        timestampEpoch: stored.timestampEpoch,
        level: stored.level,
        ...(stored.traceId ? { traceId: stored.traceId } : {}),
        chunkStrategy: stored.chunkStrategy,
        sourceLogIds: stored.sourceLogIds,
      });
    }

    await pipeline.exec();
  }

  public async getByIds(
    chunkIds: readonly string[],
  ): Promise<readonly EmbeddedLogChunk[]> {
    if (chunkIds.length === 0) {
      return [];
    }

    const pipeline = this.client.multi();

    for (const chunkId of chunkIds) {
      pipeline.hGetAll(buildChunkKey(chunkId, this.keyPrefix));
    }

    const results = await pipeline.exec();
    const chunks: EmbeddedLogChunk[] = [];

    for (let index = 0; index < chunkIds.length; index += 1) {
      const chunkId = chunkIds[index];
      const result = results[index];

      if (
        chunkId === undefined ||
        result === null ||
        typeof result !== "object"
      ) {
        continue;
      }

      const record = result as unknown as Record<string, string>;

      if (Object.keys(record).length === 0) {
        continue;
      }

      const parsed = parseStoredChunkRecord(
        chunkId,
        toStoredChunkHashFields(record),
      );
      chunks.push({
        chunkId: parsed.chunkId,
        content: parsed.content,
        metadata: parsed.metadata,
        embeddingModel: parsed.embeddingModel,
        embedding: parsed.embedding,
      });
    }

    return chunks;
  }

  public async deleteByIds(chunkIds: readonly string[]): Promise<void> {
    if (chunkIds.length === 0) {
      return;
    }

    await this.client.del(
      chunkIds.map((chunkId) => buildChunkKey(chunkId, this.keyPrefix)),
    );
  }

  public async searchSimilar(
    request: VectorSearchRequest,
  ): Promise<readonly VectorSearchResult[]> {
    const filterQuery = buildFilterQuery(request.filters);
    const vectorBlob = serializeEmbedding(request.embedding);
    const rawResponse = await sendCommand(this.client, [
      "FT.SEARCH",
      this.indexName,
      `${filterQuery}=>[KNN ${request.limit} @embedding $vector AS vectorDistance]`,
      "PARAMS",
      "2",
      "vector",
      vectorBlob,
      "SORTBY",
      "vectorDistance",
      "RETURN",
      "12",
      "chunkId",
      "content",
      "embeddingModel",
      "embeddingJson",
      "service",
      "environment",
      "timestamp",
      "level",
      "traceId",
      "chunkStrategy",
      "sourceLogIds",
      "vectorDistance",
      "DIALECT",
      "2",
    ]);

    const documents = parseHashResult(rawResponse);

    return documents.map((document) =>
      parseStoredChunkRecord(
        document.fields.chunkId ?? document.id.replace(this.keyPrefix, ""),
        toStoredChunkHashFields(document.fields),
        document.fields.vectorDistance !== undefined
          ? Number(document.fields.vectorDistance)
          : Number.NaN,
      ),
    );
  }
}
