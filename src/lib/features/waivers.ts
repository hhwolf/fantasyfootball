/**
 * Waiver / free-agent suggestions (pure).
 *
 * For every free agent we find the weakest droppable roster player it could
 * replace (same position; RB/WR/TE may also displace each other when the FA
 * is clearly better), measure the next-3-weeks value gain, and check whether
 * the pickup would actually start this week.
 */
import { SLOT } from "../espn/constants";
import type { LeaguePlayer } from "../league/types";
import { expandSlots, isEligible, optimizeLineup } from "./optimizer";
import { nextNWeeksValue, restOfSeasonValue, weeklyValue, type ValueContext } from "./replacement";

export type WaiverSuggestion = {
  player: LeaguePlayer;
  /** This week's value. */
  valueNow: number;
  /** Sum of the next 3 weeks' value. */
  valueNext3: number;
  /** Rest-of-season total. */
  ros: number;
  /** Suggested drop, or null when the roster has no droppable player for that position. */
  replaces: LeaguePlayer | null;
  /** valueNext3(fa) - valueNext3(replaces); equals valueNext3(fa) when replaces is null. */
  delta: number;
  /** Whether the FA would start this week in the optimized lineup after the swap. */
  startsThisWeek: boolean;
  /** Optimized lineup total after swap minus before. */
  lineupGain: number;
};

export type WaiverOptions = { limit?: number };

const FLEX_POSITIONS = new Set(["RB", "WR", "TE"]);
/** Minimum next-3 advantage required for a cross-position (RB/WR/TE) drop. */
const CROSS_POSITION_MARGIN = 3;
const MIN_RESULTS = 10;

export function suggestWaivers(
  freeAgents: LeaguePlayer[],
  myRoster: LeaguePlayer[],
  slotCounts: Record<number, number>,
  ctx: ValueContext,
  opts?: WaiverOptions,
): WaiverSuggestion[] {
  const limit = opts?.limit ?? 25;
  const rosteredIds = new Set(myRoster.map((p) => p.espnId));

  const droppable = myRoster.filter((p) => p.lineupSlotId !== SLOT.IR);
  const dropValue = new Map<number, number>(droppable.map((p) => [p.espnId, nextNWeeksValue(p, ctx, 3)]));
  const startingSlots = expandSlots(slotCounts);
  const rosterSpots = Object.entries(slotCounts).reduce((n, [slot, count]) => (Number(slot) === SLOT.IR ? n : n + count), 0);
  const hasOpenSpot = myRoster.filter((p) => p.lineupSlotId !== SLOT.IR).length < rosterSpots;
  /** Two players compete for a roster spot when some starting slot accepts both. */
  const sharesSlot = (a: LeaguePlayer, b: LeaguePlayer) => startingSlots.some((slot) => isEligible(a, slot) && isEligible(b, slot));

  const baseline = optimizeLineup(myRoster, slotCounts, ctx.weekProj).total;

  const suggestions: WaiverSuggestion[] = [];
  for (const fa of freeAgents) {
    if (rosteredIds.has(fa.espnId)) continue;
    if (!startingSlots.some((slot) => isEligible(fa, slot))) continue; // nowhere to play them in this league
    const valueNext3 = nextNWeeksValue(fa, ctx, 3);
    const hasSamePos = droppable.some((p) => p.position === fa.position);

    let replaces: LeaguePlayer | null = null;
    let replacesValue = Infinity;
    for (const p of droppable) {
      const v = dropValue.get(p.espnId) ?? 0;
      const samePos = p.position === fa.position;
      // Cross-position drops: RB/WR/TE may swap for one another when the gain is clear. If the
      // roster carries nobody at the FA's position, anyone competing for the same starting slot
      // is a candidate with no margin required (e.g. a TE in a FLEX-only league).
      const cross =
        !samePos &&
        ((FLEX_POSITIONS.has(fa.position) && FLEX_POSITIONS.has(p.position) && valueNext3 - v >= CROSS_POSITION_MARGIN) || (!hasSamePos && sharesSlot(fa, p)));
      if (!samePos && !cross) continue;
      if (v < replacesValue) {
        replacesValue = v;
        replaces = p;
      }
    }
    // Roster is full and nobody competes for the FA's slot: drop the least valuable player anyway.
    if (!replaces && !hasOpenSpot && droppable.length) {
      for (const p of droppable) {
        const v = dropValue.get(p.espnId) ?? 0;
        if (v < replacesValue) {
          replacesValue = v;
          replaces = p;
        }
      }
    }
    const delta = replaces ? valueNext3 - replacesValue : valueNext3;

    const newRoster = replaces ? myRoster.filter((p) => p.espnId !== replaces!.espnId) : [...myRoster];
    newRoster.push({ ...fa, lineupSlotId: SLOT.BENCH });
    const after = optimizeLineup(newRoster, slotCounts, ctx.weekProj);

    suggestions.push({
      player: fa,
      valueNow: weeklyValue(fa, ctx.currentWeek, ctx),
      valueNext3,
      ros: restOfSeasonValue(fa, ctx).total,
      replaces,
      delta,
      startsThisWeek: after.starters.some((s) => s.espnId === fa.espnId),
      lineupGain: after.total - baseline,
    });
  }

  suggestions.sort((a, b) => b.delta - a.delta || b.lineupGain - a.lineupGain);
  const positive = suggestions.filter((s) => s.delta > 0);
  if (positive.length < MIN_RESULTS) return suggestions.slice(0, Math.min(MIN_RESULTS, limit));
  return positive.slice(0, limit);
}
