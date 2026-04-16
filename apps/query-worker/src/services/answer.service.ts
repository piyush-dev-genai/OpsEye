import type { AppConfig } from "@opseye/config";
import { completeChat, type LlmMessage } from "@opseye/llm";
import type { AppLogger } from "@opseye/observability";
import type { QueryRequest } from "@opseye/types";

import { buildRcaPrompt } from "../prompts/rca.prompt";
import type {
  AnswerConfidence,
  BuiltContext,
  QueryWorkflowAnswer,
} from "../workflow/state";

export interface GenerateAnswerRequest {
  readonly queryRequest: QueryRequest;
  readonly builtContext: BuiltContext;
}

interface LlmAnswerPayload {
  readonly rootCauseHypothesis?: string;
  readonly evidenceSummary?: readonly string[];
  readonly uncertainty?: string;
  readonly recommendedNextSteps?: readonly string[];
  readonly confidence?: string;
  readonly answer?: string;
}

function normalizeStringArray(
  value: readonly string[] | undefined,
): readonly string[] {
  if (value === undefined) {
    return [];
  }

  return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function normalizeConfidence(value?: string): AnswerConfidence {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  return "low";
}

function tryParseJson(content: string): LlmAnswerPayload | undefined {
  try {
    return JSON.parse(content) as LlmAnswerPayload;
  } catch {
    return undefined;
  }
}

function buildFallbackAnswer(request: GenerateAnswerRequest): LlmAnswerPayload {
  const evidenceSummary = request.builtContext.evidence.map(
    (item) => `${item.chunkId}: ${item.summary}`,
  );
  const uncertainty =
    request.builtContext.evidence.length === 0
      ? "No supporting evidence was retrieved from indexed log chunks."
      : "Evidence is limited to the retrieved log chunks and may not cover the full incident timeline.";
  const answer =
    request.builtContext.evidence.length === 0
      ? "I could not determine a root cause from the indexed log evidence. The current retrieval returned no relevant chunks."
      : `Most likely issue: ${request.builtContext.evidence[0]?.summary ?? "unknown"}`;

  return {
    rootCauseHypothesis:
      request.builtContext.evidence[0]?.summary ??
      "Insufficient retrieved evidence for a grounded RCA hypothesis.",
    evidenceSummary,
    uncertainty,
    recommendedNextSteps: [
      "Validate the highest-ranked service and trace around the cited timestamps.",
      "Expand the query window or filters if the incident spans multiple services.",
    ],
    confidence: request.builtContext.evidence.length >= 3 ? "medium" : "low",
    answer,
  };
}

function toFinalAnswer(
  request: GenerateAnswerRequest,
  payload: LlmAnswerPayload,
): QueryWorkflowAnswer {
  const evidenceSummary = normalizeStringArray(payload.evidenceSummary);
  const recommendedNextSteps = normalizeStringArray(
    payload.recommendedNextSteps,
  );
  const references = request.builtContext.evidence.map((item) => ({
    chunkId: item.chunkId,
    service: item.service,
    environment: item.environment,
    timestamp: item.timestamp,
    level: item.level,
    reason: item.rationale.join("; "),
    score: Number(item.finalScore.toFixed(4)),
    ...(item.traceId !== undefined ? { traceId: item.traceId } : {}),
  }));

  return {
    queryId: request.queryRequest.id,
    generatedAt: new Date().toISOString(),
    answer: payload.answer?.trim().length
      ? payload.answer.trim()
      : "Unable to produce a grounded answer from the retrieved evidence.",
    citations: references.map((reference) => reference.chunkId),
    confidence: normalizeConfidence(payload.confidence),
    rootCauseHypothesis: payload.rootCauseHypothesis?.trim().length
      ? payload.rootCauseHypothesis.trim()
      : "Insufficient retrieved evidence for a grounded RCA hypothesis.",
    evidenceSummary,
    uncertainty: payload.uncertainty?.trim().length
      ? payload.uncertainty.trim()
      : "Evidence is weak or incomplete.",
    recommendedNextSteps,
    references,
  };
}

export class AnswerService {
  public constructor(
    private readonly logger: AppLogger,
    private readonly appConfig: AppConfig,
  ) {}

  public async generate(
    request: GenerateAnswerRequest,
  ): Promise<QueryWorkflowAnswer> {
    const messages: readonly LlmMessage[] = buildRcaPrompt(request);
    const completion = await completeChat({
      appConfig: this.appConfig,
      messages,
      temperature: 0,
      user: request.queryRequest.id,
    });
    const parsed = tryParseJson(completion.content);
    const finalAnswer = toFinalAnswer(
      request,
      parsed ?? buildFallbackAnswer(request),
    );

    this.logger.info("Generated grounded RCA answer.", {
      queryId: request.queryRequest.id,
      model: completion.model,
      finishReason: completion.finishReason ?? "unknown",
      confidence: finalAnswer.confidence,
      citationCount: finalAnswer.citations.length,
    });

    return finalAnswer;
  }
}
