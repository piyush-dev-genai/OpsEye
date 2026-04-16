import { Annotation } from "@langchain/langgraph";
import type { QueryEmbedding, QueryRequest, QueryAnswer } from "@opseye/types";

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

export interface BuiltContext {
  readonly summary: string;
  readonly evidence: readonly ContextEvidence[];
}

export interface AnswerReference {
  readonly chunkId: string;
  readonly service: string;
  readonly environment: string;
  readonly timestamp: string;
  readonly level: string;
  readonly reason: string;
  readonly score: number;
  readonly traceId?: string;
}

export type AnswerConfidence = "high" | "medium" | "low";

export interface QueryWorkflowAnswer extends QueryAnswer {
  readonly confidence: AnswerConfidence;
  readonly rootCauseHypothesis: string;
  readonly evidenceSummary: readonly string[];
  readonly uncertainty: string;
  readonly recommendedNextSteps: readonly string[];
  readonly references: readonly AnswerReference[];
}

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
