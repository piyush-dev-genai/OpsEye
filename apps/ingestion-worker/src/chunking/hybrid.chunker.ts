import type { LogChunk } from "@opseye/types";
import { createPrefixedId } from "@opseye/utils";

import type { EnrichedLogRecord } from "../mappers/log.mapper";
import { semanticChunk } from "./semantic.chunker";
import {
  timeWindowChunk,
  type TimeWindowChunkerOptions,
} from "./time-window.chunker";

export interface HybridChunkerOptions extends TimeWindowChunkerOptions {
  readonly summaryMinGroupSize?: number;
}

interface LogGroup {
  readonly key: string;
  readonly logs: readonly EnrichedLogRecord[];
  readonly strategy: "trace" | "time-window";
}

function getServiceWindowKey(log: EnrichedLogRecord, windowMs: number): string {
  const timestamp = Date.parse(log.timestamp);
  const bucketStart = Math.floor(timestamp / windowMs) * windowMs;
  return `${log.service}:${log.environment}:${bucketStart}`;
}

function groupLogs(
  logs: readonly EnrichedLogRecord[],
  windowMs: number,
): readonly LogGroup[] {
  const correlatedGroups = new Map<string, EnrichedLogRecord[]>();
  const fallbackGroups = new Map<string, EnrichedLogRecord[]>();

  for (const log of logs) {
    if (log.groupingKey !== undefined) {
      const key = `correlated:${log.groupingKey}`;
      const existingGroup = correlatedGroups.get(key);

      if (existingGroup !== undefined) {
        existingGroup.push(log);
      } else {
        correlatedGroups.set(key, [log]);
      }
      continue;
    }

    const fallbackKey = getServiceWindowKey(log, windowMs);
    const existingGroup = fallbackGroups.get(fallbackKey);

    if (existingGroup !== undefined) {
      existingGroup.push(log);
      continue;
    }

    fallbackGroups.set(fallbackKey, [log]);
  }

  return [
    ...[...correlatedGroups.entries()].map(([key, groupedLogs]) => ({
      key,
      logs: groupedLogs,
      strategy: "trace" as const,
    })),
    ...[...fallbackGroups.entries()].map(([key, groupedLogs]) => ({
      key,
      logs: groupedLogs,
      strategy: "time-window" as const,
    })),
  ];
}

function getHighestSeverity(logs: readonly EnrichedLogRecord[]): string {
  const order = ["fatal", "error", "warn", "info", "debug", "trace"];

  for (const level of order) {
    if (logs.some((log) => log.level === level)) {
      return level;
    }
  }

  return "info";
}

function createGroupSummaryChunk(
  group: LogGroup,
  summaryMinGroupSize: number,
): LogChunk | undefined {
  if (group.logs.length < summaryMinGroupSize) {
    return undefined;
  }

  const [firstLog] = group.logs;
  const [lastLog] = group.logs.slice(-1);

  if (firstLog === undefined || lastLog === undefined) {
    return undefined;
  }

  return {
    chunkId: createPrefixedId({ prefix: "chunk" }),
    content: [
      "INCIDENT SUMMARY",
      `scope=${group.strategy}`,
      `groupKey=${group.key}`,
      `service=${firstLog.service}`,
      `environment=${firstLog.environment}`,
      `timeRange=${firstLog.timestamp}..${lastLog.timestamp}`,
      `logCount=${group.logs.length}`,
      `highestSeverity=${getHighestSeverity(group.logs)}`,
      ...(firstLog.traceId !== undefined
        ? [`traceId=${firstLog.traceId}`]
        : []),
      ...(firstLog.requestId !== undefined
        ? [`requestId=${firstLog.requestId}`]
        : []),
      ...(firstLog.correlationId !== undefined
        ? [`correlationId=${firstLog.correlationId}`]
        : []),
      "",
      "KEY SIGNALS",
      group.logs.map((log) => `- ${log.summaryText}`).join("\n"),
    ].join("\n"),
    metadata: {
      service: firstLog.service,
      environment: firstLog.environment,
      timestamp: firstLog.timestamp,
      level: firstLog.level,
      ...(firstLog.traceId !== undefined ? { traceId: firstLog.traceId } : {}),
      chunkStrategy: group.strategy === "trace" ? "trace" : "time-window",
      sourceLogIds: group.logs.map((log) => log.id),
    },
  };
}

function createContextChunk(group: LogGroup): LogChunk {
  if (group.strategy === "time-window") {
    const [timeWindowChunkResult] = timeWindowChunk(group.logs, {
      windowMs: Number.MAX_SAFE_INTEGER,
      maxLogsPerChunk: group.logs.length,
    });

    if (timeWindowChunkResult === undefined) {
      throw new Error("Expected time-window chunk for non-empty log group.");
    }

    return timeWindowChunkResult;
  }

  const [firstLog] = group.logs;
  const [lastLog] = group.logs.slice(-1);

  if (firstLog === undefined || lastLog === undefined) {
    throw new Error("Cannot create context chunk from an empty group.");
  }

  return {
    chunkId: createPrefixedId({ prefix: "chunk" }),
    content: [
      "TRACE CONTEXT",
      `groupKey=${group.key}`,
      `service=${firstLog.service}`,
      `environment=${firstLog.environment}`,
      `timeRange=${firstLog.timestamp}..${lastLog.timestamp}`,
      `logCount=${group.logs.length}`,
      "",
      "NARRATIVE",
      group.logs.map((log) => `- ${log.summaryText}`).join("\n"),
      "",
      "EVIDENCE",
      group.logs
        .map(
          (log) =>
            `[${log.timestamp}] [${log.level}] ${log.normalizedMessage}\n${log.evidenceText}`,
        )
        .join("\n\n"),
    ].join("\n"),
    metadata: {
      service: firstLog.service,
      environment: firstLog.environment,
      timestamp: firstLog.timestamp,
      level: firstLog.level,
      ...(firstLog.traceId !== undefined ? { traceId: firstLog.traceId } : {}),
      chunkStrategy: "trace",
      sourceLogIds: group.logs.map((log) => log.id),
    },
  };
}

export function hybridChunk(
  logs: readonly EnrichedLogRecord[],
  options: HybridChunkerOptions = {},
): readonly LogChunk[] {
  if (logs.length === 0) {
    return [];
  }

  const rawChunks = semanticChunk(logs);
  const groups = groupLogs(logs, options.windowMs ?? 60_000);
  const groupedChunks = groups.map(createContextChunk);
  const summaryChunks = groups
    .map((group) =>
      createGroupSummaryChunk(group, options.summaryMinGroupSize ?? 3),
    )
    .filter((chunk): chunk is LogChunk => chunk !== undefined);

  return [...rawChunks, ...groupedChunks, ...summaryChunks];
}
