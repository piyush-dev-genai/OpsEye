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

interface MetadataScoreResult {
  readonly score: number;
  readonly reasons: readonly string[];
}

interface ScoredChunk {
  readonly chunk: RetrievedChunkRecord;
  readonly recencyScore: number;
  readonly metadataScore: number;
  readonly severityScore: number;
  readonly provisionalScore: number;
  readonly rankingReasons: readonly string[];
  readonly dedupeKey: string;
}

const RECENCY_HALF_LIFE_MS = 1000 * 60 * 60 * 12;
const MAX_RERANKED_CHUNKS = 8;

function clampScore(score: number): number {
  return Math.max(0, Math.min(score, 1));
}

function normalizeLevel(level: string): string {
  return level.trim().toLowerCase();
}

// function normalizeContentFingerprint(content: string): string {
//   return content
//     .trim()
//     .toLowerCase()
//     .replace(/\d+/g, "#")
//     .replace(/[^a-z#\s]/g, " ")
//     .replace(/\s+/g, " ")
//     .slice(0, 120);
// }

// function buildTimestampBucket(timestamp: string): string {
//   return timestamp.slice(0, 16);
// }

// function buildDedupeKey(chunk: RetrievedChunkRecord): string {
//   const tracePart =
//     chunk.metadata.traceId !== undefined && chunk.metadata.traceId.length > 0
//       ? `trace:${chunk.metadata.traceId}`
//       : `service:${chunk.metadata.service}`;

//   return [
//     tracePart,
//     buildTimestampBucket(chunk.metadata.timestamp),
//     chunk.metadata.chunkStrategy,
//     normalizeContentFingerprint(chunk.content),
//   ].join("|");
// }

function buildDedupeKey(chunk: RetrievedChunkRecord): string {
  return [
    chunk.metadata.service,
    chunk.metadata.traceId ?? "no-trace",
    chunk.metadata.timestamp,
  ].join("|");
}

function buildTraceScope(queryRequest: QueryRequest): boolean {
  return queryRequest.filters?.traceId !== undefined;
}

function buildBroadQuery(queryRequest: QueryRequest): boolean {
  return (
    queryRequest.filters?.service === undefined &&
    queryRequest.filters?.traceId === undefined
  );
}

function calculateSeverityScore(level: string): {
  readonly score: number;
  readonly reason?: string;
} {
  const normalizedLevel = normalizeLevel(level);

  if (normalizedLevel === "fatal") {
    return { score: 1, reason: "fatal log" };
  }

  if (normalizedLevel === "error") {
    return { score: 0.95, reason: "error log" };
  }

  if (normalizedLevel === "warn" || normalizedLevel === "warning") {
    return { score: 0.65, reason: "warning log" };
  }

  return { score: 0.35 };
}

function calculateMetadataScore(
  queryRequest: QueryRequest,
  chunk: RetrievedChunkRecord,
): MetadataScoreResult {
  const reasons: string[] = [];
  let score = 0.45;
  const filters = queryRequest.filters;
  const traceScoped = buildTraceScope(queryRequest);

  if (filters?.service !== undefined) {
    if (filters.service === chunk.metadata.service) {
      score += 0.22;
      reasons.push("service filter matched");
    } else {
      score -= traceScoped ? 0.18 : 0.08;
      reasons.push("service filter mismatch");
    }
  }

  if (filters?.environment !== undefined) {
    if (filters.environment === chunk.metadata.environment) {
      score += 0.15;
      reasons.push("environment filter matched");
    } else {
      score -= 0.18;
      reasons.push("environment filter mismatch");
    }
  }

  if (filters?.traceId !== undefined) {
    if (filters.traceId === chunk.metadata.traceId) {
      score += 0.28;
      reasons.push("trace matched");
    } else {
      score -= 0.35;
      reasons.push("trace mismatch");
    }
  } else if (chunk.metadata.traceId !== undefined) {
    score += 0.05;
    reasons.push("trace-correlated evidence");
  }

  const severity = calculateSeverityScore(chunk.metadata.level);

  if (severity.reason !== undefined) {
    reasons.push(severity.reason);
  }

  score += (severity.score - 0.35) * 0.2;

  return {
    score: clampScore(score),
    reasons,
  };
}

function scoreChunk(
  queryRequest: QueryRequest,
  chunk: RetrievedChunkRecord,
): ScoredChunk {
  const metadata = calculateMetadataScore(queryRequest, chunk);
  const recencyScore = calculateTimeDecayScore(chunk.metadata.timestamp, {
    halfLifeMs: RECENCY_HALF_LIFE_MS,
    minScore: 0.1,
  });
  const severity = calculateSeverityScore(chunk.metadata.level);
  const provisionalScore = combineWeightedScores([
    { score: chunk.vectorScore, weight: 0.52 },
    { score: recencyScore, weight: 0.18 },
    { score: metadata.score, weight: 0.2 },
    { score: severity.score, weight: 0.1 },
  ]);

  return {
    chunk,
    recencyScore,
    metadataScore: metadata.score,
    severityScore: severity.score,
    provisionalScore,
    rankingReasons: [
      `vector=${chunk.vectorScore.toFixed(3)}`,
      `recency=${recencyScore.toFixed(3)}`,
      `metadata=${metadata.score.toFixed(3)}`,
      `severity=${severity.score.toFixed(3)}`,
      ...metadata.reasons,
    ],
    dedupeKey: buildDedupeKey(chunk),
  };
}

function diversifyChunks(
  scoredChunks: readonly ScoredChunk[],
  queryRequest: QueryRequest,
): readonly RerankedChunkRecord[] {
  const broadQuery = buildBroadQuery(queryRequest);
  const traceScoped = buildTraceScope(queryRequest);
  const seenDedupeKeys = new Set<string>();
  const serviceCounts = new Map<string, number>();
  const traceCounts = new Map<string, number>();
  const rerankedChunks: RerankedChunkRecord[] = [];

  for (const scored of scoredChunks) {
    if (seenDedupeKeys.has(scored.dedupeKey)) {
      continue;
    }

    const rankingReasons = [...scored.rankingReasons];
    let diversityAdjustment = 0;

    const serviceCount = serviceCounts.get(scored.chunk.metadata.service) ?? 0;
    const traceKey = scored.chunk.metadata.traceId ?? "trace:none";
    const traceCount = traceCounts.get(traceKey) ?? 0;

    if (broadQuery) {
      if (serviceCount === 0) {
        diversityAdjustment += 0.06;
        rankingReasons.push("broad-query service diversity");
      } else if (serviceCount >= 1) {
        diversityAdjustment -= 0.04 * serviceCount;
        rankingReasons.push("repeated service context");
      }

      if (scored.chunk.metadata.traceId !== undefined) {
        if (traceCount === 0) {
          diversityAdjustment += 0.03;
          rankingReasons.push("new trace evidence");
        } else {
          diversityAdjustment -= 0.02 * traceCount;
          rankingReasons.push("repeated trace context");
        }
      }
    } else if (traceScoped && scored.chunk.metadata.traceId !== queryRequest.filters?.traceId) {
      diversityAdjustment -= 0.08;
      rankingReasons.push("outside requested trace");
    }

    const finalScore = clampScore(scored.provisionalScore + diversityAdjustment);

    rerankedChunks.push({
      ...scored.chunk,
      recencyScore: scored.recencyScore,
      metadataScore: scored.metadataScore,
      finalScore,
      rankingReasons,
    });

    seenDedupeKeys.add(scored.dedupeKey);
    serviceCounts.set(scored.chunk.metadata.service, serviceCount + 1);
    traceCounts.set(traceKey, traceCount + 1);

    if (rerankedChunks.length >= MAX_RERANKED_CHUNKS) {
      break;
    }
  }

  return rerankedChunks.sort((left, right) => right.finalScore - left.finalScore);
}

export class RerankingService {
  public constructor(private readonly logger: AppLogger) {}

  public rerank(request: RerankRequest): readonly RerankedChunkRecord[] {
    const scoredChunks = request.retrievedChunks
      .map((chunk) => scoreChunk(request.queryRequest, chunk))
      .sort((left, right) => right.provisionalScore - left.provisionalScore);

    const rerankedChunks = diversifyChunks(scoredChunks, request.queryRequest);

    this.logger.info("Reranked retrieved chunks.", {
      queryId: request.queryRequest.id,
      candidateCount: request.retrievedChunks.length,
      retainedCount: rerankedChunks.length,
      deduplicatedCount: request.retrievedChunks.length - rerankedChunks.length,
      topChunkId: rerankedChunks[0]?.chunkId,
      topScore:
        rerankedChunks[0] !== undefined
          ? Number(rerankedChunks[0].finalScore.toFixed(4))
          : undefined,
    });

    return rerankedChunks;
  }
}
