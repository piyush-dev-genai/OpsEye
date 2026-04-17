import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  calculateTimeDecayScore,
  combineWeightedScores,
} from "@opseye/retrieval";
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
  const queryRequest: QueryRequest = {
    id: "query-1",
    query: "What caused the checkout-api incident?",
    requestedAt: "2026-04-17T12:00:00.000Z",
    filters: {
      service: "checkout-api",
      environment: "production",
      traceId: "trace-1",
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ranks chunks by vector score, recency, and metadata adjustments", () => {
    const primaryChunk = createRetrievedChunk({
      chunkId: "chunk-primary",
      metadata: {
        service: "checkout-api",
        environment: "production",
        timestamp: "2026-04-17T11:45:00.000Z",
        level: "error",
        traceId: "trace-1",
        chunkStrategy: "trace",
        sourceLogIds: ["log-1"],
      },
      vectorScore: 0.9,
    });
    const secondaryChunk = createRetrievedChunk({
      chunkId: "chunk-secondary",
      metadata: {
        service: "payments-api",
        environment: "staging",
        timestamp: "2026-04-16T00:00:00.000Z",
        level: "info",
        traceId: "trace-x",
        chunkStrategy: "time-window",
        sourceLogIds: ["log-2"],
      },
      vectorScore: 0.95,
    });

    const result = service.rerank({
      queryRequest,
      retrievedChunks: [secondaryChunk, primaryChunk],
    });

    const primaryRecency = calculateTimeDecayScore("2026-04-17T11:45:00.000Z", {
      halfLifeMs: 1000 * 60 * 60 * 12,
      minScore: 0.1,
    });
    const secondaryRecency = calculateTimeDecayScore(
      "2026-04-16T00:00:00.000Z",
      {
        halfLifeMs: 1000 * 60 * 60 * 12,
        minScore: 0.1,
      },
    );

    expect(result.map((chunk) => chunk.chunkId)).toEqual([
      "chunk-primary",
      "chunk-secondary",
    ]);
    expect(result[0]?.finalScore).toBeCloseTo(
      combineWeightedScores([
        { score: 0.9, weight: 0.65 },
        { score: primaryRecency, weight: 0.25 },
        { score: 1, weight: 0.1 },
      ]),
    );
    expect(result[1]?.finalScore).toBeCloseTo(
      combineWeightedScores([
        { score: 0.95, weight: 0.65 },
        { score: secondaryRecency, weight: 0.25 },
        { score: 0, weight: 0.1 },
      ]),
    );
    expect(result[0]?.rankingReasons).toContain("service filter matched");
    expect(result[0]?.rankingReasons).toContain("trace matched");
    expect(result[1]?.rankingReasons).toContain("service filter mismatch");
    expect(result[1]?.rankingReasons).toContain("trace mismatch");
  });
});
