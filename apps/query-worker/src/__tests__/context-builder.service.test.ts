import { describe, expect, it, vi } from "vitest";

import type { AppLogger } from "@opseye/observability";
import type { QueryRequest } from "@opseye/types";

import { ContextBuilderService } from "../services/context-builder.service";
import type { RerankedChunkRecord } from "../workflow/state";

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

function createRerankedChunk(
  index: number,
  overrides: Partial<RerankedChunkRecord> = {},
): RerankedChunkRecord {
  return {
    chunkId: overrides.chunkId ?? `chunk-${index}`,
    content:
      overrides.content ??
      `Database timeout on node ${index}. `.repeat(20).trim(),
    metadata: {
      service: overrides.metadata?.service ?? "checkout-api",
      environment: overrides.metadata?.environment ?? "production",
      timestamp:
        overrides.metadata?.timestamp ?? `2026-04-17T10:0${index}:00.000Z`,
      level: overrides.metadata?.level ?? "error",
      ...(overrides.metadata?.traceId !== undefined
        ? { traceId: overrides.metadata.traceId }
        : { traceId: `trace-${index}` }),
      chunkStrategy: overrides.metadata?.chunkStrategy ?? "trace",
      sourceLogIds: overrides.metadata?.sourceLogIds ?? [`log-${index}`],
    },
    embeddingModel: overrides.embeddingModel ?? "text-embedding-3-small",
    vectorDistance: overrides.vectorDistance ?? 0.1,
    vectorScore: overrides.vectorScore ?? 0.9 - index * 0.01,
    recencyScore: overrides.recencyScore ?? 0.95 - index * 0.01,
    metadataScore: overrides.metadataScore ?? 0.9,
    finalScore: overrides.finalScore ?? 0.9 - index * 0.02,
    rankingReasons: overrides.rankingReasons ?? ["vector=0.900"],
  };
}

describe("ContextBuilderService", () => {
  it("builds compact evidence summaries from the top ranked chunks", () => {
    const service = new ContextBuilderService(createTestLogger());
    const queryRequest: QueryRequest = {
      id: "query-1",
      query: "What caused the checkout-api incident?",
      requestedAt: "2026-04-17T10:05:00.000Z",
    };
    const rerankedChunks = Array.from({ length: 6 }, (_, index) =>
      createRerankedChunk(index + 1),
    );

    const result = service.build({
      queryRequest,
      rerankedChunks,
    });

    expect(result.evidence).toHaveLength(5);
    expect(result.evidence[0]).toMatchObject({
      chunkId: "chunk-1",
      service: "checkout-api",
      environment: "production",
      level: "error",
      traceId: "trace-1",
    });
    expect(result.evidence[0]?.summary.length).toBeLessThanOrEqual(220);
    expect(result.evidence[0]?.summary.endsWith("...")).toBe(true);
    expect(result.evidence[0]?.rationale).toEqual([
      "checkout-api/production",
      "error at 2026-04-17T10:01:00.000Z",
      "score 0.880",
      "trace trace-1",
    ]);
    expect(result.summary).toContain(
      "Query: What caused the checkout-api incident?",
    );
    expect(result.summary).toContain("1. [chunk-1]");
    expect(result.summary).toContain("5. [chunk-5]");
    expect(result.summary).not.toContain("chunk-6");
  });
});
