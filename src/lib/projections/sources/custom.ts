import { STAT, type Position } from "../../espn/constants";
import { scoreStats } from "../../espn/scoring";
import type { UsageRow } from "../../db/schema";
import { POSITION_SD, injuryMultiplier, isOnBye, type PlayerProjection, type ProjectionContext, type ProjectionSource } from "../types";

/** Every tunable coefficient of the rules-based model lives here. */
export const MODEL_PARAMS = {
  /** EWMA weights over the most recent games (most recent first). */
  ewma: [0.4, 0.3, 0.2, 0.1],
  /** Weight of prior-season games when blended into the recent window (weeks 1-3). */
  priorSeasonWeight: 0.6,
  /** Weeks of the current season after which prior-season data is ignored. */
  priorSeasonCutoffWeek: 3,
  /** Weight on the market prior (mean of ESPN/Sleeper) by week; linearly interpolated. */
  priorWeightStart: 0.7,
  priorWeightEnd: 0.4,
  priorWeightEndWeek: 6,
  /** Shrink efficiency rates toward position mean by this fraction. */
  efficiencyShrink: 0.5,
  /** Defense-vs-position multiplier bounds. */
  dvpClamp: [0.8, 1.2] as [number, number],
  /** Questionable players get wider distributions. */
  questionableSdBoost: 0.5,
  /** Minimum games of usage before trusting the volume model at all. */
  minGames: 2,
};

/** League-average efficiency, used to regress small samples. */
const POSITION_EFFICIENCY: Record<Position, { ydsPerTarget: number; ydsPerCarry: number; recRate: number; tdPerTarget: number; tdPerCarry: number; ydsPerAtt: number; tdPerAtt: number; intPerAtt: number }> = {
  QB: { ydsPerTarget: 0, ydsPerCarry: 4.5, recRate: 0, tdPerTarget: 0, tdPerCarry: 0.04, ydsPerAtt: 7.0, tdPerAtt: 0.045, intPerAtt: 0.022 },
  RB: { ydsPerTarget: 6.5, ydsPerCarry: 4.3, recRate: 0.75, tdPerTarget: 0.02, tdPerCarry: 0.03, ydsPerAtt: 0, tdPerAtt: 0, intPerAtt: 0 },
  WR: { ydsPerTarget: 8.2, ydsPerCarry: 6.0, recRate: 0.62, tdPerTarget: 0.05, tdPerCarry: 0.03, ydsPerAtt: 0, tdPerAtt: 0, intPerAtt: 0 },
  TE: { ydsPerTarget: 7.3, ydsPerCarry: 4.0, recRate: 0.66, tdPerTarget: 0.05, tdPerCarry: 0.02, ydsPerAtt: 0, tdPerAtt: 0, intPerAtt: 0 },
  K: { ydsPerTarget: 0, ydsPerCarry: 0, recRate: 0, tdPerTarget: 0, tdPerCarry: 0, ydsPerAtt: 0, tdPerAtt: 0, intPerAtt: 0 },
  DST: { ydsPerTarget: 0, ydsPerCarry: 0, recRate: 0, tdPerTarget: 0, tdPerCarry: 0, ydsPerAtt: 0, tdPerAtt: 0, intPerAtt: 0 },
};

export type DvpFactorFn = (position: Position, opponentProTeamId: number | undefined) => number;

function priorWeight(week: number): number {
  const { priorWeightStart: a, priorWeightEnd: b, priorWeightEndWeek: w } = MODEL_PARAMS;
  if (week <= 2) return a;
  if (week >= w) return b;
  return a + ((b - a) * (week - 2)) / (w - 2);
}

function ewma(values: number[]): number {
  // values: most recent first; weights renormalized over available games.
  const ws = MODEL_PARAMS.ewma.slice(0, values.length);
  const sum = ws.reduce((s, w) => s + w, 0);
  if (!sum) return 0;
  return values.reduce((s, v, i) => s + v * ws[i], 0) / sum;
}

function shrink(observed: number, prior: number, weight = MODEL_PARAMS.efficiencyShrink): number {
  return observed * (1 - weight) + prior * weight;
}

/** Order usage rows most-recent-first, weighting prior-season rows down. */
export function recentGames(rows: UsageRow[], season: number, week: number): { row: UsageRow; weight: number }[] {
  const current = rows.filter((r) => r.season === season && r.week < week).sort((a, b) => b.week - a.week);
  const prior = week <= MODEL_PARAMS.priorSeasonCutoffWeek ? rows.filter((r) => r.season === season - 1).sort((a, b) => b.week - a.week) : [];
  const out = current.map((row) => ({ row, weight: 1 }));
  for (const row of prior) out.push({ row, weight: MODEL_PARAMS.priorSeasonWeight });
  return out.slice(0, MODEL_PARAMS.ewma.length);
}

/** Expected raw stat line for a skill player from usage x regressed efficiency. */
export function volumeStatLine(position: Position, games: { row: UsageRow; weight: number }[]): Record<string, number> | null {
  if (games.length < MODEL_PARAMS.minGames) return null;
  const eff = POSITION_EFFICIENCY[position];
  const w = (f: (r: UsageRow) => number) => ewma(games.map(({ row, weight }) => f(row) * weight));
  const targets = w((r) => r.targets ?? 0);
  const carries = w((r) => r.carries ?? 0);
  const passAtt = w((r) => r.passAtt ?? 0);
  const totTargets = games.reduce((s, g) => s + (g.row.targets ?? 0), 0);
  const totCarries = games.reduce((s, g) => s + (g.row.carries ?? 0), 0);
  const totPassAtt = games.reduce((s, g) => s + (g.row.passAtt ?? 0), 0);
  const rate = (num: number, den: number, prior: number) => (den > 0 ? shrink(num / den, prior) : prior);

  const ydsPerTarget = rate(games.reduce((s, g) => s + (g.row.recYds ?? 0), 0), totTargets, eff.ydsPerTarget);
  const recRate = rate(games.reduce((s, g) => s + (g.row.receptions ?? 0), 0), totTargets, eff.recRate);
  const tdPerTarget = rate(games.reduce((s, g) => s + (g.row.recTd ?? 0), 0), totTargets, eff.tdPerTarget);
  const ydsPerCarry = rate(games.reduce((s, g) => s + (g.row.rushYds ?? 0), 0), totCarries, eff.ydsPerCarry);
  const tdPerCarry = rate(games.reduce((s, g) => s + (g.row.rushTd ?? 0), 0), totCarries, eff.tdPerCarry);
  const ydsPerAtt = rate(games.reduce((s, g) => s + (g.row.passYds ?? 0), 0), totPassAtt, eff.ydsPerAtt);
  const tdPerAtt = rate(games.reduce((s, g) => s + (g.row.passTd ?? 0), 0), totPassAtt, eff.tdPerAtt);
  const intPerAtt = rate(games.reduce((s, g) => s + (g.row.passInt ?? 0), 0), totPassAtt, eff.intPerAtt);
  const fumRate = games.reduce((s, g) => s + (g.row.fumLost ?? 0), 0) / games.length;

  const line: Record<string, number> = {};
  line[STAT.TARGETS] = targets;
  line[STAT.REC] = targets * recRate;
  line[STAT.REC_ALT] = line[STAT.REC];
  line[STAT.REC_YDS] = targets * ydsPerTarget;
  line[STAT.REC_TD] = targets * tdPerTarget;
  line[STAT.RUSH_ATT] = carries;
  line[STAT.RUSH_YDS] = carries * ydsPerCarry;
  line[STAT.RUSH_TD] = carries * tdPerCarry;
  line[STAT.PASS_ATT] = passAtt;
  line[STAT.PASS_YDS] = passAtt * ydsPerAtt;
  line[STAT.PASS_TD] = passAtt * tdPerAtt;
  line[STAT.PASS_INT] = passAtt * intPerAtt;
  line[STAT.FUM_LOST] = fumRate * 0.5; // regress fumbles hard
  return line;
}

export function createCustomSource(deps: { espn: Map<number, PlayerProjection>; sleeper: Map<number, PlayerProjection>; dvpFactor: DvpFactorFn }): ProjectionSource {
  return {
    id: "custom",
    label: "Model",
    async project(ctx: ProjectionContext, espnIds: number[]) {
      const out = new Map<number, PlayerProjection>();
      const wPrior = priorWeight(ctx.week);
      for (const id of espnIds) {
        const p = ctx.players.get(id);
        if (!p) continue;
        const e = deps.espn.get(id)?.points;
        const s = deps.sleeper.get(id)?.points;
        const priors = [e, s].filter((x): x is number => x != null);
        const prior = priors.length ? priors.reduce((a, b) => a + b, 0) / priors.length : 0;

        const bye = isOnBye(ctx, p.proTeamId);
        const injury = injuryMultiplier(p.injuryStatus);
        const opponentId = ctx.proTeams[p.proTeamId]?.gamesByWeek[ctx.week]?.opponentId;
        const dvp = deps.dvpFactor(p.position, opponentId);

        let base = prior;
        let volumePts: number | null = null;
        let gamesUsed = 0;
        if (p.position !== "K" && p.position !== "DST") {
          const games = recentGames(ctx.usage.get(id) ?? [], ctx.season, ctx.week);
          gamesUsed = games.length;
          const line = volumeStatLine(p.position, games);
          if (line) {
            volumePts = scoreStats(line, ctx.scoringItems, p.position);
            // Injured priors already embed availability; only blend when the market thinks they play.
            base = priors.length ? wPrior * prior + (1 - wPrior) * volumePts : volumePts;
          }
        }
        const questionable = p.injuryStatus?.toUpperCase() === "QUESTIONABLE" ? 1 : 0;
        const points = bye ? 0 : Math.max(0, base * dvp * injury);
        out.set(id, {
          espnId: id,
          week: ctx.week,
          points: Math.round(points * 100) / 100,
          sd: POSITION_SD[p.position] * (1 + MODEL_PARAMS.questionableSdBoost * questionable),
          meta: { prior, volumePts, dvp, injury, bye, gamesUsed, wPrior },
        });
      }
      return out;
    },
  };
}
