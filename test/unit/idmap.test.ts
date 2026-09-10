import { describe, expect, it } from "vitest";
import { buildSleeperMap, normalizeName, resolveEspnId } from "@/lib/idmap/resolve";
import { buildPlayerIdMap } from "@/lib/sleeper/players";
import type { PlayerRow } from "@/lib/db/schema";
import type { LeaguePlayer } from "@/lib/league/types";
import type { SleeperProjection } from "@/lib/sleeper/schemas";
import { dstPlayerId, PRO_TEAM_ID_BY_ABBR } from "@/lib/espn/constants";

const lp = (espnId: number, name: string, position: LeaguePlayer["position"], proTeam: string): LeaguePlayer => ({
  espnId,
  name,
  position,
  proTeamId: PRO_TEAM_ID_BY_ABBR[proTeam] ?? 0,
  proTeam,
  eligibleSlots: [],
  injuryStatus: "ACTIVE",
  stats: [],
});

const leaguePlayers = new Map<number, LeaguePlayer>(
  [
    lp(1001, "D.J. Moore", "WR", "CHI"),
    lp(1002, "Marvin Harrison Jr.", "WR", "ARI"),
    lp(1003, "Josh Allen", "QB", "BUF"),
    lp(1004, "Mike Williams", "WR", "NYJ"),
    lp(1005, "Mike Williams", "WR", "LAC"),
    lp(1006, "Kenneth Walker III", "RB", "SEA"),
  ].map((p) => [p.espnId, p]),
);

const row = (espnId: number, sleeperId: string, gsisId: string | null): PlayerRow => ({
  espnId,
  sleeperId,
  gsisId,
  name: "x",
  position: "WR",
  proTeamId: 0,
  updatedAt: new Date(),
});
const idMap = buildPlayerIdMap([row(1003, "4984", "00-0034857")]);

describe("normalizeName", () => {
  it("lowercases and strips punctuation, whitespace, and suffixes", () => {
    expect(normalizeName("D.J. Moore")).toBe("djmoore");
    expect(normalizeName("Marvin Harrison Jr.")).toBe("marvinharrison");
    expect(normalizeName("Kenneth Walker III")).toBe("kennethwalker");
    expect(normalizeName("Odell Beckham Jr")).toBe("odellbeckham");
    expect(normalizeName("  Ja'Marr   Chase ")).toBe("jamarrchase");
    expect(normalizeName("Amon-Ra St. Brown")).toBe("amonrastbrown");
  });

  it("does not strip a suffix that is the whole name", () => {
    expect(normalizeName("V")).toBe("v");
  });
});

describe("resolveEspnId", () => {
  it("prefers the Sleeper id mapping", () => {
    expect(resolveEspnId({ name: "Somebody Else", position: "QB", sleeperId: "4984" }, idMap, leaguePlayers)).toBe(1003);
  });

  it("uses the GSIS id mapping", () => {
    expect(resolveEspnId({ name: "Nobody", position: "QB", gsisId: "00-0034857" }, idMap, leaguePlayers)).toBe(1003);
  });

  it("falls back to normalized name + position", () => {
    expect(resolveEspnId({ name: "DJ Moore", position: "WR", sleeperId: "unknown" }, idMap, leaguePlayers)).toBe(1001);
    expect(resolveEspnId({ name: "Marvin Harrison", position: "WR" }, idMap, leaguePlayers)).toBe(1002);
    expect(resolveEspnId({ name: "Kenneth Walker", position: "RB" }, idMap, leaguePlayers)).toBe(1006);
  });

  it("requires the position to match", () => {
    expect(resolveEspnId({ name: "DJ Moore", position: "RB" }, idMap, leaguePlayers)).toBeNull();
  });

  it("disambiguates duplicate names by team and refuses ambiguous ones", () => {
    expect(resolveEspnId({ name: "Mike Williams", position: "WR", team: "LAC" }, idMap, leaguePlayers)).toBe(1005);
    expect(resolveEspnId({ name: "Mike Williams", position: "WR", team: "NYJ" }, idMap, leaguePlayers)).toBe(1004);
    expect(resolveEspnId({ name: "Mike Williams", position: "WR" }, idMap, leaguePlayers)).toBeNull();
  });

  it("tolerates a stale team when the name is unique", () => {
    expect(resolveEspnId({ name: "D.J. Moore", position: "WR", team: "CAR" }, idMap, leaguePlayers)).toBe(1001);
  });

  it("derives D/ST ids from the team, including alternate abbreviations", () => {
    expect(resolveEspnId({ name: "Detroit Lions", position: "DEF", team: "DET", sleeperId: "DET" }, idMap, leaguePlayers)).toBe(
      dstPlayerId(PRO_TEAM_ID_BY_ABBR.DET),
    );
    expect(resolveEspnId({ name: "Washington Commanders", position: "DEF", team: "WAS" }, idMap, leaguePlayers)).toBe(dstPlayerId(28));
  });
});

describe("buildSleeperMap", () => {
  const proj = (player_id: string, first: string, last: string, position: string, team: string): SleeperProjection => ({
    player_id,
    week: 3,
    season: "2025",
    category: "proj",
    team,
    opponent: "PHI",
    stats: { rec: 5, rec_yd: 60 },
    player: { first_name: first, last_name: last, position, team, injury_status: "Questionable" },
  });

  it("keys by ESPN id and skips unresolved players", () => {
    const map = buildSleeperMap(
      [proj("4984", "Josh", "Allen", "QB", "BUF"), proj("9999", "DJ", "Moore", "WR", "CHI"), proj("1", "Unknown", "Guy", "TE", "DAL")],
      idMap,
      leaguePlayers,
    );
    expect([...map.keys()].sort()).toEqual([1001, 1003]);
    const moore = map.get(1001)!;
    expect(moore.sleeperId).toBe("9999");
    expect(moore.week).toBe(3);
    expect(moore.opponent).toBe("PHI");
    expect(moore.injuryStatus).toBe("Questionable");
    expect(moore.stats).toEqual({ rec: 5, rec_yd: 60 });
  });
});
