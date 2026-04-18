import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppLogger } from "@opseye/observability";
import type { QueryRequest } from "@opseye/types";

import { RerankingService } from "../services/reranking.service";
import type { RetrievedChunkRecord } from "../workflow/state";

function createTestLogger(): AppLogger {
  return {
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(() => createTestLogger()),
    getWinstonLogger: vi.fn(
      () => ({}),
    ) as unknown as AppLogger["getWinstonLogger"],
  };
}

function createRetrievedChunk(
  overrides: Partial<RetrievedChunkRecord> = {},
): RetrievedChunkRecord {
  return {
    chunkId: overrides.chunkId ?? "chunk-1",
    content:
      overrides.content ?? "database timeout while fetching order summary",
    metadata: {
      service: overrides.metadata?.service ?? "checkout-api",
      environment: overrides.metadata?.environment ?? "production",
      timestamp: overrides.metadata?.timestamp ?? "2026-04-17T10:00:00.000Z",
      level: overrides.metadata?.level ?? "error",
      ...(overrides.metadata?.traceId !== undefined
        ? { traceId: overrides.metadata.traceId }
        : {}),
      chunkStrategy: overrides.metadata?.chunkStrategy ?? "trace",
      sourceLogIds: overrides.metadata?.sourceLogIds ?? ["log-1"],
    },
    embeddingModel: overrides.embeddingModel ?? "text-embedding-3-small",
    vectorDistance: overrides.vectorDistance ?? 0.1,
    vectorScore: overrides.vectorScore ?? 0.9,
  };
}

describe("RerankingService", () => {
  const logger = createTestLogger();
  const service = new RerankingService(logger);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deduplicates near-identical chunks from the same trace context", () => {
    const queryRequest: QueryRequest = {
      id: "query-1",
      query: "What caused the checkout incident?",
      requestedAt: "2026-04-17T12:00:00.000Z",
      filters: {
        service: "checkout-api",
        environment: "production",
      },
    };

    const result = service.rerank({
      queryRequest,
      retrievedChunks: [
        createRetrievedChunk({
          chunkId: "chunk-1",
          metadata: {
            service: "checkout-api",
            environment: "production",
            timestamp: "2026-04-17T11:59:10.000Z",
            level: "error",
            traceId: "trace-1",
            chunkStrategy: "trace",
            sourceLogIds: ["log-1"],
          },
          content: "Database timeout while fetching order summary for request 123.",
          vectorScore: 0.95,
        }),
        createRetrievedChunk({
          chunkId: "chunk-2",
          metadata: {
            service: "checkout-api",
            environment: "production",
            timestamp: "2026-04-17T11:59:35.000Z",
            level: "error",
            traceId: "trace-1",
            chunkStrategy: "trace",
            sourceLogIds: ["log-2"],
          },
          content: "Database timeout while fetching order summary for request 456.",
          vectorScore: 0.93,
        }),
        createRetrievedChunk({
          chunkId: "chunk-3",
          metadata: {
            service: "payments-api",
            environment: "production",
            timestamp: "2026-04-17T11:58:00.000Z",
            level: "error",
            traceId: "trace-9",
            chunkStrategy: "semantic",
            sourceLogIds: ["log-3"],
          },
          content: "Payment gateway retries increased after upstream timeout.",
          vectorScore: 0.9,
        }),
      ],
    });

    expect(result.map((chunk) => chunk.chunkId)).toEqual(["chunk-1", "chunk-2", "chunk-3"]);
  });

  it("adds diversity for broad queries while keeping trace-scoped queries focused", () => {
    const broadQuery: QueryRequest = {
      id: "query-broad",
      query: "What caused the production incident?",
      requestedAt: "2026-04-17T12:00:00.000Z",
    };
    const traceScopedQuery: QueryRequest = {
      id: "query-trace",
      query: "What failed on trace-1?",
      requestedAt: "2026-04-17T12:00:00.000Z",
      filters: {
        traceId: "trace-1",
        environment: "production",
      },
    };
    const repeatedServiceChunk = createRetrievedChunk({
      chunkId: "chunk-checkout-1",
      metadata: {
        service: "checkout-api",
        environment: "production",
        timestamp: "2026-04-17T11:59:00.000Z",
        level: "error",
        traceId: "trace-1",
        chunkStrategy: "semantic",
        sourceLogIds: ["log-1"],
      },
      content: "Checkout service threw connection timeout errors.",
      vectorScore: 0.94,
    });
    const repeatedServiceChunkTwo = createRetrievedChunk({
      chunkId: "chunk-checkout-2",
      metadata: {
        service: "checkout-api",
        environment: "production",
        timestamp: "2026-04-17T11:58:30.000Z",
        level: "error",
        traceId: "trace-2",
        chunkStrategy: "semantic",
        sourceLogIds: ["log-2"],
      },
      content: "Checkout service fallback pool saturation increased latency.",
      vectorScore: 0.93,
    });
    const crossServiceChunk = createRetrievedChunk({
      chunkId: "chunk-payments-1",
      metadata: {
        service: "payments-api",
        environment: "production",
        timestamp: "2026-04-17T11:58:45.000Z",
        level: "error",
        traceId: "trace-3",
        chunkStrategy: "semantic",
        sourceLogIds: ["log-3"],
      },
      content: "Payments service reported upstream checkout timeout and retries.",
      vectorScore: 0.9,
    });
    const outsideTraceChunk = createRetrievedChunk({
      chunkId: "chunk-outside-trace",
      metadata: {
        service: "inventory-api",
        environment: "production",
        timestamp: "2026-04-17T11:59:10.000Z",
        level: "error",
        traceId: "trace-99",
        chunkStrategy: "trace",
        sourceLogIds: ["log-4"],
      },
      content: "Inventory trace failed independently.",
      vectorScore: 0.98,
    });

    const broadResult = service.rerank({
      queryRequest: broadQuery,
      retrievedChunks: [
        repeatedServiceChunk,
        repeatedServiceChunkTwo,
        crossServiceChunk,
      ],
    });
    const traceResult = service.rerank({
      queryRequest: traceScopedQuery,
      retrievedChunks: [outsideTraceChunk, repeatedServiceChunk],
    });

    expect(
      broadResult.slice(0, 2).map((chunk) => chunk.metadata.service),
    ).toEqual(["checkout-api", "payments-api"]);
    expect(broadResult[1]?.rankingReasons).toContain("broad-query service diversity");
    expect(traceResult[0]?.chunkId).toBe("chunk-checkout-1");
    expect(traceResult[1]?.rankingReasons).toContain("trace mismatch");
  });
});
