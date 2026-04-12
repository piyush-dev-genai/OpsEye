import type { RequestHandler } from "express";

import { createPrefixedId } from "@opseye/utils";

export const REQUEST_ID_HEADER = "x-request-id";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      validatedBody?: unknown;
    }
  }
}

export function requestIdMiddleware(): RequestHandler {
  return (request, response, next) => {
    const headerValue = request.header(REQUEST_ID_HEADER);
    const requestId =
      headerValue !== undefined && headerValue.trim().length > 0
        ? headerValue.trim()
        : createPrefixedId({ prefix: "req" });

    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    next();
  };
}
