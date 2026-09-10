import { describe, expect, it } from "vitest";
import { computeDvp, dvpFactor, normalizeTeamAbbr } from "@/lib/nflverse/dvp";
import type { UsageRow } from "@/lib/db/schema";

let seq = 0;
const usage = (season: number, week: number, position: string, opponent: string, fpts: number): UsageRow => ({
  season,
  week,
  gsisId: `00-${String(++seq).padStart(7, "0")}`,
  position,
  team: "XXX",
  opponent,
  passAtt: 0,
  passYds: 0,
  passTd: 0,
  passInt: 0,
  carries: 0,
  rushYds: 0,
  rushTd: 0,
  targets: 0,
  receptions: 0,
  recYds: 0,
  recTd: 0,
  airYards: 0,
  fumLost: 0,
  fptsPpr: fpts.toFixed(2),
});

/** Build rows where `opp` allows `perGame` WR points/game over `games` games and 3 other teams allow `avgOther`. */
function build(opp: string, perGame: number, games: number, avgOther = 30, otherGames = 8): UsageRow[] {
  const rows: UsageRow[] = [];
  for (let w = 1; w <= games; w++) {
    // two WRs split the points
    rows.push(usage(2025, w, "WR", opp, perGame * 0.6), usage(2025, w, "WR", opp, perGame * 0.4));
  }
  for (const t of ["BUF", "KC", "DAL"]) {
    for (let w = 1; w <= otherGames; w++) rows.push(usage(2025, w, "WR", t, avgOther));
  }
  return rows;
}

describe("normalizeTeamAbbr", () => {
  it("maps nflverse/Sleeper variants onto PRO_TEAM abbreviations", () => {
    expect(normalizeTeamAbbr("LA")).toBe("LAR");
    expect(normalizeTeamAbbr("WAS")).toBe("WSH");
    expect(normalizeTeamAbbr("JAX")).toBe("JAX");
    expect(normalizeTeamAbbr("JAC")).toBe("JAX");
    expect(normalizeTeamAbbr("kc")).toBe("KC");
    expect(normalizeTeamAbbr(null)).toBeNull();
  });
});

describe("computeDvp", () => {
  it("computes per-game points allowed by position and league average", () => {
    const dvp = computeDvp(build("PHI", 40, 8));
    expect(dvp.teams.WR.PHI.games).toBe(8);
    expect(dvp.teams.WR.PHI.ptsAllowedPerGame).toBeCloseTo(40);
    expect(dvp.teams.WR.BUF.ptsAllowedPerGame).toBeCloseTo(30);
    // (40*8 + 30*24) / 32 = 32.5
    expect(dvp.leagueAvg.WR).toBeCloseTo(32.5);
    expect(dvp.teams.RB).toEqual({});
    expect(dvp.leagueAvg.RB).toBe(0);
  });

  it("normalizes opponent abbreviations", () => {
    const dvp = computeDvp([usage(2025, 1, "RB", "LA", 20), usage(2025, 1, "RB", "WAS", 10)]);
    expect(dvp.teams.RB.LAR.ptsAllowedPerGame).toBe(20);
    expect(dvp.teams.RB.WSH.ptsAllowedPerGame).toBe(10);
  });
});

describe("dvpFactor", () => {
  it("returns the shrunk ratio when fully sampled", () => {
    const dvp = computeDvp(build("PHI", 36, 8)); // avg = (288 + 720)/32 = 31.5 -> ratio 1.1429
    expect(dvpFactor(dvp, "WR", "PHI")).toBeCloseTo(36 / 31.5, 4);
  });

  it("clamps extreme ratios", () => {
    expect(dvpFactor(computeDvp(build("PHI", 80, 8)), "WR", "PHI")).toBe(1.2);
    expect(dvpFactor(computeDvp(build("PHI", 5, 8)), "WR", "PHI")).toBe(0.8);
    expect(dvpFactor(computeDvp(build("PHI", 80, 8)), "WR", "PHI", { clampHi: 1.5 })).toBeCloseTo(1.5);
  });

  it("shrinks toward 1 when there are few games", () => {
    const dvp = computeDvp(build("PHI", 36, 2));
    const ratio = dvp.teams.WR.PHI.ptsAllowedPerGame / dvp.leagueAvg.WR;
    expect(ratio).toBeGreaterThan(1.1);
    const f = dvpFactor(dvp, "WR", "PHI");
    expect(f).toBeGreaterThan(1);
    expect(f).toBeLessThan(ratio);
    expect(f).toBeCloseTo(1 + (ratio - 1) * (2 / 8), 6);
    // With a smaller shrink window, the same sample is trusted more.
    expect(dvpFactor(dvp, "WR", "PHI", { shrinkGames: 2 })).toBeCloseTo(ratio, 6);
  });

  it("returns 1 for unknown matchups", () => {
    const dvp = computeDvp(build("PHI", 36, 8));
    expect(dvpFactor(dvp, "WR", "SEA")).toBe(1);
    expect(dvpFactor(dvp, "RB", "PHI")).toBe(1);
    expect(dvpFactor(dvp, "WR", null)).toBe(1);
  });
});
