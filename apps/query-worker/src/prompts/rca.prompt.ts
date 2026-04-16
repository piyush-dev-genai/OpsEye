import type { LlmMessage } from "@opseye/llm";

import type { GenerateAnswerRequest } from "../services/answer.service";

function buildEvidenceBlock(request: GenerateAnswerRequest): string {
  if (request.builtContext.evidence.length === 0) {
    return "No evidence retrieved from indexed log chunks.";
  }

  return request.builtContext.evidence
    .map((item, index) =>
      [
        `Evidence ${index + 1}`,
        `chunkId: ${item.chunkId}`,
        `service: ${item.service}`,
        `environment: ${item.environment}`,
        `timestamp: ${item.timestamp}`,
        `level: ${item.level}`,
        ...(item.traceId !== undefined ? [`traceId: ${item.traceId}`] : []),
        `score: ${item.finalScore.toFixed(4)}`,
        `summary: ${item.summary}`,
        `rationale: ${item.rationale.join("; ")}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export function buildRcaPrompt(
  request: GenerateAnswerRequest,
): readonly LlmMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are an incident analysis assistant.",
        "Use only the retrieved log evidence provided to you.",
        "Do not invent timelines, systems, causes, fixes, or user impact.",
        "If the evidence is weak, incomplete, or conflicting, say so explicitly.",
        "Prefer concrete operational observations over broad speculation.",
        "Return JSON only with keys: rootCauseHypothesis, evidenceSummary, uncertainty, recommendedNextSteps, confidence, answer.",
        "confidence must be one of: high, medium, low.",
        "evidenceSummary and recommendedNextSteps must be arrays of short strings.",
        "answer must be RCA-oriented, grounded in evidence, and must mention uncertainty when confidence is not high.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Query ID: ${request.queryRequest.id}`,
        `Requested At: ${request.queryRequest.requestedAt}`,
        `Question: ${request.queryRequest.query}`,
        request.queryRequest.filters !== undefined
          ? `Filters: ${JSON.stringify(request.queryRequest.filters)}`
          : "Filters: none",
        "",
        "Compact context:",
        request.builtContext.summary,
        "",
        "Retrieved evidence:",
        buildEvidenceBlock(request),
      ].join("\n"),
    },
  ];
}
