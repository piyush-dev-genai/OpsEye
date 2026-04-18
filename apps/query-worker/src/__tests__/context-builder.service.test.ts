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
      `Error: Database timeout on node ${index}. Connection pool saturation was detected. Informational context that should not dominate the summary.`,
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
  it("builds grouped evidence and a timeline-oriented summary", () => {
    const service = new ContextBuilderService(createTestLogger());
    const queryRequest: QueryRequest = {
      id: "query-1",
      query: "What caused the checkout-api incident?",
      requestedAt: "2026-04-17T10:05:00.000Z",
    };
    const rerankedChunks = [
      createRerankedChunk(1, {
        chunkId: "chunk-1",
        metadata: {
          service: "checkout-api",
          environment: "production",
          timestamp: "2026-04-17T10:01:00.000Z",
          level: "error",
          traceId: "trace-1",
          chunkStrategy: "trace",
          sourceLogIds: ["log-1"],
        },
      }),
      createRerankedChunk(2, {
        chunkId: "chunk-2",
        metadata: {
          service: "payments-api",
          environment: "production",
          timestamp: "2026-04-17T10:02:00.000Z",
          level: "error",
          traceId: "trace-2",
          chunkStrategy: "semantic",
          sourceLogIds: ["log-2"],
        },
      }),
      createRerankedChunk(3, {
        chunkId: "chunk-3",
        metadata: {
          service: "checkout-api",
          environment: "production",
          timestamp: "2026-04-17T10:03:00.000Z",
          level: "warn",
          traceId: "trace-1",
          chunkStrategy: "trace",
          sourceLogIds: ["log-3"],
        },
      }),
    ];

    const result = service.build({
      queryRequest,
      rerankedChunks,
    });

    expect(result.evidence).toHaveLength(3);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]?.label).toBe("Trace trace-1");
    expect(result.groups[0]?.itemCount).toBe(2);
    expect(result.timeline.map((item) => item.chunkId)).toEqual([
      "chunk-1",
      "chunk-2",
      "chunk-3",
    ]);
    expect(result.evidence[0]?.summary).toContain("Database timeout");
    expect(result.summary).toContain("Evidence groups:");
    expect(result.summary).toContain("Timeline:");
    expect(result.summary).toContain("Trace trace-1");
  });
});
