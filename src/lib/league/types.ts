import type { Position } from "../espn/constants";
import type { ScoringItem } from "../espn/schemas";

export type StatLine = {
  season: number;
  week: number; // 0 = season total
  projected: boolean;
  points: number;
  raw: Record<string, number>;
};

export type LeaguePlayer = {
  espnId: number;
  name: string;
  position: Position;
  proTeamId: number;
  proTeam: string;
  eligibleSlots: number[];
  injuryStatus: string;
  percentOwned?: number;
  /** ESPN projected points for the requested week (statSourceId 1, split 1). */
  espnWeekProj?: number;
  /** ESPN projected season total. */
  espnSeasonProj?: number;
  /** Actual points for the requested week, if the game has been played. */
  weekActual?: number;
  seasonActual?: number;
  lastSeasonActual?: number;
  stats: StatLine[];
  /** For rostered players. */
  lineupSlotId?: number;
  teamId?: number;
  status?: string; // FREEAGENT | WAIVERS | ONTEAM
};

export type LeagueTeam = {
  id: number;
  name: string;
  abbrev: string;
  ownerName?: string;
  logo?: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  roster: LeaguePlayer[];
};

export type LeagueMatchup = {
  id: number;
  matchupPeriodId: number;
  homeTeamId?: number;
  awayTeamId?: number;
  homePoints?: number;
  awayPoints?: number;
  winner?: string;
};

export type LeagueSnapshot = {
  leagueId: number;
  leagueName: string;
  season: number;
  /** Current NFL scoring period per ESPN. */
  currentWeek: number;
  /** The week these rosters/stats were fetched for. */
  week: number;
  finalWeek: number;
  slotCounts: Record<number, number>;
  scoringItems: ScoringItem[];
  teams: LeagueTeam[];
  schedule: LeagueMatchup[];
  fetchedAt: string;
};
