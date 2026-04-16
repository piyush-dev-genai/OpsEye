import type { AppConfig } from "@opseye/config";
import { embedText } from "@opseye/llm";
import type { AppLogger } from "@opseye/observability";
import type { QueryEmbedding } from "@opseye/types";

import type { QueryWorkflowState } from "../workflow/state";

export interface EmbedQueryNodeDependencies {
  readonly appConfig: AppConfig;
  readonly logger: AppLogger;
}

export function createEmbedQueryNode(
  dependencies: EmbedQueryNodeDependencies,
): (
  state: QueryWorkflowState,
) => Promise<Pick<QueryWorkflowState, "queryEmbedding">> {
  return async (
    state: QueryWorkflowState,
  ): Promise<Pick<QueryWorkflowState, "queryEmbedding">> => {
    const queryId = state.queryRequest.id;
    const result = await embedText({
      appConfig: dependencies.appConfig,
      text: state.queryRequest.query,
      user: queryId,
    });

    const queryEmbedding: QueryEmbedding = {
      queryId,
      model: result.model,
      vector: result.embedding,
    };

    dependencies.logger.info("Embedded query.", {
      queryId,
      model: result.model,
      dimensions: result.embedding.length,
    });

    return { queryEmbedding };
  };
}
