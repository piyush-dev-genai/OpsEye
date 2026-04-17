import type {
  DeploymentEnvironment,
  LogAttributes,
  LogLevel,
} from "@opseye/types";

export const OPERATIONAL_EVENT_TYPES = [
  "log",
  "alert",
  "deployment",
  "incident",
] as const;

export type OperationalEventType = (typeof OPERATIONAL_EVENT_TYPES)[number];

export type OperationalEventSeverity = LogLevel;

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface OperationalEvent {
  readonly id: string;
  readonly eventType: OperationalEventType;
  readonly source: string;
  readonly service: string;
  readonly environment: DeploymentEnvironment;
  readonly timestamp: string;
  readonly severity: OperationalEventSeverity;
  readonly ingestionTimestamp: string;
  readonly traceId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly tags: readonly string[];
  readonly rawPayload: JsonObject;
  readonly normalizedSummary: string;
}

export interface LogEvent extends OperationalEvent {
  readonly eventType: "log";
  readonly message: string;
  readonly level: LogLevel;
  readonly attributes?: LogAttributes;
}

export interface AlertEvent extends OperationalEvent {
  readonly eventType: "alert";
  readonly alertKey?: string;
  readonly alertName?: string;
  readonly status?: "triggered" | "acknowledged" | "resolved";
  readonly message?: string;
}

export interface DeploymentEvent extends OperationalEvent {
  readonly eventType: "deployment";
  readonly deploymentId?: string;
  readonly version?: string;
  readonly message?: string;
}

export interface IncidentEvent extends OperationalEvent {
  readonly eventType: "incident";
  readonly incidentId?: string;
  readonly title?: string;
  readonly status?: "open" | "investigating" | "mitigated" | "resolved";
  readonly message?: string;
}

export type NormalizedOperationalEvent =
  | LogEvent
  | AlertEvent
  | DeploymentEvent
  | IncidentEvent;
