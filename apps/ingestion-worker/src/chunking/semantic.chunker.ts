import type { ChunkStrategy, LogChunk } from "@opseye/types";
import { createPrefixedId } from "@opseye/utils";

import type { EnrichedLogRecord } from "../mappers/log.mapper";

function createChunk(
  log: EnrichedLogRecord,
  content: string,
  strategy: ChunkStrategy,
): LogChunk {
  return {
    chunkId: createPrefixedId({ prefix: "chunk" }),
    content,
    metadata: {
      service: log.service,
      environment: log.environment,
      timestamp: log.timestamp,
      level: log.level,
      ...(log.traceId !== undefined ? { traceId: log.traceId } : {}),
      chunkStrategy: strategy,
      sourceLogIds: [log.id],
    },
  };
}

export function semanticChunk(
  logs: readonly EnrichedLogRecord[],
): readonly LogChunk[] {
  return logs.map((log) =>
    createChunk(
      log,
      [
        "RAW LOG EVIDENCE",
        log.evidenceText,
        "",
        "RETRIEVAL CONTEXT",
        log.retrievalText,
      ].join("\n"),
      "message",
    ),
  );
}
