import type { RerankingService } from "../services/reranking.service";
import type { QueryWorkflowState } from "../workflow/state";

export interface RerankNodeDependencies {
  readonly rerankingService: RerankingService;
}

export function createRerankNode(
  dependencies: RerankNodeDependencies,
): (
  state: QueryWorkflowState,
) => Promise<Pick<QueryWorkflowState, "rerankedChunks">> {
  return async (
    state: QueryWorkflowState,
  ): Promise<Pick<QueryWorkflowState, "rerankedChunks">> => {
    const rerankedChunks = dependencies.rerankingService.rerank({
      queryRequest: state.queryRequest,
      retrievedChunks: state.retrievedChunks,
    });

    return { rerankedChunks };
  };
}
