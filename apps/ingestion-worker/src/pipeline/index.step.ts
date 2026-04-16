import type { EmbeddedLogChunk } from "@opseye/types";

import type {
  IndexingService,
  IndexChunksResult,
} from "../services/indexing.service";

export async function indexChunks(
  chunks: readonly EmbeddedLogChunk[],
  indexingService: IndexingService,
): Promise<IndexChunksResult> {
  return indexingService.indexChunks(chunks);
}
