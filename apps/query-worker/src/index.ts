import { createAppConfig } from "@opseye/config";
import { createLogger } from "@opseye/observability";
import {
  QueryResultRepository,
  RedisVectorRepository,
} from "@opseye/vector-store";

import { createQueryConsumer } from "./consumer/query.consumer";
import { AnswerService } from "./services/answer.service";
import { ContextBuilderService } from "./services/context-builder.service";
import { RerankingService } from "./services/reranking.service";
import { RetrievalService } from "./services/retrieval.service";
import { buildQueryGraph } from "./workflow/build-graph";

export async function startQueryWorker(): Promise<void> {
  const appConfig = createAppConfig();
  const logger = createLogger({
    serviceName: appConfig.observability.serviceName,
    environment: appConfig.observability.environment,
    level: appConfig.observability.logLevel,
  });

  const vectorRepository = new RedisVectorRepository({ appConfig });
  const queryResultRepository = new QueryResultRepository({ appConfig });
  await queryResultRepository.ensureConnected();
  const retrievalService = new RetrievalService(
    vectorRepository,
    logger,
    appConfig,
  );
  const rerankingService = new RerankingService(logger);
  const contextBuilderService = new ContextBuilderService(logger);
  const answerService = new AnswerService(logger, appConfig);
  const workflow = buildQueryGraph({
    retrievalService,
    rerankingService,
    contextBuilderService,
    answerService,
    appConfig,
    logger,
  });
  const queryConsumer = createQueryConsumer({
    appConfig,
    logger,
    workflow,
    queryResultRepository,
  });

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info("Received shutdown signal.", { signal });

    await queryConsumer.disconnect();
    await retrievalService.disconnect();
    await queryResultRepository.disconnect();

    logger.info("Query worker stopped.");
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal).catch((error: unknown) => {
        logger.error("Failed during worker shutdown.", {
          signal,
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        });
        process.exitCode = 1;
      });
    });
  }

  await queryConsumer.start();
}

if (require.main === module) {
  void startQueryWorker().catch((error: unknown) => {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : "Unknown error";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
