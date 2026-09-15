import type { Position } from "../espn/constants";
import type { ScoringItem } from "../espn/schemas";
import type { LeaguePlayer, LeagueSnapshot } from "../league/types";
import type { UsageRow } from "../db/schema";
import type { ProTeamInfo } from "../espn/client";
import type { TeamOdds } from "../espn/odds";

export type SourceId = "espn" | "sleeper" | "custom" | "consensus";
export const SOURCE_IDS: SourceId[] = ["espn", "sleeper", "custom", "consensus"];
export const SOURCE_LABELS: Record<SourceId, string> = { espn: "ESPN", sleeper: "Sleeper", custom: "Model", consensus: "Consensus" };

export type PlayerProjection = {
  espnId: number;
  week: number;
  points: number;
  /** Standard deviation of weekly outcome, in league points. */
  sd: number;
  rawStats?: Record<string, number>;
  meta?: Record<string, unknown>;
};

/** Sleeper projection re-keyed by ESPN id, with raw stat keys in Sleeper's vocabulary. */
export type SleeperProjectionLite = {
  sleeperId: string;
  espnId: number | null;
  week: number;
  stats: Record<string, number>;
  opponent?: string;
  injuryStatus?: string | null;
};

export type ProjectionContext = {
  season: number;
  week: number;
  scoringItems: ScoringItem[];
  league: LeagueSnapshot;
  /** Every player we know about this week (rostered + free agents), keyed by espnId. */
  players: Map<number, LeaguePlayer>;
  /** proTeamId -> schedule/bye info. */
  proTeams: Record<number, ProTeamInfo>;
  /** Sleeper projections for the week keyed by espnId (empty when unavailable). */
  sleeper: Map<number, SleeperProjectionLite>;
  /** nflverse usage rows for the recent weeks (this and/or last season), keyed by espnId. */
  usage: Map<number, UsageRow[]>;
  /** Per-position consensus weights from the accuracy tracker; falls back to defaults. */
  consensusWeights?: Record<string, Partial<Record<SourceId, number>>>;
  /** Weeks the season has that count (usually 17 or 18). */
  finalWeek: number;
  /** Vegas lines keyed by proTeamId (empty when unavailable). */
  odds?: Record<number, TeamOdds>;
};

export interface ProjectionSource {
  id: SourceId;
  label: string;
  project(ctx: ProjectionContext, espnIds: number[]): Promise<Map<number, PlayerProjection>>;
}

export type ProjectionsBySource = Record<SourceId, Map<number, PlayerProjection>>;

export function isOnBye(ctx: ProjectionContext, proTeamId: number, week = ctx.week): boolean {
  const t = ctx.proTeams[proTeamId];
  if (!t) return false;
  if (t.byeWeek === week) return true;
  // No game scheduled that week is also a bye.
  return Object.keys(t.gamesByWeek).length > 0 && !t.gamesByWeek[week];
}

export const INJURY_MULTIPLIER: Record<string, number> = {
  ACTIVE: 1,
  NORMAL: 1,
  PROBABLE: 1,
  DAY_TO_DAY: 0.9,
  QUESTIONABLE: 0.85,
  DOUBTFUL: 0.3,
  OUT: 0,
  INJURY_RESERVE: 0,
  IR: 0,
  SUSPENSION: 0,
  SUSPENDED: 0,
  PUP: 0,
};

export function injuryMultiplier(status: string | undefined): number {
  if (!status) return 1;
  return INJURY_MULTIPLIER[status.toUpperCase()] ?? 1;
}

export const POSITION_SD: Record<Position, number> = { QB: 7, RB: 6.5, WR: 6.5, TE: 5, K: 4, DST: 5 };
