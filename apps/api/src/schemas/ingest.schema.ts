import { z } from "zod";

import { DEPLOYMENT_ENVIRONMENTS, LOG_LEVELS } from "@opseye/types";

const logAttributeValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const logAttributesSchema = z.record(z.string(), logAttributeValueSchema);

export const rawLogEventSchema = z.object({
  message: z.string().trim().min(1, "message is required."),
  timestamp: z.string().datetime({ offset: true }),
  service: z.string().trim().min(1, "service is required."),
  environment: z.enum(DEPLOYMENT_ENVIRONMENTS),
  level: z.enum(LOG_LEVELS),
  traceId: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  attributes: logAttributesSchema.optional(),
});

export const ingestRequestSchema = z.object({
  logs: z.array(rawLogEventSchema).min(1, "At least one log entry is required.")
  .max(500, "A maximum of 500 log entries is allowed per request."),
});

export type IngestRequestBody = z.infer<typeof ingestRequestSchema>;
