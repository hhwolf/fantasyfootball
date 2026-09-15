import { scoreSleeperProjectionDetailed, sleeperStatsToEspn } from "../../sleeper/statmap";
import { positionCalibration } from "../calibration";
import { POSITION_SD, type PlayerProjection, type ProjectionContext, type ProjectionSource } from "../types";

export const sleeperSource: ProjectionSource = {
  id: "sleeper",
  label: "Sleeper",
  async project(ctx: ProjectionContext, espnIds: number[]) {
    const out = new Map<number, PlayerProjection>();
    const calibration = positionCalibration(ctx);
    for (const id of espnIds) {
      const p = ctx.players.get(id);
      const sp = ctx.sleeper.get(id);
      if (!p || !sp) continue;
      const scored = scoreSleeperProjectionDetailed(sp.stats, ctx.scoringItems, p.position);
      // Re-scored lines share our scorer's blind spots with ESPN's raw lines; correct by the same ratio.
      const factor = scored.method === "rescored" ? calibration[p.position] : 1;
      const points = scored.points * factor;
      out.set(id, {
        espnId: id,
        week: ctx.week,
        points: Math.round(points * 100) / 100,
        sd: POSITION_SD[p.position],
        rawStats: sleeperStatsToEspn(sp.stats),
        meta: { sleeperId: sp.sleeperId, opponent: sp.opponent, method: scored.method, calibration: factor },
      });
    }
    return out;
  },
};
