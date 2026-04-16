import { END, START, StateGraph } from "@langchain/langgraph";
import type { AppConfig } from "@opseye/config";
import type { AppLogger } from "@opseye/observability";

import { createBuildContextNode } from "../nodes/build-context.node";
import { createEmbedQueryNode } from "../nodes/embed-query.node";
import { createGenerateAnswerNode } from "../nodes/generate-answer.node";
import { createRetrieveNode } from "../nodes/retrieve.node";
import { createRerankNode } from "../nodes/rerank.node";
import type { AnswerService } from "../services/answer.service";
import type { ContextBuilderService } from "../services/context-builder.service";
import type { RerankingService } from "../services/reranking.service";
import type { RetrievalService } from "../services/retrieval.service";
import {
  QueryWorkflowStateAnnotation,
  type QueryWorkflowAnswer,
  type QueryWorkflowState,
} from "./state";

export interface QueryGraphDependencies {
  readonly retrievalService: RetrievalService;
  readonly rerankingService: RerankingService;
  readonly contextBuilderService: ContextBuilderService;
  readonly answerService: AnswerService;
  readonly appConfig: AppConfig;
  readonly logger: AppLogger;
}

export interface QueryWorkflowResult extends QueryWorkflowState {
  readonly finalAnswer: QueryWorkflowAnswer;
}

export interface QueryWorkflow {
  invoke(input: QueryWorkflowState): Promise<QueryWorkflowResult>;
}

export function buildQueryGraph(
  dependencies: QueryGraphDependencies,
): QueryWorkflow {
  const graph = new StateGraph(QueryWorkflowStateAnnotation)
    .addNode(
      "embedQuery",
      createEmbedQueryNode({
        appConfig: dependencies.appConfig,
        logger: dependencies.logger,
      }),
    )
    .addNode(
      "retrieve",
      createRetrieveNode({
        retrievalService: dependencies.retrievalService,
      }),
    )
    .addNode(
      "rerank",
      createRerankNode({
        rerankingService: dependencies.rerankingService,
      }),
    )
    .addNode(
      "buildContext",
      createBuildContextNode({
        contextBuilderService: dependencies.contextBuilderService,
      }),
    )
    .addNode(
      "generateAnswer",
      createGenerateAnswerNode({
        answerService: dependencies.answerService,
      }),
    )
    .addEdge(START, "embedQuery")
    .addEdge("embedQuery", "retrieve")
    .addEdge("retrieve", "rerank")
    .addEdge("rerank", "buildContext")
    .addEdge("buildContext", "generateAnswer")
    .addEdge("generateAnswer", END);

  const workflow = graph.compile();

  return {
    invoke: async (input: QueryWorkflowState): Promise<QueryWorkflowResult> => {
      const result = await workflow.invoke(input);

      if (result.finalAnswer === undefined) {
        throw new Error("Query workflow completed without a final answer.");
      }

      return result as QueryWorkflowResult;
    },
  };
}
