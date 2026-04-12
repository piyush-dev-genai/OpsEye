import { Router } from "express";

import type { AppConfig } from "@opseye/config";

export function createHealthRoute(appConfig: AppConfig): Router {
  const router = Router();

  router.get("/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: appConfig.observability.serviceName,
      environment: appConfig.runtime.appEnv,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  return router;
}
