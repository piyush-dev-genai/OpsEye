export const QUERY_WORKFLOW_STEPS = [
  "embed-query",
  "retrieve-chunks",
  "rerank-chunks",
  "build-context",
  "generate-answer",
] as const;

export type QueryWorkflowStep = (typeof QUERY_WORKFLOW_STEPS)[number];

export interface AgentDocumentReference {
  readonly chunkId: string;
  readonly score: number;
}

export interface AgentState {
  readonly queryId: string;
  readonly query: string;
  readonly currentStep: QueryWorkflowStep;
  readonly completedSteps: readonly QueryWorkflowStep[];
  readonly retrievedChunkIds: readonly string[];
  readonly contextChunkIds: readonly string[];
  readonly context?: string;
  readonly answer?: string;
  readonly references?: readonly AgentDocumentReference[];
}

export interface AgentExecutionResult {
  readonly queryId: string;
  readonly completedAt: string;
  readonly references: readonly AgentDocumentReference[];
  readonly answer: string;
}
