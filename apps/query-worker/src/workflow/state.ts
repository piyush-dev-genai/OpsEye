import { Annotation } from "@langchain/langgraph";
import type {
  QueryAnswerConfidence,
  QueryEmbedding,
  QueryExecutionResult,
  QueryRequest,
} from "@opseye/types";

export interface RetrievedChunkRecord {
  readonly chunkId: string;
  readonly content: string;
  readonly metadata: {
    readonly service: string;
    readonly environment: string;
    readonly timestamp: string;
    readonly level: string;
    readonly traceId?: string;
    readonly chunkStrategy: string;
    readonly sourceLogIds: readonly string[];
  };
  readonly embeddingModel: string;
  readonly vectorDistance: number;
  readonly vectorScore: number;
}

export interface RerankedChunkRecord extends RetrievedChunkRecord {
  readonly recencyScore: number;
  readonly metadataScore: number;
  readonly finalScore: number;
  readonly rankingReasons: readonly string[];
}

export interface ContextEvidence {
  readonly chunkId: string;
  readonly service: string;
  readonly environment: string;
  readonly timestamp: string;
  readonly level: string;
  readonly traceId?: string;
  readonly summary: string;
  readonly rationale: readonly string[];
  readonly finalScore: number;
}

export interface ContextEvidenceGroup {
  readonly groupKey: string;
  readonly label: string;
  readonly services: readonly string[];
  readonly itemCount: number;
  readonly items: readonly ContextEvidence[];
}

export interface ContextTimelineEntry {
  readonly chunkId: string;
  readonly timestamp: string;
  readonly service: string;
  readonly level: string;
  readonly summary: string;
  readonly traceId?: string;
}

export interface BuiltContext {
  readonly summary: string;
  readonly evidence: readonly ContextEvidence[];
  readonly groups: readonly ContextEvidenceGroup[];
  readonly timeline: readonly ContextTimelineEntry[];
}

export type AnswerConfidence = QueryAnswerConfidence;

export type QueryWorkflowAnswer = QueryExecutionResult;

export interface QueryWorkflowState {
  readonly queryRequest: QueryRequest;
  readonly queryEmbedding?: QueryEmbedding;
  readonly retrievedChunks: readonly RetrievedChunkRecord[];
  readonly rerankedChunks: readonly RerankedChunkRecord[];
  readonly builtContext?: BuiltContext;
  readonly finalAnswer?: QueryWorkflowAnswer;
}

export const QueryWorkflowStateAnnotation = Annotation.Root({
  queryRequest: Annotation<QueryRequest>(),
  queryEmbedding: Annotation<QueryEmbedding | undefined>(),
  retrievedChunks: Annotation<readonly RetrievedChunkRecord[]>(),
  rerankedChunks: Annotation<readonly RerankedChunkRecord[]>(),
  builtContext: Annotation<BuiltContext | undefined>(),
  finalAnswer: Annotation<QueryWorkflowAnswer | undefined>(),
});
