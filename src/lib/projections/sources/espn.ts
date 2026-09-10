import { POSITION_SD, type PlayerProjection, type ProjectionContext, type ProjectionSource } from "../types";

export const espnSource: ProjectionSource = {
  id: "espn",
  label: "ESPN",
  async project(ctx: ProjectionContext, espnIds: number[]) {
    const out = new Map<number, PlayerProjection>();
    for (const id of espnIds) {
      const p = ctx.players.get(id);
      if (!p || p.espnWeekProj == null) continue;
      const raw = p.stats.find((s) => s.projected && s.season === ctx.season && s.week === ctx.week)?.raw;
      out.set(id, { espnId: id, week: ctx.week, points: p.espnWeekProj, sd: POSITION_SD[p.position], rawStats: raw });
    }
    return out;
  },
};
