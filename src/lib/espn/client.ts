import type { z } from "zod";
import { zGameRoot, zLeague, zPlayerPool, zProTeamSchedules, type EspnLeague, type EspnPlayerPool } from "./schemas";

export const ESPN_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";
const USER_AGENT = "ffdash/1.0 (+personal fantasy dashboard)";

export type EspnCreds = {
  leagueId: string;
  season: number;
  espnS2?: string;
  swid?: string;
};

export class EspnAuthError extends Error {
  constructor(message = "ESPN rejected the request. For private leagues, re-paste espn_s2 and SWID in Settings.") {
    super(message);
    this.name = "EspnAuthError";
  }
}
export class EspnHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "EspnHttpError";
  }
}

export type FetchImpl = typeof fetch;

type FetchOpts = {
  views?: string[];
  scoringPeriodId?: number;
  filter?: unknown;
  fetchImpl?: FetchImpl;
};

function buildHeaders(creds?: Partial<EspnCreds>, filter?: unknown): HeadersInit {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
  if (creds?.espnS2 && creds?.swid) {
    headers.Cookie = `espn_s2=${creds.espnS2}; SWID=${creds.swid}`;
  }
  if (filter) headers["x-fantasy-filter"] = JSON.stringify(filter);
  return headers;
}

export async function espnFetch<T>(schema: z.ZodType<T>, url: string, creds?: Partial<EspnCreds>, opts: FetchOpts = {}): Promise<T> {
  const u = new URL(url);
  for (const v of opts.views ?? []) u.searchParams.append("view", v);
  if (opts.scoringPeriodId != null) u.searchParams.set("scoringPeriodId", String(opts.scoringPeriodId));
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(u.toString(), { headers: buildHeaders(creds, opts.filter), cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new EspnAuthError();
  if (!res.ok) throw new EspnHttpError(res.status, `ESPN ${res.status} for ${u.pathname}`);
  const json = await res.json();
  // Pre-2018 history endpoint returns an array; normalize.
  const body = Array.isArray(json) ? json[0] : json;
  return schema.parse(body);
}

export const leagueUrl = (c: EspnCreds) => `${ESPN_BASE}/seasons/${c.season}/segments/0/leagues/${c.leagueId}`;

export async function getCurrentPeriod(fetchImpl?: FetchImpl) {
  const root = await espnFetch(zGameRoot, ESPN_BASE, undefined, { fetchImpl });
  return { season: root.currentSeasonId ?? new Date().getFullYear(), week: root.currentScoringPeriod?.id ?? 1 };
}

/** Settings + status + teams (no rosters). Used for "Test connection" and league metadata. */
export function getLeagueMeta(creds: EspnCreds, fetchImpl?: FetchImpl): Promise<EspnLeague> {
  return espnFetch(zLeague, leagueUrl(creds), creds, { views: ["mSettings", "mStatus", "mTeam"], fetchImpl });
}

/** Everything needed to render a week: settings, teams with rosters, schedule. */
export function getLeagueWeek(creds: EspnCreds, week: number, fetchImpl?: FetchImpl): Promise<EspnLeague> {
  return espnFetch(zLeague, leagueUrl(creds), creds, {
    views: ["mSettings", "mStatus", "mTeam", "mRoster", "mMatchup", "mMatchupScore"],
    scoringPeriodId: week,
    fetchImpl,
  });
}

export type FreeAgentOpts = { slotIds?: number[]; limit?: number; offset?: number; statuses?: string[] };

/** Free agents / waivers with actual + projected stat lines for season & week. */
export function getFreeAgents(creds: EspnCreds, week: number, opts: FreeAgentOpts = {}, fetchImpl?: FetchImpl): Promise<EspnPlayerPool> {
  const { slotIds = [0, 2, 4, 6, 16, 17, 23], limit = 200, offset = 0, statuses = ["FREEAGENT", "WAIVERS"] } = opts;
  const s = creds.season;
  const filter = {
    players: {
      filterStatus: { value: statuses },
      filterSlotIds: { value: slotIds },
      filterStatsForTopScoringPeriodIds: {
        value: 2,
        additionalValue: [`00${s}`, `10${s}`, `11${s}${week}`, `00${s - 1}`],
      },
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      limit,
      offset,
    },
  };
  return espnFetch(zPlayerPool, leagueUrl(creds), creds, { views: ["kona_player_info"], scoringPeriodId: week, filter, fetchImpl });
}

/** Specific players (any status) with stat lines — used for trade analysis of other teams' players. */
export function getPlayersById(creds: EspnCreds, week: number, ids: number[], fetchImpl?: FetchImpl): Promise<EspnPlayerPool> {
  const s = creds.season;
  const filter = {
    players: {
      filterIds: { value: ids },
      filterStatsForTopScoringPeriodIds: { value: 2, additionalValue: [`00${s}`, `10${s}`, `11${s}${week}`, `00${s - 1}`] },
      limit: ids.length,
    },
  };
  return espnFetch(zPlayerPool, leagueUrl(creds), creds, { views: ["kona_player_info"], scoringPeriodId: week, filter, fetchImpl });
}

export type ProTeamInfo = { id: number; abbrev?: string; byeWeek: number; gamesByWeek: Record<number, { date?: number; opponentId?: number }> };

export async function getProTeamSchedules(season: number, fetchImpl?: FetchImpl): Promise<Record<number, ProTeamInfo>> {
  const data = await espnFetch(zProTeamSchedules, `${ESPN_BASE}/seasons/${season}`, undefined, { views: ["proTeamSchedules_wl"], fetchImpl });
  const out: Record<number, ProTeamInfo> = {};
  for (const t of data.settings.proTeams) {
    const gamesByWeek: ProTeamInfo["gamesByWeek"] = {};
    for (const [wk, games] of Object.entries(t.proGamesByScoringPeriod ?? {})) {
      const g = games[0];
      if (!g) continue;
      const opponentId = g.homeProTeamId === t.id ? g.awayProTeamId : g.homeProTeamId;
      gamesByWeek[Number(wk)] = { date: g.date ?? undefined, opponentId: opponentId ?? undefined };
    }
    out[t.id] = { id: t.id, abbrev: t.abbrev ?? undefined, byeWeek: t.byeWeek ?? 0, gamesByWeek };
  }
  return out;
}
