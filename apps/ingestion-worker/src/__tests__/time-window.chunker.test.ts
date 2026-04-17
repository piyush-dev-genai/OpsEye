import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EnrichedLogRecord } from "../mappers/log.mapper";
import { timeWindowChunk } from "../chunking/time-window.chunker";

const mockState = vi.hoisted(() => ({ nextId: 1 }));

vi.mock("@opseye/utils", async () => {
  const actual =
    await vi.importActual<typeof import("@opseye/utils")>("@opseye/utils");

  return {
    ...actual,
    createPrefixedId: ({ prefix }: { readonly prefix: string }) =>
      `${prefix}_${String(mockState.nextId++).padStart(4, "0")}`,
  };
});

function createEnrichedLogRecord(
  overrides: Partial<EnrichedLogRecord> = {},
): EnrichedLogRecord {
  return {
    id: overrides.id ?? "log-1",
    ingestionTimestamp:
      overrides.ingestionTimestamp ?? "2026-04-17T12:00:01.000Z",
    message: overrides.message ?? "database timeout while fetching order",
    timestamp: overrides.timestamp ?? "2026-04-17T12:00:00.000Z",
    service: overrides.service ?? "checkout-api",
    environment: overrides.environment ?? "production",
    level: overrides.level ?? "info",
    ...(overrides.traceId !== undefined ? { traceId: overrides.traceId } : {}),
    ...(overrides.source !== undefined ? { source: overrides.source } : {}),
    ...(overrides.attributes !== undefined
      ? { attributes: overrides.attributes }
      : {}),
    ...(overrides.requestId !== undefined
      ? { requestId: overrides.requestId }
      : {}),
    ...(overrides.correlationId !== undefined
      ? { correlationId: overrides.correlationId }
      : {}),
    normalizedMessage:
      overrides.normalizedMessage ?? "database timeout while fetching order",
    messageTokens: overrides.messageTokens ?? [
      "database",
      "timeout",
      "fetching",
      "order",
    ],
    ...(overrides.attributeText !== undefined
      ? { attributeText: overrides.attributeText }
      : {}),
    evidenceText:
      overrides.evidenceText ??
      "timestamp=2026-04-17T12:00:00.000Z\nservice=checkout-api\nmessage=database timeout while fetching order",
    retrievalText:
      overrides.retrievalText ??
      "service checkout-api | environment production | severity error",
    summaryText:
      overrides.summaryText ??
      "checkout-api production error | database timeout",
    ...(overrides.groupingKey !== undefined
      ? { groupingKey: overrides.groupingKey }
      : {}),
  };
}

describe("timeWindowChunk", () => {
  beforeEach(() => {
    mockState.nextId = 1;
  });

  it("creates deterministic chunks with stable boundaries and preserved metadata", () => {
    const logs = [
      createEnrichedLogRecord({
        id: "log-2",
        timestamp: "2026-04-17T12:00:20.000Z",
        level: "error",
        traceId: "trace-1",
        summaryText: "checkout-api production error | pool saturation",
        normalizedMessage: "database pool saturation detected",
      }),
      createEnrichedLogRecord({
        id: "log-1",
        timestamp: "2026-04-17T12:00:00.000Z",
        level: "warn",
        traceId: "trace-1",
        summaryText: "checkout-api production warn | latency increased",
        normalizedMessage: "latency increased after retry storm",
      }),
      createEnrichedLogRecord({
        id: "log-3",
        timestamp: "2026-04-17T12:01:31.000Z",
        level: "info",
        traceId: "trace-2",
        summaryText: "checkout-api production info | recovery observed",
        normalizedMessage: "pool recovered after scaling event",
      }),
    ];

    const chunks = timeWindowChunk(logs, {
      windowMs: 60_000,
      maxLogsPerChunk: 5,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      chunkId: "chunk_0001",
      metadata: {
        service: "checkout-api",
        environment: "production",
        timestamp: "2026-04-17T12:00:00.000Z",
        level: "error",
        traceId: "trace-1",
        chunkStrategy: "time-window",
        sourceLogIds: ["log-1", "log-2"],
      },
    });
    expect(chunks[0]?.content).toContain(
      "timeRange=2026-04-17T12:00:00.000Z..2026-04-17T12:00:20.000Z",
    );
    expect(chunks[0]?.content).toContain(
      "[2026-04-17T12:00:00.000Z] [warn] checkout-api latency increased after retry storm (trace=trace-1)",
    );
    expect(chunks[0]?.content).toContain(
      "[2026-04-17T12:00:20.000Z] [error] checkout-api database pool saturation detected (trace=trace-1)",
    );

    expect(chunks[1]).toMatchObject({
      chunkId: "chunk_0002",
      metadata: {
        timestamp: "2026-04-17T12:01:31.000Z",
        level: "info",
        traceId: "trace-2",
        sourceLogIds: ["log-3"],
      },
    });
  });
});
