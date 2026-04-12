import type { RequestHandler } from "express";

import type { AppLogger } from "@opseye/observability";
import type { RawLogEvent } from "@opseye/types";
import { AppError } from "@opseye/utils";

import { getValidatedBody } from "../middleware/validate.middleware";
import type { IngestRequestBody } from "../schemas/ingest.schema";
import type { IngestPublisherService } from "../services/ingest-publisher.service";

function toRawLogEvent(log: IngestRequestBody["logs"][number]): RawLogEvent {
  return {
    message: log.message,
    timestamp: log.timestamp,
    service: log.service,
    environment: log.environment,
    level: log.level,
    ...(log.traceId !== undefined ? { traceId: log.traceId } : {}),
    ...(log.source !== undefined ? { source: log.source } : {}),
    ...(log.attributes !== undefined ? { attributes: log.attributes } : {}),
  };
}

export function createIngestController(
  ingestPublisher: IngestPublisherService,
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

      const body = getValidatedBody<IngestRequestBody>(request);
      const logs = body.logs.map(toRawLogEvent);
      const result = await ingestPublisher.publishLogs({
        requestId,
        logs,
      });

      logger.info("Accepted ingest request.", {
        requestId,
        logCount: logs.length,
        topic: result.topic,
      });

      response.status(202).json({
        requestId,
        status: "accepted",
        topic: result.topic,
        acceptedCount: result.publishedCount,
      });
    } catch (error) {
      next(error);
    }
  };
}
