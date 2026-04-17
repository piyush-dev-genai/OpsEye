import type { AppLogger } from "@opseye/observability";
import type { QueryRequest } from "@opseye/types";
import type { QueryResultRepository } from "@opseye/vector-store";

import type {
  QueryWorkflow,
  QueryWorkflowResult,
} from "../workflow/build-graph";

export interface QueryExecutionServiceDependencies {
  readonly workflow: QueryWorkflow;
  readonly queryResultRepository: QueryResultRepository;
  readonly logger: AppLogger;
}

export const QUERY_EXECUTION_FAILED_MESSAGE =
  "Query execution failed. Review query-worker logs with the query ID for details.";

function buildResultLogContext(
  result: QueryWorkflowResult,
): Record<string, string | number> {
  return {
    queryId: result.queryRequest.id,
    retrievedCount: result.retrievedChunks.length,
    rerankedCount: result.rerankedChunks.length,
    evidenceCount: result.builtContext?.evidence.length ?? 0,
    citationCount: result.finalAnswer.references.length,
    confidence: result.finalAnswer.confidence,
  };
}

export class QueryExecutionService {
  public constructor(
    private readonly dependencies: QueryExecutionServiceDependencies,
  ) {}

  public async execute(payload: QueryRequest): Promise<void> {
    const queryLogger = this.dependencies.logger.child({ queryId: payload.id });

    await this.dependencies.queryResultRepository.markProcessing({
      queryId: payload.id,
      query: payload.query,
      requestedAt: payload.requestedAt,
      ...(payload.filters !== undefined ? { filters: payload.filters } : {}),
    });

    queryLogger.info("Processing query request.", {
      requestedAt: payload.requestedAt,
    });

    try {
      const result = await this.dependencies.workflow.invoke({
        queryRequest: payload,
        retrievedChunks: [],
        rerankedChunks: [],
      });

      await this.dependencies.queryResultRepository.markCompleted(
        payload.id,
        result.finalAnswer,
      );

      queryLogger.info(
        "Completed query workflow.",
        buildResultLogContext(result),
      );
      queryLogger.debug("Generated grounded query answer.", {
        answer: result.finalAnswer.answer,
        citations: result.finalAnswer.citations.join(","),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown query execution error";

      await this.dependencies.queryResultRepository.markFailed(
        payload.id,
        QUERY_EXECUTION_FAILED_MESSAGE,
      );

      queryLogger.error("Query workflow failed.", {
        requestedAt: payload.requestedAt,
        errorMessage,
      });

      throw error;
    }
  }
}
