import { and, eq, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { getDb, schema } from "./db";
import { EspnAuthError, getCurrentPeriod, getFreeAgents, getLeagueWeek, getPlayersById, getProTeamSchedules, type EspnCreds, type ProTeamInfo } from "./espn/client";
import { normalizeLeague, toLeaguePlayer, allRosteredPlayers } from "./league/snapshot";
import type { LeaguePlayer, LeagueSnapshot } from "./league/types";
import { loadSettings, toCreds, type AppSettings } from "./settings";
import type { PlayerProjection, ProjectionContext, ProjectionsBySource, SleeperProjectionLite } from "./projections/types";
import { projectAll } from "./projections/registry";
import { getSleeperProjections } from "./sleeper/client";
import type { SleeperProjection } from "./sleeper/schemas";
import { loadPlayerIdMap } from "./sleeper/players";
import { buildSleeperMap } from "./idmap/resolve";
import { getRecentUsage } from "./nflverse/loader";
import { computeDvp, dvpFactor } from "./nflverse/dvp";
import { PRO_TEAM, type Position } from "./espn/constants";
import { getWeekOdds, type TeamOdds } from "./espn/odds";
import type { UsageRow } from "./db/schema";

export class NotConfiguredError extends Error {
  constructor() {
    super("League not configured");
    this.name = "NotConfiguredError";
  }
}

// ---------- period ----------

export const getPeriod = unstable_cache(async () => getCurrentPeriod(), ["espn-period"], { revalidate: 1800, tags: ["league"] });

export async function resolveSeasonWeek(s: AppSettings, weekParam?: string | number): Promise<{ season: number; week: number; currentWeek: number }> {
  const period = await getPeriod().catch(() => ({ season: new Date().getFullYear(), week: 1 }));
  const season = s.season ?? period.season;
  const currentWeek = season === period.season ? Math.max(1, period.week) : 17;
  const w = Number(weekParam);
  const week = Number.isFinite(w) && w >= 1 && w <= 18 ? w : currentWeek;
  return { season, week, currentWeek };
}

// ---------- snapshots (DB fallback) ----------

async function saveSnapshot(season: number, week: number, view: string, payload: unknown) {
  const db = getDb();
  if (!db) return;
  await db
    .insert(schema.leagueSnapshot)
    .values({ season, scoringPeriod: week, view, payload, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.leagueSnapshot.season, schema.leagueSnapshot.scoringPeriod, schema.leagueSnapshot.view], set: { payload, fetchedAt: new Date() } })
    .catch((e) => console.error("saveSnapshot", e));
}

async function readSnapshot<T>(season: number, week: number, view: string): Promise<{ payload: T; fetchedAt: Date } | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(schema.leagueSnapshot)
    .where(and(eq(schema.leagueSnapshot.season, season), eq(schema.leagueSnapshot.scoringPeriod, week), eq(schema.leagueSnapshot.view, view)))
    .limit(1);
  return row ? { payload: row.payload as T, fetchedAt: row.fetchedAt } : null;
}

// ---------- league ----------

const fetchLeagueWeek = (creds: EspnCreds, week: number) =>
  unstable_cache(
    async (): Promise<{ league: LeagueSnapshot; stale: boolean; error?: string }> => {
      try {
        const raw = await getLeagueWeek(creds, week);
        const league = normalizeLeague(raw, week);
        await saveSnapshot(creds.season, week, "league", league);
        return { league, stale: false };
      } catch (err) {
        const snap = await readSnapshot<LeagueSnapshot>(creds.season, week, "league");
        if (snap) return { league: snap.payload, stale: true, error: err instanceof Error ? err.message : String(err) };
        throw err;
      }
    },
    ["league-week", creds.leagueId, String(creds.season), String(week), creds.espnS2 ? "auth" : "anon"],
    { revalidate: 900, tags: ["league"] },
  )();

export type LeagueBundle = {
  settings: AppSettings;
  creds: EspnCreds;
  league: LeagueSnapshot;
  season: number;
  week: number;
  currentWeek: number;
  stale: boolean;
  error?: string;
  myTeamId?: number;
};

export async function loadLeague(weekParam?: string | number): Promise<LeagueBundle> {
  const settings = await loadSettings();
  const { season, week, currentWeek } = await resolveSeasonWeek(settings, weekParam);
  const creds = toCreds(settings, season);
  if (!creds) throw new NotConfiguredError();
  const { league, stale, error } = await fetchLeagueWeek(creds, week);
  const myTeamId = settings.myTeamId ?? league.teams[0]?.id;
  return { settings, creds, league, season, week, currentWeek, stale, error, myTeamId };
}

// ---------- free agents ----------

const fetchFreeAgents = (creds: EspnCreds, week: number) =>
  unstable_cache(
    async (): Promise<LeaguePlayer[]> => {
      try {
        const raw = await getFreeAgents(creds, week, { limit: 250 });
        const players = (raw.players ?? []).map((e) => toLeaguePlayer(e, creds.season, week)).filter((p): p is LeaguePlayer => !!p);
        await saveSnapshot(creds.season, week, "freeagents", players);
        return players;
      } catch (err) {
        const snap = await readSnapshot<LeaguePlayer[]>(creds.season, week, "freeagents");
        if (snap) return snap.payload;
        if (err instanceof EspnAuthError) throw err;
        console.error("free agents fetch failed", err);
        return [];
      }
    },
    ["free-agents", creds.leagueId, String(creds.season), String(week), creds.espnS2 ? "auth" : "anon"],
    { revalidate: 900, tags: ["league"] },
  )();

export const loadFreeAgents = (creds: EspnCreds, week: number) => fetchFreeAgents(creds, week);

/** Players by id from ESPN's pool (any status). Used to score other teams' players if needed. */
export async function loadPlayersById(creds: EspnCreds, week: number, ids: number[]): Promise<LeaguePlayer[]> {
  if (!ids.length) return [];
  const raw = await getPlayersById(creds, week, ids);
  return (raw.players ?? []).map((e) => toLeaguePlayer(e, creds.season, week)).filter((p): p is LeaguePlayer => !!p);
}

// ---------- pro team schedules ----------

export const loadProTeams = (season: number) =>
  unstable_cache(async (): Promise<Record<number, ProTeamInfo>> => getProTeamSchedules(season).catch(() => ({})), ["pro-teams", String(season)], { revalidate: 86400 })();

// ---------- vegas odds ----------

const loadOdds = (season: number, week: number) =>
  unstable_cache(async (): Promise<Record<number, TeamOdds>> => getWeekOdds(season, week).catch((e) => (console.error("odds", e), {})), ["odds", String(season), String(week)], { revalidate: 3600 })();

// ---------- sleeper ----------

/** Sleeper's raw response is several MB; keep only the fields the id resolver and scorer use so it fits the 2MB cache limit. */
const loadSleeperWeek = (season: number, week: number) =>
  unstable_cache(
    async (): Promise<SleeperProjection[]> => {
      const raw = await getSleeperProjections(season, week).catch((e) => (console.error("sleeper", e), [] as SleeperProjection[]));
      return raw
        .filter((p) => p.stats && Object.keys(p.stats).length > 0)
        .map((p) => ({
          player_id: p.player_id,
          week: p.week,
          season: p.season,
          category: p.category,
          team: p.team ?? null,
          opponent: p.opponent ?? null,
          stats: p.stats,
          player: p.player
            ? { first_name: p.player.first_name ?? null, last_name: p.player.last_name ?? null, position: p.player.position ?? null, team: p.player.team ?? null, injury_status: p.player.injury_status ?? null }
            : null,
        }));
    },
    ["sleeper-proj", String(season), String(week)],
    { revalidate: 3600 },
  )();

// ---------- projection context ----------

export type WeekProjections = {
  ctx: ProjectionContext;
  bySource: ProjectionsBySource;
  freeAgents: LeaguePlayer[];
  sleeperCoverage: number;
  usageCoverage: number;
};

export async function projectWeek(bundle: LeagueBundle, opts: { includeFreeAgents?: boolean } = {}): Promise<WeekProjections> {
  const { creds, league, season, week, settings } = bundle;
  const includeFA = opts.includeFreeAgents ?? true;
  const [freeAgents, proTeams, sleeperRaw, odds] = await Promise.all([
    includeFA ? loadFreeAgents(creds, week) : Promise.resolve([] as LeaguePlayer[]),
    loadProTeams(season),
    loadSleeperWeek(season, week),
    loadOdds(season, week),
  ]);

  const players = new Map<number, LeaguePlayer>();
  for (const p of allRosteredPlayers(league)) players.set(p.espnId, p);
  for (const p of freeAgents) if (!players.has(p.espnId)) players.set(p.espnId, p);
  const ids = [...players.keys()];

  // Sleeper -> ESPN id map and usage rows (both need the DB; degrade gracefully without it).
  const db = getDb();
  let sleeper = new Map<number, SleeperProjectionLite>();
  const usage = new Map<number, UsageRow[]>();
  let dvpRows: UsageRow[] = [];
  if (db) {
    try {
      const idMap = await loadPlayerIdMap(db);
      sleeper = buildSleeperMap(sleeperRaw, idMap, players);
      const rows = await getRecentUsage(db, season, week, { lookbackWeeks: 4, includePriorSeason: week <= 3 });
      dvpRows = rows;
      const byGsis = new Map<string, number>();
      for (const row of idMap.byGsis.values()) if (row.gsisId) byGsis.set(row.gsisId, row.espnId);
      for (const r of rows) {
        const espnId = byGsis.get(r.gsisId);
        if (espnId == null) continue;
        const arr = usage.get(espnId) ?? [];
        arr.push(r);
        usage.set(espnId, arr);
      }
    } catch (e) {
      console.error("projection context db step failed", e);
    }
  } else {
    // Without a DB we can still match Sleeper by name/position.
    sleeper = buildSleeperMap(sleeperRaw, { bySleeper: new Map(), byGsis: new Map(), byEspn: new Map() }, players);
  }

  const dvp = computeDvp(dvpRows);
  const ctx: ProjectionContext = {
    season,
    week,
    scoringItems: league.scoringItems,
    league,
    players,
    proTeams,
    sleeper,
    usage,
    consensusWeights: settings.consensusWeights as ProjectionContext["consensusWeights"],
    finalWeek: league.finalWeek,
    odds,
  };
  const bySource = await projectAll(ctx, ids, (position: Position, opponentProTeamId) =>
    opponentProTeamId == null ? 1 : dvpFactor(dvp, position, PRO_TEAM[opponentProTeamId] ?? ""),
  );
  return {
    ctx,
    bySource,
    freeAgents,
    sleeperCoverage: ids.length ? bySource.sleeper.size / ids.length : 0,
    usageCoverage: ids.length ? [...usage.keys()].filter((id) => players.has(id)).length / ids.length : 0,
  };
}

/** Per-player lookup helper for UI tables. */
export function projRow(bySource: ProjectionsBySource, id: number): Record<keyof ProjectionsBySource, PlayerProjection | undefined> {
  return { espn: bySource.espn.get(id), sleeper: bySource.sleeper.get(id), custom: bySource.custom.get(id), consensus: bySource.consensus.get(id) };
}

/** Persist a projection snapshot for the accuracy tracker. */
export async function saveProjectionSnapshot(season: number, week: number, bySource: ProjectionsBySource, skipIds = new Set<number>()) {
  const db = getDb();
  if (!db) return 0;
  const rows: (typeof schema.projections.$inferInsert)[] = [];
  for (const [source, map] of Object.entries(bySource) as [keyof ProjectionsBySource, Map<number, PlayerProjection>][]) {
    for (const p of map.values()) {
      if (skipIds.has(p.espnId)) continue;
      rows.push({ season, week, espnId: p.espnId, source, points: p.points.toFixed(2), sd: p.sd.toFixed(2), rawStats: p.rawStats ?? null, isFinal: true, snapshotAt: new Date() });
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await db
      .insert(schema.projections)
      .values(chunk)
      .onConflictDoUpdate({
        target: [schema.projections.season, schema.projections.week, schema.projections.espnId, schema.projections.source, schema.projections.isFinal],
        set: { points: schema.projections.points, sd: schema.projections.sd, rawStats: schema.projections.rawStats, snapshotAt: new Date() },
      });
  }
  return rows.length;
}

export async function loadFinalProjections(season: number, week: number, ids?: number[]) {
  const db = getDb();
  if (!db) return [];
  const where = ids?.length
    ? and(eq(schema.projections.season, season), eq(schema.projections.week, week), eq(schema.projections.isFinal, true), inArray(schema.projections.espnId, ids))
    : and(eq(schema.projections.season, season), eq(schema.projections.week, week), eq(schema.projections.isFinal, true));
  return db.select().from(schema.projections).where(where);
}
