import { describe, expect, it } from "vitest";
import type { Position } from "@/lib/espn/constants";
import { evaluateTrade } from "@/lib/features/trade";
import { mkCtx, mkPlayer, mkProj, projMap, STD_SLOTS } from "../helpers/players";

/** 13 remaining games (weeks 5..17, no byes). */
const perWeek = (pts: number) => pts * 13;
const replacement: Record<Position, number> = { QB: perWeek(12), RB: perWeek(5), WR: perWeek(5), TE: perWeek(4), K: perWeek(6), DST: perWeek(5) };

function roster() {
  return [
    mkPlayer({ position: "QB", lineupSlotId: 0, espnSeasonProj: perWeek(20) }),
    mkPlayer({ position: "RB", lineupSlotId: 2, espnSeasonProj: perWeek(15), name: "RB1" }),
    mkPlayer({ position: "RB", lineupSlotId: 2, espnSeasonProj: perWeek(10), name: "RB2" }),
    mkPlayer({ position: "WR", lineupSlotId: 4, espnSeasonProj: perWeek(14), name: "WR1" }),
    mkPlayer({ position: "WR", lineupSlotId: 4, espnSeasonProj: perWeek(9), name: "WR2" }),
    mkPlayer({ position: "TE", lineupSlotId: 6, espnSeasonProj: perWeek(7) }),
    mkPlayer({ position: "RB", lineupSlotId: 23, espnSeasonProj: perWeek(8), name: "RB3" }),
    mkPlayer({ position: "K", lineupSlotId: 17, espnSeasonProj: perWeek(8) }),
    mkPlayer({ position: "DST", lineupSlotId: 16, espnSeasonProj: perWeek(7) }),
    mkPlayer({ position: "WR", lineupSlotId: 20, espnSeasonProj: perWeek(5), name: "WR3" }),
  ];
}

const weekProjFor = (players: ReturnType<typeof roster>) =>
  projMap(...players.map((p) => mkProj(p.espnId, (p.espnSeasonProj ?? 0) / 13)));

describe("evaluateTrade", () => {
  it("evaluates a 2-for-1 with VORP and lineup impact", () => {
    const my = roster();
    const rb2 = my.find((p) => p.name === "RB2")!;
    const wr3 = my.find((p) => p.name === "WR3")!;
    const star = mkPlayer({ position: "RB", espnSeasonProj: perWeek(18), name: "Star RB" });
    const ctx = mkCtx({ currentWeek: 5, finalWeek: 17, weekProj: weekProjFor([...my, star]) });

    const r = evaluateTrade(my, { give: [rb2, wr3], get: [star] }, STD_SLOTS, ctx, replacement);
    expect(r.giveRos).toBeCloseTo(perWeek(15), 6);
    expect(r.getRos).toBeCloseTo(perWeek(18), 6);
    expect(r.netRos).toBeCloseTo(perWeek(3), 6);
    // VORP: give (10-5)+(5-5)=5/wk, get 18-5=13/wk
    expect(r.giveVorp).toBeCloseTo(perWeek(5), 6);
    expect(r.getVorp).toBeCloseTo(perWeek(13), 6);
    expect(r.netVorp).toBeCloseTo(perWeek(8), 6);
    // Lineup: before RBs 15,10 + flex 8 ; after RBs 18,15 + flex 8 => +8 this week
    expect(r.lineupBefore).toBeCloseTo(98, 6);
    expect(r.lineupAfter).toBeCloseTo(106, 6);
    expect(r.lineupDelta).toBeCloseTo(8, 6);
    expect(r.verdict).toBe("accept");
    expect(r.rationale).toMatch(/104\.0/);
    expect(r.rationale).toMatch(/\+8\.0/);
  });

  it("applies verdict thresholds", () => {
    const ctx = mkCtx({ currentWeek: 17, finalWeek: 17 });
    const zero: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
    const my = [mkPlayer({ position: "RB", lineupSlotId: 2, espnSeasonProj: 10, name: "mine" })];
    const mine = my[0];
    const eval_ = (getPts: number) =>
      evaluateTrade(my, { give: [mine], get: [mkPlayer({ position: "RB", espnSeasonProj: getPts })] }, { 2: 1, 20: 1 }, ctx, zero);
    expect(eval_(16).verdict).toBe("accept"); // net +6
    expect(eval_(15).verdict).toBe("fair"); // net +5 (not > 5)
    expect(eval_(5).verdict).toBe("fair"); // net -5 (not < -5)
    expect(eval_(4).verdict).toBe("reject"); // net -6
    expect(eval_(4).lineupDelta).toBe(0); // no weekProj => lineup totals 0
  });

  it("removes given players from the after-trade lineup", () => {
    const my = roster();
    const rb1 = my.find((p) => p.name === "RB1")!;
    const ctx = mkCtx({ currentWeek: 5, finalWeek: 17, weekProj: weekProjFor(my) });
    const r = evaluateTrade(my, { give: [rb1], get: [] }, STD_SLOTS, ctx, replacement);
    // RB3 (8) moves to RB, flex empties... WR3 (5) takes flex => 98 - 15 + 5 = 88
    expect(r.lineupAfter).toBeCloseTo(88, 6);
    expect(r.verdict).toBe("reject");
  });
});
