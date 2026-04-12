import { Router } from "express";

import type { AppLogger } from "@opseye/observability";

import { createQueryController } from "../controllers/query.controller";
import { validateRequestBody } from "../middleware/validate.middleware";
import { queryRequestSchema } from "../schemas/query.schema";
import type { QueryOrchestratorService } from "../services/query-orchestrator.service";

export function createQueryRoute(
  queryOrchestrator: QueryOrchestratorService,
  logger: AppLogger,
): Router {
  const router = Router();

  router.post(
    "/query",
    validateRequestBody(queryRequestSchema),
    createQueryController(queryOrchestrator, logger),
  );

  return router;
}
