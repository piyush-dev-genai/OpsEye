import type { ContextBuilderService } from "../services/context-builder.service";
import type { QueryWorkflowState } from "../workflow/state";

export interface BuildContextNodeDependencies {
  readonly contextBuilderService: ContextBuilderService;
}

export function createBuildContextNode(
  dependencies: BuildContextNodeDependencies,
): (
  state: QueryWorkflowState,
) => Promise<Pick<QueryWorkflowState, "builtContext">> {
  return async (
    state: QueryWorkflowState,
  ): Promise<Pick<QueryWorkflowState, "builtContext">> => {
    const builtContext = dependencies.contextBuilderService.build({
      queryRequest: state.queryRequest,
      rerankedChunks: state.rerankedChunks,
    });

    return { builtContext };
  };
}
