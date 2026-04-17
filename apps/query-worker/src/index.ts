import { createAppConfig } from "@opseye/config";
import { createLogger } from "@opseye/observability";
import { QueryResultRepository } from "@opseye/vector-store";

import { createQueryConsumer } from "./consumer/query.consumer";
import { createQueryRuntime } from "./runtime/query-runtime";

export async function startQueryWorker(): Promise<void> {
  const appConfig = createAppConfig();
  const logger = createLogger({
    serviceName: appConfig.observability.serviceName,
    environment: appConfig.observability.environment,
    level: appConfig.observability.logLevel,
  });

  const queryResultRepository = new QueryResultRepository({ appConfig });
  await queryResultRepository.ensureConnected();
  const queryRuntime = createQueryRuntime({
    appConfig,
    logger,
  });
  const queryConsumer = createQueryConsumer({
    appConfig,
    logger,
    workflow: queryRuntime.workflow,
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
    await queryRuntime.disconnect();
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

export * from "./runtime/query-runtime";
export * from "./services/realtime-query.service";

if (require.main === module) {
  void startQueryWorker().catch((error: unknown) => {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : "Unknown error";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
