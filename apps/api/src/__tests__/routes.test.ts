import { createServer, type Server } from "node:http";

import request, { type Response as SupertestResponse } from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "@opseye/config";
import type { AppLogger } from "@opseye/observability";
import type { PersistedQueryResult } from "@opseye/types";

import { createApp } from "../app";
import type { IngestPublisherService } from "../services/ingest-publisher.service";
import type { QueryOrchestratorService } from "../services/query-orchestrator.service";
import type { QueryResultRepository } from "@opseye/vector-store";

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

async function startServer(app: ReturnType<typeof createApp>): Promise<Server> {
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("error", onError);
      reject(error);
    };

    server.on("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  return server;
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined && error !== null) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe.skipIf(!canRunHttpServer)("API routes", () => {
  const logger = createTestLogger();
  const publishLogs = vi.fn<IngestPublisherService["publishLogs"]>();
  const submitQuery = vi.fn<QueryOrchestratorService["submitQuery"]>();
  const getByQueryId = vi.fn<QueryResultRepository["getByQueryId"]>();

  beforeEach(() => {
    publishLogs.mockReset();
    submitQuery.mockReset();
    getByQueryId.mockReset();
  });

  it("accepts ingest requests and propagates request IDs", async () => {
    publishLogs.mockResolvedValue({
      topic: "logs.raw",
      publishedCount: 1,
    });

    const app = createApp({
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
    });
    const server = await startServer(app);
    let response: SupertestResponse;

    try {
      response = await request(server)
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
    } finally {
      await stopServer(server);
    }

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
    const app = createApp({
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
    });
    const server = await startServer(app);
    let response: SupertestResponse;

    try {
      response = await request(server)
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
    } finally {
      await stopServer(server);
    }

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

    const app = createApp({
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
    });
    const server = await startServer(app);
    let response: SupertestResponse;

    try {
      response = await request(server)
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
    } finally {
      await stopServer(server);
    }

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
    const app = createApp({
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
    });
    const server = await startServer(app);
    let response: SupertestResponse;

    try {
      response = await request(server)
        .post("/query")
        .set("x-request-id", "req-invalid-query")
        .send({
          query: "What caused the incident?",
          filters: {
            fromTimestamp: "2026-04-17T10:10:00.000Z",
            toTimestamp: "2026-04-17T10:00:00.000Z",
          },
        });
    } finally {
      await stopServer(server);
    }

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

    const app = createApp({
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
    });
    const server = await startServer(app);
    let response: SupertestResponse;

    try {
      response = await request(server)
        .get("/query/query_123")
        .set("x-request-id", "req-query-get-1");
    } finally {
      await stopServer(server);
    }

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

    const app = createApp({
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
    });
    const server = await startServer(app);
    let response: SupertestResponse;

    try {
      response = await request(server)
        .get("/query/query_456")
        .set("x-request-id", "req-query-get-2");
    } finally {
      await stopServer(server);
    }

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      queryId: "query_456",
      status: "completed",
      result: persisted.result,
    });
  });

  it("returns 404 when a persisted query result is missing", async () => {
    getByQueryId.mockResolvedValue(null);

    const app = createApp({
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
    });
    const server = await startServer(app);
    let response: SupertestResponse;

    try {
      response = await request(server)
        .get("/query/query_missing")
        .set("x-request-id", "req-query-get-404");
    } finally {
      await stopServer(server);
    }

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "query_result_not_found",
        message: "Query result was not found.",
        requestId: "req-query-get-404",
      },
    });
  });
});
