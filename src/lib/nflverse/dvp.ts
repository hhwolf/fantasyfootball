import { POSITIONS, PRO_TEAM, PRO_TEAM_ID_BY_ABBR, type Position } from "../espn/constants";
import type { UsageRow } from "../db/schema";

/** Map nflverse/Sleeper team abbreviations ("LA", "WAS", "JAX") onto our PRO_TEAM vocabulary. */
export function normalizeTeamAbbr(abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  const upper = abbr.toUpperCase();
  const id = PRO_TEAM_ID_BY_ABBR[upper];
  return id === undefined ? upper : PRO_TEAM[id];
}

export type DvpEntry = { ptsAllowedPerGame: number; games: number };
export type DvpTable = Record<Position, Record<string, DvpEntry>>;
export type Dvp = {
  /** position -> opponent team -> PPR points allowed per game to that position. */
  teams: DvpTable;
  /** position -> league-average PPR points allowed per team-game. */
  leagueAvg: Record<Position, number>;
};

function emptyByPosition<T>(make: () => T): Record<Position, T> {
  return Object.fromEntries(POSITIONS.map((p) => [p, make()])) as Record<Position, T>;
}

function asPosition(pos: string): Position | null {
  return (POSITIONS as string[]).includes(pos) ? (pos as Position) : null;
}

/**
 * Defense-vs-position: for each opponent and position, PPR points scored against them per game
 * (distinct season+week pairs).
 */
export function computeDvp(rows: UsageRow[]): Dvp {
  const totals = emptyByPosition(() => new Map<string, { pts: number; games: Set<string> }>());

  for (const r of rows) {
    const position = asPosition(r.position);
    const opp = normalizeTeamAbbr(r.opponent);
    if (!position || !opp) continue;
    const pts = Number(r.fptsPpr ?? 0);
    if (!Number.isFinite(pts)) continue;
    const byTeam = totals[position];
    let acc = byTeam.get(opp);
    if (!acc) {
      acc = { pts: 0, games: new Set() };
      byTeam.set(opp, acc);
    }
    acc.pts += pts;
    acc.games.add(`${r.season}-${r.week}`);
  }

  const teams = emptyByPosition<Record<string, DvpEntry>>(() => ({}));
  const leagueAvg = emptyByPosition(() => 0);
  for (const position of POSITIONS) {
    let sumPts = 0;
    let sumGames = 0;
    for (const [team, acc] of totals[position]) {
      const games = acc.games.size;
      if (games === 0) continue;
      teams[position][team] = { ptsAllowedPerGame: acc.pts / games, games };
      sumPts += acc.pts;
      sumGames += games;
    }
    leagueAvg[position] = sumGames > 0 ? sumPts / sumGames : 0;
  }
  return { teams, leagueAvg };
}

export type DvpFactorOpts = { clampLo?: number; clampHi?: number; shrinkGames?: number };

/**
 * Multiplier for a player's projection given the opponent's DvP: the team/league ratio shrunk
 * toward 1 by games/shrinkGames, then clamped. Returns 1 when the matchup is unknown.
 */
export function dvpFactor(dvp: Dvp, position: Position, opponentTeam: string | null | undefined, opts: DvpFactorOpts = {}): number {
  const { clampLo = 0.8, clampHi = 1.2, shrinkGames = 8 } = opts;
  const opp = normalizeTeamAbbr(opponentTeam);
  if (!opp) return 1;
  const entry = dvp.teams[position]?.[opp];
  const avg = dvp.leagueAvg[position];
  if (!entry || entry.games === 0 || !avg) return 1;
  const ratio = entry.ptsAllowedPerGame / avg;
  const weight = shrinkGames > 0 ? Math.min(1, entry.games / shrinkGames) : 1;
  const shrunk = 1 + (ratio - 1) * weight;
  return Math.min(clampHi, Math.max(clampLo, shrunk));
}
