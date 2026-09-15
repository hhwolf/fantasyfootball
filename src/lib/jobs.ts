import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { computeAccuracy, type AccuracyInput } from "./accuracy/compute";
import { deriveConsensusWeights, type WeeklyAccuracy } from "./accuracy/weights";
import { getDb, schema } from "./db";
import { NotConfiguredError, loadLeague, loadProTeams, projectWeek, resolveSeasonWeek, saveProjectionSnapshot } from "./data";
import { loadUsageWithFallback } from "./nflverse/loader";
import { syncSleeperPlayers } from "./sleeper/players";
import { syncNflversePlayerIds } from "./nflverse/players";
import { loadSettings, saveConsensusWeights } from "./settings";
import type { Position } from "./espn/constants";
import type { SourceId } from "./projections/types";
import { allRosteredPlayers } from "./league/snapshot";

export type JobResult = { job: string; ok: boolean; detail?: unknown; error?: string };

async function run(job: string, fn: () => Promise<unknown>): Promise<JobResult> {
  try {
    const detail = await fn();
    return { job, ok: true, detail };
  } catch (err) {
    if (err instanceof NotConfiguredError) return { job, ok: true, detail: { skipped: "league not configured" } };
    console.error(`job ${job} failed`, err);
    return { job, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Refresh the league cache from ESPN. */
export const refreshLeague = () =>
  run("refreshLeague", async () => {
    revalidateTag("league");
    const b = await loadLeague();
    return { week: b.week, teams: b.league.teams.length, stale: b.stale };
  });

/** Snapshot projections for the current week, skipping players whose game already kicked off. */
export const snapshotProjections = () =>
  run("snapshotProjections", async () => {
    const bundle = await loadLeague();
    const { bySource, ctx } = await projectWeek(bundle);
    const proTeams = await loadProTeams(bundle.season);
    const now = Date.now();
    const skip = new Set<number>();
    for (const p of ctx.players.values()) {
      const kickoff = proTeams[p.proTeamId]?.gamesByWeek[bundle.week]?.date;
      if (kickoff && kickoff < now) skip.add(p.espnId);
    }
    const n = await saveProjectionSnapshot(bundle.season, bundle.week, bySource, skip);
    return { week: bundle.week, saved: n, skipped: skip.size };
  });

/** Record actuals for a completed week and recompute accuracy + consensus weights. */
export const recordActuals = (weekOverride?: number) =>
  run("recordActuals", async () => {
    const db = getDb();
    if (!db) return { skipped: "no database" };
    const current = await loadLeague();
    const week = weekOverride ?? current.currentWeek - 1;
    if (week < 1) return { skipped: "season has not started" };
    const bundle = await loadLeague(week);
    const { freeAgents } = await projectWeek(bundle, { includeFreeAgents: true });
    const players = [...allRosteredPlayers(bundle.league), ...freeAgents];
    const rows = players
      .filter((p) => p.weekActual != null)
      .map((p) => ({ season: bundle.season, week, espnId: p.espnId, points: p.weekActual!.toFixed(2), rawStats: p.stats.find((s) => !s.projected && s.season === bundle.season && s.week === week)?.raw ?? null, updatedAt: new Date() }));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await db
        .insert(schema.actuals)
        .values(chunk)
        .onConflictDoUpdate({ target: [schema.actuals.season, schema.actuals.week, schema.actuals.espnId], set: { points: sql`excluded.points`, rawStats: sql`excluded.raw_stats`, updatedAt: new Date() } });
    }
    const acc = await recomputeAccuracy(bundle.season, week);
    return { week, actuals: rows.length, accuracyGroups: acc };
  });

export async function recomputeAccuracy(season: number, week: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const proj = await db.select().from(schema.projections).where(and(eq(schema.projections.season, season), eq(schema.projections.week, week), eq(schema.projections.isFinal, true)));
  if (!proj.length) return 0;
  const ids = [...new Set(proj.map((p) => p.espnId))];
  const [acts, plist] = await Promise.all([
    db.select().from(schema.actuals).where(and(eq(schema.actuals.season, season), eq(schema.actuals.week, week), inArray(schema.actuals.espnId, ids))),
    db.select().from(schema.players).where(inArray(schema.players.espnId, ids)),
  ]);
  const actual = new Map(acts.map((a) => [a.espnId, Number(a.points)]));
  const pos = new Map(plist.map((p) => [p.espnId, p.position as Position]));
  const inputs: AccuracyInput[] = [];
  for (const p of proj) {
    const a = actual.get(p.espnId);
    const position = pos.get(p.espnId);
    if (a == null || !position) continue;
    inputs.push({ espnId: p.espnId, position, source: p.source as SourceId, projected: Number(p.points), actual: a });
  }
  const stats = computeAccuracy(inputs);
  for (const s of stats) {
    await db
      .insert(schema.accuracy)
      .values({ season, week, source: s.source, position: s.position, n: s.n, mae: s.mae.toFixed(3), rmse: s.rmse.toFixed(3), bias: s.bias.toFixed(3) })
      .onConflictDoUpdate({
        target: [schema.accuracy.season, schema.accuracy.week, schema.accuracy.source, schema.accuracy.position],
        set: { n: s.n, mae: s.mae.toFixed(3), rmse: s.rmse.toFixed(3), bias: s.bias.toFixed(3) },
      });
  }
  const all = await db.select().from(schema.accuracy).where(eq(schema.accuracy.season, season));
  const weights = deriveConsensusWeights(all.map((r): WeeklyAccuracy => ({ week: r.week, source: r.source as SourceId, position: r.position as Position | "ALL", n: r.n, rmse: Number(r.rmse) })));
  if (weights) await saveConsensusWeights(weights);
  return stats.length;
}

/** Weekly reference data: Sleeper id crosswalk + nflverse usage. */
export const refreshReferenceData = () =>
  run("refreshReferenceData", async () => {
    const db = getDb();
    if (!db) return { skipped: "no database" };
    // Reference data is league-independent, so this must work before a league is configured.
    const settings = await loadSettings();
    const { season } = await resolveSeasonWeek(settings);
    const players = await syncSleeperPlayers(db);
    const nflverseIds = await syncNflversePlayerIds(db).catch((e) => (console.error("nflverse ids", e), 0));
    const usage = await loadUsageWithFallback(db, season);
    return { season, players, nflverseIds, usage };
  });

/**
 * Daily cron entry point (Vercel Hobby allows one run per day). Branches on the UTC weekday.
 * Tue: actuals + accuracy + reference data. Thu/Sat/Sun/Mon: projection snapshots. Always: refresh league.
 */
export async function runDailyJobs(date = new Date(), force?: string[]): Promise<JobResult[]> {
  const day = date.getUTCDay(); // 0 Sun .. 6 Sat
  const results: JobResult[] = [];
  const want = (name: string, when: boolean) => force?.includes(name) || (!force?.length && when);
  if (want("refreshLeague", true)) results.push(await refreshLeague());
  if (want("refreshReferenceData", day === 2)) results.push(await refreshReferenceData());
  if (want("recordActuals", day === 2)) results.push(await recordActuals());
  if (want("snapshotProjections", [0, 1, 4, 6].includes(day))) results.push(await snapshotProjections());
  return results;
}
