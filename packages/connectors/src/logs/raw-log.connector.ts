import type { LogEvent } from "@opseye/domain";
import type { RawLogEvent } from "@opseye/types";
import { createPrefixedId } from "@opseye/utils";

import type { ConnectorAdapter, ConnectorNormalizationContext } from "../types";
import {
  buildTags,
  normalizeOptionalString,
  normalizeSummary,
  readAttributeIdentifier,
  sanitizeJsonObject,
} from "../utils";

export class RawLogConnectorAdapter implements ConnectorAdapter<
  RawLogEvent,
  LogEvent
> {
  public readonly connectorName = "logs.raw";
  public readonly eventType = "log" as const;

  public normalize(
    payload: RawLogEvent,
    context: ConnectorNormalizationContext,
  ): LogEvent {
    const requestId = readAttributeIdentifier(payload.attributes, [
      "requestid",
      "request_id",
      "request-id",
      "x-request-id",
    ]);
    const correlationId = readAttributeIdentifier(payload.attributes, [
      "correlationid",
      "correlation_id",
      "correlation-id",
      "x-correlation-id",
    ]);
    const source =
      normalizeOptionalString(payload.source) ?? context.defaultSource;
    const normalizedSummary = normalizeSummary(payload.message);

    return {
      id: createPrefixedId({ prefix: "log" }),
      eventType: "log",
      source,
      service: payload.service,
      environment: payload.environment,
      timestamp: payload.timestamp,
      severity: payload.level,
      level: payload.level,
      ingestionTimestamp: context.ingestionTimestamp,
      ...(payload.traceId !== undefined ? { traceId: payload.traceId } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
      ...(correlationId !== undefined ? { correlationId } : {}),
      tags: buildTags(
        [
          `eventType:log`,
          `service:${payload.service}`,
          `environment:${payload.environment}`,
          `severity:${payload.level}`,
          `source:${source}`,
        ],
        context.tags ?? [],
      ),
      rawPayload: sanitizeJsonObject({
        message: payload.message,
        timestamp: payload.timestamp,
        service: payload.service,
        environment: payload.environment,
        level: payload.level,
        traceId: payload.traceId,
        source: payload.source,
        attributes: payload.attributes,
      }),
      normalizedSummary,
      message: payload.message,
      ...(payload.attributes !== undefined
        ? { attributes: payload.attributes }
        : {}),
    };
  }
}
