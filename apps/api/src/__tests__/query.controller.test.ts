import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import type { AppLogger } from "@opseye/observability";

import { createQueryController } from "../controllers/query.controller";
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

function createMockRequest(): Request {
  return {
    requestId: "req-query-1",
    validatedBody: {
      query: "What caused the checkout-api incident?",
      filters: {
        service: "checkout-api",
        environment: "production",
      },
    },
  } as unknown as Request;
}

function createMockResponse(): Response {
  const responseObject = {
    status: vi.fn(() => responseObject),
    json: vi.fn(),
  };

  return responseObject as unknown as Response;
}

describe("createQueryController", () => {
  it("returns a queued response and delegates execution to the async orchestrator", async () => {
    const submitQuery = vi
      .fn<QueryOrchestratorService["submitQuery"]>()
      .mockImplementation(async ({ queryRequest }) => ({
        topic: "query.requested",
        queryId: queryRequest.id,
      }));
    const response = createMockResponse();
    const next = vi.fn();
    const controller = createQueryController(
      {
        submitQuery,
      } as unknown as QueryOrchestratorService,
      createTestLogger(),
    );

    await controller(createMockRequest(), response, next);

    expect(submitQuery).toHaveBeenCalledTimes(1);
    expect(submitQuery.mock.calls[0]?.[0]).toMatchObject({
      requestId: "req-query-1",
      queryRequest: {
        query: "What caused the checkout-api incident?",
        filters: {
          service: "checkout-api",
          environment: "production",
        },
      },
    });
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith({
      queryId: expect.stringMatching(/^query_/),
      status: "queued",
    });
    expect(next).not.toHaveBeenCalled();
  });
});
