import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "@opseye/config";
import type { AppLogger } from "@opseye/observability";
import type { QueryRequest } from "@opseye/types";

import { AnswerService } from "../services/answer.service";
import type { BuiltContext } from "../workflow/state";

vi.mock("@opseye/llm", () => ({
  completeChat: vi.fn(),
}));

const { completeChat } = await import("@opseye/llm");

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

function createAppConfig(): AppConfig {
  return {
    runtime: {
      nodeEnv: "test",
      appEnv: "development",
    },
    server: {
      host: "127.0.0.1",
      port: 3000,
    },
    kafka: {
      brokers: ["localhost:9092"],
      clientId: "opseye-test",
      groupIdPrefix: "opseye-test",
    },
    topics: {
      logsRaw: "logs.raw",
      queryRequested: "query.requested",
      deadletterEvents: "deadletter.events",
    },
    llm: {
      chatModel: "gpt-test",
      embeddingModel: "text-embedding-test",
    },
    vectorStore: {
      indexName: "opseye-test",
    },
    queryResults: {},
    observability: {
      serviceName: "query-worker",
      environment: "development",
      logLevel: "debug",
    },
  };
}

function createQueryRequest(): QueryRequest {
  return {
    id: "query-1",
    query: "What caused the checkout incident?",
    requestedAt: "2026-04-17T10:00:00.000Z",
  };
}

function createBuiltContext(): BuiltContext {
  return {
    summary: "summary",
    evidence: [
      {
        chunkId: "chunk-1",
        service: "checkout-api",
        environment: "production",
        timestamp: "2026-04-17T10:01:00.000Z",
        level: "error",
        traceId: "trace-1",
        summary: "Checkout database timeout and pool saturation.",
        rationale: ["checkout-api/production", "error at 2026-04-17T10:01:00.000Z"],
        finalScore: 0.91,
      },
    ],
    groups: [
      {
        groupKey: "trace:trace-1",
        label: "Trace trace-1",
        services: ["checkout-api"],
        itemCount: 1,
        items: [],
      },
    ],
    timeline: [
      {
        chunkId: "chunk-1",
        timestamp: "2026-04-17T10:01:00.000Z",
        service: "checkout-api",
        level: "error",
        summary: "Checkout database timeout and pool saturation.",
        traceId: "trace-1",
      },
    ],
  };
}

describe("AnswerService", () => {
  it("shapes structured answers with remediation candidates when the LLM responds", async () => {
    vi.mocked(completeChat).mockResolvedValue({
      model: "gpt-test",
      finishReason: "stop",
      content: JSON.stringify({
        rootCauseHypothesis: "Checkout database latency spiked.",
        evidenceSummary: ["checkout-api emitted repeated timeout errors"],
        uncertainty: "Evidence is limited to indexed application logs.",
        recommendedNextSteps: ["Inspect checkout database latency metrics."],
        possibleRemediations: ["Reduce traffic or rollback the triggering change."],
        confidence: "medium",
        answer: "ignored because structured formatter rewrites it",
      }),
    });

    const service = new AnswerService(createTestLogger(), createAppConfig());
    const result = await service.generate({
      queryRequest: createQueryRequest(),
      builtContext: createBuiltContext(),
    });

    expect(result.rootCauseHypothesis).toBe("Checkout database latency spiked.");
    expect(result.possibleRemediations).toEqual([
      "Reduce traffic or rollback the triggering change.",
    ]);
    expect(result.answer).toContain("Likely issue:");
    expect(result.answer).toContain("Possible remediation:");
  });

  it("returns a low-confidence fallback when no evidence is available", async () => {
    const service = new AnswerService(createTestLogger(), createAppConfig());
    const result = await service.generate({
      queryRequest: createQueryRequest(),
      builtContext: {
        summary: "summary",
        evidence: [],
        groups: [],
        timeline: [],
      },
    });

    expect(result.confidence).toBe("low");
    expect(result.evidenceSummary).toEqual([]);
    expect(result.possibleRemediations).toEqual([]);
    expect(result.answer).toContain("Supporting evidence: none.");
  });
});
