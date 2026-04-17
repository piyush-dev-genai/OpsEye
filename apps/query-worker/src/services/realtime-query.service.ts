import type { AppConfig } from "@opseye/config";
import type { AppLogger } from "@opseye/observability";
import type {
  QueryRequest,
  RealtimeQueryEvent,
  RealtimeQueryStage,
} from "@opseye/types";

import { createBuildContextNode } from "../nodes/build-context.node";
import { createEmbedQueryNode } from "../nodes/embed-query.node";
import { createGenerateAnswerNode } from "../nodes/generate-answer.node";
import { createRetrieveNode } from "../nodes/retrieve.node";
import { createRerankNode } from "../nodes/rerank.node";
import type { QueryWorkflowResult } from "../workflow/build-graph";
import type { QueryWorkflowState } from "../workflow/state";
import type { AnswerService } from "./answer.service";
import type { ContextBuilderService } from "./context-builder.service";
import type { RerankingService } from "./reranking.service";
import type { RetrievalService } from "./retrieval.service";

export interface RealtimeQueryExecutionDependencies {
  readonly appConfig: AppConfig;
  readonly logger: AppLogger;
  readonly retrievalService: RetrievalService;
  readonly rerankingService: RerankingService;
  readonly contextBuilderService: ContextBuilderService;
  readonly answerService: AnswerService;
}

export interface ExecuteRealtimeQueryInput {
  readonly queryRequest: QueryRequest;
  readonly onEvent?: (event: RealtimeQueryEvent) => Promise<void> | void;
}

export const REALTIME_QUERY_FAILED_MESSAGE =
  "Realtime query execution failed. Review API logs with the query ID for details.";

function createEvent(
  queryId: string,
  stage: RealtimeQueryStage,
  payload: RealtimeQueryEvent["payload"],
): RealtimeQueryEvent {
  return {
    queryId,
    stage,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export class RealtimeQueryExecutionService {
  private readonly embedQueryNode: ReturnType<typeof createEmbedQueryNode>;

  private readonly retrieveNode: ReturnType<typeof createRetrieveNode>;

  private readonly rerankNode: ReturnType<typeof createRerankNode>;

  private readonly buildContextNode: ReturnType<typeof createBuildContextNode>;

  private readonly generateAnswerNode: ReturnType<
    typeof createGenerateAnswerNode
  >;

  public constructor(
    private readonly dependencies: RealtimeQueryExecutionDependencies,
  ) {
    this.embedQueryNode = createEmbedQueryNode({
      appConfig: dependencies.appConfig,
      logger: dependencies.logger,
    });
    this.retrieveNode = createRetrieveNode({
      retrievalService: dependencies.retrievalService,
    });
    this.rerankNode = createRerankNode({
      rerankingService: dependencies.rerankingService,
    });
    this.buildContextNode = createBuildContextNode({
      contextBuilderService: dependencies.contextBuilderService,
    });
    this.generateAnswerNode = createGenerateAnswerNode({
      answerService: dependencies.answerService,
    });
  }

  public async execute(
    input: ExecuteRealtimeQueryInput,
  ): Promise<QueryWorkflowResult> {
    const queryLogger = this.dependencies.logger.child({
      queryId: input.queryRequest.id,
      executionMode: "realtime",
    });

    try {
      let state: QueryWorkflowState = {
        queryRequest: input.queryRequest,
        retrievedChunks: [],
        rerankedChunks: [],
      };

      await this.emitEvent(
        input,
        createEvent(input.queryRequest.id, "started", {
          query: input.queryRequest.query,
          ...(input.queryRequest.filters !== undefined
            ? { filters: input.queryRequest.filters }
            : {}),
        }),
      );

      state = {
        ...state,
        ...(await this.embedQueryNode(state)),
      };

      await this.emitEvent(
        input,
        createEvent(input.queryRequest.id, "retrieving", {
          embeddingModel: state.queryEmbedding?.model ?? "unknown",
        }),
      );

      state = {
        ...state,
        ...(await this.retrieveNode(state)),
      };

      await this.emitEvent(
        input,
        createEvent(input.queryRequest.id, "reranking", {
          retrievedCount: state.retrievedChunks.length,
        }),
      );

      state = {
        ...state,
        ...(await this.rerankNode(state)),
      };

      await this.emitEvent(
        input,
        createEvent(input.queryRequest.id, "building_context", {
          retrievedCount: state.retrievedChunks.length,
          rerankedCount: state.rerankedChunks.length,
        }),
      );

      state = {
        ...state,
        ...(await this.buildContextNode(state)),
      };

      await this.emitEvent(
        input,
        createEvent(input.queryRequest.id, "generating_answer", {
          evidenceCount: state.builtContext?.evidence.length ?? 0,
        }),
      );

      state = {
        ...state,
        ...(await this.generateAnswerNode(state)),
      };

      const result = state as QueryWorkflowResult;

      await this.emitEvent(
        input,
        createEvent(input.queryRequest.id, "completed", {
          result: result.finalAnswer,
        }),
      );

      queryLogger.info("Completed realtime query workflow.", {
        retrievedCount: result.retrievedChunks.length,
        rerankedCount: result.rerankedChunks.length,
        evidenceCount: result.builtContext?.evidence.length ?? 0,
        citationCount: result.finalAnswer.references.length,
        confidence: result.finalAnswer.confidence,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown query execution error";

      queryLogger.error("Realtime query workflow failed.", {
        requestedAt: input.queryRequest.requestedAt,
        errorMessage,
      });

      await this.emitEvent(
        input,
        createEvent(input.queryRequest.id, "failed", {
          error: REALTIME_QUERY_FAILED_MESSAGE,
        }),
      );

      throw error;
    }
  }

  private async emitEvent(
    input: ExecuteRealtimeQueryInput,
    event: RealtimeQueryEvent,
  ): Promise<void> {
    if (input.onEvent === undefined) {
      return;
    }

    await input.onEvent(event);
  }
}
