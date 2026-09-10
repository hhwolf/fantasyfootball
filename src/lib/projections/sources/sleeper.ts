import { scoreSleeperProjection, sleeperStatsToEspn } from "../../sleeper/statmap";
import { POSITION_SD, type PlayerProjection, type ProjectionContext, type ProjectionSource } from "../types";

export const sleeperSource: ProjectionSource = {
  id: "sleeper",
  label: "Sleeper",
  async project(ctx: ProjectionContext, espnIds: number[]) {
    const out = new Map<number, PlayerProjection>();
    for (const id of espnIds) {
      const p = ctx.players.get(id);
      const sp = ctx.sleeper.get(id);
      if (!p || !sp) continue;
      const points = scoreSleeperProjection(sp.stats, ctx.scoringItems, p.position);
      out.set(id, {
        espnId: id,
        week: ctx.week,
        points: Math.round(points * 100) / 100,
        sd: POSITION_SD[p.position],
        rawStats: sleeperStatsToEspn(sp.stats),
        meta: { sleeperId: sp.sleeperId, opponent: sp.opponent },
      });
    }
    return out;
  },
};
