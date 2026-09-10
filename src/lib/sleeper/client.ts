import { dstPlayerId, PRO_TEAM_ID_BY_ABBR, type Position } from "../espn/constants";
import { zSleeperPlayersFile, zSleeperProjectionList, type SleeperProjection } from "./schemas";

export type FetchImpl = typeof fetch;

const SLEEPER_API = "https://api.sleeper.app";
const USER_AGENT = "ffdash/1.0 (+personal fantasy dashboard)";
const SLEEPER_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;

export type SleeperPlayerSlim = {
  sleeperId: string;
  espnId: number | null;
  gsisId: string | null;
  name: string;
  position: Position;
  team: string | null;
};

async function sleeperFetchJson(url: string, fetchImpl: FetchImpl): Promise<unknown> {
  const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Sleeper request failed (${res.status}) for ${url}`);
  return res.json();
}

function weeklyUrl(kind: "projections" | "stats", season: number, week: number): string {
  const params = new URLSearchParams({ season_type: "regular" });
  for (const p of SLEEPER_POSITIONS) params.append("position[]", p);
  return `${SLEEPER_API}/${kind}/nfl/${season}/${week}?${params.toString()}`;
}

/** Weekly projections (category "proj") for all fantasy positions. */
export async function getSleeperProjections(season: number, week: number, fetchImpl: FetchImpl = fetch): Promise<SleeperProjection[]> {
  const json = await sleeperFetchJson(weeklyUrl("projections", season, week), fetchImpl);
  return zSleeperProjectionList.parse(json);
}

/** Weekly actual stats (category "stat") for all fantasy positions. */
export async function getSleeperStats(season: number, week: number, fetchImpl: FetchImpl = fetch): Promise<SleeperProjection[]> {
  const json = await sleeperFetchJson(weeklyUrl("stats", season, week), fetchImpl);
  return zSleeperProjectionList.parse(json);
}

/** Sleeper's position vocabulary -> ours (DEF -> DST). Returns null for non-fantasy positions. */
export function sleeperPosition(pos: string | null | undefined): Position | null {
  switch (pos) {
    case "QB":
    case "RB":
    case "WR":
    case "TE":
    case "K":
      return pos;
    case "DEF":
    case "DST":
      return "DST";
    default:
      return null;
  }
}

function toEspnId(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetch the ~5 MB Sleeper players file and reduce it to the id-mapping essentials
 * for QB/RB/WR/TE/K/DST. Entries lacking both an espn_id and gsis_id are dropped (except DST,
 * whose ESPN id is derived from the team).
 */
export async function fetchSleeperPlayersSlim(fetchImpl: FetchImpl = fetch): Promise<SleeperPlayerSlim[]> {
  const json = await sleeperFetchJson(`${SLEEPER_API}/v1/players/nfl`, fetchImpl);
  const file = zSleeperPlayersFile.parse(json);
  const out: SleeperPlayerSlim[] = [];
  for (const [key, p] of Object.entries(file)) {
    const position = sleeperPosition(p.position);
    if (!position) continue;
    const sleeperId = p.player_id ?? key;
    const team = p.team ?? null;

    if (position === "DST") {
      const abbr = team ?? sleeperId;
      const proTeamId = PRO_TEAM_ID_BY_ABBR[abbr];
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || `${abbr} D/ST`;
      out.push({
        sleeperId,
        espnId: proTeamId !== undefined ? dstPlayerId(proTeamId) : null,
        gsisId: null,
        name,
        position,
        team: abbr,
      });
      continue;
    }

    const espnId = toEspnId(p.espn_id);
    const gsisId = p.gsis_id || null;
    if (espnId === null && gsisId === null) continue;
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ");
    if (!name) continue;
    out.push({ sleeperId, espnId, gsisId, name, position, team });
  }
  return out;
}
