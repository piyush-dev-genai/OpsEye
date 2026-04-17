import { describe, expect, it } from "vitest";

import {
  calculateTimeDecayScore,
  combineWeightedScores,
  cosineSimilarity,
} from "../index";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("returns 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("handles negative values", () => {
    expect(cosineSimilarity([1, -1], [-1, 1])).toBeCloseTo(-1);
  });
});

describe("combineWeightedScores", () => {
  it("returns a weighted average for positive weights", () => {
    expect(
      combineWeightedScores([
        { score: 0.8, weight: 0.75 },
        { score: 0.2, weight: 0.25 },
      ]),
    ).toBeCloseTo(0.65);
  });

  it("ignores zero and negative weights", () => {
    expect(
      combineWeightedScores([
        { score: 0.9, weight: 1 },
        { score: 0.1, weight: 0 },
        { score: 0.1, weight: -1 },
      ]),
    ).toBeCloseTo(0.9);
  });

  it("preserves negative score contributions when weights are valid", () => {
    expect(
      combineWeightedScores([
        { score: -0.4, weight: 0.5 },
        { score: 0.6, weight: 0.5 },
      ]),
    ).toBeCloseTo(0.1);
  });
});

describe("calculateTimeDecayScore", () => {
  const now = new Date("2026-04-17T12:00:00.000Z");

  it("returns 1 for the current timestamp", () => {
    expect(
      calculateTimeDecayScore("2026-04-17T12:00:00.000Z", { now }),
    ).toBeCloseTo(1);
  });

  it("returns the minimum score for invalid timestamps", () => {
    expect(
      calculateTimeDecayScore("not-a-timestamp", { now, minScore: 0.2 }),
    ).toBe(0.2);
  });

  it("handles timezone offsets deterministically", () => {
    expect(
      calculateTimeDecayScore("2026-04-17T17:30:00.000+05:30", {
        now,
        minScore: 0.1,
      }),
    ).toBeCloseTo(1);
  });

  it("clamps future timestamps to 1", () => {
    expect(
      calculateTimeDecayScore("2026-04-17T12:30:00.000Z", {
        now,
        minScore: 0.1,
      }),
    ).toBe(1);
  });

  it("returns the minimum score when half life is not positive", () => {
    expect(
      calculateTimeDecayScore("2026-04-17T06:00:00.000Z", {
        now,
        halfLifeMs: 0,
        minScore: 0.15,
      }),
    ).toBe(0.15);
  });
});
