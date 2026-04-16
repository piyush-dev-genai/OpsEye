import type { AppConfig } from "@opseye/config";
import {
  createConsumer,
  getTopic,
  type KafkaConsumerHandle,
} from "@opseye/kafka";
import type { AppLogger } from "@opseye/observability";
import type { QueryRequest } from "@opseye/types";

import type {
  QueryWorkflow,
  QueryWorkflowResult,
} from "../workflow/build-graph";

export interface QueryConsumerDependencies {
  readonly appConfig: AppConfig;
  readonly logger: AppLogger;
  readonly workflow: QueryWorkflow;
}

export interface QueryConsumerHandle {
  readonly consumer: KafkaConsumerHandle;
  start(): Promise<void>;
  disconnect(): Promise<void>;
}

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

async function processQueryRequest(
  payload: QueryRequest,
  workflow: QueryWorkflow,
  logger: AppLogger,
): Promise<void> {
  const queryLogger = logger.child({ queryId: payload.id });
  queryLogger.info("Processing query request.", {
    requestedAt: payload.requestedAt,
  });

  const result = await workflow.invoke({
    queryRequest: payload,
    retrievedChunks: [],
    rerankedChunks: [],
  });

  queryLogger.info("Completed query workflow.", buildResultLogContext(result));
  queryLogger.debug("Generated grounded query answer.", {
    answer: result.finalAnswer.answer,
    citations: result.finalAnswer.citations.join(","),
  });
}

export function createQueryConsumer(
  dependencies: QueryConsumerDependencies,
): QueryConsumerHandle {
  const consumer = createConsumer({
    appConfig: dependencies.appConfig,
    consumerConfig: {
      groupIdSuffix: "query-worker",
    },
  });

  return {
    consumer,
    start: async (): Promise<void> => {
      const topic = getTopic("queryRequested", dependencies.appConfig);

      await consumer.connect();
      await consumer.subscribe({ topic });
      await consumer.run<QueryRequest>({
        eachMessage: async ({ envelope }) => {
          await processQueryRequest(
            envelope.payload,
            dependencies.workflow,
            dependencies.logger,
          );
        },
      });

      dependencies.logger.info("Started query consumer.", { topic });
    },
    disconnect: async (): Promise<void> => {
      await consumer.disconnect();
    },
  };
}
