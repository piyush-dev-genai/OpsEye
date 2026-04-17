import express, { type Express } from "express";

import type { AppConfig } from "@opseye/config";
import type { AppLogger } from "@opseye/observability";
import type { QueryResultRepository } from "@opseye/vector-store";

import { createErrorMiddleware } from "./middleware/error.middleware";
import { requestIdMiddleware } from "./middleware/request-id.middleware";
import { createHealthRoute } from "./routes/health.route";
import { createIngestRoute } from "./routes/ingest.route";
import { createQueryRoute } from "./routes/query.route";
import type { IngestPublisherService } from "./services/ingest-publisher.service";
import type { QueryOrchestratorService } from "./services/query-orchestrator.service";

export interface ApiAppDependencies {
  readonly appConfig: AppConfig;
  readonly logger: AppLogger;
  readonly ingestPublisher: IngestPublisherService;
  readonly queryOrchestrator: QueryOrchestratorService;
  readonly queryResultRepository: QueryResultRepository;
}

export function createApp(dependencies: ApiAppDependencies): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(requestIdMiddleware());
  app.use(createHealthRoute(dependencies.appConfig));
  app.use(createIngestRoute(dependencies.ingestPublisher, dependencies.logger));
  app.use(
    createQueryRoute(
      dependencies.queryOrchestrator,
      dependencies.queryResultRepository,
      dependencies.logger,
    ),
  );
  app.use(createErrorMiddleware(dependencies.logger));

  return app;
}
