import { POSITIONS, type Position } from "../espn/constants";
import { scoreStats } from "../espn/scoring";
import type { ProjectionContext } from "./types";

/**
 * How far our re-scoring of a raw stat line lands from ESPN's own `appliedTotal`, per position.
 * Offense should be ~1.0. K and D/ST can drift because ESPN applies tiered stats we cannot
 * fully reproduce; the ratio is then used to correct Sleeper lines re-scored the same way.
 */
export function positionCalibration(ctx: ProjectionContext): Record<Position, number> {
  const sums: Record<Position, { applied: number; ours: number; n: number }> = Object.fromEntries(POSITIONS.map((p) => [p, { applied: 0, ours: 0, n: 0 }])) as never;
  for (const p of ctx.players.values()) {
    const line = p.stats.find((s) => s.projected && s.season === ctx.season && s.week === ctx.week);
    if (!line || !line.points || !Object.keys(line.raw).length) continue;
    const ours = scoreStats(line.raw, ctx.scoringItems, p.position);
    if (ours <= 0) continue;
    const acc = sums[p.position];
    acc.applied += line.points;
    acc.ours += ours;
    acc.n++;
  }
  const out = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    const s = sums[pos];
    // Need a handful of players; otherwise trust the raw re-score.
    out[pos] = s.n >= 3 && s.ours > 0 ? clamp(s.applied / s.ours, 0.5, 2) : 1;
  }
  return out;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
