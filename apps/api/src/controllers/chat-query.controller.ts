import type { RequestHandler } from "express";

import type { AppLogger } from "@opseye/observability";
import type { RealtimeQueryExecutionService } from "@opseye/query-worker";
import type { QueryFilters, QueryRequest } from "@opseye/types";
import { AppError, createPrefixedId } from "@opseye/utils";

import { getValidatedBody } from "../middleware/validate.middleware";
import type { QueryRequestBody } from "../schemas/query.schema";
import { formatSseEvent } from "../services/sse-event.service";

function toQueryFilters(
  filters: QueryRequestBody["filters"],
): QueryFilters | undefined {
  if (filters === undefined) {
    return undefined;
  }

  return {
    ...(filters.service !== undefined ? { service: filters.service } : {}),
    ...(filters.environment !== undefined
      ? { environment: filters.environment }
      : {}),
    ...(filters.fromTimestamp !== undefined
      ? { fromTimestamp: filters.fromTimestamp }
      : {}),
    ...(filters.toTimestamp !== undefined
      ? { toTimestamp: filters.toTimestamp }
      : {}),
    ...(filters.traceId !== undefined ? { traceId: filters.traceId } : {}),
  };
}

export function createChatQueryController(
  realtimeQueryExecutionService: RealtimeQueryExecutionService,
  logger: AppLogger,
): RequestHandler {
  return async (request, response, next) => {
    try {
      const requestId = request.requestId;

      if (requestId === undefined) {
        throw new AppError({
          code: "request_id_missing",
          message: "Request ID is not available.",
          statusCode: 500,
        });
      }

      const body = getValidatedBody<QueryRequestBody>(request);
      const filters = toQueryFilters(body.filters);
      const queryRequest: QueryRequest = {
        id: createPrefixedId({ prefix: "query" }),
        query: body.query,
        requestedAt: new Date().toISOString(),
        ...(filters !== undefined ? { filters } : {}),
      };

      response.status(200);
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("Connection", "keep-alive");
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders();

      request.on("close", () => {
        logger.info("Realtime query stream closed.", {
          requestId,
          queryId: queryRequest.id,
        });
      });

      logger.info("Accepted realtime chat query request.", {
        requestId,
        queryId: queryRequest.id,
      });

      try {
        await realtimeQueryExecutionService.execute({
          queryRequest,
          onEvent: async (event) => {
            response.write(formatSseEvent(event));
          },
        });
      } catch (error) {
        logger.error("Realtime chat query request failed.", {
          requestId,
          queryId: queryRequest.id,
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        response.end();
      }
    } catch (error) {
      next(error);
    }
  };
}
