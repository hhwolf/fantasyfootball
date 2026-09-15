import type { ScoringItem } from "./schemas";
import type { Position } from "./constants";

/** ESPN pointsOverrides keys are position ids as strings (e.g. "16" for D/ST). */
const POSITION_ID: Record<Position, number> = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DST: 16 };

/**
 * Apply league scoring settings to a raw stat line (statId -> value).
 * Mirrors how ESPN computes `appliedTotal`.
 */
export function scoreStats(
  rawStats: Record<string | number, number>,
  scoringItems: ScoringItem[],
  position?: Position,
): number {
  let total = 0;
  const posKey = position ? String(POSITION_ID[position]) : undefined;
  for (const item of scoringItems) {
    const value = rawStats[item.statId];
    if (!value) continue;
    let pts = item.points;
    if (posKey && item.pointsOverrides && posKey in item.pointsOverrides) {
      pts = item.pointsOverrides[posKey];
    }
    total += value * pts;
  }
  return Math.round(total * 100) / 100;
}

/** Points per reception in this league (used to choose Sleeper's pts_* fallback). */
export function receptionPoints(scoringItems: ScoringItem[]): number {
  const item = scoringItems.find((s) => s.statId === 53) ?? scoringItems.find((s) => s.statId === 41);
  return item?.points ?? 0;
}

export function scoringFormatLabel(scoringItems: ScoringItem[]): "PPR" | "Half PPR" | "Standard" {
  const ppr = receptionPoints(scoringItems);
  if (ppr >= 0.95) return "PPR";
  if (ppr >= 0.4) return "Half PPR";
  return "Standard";
}
