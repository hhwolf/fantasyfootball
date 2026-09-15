import { describe, expect, it } from "vitest";
import {
  nextNWeeksValue,
  replacementLevels,
  restOfSeasonValue,
  weeklyValue,
} from "@/lib/features/replacement";
import { mkCtx, mkPlayer, mkProj, projMap } from "../helpers/players";

describe("weeklyValue", () => {
  it("returns 0 on the bye week", () => {
    const p = mkPlayer({ proTeamId: 12, espnSeasonProj: 170, seasonActual: 40 });
    const ctx = mkCtx({ currentWeek: 5, finalWeek: 17, byeWeekOf: (t) => (t === 12 ? 7 : undefined) });
    expect(weeklyValue(p, 7, ctx)).toBe(0);
    // 13 weeks from 5..17 minus one bye = 12 games; (170-40)/12
    expect(weeklyValue(p, 8, ctx)).toBeCloseTo(130 / 12, 9);
  });

  it("uses the current-week projection when present", () => {
    const p = mkPlayer({ espnSeasonProj: 130, seasonActual: 0 });
    const ctx = mkCtx({ weekProj: projMap(mkProj(p.espnId, 17.5)) });
    expect(weeklyValue(p, ctx.currentWeek, ctx)).toBe(17.5);
    expect(weeklyValue(p, ctx.currentWeek + 1, ctx)).toBeCloseTo(10, 9);
  });

  it("falls back to the week projection as a rate when season projection is missing", () => {
    const p = mkPlayer({});
    const ctx = mkCtx({ weekProj: projMap(mkProj(p.espnId, 9)) });
    expect(weeklyValue(p, ctx.currentWeek + 3, ctx)).toBe(9);
    expect(weeklyValue(mkPlayer({}), 9, ctx)).toBe(0);
  });

  it("clamps negative remaining season projection to 0", () => {
    const p = mkPlayer({ espnSeasonProj: 50, seasonActual: 80 });
    expect(weeklyValue(p, 10, mkCtx())).toBe(0);
  });

  it("OUT zeros the next 3 weeks only", () => {
    const p = mkPlayer({ injuryStatus: "OUT", espnSeasonProj: 130, seasonActual: 0 });
    const ctx = mkCtx({ currentWeek: 5, weekProj: projMap(mkProj(p.espnId, 12)) });
    expect(weeklyValue(p, 5, ctx)).toBe(0);
    expect(weeklyValue(p, 6, ctx)).toBe(0);
    expect(weeklyValue(p, 7, ctx)).toBe(0);
    expect(weeklyValue(p, 8, ctx)).toBeCloseTo(10, 9);
  });

  it("QUESTIONABLE scales the next 2 rate-based weeks", () => {
    const p = mkPlayer({ injuryStatus: "QUESTIONABLE", espnSeasonProj: 130, seasonActual: 0 });
    const ctx = mkCtx({ currentWeek: 5 });
    expect(weeklyValue(p, 5, ctx)).toBeCloseTo(8.5, 9);
    expect(weeklyValue(p, 6, ctx)).toBeCloseTo(8.5, 9);
    expect(weeklyValue(p, 7, ctx)).toBeCloseTo(10, 9);
  });
});

describe("restOfSeasonValue / nextNWeeksValue", () => {
  it("sums weekly values including byes", () => {
    const p = mkPlayer({ proTeamId: 3, espnSeasonProj: 120, seasonActual: 0 });
    const ctx = mkCtx({ currentWeek: 5, finalWeek: 17, byeWeekOf: () => 9 });
    const ros = restOfSeasonValue(p, ctx);
    expect(Object.keys(ros.weekly)).toHaveLength(13);
    expect(ros.weekly[9]).toBe(0);
    expect(ros.total).toBeCloseTo(120, 9); // 12 games * 10
    expect(ros.espnId).toBe(p.espnId);
    expect(nextNWeeksValue(p, ctx, 3)).toBeCloseTo(30, 9);
    // window crossing the bye: weeks 8..17 = 10 weeks minus bye = 9 games => 120/9 per game, 2 games in window
    expect(nextNWeeksValue(p, mkCtx({ currentWeek: 8, finalWeek: 17, byeWeekOf: () => 9 }), 3)).toBeCloseTo((2 * 120) / 9, 9);
    // capped at finalWeek
    expect(nextNWeeksValue(p, mkCtx({ currentWeek: 16, finalWeek: 17 }), 5)).toBeCloseTo(120, 9);
  });

  it("supports explicit ranges", () => {
    const p = mkPlayer({ espnSeasonProj: 130, seasonActual: 0 });
    const ctx = mkCtx({ currentWeek: 5, finalWeek: 17 });
    expect(restOfSeasonValue(p, ctx, 10, 12).total).toBeCloseTo(30, 9);
  });
});

describe("replacementLevels", () => {
  it("takes the best FA per position and 0 when none", () => {
    const ctx = mkCtx({ currentWeek: 5, finalWeek: 17 });
    const fas = [
      mkPlayer({ position: "RB", espnSeasonProj: 65 }), // 5/wk
      mkPlayer({ position: "RB", espnSeasonProj: 104 }), // 8/wk
      mkPlayer({ position: "WR", espnSeasonProj: 39 }), // 3/wk
    ];
    const ros = replacementLevels(fas, ctx, "ros");
    expect(ros.RB).toBeCloseTo(104, 9);
    expect(ros.WR).toBeCloseTo(39, 9);
    expect(ros.QB).toBe(0);
    expect(ros.K).toBe(0);
    const n3 = replacementLevels(fas, ctx, 3);
    expect(n3.RB).toBeCloseTo(24, 9);
    expect(n3.TE).toBe(0);
  });
});
