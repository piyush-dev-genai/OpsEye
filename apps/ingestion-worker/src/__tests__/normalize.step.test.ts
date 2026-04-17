import { describe, expect, it } from "vitest";

import { normalizeLogs } from "../pipeline/normalize.step";

describe("normalizeLogs", () => {
  it("normalizes raw logs into shared log events", () => {
    const [event] = normalizeLogs(
      [
        {
          message: " database timeout while fetching order summary ",
          timestamp: "2026-04-17T10:00:15.000Z",
          service: "checkout-api",
          environment: "production",
          level: "error",
          attributes: {
            request_id: "req-123",
            correlation_id: "corr-456",
            retry: true,
          },
        },
      ],
      {
        ingestionTimestamp: "2026-04-17T10:00:20.000Z",
      },
    );

    expect(event).toMatchObject({
      eventType: "log",
      source: "logs.raw",
      service: "checkout-api",
      environment: "production",
      timestamp: "2026-04-17T10:00:15.000Z",
      severity: "error",
      level: "error",
      ingestionTimestamp: "2026-04-17T10:00:20.000Z",
      requestId: "req-123",
      correlationId: "corr-456",
      normalizedSummary: "database timeout while fetching order summary",
      message: " database timeout while fetching order summary ",
    });
    expect(event?.rawPayload).toMatchObject({
      attributes: {
        request_id: "req-123",
        correlation_id: "corr-456",
        retry: true,
      },
    });
  });
});
