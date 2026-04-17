import { Router } from "express";

import type { AppLogger } from "@opseye/observability";
import type { QueryResultRepository } from "@opseye/vector-store";

import { createGetQueryResultController } from "../controllers/get-query-result.controller";
import { createQueryController } from "../controllers/query.controller";
import { validateRequestBody } from "../middleware/validate.middleware";
import { queryRequestSchema } from "../schemas/query.schema";
import type { QueryOrchestratorService } from "../services/query-orchestrator.service";

export function createQueryRoute(
  queryOrchestrator: QueryOrchestratorService,
  queryResultRepository: QueryResultRepository,
  logger: AppLogger,
): Router {
  const router = Router();

  router.post(
    "/query",
    validateRequestBody(queryRequestSchema),
    createQueryController(queryOrchestrator, logger),
  );
  router.get(
    "/query/:id",
    createGetQueryResultController(queryResultRepository, logger),
  );

  return router;
}
