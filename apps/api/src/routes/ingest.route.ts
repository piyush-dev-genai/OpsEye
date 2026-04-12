import { Router } from "express";

import type { AppLogger } from "@opseye/observability";

import { createIngestController } from "../controllers/ingest.controller";
import { validateRequestBody } from "../middleware/validate.middleware";
import { ingestRequestSchema } from "../schemas/ingest.schema";
import type { IngestPublisherService } from "../services/ingest-publisher.service";

export function createIngestRoute(
  ingestPublisher: IngestPublisherService,
  logger: AppLogger,
): Router {
  const router = Router();

  router.post(
    "/ingest",
    validateRequestBody(ingestRequestSchema),
    createIngestController(ingestPublisher, logger),
  );

  return router;
}
