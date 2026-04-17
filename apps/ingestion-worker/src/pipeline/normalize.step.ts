import {
  RawLogConnectorAdapter,
  buildNormalizationContext,
} from "@opseye/connectors";
import type { RawLogEvent } from "@opseye/types";

import type { NormalizedLogRecord } from "../mappers/log.mapper";

export interface NormalizeLogsOptions {
  readonly ingestionTimestamp?: string;
  readonly defaultSource?: string;
}

const rawLogConnector = new RawLogConnectorAdapter();

export function normalizeLogs(
  logs: readonly RawLogEvent[],
  options: NormalizeLogsOptions = {},
): readonly NormalizedLogRecord[] {
  const context = buildNormalizationContext({
    connectorName: rawLogConnector.connectorName,
    defaultSource: options.defaultSource ?? rawLogConnector.connectorName,
    ...(options.ingestionTimestamp !== undefined
      ? { ingestionTimestamp: options.ingestionTimestamp }
      : {}),
  });

  return logs.map((log) => rawLogConnector.normalize(log, context));
}
