import { describe, expect, it, vi } from "vitest";

import type { AppLogger } from "@opseye/observability";
import type {
  PersistedQueryResult,
  QueryExecutionResult,
  QueryRequest,
} from "@opseye/types";
import type { QueryResultRepository } from "@opseye/vector-store";

import {
  QueryExecutionService,
  QUERY_EXECUTION_FAILED_MESSAGE,
} from "../services/query-execution.service";
import type { QueryWorkflow } from "../workflow/build-graph";

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

function createQueryRequest(): QueryRequest {
  return {
    id: "query_1",
    query: "What caused the checkout incident?",
    requestedAt: "2026-04-17T10:00:00.000Z",
    filters: {
      service: "checkout-api",
      environment: "production",
    },
  };
}

function createAnswer(): QueryExecutionResult {
  return {
    queryId: "query_1",
    generatedAt: "2026-04-17T10:00:15.000Z",
    answer: "Likely checkout database saturation.",
    citations: ["chunk-1"],
    confidence: "medium",
    rootCauseHypothesis: "Database latency increased.",
    evidenceSummary: ["chunk-1: connection pool timeouts"],
    uncertainty: "Evidence is limited to the indexed time window.",
    recommendedNextSteps: ["Inspect the primary database latency."],
    references: [
      {
        chunkId: "chunk-1",
        service: "checkout-api",
        environment: "production",
        timestamp: "2026-04-17T10:00:01.000Z",
        level: "error",
        reason: "Top ranked evidence",
        score: 0.9,
      },
    ],
  };
}

describe("QueryExecutionService", () => {
  it("marks processing and completion around workflow execution", async () => {
    const queryRequest = createQueryRequest();
    const workflow = {
      invoke: vi.fn(async () => ({
        queryRequest,
        retrievedChunks: [],
        rerankedChunks: [],
        finalAnswer: createAnswer(),
      })),
    } satisfies QueryWorkflow;
    const markProcessing = vi.fn<
      QueryResultRepository["markProcessing"]
    >();
    const markCompleted = vi.fn<QueryResultRepository["markCompleted"]>();
    const markFailed = vi.fn<QueryResultRepository["markFailed"]>();

    markProcessing.mockResolvedValue({
      queryId: queryRequest.id,
      query: queryRequest.query,
      requestedAt: queryRequest.requestedAt,
      updatedAt: "2026-04-17T10:00:01.000Z",
      status: "processing",
      filters: queryRequest.filters,
    } satisfies PersistedQueryResult);
    markCompleted.mockResolvedValue({
      queryId: queryRequest.id,
      query: queryRequest.query,
      requestedAt: queryRequest.requestedAt,
      updatedAt: "2026-04-17T10:00:15.000Z",
      status: "completed",
      filters: queryRequest.filters,
      result: createAnswer(),
    } satisfies PersistedQueryResult);

    const service = new QueryExecutionService({
      workflow,
      queryResultRepository: {
        markProcessing,
        markCompleted,
        markFailed,
      } as unknown as QueryResultRepository,
      logger: createTestLogger(),
    });

    await service.execute(queryRequest);

    expect(markProcessing).toHaveBeenCalledWith({
      queryId: queryRequest.id,
      query: queryRequest.query,
      requestedAt: queryRequest.requestedAt,
      filters: queryRequest.filters,
    });
    expect(markCompleted).toHaveBeenCalledWith(
      queryRequest.id,
      expect.objectContaining({
        answer: "Likely checkout database saturation.",
      }),
    );
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("marks failed when workflow execution throws", async () => {
    const queryRequest = createQueryRequest();
    const workflow = {
      invoke: vi.fn(async () => {
        throw new Error("LLM timed out");
      }),
    } satisfies QueryWorkflow;
    const markProcessing = vi.fn<
      QueryResultRepository["markProcessing"]
    >();
    const markCompleted = vi.fn<QueryResultRepository["markCompleted"]>();
    const markFailed = vi.fn<QueryResultRepository["markFailed"]>();

    markProcessing.mockResolvedValue({
      queryId: queryRequest.id,
      query: queryRequest.query,
      requestedAt: queryRequest.requestedAt,
      updatedAt: "2026-04-17T10:00:01.000Z",
      status: "processing",
      filters: queryRequest.filters,
    } satisfies PersistedQueryResult);
    markFailed.mockResolvedValue({
      queryId: queryRequest.id,
      query: queryRequest.query,
      requestedAt: queryRequest.requestedAt,
      updatedAt: "2026-04-17T10:00:02.000Z",
      status: "failed",
      filters: queryRequest.filters,
      error: QUERY_EXECUTION_FAILED_MESSAGE,
    } satisfies PersistedQueryResult);

    const service = new QueryExecutionService({
      workflow,
      queryResultRepository: {
        markProcessing,
        markCompleted,
        markFailed,
      } as unknown as QueryResultRepository,
      logger: createTestLogger(),
    });

    await expect(service.execute(queryRequest)).rejects.toThrow("LLM timed out");
    expect(markFailed).toHaveBeenCalledWith(
      queryRequest.id,
      QUERY_EXECUTION_FAILED_MESSAGE,
    );
    expect(markCompleted).not.toHaveBeenCalled();
  });
});
