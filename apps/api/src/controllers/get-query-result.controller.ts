import type { RequestHandler } from "express";

import type { AppLogger } from "@opseye/observability";
import { AppError } from "@opseye/utils";
import type { QueryResultRepository } from "@opseye/vector-store";

export function createGetQueryResultController(
  queryResultRepository: QueryResultRepository,
  logger: AppLogger,
): RequestHandler {
  return async (request, response, next) => {
    try {
      const queryIdParam = request.params.id;

      if (
        queryIdParam === undefined ||
        Array.isArray(queryIdParam) ||
        queryIdParam.trim().length === 0
      ) {
        throw new AppError({
          code: "query_id_missing",
          message: "Query ID is required.",
          statusCode: 400,
        });
      }

      const queryId = queryIdParam;
      const persistedResult = await queryResultRepository.getByQueryId(queryId);

      if (persistedResult === null) {
        throw new AppError({
          code: "query_result_not_found",
          message: "Query result was not found.",
          statusCode: 404,
        });
      }

      logger.info("Retrieved persisted query result.", {
        requestId: request.requestId,
        queryId,
        status: persistedResult.status,
      });

      if (
        persistedResult.status === "queued" ||
        persistedResult.status === "processing"
      ) {
        response.status(200).json({
          queryId: persistedResult.queryId,
          status: persistedResult.status,
        });
        return;
      }

      if (persistedResult.status === "failed") {
        response.status(200).json({
          queryId: persistedResult.queryId,
          status: persistedResult.status,
          error: persistedResult.error,
        });
        return;
      }

      response.status(200).json({
        queryId: persistedResult.queryId,
        status: persistedResult.status,
        result: persistedResult.result,
      });
    } catch (error) {
      next(error);
    }
  };
}
