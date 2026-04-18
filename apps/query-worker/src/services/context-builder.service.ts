import type { AppLogger } from "@opseye/observability";
import type { QueryRequest } from "@opseye/types";

import type {
  BuiltContext,
  ContextEvidence,
  ContextEvidenceGroup,
  ContextTimelineEntry,
  RerankedChunkRecord,
} from "../workflow/state";

export interface BuildContextRequest {
  readonly queryRequest: QueryRequest;
  readonly rerankedChunks: readonly RerankedChunkRecord[];
}

const MAX_EVIDENCE_ITEMS = 5;
const MAX_SUMMARY_LENGTH = 240;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitSentences(content: string): readonly string[] {
  return compactWhitespace(content)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function isHighSignalSentence(sentence: string): boolean {
  return /(error|failed|failure|timeout|exception|unavailable|latency|saturation|refused|restart|oom|throttl)/i.test(
    sentence,
  );
}

function clampSummary(value: string): string {
  if (value.length <= MAX_SUMMARY_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_SUMMARY_LENGTH - 3)}...`;
}

function summarizeContent(content: string): string {
  const sentences = splitSentences(content);
  const highSignalSentences = sentences.filter(isHighSignalSentence);
  const selectedSentences =
    highSignalSentences.length > 0
      ? highSignalSentences.slice(0, 2)
      : sentences.slice(0, 2);
  const summary = compactWhitespace(selectedSentences.join(" "));

  if (summary.length > 0) {
    return clampSummary(summary);
  }

  return clampSummary(compactWhitespace(content));
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

function toContextEvidence(chunk: RerankedChunkRecord): ContextEvidence {
  return {
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
  };
}

function buildGroupKey(evidence: ContextEvidence): string {
  if (evidence.traceId !== undefined) {
    return `trace:${evidence.traceId}`;
  }

  return `service:${evidence.service}`;
}

function buildGroups(
  evidence: readonly ContextEvidence[],
): readonly ContextEvidenceGroup[] {
  const groups = new Map<string, ContextEvidence[]>();

  for (const item of evidence) {
    const key = buildGroupKey(item);
    const groupItems = groups.get(key) ?? [];
    groupItems.push(item);
    groups.set(key, groupItems);
  }

  return Array.from(groups.entries()).map(([groupKey, items]) => {
    const services = Array.from(new Set(items.map((item) => item.service))).sort();
    const label =
      groupKey.startsWith("trace:")
        ? `Trace ${groupKey.slice("trace:".length)}`
        : `Service ${groupKey.slice("service:".length)}`;

    return {
      groupKey,
      label,
      services,
      itemCount: items.length,
      items: [...items].sort((left, right) =>
        left.timestamp.localeCompare(right.timestamp),
      ),
    };
  });
}

function buildTimeline(
  evidence: readonly ContextEvidence[],
): readonly ContextTimelineEntry[] {
  return [...evidence]
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .map((item) => ({
      chunkId: item.chunkId,
      timestamp: item.timestamp,
      service: item.service,
      level: item.level,
      summary: item.summary,
      ...(item.traceId !== undefined ? { traceId: item.traceId } : {}),
    }));
}

function formatGroups(groups: readonly ContextEvidenceGroup[]): string {
  if (groups.length === 0) {
    return "Evidence groups: none";
  }

  return [
    "Evidence groups:",
    ...groups.map(
      (group) =>
        `- ${group.label}: ${group.itemCount} item(s) across ${group.services.join(", ")}`,
    ),
  ].join("\n");
}

function formatTimeline(timeline: readonly ContextTimelineEntry[]): string {
  if (timeline.length === 0) {
    return "Timeline: no evidence retrieved";
  }

  return [
    "Timeline:",
    ...timeline.map(
      (item) =>
        `- ${item.timestamp} ${item.service} ${item.level}: ${item.summary}`,
    ),
  ].join("\n");
}

function formatEvidence(evidence: readonly ContextEvidence[]): string {
  if (evidence.length === 0) {
    return "Top evidence: none";
  }

  return [
    "Top evidence:",
    ...evidence.map(
      (item, index) =>
        `${index + 1}. [${item.chunkId}] ${item.summary} (${item.rationale.join("; ")})`,
    ),
  ].join("\n");
}

function buildSummary(
  request: BuildContextRequest,
  evidence: readonly ContextEvidence[],
  groups: readonly ContextEvidenceGroup[],
  timeline: readonly ContextTimelineEntry[],
): string {
  return [
    `Query: ${request.queryRequest.query}`,
    request.queryRequest.filters !== undefined
      ? `Filters: ${JSON.stringify(request.queryRequest.filters)}`
      : "Filters: none",
    formatGroups(groups),
    formatTimeline(timeline),
    formatEvidence(evidence),
  ].join("\n");
}
function buildEvidenceDedupeKey(chunk: RerankedChunkRecord): string {
  return [
    chunk.metadata.service,
    chunk.metadata.traceId ?? "no-trace",
    chunk.metadata.timestamp,
  ].join("|");
}

function dedupeRerankedChunks(
  chunks: readonly RerankedChunkRecord[],
): readonly RerankedChunkRecord[] {
  const bestByKey = new Map<string, RerankedChunkRecord>();

  for (const chunk of chunks) {
    const key = buildEvidenceDedupeKey(chunk);
    const existing = bestByKey.get(key);

    if (existing === undefined || chunk.finalScore > existing.finalScore) {
      bestByKey.set(key, chunk);
    }
  }

  return Array.from(bestByKey.values()).sort(
    (left, right) => right.finalScore - left.finalScore,
  );
}

export class ContextBuilderService {
  public constructor(private readonly logger: AppLogger) {}

  public build(request: BuildContextRequest): BuiltContext {
    const dedupedChunks = dedupeRerankedChunks(request.rerankedChunks);

    const evidence = dedupedChunks
      .slice(0, MAX_EVIDENCE_ITEMS)
      .map(toContextEvidence);
    const groups = buildGroups(evidence);
    const timeline = buildTimeline(evidence);
    const summary = buildSummary(request, evidence, groups, timeline);

    this.logger.info("Built investigation-oriented query context.", {
      queryId: request.queryRequest.id,
      evidenceCount: evidence.length,
      groupCount: groups.length,
      timelineCount: timeline.length,
    });

    return {
      summary,
      evidence,
      groups,
      timeline,
    };
  }
}
