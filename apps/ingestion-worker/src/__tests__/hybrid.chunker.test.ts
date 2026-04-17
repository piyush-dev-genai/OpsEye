import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EnrichedLogRecord } from "../mappers/log.mapper";
import { hybridChunk } from "../chunking/hybrid.chunker";

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
    level: overrides.level ?? "error",
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

describe("hybridChunk", () => {
  beforeEach(() => {
    mockState.nextId = 1;
  });

  it("groups by traceId first and falls back to requestId for correlated chunks", () => {
    const logs = [
      createEnrichedLogRecord({
        id: "log-1",
        timestamp: "2026-04-17T12:00:00.000Z",
        traceId: "trace-1",
        groupingKey: "trace-1",
        summaryText: "trace failure started",
      }),
      createEnrichedLogRecord({
        id: "log-2",
        timestamp: "2026-04-17T12:00:15.000Z",
        traceId: "trace-1",
        groupingKey: "trace-1",
        level: "fatal",
        summaryText: "trace failure escalated",
      }),
      createEnrichedLogRecord({
        id: "log-3",
        timestamp: "2026-04-17T12:01:00.000Z",
        traceId: undefined,
        requestId: "req-9",
        groupingKey: "req-9",
        level: "warn",
        summaryText: "request retries started",
      }),
      createEnrichedLogRecord({
        id: "log-4",
        timestamp: "2026-04-17T12:01:10.000Z",
        traceId: undefined,
        requestId: "req-9",
        groupingKey: "req-9",
        level: "error",
        summaryText: "request failed after retries",
      }),
    ];

    const chunks = hybridChunk(logs, {
      windowMs: 60_000,
      summaryMinGroupSize: 2,
    });

    expect(chunks).toHaveLength(8);

    const traceContextChunk = chunks.find(
      (chunk) =>
        chunk.content.startsWith("TRACE CONTEXT") &&
        chunk.content.includes("groupKey=correlated:trace-1"),
    );
    const requestFallbackChunk = chunks.find(
      (chunk) =>
        chunk.content.startsWith("TRACE CONTEXT") &&
        chunk.content.includes("groupKey=correlated:req-9"),
    );
    const requestSummaryChunk = chunks.find(
      (chunk) =>
        chunk.content.startsWith("INCIDENT SUMMARY") &&
        chunk.content.includes("groupKey=correlated:req-9"),
    );

    expect(traceContextChunk).toMatchObject({
      metadata: {
        traceId: "trace-1",
        chunkStrategy: "trace",
        sourceLogIds: ["log-1", "log-2"],
      },
    });
    expect(requestFallbackChunk).toMatchObject({
      metadata: {
        chunkStrategy: "trace",
        sourceLogIds: ["log-3", "log-4"],
      },
    });
    expect(requestFallbackChunk?.metadata.traceId).toBeUndefined();
    expect(requestSummaryChunk?.content).toContain("requestId=req-9");
  });
});
