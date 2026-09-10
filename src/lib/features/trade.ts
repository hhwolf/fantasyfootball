/**
 * Trade evaluation (pure). Compares rest-of-season value and value over
 * replacement (VORP = ROS total - positional replacement level) of the
 * players given vs received, and the change in this week's optimal lineup.
 */
import type { Position } from "../espn/constants";
import type { LeaguePlayer } from "../league/types";
import { optimizeLineup } from "./optimizer";
import { restOfSeasonValue, type ValueContext } from "./replacement";

export type TradeSide = { give: LeaguePlayer[]; get: LeaguePlayer[] };

export type TradeVerdict = "accept" | "fair" | "reject";

export type TradeEvaluation = {
  giveRos: number;
  getRos: number;
  giveVorp: number;
  getVorp: number;
  netRos: number;
  netVorp: number;
  lineupBefore: number;
  lineupAfter: number;
  lineupDelta: number;
  verdict: TradeVerdict;
  rationale: string;
};

/** netVorp above this => accept; below the negative => reject. */
export const VERDICT_THRESHOLD = 5;

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

export function evaluateTrade(
  myRoster: LeaguePlayer[],
  side: TradeSide,
  slotCounts: Record<number, number>,
  ctx: ValueContext,
  replacement: Record<Position, number>,
): TradeEvaluation {
  const ros = (p: LeaguePlayer) => restOfSeasonValue(p, ctx).total;
  const vorp = (p: LeaguePlayer) => ros(p) - (replacement[p.position] ?? 0);

  const giveRos = sum(side.give.map(ros));
  const getRos = sum(side.get.map(ros));
  const giveVorp = sum(side.give.map(vorp));
  const getVorp = sum(side.get.map(vorp));
  const netRos = getRos - giveRos;
  const netVorp = getVorp - giveVorp;

  const giveIds = new Set(side.give.map((p) => p.espnId));
  const afterRoster = [...myRoster.filter((p) => !giveIds.has(p.espnId)), ...side.get.map((p) => ({ ...p, lineupSlotId: undefined }))];
  const lineupBefore = optimizeLineup(myRoster, slotCounts, ctx.weekProj).total;
  const lineupAfter = optimizeLineup(afterRoster, slotCounts, ctx.weekProj).total;
  const lineupDelta = lineupAfter - lineupBefore;

  const verdict: TradeVerdict =
    netVorp > VERDICT_THRESHOLD ? "accept" : netVorp < -VERDICT_THRESHOLD ? "reject" : "fair";

  const sign = (n: number) => (n >= 0 ? "+" : "-") + round1(Math.abs(n));
  const rationale =
    verdict === "accept"
      ? `You gain ${sign(netVorp)} rest-of-season value over replacement and ${sign(lineupDelta)} projected points in this week's lineup.`
      : verdict === "reject"
        ? `You give up ${round1(Math.abs(netVorp))} rest-of-season value over replacement (${sign(lineupDelta)} to this week's lineup).`
        : `Roughly even: ${sign(netVorp)} value over replacement rest-of-season and ${sign(lineupDelta)} to this week's lineup.`;

  return { giveRos, getRos, giveVorp, getVorp, netRos, netVorp, lineupBefore, lineupAfter, lineupDelta, verdict, rationale };
}
