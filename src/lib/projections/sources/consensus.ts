import type { Position } from "../../espn/constants";
import { POSITION_SD, type PlayerProjection, type ProjectionContext, type ProjectionSource, type SourceId } from "../types";

export const DEFAULT_WEIGHTS: Record<Exclude<SourceId, "consensus">, number> = { espn: 0.4, sleeper: 0.4, custom: 0.2 };

export function weightsFor(position: Position, overrides?: Record<string, Partial<Record<SourceId, number>>>): Record<string, number> {
  const o = overrides?.[position] ?? overrides?.["ALL"];
  return { ...DEFAULT_WEIGHTS, ...(o ?? {}) };
}

export function blend(parts: { source: string; proj: PlayerProjection | undefined }[], weights: Record<string, number>): { points: number; sd: number; used: Record<string, number> } | null {
  let wsum = 0;
  let psum = 0;
  let sdsum = 0;
  const used: Record<string, number> = {};
  for (const { source, proj } of parts) {
    if (!proj) continue;
    const w = weights[source] ?? 0;
    if (w <= 0) continue;
    wsum += w;
    psum += w * proj.points;
    sdsum += w * proj.sd;
    used[source] = w;
  }
  if (!wsum) return null;
  for (const k of Object.keys(used)) used[k] = used[k] / wsum;
  return { points: Math.round((psum / wsum) * 100) / 100, sd: sdsum / wsum, used };
}

export function createConsensusSource(inputs: Partial<Record<Exclude<SourceId, "consensus">, Map<number, PlayerProjection>>>): ProjectionSource {
  return {
    id: "consensus",
    label: "Consensus",
    async project(ctx: ProjectionContext, espnIds: number[]) {
      const out = new Map<number, PlayerProjection>();
      for (const id of espnIds) {
        const p = ctx.players.get(id);
        if (!p) continue;
        const weights = weightsFor(p.position, ctx.consensusWeights);
        const res = blend(
          (Object.keys(DEFAULT_WEIGHTS) as (keyof typeof DEFAULT_WEIGHTS)[]).map((source) => ({ source, proj: inputs[source]?.get(id) })),
          weights,
        );
        if (!res) continue;
        out.set(id, { espnId: id, week: ctx.week, points: res.points, sd: res.sd || POSITION_SD[p.position], meta: { weights: res.used } });
      }
      return out;
    },
  };
}
