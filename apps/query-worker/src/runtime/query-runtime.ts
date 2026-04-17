import type { AppConfig } from "@opseye/config";
import type { AppLogger } from "@opseye/observability";
import { RedisVectorRepository } from "@opseye/vector-store";

import { AnswerService } from "../services/answer.service";
import { ContextBuilderService } from "../services/context-builder.service";
import { RealtimeQueryExecutionService } from "../services/realtime-query.service";
import { RerankingService } from "../services/reranking.service";
import { RetrievalService } from "../services/retrieval.service";
import { buildQueryGraph, type QueryWorkflow } from "../workflow/build-graph";

export interface QueryRuntimeDependencies {
  readonly appConfig: AppConfig;
  readonly logger: AppLogger;
}

export interface QueryRuntime {
  readonly workflow: QueryWorkflow;
  readonly realtimeQueryExecutionService: RealtimeQueryExecutionService;
  disconnect(): Promise<void>;
}

export function createQueryRuntime(
  dependencies: QueryRuntimeDependencies,
): QueryRuntime {
  const vectorRepository = new RedisVectorRepository({
    appConfig: dependencies.appConfig,
  });
  const retrievalService = new RetrievalService(
    vectorRepository,
    dependencies.logger,
    dependencies.appConfig,
  );
  const rerankingService = new RerankingService(dependencies.logger);
  const contextBuilderService = new ContextBuilderService(dependencies.logger);
  const answerService = new AnswerService(
    dependencies.logger,
    dependencies.appConfig,
  );
  const workflow = buildQueryGraph({
    retrievalService,
    rerankingService,
    contextBuilderService,
    answerService,
    appConfig: dependencies.appConfig,
    logger: dependencies.logger,
  });
  const realtimeQueryExecutionService = new RealtimeQueryExecutionService({
    appConfig: dependencies.appConfig,
    logger: dependencies.logger,
    retrievalService,
    rerankingService,
    contextBuilderService,
    answerService,
  });

  return {
    workflow,
    realtimeQueryExecutionService,
    disconnect: async (): Promise<void> => {
      await retrievalService.disconnect();
    },
  };
}
