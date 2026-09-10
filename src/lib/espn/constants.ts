export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DST";
export const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];

/** ESPN `defaultPositionId` -> our position. */
export const POSITION_BY_DEFAULT_ID: Record<number, Position> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  /** ESPN "Team QB" pseudo-player (TQB leagues). Treated as a QB; its eligibleSlots restrict it to slot 1. */
  15: "QB",
  16: "DST",
};

/** Lineup slot ids used in `lineupSlotId`, `eligibleSlots`, and `lineupSlotCounts`. */
export const SLOT = {
  QB: 0,
  TQB: 1,
  RB: 2,
  RB_WR: 3,
  WR: 4,
  WR_TE: 5,
  TE: 6,
  OP: 7,
  DST: 16,
  K: 17,
  P: 18,
  HC: 19,
  BENCH: 20,
  IR: 21,
  FLEX: 23,
} as const;

export const SLOT_NAMES: Record<number, string> = {
  0: "QB",
  1: "TQB",
  2: "RB",
  3: "RB/WR",
  4: "WR",
  5: "WR/TE",
  6: "TE",
  7: "OP",
  8: "DT",
  9: "DE",
  10: "LB",
  11: "DL",
  12: "CB",
  13: "S",
  14: "DB",
  15: "DP",
  16: "D/ST",
  17: "K",
  18: "P",
  19: "HC",
  20: "Bench",
  21: "IR",
  23: "FLEX",
  24: "ER",
  25: "Rookie",
};

/** Slots that count toward starting lineup (not bench/IR). */
export const NON_STARTING_SLOTS = new Set<number>([SLOT.BENCH, SLOT.IR]);

/** Fallback eligibility by position when ESPN's eligibleSlots is absent. */
export const SLOT_ELIGIBLE_POSITIONS: Record<number, Position[]> = {
  0: ["QB"],
  1: ["QB"],
  2: ["RB"],
  3: ["RB", "WR"],
  4: ["WR"],
  5: ["WR", "TE"],
  6: ["TE"],
  7: ["QB", "RB", "WR", "TE"],
  16: ["DST"],
  17: ["K"],
  23: ["RB", "WR", "TE"],
};

export const PRO_TEAM: Record<number, string> = {
  0: "FA",
  1: "ATL",
  2: "BUF",
  3: "CHI",
  4: "CIN",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GB",
  10: "TEN",
  11: "IND",
  12: "KC",
  13: "LV",
  14: "LAR",
  15: "MIA",
  16: "MIN",
  17: "NE",
  18: "NO",
  19: "NYG",
  20: "NYJ",
  21: "PHI",
  22: "ARI",
  23: "PIT",
  24: "LAC",
  25: "SF",
  26: "SEA",
  27: "TB",
  28: "WSH",
  29: "CAR",
  30: "JAX",
  33: "BAL",
  34: "HOU",
};

export const PRO_TEAM_ID_BY_ABBR: Record<string, number> = Object.fromEntries(
  Object.entries(PRO_TEAM).map(([id, abbr]) => [abbr, Number(id)]),
);
// Alternate abbreviations used by Sleeper / nflverse.
PRO_TEAM_ID_BY_ABBR["WAS"] = 28;
PRO_TEAM_ID_BY_ABBR["JAC"] = 30;
PRO_TEAM_ID_BY_ABBR["LA"] = 14;
PRO_TEAM_ID_BY_ABBR["OAK"] = 13;
PRO_TEAM_ID_BY_ABBR["SD"] = 24;

/** ESPN D/ST pseudo player id. */
export const dstPlayerId = (proTeamId: number) => -16000 - proTeamId;

/** ESPN raw stat ids (subset used for re-scoring). Reference: cwendt94/espn-api constant.py */
export const STAT = {
  PASS_ATT: 0,
  PASS_COMP: 1,
  PASS_INC: 2,
  PASS_YDS: 3,
  PASS_TD: 4,
  PASS_40_TD: 15,
  PASS_50_TD: 16,
  PASS_300_399: 17,
  PASS_400_PLUS: 18,
  PASS_2PT: 19,
  PASS_INT: 20,
  RUSH_ATT: 23,
  RUSH_YDS: 24,
  RUSH_TD: 25,
  RUSH_2PT: 26,
  RUSH_40_TD: 35,
  RUSH_50_TD: 36,
  RUSH_100_199: 37,
  RUSH_200_PLUS: 38,
  REC_TD: 43,
  REC_2PT: 44,
  REC_YDS: 42,
  REC: 53,
  REC_ALT: 41,
  REC_40_TD: 45,
  REC_50_TD: 46,
  REC_100_199: 56,
  REC_200_PLUS: 57,
  TARGETS: 58,
  FUM_LOST: 72,
  FUM: 68,
  // Kicking
  FG_50_PLUS: 74,
  FG_40_49: 77,
  FG_0_39: 80,
  FG_MISS: 85,
  XP_MADE: 86,
  XP_MISS: 88,
  FG_60_PLUS: 201,
  FG_50_59: 198,
  FG_MISS_50_PLUS: 76,
  FG_MISS_40_49: 79,
  FG_MISS_U40: 82,
  FG_MADE: 83,
  FG_ATT: 84,
  XP_ATT: 87,
  FG_YDS: 214,
  // D/ST
  DST_PA_0: 89,
  DST_PA_1_6: 90,
  DST_PA_7_13: 91,
  DST_PA_14_17: 92,
  DST_BLOCK_KICK_TD: 93,
  DST_TD: 94,
  DST_INT: 95,
  DST_FUM_REC: 96,
  DST_BLOCK_KICK: 97,
  DST_SAFETY: 98,
  DST_SACK: 99,
  DST_KR_TD: 101,
  DST_PR_TD: 102,
  DST_FUM_RET_TD: 103,
  DST_INT_RET_TD: 104,
  DST_FORCED_FUM: 106,
  DST_KR_YDS: 114,
  DST_PR_YDS: 115,
  DST_PTS_ALLOWED: 120,
  DST_YDS_ALLOWED: 127,
  DST_PA_28_34: 123,
  DST_PA_35_45: 124,
  DST_PA_46_PLUS: 125,
  DST_PA_18_21: 121,
  DST_PA_22_27: 122,
  DST_YA_LT_100: 128,
  DST_YA_100_199: 129,
  DST_YA_200_299: 130,
  DST_YA_350_399: 132,
  DST_YA_400_449: 133,
  DST_YA_450_499: 134,
  DST_YA_500_549: 135,
  DST_YA_550_PLUS: 136,
} as const;

export const STAT_SOURCE = { ACTUAL: 0, PROJECTED: 1 } as const;
export const STAT_SPLIT = { SEASON: 0, WEEK: 1 } as const;

export type InjuryStatus =
  | "ACTIVE"
  | "QUESTIONABLE"
  | "DOUBTFUL"
  | "OUT"
  | "INJURY_RESERVE"
  | "SUSPENSION"
  | "NORMAL"
  | string;
