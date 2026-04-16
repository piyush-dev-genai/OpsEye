import { createAppConfig } from "@opseye/config";
import { createLogger } from "@opseye/observability";
import { RedisVectorRepository } from "@opseye/vector-store";

import { createLogsConsumer } from "./consumer/logs.consumer";
import { IndexingService } from "./services/indexing.service";

export async function startIngestionWorker(): Promise<void> {
  const appConfig = createAppConfig();
  const logger = createLogger({
    serviceName: appConfig.observability.serviceName,
    environment: appConfig.observability.environment,
    level: appConfig.observability.logLevel,
  });

  const indexingService = new IndexingService(
    new RedisVectorRepository({ appConfig }),
    logger,
  );
  const logsConsumer = createLogsConsumer({
    appConfig,
    logger,
    indexingService,
  });

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info("Received shutdown signal.", { signal });

    await logsConsumer.disconnect();
    await indexingService.disconnect();

    logger.info("Ingestion worker stopped.");
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

  await logsConsumer.start();
}

if (require.main === module) {
  void startIngestionWorker().catch((error: unknown) => {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : "Unknown error";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
