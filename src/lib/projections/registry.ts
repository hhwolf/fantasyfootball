import { espnSource } from "./sources/espn";
import { sleeperSource } from "./sources/sleeper";
import { createCustomSource, type DvpFactorFn } from "./sources/custom";
import { createConsensusSource } from "./sources/consensus";
import type { PlayerProjection, ProjectionContext, ProjectionsBySource } from "./types";

/** Run every source for the given players. Custom depends on ESPN+Sleeper; consensus on all three. */
export async function projectAll(ctx: ProjectionContext, espnIds: number[], dvpFactor: DvpFactorFn): Promise<ProjectionsBySource> {
  const [espn, sleeper] = await Promise.all([espnSource.project(ctx, espnIds), sleeperSource.project(ctx, espnIds)]);
  const custom = await createCustomSource({ espn, sleeper, dvpFactor }).project(ctx, espnIds);
  const consensus = await createConsensusSource({ espn, sleeper, custom }).project(ctx, espnIds);
  return { espn, sleeper, custom, consensus };
}

export function pointsOf(map: Map<number, PlayerProjection>, id: number): number | undefined {
  return map.get(id)?.points;
}
