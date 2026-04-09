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
