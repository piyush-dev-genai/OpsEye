import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EnrichedLogRecord } from "../mappers/log.mapper";
import { semanticChunk } from "../chunking/semantic.chunker";

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
  const level = overrides.level ?? "error";
  const source = overrides.source ?? "logs.raw";

  return {
    id: overrides.id ?? "log-1",
    eventType: overrides.eventType ?? "log",
    source,
    ingestionTimestamp:
      overrides.ingestionTimestamp ?? "2026-04-17T12:00:01.000Z",
    message: overrides.message ?? "database timeout while fetching order",
    timestamp: overrides.timestamp ?? "2026-04-17T12:00:00.000Z",
    service: overrides.service ?? "checkout-api",
    environment: overrides.environment ?? "production",
    severity: overrides.severity ?? level,
    level,
    ...(overrides.traceId !== undefined ? { traceId: overrides.traceId } : {}),
    ...(overrides.attributes !== undefined
      ? { attributes: overrides.attributes }
      : {}),
    ...(overrides.requestId !== undefined
      ? { requestId: overrides.requestId }
      : {}),
    ...(overrides.correlationId !== undefined
      ? { correlationId: overrides.correlationId }
      : {}),
    tags: overrides.tags ?? [
      "eventType:log",
      "service:checkout-api",
      "environment:production",
      `severity:${level}`,
      `source:${source}`,
    ],
    rawPayload:
      overrides.rawPayload ??
      ({
        message: overrides.message ?? "database timeout while fetching order",
      } as const),
    normalizedMessage:
      overrides.normalizedMessage ?? "database timeout while fetching order",
    normalizedSummary:
      overrides.normalizedSummary ?? "database timeout while fetching order",
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

describe("semanticChunk", () => {
  beforeEach(() => {
    mockState.nextId = 1;
  });

  it("creates one message chunk per log and preserves metadata", () => {
    const logs = [
      createEnrichedLogRecord({ id: "log-1", traceId: "trace-1" }),
      createEnrichedLogRecord({
        id: "log-2",
        timestamp: "2026-04-17T12:00:30.000Z",
        level: "warn",
        traceId: "trace-2",
      }),
    ];

    expect(semanticChunk(logs)).toEqual([
      {
        chunkId: "chunk_0001",
        content: [
          "RAW LOG EVIDENCE",
          logs[0]?.evidenceText,
          "",
          "RETRIEVAL CONTEXT",
          logs[0]?.retrievalText,
        ].join("\n"),
        metadata: {
          service: "checkout-api",
          environment: "production",
          timestamp: "2026-04-17T12:00:00.000Z",
          level: "error",
          traceId: "trace-1",
          chunkStrategy: "message",
          sourceLogIds: ["log-1"],
        },
      },
      {
        chunkId: "chunk_0002",
        content: [
          "RAW LOG EVIDENCE",
          logs[1]?.evidenceText,
          "",
          "RETRIEVAL CONTEXT",
          logs[1]?.retrievalText,
        ].join("\n"),
        metadata: {
          service: "checkout-api",
          environment: "production",
          timestamp: "2026-04-17T12:00:30.000Z",
          level: "warn",
          traceId: "trace-2",
          chunkStrategy: "message",
          sourceLogIds: ["log-2"],
        },
      },
    ]);
  });
});
