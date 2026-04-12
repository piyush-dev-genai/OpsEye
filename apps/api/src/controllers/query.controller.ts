import type { RequestHandler } from "express";

import type { AppLogger } from "@opseye/observability";
import type { QueryFilters, QueryRequest } from "@opseye/types";
import { AppError, createPrefixedId } from "@opseye/utils";

import { getValidatedBody } from "../middleware/validate.middleware";
import type { QueryRequestBody } from "../schemas/query.schema";
import type { QueryOrchestratorService } from "../services/query-orchestrator.service";

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

export function createQueryController(
  queryOrchestrator: QueryOrchestratorService,
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

      const result = await queryOrchestrator.submitQuery({
        requestId,
        queryRequest,
      });

      logger.info("Accepted query request.", {
        requestId,
        queryId: result.queryId,
        topic: result.topic,
      });

      response.status(202).json({
        requestId,
        queryId: result.queryId,
        status: "accepted",
        topic: result.topic,
      });
    } catch (error) {
      next(error);
    }
  };
}
