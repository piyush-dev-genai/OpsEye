import type { RawLogEvent } from "@opseye/types";

import {
  mapRawLogToNormalizedLog,
  type NormalizedLogRecord,
} from "../mappers/log.mapper";

export interface NormalizeLogsOptions {
  readonly ingestionTimestamp?: string;
}

export function normalizeLogs(
  logs: readonly RawLogEvent[],
  options: NormalizeLogsOptions = {},
): readonly NormalizedLogRecord[] {
  const ingestionTimestamp =
    options.ingestionTimestamp ?? new Date().toISOString();

  return logs.map((log) => mapRawLogToNormalizedLog(log, ingestionTimestamp));
}
