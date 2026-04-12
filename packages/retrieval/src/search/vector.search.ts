import type { QueryFilters } from "@opseye/types";
import type {
  VectorSearchRequest,
  VectorSearchResult,
} from "@opseye/vector-store";

export interface VectorSearchSource {
  searchSimilar(
    request: VectorSearchRequest,
  ): Promise<readonly VectorSearchResult[]>;
}

export interface RetrieveByVectorOptions {
  readonly repository: VectorSearchSource;
  readonly queryEmbedding: readonly number[];
  readonly filters?: QueryFilters;
  readonly limit: number;
}

export interface RetrievedChunk extends VectorSearchResult {
  readonly vectorScore: number;
}

function distanceToSimilarity(distance: number): number {
  if (!Number.isFinite(distance)) {
    return 0;
  }

  return 1 / (1 + Math.max(distance, 0));
}

export async function retrieveByVector(
  options: RetrieveByVectorOptions,
): Promise<readonly RetrievedChunk[]> {
  const results = await options.repository.searchSimilar({
    embedding: options.queryEmbedding,
    limit: options.limit,
    ...(options.filters !== undefined ? { filters: options.filters } : {}),
  });

  return results.map((result) => ({
    ...result,
    vectorScore: distanceToSimilarity(result.vectorDistance),
  }));
}
