import type { RawLogEvent } from "@opseye/types";
import { createPrefixedId } from "@opseye/utils";

export interface NormalizedLogRecord extends RawLogEvent {
  readonly id: string;
  readonly ingestionTimestamp: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

export interface EnrichedLogRecord extends NormalizedLogRecord {
  readonly normalizedMessage: string;
  readonly messageTokens: readonly string[];
  readonly attributeText?: string;
  readonly evidenceText: string;
  readonly retrievalText: string;
  readonly summaryText: string;
  readonly groupingKey?: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeIdentifier(value: string | number | boolean): string {
  return normalizeWhitespace(String(value));
}

function readAttributeIdentifier(
  log: RawLogEvent,
  keys: readonly string[],
): string | undefined {
  if (log.attributes === undefined) {
    return undefined;
  }

  const normalizedEntries = Object.entries(log.attributes).map(
    ([key, value]) => [key.toLowerCase(), value] as const,
  );

  for (const key of keys) {
    const matchedEntry = normalizedEntries.find(
      ([entryKey]) => entryKey === key,
    );

    if (matchedEntry === undefined) {
      continue;
    }

    const [, rawValue] = matchedEntry;

    if (
      rawValue === undefined ||
      rawValue === null ||
      (typeof rawValue === "string" && rawValue.trim().length === 0)
    ) {
      continue;
    }

    return normalizeIdentifier(rawValue);
  }

  return undefined;
}

function buildAttributeText(log: RawLogEvent): string | undefined {
  if (log.attributes === undefined) {
    return undefined;
  }

  const parts = Object.entries(log.attributes)
    .filter(([, value]) => value !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${String(value)}`);

  return parts.length > 0 ? parts.join(" ") : undefined;
}

function extractIncidentSignals(
  messageTokens: readonly string[],
  attributeText?: string,
): readonly string[] {
  const signalTokens = new Set<string>();
  const interestingTokens = new Set([
    "exception",
    "timeout",
    "failed",
    "failure",
    "error",
    "fatal",
    "retry",
    "retries",
    "latency",
    "database",
    "queue",
    "memory",
    "cpu",
    "connection",
    "unavailable",
    "cancelled",
  ]);

  for (const token of messageTokens) {
    if (interestingTokens.has(token)) {
      signalTokens.add(token);
    }
  }

  if (attributeText !== undefined) {
    for (const token of attributeText.toLowerCase().split(/[^a-z0-9._-]+/i)) {
      if (interestingTokens.has(token)) {
        signalTokens.add(token);
      }
    }
  }

  return [...signalTokens];
}

export function mapRawLogToNormalizedLog(
  log: RawLogEvent,
  ingestionTimestamp: string,
): NormalizedLogRecord {
  const requestId = readAttributeIdentifier(log, [
    "requestid",
    "request_id",
    "request-id",
    "x-request-id",
  ]);
  const correlationId = readAttributeIdentifier(log, [
    "correlationid",
    "correlation_id",
    "correlation-id",
    "x-correlation-id",
  ]);

  return {
    ...log,
    id: createPrefixedId({ prefix: "log" }),
    ingestionTimestamp,
    ...(requestId !== undefined ? { requestId } : {}),
    ...(correlationId !== undefined ? { correlationId } : {}),
  };
}

export function mapNormalizedLogToEnrichedLog(
  log: NormalizedLogRecord,
): EnrichedLogRecord {
  const normalizedMessage = normalizeWhitespace(log.message);
  const messageTokens = normalizedMessage
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const attributeText = buildAttributeText(log);
  const incidentSignals = extractIncidentSignals(messageTokens, attributeText);
  const groupingKey = log.traceId ?? log.requestId ?? log.correlationId;
  const evidenceText = [
    `timestamp=${log.timestamp}`,
    `service=${log.service}`,
    `environment=${log.environment}`,
    `level=${log.level}`,
    ...(log.traceId !== undefined ? [`traceId=${log.traceId}`] : []),
    ...(log.requestId !== undefined ? [`requestId=${log.requestId}`] : []),
    ...(log.correlationId !== undefined
      ? [`correlationId=${log.correlationId}`]
      : []),
    ...(log.source !== undefined ? [`source=${log.source}`] : []),
    `message=${log.message}`,
    ...(attributeText !== undefined ? [`attributes=${attributeText}`] : []),
  ].join("\n");
  const retrievalText = [
    `service ${log.service}`,
    `environment ${log.environment}`,
    `severity ${log.level}`,
    `message ${normalizedMessage}`,
    ...(log.traceId !== undefined ? [`trace ${log.traceId}`] : []),
    ...(log.requestId !== undefined ? [`request ${log.requestId}`] : []),
    ...(log.correlationId !== undefined
      ? [`correlation ${log.correlationId}`]
      : []),
    ...(log.source !== undefined ? [`source ${log.source}`] : []),
    ...(attributeText !== undefined ? [`attributes ${attributeText}`] : []),
    ...(incidentSignals.length > 0
      ? [`signals ${incidentSignals.join(" ")}`]
      : []),
  ].join(" | ");
  const summaryText = [
    `${log.service} ${log.environment} ${log.level}`,
    normalizedMessage,
    ...(incidentSignals.length > 0 ? [incidentSignals.join(" ")] : []),
  ]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(" | ");

  return {
    ...log,
    normalizedMessage,
    messageTokens,
    ...(attributeText !== undefined ? { attributeText } : {}),
    evidenceText,
    retrievalText,
    summaryText,
    ...(groupingKey !== undefined ? { groupingKey } : {}),
  };
}
