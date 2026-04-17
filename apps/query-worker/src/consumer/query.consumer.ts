import type { AppConfig } from "@opseye/config";
import {
  createConsumer,
  getTopic,
  type KafkaConsumerHandle,
} from "@opseye/kafka";
import type { AppLogger } from "@opseye/observability";
import type { QueryRequest } from "@opseye/types";
import type { QueryResultRepository } from "@opseye/vector-store";

import { QueryExecutionService } from "../services/query-execution.service";
import type { QueryWorkflow } from "../workflow/build-graph";

export interface QueryConsumerDependencies {
  readonly appConfig: AppConfig;
  readonly logger: AppLogger;
  readonly workflow: QueryWorkflow;
  readonly queryResultRepository: QueryResultRepository;
}

export interface QueryConsumerHandle {
  readonly consumer: KafkaConsumerHandle;
  start(): Promise<void>;
  disconnect(): Promise<void>;
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
  const queryExecutionService = new QueryExecutionService({
    workflow: dependencies.workflow,
    queryResultRepository: dependencies.queryResultRepository,
    logger: dependencies.logger,
  });

  return {
    consumer,
    start: async (): Promise<void> => {
      const topic = getTopic("queryRequested", dependencies.appConfig);

      await consumer.connect();
      await consumer.subscribe({ topic });
      await consumer.run<QueryRequest>({
        eachMessage: async ({ envelope }) => {
          await queryExecutionService.execute(envelope.payload);
        },
      });

      dependencies.logger.info("Started query consumer.", { topic });
    },
    disconnect: async (): Promise<void> => {
      await consumer.disconnect();
    },
  };
}
