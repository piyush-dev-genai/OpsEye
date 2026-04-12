import type { Request, RequestHandler } from "express";
import { type ZodType } from "zod";

import { AppError } from "@opseye/utils";

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class RequestValidationError extends AppError {
  public readonly issues: readonly ValidationIssue[];

  public constructor(issues: readonly ValidationIssue[]) {
    super({
      code: "request_validation_error",
      message: "Request body validation failed.",
      statusCode: 400,
    });
    this.name = "RequestValidationError";
    this.issues = issues;
  }
}

export function validateRequestBody<TBody>(
  schema: ZodType<TBody>,
): RequestHandler {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request.body);

    if (!parsed.success) {
      next(
        new RequestValidationError(
          parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        ),
      );
      return;
    }

    request.validatedBody = parsed.data;
    next();
  };
}

export function getValidatedBody<TBody>(request: Request): TBody {
  if (request.validatedBody === undefined) {
    throw new AppError({
      code: "validated_body_missing",
      message: "Validated request body is not available.",
      statusCode: 500,
    });
  }

  return request.validatedBody as TBody;
}
