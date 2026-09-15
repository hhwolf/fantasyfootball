import Papa from "papaparse";
import { and, eq, gt, gte, lte, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import { usageWeekly, type UsageRow } from "../db/schema";
import { normalizeTeamAbbr } from "./dvp";

export type FetchImpl = typeof fetch;

const USER_AGENT = "ffdash/1.0 (+personal fantasy dashboard)";
const BATCH_SIZE = 500;
const USAGE_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

export function nflverseWeeklyStatsUrl(season: number): string {
  return `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
}

/** Columns of stats_player_week_{season}.csv that we read (verified against the 2025 file). */
type WeeklyCsvRow = {
  player_id: string;
  player_display_name?: string;
  position?: string;
  season: number;
  week: number;
  season_type?: string;
  team?: string;
  opponent_team?: string;
  attempts?: number | null;
  passing_yards?: number | null;
  passing_tds?: number | null;
  passing_interceptions?: number | null;
  carries?: number | null;
  rushing_yards?: number | null;
  rushing_tds?: number | null;
  targets?: number | null;
  receptions?: number | null;
  receiving_yards?: number | null;
  receiving_tds?: number | null;
  receiving_air_yards?: number | null;
  sack_fumbles_lost?: number | null;
  rushing_fumbles_lost?: number | null;
  receiving_fumbles_lost?: number | null;
  fantasy_points_ppr?: number | null;
};

export type LoadUsageResult = { season: number; rows: number; missing?: boolean };

const int = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Convert CSV rows into `usage_weekly` insert rows (regular season, QB/RB/WR/TE only). */
export function csvToUsageRows(csv: string, season: number): (typeof usageWeekly.$inferInsert)[] {
  const parsed = Papa.parse<WeeklyCsvRow>(csv, { header: true, dynamicTyping: true, skipEmptyLines: true });
  const out = new Map<string, typeof usageWeekly.$inferInsert>();
  for (const r of parsed.data) {
    if (!r.player_id || typeof r.week !== "number") continue;
    if (r.season_type && r.season_type !== "REG") continue;
    const position = r.position ?? "";
    if (!USAGE_POSITIONS.has(position)) continue;
    const gsisId = String(r.player_id);
    const key = `${season}-${r.week}-${gsisId}`;
    if (out.has(key)) continue;
    out.set(key, {
      season,
      week: r.week,
      gsisId,
      position,
      team: normalizeTeamAbbr(r.team),
      opponent: normalizeTeamAbbr(r.opponent_team),
      passAtt: int(r.attempts),
      passYds: int(r.passing_yards),
      passTd: int(r.passing_tds),
      passInt: int(r.passing_interceptions),
      carries: int(r.carries),
      rushYds: int(r.rushing_yards),
      rushTd: int(r.rushing_tds),
      targets: int(r.targets),
      receptions: int(r.receptions),
      recYds: int(r.receiving_yards),
      recTd: int(r.receiving_tds),
      airYards: int(r.receiving_air_yards),
      fumLost: int(r.sack_fumbles_lost) + int(r.rushing_fumbles_lost) + int(r.receiving_fumbles_lost),
      fptsPpr: num(r.fantasy_points_ppr).toFixed(2),
    });
  }
  return [...out.values()];
}

/** Download the nflverse weekly player stats for a season and upsert them into `usage_weekly`. */
export async function loadWeeklyUsage(db: Db, season: number, fetchImpl: FetchImpl = fetch): Promise<LoadUsageResult> {
  const res = await fetchImpl(nflverseWeeklyStatsUrl(season), { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
  if (res.status === 404) return { season, rows: 0, missing: true };
  if (!res.ok) throw new Error(`nflverse request failed (${res.status}) for season ${season}`);
  const rows = csvToUsageRows(await res.text(), season);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db
      .insert(usageWeekly)
      .values(batch)
      .onConflictDoUpdate({
        target: [usageWeekly.season, usageWeekly.week, usageWeekly.gsisId],
        set: {
          position: sql`excluded.position`,
          team: sql`excluded.team`,
          opponent: sql`excluded.opponent`,
          passAtt: sql`excluded.pass_att`,
          passYds: sql`excluded.pass_yds`,
          passTd: sql`excluded.pass_td`,
          passInt: sql`excluded.pass_int`,
          carries: sql`excluded.carries`,
          rushYds: sql`excluded.rush_yds`,
          rushTd: sql`excluded.rush_td`,
          targets: sql`excluded.targets`,
          receptions: sql`excluded.receptions`,
          recYds: sql`excluded.rec_yds`,
          recTd: sql`excluded.rec_td`,
          airYards: sql`excluded.air_yards`,
          fumLost: sql`excluded.fum_lost`,
          fptsPpr: sql`excluded.fpts_ppr`,
        },
      });
  }
  return { season, rows: rows.length };
}

export type LoadUsageFallbackResult = { seasons: number[]; results: LoadUsageResult[] };

/** Load `season`; if the file is missing or empty (e.g. preseason), also load `season - 1`. */
export async function loadUsageWithFallback(db: Db, season: number, fetchImpl: FetchImpl = fetch): Promise<LoadUsageFallbackResult> {
  const results: LoadUsageResult[] = [];
  const current = await loadWeeklyUsage(db, season, fetchImpl);
  results.push(current);
  if (current.missing || current.rows === 0) {
    results.push(await loadWeeklyUsage(db, season - 1, fetchImpl));
  }
  return { seasons: results.filter((r) => r.rows > 0).map((r) => r.season), results };
}

export type RecentUsageOpts = { lookbackWeeks?: number; includePriorSeason?: boolean };

/**
 * Usage rows from `season` weeks (throughWeek - lookback, throughWeek], plus (optionally) the last
 * `lookbackWeeks` regular-season weeks (never earlier than week 14) of the prior season.
 */
export async function getRecentUsage(db: Db, season: number, throughWeek: number, opts: RecentUsageOpts = {}): Promise<UsageRow[]> {
  const { lookbackWeeks = 4, includePriorSeason = false } = opts;
  const current = and(eq(usageWeekly.season, season), gt(usageWeekly.week, throughWeek - lookbackWeeks), lte(usageWeekly.week, throughWeek));
  const where = includePriorSeason
    ? or(current, and(eq(usageWeekly.season, season - 1), gte(usageWeekly.week, Math.max(14, 19 - lookbackWeeks))))
    : current;
  return db.select().from(usageWeekly).where(where);
}
