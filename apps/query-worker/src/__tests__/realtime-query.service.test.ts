import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "@opseye/config";
import type { AppLogger } from "@opseye/observability";
import type {
  QueryEmbedding,
  QueryExecutionResult,
  QueryRequest,
  RealtimeQueryEvent,
} from "@opseye/types";

import { RealtimeQueryExecutionService } from "../services/realtime-query.service";
import type { AnswerService } from "../services/answer.service";
import type { ContextBuilderService } from "../services/context-builder.service";
import type { RerankingService } from "../services/reranking.service";
import type { RetrievalService } from "../services/retrieval.service";

vi.mock("@opseye/llm", () => ({
  embedText: vi.fn(),
}));

const { embedText } = await import("@opseye/llm");

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
    id: "query_realtime_1",
    query: "What caused the checkout incident?",
    requestedAt: "2026-04-18T09:00:00.000Z",
    filters: {
      service: "checkout-api",
      environment: "production",
    },
  };
}

function createQueryEmbedding(): QueryEmbedding {
  return {
    queryId: "query_realtime_1",
    model: "text-embedding-test",
    vector: [0.1, 0.2, 0.3],
  };
}

function createAnswer(): QueryExecutionResult {
  return {
    queryId: "query_realtime_1",
    generatedAt: "2026-04-18T09:00:02.000Z",
    answer: "Checkout database saturation is the most likely issue.",
    citations: ["chunk-1"],
    confidence: "medium",
    rootCauseHypothesis: "Database latency increased.",
    evidenceSummary: ["chunk-1: connection pool timeouts"],
    uncertainty: "Evidence is limited to the indexed time window.",
    recommendedNextSteps: ["Inspect primary database latency and saturation."],
    possibleRemediations: [
      "Reduce pressure on the checkout database after validating the saturation signal.",
    ],
    references: [
      {
        chunkId: "chunk-1",
        service: "checkout-api",
        environment: "production",
        timestamp: "2026-04-18T08:59:00.000Z",
        level: "error",
        reason: "Top reranked evidence",
        score: 0.94,
      },
    ],
  };
}

describe("RealtimeQueryExecutionService", () => {
  it("emits stage progress events in order and returns the final answer", async () => {
    vi.mocked(embedText).mockResolvedValue({
      model: "text-embedding-test",
      embedding: createQueryEmbedding().vector,
    });

    const retrieve = vi.fn<RetrievalService["retrieve"]>().mockResolvedValue([
      {
        chunkId: "chunk-1",
        content: "database timeout while fetching order summary",
        metadata: {
          service: "checkout-api",
          environment: "production",
          timestamp: "2026-04-18T08:59:00.000Z",
          level: "error",
          traceId: "trace-1",
          chunkStrategy: "semantic",
          sourceLogIds: ["log-1"],
        },
        embeddingModel: "text-embedding-test",
        vectorDistance: 0.12,
        vectorScore: 0.88,
      },
    ]);
    const rerank = vi.fn<RerankingService["rerank"]>().mockReturnValue([
      {
        chunkId: "chunk-1",
        content: "database timeout while fetching order summary",
        metadata: {
          service: "checkout-api",
          environment: "production",
          timestamp: "2026-04-18T08:59:00.000Z",
          level: "error",
          traceId: "trace-1",
          chunkStrategy: "semantic",
          sourceLogIds: ["log-1"],
        },
        embeddingModel: "text-embedding-test",
        vectorDistance: 0.12,
        vectorScore: 0.88,
        recencyScore: 0.9,
        metadataScore: 0.8,
        finalScore: 0.89,
        rankingReasons: ["vector=0.880"],
      },
    ]);
    const build = vi.fn<ContextBuilderService["build"]>().mockReturnValue({
      summary: "summary",
      evidence: [
        {
          chunkId: "chunk-1",
          service: "checkout-api",
          environment: "production",
          timestamp: "2026-04-18T08:59:00.000Z",
          level: "error",
          traceId: "trace-1",
          summary: "database timeout while fetching order summary",
          rationale: ["checkout-api/production"],
          finalScore: 0.89,
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
          timestamp: "2026-04-18T08:59:00.000Z",
          service: "checkout-api",
          level: "error",
          summary: "database timeout while fetching order summary",
          traceId: "trace-1",
        },
      ],
    });
    const generate = vi
      .fn<AnswerService["generate"]>()
      .mockResolvedValue(createAnswer());
    const events: RealtimeQueryEvent[] = [];

    const service = new RealtimeQueryExecutionService({
      appConfig: createAppConfig(),
      logger: createTestLogger(),
      retrievalService: {
        retrieve,
      } as unknown as RetrievalService,
      rerankingService: {
        rerank,
      } as unknown as RerankingService,
      contextBuilderService: {
        build,
      } as unknown as ContextBuilderService,
      answerService: {
        generate,
      } as unknown as AnswerService,
    });

    const result = await service.execute({
      queryRequest: createQueryRequest(),
      onEvent: (event) => {
        events.push(event);
      },
    });

    expect(events.map((event) => event.stage)).toEqual([
      "started",
      "retrieving",
      "reranking",
      "building_context",
      "generating_answer",
      "completed",
    ]);
    expect(result.finalAnswer.answer).toBe(
      "Checkout database saturation is the most likely issue.",
    );
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(rerank).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("emits a failed event when realtime execution throws", async () => {
    vi.mocked(embedText).mockRejectedValue(
      new Error("Embedding provider unavailable"),
    );

    const events: RealtimeQueryEvent[] = [];

    const service = new RealtimeQueryExecutionService({
      appConfig: createAppConfig(),
      logger: createTestLogger(),
      retrievalService: {} as RetrievalService,
      rerankingService: {} as RerankingService,
      contextBuilderService: {} as ContextBuilderService,
      answerService: {} as AnswerService,
    });

    await expect(
      service.execute({
        queryRequest: createQueryRequest(),
        onEvent: (event) => {
          events.push(event);
        },
      }),
    ).rejects.toThrow("Embedding provider unavailable");

    expect(events.map((event) => event.stage)).toEqual(["started", "failed"]);
    expect(events[1]).toMatchObject({
      stage: "failed",
      payload: {
        error:
          "Realtime query execution failed. Review API logs with the query ID for details.",
      },
    });
  });
});
