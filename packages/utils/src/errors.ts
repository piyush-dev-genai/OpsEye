export interface ErrorMetadata {
  readonly [key: string]: string | number | boolean | null | undefined;
}

export interface AppErrorOptions {
  readonly code: string;
  readonly message: string;
  readonly statusCode?: number;
  readonly cause?: Error;
  readonly metadata?: ErrorMetadata;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly metadata: ErrorMetadata | undefined;

  public constructor(options: AppErrorOptions) {
    super(
      options.message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.metadata = options.metadata;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toError(
  error: unknown,
  fallbackMessage = "Unknown error",
): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
}
