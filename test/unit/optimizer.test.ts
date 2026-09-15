import { describe, expect, it } from "vitest";
import { SLOT } from "@/lib/espn/constants";
import { expandSlots, greedyLineup, hungarian, isEligible, optimizeLineup } from "@/lib/features/optimizer";
import type { LeaguePlayer } from "@/lib/league/types";
import { mkPlayer, mkProj, projMap, seeded, STD_SLOTS } from "../helpers/players";

const slotOf = (r: ReturnType<typeof optimizeLineup>, espnId: number) =>
  r.starters.find((s) => s.espnId === espnId)?.slotId;

describe("expandSlots / isEligible", () => {
  it("expands counts, drops bench/IR, and orders specific before flex", () => {
    expect(expandSlots(STD_SLOTS)).toEqual([0, 2, 2, 4, 4, 6, 16, 17, 23]);
    expect(expandSlots({ 23: 1, 7: 1, 3: 1, 0: 1, 20: 5 })).toEqual([0, 3, 7, 23]);
  });
  it("uses eligibleSlots when present, else position fallback", () => {
    const te = mkPlayer({ position: "TE" });
    expect(isEligible(te, SLOT.TE)).toBe(true);
    expect(isEligible(te, SLOT.FLEX)).toBe(true);
    expect(isEligible(te, SLOT.RB)).toBe(false);
    const weird = mkPlayer({ position: "TE", eligibleSlots: [6, 20] });
    expect(isEligible(weird, SLOT.FLEX)).toBe(false);
  });
});

describe("hungarian", () => {
  it("solves a small square assignment", () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    const a = hungarian(cost);
    const total = a.reduce((s, j, i) => s + cost[i][j], 0);
    expect(total).toBe(5); // 1 + 2 + 2
    expect(new Set(a).size).toBe(3);
  });
});

describe("optimizeLineup", () => {
  it("lets a TE fill FLEX when better than the next RB/WR", () => {
    const slots = { 2: 1, 4: 1, 6: 1, 23: 1, 20: 5 };
    const rb1 = mkPlayer({ position: "RB", lineupSlotId: 2 });
    const rb2 = mkPlayer({ position: "RB", lineupSlotId: 23 });
    const wr1 = mkPlayer({ position: "WR", lineupSlotId: 4 });
    const te1 = mkPlayer({ position: "TE", lineupSlotId: 6 });
    const te2 = mkPlayer({ position: "TE" });
    const proj = projMap(
      mkProj(rb1.espnId, 15),
      mkProj(rb2.espnId, 6),
      mkProj(wr1.espnId, 14),
      mkProj(te1.espnId, 10),
      mkProj(te2.espnId, 9),
    );
    const r = optimizeLineup([rb1, rb2, wr1, te1, te2], slots, proj);
    expect(slotOf(r, te2.espnId)).toBe(SLOT.FLEX);
    expect(r.bench).toEqual([rb2.espnId]);
    expect(r.total).toBe(48);
    expect(r.emptySlots).toEqual([]);
  });

  it("puts a QB in the OP slot", () => {
    const slots = { 0: 1, 7: 1, 2: 1, 20: 3 };
    const qb1 = mkPlayer({ position: "QB" });
    const qb2 = mkPlayer({ position: "QB" });
    const rb1 = mkPlayer({ position: "RB" });
    const rb2 = mkPlayer({ position: "RB" });
    const proj = projMap(mkProj(qb1.espnId, 20), mkProj(qb2.espnId, 18), mkProj(rb1.espnId, 12), mkProj(rb2.espnId, 8));
    const r = optimizeLineup([qb1, qb2, rb1, rb2], slots, proj);
    expect(slotOf(r, qb2.espnId)).toBe(SLOT.OP);
    expect(slotOf(r, qb1.espnId)).toBe(SLOT.QB);
    expect(r.total).toBe(50);
  });

  it("excludes IR players and lists them separately", () => {
    const slots = { 2: 1, 20: 2, 21: 1 };
    const ir = mkPlayer({ position: "RB", lineupSlotId: 21 });
    const rb = mkPlayer({ position: "RB", lineupSlotId: 2 });
    const proj = projMap(mkProj(ir.espnId, 30), mkProj(rb.espnId, 5));
    const r = optimizeLineup([ir, rb], slots, proj);
    expect(r.ir).toEqual([ir.espnId]);
    expect(r.starters).toEqual([{ espnId: rb.espnId, slotId: 2 }]);
    expect(r.bench).toEqual([]);
    expect(r.changes.some((c) => c.espnId === ir.espnId)).toBe(false);
  });

  it("leaves a slot empty when nobody is eligible", () => {
    const slots = { 2: 1, 17: 1, 20: 2 };
    const rb1 = mkPlayer({ position: "RB" });
    const rb2 = mkPlayer({ position: "RB" });
    const proj = projMap(mkProj(rb1.espnId, 10), mkProj(rb2.espnId, 8));
    const r = optimizeLineup([rb1, rb2], slots, proj);
    expect(r.emptySlots).toEqual([SLOT.K]);
    expect(r.starters).toEqual([{ espnId: rb1.espnId, slotId: SLOT.RB }]);
    expect(r.bench).toEqual([rb2.espnId]);
    expect(r.total).toBe(10);
  });

  it("fills more slots than players when the roster is short", () => {
    const rb = mkPlayer({ position: "RB" });
    const r = optimizeLineup([rb], STD_SLOTS, projMap(mkProj(rb.espnId, 10)));
    expect(r.starters).toEqual([{ espnId: rb.espnId, slotId: SLOT.RB }]);
    expect(r.emptySlots.length).toBe(8);
  });

  it("excludes OUT players with lockInjuredOut", () => {
    const slots = { 2: 1, 20: 2 };
    const out = mkPlayer({ position: "RB", injuryStatus: "OUT", lineupSlotId: 2 });
    const rb = mkPlayer({ position: "RB" });
    const proj = projMap(mkProj(out.espnId, 20), mkProj(rb.espnId, 5));
    expect(slotOf(optimizeLineup([out, rb], slots, proj), out.espnId)).toBe(SLOT.RB);
    const locked = optimizeLineup([out, rb], slots, proj, { lockInjuredOut: true });
    expect(slotOf(locked, rb.espnId)).toBe(SLOT.RB);
    expect(locked.bench).toEqual([out.espnId]);
  });

  it("reports changes vs the current lineup and currentTotal", () => {
    const slots = { 2: 1, 4: 1, 20: 2 };
    const rbStart = mkPlayer({ position: "RB", lineupSlotId: 2 });
    const rbBench = mkPlayer({ position: "RB", lineupSlotId: 20 });
    const wrStart = mkPlayer({ position: "WR", lineupSlotId: 4 });
    const wrBench = mkPlayer({ position: "WR" });
    const proj = projMap(
      mkProj(rbStart.espnId, 5),
      mkProj(rbBench.espnId, 12),
      mkProj(wrStart.espnId, 11),
      mkProj(wrBench.espnId, 9),
    );
    const r = optimizeLineup([rbStart, rbBench, wrStart, wrBench], slots, proj);
    expect(r.currentTotal).toBe(16);
    expect(r.total).toBe(23);
    expect(r.changes).toEqual(
      expect.arrayContaining([
        { espnId: rbStart.espnId, from: 2, to: null },
        { espnId: rbBench.espnId, from: null, to: 2 },
      ]),
    );
    expect(r.changes).toHaveLength(2);
  });

  it("returns no changes when the current lineup is already optimal (equal-value tie)", () => {
    const slots = { 2: 2, 20: 1 };
    const a = mkPlayer({ position: "RB", lineupSlotId: 2 });
    const b = mkPlayer({ position: "RB", lineupSlotId: 2 });
    const c = mkPlayer({ position: "RB", lineupSlotId: 20 });
    const proj = projMap(mkProj(a.espnId, 10), mkProj(b.espnId, 10), mkProj(c.espnId, 10));
    expect(optimizeLineup([a, b, c], slots, proj).changes).toEqual([]);
  });

  it("prefers lower sd on point ties", () => {
    const slots = { 2: 1, 20: 1 };
    const a = mkPlayer({ position: "RB" });
    const b = mkPlayer({ position: "RB" });
    const proj = projMap(mkProj(a.espnId, 10, 9), mkProj(b.espnId, 10, 3));
    expect(slotOf(optimizeLineup([a, b], slots, proj), b.espnId)).toBe(SLOT.RB);
  });

  it("hungarian total >= greedy total on 20 random rosters", () => {
    const rnd = seeded(42);
    const positions = ["QB", "RB", "RB", "RB", "RB", "WR", "WR", "WR", "WR", "TE", "TE", "K", "DST"] as const;
    const slots = { 0: 1, 2: 2, 4: 2, 6: 1, 3: 1, 5: 1, 23: 1, 7: 1, 17: 1, 16: 1, 20: 7 };
    for (let trial = 0; trial < 20; trial++) {
      const roster: LeaguePlayer[] = [];
      const projs = [];
      const n = 12 + Math.floor(rnd() * 8);
      for (let i = 0; i < n; i++) {
        const p = mkPlayer({ position: positions[Math.floor(rnd() * positions.length)] });
        roster.push(p);
        projs.push(mkProj(p.espnId, Math.round(rnd() * 250) / 10, 3 + rnd() * 6));
      }
      const proj = projMap(...projs);
      const opt = optimizeLineup(roster, slots, proj);
      const greedy = greedyLineup(roster, slots, proj);
      expect(opt.total).toBeGreaterThanOrEqual(greedy.total - 1e-9);
      // sanity: each starter used once, all eligible
      const ids = opt.starters.map((s) => s.espnId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of opt.starters) expect(isEligible(roster.find((p) => p.espnId === s.espnId)!, s.slotId)).toBe(true);
      expect(opt.starters.length + opt.emptySlots.length).toBe(expandSlots(slots).length);
    }
  });
});
