import { describe, expect, it } from "vitest";

import type { RedisVectorStoreClient } from "../redis.client";

import { QueryResultRepository } from "../query-result.repository";

class FakeRedisClient {
  public isOpen = false;
  public readonly store = new Map<string, string>();
  public readonly expirations = new Map<string, number>();

  public async connect(): Promise<void> {
    this.isOpen = true;
  }

  public async quit(): Promise<void> {
    this.isOpen = false;
  }

  public async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  public async set(
    key: string,
    value: string,
    options?: { EX?: number },
  ): Promise<string> {
    this.store.set(key, value);

    if (options?.EX !== undefined) {
      this.expirations.set(key, options.EX);
    }

    return "OK";
  }
}

function createRepository(
  client: FakeRedisClient,
  ttlSeconds?: number,
): QueryResultRepository {
  return new QueryResultRepository({
    client: client as unknown as RedisVectorStoreClient,
    appConfig: {
      runtime: {
        nodeEnv: "test",
        appEnv: "development",
      },
      server: {
        host: "127.0.0.1",
        port: 3000,
      },
      kafka: {
        brokers: ["localhost:9092"],
        clientId: "opseye-test",
        groupIdPrefix: "opseye-test",
      },
      topics: {
        logsRaw: "logs.raw",
        queryRequested: "query.requested",
        deadletterEvents: "deadletter.events",
      },
      llm: {
        chatModel: "gpt-test",
        embeddingModel: "embed-test",
      },
      vectorStore: {
        indexName: "opseye-test",
      },
      queryResults: {
        ...(ttlSeconds !== undefined ? { ttlSeconds } : {}),
      },
      observability: {
        serviceName: "test",
        environment: "development",
        logLevel: "debug",
      },
    },
  });
}

describe("QueryResultRepository", () => {
  it("writes and reads queued and completed records", async () => {
    const client = new FakeRedisClient();
    const repository = createRepository(client);

    await repository.createQueued({
      queryRequest: {
        id: "query_1",
        query: "What caused the incident?",
        requestedAt: "2026-04-17T10:00:00.000Z",
        filters: {
          service: "checkout-api",
        },
      },
    });

    const queued = await repository.getByQueryId("query_1");
    expect(queued).toMatchObject({
      queryId: "query_1",
      status: "queued",
      query: "What caused the incident?",
      filters: {
        service: "checkout-api",
      },
    });

    await repository.markProcessing({
      queryId: "query_1",
      query: "What caused the incident?",
      requestedAt: "2026-04-17T10:00:00.000Z",
      filters: {
        service: "checkout-api",
      },
    });
    await repository.markCompleted("query_1", {
      queryId: "query_1",
      generatedAt: "2026-04-17T10:00:15.000Z",
      answer: "Likely checkout database saturation.",
      citations: ["chunk-1"],
      confidence: "medium",
      rootCauseHypothesis: "Checkout DB latency increased.",
      evidenceSummary: ["chunk-1: connection pool timeouts"],
      uncertainty: "Evidence is limited to the indexed time window.",
      recommendedNextSteps: ["Inspect the checkout database metrics."],
      references: [
        {
          chunkId: "chunk-1",
          service: "checkout-api",
          environment: "production",
          timestamp: "2026-04-17T10:00:01.000Z",
          level: "error",
          reason: "Top ranked evidence",
          score: 0.88,
        },
      ],
    });

    const completed = await repository.getByQueryId("query_1");
    expect(completed).toMatchObject({
      queryId: "query_1",
      status: "completed",
      result: {
        answer: "Likely checkout database saturation.",
      },
    });
  });

  it("applies TTL when configured", async () => {
    const client = new FakeRedisClient();
    const repository = createRepository(client, 900);

    await repository.createQueued({
      queryRequest: {
        id: "query_ttl",
        query: "What caused the incident?",
        requestedAt: "2026-04-17T10:00:00.000Z",
      },
    });

    expect(client.expirations.get("opsEye:query-result:query_ttl")).toBe(900);
  });
});
