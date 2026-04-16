import type { AppLogger } from "@opseye/observability";
import type { QueryRequest } from "@opseye/types";

import type {
  BuiltContext,
  ContextEvidence,
  RerankedChunkRecord,
} from "../workflow/state";

export interface BuildContextRequest {
  readonly queryRequest: QueryRequest;
  readonly rerankedChunks: readonly RerankedChunkRecord[];
}

const MAX_EVIDENCE_ITEMS = 5;
const MAX_SUMMARY_LENGTH = 220;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function summarizeContent(content: string): string {
  const compact = compactWhitespace(content);

  if (compact.length <= MAX_SUMMARY_LENGTH) {
    return compact;
  }

  return `${compact.slice(0, MAX_SUMMARY_LENGTH - 3)}...`;
}

function buildRationale(chunk: RerankedChunkRecord): readonly string[] {
  const rationale = [
    `${chunk.metadata.service}/${chunk.metadata.environment}`,
    `${chunk.metadata.level} at ${chunk.metadata.timestamp}`,
    `score ${chunk.finalScore.toFixed(3)}`,
  ];

  if (chunk.metadata.traceId !== undefined) {
    rationale.push(`trace ${chunk.metadata.traceId}`);
  }

  return rationale;
}

function formatEvidence(evidence: readonly ContextEvidence[]): string {
  return evidence
    .map(
      (item, index) =>
        `${index + 1}. [${item.chunkId}] ${item.summary} (${item.rationale.join("; ")})`,
    )
    .join("\n");
}

export class ContextBuilderService {
  public constructor(private readonly logger: AppLogger) {}

  public build(request: BuildContextRequest): BuiltContext {
    const evidence = request.rerankedChunks
      .slice(0, MAX_EVIDENCE_ITEMS)
      .map<ContextEvidence>((chunk) => ({
        chunkId: chunk.chunkId,
        service: chunk.metadata.service,
        environment: chunk.metadata.environment,
        timestamp: chunk.metadata.timestamp,
        level: chunk.metadata.level,
        ...(chunk.metadata.traceId !== undefined
          ? { traceId: chunk.metadata.traceId }
          : {}),
        summary: summarizeContent(chunk.content),
        rationale: buildRationale(chunk),
        finalScore: chunk.finalScore,
      }));

    const summary =
      evidence.length > 0
        ? `Query: ${request.queryRequest.query}\nEvidence:\n${formatEvidence(evidence)}`
        : `Query: ${request.queryRequest.query}\nEvidence: none retrieved`;

    this.logger.info("Built compact query context.", {
      queryId: request.queryRequest.id,
      evidenceCount: evidence.length,
    });

    return {
      summary,
      evidence,
    };
  }
}
