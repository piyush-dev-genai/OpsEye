import type { DeploymentEnvironment } from "./log";

export interface QueryFilters {
  readonly service?: string;
  readonly environment?: DeploymentEnvironment;
  readonly fromTimestamp?: string;
  readonly toTimestamp?: string;
  readonly traceId?: string;
}

export interface QueryRequest {
  readonly id: string;
  readonly query: string;
  readonly requestedAt: string;
  readonly filters?: QueryFilters;
}

export interface QueryEmbedding {
  readonly queryId: string;
  readonly model: string;
  readonly vector: readonly number[];
}

export interface QueryAnswer {
  readonly queryId: string;
  readonly answer: string;
  readonly generatedAt: string;
  readonly citations: readonly string[];
}

export type QueryExecutionStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type QueryAnswerConfidence = "high" | "medium" | "low";

export interface QueryAnswerReference {
  readonly chunkId: string;
  readonly service: string;
  readonly environment: string;
  readonly timestamp: string;
  readonly level: string;
  readonly reason: string;
  readonly score: number;
  readonly traceId?: string;
}

export interface QueryExecutionResult extends QueryAnswer {
  readonly confidence: QueryAnswerConfidence;
  readonly rootCauseHypothesis: string;
  readonly evidenceSummary: readonly string[];
  readonly uncertainty: string;
  readonly recommendedNextSteps: readonly string[];
  readonly references: readonly QueryAnswerReference[];
}

export interface PersistedQueryResult {
  readonly queryId: string;
  readonly query: string;
  readonly requestedAt: string;
  readonly updatedAt: string;
  readonly status: QueryExecutionStatus;
  readonly filters?: QueryFilters;
  readonly result?: QueryExecutionResult;
  readonly error?: string;
}
