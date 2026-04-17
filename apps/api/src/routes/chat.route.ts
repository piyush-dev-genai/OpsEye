import { Router } from "express";

import type { AppLogger } from "@opseye/observability";
import type { RealtimeQueryExecutionService } from "@opseye/query-worker";

import { createChatQueryController } from "../controllers/chat-query.controller";
import { validateRequestBody } from "../middleware/validate.middleware";
import { queryRequestSchema } from "../schemas/query.schema";

export function createChatRoute(
  realtimeQueryExecutionService: RealtimeQueryExecutionService,
  logger: AppLogger,
): Router {
  const router = Router();

  router.post(
    "/chat/query",
    validateRequestBody(queryRequestSchema),
    createChatQueryController(realtimeQueryExecutionService, logger),
  );

  return router;
}
