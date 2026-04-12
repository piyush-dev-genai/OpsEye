export interface TimeDecayOptions {
  readonly now?: Date;
  readonly halfLifeMs?: number;
  readonly minScore?: number;
}

export interface TimeScoredItem {
  readonly timestamp: string;
}

export interface TimeDecayRankedItem<TItem> {
  readonly item: TItem;
  readonly timeDecayScore: number;
}

const DEFAULT_HALF_LIFE_MS = 1000 * 60 * 60 * 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function calculateTimeDecayScore(
  timestamp: string,
  options: TimeDecayOptions = {},
): number {
  const now = options.now ?? new Date();
  const halfLifeMs = options.halfLifeMs ?? DEFAULT_HALF_LIFE_MS;
  const minScore = options.minScore ?? 0;

  if (halfLifeMs <= 0) {
    return minScore;
  }

  const parsedTimestamp = Date.parse(timestamp);

  if (!Number.isFinite(parsedTimestamp)) {
    return minScore;
  }

  const ageMs = Math.max(now.getTime() - parsedTimestamp, 0);
  const score = Math.pow(0.5, ageMs / halfLifeMs);

  return clamp(score, minScore, 1);
}

export function rankByTimeDecay<TItem extends TimeScoredItem>(
  items: readonly TItem[],
  options: TimeDecayOptions = {},
): readonly TimeDecayRankedItem<TItem>[] {
  return items
    .map((item) => ({
      item,
      timeDecayScore: calculateTimeDecayScore(item.timestamp, options),
    }))
    .sort((left, right) => right.timeDecayScore - left.timeDecayScore);
}
