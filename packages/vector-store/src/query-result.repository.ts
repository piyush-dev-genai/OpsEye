import { createAppConfig, type AppConfig } from "@opseye/config";
import type {
  PersistedQueryResult,
  QueryExecutionResult,
  QueryFilters,
  QueryRequest,
} from "@opseye/types";

import {
  createRedisVectorStoreClient,
  type RedisVectorStoreClient,
} from "./redis.client";

export interface QueryResultRepositoryOptions {
  readonly appConfig?: AppConfig;
  readonly client?: RedisVectorStoreClient;
  readonly keyPrefix?: string;
}

export interface CreateQueuedQueryResultInput {
  readonly queryRequest: QueryRequest;
}

export interface CreateQueryRecordInput {
  readonly queryId: string;
  readonly query: string;
  readonly requestedAt: string;
  readonly filters?: QueryFilters;
}

function buildQueryResultKey(queryId: string, prefix: string): string {
  return `${prefix}${queryId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class QueryResultRepository {
  private readonly client: RedisVectorStoreClient;
  private readonly keyPrefix: string;
  private readonly ttlSeconds: number | undefined;

  public constructor(options: QueryResultRepositoryOptions = {}) {
    const appConfig = options.appConfig ?? createAppConfig();
    this.client = options.client ?? createRedisVectorStoreClient({ appConfig });
    this.keyPrefix = options.keyPrefix ?? "opsEye:query-result:";
    this.ttlSeconds = appConfig.queryResults.ttlSeconds;
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

  public async createQueued(
    input: CreateQueuedQueryResultInput,
  ): Promise<PersistedQueryResult> {
    const record = this.buildQueuedRecord({
      queryId: input.queryRequest.id,
      query: input.queryRequest.query,
      requestedAt: input.queryRequest.requestedAt,
      ...(input.queryRequest.filters !== undefined
        ? { filters: input.queryRequest.filters }
        : {}),
    });

    await this.write(record);

    return record;
  }

  public async markProcessing(
    input: CreateQueryRecordInput,
  ): Promise<PersistedQueryResult> {
    const existing = await this.getByQueryId(input.queryId);
    const updatedAt = nowIso();
    const record: PersistedQueryResult =
      existing ?? {
        queryId: input.queryId,
        query: input.query,
        requestedAt: input.requestedAt,
        updatedAt,
        status: "queued",
        ...(input.filters !== undefined ? { filters: input.filters } : {}),
      };

    const nextRecord: PersistedQueryResult = {
      ...record,
      updatedAt,
      status: "processing",
    };

    await this.write(nextRecord);

    return nextRecord;
  }

  public async markCompleted(
    queryId: string,
    result: QueryExecutionResult,
  ): Promise<PersistedQueryResult> {
    const existing = await this.requireRecord(queryId);
    const record: PersistedQueryResult = {
      ...existing,
      updatedAt: nowIso(),
      status: "completed",
      result,
    };

    await this.write(record);

    return record;
  }

  public async markFailed(
    queryId: string,
    error: string,
  ): Promise<PersistedQueryResult> {
    const existing = await this.requireRecord(queryId);
    const record: PersistedQueryResult = {
      ...existing,
      updatedAt: nowIso(),
      status: "failed",
      error,
    };

    await this.write(record);

    return record;
  }

  public async getByQueryId(
    queryId: string,
  ): Promise<PersistedQueryResult | null> {
    const payload = await this.client.get(
      buildQueryResultKey(queryId, this.keyPrefix),
    );

    if (payload === null) {
      return null;
    }

    return JSON.parse(payload) as PersistedQueryResult;
  }

  private buildQueuedRecord(
    input: CreateQueryRecordInput,
  ): PersistedQueryResult {
    const timestamp = nowIso();

    return {
      queryId: input.queryId,
      query: input.query,
      requestedAt: input.requestedAt,
      updatedAt: timestamp,
      status: "queued",
      ...(input.filters !== undefined ? { filters: input.filters } : {}),
    };
  }

  private async requireRecord(queryId: string): Promise<PersistedQueryResult> {
    const existing = await this.getByQueryId(queryId);

    if (existing !== null) {
      return existing;
    }

    throw new Error(`Persisted query result not found for queryId ${queryId}.`);
  }

  private async write(record: PersistedQueryResult): Promise<void> {
    const key = buildQueryResultKey(record.queryId, this.keyPrefix);
    const value = JSON.stringify(record);

    if (this.ttlSeconds !== undefined) {
      await this.client.set(key, value, {
        EX: this.ttlSeconds,
      });
      return;
    }

    await this.client.set(key, value);
  }
}
