import type { RetrievalService } from "../services/retrieval.service";
import type { QueryWorkflowState } from "../workflow/state";

export interface RetrieveNodeDependencies {
  readonly retrievalService: RetrievalService;
}

export function createRetrieveNode(
  dependencies: RetrieveNodeDependencies,
): (
  state: QueryWorkflowState,
) => Promise<Pick<QueryWorkflowState, "retrievedChunks">> {
  return async (
    state: QueryWorkflowState,
  ): Promise<Pick<QueryWorkflowState, "retrievedChunks">> => {
    if (state.queryEmbedding === undefined) {
      throw new Error("Query embedding is required before retrieval.");
    }

    const retrievedChunks = await dependencies.retrievalService.retrieve({
      queryRequest: state.queryRequest,
      queryEmbedding: state.queryEmbedding,
    });

    return { retrievedChunks };
  };
}
