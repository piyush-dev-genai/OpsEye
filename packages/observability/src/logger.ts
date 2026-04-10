import { inspect } from "node:util";
import {
  createLogger as createWinstonLogger,
  format,
  transports,
  type Logger as WinstonLogger,
  type Logform,
} from "winston";

export const LOGGER_LEVELS = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
} as const;

export type LoggerLevel = keyof typeof LOGGER_LEVELS;

export interface LogContext {
  readonly [key: string]: string | number | boolean | null | undefined;
}

export interface LoggerOptions {
  readonly serviceName: string;
  readonly environment: string;
  readonly level?: LoggerLevel;
  readonly defaultContext?: LogContext;
}

export interface AppLogger {
  fatal(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  trace(message: string, context?: LogContext): void;
  child(context: LogContext): AppLogger;
  getWinstonLogger(): WinstonLogger;
}

type StructuredLogEntry = {
  timestamp: string;
  level: string;
  message: string;
  service: string;
  environment: string;
  [key: string]: unknown;
};

function serializeError(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause instanceof Error
      ? { cause: serializeError(error.cause) }
      : error.cause !== undefined
        ? { cause: error.cause }
        : {}),
  };
}

function normalizeContext(
  context?: LogContext,
): Record<string, string | number | boolean | null> {
  if (context === undefined) {
    return {};
  }

  return Object.entries(context).reduce<Record<string, string | number | boolean | null>>(
    (accumulator, [key, value]) => {
      if (value === undefined) {
        return accumulator;
      }

      accumulator[key] = value;
      return accumulator;
    },
    {},
  );
}

function createLogFormatter() {
  return format.printf((info: Logform.TransformableInfo) => {
    const splat = info[Symbol.for("splat")] as unknown[] | undefined;
    const structuredEntry: StructuredLogEntry = {
      timestamp:
        typeof info.timestamp === "string"
          ? info.timestamp
          : new Date().toISOString(),
      level: info.level,
      message: String(info.message),
      service: String(info.service),
      environment: String(info.environment),
    };

    for (const [key, value] of Object.entries(info)) {
      if (
        key === "level" ||
        key === "message" ||
        key === "timestamp" ||
        key === "service" ||
        key === "environment"
      ) {
        continue;
      }

      if (value instanceof Error) {
        structuredEntry[key] = serializeError(value);
        continue;
      }

      structuredEntry[key] = value;
    }

    if (splat !== undefined && splat.length > 0) {
      structuredEntry.splat = splat.map((value) =>
        value instanceof Error ? serializeError(value) : inspect(value, false, 4, false),
      );
    }

    return JSON.stringify(structuredEntry);
  });
}

class WinstonAppLogger implements AppLogger {
  public constructor(private readonly logger: WinstonLogger) {}

  public fatal(message: string, context?: LogContext): void {
    this.logger.log("fatal", message, normalizeContext(context));
  }

  public error(message: string, context?: LogContext): void {
    this.logger.log("error", message, normalizeContext(context));
  }

  public warn(message: string, context?: LogContext): void {
    this.logger.log("warn", message, normalizeContext(context));
  }

  public info(message: string, context?: LogContext): void {
    this.logger.log("info", message, normalizeContext(context));
  }

  public debug(message: string, context?: LogContext): void {
    this.logger.log("debug", message, normalizeContext(context));
  }

  public trace(message: string, context?: LogContext): void {
    this.logger.log("trace", message, normalizeContext(context));
  }

  public child(context: LogContext): AppLogger {
    return new WinstonAppLogger(this.logger.child(normalizeContext(context)));
  }

  public getWinstonLogger(): WinstonLogger {
    return this.logger;
  }
}

export function createLogger(options: LoggerOptions): AppLogger {
  const logger = createWinstonLogger({
    levels: LOGGER_LEVELS,
    level: options.level ?? "info",
    defaultMeta: {
      service: options.serviceName,
      environment: options.environment,
      ...normalizeContext(options.defaultContext),
    },
    format: format.combine(
      format.errors({ stack: true }),
      format.timestamp(),
      createLogFormatter(),
    ),
    transports: [new transports.Console()],
  });

  return new WinstonAppLogger(logger);
}
