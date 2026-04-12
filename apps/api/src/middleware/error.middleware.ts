import type { ErrorRequestHandler } from "express";

import type { AppLogger } from "@opseye/observability";
import { isAppError, toError } from "@opseye/utils";

import { RequestValidationError } from "./validate.middleware";

export function createErrorMiddleware(logger: AppLogger): ErrorRequestHandler {
  return (error, request, response, _next) => {
    const normalizedError = toError(error);
    const requestId = request.requestId;

    logger.error("Request failed.", {
      requestId,
      method: request.method,
      path: request.path,
      errorName: normalizedError.name,
      errorMessage: normalizedError.message,
      ...(normalizedError.stack !== undefined ? { errorStack: normalizedError.stack } : {}),
    });

    if (error instanceof RequestValidationError) {
      response.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          ...(requestId !== undefined ? { requestId } : {}),
          issues: error.issues,
        },
      });
      return;
    }

    if (isAppError(error)) {
      response.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          ...(requestId !== undefined ? { requestId } : {}),
        },
      });
      return;
    }

    const isBodyParserSyntaxError =
    normalizedError instanceof SyntaxError &&
    Object.prototype.hasOwnProperty.call(normalizedError, "body");

    if (isBodyParserSyntaxError) {
      response.status(400).json({
        error: {
          code: "invalid_json",
          message: "Request body contains invalid JSON.",
          ...(requestId !== undefined ? { requestId } : {}),
        },
      });
      return;
    }

    response.status(500).json({
      error: {
        code: "internal_server_error",
        message: "An unexpected error occurred.",
        ...(requestId !== undefined ? { requestId } : {}),
      },
    });
  };
}
