import { dstPlayerId, PRO_TEAM, PRO_TEAM_ID_BY_ABBR, type Position } from "../espn/constants";
import type { LeaguePlayer } from "../league/types";
import type { PlayerIdMap } from "../sleeper/players";
import type { SleeperProjection } from "../sleeper/schemas";
import type { SleeperProjectionLite } from "../projections/types";
import { sleeperPosition } from "../sleeper/client";

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Lowercase, drop generational suffixes, punctuation, and whitespace: "D.J. Moore Jr." -> "djmoore". */
export function normalizeName(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join("");
}

/** Canonical team abbreviation (our PRO_TEAM vocabulary) or null. */
function canonicalTeam(abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  const id = PRO_TEAM_ID_BY_ABBR[abbr.toUpperCase()];
  return id === undefined ? abbr.toUpperCase() : PRO_TEAM[id];
}

function canonicalPosition(pos: string): Position | null {
  return sleeperPosition(pos);
}

export type ResolveCandidate = {
  name: string;
  position: string;
  team?: string | null;
  sleeperId?: string | null;
  gsisId?: string | null;
};

type NameIndex = Map<string, LeaguePlayer[]>;
const nameIndexCache = new WeakMap<Map<number, LeaguePlayer>, NameIndex>();

function nameKey(name: string, position: Position): string {
  return `${normalizeName(name)}|${position}`;
}

function getNameIndex(leaguePlayers: Map<number, LeaguePlayer>): NameIndex {
  let idx = nameIndexCache.get(leaguePlayers);
  if (idx) return idx;
  idx = new Map();
  for (const p of leaguePlayers.values()) {
    const key = nameKey(p.name, p.position);
    const list = idx.get(key);
    if (list) list.push(p);
    else idx.set(key, [p]);
  }
  nameIndexCache.set(leaguePlayers, idx);
  return idx;
}

/**
 * Resolve an external player to an ESPN id: exact Sleeper/GSIS id via the players table first,
 * then normalized name + position (+ team when provided) against the league player pool.
 */
export function resolveEspnId(candidate: ResolveCandidate, idMap: PlayerIdMap, leaguePlayers: Map<number, LeaguePlayer>): number | null {
  if (candidate.sleeperId) {
    const row = idMap.bySleeper.get(candidate.sleeperId);
    if (row) return row.espnId;
  }
  if (candidate.gsisId) {
    const row = idMap.byGsis.get(candidate.gsisId);
    if (row) return row.espnId;
  }

  const position = canonicalPosition(candidate.position);
  if (!position) return null;
  const team = canonicalTeam(candidate.team);

  // D/ST ids are deterministic from the team.
  if (position === "DST") {
    const abbr = team ?? canonicalTeam(candidate.sleeperId) ?? canonicalTeam(candidate.name);
    const proTeamId = abbr ? PRO_TEAM_ID_BY_ABBR[abbr] : undefined;
    return proTeamId !== undefined ? dstPlayerId(proTeamId) : null;
  }

  const matches = getNameIndex(leaguePlayers).get(nameKey(candidate.name, position));
  if (!matches || matches.length === 0) return null;
  if (team) {
    const sameTeam = matches.filter((m) => m.proTeam === team);
    if (sameTeam.length === 1) return sameTeam[0].espnId;
    if (sameTeam.length > 1) return null;
    // Team mismatch is tolerated only when the name+position is otherwise unique
    // (roster moves lag between data providers).
  }
  return matches.length === 1 ? matches[0].espnId : null;
}

/** Re-key Sleeper weekly projections by ESPN id, dropping anything we cannot resolve. */
export function buildSleeperMap(
  projections: SleeperProjection[],
  idMap: PlayerIdMap,
  leaguePlayers: Map<number, LeaguePlayer>,
): Map<number, SleeperProjectionLite> {
  const out = new Map<number, SleeperProjectionLite>();
  for (const proj of projections) {
    const info = proj.player;
    const position = info?.position ?? info?.fantasy_positions?.[0];
    const name = [info?.first_name, info?.last_name].filter(Boolean).join(" ");
    const team = proj.team ?? info?.team ?? null;
    const espnId = resolveEspnId(
      { name, position: position ?? "", team, sleeperId: proj.player_id },
      idMap,
      leaguePlayers,
    );
    if (espnId === null) continue;
    out.set(espnId, {
      sleeperId: proj.player_id,
      espnId,
      week: proj.week,
      stats: proj.stats,
      opponent: proj.opponent ?? undefined,
      injuryStatus: info?.injury_status ?? null,
    });
  }
  return out;
}
