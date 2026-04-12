import { z } from "zod";

import { DEPLOYMENT_ENVIRONMENTS } from "@opseye/types";

export const queryFiltersSchema = z
  .object({
    service: z.string().trim().min(1).optional(),
    environment: z.enum(DEPLOYMENT_ENVIRONMENTS).optional(),
    fromTimestamp: z.string().datetime({ offset: true }).optional(),
    toTimestamp: z.string().datetime({ offset: true }).optional(),
    traceId: z.string().trim().min(1).optional(),
  })
  .superRefine((filters, context) => {
    if (
      filters.fromTimestamp === undefined ||
      filters.toTimestamp === undefined
    ) {
      return;
    }

    if (Date.parse(filters.fromTimestamp) > Date.parse(filters.toTimestamp)) {
      context.addIssue({
        code: "custom",
        path: ["fromTimestamp"],
        message: "fromTimestamp must be less than or equal to toTimestamp.",
      });
    }
  });

export const queryRequestSchema = z.object({
  query: z.string().trim().min(1, "query is required."),
  filters: queryFiltersSchema.optional(),
});

export type QueryRequestBody = z.infer<typeof queryRequestSchema>;
