import type { LogEvent } from "@opseye/domain";

export type NormalizedLogRecord = LogEvent;

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

function buildAttributeText(log: LogEvent): string | undefined {
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
    `severity=${log.severity}`,
    ...(log.traceId !== undefined ? [`traceId=${log.traceId}`] : []),
    ...(log.requestId !== undefined ? [`requestId=${log.requestId}`] : []),
    ...(log.correlationId !== undefined
      ? [`correlationId=${log.correlationId}`]
      : []),
    `source=${log.source}`,
    `message=${log.message}`,
    ...(attributeText !== undefined ? [`attributes=${attributeText}`] : []),
  ].join("\n");
  const retrievalText = [
    `service ${log.service}`,
    `environment ${log.environment}`,
    `severity ${log.severity}`,
    `message ${normalizedMessage}`,
    ...(log.traceId !== undefined ? [`trace ${log.traceId}`] : []),
    ...(log.requestId !== undefined ? [`request ${log.requestId}`] : []),
    ...(log.correlationId !== undefined
      ? [`correlation ${log.correlationId}`]
      : []),
    `source ${log.source}`,
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
