import type { LogChunk } from "@opseye/types";

import type { EnrichedLogRecord } from "../mappers/log.mapper";
import {
  hybridChunk,
  type HybridChunkerOptions,
} from "../chunking/hybrid.chunker";

export function chunkLogs(
  logs: readonly EnrichedLogRecord[],
  options: HybridChunkerOptions = {},
): readonly LogChunk[] {
  return hybridChunk(logs, options);
}
