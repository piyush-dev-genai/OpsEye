import type { DeploymentEnvironment, LogLevel } from "./log";

export const CHUNK_STRATEGIES = ["message", "trace", "time-window"] as const;

export type ChunkStrategy = (typeof CHUNK_STRATEGIES)[number];

export interface ChunkMetadata {
  readonly service: string;
  readonly environment: DeploymentEnvironment;
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly traceId?: string;
  readonly chunkStrategy: ChunkStrategy;
  readonly sourceLogIds: readonly string[];
}

export interface LogChunk {
  readonly chunkId: string;
  readonly content: string;
  readonly metadata: ChunkMetadata;
}

export interface EmbeddedLogChunk extends LogChunk {
  readonly embeddingModel: string;
  readonly embedding: readonly number[];
}
