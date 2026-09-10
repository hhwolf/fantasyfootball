import { describe, expect, it } from "vitest";
import fixture from "../fixtures/espn/league-week1.json";
import { zLeague } from "@/lib/espn/schemas";
import { normalizeLeague, allRosteredPlayers } from "@/lib/league/snapshot";
import { positionCalibration } from "@/lib/projections/calibration";
import type { ProjectionContext } from "@/lib/projections/types";

describe("positionCalibration", () => {
  const league = normalizeLeague(zLeague.parse(fixture), 1);
  const players = new Map(allRosteredPlayers(league).map((p) => [p.espnId, p]));
  const ctx = { season: 2026, week: 1, scoringItems: league.scoringItems, league, players, proTeams: {}, sleeper: new Map(), usage: new Map(), finalWeek: 17 } as unknown as ProjectionContext;
  const cal = positionCalibration(ctx);
  it("offense re-scores match ESPN exactly", () => {
    for (const pos of ["QB", "RB", "WR", "TE", "K"] as const) expect(cal[pos], pos).toBeCloseTo(1, 2);
  });
  it("D/ST ratio is finite and bounded", () => {
    expect(cal.DST).toBeGreaterThanOrEqual(0.5);
    expect(cal.DST).toBeLessThanOrEqual(2);
  });
});
