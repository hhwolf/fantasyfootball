/**
 * Matchup preview math (pure). Treats each starter's weekly outcome as an
 * independent normal with mean = projected points and the source's `sd`,
 * so a lineup is normal with mean = sum(mean_i), sd = sqrt(sum(sd_i^2)).
 */
import type { PlayerProjection } from "../projections/types";
import type { LineupAssignment, OptimizedLineup } from "./optimizer";

export type Distribution = { mean: number; sd: number };

/** Default per-player sd when the projection has none. */
const DEFAULT_SD = 6;

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 erf approximation
 * (max abs error ~1.5e-7).
 */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  const cdf = 0.5 * (1 + erf);
  return z >= 0 ? cdf : 1 - cdf;
}

/** Aggregate mean / sd for a set of starters. Missing projection => 0 points, sd 6. */
export function lineupDistribution(
  starters: LineupAssignment[],
  proj: Map<number, PlayerProjection>,
): Distribution {
  let mean = 0;
  let variance = 0;
  for (const s of starters) {
    const p = proj.get(s.espnId);
    const pts = p && Number.isFinite(p.points) ? p.points : 0;
    const sd = p && Number.isFinite(p.sd) ? p.sd : DEFAULT_SD;
    mean += pts;
    variance += sd * sd;
  }
  return { mean, sd: Math.sqrt(variance) };
}

/** P(A scores more than B), assuming independent normals. */
export function winProbability(a: Distribution, b: Distribution): number {
  const diff = a.mean - b.mean;
  const sd = Math.sqrt(a.sd * a.sd + b.sd * b.sd);
  if (sd === 0) return diff > 0 ? 1 : diff < 0 ? 0 : 0.5;
  return normalCdf(diff / sd);
}

export type MatchupPreview = {
  myMean: number;
  mySd: number;
  oppMean: number;
  oppSd: number;
  winProb: number;
};

export function previewMatchup(
  my: OptimizedLineup,
  opp: OptimizedLineup,
  proj: Map<number, PlayerProjection>,
): MatchupPreview {
  const a = lineupDistribution(my.starters, proj);
  const b = lineupDistribution(opp.starters, proj);
  return { myMean: a.mean, mySd: a.sd, oppMean: b.mean, oppSd: b.sd, winProb: winProbability(a, b) };
}
