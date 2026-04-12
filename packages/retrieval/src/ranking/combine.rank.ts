export interface WeightedScore {
  readonly score: number;
  readonly weight: number;
}

export interface CombinedRankInput<TItem> {
  readonly item: TItem;
  readonly scores: readonly WeightedScore[];
}

export interface CombinedRankedItem<TItem> {
  readonly item: TItem;
  readonly combinedScore: number;
}

function normalizeWeightedScore(score: WeightedScore): number {
  if (score.weight <= 0) {
    return 0;
  }

  return score.score * score.weight;
}

export function combineWeightedScores(
  scores: readonly WeightedScore[],
): number {
  if (scores.length === 0) {
    return 0;
  }

  const totalWeight = scores.reduce(
    (total, score) => total + Math.max(score.weight, 0),
    0,
  );

  if (totalWeight === 0) {
    return 0;
  }

  const weightedTotal = scores.reduce(
    (total, score) => total + normalizeWeightedScore(score),
    0,
  );

  return weightedTotal / totalWeight;
}

export function combineRanks<TItem>(
  items: readonly CombinedRankInput<TItem>[],
): readonly CombinedRankedItem<TItem>[] {
  return items
    .map((item) => ({
      item: item.item,
      combinedScore: combineWeightedScores(item.scores),
    }))
    .sort((left, right) => right.combinedScore - left.combinedScore);
}
