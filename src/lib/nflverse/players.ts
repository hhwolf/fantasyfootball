import Papa from "papaparse";
import { sql } from "drizzle-orm";
import type { Db } from "../db";
import { players } from "../db/schema";
import { PRO_TEAM_ID_BY_ABBR, type Position } from "../espn/constants";
import { normalizeTeamAbbr } from "./dvp";

export const NFLVERSE_PLAYERS_URL = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv";

type Row = { gsis_id?: string; display_name?: string; espn_id?: number | string; position?: string; latest_team?: string; status?: string };
const SKILL = new Set(["QB", "RB", "WR", "TE", "K"]);

export function csvToPlayerIdRows(csv: string): { espnId: number; gsisId: string; name: string; position: Position; proTeamId: number }[] {
  const parsed = Papa.parse<Row>(csv, { header: true, dynamicTyping: true, skipEmptyLines: true });
  const out: ReturnType<typeof csvToPlayerIdRows> = [];
  const seen = new Set<number>();
  for (const r of parsed.data) {
    const espnId = Number(r.espn_id);
    if (!r.gsis_id || !Number.isFinite(espnId) || espnId <= 0 || seen.has(espnId)) continue;
    const position = String(r.position ?? "").toUpperCase();
    if (!SKILL.has(position)) continue;
    seen.add(espnId);
    const abbr = (r.latest_team ? normalizeTeamAbbr(String(r.latest_team)) : null) ?? "";
    out.push({ espnId, gsisId: r.gsis_id, name: r.display_name ?? String(espnId), position: position as Position, proTeamId: PRO_TEAM_ID_BY_ABBR[abbr] ?? 0 });
  }
  return out;
}

/**
 * Fill `players.gsis_id` from nflverse's id map (Sleeper's file is missing gsis ids for many
 * current players). Inserts rows for players Sleeper did not know about.
 */
export async function syncNflversePlayerIds(db: Db, fetchImpl: typeof fetch = fetch): Promise<number> {
  const res = await fetchImpl(NFLVERSE_PLAYERS_URL, { headers: { "User-Agent": "ffdash/1.0" } });
  if (!res.ok) throw new Error(`nflverse players.csv ${res.status}`);
  const rows = csvToPlayerIdRows(await res.text());
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ espnId: r.espnId, gsisId: r.gsisId, name: r.name, position: r.position, proTeamId: r.proTeamId, updatedAt: new Date() }));
    await db
      .insert(players)
      .values(chunk)
      .onConflictDoUpdate({
        target: players.espnId,
        // Only fill missing gsis ids; keep Sleeper's name/team (fresher).
        set: { gsisId: sql`coalesce(${players.gsisId}, excluded.gsis_id)`, updatedAt: new Date() },
      });
  }
  return rows.length;
}
