import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import type { AppLogger } from "@opseye/observability";
import type { RealtimeQueryExecutionService } from "@opseye/query-worker";

import { createChatQueryController } from "../controllers/chat-query.controller";

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

interface MockResponse {
  readonly response: Response;
  readonly body: { chunks: string[] };
  readonly headers: Record<string, string>;
  readonly statusCode: { value: number };
  readonly end: ReturnType<typeof vi.fn>;
}

function createMockResponse(): MockResponse {
  const headers: Record<string, string> = {};
  const body = { chunks: [] as string[] };
  const statusCode = { value: 200 };
  const responseObject = {
    status: vi.fn((code: number) => {
      statusCode.value = code;
      return responseObject;
    }),
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    flushHeaders: vi.fn(),
    write: vi.fn((chunk: string) => {
      body.chunks.push(chunk);
      return true;
    }),
    end: vi.fn(),
  };

  return {
    response: responseObject as unknown as Response,
    body,
    headers,
    statusCode,
    end: responseObject.end,
  };
}

function createMockRequest(body: { query: string }): Request {
  return {
    requestId: "req-chat-1",
    validatedBody: body,
    on: vi.fn(),
  } as unknown as Request;
}

describe("createChatQueryController", () => {
  it("streams SSE progress events and closes the response on success", async () => {
    const execute = vi
      .fn<RealtimeQueryExecutionService["execute"]>()
      .mockImplementation(async ({ queryRequest, onEvent }) => {
        await onEvent?.({
          queryId: queryRequest.id,
          stage: "started",
          timestamp: "2026-04-18T10:00:00.000Z",
          payload: {
            query: queryRequest.query,
          },
        });
        await onEvent?.({
          queryId: queryRequest.id,
          stage: "completed",
          timestamp: "2026-04-18T10:00:01.000Z",
          payload: {
            result: {
              queryId: queryRequest.id,
              generatedAt: "2026-04-18T10:00:01.000Z",
              answer: "Checkout database saturation is likely.",
              citations: ["chunk-1"],
              confidence: "medium",
              rootCauseHypothesis: "Database latency increased.",
              evidenceSummary: ["chunk-1: connection pool timeouts"],
              uncertainty: "Evidence is limited to indexed chunks.",
              recommendedNextSteps: ["Inspect database saturation."],
              references: [
                {
                  chunkId: "chunk-1",
                  service: "checkout-api",
                  environment: "production",
                  timestamp: "2026-04-18T09:59:00.000Z",
                  level: "error",
                  reason: "Top reranked chunk",
                  score: 0.92,
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
            generatedAt: "2026-04-18T10:00:01.000Z",
            answer: "Checkout database saturation is likely.",
            citations: ["chunk-1"],
            confidence: "medium",
            rootCauseHypothesis: "Database latency increased.",
            evidenceSummary: ["chunk-1: connection pool timeouts"],
            uncertainty: "Evidence is limited to indexed chunks.",
            recommendedNextSteps: ["Inspect database saturation."],
            references: [
              {
                chunkId: "chunk-1",
                service: "checkout-api",
                environment: "production",
                timestamp: "2026-04-18T09:59:00.000Z",
                level: "error",
                reason: "Top reranked chunk",
                score: 0.92,
              },
            ],
          },
        };
      });
    const response = createMockResponse();
    const next = vi.fn();
    const controller = createChatQueryController(
      {
        execute,
      } as unknown as RealtimeQueryExecutionService,
      createTestLogger(),
    );

    await controller(
      createMockRequest({
        query: "Investigate the checkout incident",
      }),
      response.response,
      next,
    );

    expect(response.statusCode.value).toBe(200);
    expect(response.headers["Content-Type"]).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(response.body.chunks.join("")).toContain("event: started");
    expect(response.body.chunks.join("")).toContain("event: completed");
    expect(response.end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it("streams failure events and avoids delegating to error middleware after headers are sent", async () => {
    const execute = vi
      .fn<RealtimeQueryExecutionService["execute"]>()
      .mockImplementation(async ({ queryRequest, onEvent }) => {
        await onEvent?.({
          queryId: queryRequest.id,
          stage: "failed",
          timestamp: "2026-04-18T10:05:00.000Z",
          payload: {
            error:
              "Realtime query execution failed. Review API logs with the query ID for details.",
          },
        });

        throw new Error("LLM request timed out");
      });
    const response = createMockResponse();
    const next = vi.fn();
    const controller = createChatQueryController(
      {
        execute,
      } as unknown as RealtimeQueryExecutionService,
      createTestLogger(),
    );

    await controller(
      createMockRequest({
        query: "Investigate the realtime failure",
      }),
      response.response,
      next,
    );

    expect(response.body.chunks.join("")).toContain("event: failed");
    expect(response.end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});
