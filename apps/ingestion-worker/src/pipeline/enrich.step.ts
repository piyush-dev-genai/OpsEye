import {
  mapNormalizedLogToEnrichedLog,
  type EnrichedLogRecord,
  type NormalizedLogRecord,
} from "../mappers/log.mapper";

export function enrichLogs(
  logs: readonly NormalizedLogRecord[],
): readonly EnrichedLogRecord[] {
  return logs.map(mapNormalizedLogToEnrichedLog);
}
