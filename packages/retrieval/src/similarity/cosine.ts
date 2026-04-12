export class VectorSimilarityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "VectorSimilarityError";
  }
}

function assertSameLength(
  left: readonly number[],
  right: readonly number[],
): void {
  if (left.length !== right.length) {
    throw new VectorSimilarityError("Vectors must have the same length.");
  }
}

export function dotProduct(
  left: readonly number[],
  right: readonly number[],
): number {
  assertSameLength(left, right);

  let total = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];

    if (leftValue === undefined || rightValue === undefined) {
      continue;
    }

    total += leftValue * rightValue;
  }

  return total;
}

export function vectorMagnitude(vector: readonly number[]): number {
  let total = 0;

  for (const value of vector) {
    total += value * value;
  }

  return Math.sqrt(total);
}

export function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  const leftMagnitude = vectorMagnitude(left);
  const rightMagnitude = vectorMagnitude(right);

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct(left, right) / (leftMagnitude * rightMagnitude);
}
