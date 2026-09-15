import { describe, expect, it } from "vitest";
import { lineupDistribution, normalCdf, previewMatchup, winProbability } from "@/lib/features/matchup";
import type { OptimizedLineup } from "@/lib/features/optimizer";
import { mkProj, projMap } from "../helpers/players";

describe("normalCdf", () => {
  it("matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
    expect(normalCdf(6)).toBeCloseTo(1, 6);
    expect(normalCdf(-6)).toBeCloseTo(0, 6);
  });
});

describe("lineupDistribution", () => {
  it("sums means and combines sd in quadrature, defaulting sd to 6", () => {
    const proj = projMap(mkProj(1, 10, 3), mkProj(2, 20, 4));
    const d = lineupDistribution([{ espnId: 1, slotId: 0 }, { espnId: 2, slotId: 2 }, { espnId: 3, slotId: 4 }], proj);
    expect(d.mean).toBe(30);
    expect(d.sd).toBeCloseTo(Math.sqrt(9 + 16 + 36), 9);
  });
});

describe("winProbability", () => {
  it("is symmetric and 0.5 for identical distributions", () => {
    const a = { mean: 100, sd: 20 };
    const b = { mean: 110, sd: 15 };
    expect(winProbability(a, a)).toBeCloseTo(0.5, 6);
    expect(winProbability(a, b) + winProbability(b, a)).toBeCloseTo(1, 6);
    expect(winProbability(a, b)).toBeLessThan(0.5);
  });
  it("handles zero variance", () => {
    expect(winProbability({ mean: 10, sd: 0 }, { mean: 5, sd: 0 })).toBe(1);
    expect(winProbability({ mean: 5, sd: 0 }, { mean: 10, sd: 0 })).toBe(0);
    expect(winProbability({ mean: 5, sd: 0 }, { mean: 5, sd: 0 })).toBe(0.5);
  });
});

describe("previewMatchup", () => {
  it("builds both distributions from starters", () => {
    const proj = projMap(mkProj(1, 50, 8), mkProj(2, 40, 6));
    const mk = (id: number): OptimizedLineup => ({
      starters: [{ espnId: id, slotId: 0 }],
      bench: [],
      ir: [],
      total: 0,
      emptySlots: [],
      currentTotal: 0,
      changes: [],
    });
    const r = previewMatchup(mk(1), mk(2), proj);
    expect(r.myMean).toBe(50);
    expect(r.oppMean).toBe(40);
    expect(r.mySd).toBe(8);
    expect(r.oppSd).toBe(6);
    expect(r.winProb).toBeCloseTo(normalCdf(10 / 10), 9);
  });
});
