import { describe, expect, it } from "vitest";

import { RawLogConnectorAdapter, buildNormalizationContext } from "../index";

describe("RawLogConnectorAdapter", () => {
  it("normalizes raw log payloads into log events", () => {
    const adapter = new RawLogConnectorAdapter();

    const event = adapter.normalize(
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
      buildNormalizationContext({
        connectorName: adapter.connectorName,
        defaultSource: "logs.raw",
      }),
    );

    expect(event).toMatchObject({
      eventType: "log",
      source: "logs.raw",
      service: "checkout-api",
      environment: "production",
      severity: "error",
      level: "error",
      requestId: "req-123",
      correlationId: "corr-456",
      normalizedSummary: "database timeout while fetching order summary",
      tags: expect.arrayContaining([
        "eventType:log",
        "service:checkout-api",
        "environment:production",
        "severity:error",
      ]),
      rawPayload: {
        message: " database timeout while fetching order summary ",
        attributes: {
          request_id: "req-123",
          correlation_id: "corr-456",
          retry: true,
        },
      },
    });
    expect(event.id).toMatch(/^log_/);
  });
});
