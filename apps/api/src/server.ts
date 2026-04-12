import type { Server } from "node:http";

import { createAppConfig } from "@opseye/config";
import { createProducer } from "@opseye/kafka";
import { createLogger } from "@opseye/observability";

import { createApp } from "./app";
import { IngestPublisherService } from "./services/ingest-publisher.service";
import { QueryOrchestratorService } from "./services/query-orchestrator.service";

export async function startServer(): Promise<Server> {
  const appConfig = createAppConfig();
  const logger = createLogger({
    serviceName: appConfig.observability.serviceName,
    environment: appConfig.observability.environment,
    level: appConfig.observability.logLevel,
  });

  const producer = createProducer({ appConfig });
  await producer.connect();

  const app = createApp({
    appConfig,
    logger,
    ingestPublisher: new IngestPublisherService(producer, logger, appConfig),
    queryOrchestrator: new QueryOrchestratorService(producer, logger, appConfig),
  });

  const server = await new Promise<Server>((resolve) => {
    const httpServer = app.listen(
      appConfig.server.port,
      appConfig.server.host,
      () => {
        logger.info("API server started.", {
          host: appConfig.server.host,
          port: appConfig.server.port,
        });
        resolve(httpServer);
      },
    );
  });

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info("Received shutdown signal.", { signal });

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    await producer.disconnect();
    logger.info("API server stopped.");
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal).catch((error: unknown) => {
        logger.error("Failed during shutdown.", {
          signal,
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        });
        process.exitCode = 1;
      });
    });
  }

  return server;
}

if (require.main === module) {
  void startServer().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.stack ?? error.message : "Unknown error";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
