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
  readonly possibleRemediations: readonly string[];
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

export type RealtimeQueryStage =
  | "started"
  | "retrieving"
  | "reranking"
  | "building_context"
  | "generating_answer"
  | "completed"
  | "failed";

export interface RealtimeQueryStartedPayload {
  readonly query: string;
  readonly filters?: QueryFilters;
}

export interface RealtimeQueryRetrievingPayload {
  readonly embeddingModel: string;
}

export interface RealtimeQueryRerankingPayload {
  readonly retrievedCount: number;
}

export interface RealtimeQueryBuildingContextPayload {
  readonly retrievedCount: number;
  readonly rerankedCount: number;
}

export interface RealtimeQueryGeneratingAnswerPayload {
  readonly evidenceCount: number;
}

export interface RealtimeQueryCompletedPayload {
  readonly result: QueryExecutionResult;
}

export interface RealtimeQueryFailedPayload {
  readonly error: string;
}

export interface RealtimeQueryEvent {
  readonly queryId: string;
  readonly stage: RealtimeQueryStage;
  readonly timestamp: string;
  readonly payload:
    | RealtimeQueryStartedPayload
    | RealtimeQueryRetrievingPayload
    | RealtimeQueryRerankingPayload
    | RealtimeQueryBuildingContextPayload
    | RealtimeQueryGeneratingAnswerPayload
    | RealtimeQueryCompletedPayload
    | RealtimeQueryFailedPayload;
}
