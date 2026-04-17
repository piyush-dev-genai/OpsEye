import request, { type Response as SupertestResponse } from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "@opseye/config";
import type { AppLogger } from "@opseye/observability";
import type { RealtimeQueryExecutionService } from "@opseye/query-worker";
import type { PersistedQueryResult } from "@opseye/types";
import type { QueryResultRepository } from "@opseye/vector-store";

import { createApp } from "../app";
import type { IngestPublisherService } from "../services/ingest-publisher.service";
import type { QueryOrchestratorService } from "../services/query-orchestrator.service";

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

function createTestConfig(): AppConfig {
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
      serviceName: "api",
      environment: "development",
      logLevel: "debug",
    },
  };
}

const canRunHttpServer = process.env.CODEX_SANDBOX === undefined;

describe.skipIf(!canRunHttpServer)("API routes", () => {
  const logger = createTestLogger();
  const publishLogs = vi.fn<IngestPublisherService["publishLogs"]>();
  const submitQuery = vi.fn<QueryOrchestratorService["submitQuery"]>();
  const getByQueryId = vi.fn<QueryResultRepository["getByQueryId"]>();
  const executeRealtime = vi.fn<RealtimeQueryExecutionService["execute"]>();

  function createTestApp() {
    return createApp({
      appConfig: createTestConfig(),
      logger,
      ingestPublisher: {
        publishLogs,
      } as unknown as IngestPublisherService,
      queryOrchestrator: {
        submitQuery,
      } as unknown as QueryOrchestratorService,
      queryResultRepository: {
        getByQueryId,
      } as unknown as QueryResultRepository,
      realtimeQueryExecutionService: {
        execute: executeRealtime,
      } as unknown as RealtimeQueryExecutionService,
    });
  }

  beforeEach(() => {
    publishLogs.mockReset();
    submitQuery.mockReset();
    getByQueryId.mockReset();
    executeRealtime.mockReset();
  });

  it("accepts ingest requests and propagates request IDs", async () => {
    publishLogs.mockResolvedValue({
      topic: "logs.raw",
      publishedCount: 1,
    });

    const app = createTestApp();
    let response: SupertestResponse;

    response = await request(app)
      .post("/ingest")
      .set("x-request-id", "req-test-1")
      .send({
        logs: [
          {
            message: "database timeout while fetching order summary",
            timestamp: "2026-04-17T10:00:15.000Z",
            service: "checkout-api",
            environment: "production",
            level: "error",
          },
        ],
      });

    expect(response.status).toBe(202);
    expect(response.headers["x-request-id"]).toBe("req-test-1");
    expect(response.body).toEqual({
      requestId: "req-test-1",
      status: "accepted",
      topic: "logs.raw",
      acceptedCount: 1,
    });
    expect(publishLogs).toHaveBeenCalledWith({
      requestId: "req-test-1",
      logs: [
        {
          message: "database timeout while fetching order summary",
          timestamp: "2026-04-17T10:00:15.000Z",
          service: "checkout-api",
          environment: "production",
          level: "error",
        },
      ],
    });
  });

  it("returns 400 for invalid ingest payloads", async () => {
    const app = createTestApp();
    let response: SupertestResponse;

    response = await request(app)
      .post("/ingest")
      .set("x-request-id", "req-invalid-ingest")
      .send({
        logs: [
          {
            message: "",
            timestamp: "bad-timestamp",
            service: "checkout-api",
            environment: "production",
            level: "error",
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("request_validation_error");
    expect(response.body.error.requestId).toBe("req-invalid-ingest");
    expect(publishLogs).not.toHaveBeenCalled();
  });

  it("accepts query requests and propagates request IDs", async () => {
    submitQuery.mockImplementation(async ({ queryRequest }) => ({
      topic: "query.requested",
      queryId: queryRequest.id,
    }));

    const app = createTestApp();
    let response: SupertestResponse;

    response = await request(app)
      .post("/query")
      .set("x-request-id", "req-test-2")
      .send({
        query: "What caused the checkout-api incident?",
        filters: {
          service: "checkout-api",
          environment: "production",
          fromTimestamp: "2026-04-17T10:00:00.000Z",
          toTimestamp: "2026-04-17T10:05:00.000Z",
          traceId: "trace-1",
        },
      });

    expect(response.status).toBe(202);
    expect(response.headers["x-request-id"]).toBe("req-test-2");
    expect(response.body.status).toBe("queued");
    expect(response.body.queryId).toMatch(/^query_/);
    expect(submitQuery).toHaveBeenCalledTimes(1);
    expect(submitQuery.mock.calls[0]?.[0]).toMatchObject({
      requestId: "req-test-2",
      queryRequest: {
        query: "What caused the checkout-api incident?",
        requestedAt: expect.any(String),
        filters: {
          service: "checkout-api",
          environment: "production",
          fromTimestamp: "2026-04-17T10:00:00.000Z",
          toTimestamp: "2026-04-17T10:05:00.000Z",
          traceId: "trace-1",
        },
      },
    });
  });

  it("returns 400 for invalid query payloads", async () => {
    const app = createTestApp();
    let response: SupertestResponse;

    response = await request(app)
      .post("/query")
      .set("x-request-id", "req-invalid-query")
      .send({
        query: "What caused the incident?",
        filters: {
          fromTimestamp: "2026-04-17T10:10:00.000Z",
          toTimestamp: "2026-04-17T10:00:00.000Z",
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("request_validation_error");
    expect(response.body.error.requestId).toBe("req-invalid-query");
    expect(submitQuery).not.toHaveBeenCalled();
  });

  it("returns queued query result status", async () => {
    const persisted: PersistedQueryResult = {
      queryId: "query_123",
      query: "What caused the incident?",
      requestedAt: "2026-04-17T10:00:00.000Z",
      updatedAt: "2026-04-17T10:00:05.000Z",
      status: "queued",
    };
    getByQueryId.mockResolvedValue(persisted);

    const app = createTestApp();
    let response: SupertestResponse;

    response = await request(app)
      .get("/query/query_123")
      .set("x-request-id", "req-query-get-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      queryId: "query_123",
      status: "queued",
    });
  });

  it("returns completed query results", async () => {
    const persisted: PersistedQueryResult = {
      queryId: "query_456",
      query: "What caused the incident?",
      requestedAt: "2026-04-17T10:00:00.000Z",
      updatedAt: "2026-04-17T10:00:10.000Z",
      status: "completed",
      result: {
        queryId: "query_456",
        generatedAt: "2026-04-17T10:00:10.000Z",
        answer: "Likely database timeout saturation.",
        citations: ["chunk-1"],
        confidence: "medium",
        rootCauseHypothesis: "Database latency spiked under load.",
        evidenceSummary: ["chunk-1: connection acquisition timeouts"],
        uncertainty: "Evidence is limited to indexed chunks.",
        recommendedNextSteps: ["Inspect the primary database latency."],
        references: [
          {
            chunkId: "chunk-1",
            service: "checkout-api",
            environment: "production",
            timestamp: "2026-04-17T10:00:01.000Z",
            level: "error",
            reason: "Highest-ranked chunk",
            score: 0.91,
          },
        ],
      },
    };
    getByQueryId.mockResolvedValue(persisted);

    const app = createTestApp();
    let response: SupertestResponse;

    response = await request(app)
      .get("/query/query_456")
      .set("x-request-id", "req-query-get-2");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      queryId: "query_456",
      status: "completed",
      result: persisted.result,
    });
  });

  it("returns 404 when a persisted query result is missing", async () => {
    getByQueryId.mockResolvedValue(null);

    const app = createTestApp();
    let response: SupertestResponse;

    response = await request(app)
      .get("/query/query_missing")
      .set("x-request-id", "req-query-get-404");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "query_result_not_found",
        message: "Query result was not found.",
        requestId: "req-query-get-404",
      },
    });
  });

  it("streams realtime chat query progress and completion over SSE", async () => {
    executeRealtime.mockImplementation(async ({ queryRequest, onEvent }) => {
      await onEvent?.({
        queryId: queryRequest.id,
        stage: "started",
        timestamp: "2026-04-18T09:00:00.000Z",
        payload: {
          query: queryRequest.query,
          ...(queryRequest.filters !== undefined
            ? { filters: queryRequest.filters }
            : {}),
        },
      });
      await onEvent?.({
        queryId: queryRequest.id,
        stage: "retrieving",
        timestamp: "2026-04-18T09:00:01.000Z",
        payload: {
          embeddingModel: "text-embedding-test",
        },
      });
      await onEvent?.({
        queryId: queryRequest.id,
        stage: "completed",
        timestamp: "2026-04-18T09:00:02.000Z",
        payload: {
          result: {
            queryId: queryRequest.id,
            generatedAt: "2026-04-18T09:00:02.000Z",
            answer: "The checkout database likely saturated under load.",
            citations: ["chunk-1"],
            confidence: "medium",
            rootCauseHypothesis: "Primary database latency increased.",
            evidenceSummary: ["chunk-1: checkout-api connection timeouts"],
            uncertainty: "Evidence is limited to indexed chunks.",
            recommendedNextSteps: ["Inspect database latency and saturation."],
            references: [
              {
                chunkId: "chunk-1",
                service: "checkout-api",
                environment: "production",
                timestamp: "2026-04-18T08:59:00.000Z",
                level: "error",
                reason: "Top reranked chunk",
                score: 0.93,
              },
            ],
          },
        },
      });

      return {
        queryRequest,
        queryEmbedding: {
          queryId: queryRequest.id,
          model: "text-embedding-test",
          vector: [0.1, 0.2],
        },
        retrievedChunks: [],
        rerankedChunks: [],
        builtContext: {
          summary: "summary",
          evidence: [],
        },
        finalAnswer: {
          queryId: queryRequest.id,
          generatedAt: "2026-04-18T09:00:02.000Z",
          answer: "The checkout database likely saturated under load.",
          citations: ["chunk-1"],
          confidence: "medium",
          rootCauseHypothesis: "Primary database latency increased.",
          evidenceSummary: ["chunk-1: checkout-api connection timeouts"],
          uncertainty: "Evidence is limited to indexed chunks.",
          recommendedNextSteps: ["Inspect database latency and saturation."],
          references: [
            {
              chunkId: "chunk-1",
              service: "checkout-api",
              environment: "production",
              timestamp: "2026-04-18T08:59:00.000Z",
              level: "error",
              reason: "Top reranked chunk",
              score: 0.93,
            },
          ],
        },
      };
    });

    const app = createTestApp();
    let response: SupertestResponse;

    response = await request(app)
      .post("/chat/query")
      .set("x-request-id", "req-chat-1")
      .send({
        query: "Investigate the checkout-api incident",
        filters: {
          service: "checkout-api",
          environment: "production",
        },
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.text).toContain("event: started");
    expect(response.text).toContain("event: retrieving");
    expect(response.text).toContain("event: completed");
    expect(response.text).toContain(
      '"answer":"The checkout database likely saturated under load."',
    );
    expect(executeRealtime).toHaveBeenCalledTimes(1);
    expect(executeRealtime.mock.calls[0]?.[0]).toMatchObject({
      queryRequest: {
        query: "Investigate the checkout-api incident",
        filters: {
          service: "checkout-api",
          environment: "production",
        },
      },
    });
    expect(submitQuery).not.toHaveBeenCalled();
  });

  it("streams failed realtime chat query events and closes the SSE response", async () => {
    executeRealtime.mockImplementation(async ({ queryRequest, onEvent }) => {
      await onEvent?.({
        queryId: queryRequest.id,
        stage: "started",
        timestamp: "2026-04-18T09:05:00.000Z",
        payload: {
          query: queryRequest.query,
        },
      });
      await onEvent?.({
        queryId: queryRequest.id,
        stage: "failed",
        timestamp: "2026-04-18T09:05:01.000Z",
        payload: {
          error:
            "Realtime query execution failed. Review API logs with the query ID for details.",
        },
      });

      throw new Error("LLM request timed out");
    });

    const app = createTestApp();
    let response: SupertestResponse;

    response = await request(app)
      .post("/chat/query")
      .set("x-request-id", "req-chat-2")
      .send({
        query: "Investigate the failing realtime query",
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain("event: started");
    expect(response.text).toContain("event: failed");
    expect(response.text).toContain(
      '"error":"Realtime query execution failed. Review API logs with the query ID for details."',
    );
  });
});
