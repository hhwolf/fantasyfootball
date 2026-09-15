import { STAT, type Position } from "../espn/constants";
import type { ScoringItem } from "../espn/schemas";
import { receptionPoints, scoreStats } from "../espn/scoring";

/**
 * Primary Sleeper stat key -> ESPN stat id. Several Sleeper keys may map to the same ESPN id
 * (they are summed). Keys that must also be written to a second ESPN id are listed in
 * SLEEPER_TO_ESPN_STAT_EXTRA.
 */
export const SLEEPER_TO_ESPN_STAT: Record<string, number> = {
  // Passing
  pass_att: STAT.PASS_ATT,
  pass_cmp: STAT.PASS_COMP,
  pass_inc: STAT.PASS_INC,
  pass_yd: STAT.PASS_YDS,
  pass_td: STAT.PASS_TD,
  pass_int: STAT.PASS_INT,
  pass_2pt: STAT.PASS_2PT,
  // Rushing
  rush_att: STAT.RUSH_ATT,
  rush_yd: STAT.RUSH_YDS,
  rush_td: STAT.RUSH_TD,
  rush_2pt: STAT.RUSH_2PT,
  // Receiving
  rec: STAT.REC,
  rec_yd: STAT.REC_YDS,
  rec_td: STAT.REC_TD,
  rec_2pt: STAT.REC_2PT,
  rec_tgt: STAT.TARGETS,
  // Fumbles
  fum_lost: STAT.FUM_LOST,
  fum: STAT.FUM,
  // Kicking
  xpm: STAT.XP_MADE,
  xpmiss: STAT.XP_MISS,
  fgm_0_19: STAT.FG_0_39,
  fgm_20_29: STAT.FG_0_39,
  fgm_30_39: STAT.FG_0_39,
  fgm_40_49: STAT.FG_40_49,
  fgm_50_59: STAT.FG_50_59,
  fgm_60p: STAT.FG_60_PLUS,
  fgm_50p: STAT.FG_50_59, // projections often use a single 50+ bucket
  fgmiss: STAT.FG_MISS,
  fgmiss_0_19: STAT.FG_MISS_U40,
  fgmiss_20_29: STAT.FG_MISS_U40,
  fgmiss_30_39: STAT.FG_MISS_U40,
  fgmiss_40_49: STAT.FG_MISS_40_49,
  fgmiss_50p: STAT.FG_MISS_50_PLUS,
  fgm: STAT.FG_MADE,
  fga: STAT.FG_ATT,
  xpa: STAT.XP_ATT,
  fgm_yds: STAT.FG_YDS,
  // Defense / special teams
  sack: STAT.DST_SACK,
  int: STAT.DST_INT,
  fum_rec: STAT.DST_FUM_REC,
  def_td: STAT.DST_TD,
  blk_kick: STAT.DST_BLOCK_KICK,
  safe: STAT.DST_SAFETY,
  ff: STAT.DST_FORCED_FUM,
  def_kr_td: STAT.DST_KR_TD,
  def_pr_td: STAT.DST_PR_TD,
  def_fum_td: STAT.DST_FUM_RET_TD,
  pass_int_td: STAT.DST_INT_RET_TD,
  def_kr_yd: STAT.DST_KR_YDS,
  def_pr_yd: STAT.DST_PR_YDS,
  pts_allow: STAT.DST_PTS_ALLOWED,
  yds_allow: STAT.DST_YDS_ALLOWED,
  pts_allow_0: STAT.DST_PA_0,
  pts_allow_1_6: STAT.DST_PA_1_6,
  pts_allow_7_13: STAT.DST_PA_7_13,
  pts_allow_14_20: STAT.DST_PA_14_17, // approx: ESPN splits 14-17 / 18-21
  pts_allow_21_27: STAT.DST_PA_22_27, // approx
  pts_allow_28_34: STAT.DST_PA_28_34,
  pts_allow_35p: STAT.DST_PA_35_45,
  yds_allow_0_100: STAT.DST_YA_LT_100,
  yds_allow_100_199: STAT.DST_YA_100_199,
  yds_allow_200_299: STAT.DST_YA_200_299,
  yds_allow_350_399: STAT.DST_YA_350_399,
  yds_allow_400_449: STAT.DST_YA_400_449,
  yds_allow_450_499: STAT.DST_YA_450_499,
  yds_allow_500_549: STAT.DST_YA_500_549,
  yds_allow_550p: STAT.DST_YA_550_PLUS,
};

/** Additional ESPN ids that also receive the value of a Sleeper key. */
export const SLEEPER_TO_ESPN_STAT_EXTRA: Record<string, readonly number[]> = {
  rec: [STAT.REC_ALT],
  fgm_50_59: [STAT.FG_50_PLUS],
  fgm_60p: [STAT.FG_50_PLUS],
  fgm_50p: [STAT.FG_50_PLUS],
};

/** All ESPN stat ids a Sleeper key writes to. */
export function espnIdsForSleeperKey(key: string): number[] {
  const primary = SLEEPER_TO_ESPN_STAT[key];
  if (primary === undefined) return [];
  return [primary, ...(SLEEPER_TO_ESPN_STAT_EXTRA[key] ?? [])];
}

/**
 * Convert a Sleeper stat line into an ESPN statId-keyed raw line.
 * Also derives ESPN's yardage-bonus stats (which Sleeper lacks) from the yardage values.
 */
export function sleeperStatsToEspn(stats: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    for (const id of espnIdsForSleeperKey(key)) {
      out[id] = (out[id] ?? 0) + value;
    }
  }

  const passYds = stats.pass_yd ?? 0;
  if (passYds >= 400) out[STAT.PASS_400_PLUS] = 1;
  else if (passYds >= 300) out[STAT.PASS_300_399] = 1;

  const rushYds = stats.rush_yd ?? 0;
  if (rushYds >= 200) out[STAT.RUSH_200_PLUS] = 1;
  else if (rushYds >= 100) out[STAT.RUSH_100_199] = 1;

  const recYds = stats.rec_yd ?? 0;
  if (recYds >= 200) out[STAT.REC_200_PLUS] = 1;
  else if (recYds >= 100) out[STAT.REC_100_199] = 1;

  return out;
}

/** Pick Sleeper's precomputed total that best matches this league's reception scoring. */
export function sleeperFallbackPoints(stats: Record<string, number>, scoringItems: ScoringItem[]): number | undefined {
  const ppr = receptionPoints(scoringItems);
  const key = ppr >= 0.95 ? "pts_ppr" : ppr >= 0.4 ? "pts_half_ppr" : "pts_std";
  const v = stats[key] ?? stats.pts_ppr ?? stats.pts_half_ppr ?? stats.pts_std;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export type SleeperScore = { points: number; method: "rescored" | "fallback" };

/**
 * Score a Sleeper projection using the league's ESPN scoring settings.
 * Falls back to Sleeper's own pts_* total when nothing in the line maps to ESPN ids, or when a
 * K / D/ST re-score lands far below Sleeper's standard total (league uses stats we cannot map).
 */
export function scoreSleeperProjectionDetailed(stats: Record<string, number>, scoringItems: ScoringItem[], position?: Position): SleeperScore {
  const line = sleeperStatsToEspn(stats);
  if (Object.keys(line).length === 0) {
    return { points: sleeperFallbackPoints(stats, scoringItems) ?? 0, method: "fallback" };
  }
  const scored = scoreStats(line, scoringItems, position);
  if ((position === "K" || position === "DST") && typeof stats.pts_std === "number" && stats.pts_std > 0 && scored < 0.5 * stats.pts_std) {
    return { points: stats.pts_std, method: "fallback" };
  }
  return { points: scored, method: "rescored" };
}

export function scoreSleeperProjection(stats: Record<string, number>, scoringItems: ScoringItem[], position?: Position): number {
  return scoreSleeperProjectionDetailed(stats, scoringItems, position).points;
}
