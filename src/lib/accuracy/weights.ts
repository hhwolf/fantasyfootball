import { POSITIONS, type Position } from "../espn/constants";
import type { SourceId } from "../projections/types";

export type WeeklyAccuracy = { week: number; source: SourceId; position: Position | "ALL"; n: number; rmse: number };
const BLENDABLE: SourceId[] = ["espn", "sleeper", "custom"];

/**
 * Inverse-MSE weights per position over the trailing `trailingWeeks` weeks, floored and normalized.
 * Returns null when fewer than `minWeeks` distinct weeks of data exist.
 */
export function deriveConsensusWeights(
  rows: WeeklyAccuracy[],
  opts: { trailingWeeks?: number; minWeeks?: number; floor?: number } = {},
): Record<string, Record<SourceId, number>> | null {
  const { trailingWeeks = 4, minWeeks = 3, floor = 0.1 } = opts;
  const weeks = [...new Set(rows.map((r) => r.week))].sort((a, b) => b - a).slice(0, trailingWeeks);
  if (weeks.length < minWeeks) return null;
  const recent = rows.filter((r) => weeks.includes(r.week));
  const out: Record<string, Record<SourceId, number>> = {};
  for (const position of [...POSITIONS, "ALL" as const]) {
    const mse: Partial<Record<SourceId, number>> = {};
    for (const source of BLENDABLE) {
      const rs = recent.filter((r) => r.source === source && r.position === position && r.n > 0);
      if (!rs.length) continue;
      const totalN = rs.reduce((s, r) => s + r.n, 0);
      mse[source] = rs.reduce((s, r) => s + r.rmse * r.rmse * r.n, 0) / totalN;
    }
    const available = BLENDABLE.filter((s) => mse[s] != null && mse[s]! > 0);
    if (available.length < 2) continue;
    const inv = available.map((s) => 1 / mse[s]!);
    const invSum = inv.reduce((a, b) => a + b, 0);
    const raw: Record<string, number> = {};
    available.forEach((s, i) => (raw[s] = Math.max(floor, inv[i] / invSum)));
    const sum = Object.values(raw).reduce((a, b) => a + b, 0);
    const norm = {} as Record<SourceId, number>;
    for (const s of available) norm[s] = Math.round((raw[s] / sum) * 1000) / 1000;
    out[position] = norm;
  }
  return Object.keys(out).length ? out : null;
}
