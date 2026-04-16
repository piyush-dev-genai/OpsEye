import type { ChunkStrategy, LogChunk, LogLevel } from "@opseye/types";
import { createPrefixedId } from "@opseye/utils";

import type { EnrichedLogRecord } from "../mappers/log.mapper";

export interface TimeWindowChunkerOptions {
  readonly windowMs?: number;
  readonly maxLogsPerChunk?: number;
}

function getHighestSeverity(levels: readonly LogLevel[]): LogLevel {
  const severityOrder: readonly LogLevel[] = [
    "fatal",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
  ];

  for (const level of severityOrder) {
    if (levels.includes(level)) {
      return level;
    }
  }

  return "info";
}

function createTimeWindowChunk(logs: readonly EnrichedLogRecord[]): LogChunk {
  const [firstLog] = logs;
  const [lastLog] = logs.slice(-1);

  if (firstLog === undefined || lastLog === undefined) {
    throw new Error("Cannot create a time-window chunk from an empty log set.");
  }

  const levels = logs.map((log) => log.level);
  const content = [
    "CONTEXT CHUNK",
    `scope=service-window`,
    `service=${firstLog.service}`,
    `environment=${firstLog.environment}`,
    `timeRange=${firstLog.timestamp}..${lastLog.timestamp}`,
    `logCount=${logs.length}`,
    `severity=${getHighestSeverity(levels)}`,
    "",
    "SUMMARY",
    logs.map((log) => `- ${log.summaryText}`).join("\n"),
    "",
    "TIMELINE",
    logs
      .map((log) => {
        const correlationParts = [
          ...(log.traceId !== undefined ? [`trace=${log.traceId}`] : []),
          ...(log.requestId !== undefined ? [`request=${log.requestId}`] : []),
          ...(log.correlationId !== undefined
            ? [`correlation=${log.correlationId}`]
            : []),
        ].join(" ");

        return `[${log.timestamp}] [${log.level}] ${log.service} ${log.normalizedMessage}${
          correlationParts.length > 0 ? ` (${correlationParts})` : ""
        }`;
      })
      .join("\n"),
  ].join("\n");

  return {
    chunkId: createPrefixedId({ prefix: "chunk" }),
    content,
    metadata: {
      service: firstLog.service,
      environment: firstLog.environment,
      timestamp: firstLog.timestamp,
      level: getHighestSeverity(levels),
      ...(firstLog.traceId !== undefined ? { traceId: firstLog.traceId } : {}),
      chunkStrategy: "time-window" as ChunkStrategy,
      sourceLogIds: logs.map((log) => log.id),
    },
  };
}

export function timeWindowChunk(
  logs: readonly EnrichedLogRecord[],
  options: TimeWindowChunkerOptions = {},
): readonly LogChunk[] {
  if (logs.length === 0) {
    return [];
  }

  const windowMs = options.windowMs ?? 60_000;
  const maxLogsPerChunk = options.maxLogsPerChunk ?? 20;
  const sortedLogs = [...logs].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  );

  const chunks: LogChunk[] = [];
  let currentGroup: EnrichedLogRecord[] = [];
  let groupStartTimestamp = Number.NaN;

  for (const log of sortedLogs) {
    const logTimestamp = Date.parse(log.timestamp);
    const exceedsWindow =
      currentGroup.length > 0 && logTimestamp - groupStartTimestamp > windowMs;
    const exceedsCount = currentGroup.length >= maxLogsPerChunk;

    if (exceedsWindow || exceedsCount) {
      chunks.push(createTimeWindowChunk(currentGroup));
      currentGroup = [];
      groupStartTimestamp = Number.NaN;
    }

    if (currentGroup.length === 0) {
      groupStartTimestamp = logTimestamp;
    }

    currentGroup.push(log);
  }

  if (currentGroup.length > 0) {
    chunks.push(createTimeWindowChunk(currentGroup));
  }

  return chunks;
}
