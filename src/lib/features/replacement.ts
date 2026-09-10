/**
 * Player value over time (pure): per-week value, rest-of-season value,
 * next-N-weeks value, and positional replacement levels from the FA pool.
 *
 * Weekly value rules (see `weeklyValue`):
 *  1. Bye week => 0.
 *  2. `week === currentWeek` and a projection exists in `weekProj` => that
 *     projection's points, used as-is (projection sources are expected to
 *     have already baked in injury status).
 *  3. Otherwise a per-game rate: (espnSeasonProj - seasonActual) / remaining
 *     non-bye games from currentWeek..finalWeek (min 1, clamped at >= 0).
 *     If espnSeasonProj is missing, fall back to the current-week projection
 *     (or 0) as the rate.
 *
 * Injury heuristic (documented, deliberately simple):
 *  - OUT / INJURY_RESERVE / SUSPENSION (and aliases) zero the next 3 weeks
 *    (currentWeek .. currentWeek+2), regardless of source.
 *  - QUESTIONABLE / DOUBTFUL apply `injuryMultiplier` to rate-based values
 *    for the next 2 weeks (currentWeek .. currentWeek+1) only. The explicit
 *    current-week projection is not re-multiplied.
 *  - Weeks beyond those windows assume the player is healthy.
 */
import { POSITIONS, type Position } from "../espn/constants";
import type { LeaguePlayer } from "../league/types";
import { injuryMultiplier, type PlayerProjection } from "../projections/types";

export type ValueContext = {
  currentWeek: number;
  finalWeek: number;
  /** Projections for `currentWeek` only, keyed by espnId. */
  weekProj: Map<number, PlayerProjection>;
  byeWeekOf: (proTeamId: number) => number | undefined;
};

export type RosValue = { espnId: number; weekly: Record<number, number>; total: number };

const ZERO_STATUSES = new Set(["OUT", "INJURY_RESERVE", "IR", "SUSPENSION", "SUSPENDED", "PUP"]);
const REDUCED_STATUSES = new Set(["QUESTIONABLE", "DOUBTFUL"]);
const OUT_WINDOW = 3;
const REDUCED_WINDOW = 2;

function isBye(player: LeaguePlayer, week: number, ctx: ValueContext): boolean {
  return ctx.byeWeekOf(player.proTeamId) === week;
}

/** Count of non-bye weeks in currentWeek..finalWeek (min 1). */
function remainingGames(player: LeaguePlayer, ctx: ValueContext): number {
  let n = 0;
  for (let w = ctx.currentWeek; w <= ctx.finalWeek; w++) if (!isBye(player, w, ctx)) n++;
  return Math.max(1, n);
}

function currentWeekProjPoints(player: LeaguePlayer, ctx: ValueContext): number | undefined {
  const p = ctx.weekProj.get(player.espnId);
  return p && Number.isFinite(p.points) ? p.points : undefined;
}

/** Healthy per-game rate for the remainder of the season. */
export function perGameRate(player: LeaguePlayer, ctx: ValueContext): number {
  if (player.espnSeasonProj !== undefined && Number.isFinite(player.espnSeasonProj)) {
    const remaining = player.espnSeasonProj - (player.seasonActual ?? 0);
    return Math.max(0, remaining / remainingGames(player, ctx));
  }
  return currentWeekProjPoints(player, ctx) ?? player.espnWeekProj ?? 0;
}

export function weeklyValue(player: LeaguePlayer, week: number, ctx: ValueContext): number {
  if (isBye(player, week, ctx)) return 0;
  const status = (player.injuryStatus ?? "").toUpperCase();
  const offset = week - ctx.currentWeek;

  if (ZERO_STATUSES.has(status) && offset >= 0 && offset < OUT_WINDOW) return 0;

  if (week === ctx.currentWeek) {
    const wp = currentWeekProjPoints(player, ctx);
    if (wp !== undefined) return wp;
  }

  let value = perGameRate(player, ctx);
  if (REDUCED_STATUSES.has(status) && offset >= 0 && offset < REDUCED_WINDOW) {
    value *= injuryMultiplier(status);
  }
  return value;
}

export function restOfSeasonValue(
  player: LeaguePlayer,
  ctx: ValueContext,
  fromWeek: number = ctx.currentWeek,
  toWeek: number = ctx.finalWeek,
): RosValue {
  const weekly: Record<number, number> = {};
  let total = 0;
  for (let w = fromWeek; w <= toWeek; w++) {
    const v = weeklyValue(player, w, ctx);
    weekly[w] = v;
    total += v;
  }
  return { espnId: player.espnId, weekly, total };
}

/** Sum of weekly values for currentWeek .. currentWeek+n-1 (capped at finalWeek). */
export function nextNWeeksValue(player: LeaguePlayer, ctx: ValueContext, n: number): number {
  const to = Math.min(ctx.finalWeek, ctx.currentWeek + Math.max(0, n) - 1);
  return restOfSeasonValue(player, ctx, ctx.currentWeek, to).total;
}

/** Value of a player under a horizon: 'ros' total or next-N-weeks sum. */
export function horizonValue(player: LeaguePlayer, ctx: ValueContext, weeks: "ros" | number): number {
  return weeks === "ros" ? restOfSeasonValue(player, ctx).total : nextNWeeksValue(player, ctx, weeks);
}

/** Best available free-agent value per position (0 if none). */
export function replacementLevels(
  freeAgents: LeaguePlayer[],
  ctx: ValueContext,
  weeks: "ros" | number,
): Record<Position, number> {
  const levels = Object.fromEntries(POSITIONS.map((p) => [p, 0])) as Record<Position, number>;
  for (const fa of freeAgents) {
    const v = horizonValue(fa, ctx, weeks);
    if (v > (levels[fa.position] ?? 0)) levels[fa.position] = v;
  }
  return levels;
}
