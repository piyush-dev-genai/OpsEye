import {
  calculateTimeDecayScore,
  combineWeightedScores,
} from "@opseye/retrieval";
import type { AppLogger } from "@opseye/observability";
import type { QueryRequest } from "@opseye/types";

import type {
  RetrievedChunkRecord,
  RerankedChunkRecord,
} from "../workflow/state";

export interface RerankRequest {
  readonly queryRequest: QueryRequest;
  readonly retrievedChunks: readonly RetrievedChunkRecord[];
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(score, 1));
}

function normalizeLevel(level: string): string {
  return level.trim().toLowerCase();
}

function calculateMetadataScore(
  queryRequest: QueryRequest,
  chunk: RetrievedChunkRecord,
): { score: number; reasons: readonly string[] } {
  const reasons: string[] = [];
  let score = 0.4;
  const filters = queryRequest.filters;

  if (filters?.service !== undefined) {
    if (filters.service === chunk.metadata.service) {
      score += 0.25;
      reasons.push("service filter matched");
    } else {
      score -= 0.2;
      reasons.push("service filter mismatch");
    }
  }

  if (filters?.environment !== undefined) {
    if (filters.environment === chunk.metadata.environment) {
      score += 0.15;
      reasons.push("environment filter matched");
    } else {
      score -= 0.15;
      reasons.push("environment filter mismatch");
    }
  }

  if (filters?.traceId !== undefined) {
    if (filters.traceId === chunk.metadata.traceId) {
      score += 0.2;
      reasons.push("trace matched");
    } else {
      score -= 0.2;
      reasons.push("trace mismatch");
    }
  }

  const normalizedLevel = normalizeLevel(chunk.metadata.level);

  if (normalizedLevel === "error" || normalizedLevel === "fatal") {
    score += 0.1;
    reasons.push("high severity log");
  }

  return {
    score: clampScore(score),
    reasons,
  };
}

export class RerankingService {
  public constructor(private readonly logger: AppLogger) {}

  public rerank(request: RerankRequest): readonly RerankedChunkRecord[] {
    const rerankedChunks = request.retrievedChunks
      .map((chunk) => {
        const metadata = calculateMetadataScore(request.queryRequest, chunk);
        const recencyScore = calculateTimeDecayScore(chunk.metadata.timestamp, {
          halfLifeMs: 1000 * 60 * 60 * 12,
          minScore: 0.1,
        });
        const finalScore = combineWeightedScores([
          { score: chunk.vectorScore, weight: 0.65 },
          { score: recencyScore, weight: 0.25 },
          { score: metadata.score, weight: 0.1 },
        ]);
        const rankingReasons = [
          `vector=${chunk.vectorScore.toFixed(3)}`,
          `recency=${recencyScore.toFixed(3)}`,
          `metadata=${metadata.score.toFixed(3)}`,
          ...metadata.reasons,
        ];

        return {
          ...chunk,
          recencyScore,
          metadataScore: metadata.score,
          finalScore,
          rankingReasons,
        };
      })
      .sort((left, right) => right.finalScore - left.finalScore);

    this.logger.info("Reranked retrieved chunks.", {
      queryId: request.queryRequest.id,
      candidateCount: request.retrievedChunks.length,
      retainedCount: rerankedChunks.length,
      topChunkId: rerankedChunks[0]?.chunkId,
      topScore:
        rerankedChunks[0] !== undefined
          ? Number(rerankedChunks[0].finalScore.toFixed(4))
          : undefined,
    });

    return rerankedChunks;
  }
}
