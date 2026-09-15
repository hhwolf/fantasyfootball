import { describe, expect, it } from "vitest";
import { STAT } from "@/lib/espn/constants";
import type { ScoringItem } from "@/lib/espn/schemas";
import { scoreSleeperProjection, sleeperStatsToEspn, SLEEPER_TO_ESPN_STAT } from "@/lib/sleeper/statmap";

const PPR: ScoringItem[] = [
  { statId: 3, points: 0.04 },
  { statId: 4, points: 4 },
  { statId: 20, points: -2 },
  { statId: 24, points: 0.1 },
  { statId: 25, points: 6 },
  { statId: 53, points: 1 },
  { statId: 42, points: 0.1 },
  { statId: 43, points: 6 },
  { statId: 72, points: -2 },
];

describe("SLEEPER_TO_ESPN_STAT", () => {
  it("maps core offensive keys to the expected ESPN ids", () => {
    expect(SLEEPER_TO_ESPN_STAT.pass_yd).toBe(STAT.PASS_YDS);
    expect(SLEEPER_TO_ESPN_STAT.pass_td).toBe(4);
    expect(SLEEPER_TO_ESPN_STAT.pass_int).toBe(20);
    expect(SLEEPER_TO_ESPN_STAT.rush_yd).toBe(24);
    expect(SLEEPER_TO_ESPN_STAT.rush_td).toBe(25);
    expect(SLEEPER_TO_ESPN_STAT.rec).toBe(53);
    expect(SLEEPER_TO_ESPN_STAT.rec_yd).toBe(42);
    expect(SLEEPER_TO_ESPN_STAT.rec_td).toBe(43);
    expect(SLEEPER_TO_ESPN_STAT.fum_lost).toBe(72);
    expect(SLEEPER_TO_ESPN_STAT.sack).toBe(99);
    expect(SLEEPER_TO_ESPN_STAT.xpm).toBe(86);
  });
});

describe("sleeperStatsToEspn", () => {
  it("writes receptions to both 53 and 41", () => {
    const line = sleeperStatsToEspn({ rec: 5 });
    expect(line[53]).toBe(5);
    expect(line[41]).toBe(5);
  });

  it("sums short field goal buckets into FG_0_39 and mirrors 50+ into 74", () => {
    const line = sleeperStatsToEspn({ fgm_0_19: 0.1, fgm_20_29: 0.5, fgm_30_39: 0.4, fgm_40_49: 0.6, fgm_50_59: 0.2, fgm_60p: 0.05 });
    expect(line[80]).toBeCloseTo(1.0);
    expect(line[77]).toBeCloseTo(0.6);
    expect(line[198]).toBeCloseTo(0.2);
    expect(line[201]).toBeCloseTo(0.05);
    expect(line[74]).toBeCloseTo(0.25);
  });

  it("derives yardage bonus flags", () => {
    expect(sleeperStatsToEspn({ pass_yd: 320 })[17]).toBe(1);
    expect(sleeperStatsToEspn({ pass_yd: 320 })[18]).toBeUndefined();
    expect(sleeperStatsToEspn({ pass_yd: 410 })[18]).toBe(1);
    expect(sleeperStatsToEspn({ pass_yd: 410 })[17]).toBeUndefined();
    expect(sleeperStatsToEspn({ rush_yd: 120 })[37]).toBe(1);
    expect(sleeperStatsToEspn({ rec_yd: 101 })[56]).toBe(1);
    expect(sleeperStatsToEspn({ rec_yd: 99 })[56]).toBeUndefined();
  });

  it("ignores unmapped keys", () => {
    const line = sleeperStatsToEspn({ adp_dd_ppr: 85, gp: 1, pts_ppr: 20 });
    expect(Object.keys(line)).toHaveLength(0);
  });
});

describe("scoreSleeperProjection", () => {
  it("re-scores a Sleeper PPR line to within 0.5 of the hand-computed total", () => {
    // A WR/RB hybrid line: 12.4 rush yd, 0.1 rush td, 5.2 rec, 68.3 rec yd, 0.45 rec td, 0.08 fum lost
    const stats = { rush_yd: 12.4, rush_td: 0.1, rec: 5.2, rec_yd: 68.3, rec_td: 0.45, fum_lost: 0.08, rec_tgt: 7.1, pts_ppr: 15.6 };
    const hand = 12.4 * 0.1 + 0.1 * 6 + 5.2 * 1 + 68.3 * 0.1 + 0.45 * 6 + 0.08 * -2;
    // = 1.24 + 0.6 + 5.2 + 6.83 + 2.7 - 0.16 = 16.41
    expect(hand).toBeCloseTo(16.41, 2);
    const scored = scoreSleeperProjection(stats, PPR, "WR");
    expect(Math.abs(scored - hand)).toBeLessThan(0.5);
  });

  it("scores a QB line", () => {
    const stats = { pass_yd: 253.84, pass_td: 1.8, pass_int: 0.84, rush_yd: 11.38, rush_td: 0.12 };
    const hand = 253.84 * 0.04 + 1.8 * 4 - 0.84 * 2 + 11.38 * 0.1 + 0.12 * 6;
    expect(Math.abs(scoreSleeperProjection(stats, PPR, "QB") - hand)).toBeLessThan(0.5);
  });

  it("falls back to Sleeper's pts_* total when nothing maps", () => {
    const stats = { pts_ppr: 12.5, pts_half_ppr: 10, pts_std: 7.5, gp: 1 };
    expect(scoreSleeperProjection(stats, PPR, "WR")).toBe(12.5);
    const half = PPR.map((s) => (s.statId === 53 ? { ...s, points: 0.5 } : s));
    expect(scoreSleeperProjection(stats, half, "WR")).toBe(10);
    const std = PPR.filter((s) => s.statId !== 53);
    expect(scoreSleeperProjection(stats, std, "WR")).toBe(7.5);
  });
});
