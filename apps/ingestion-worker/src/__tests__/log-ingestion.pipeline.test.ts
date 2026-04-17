import { describe, expect, it } from "vitest";

import { chunkLogs } from "../pipeline/chunk.step";
import { enrichLogs } from "../pipeline/enrich.step";
import { normalizeLogs } from "../pipeline/normalize.step";

describe("log ingestion pipeline", () => {
  it("keeps the existing log path working through normalized events", () => {
    const normalizedLogs = normalizeLogs([
      {
        message: "database timeout while fetching order summary",
        timestamp: "2026-04-17T10:00:15.000Z",
        service: "checkout-api",
        environment: "production",
        level: "error",
        traceId: "trace-1",
        attributes: {
          request_id: "req-123",
        },
      },
      {
        message: "database connection recovered after retry",
        timestamp: "2026-04-17T10:00:30.000Z",
        service: "checkout-api",
        environment: "production",
        level: "warn",
        traceId: "trace-1",
      },
    ]);

    const enrichedLogs = enrichLogs(normalizedLogs);
    const chunks = chunkLogs(enrichedLogs, {
      windowMs: 60_000,
      maxLogsPerChunk: 25,
      summaryMinGroupSize: 2,
    });

    expect(normalizedLogs[0]).toMatchObject({
      eventType: "log",
      severity: "error",
      requestId: "req-123",
    });
    expect(enrichedLogs[0]?.evidenceText).toContain("severity=error");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((chunk) => chunk.metadata.traceId === "trace-1")).toBe(
      true,
    );
    expect(chunks.some((chunk) => chunk.metadata.sourceLogIds.length > 0)).toBe(
      true,
    );
  });
});
