import { describe, expect, it } from "vitest";

import { ingestRequestSchema } from "../schemas/ingest.schema";
import { queryRequestSchema } from "../schemas/query.schema";

describe("ingestRequestSchema", () => {
  it("accepts a valid ingest payload", () => {
    const payload = {
      logs: [
        {
          message: "database timeout while fetching order summary",
          timestamp: "2026-04-17T10:00:15.000Z",
          service: "checkout-api",
          environment: "production",
          level: "error",
          traceId: "trace-1",
        },
      ],
    };

    expect(ingestRequestSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const payload = {
      logs: [
        {
          timestamp: "2026-04-17T10:00:15.000Z",
          service: "checkout-api",
          environment: "production",
          level: "error",
        },
      ],
    };

    const parsed = ingestRequestSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid enum values", () => {
    const payload = {
      logs: [
        {
          message: "database timeout while fetching order summary",
          timestamp: "2026-04-17T10:00:15.000Z",
          service: "checkout-api",
          environment: "prod",
          level: "critical",
        },
      ],
    };

    const parsed = ingestRequestSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid timestamps", () => {
    const payload = {
      logs: [
        {
          message: "database timeout while fetching order summary",
          timestamp: "2026/04/17 10:00:15",
          service: "checkout-api",
          environment: "production",
          level: "error",
        },
      ],
    };

    const parsed = ingestRequestSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
  });
});

describe("queryRequestSchema", () => {
  it("accepts a valid query payload", () => {
    const payload = {
      query: "What caused the checkout-api incident?",
      filters: {
        service: "checkout-api",
        environment: "production",
        fromTimestamp: "2026-04-17T10:00:00.000Z",
        toTimestamp: "2026-04-17T10:05:00.000Z",
        traceId: "trace-1",
      },
    };

    expect(queryRequestSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const parsed = queryRequestSchema.safeParse({
      filters: {
        service: "checkout-api",
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid enum values", () => {
    const parsed = queryRequestSchema.safeParse({
      query: "What caused the incident?",
      filters: {
        environment: "prod",
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid timestamps and reversed ranges", () => {
    const invalidTimestamp = queryRequestSchema.safeParse({
      query: "What caused the incident?",
      filters: {
        fromTimestamp: "2026/04/17 10:00:00",
      },
    });
    const reversedRange = queryRequestSchema.safeParse({
      query: "What caused the incident?",
      filters: {
        fromTimestamp: "2026-04-17T10:05:00.000Z",
        toTimestamp: "2026-04-17T10:00:00.000Z",
      },
    });

    expect(invalidTimestamp.success).toBe(false);
    expect(reversedRange.success).toBe(false);
  });
});
