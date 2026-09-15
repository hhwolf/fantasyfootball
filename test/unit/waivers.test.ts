import { describe, expect, it } from "vitest";
import { suggestWaivers } from "@/lib/features/waivers";
import type { LeaguePlayer } from "@/lib/league/types";
import { mkCtx, mkPlayer, mkProj, projMap, STD_SLOTS } from "../helpers/players";

/** 13-game remaining season => seasonProj/13 per week. */
const perWeek = (pts: number) => pts * 13;

function buildRoster(): LeaguePlayer[] {
  return [
    mkPlayer({ position: "QB", lineupSlotId: 0, espnSeasonProj: perWeek(20) }),
    mkPlayer({ position: "RB", lineupSlotId: 2, espnSeasonProj: perWeek(15) }),
    mkPlayer({ position: "RB", lineupSlotId: 2, espnSeasonProj: perWeek(12) }),
    mkPlayer({ position: "WR", lineupSlotId: 4, espnSeasonProj: perWeek(14) }),
    mkPlayer({ position: "WR", lineupSlotId: 4, espnSeasonProj: perWeek(11) }),
    mkPlayer({ position: "TE", lineupSlotId: 6, espnSeasonProj: perWeek(8) }),
    mkPlayer({ position: "RB", lineupSlotId: 23, espnSeasonProj: perWeek(9) }),
    mkPlayer({ position: "K", lineupSlotId: 17, espnSeasonProj: perWeek(8) }),
    mkPlayer({ position: "DST", lineupSlotId: 16, espnSeasonProj: perWeek(7) }),
    mkPlayer({ position: "RB", lineupSlotId: 20, espnSeasonProj: perWeek(4), name: "Bench RB low" }),
    mkPlayer({ position: "WR", lineupSlotId: 20, espnSeasonProj: perWeek(6) }),
    mkPlayer({ position: "RB", lineupSlotId: 21, espnSeasonProj: perWeek(0), injuryStatus: "INJURY_RESERVE", name: "IR guy" }),
  ];
}

function weekProjFor(players: LeaguePlayer[]) {
  return projMap(...players.map((p) => mkProj(p.espnId, (p.espnSeasonProj ?? 0) / 13)));
}

describe("suggestWaivers", () => {
  it("never suggests a rostered player and never drops an IR player", () => {
    const roster = buildRoster();
    const fas = [mkPlayer({ position: "RB", espnSeasonProj: perWeek(10) }), roster[1]];
    const ctx = mkCtx({ currentWeek: 5, finalWeek: 17, weekProj: weekProjFor([...roster, ...fas]) });
    const out = suggestWaivers(fas, roster, STD_SLOTS, ctx);
    expect(out.map((s) => s.player.espnId)).not.toContain(roster[1].espnId);
    expect(out.every((s) => s.replaces?.lineupSlotId !== 21)).toBe(true);
  });

  it("suggests dropping the lowest-value same-position player", () => {
    const roster = buildRoster();
    const fa = mkPlayer({ position: "RB", espnSeasonProj: perWeek(7) });
    const ctx = mkCtx({ currentWeek: 5, finalWeek: 17, weekProj: weekProjFor([...roster, fa]) });
    const [s] = suggestWaivers([fa], roster, STD_SLOTS, ctx);
    expect(s.replaces?.name).toBe("Bench RB low");
    expect(s.valueNext3).toBeCloseTo(21, 6);
    expect(s.delta).toBeCloseTo(21 - 12, 6);
    expect(s.startsThisWeek).toBe(false);
    expect(s.lineupGain).toBeCloseTo(0, 9);
    expect(s.ros).toBeCloseTo(perWeek(7), 6);
    expect(s.valueNow).toBeCloseTo(7, 6);
  });

  it("marks startsThisWeek and lineupGain when the FA beats a starter", () => {
    const roster = buildRoster();
    const fa = mkPlayer({ position: "WR", espnSeasonProj: perWeek(13) });
    const ctx = mkCtx({ currentWeek: 5, finalWeek: 17, weekProj: weekProjFor([...roster, fa]) });
    const [s] = suggestWaivers([fa], roster, STD_SLOTS, ctx);
    expect(s.startsThisWeek).toBe(true);
    // FA (13) displaces the FLEX RB (9) => +4 this week
    expect(s.lineupGain).toBeCloseTo(4, 6);
    // Cross-position drop kicks in (13/wk clears the bench RB at 4/wk by >= 3), so the weakest RB/WR/TE goes.
    expect(s.replaces?.name).toBe("Bench RB low");
    expect(s.delta).toBeCloseTo(39 - 12, 6);
  });

  it("drops the weakest same-position player when no cross-position candidate is weaker", () => {
    const roster = buildRoster().filter((p) => p.name !== "Bench RB low");
    const fa = mkPlayer({ position: "WR", espnSeasonProj: perWeek(13) });
    const ctx = mkCtx({ currentWeek: 5, finalWeek: 17, weekProj: weekProjFor([...roster, fa]) });
    const [s] = suggestWaivers([fa], roster, STD_SLOTS, ctx);
    expect(s.replaces?.position).toBe("WR");
    expect(s.replaces?.espnSeasonProj).toBe(perWeek(6));
    expect(s.startsThisWeek).toBe(true);
  });

  it("allows cross-position RB/WR/TE drops only with a clear margin", () => {
    const roster = [
      mkPlayer({ position: "RB", lineupSlotId: 2, espnSeasonProj: perWeek(15) }),
      mkPlayer({ position: "WR", lineupSlotId: 4, espnSeasonProj: perWeek(2), name: "weak WR" }),
      mkPlayer({ position: "TE", lineupSlotId: 6, espnSeasonProj: perWeek(9) }),
    ];
    const slots = { 2: 1, 4: 1, 6: 1, 20: 1 };
    const ctx = mkCtx({ currentWeek: 5, finalWeek: 17 });
    // Only RB on roster is strong; a TE FA at 4/wk exceeds weak WR (2/wk) by 6 over 3 weeks => cross drop allowed.
    const te = mkPlayer({ position: "TE", espnSeasonProj: perWeek(4) });
    const [s] = suggestWaivers([te], roster, slots, ctx);
    expect(s.replaces?.name).toBe("weak WR");
    // A TE FA at 2.5/wk is only +1.5 over 3 weeks vs weak WR => must drop the TE instead.
    const te2 = mkPlayer({ position: "TE", espnSeasonProj: perWeek(2.5) });
    const [s2] = suggestWaivers([te2], roster, slots, ctx);
    expect(s2.replaces?.position).toBe("TE");
    expect(s2.delta).toBeLessThan(0);
  });

  it("returns only positive deltas when enough exist, otherwise top 10", () => {
    const roster = buildRoster();
    const ctx = mkCtx({ currentWeek: 5, finalWeek: 17, weekProj: weekProjFor(roster) });
    const weakFas = Array.from({ length: 15 }, (_, i) => mkPlayer({ position: "RB", espnSeasonProj: perWeek(1 + i * 0.1) }));
    const few = suggestWaivers(weakFas, roster, STD_SLOTS, ctx);
    expect(few).toHaveLength(10);
    expect(few[0].delta).toBeGreaterThanOrEqual(few[9].delta);

    const strongFas = Array.from({ length: 15 }, (_, i) => mkPlayer({ position: "RB", espnSeasonProj: perWeek(6 + i) }));
    const many = suggestWaivers(strongFas, roster, STD_SLOTS, ctx, { limit: 12 });
    expect(many).toHaveLength(12);
    expect(many.every((s) => s.delta > 0)).toBe(true);
    expect(many[0].player.espnSeasonProj).toBe(perWeek(20));
  });

  it("uses the FA's full value as delta when the roster has no droppable player at that position", () => {
    const roster = [mkPlayer({ position: "RB", lineupSlotId: 2, espnSeasonProj: perWeek(10) })];
    const k = mkPlayer({ position: "K", espnSeasonProj: perWeek(8) });
    const ctx = mkCtx({ currentWeek: 5, finalWeek: 17 });
    const [s] = suggestWaivers([k], roster, { 2: 1, 17: 1, 20: 2 }, ctx);
    expect(s.replaces).toBeNull();
    expect(s.delta).toBeCloseTo(24, 6);
  });
});
