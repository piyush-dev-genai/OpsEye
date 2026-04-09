export const LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export const DEPLOYMENT_ENVIRONMENTS = [
  "development",
  "staging",
  "production",
] as const;

export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];

export interface LogAttributes {
  readonly [key: string]: string | number | boolean | null | undefined;
}

export interface RawLogEvent {
  readonly message: string;
  readonly timestamp: string;
  readonly service: string;
  readonly environment: DeploymentEnvironment;
  readonly level: LogLevel;
  readonly traceId?: string;
  readonly source?: string;
  readonly attributes?: LogAttributes;
}

export interface NormalizedLogEvent extends RawLogEvent {
  readonly id: string;
  readonly ingestionTimestamp: string;
}
