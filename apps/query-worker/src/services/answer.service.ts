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
  readonly possibleRemediations?: readonly string[];
  readonly confidence?: string;
  readonly answer?: string;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function normalizeStringArray(
  value: readonly string[] | undefined,
): readonly string[] {
  if (value === undefined) {
    return [];
  }

  return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
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

function buildDefaultEvidenceSummary(
  request: GenerateAnswerRequest,
): readonly string[] {
  return request.builtContext.evidence.map(
    (item) => `${item.service} ${item.level} at ${item.timestamp}: ${item.summary}`,
  );
}

function buildDefaultNextSteps(
  request: GenerateAnswerRequest,
): readonly string[] {
  const primaryEvidence = request.builtContext.evidence[0];

  return uniqueStrings([
    `Validate ${primaryEvidence?.service ?? "the implicated service"} around ${primaryEvidence?.timestamp ?? request.queryRequest.requestedAt}.`,
    primaryEvidence?.traceId !== undefined
      ? `Inspect trace ${primaryEvidence.traceId} across downstream services.`
      : "Check adjacent services in the incident path for corroborating failures.",
    "Review deployment and infrastructure changes in the same time window.",
  ]);
}

function buildDefaultRemediations(
  request: GenerateAnswerRequest,
): readonly string[] {
  const primaryEvidence = request.builtContext.evidence[0];
  const services = request.builtContext.groups.flatMap((group) => group.services);

  return uniqueStrings([
    primaryEvidence?.level === "error"
      ? `Mitigate the failure path in ${primaryEvidence.service} before widening traffic or retries.`
      : "Stabilize the implicated service before applying wider operational changes.",
    services.length > 1
      ? "Coordinate remediation across the affected services if the timeline indicates a cascading failure."
      : `Consider targeted rollback or resource recovery only after validating the suspected failure path in ${primaryEvidence?.service ?? "the service"}.`,
  ]);
}

function buildFallbackConfidence(request: GenerateAnswerRequest): AnswerConfidence {
  if (request.builtContext.evidence.length === 0) {
    return "low";
  }

  if (
    request.builtContext.evidence.length >= 3 &&
    request.builtContext.groups.length >= 2
  ) {
    return "medium";
  }

  return "low";
}

function buildFallbackAnswer(request: GenerateAnswerRequest): LlmAnswerPayload {
  if (request.builtContext.evidence.length === 0) {
    return {
      rootCauseHypothesis:
        "Insufficient retrieved evidence for a grounded RCA hypothesis.",
      evidenceSummary: [],
      uncertainty:
        "No supporting evidence was retrieved from indexed operational data.",
      recommendedNextSteps: [
        "Expand the time window or relax service filters.",
        "Validate that ingestion covered the relevant incident interval.",
      ],
      possibleRemediations: [],
      confidence: "low",
      answer: [
        "Likely issue: unable to determine a grounded root cause.",
        "Why this is likely: the current retrieval returned no supporting evidence.",
        "Supporting evidence: none.",
        "Suggested next checks: expand the query window and verify ingestion coverage.",
        "Possible remediation: none can be recommended without evidence.",
        "Confidence: low.",
      ].join("\n"),
    };
  }

  const primaryEvidence = request.builtContext.evidence[0];
  const primaryGroup = request.builtContext.groups[0];
  const services = request.builtContext.groups.flatMap((group) => group.services);

  return {
    rootCauseHypothesis:
      primaryEvidence?.summary ??
      "Insufficient retrieved evidence for a grounded RCA hypothesis.",
    evidenceSummary: buildDefaultEvidenceSummary(request),
    uncertainty:
      request.builtContext.groups.length > 1
        ? "Evidence spans multiple services or traces and may reflect a cascading incident rather than a single isolated fault."
        : "Evidence is limited to a narrow slice of the incident window and may not cover the full failure chain.",
    recommendedNextSteps: buildDefaultNextSteps(request),
    possibleRemediations: buildDefaultRemediations(request),
    confidence: buildFallbackConfidence(request),
    answer: [
      `Likely issue: ${primaryEvidence?.summary ?? "insufficient evidence"}`,
      `Why this is likely: top evidence comes from ${primaryGroup?.label ?? primaryEvidence?.service ?? "the indexed evidence"} with ${request.builtContext.evidence.length} supporting item(s).`,
      `Supporting evidence: ${buildDefaultEvidenceSummary(request).slice(0, 2).join(" | ")}`,
      `Suggested next checks: ${uniqueStrings([
        `validate ${primaryEvidence?.service ?? "the implicated service"}`,
        primaryEvidence?.traceId !== undefined
          ? `follow trace ${primaryEvidence.traceId}`
          : "inspect adjacent services",
      ]).join("; ")}`,
      `Possible remediation: ${uniqueStrings([
        primaryEvidence?.service !== undefined
          ? `stabilize ${primaryEvidence.service}`
          : "stabilize the implicated service",
      ]).join("; ")}`,
      `Confidence: ${buildFallbackConfidence(request)}.`,
    ].join("\n"),
  };
}

function buildStructuredAnswerText(
  payload: LlmAnswerPayload,
  request: GenerateAnswerRequest,
): string {
  const hasEvidence = request.builtContext.evidence.length > 0;
  const likelyIssue =
    normalizeOptionalString(payload.rootCauseHypothesis) ??
    "Insufficient retrieved evidence for a grounded RCA hypothesis.";
  const supportingEvidence =
    (hasEvidence
      ? normalizeStringArray(payload.evidenceSummary).slice(0, 3).join(" | ") ||
        buildDefaultEvidenceSummary(request).slice(0, 3).join(" | ")
      : "none.") || "No supporting evidence was retrieved.";
  const whyThisIsLikely =
    hasEvidence && request.builtContext.groups.length > 0
      ? `${request.builtContext.groups[0]?.label ?? "Top evidence group"} produced the strongest supporting signal.`
      : "No supporting evidence was retrieved.";
  const nextChecks =
    normalizeStringArray(payload.recommendedNextSteps).join("; ") ||
    (hasEvidence
      ? buildDefaultNextSteps(request).join("; ")
      : "Expand the time window or relax service filters; validate that ingestion covered the relevant incident interval.");
  const remediations =
    (hasEvidence
      ? normalizeStringArray(payload.possibleRemediations).join("; ") ||
        buildDefaultRemediations(request).join("; ")
      : "none can be recommended without evidence.");
  const uncertainty =
    normalizeOptionalString(payload.uncertainty) ?? "Evidence is weak or incomplete.";
  const confidence = normalizeConfidence(payload.confidence);

  return [
    `Likely issue: ${likelyIssue}`,
    `Why this is likely: ${whyThisIsLikely}`,
    `Supporting evidence: ${supportingEvidence}`,
    `Suggested next checks: ${nextChecks}`,
    `Possible remediation: ${remediations}`,
    `Confidence: ${confidence}. ${uncertainty}`,
  ].join("\n");
}

function toFinalAnswer(
  request: GenerateAnswerRequest,
  payload: LlmAnswerPayload,
): QueryWorkflowAnswer {
  const fallback = buildFallbackAnswer(request);
  const evidenceSummary = uniqueStrings(
    normalizeStringArray(payload.evidenceSummary).length > 0
      ? normalizeStringArray(payload.evidenceSummary)
      : buildDefaultEvidenceSummary(request),
  );
  const recommendedNextSteps = uniqueStrings(
    normalizeStringArray(payload.recommendedNextSteps).length > 0
      ? normalizeStringArray(payload.recommendedNextSteps)
      : normalizeStringArray(fallback.recommendedNextSteps),
  );
  const possibleRemediations = uniqueStrings(
    normalizeStringArray(payload.possibleRemediations).length > 0
      ? normalizeStringArray(payload.possibleRemediations)
      : normalizeStringArray(fallback.possibleRemediations),
  );

  const normalizedRootCauseHypothesis = normalizeOptionalString(
    payload.rootCauseHypothesis,
  );
  const normalizedUncertainty = normalizeOptionalString(payload.uncertainty);

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
    answer: buildStructuredAnswerText(payload, request),
    citations: references.map((reference) => reference.chunkId),
    confidence: normalizeConfidence(payload.confidence),
    rootCauseHypothesis:
      normalizedRootCauseHypothesis !== undefined &&
      normalizedRootCauseHypothesis.length > 0
        ? normalizedRootCauseHypothesis
        : "Insufficient retrieved evidence for a grounded RCA hypothesis.",
    evidenceSummary,
    uncertainty:
      normalizedUncertainty !== undefined && normalizedUncertainty.length > 0
        ? normalizedUncertainty
        : "Evidence is weak or incomplete.",
    recommendedNextSteps,
    possibleRemediations,
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

    if (request.builtContext.evidence.length === 0) {
      const fallback = buildFallbackAnswer(request);
      return toFinalAnswer(request, fallback);
    }

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
