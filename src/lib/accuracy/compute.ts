import type { Position } from "../espn/constants";
import type { SourceId } from "../projections/types";

export type AccuracyInput = { espnId: number; position: Position; source: SourceId; projected: number; actual: number };
export type AccuracyStat = { source: SourceId; position: Position | "ALL"; n: number; mae: number; rmse: number; bias: number };

/** Players who neither scored nor were projected to matter add noise; skip them. */
export function isRelevant(projected: number, actual: number): boolean {
  return projected >= 2 || actual > 0;
}

export function computeAccuracy(rows: AccuracyInput[]): AccuracyStat[] {
  const groups = new Map<string, { source: SourceId; position: Position | "ALL"; errs: number[] }>();
  const add = (key: string, source: SourceId, position: Position | "ALL", err: number) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { source, position, errs: [] }));
    g.errs.push(err);
  };
  for (const r of rows) {
    if (!isRelevant(r.projected, r.actual)) continue;
    const err = r.projected - r.actual;
    add(`${r.source}|${r.position}`, r.source, r.position, err);
    add(`${r.source}|ALL`, r.source, "ALL", err);
  }
  const out: AccuracyStat[] = [];
  for (const g of groups.values()) {
    const n = g.errs.length;
    const mae = g.errs.reduce((s, e) => s + Math.abs(e), 0) / n;
    const rmse = Math.sqrt(g.errs.reduce((s, e) => s + e * e, 0) / n);
    const bias = g.errs.reduce((s, e) => s + e, 0) / n;
    out.push({ source: g.source, position: g.position, n, mae: round3(mae), rmse: round3(rmse), bias: round3(bias) });
  }
  return out.sort((a, b) => a.source.localeCompare(b.source) || a.position.localeCompare(b.position));
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
