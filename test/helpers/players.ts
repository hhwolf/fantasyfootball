import type { Position } from "@/lib/espn/constants";
import type { LeaguePlayer } from "@/lib/league/types";
import type { PlayerProjection } from "@/lib/projections/types";
import type { ValueContext } from "@/lib/features/replacement";

let nextId = 1000;

const TEAM_BY_POS: Record<Position, number> = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DST: 6 };

export function mkPlayer(overrides: Partial<LeaguePlayer> = {}): LeaguePlayer {
  const position = overrides.position ?? "RB";
  const espnId = overrides.espnId ?? nextId++;
  return {
    espnId,
    name: overrides.name ?? `${position} ${espnId}`,
    position,
    proTeamId: overrides.proTeamId ?? TEAM_BY_POS[position],
    proTeam: overrides.proTeam ?? "TST",
    eligibleSlots: [],
    injuryStatus: "ACTIVE",
    stats: [],
    lineupSlotId: 20,
    ...overrides,
  };
}

export function mkProj(espnId: number, points: number, sd = 6, week = 1): PlayerProjection {
  return { espnId, week, points, sd };
}

export function projMap(...projs: PlayerProjection[]): Map<number, PlayerProjection> {
  return new Map(projs.map((p) => [p.espnId, p]));
}

/** Standard 1QB / 2RB / 2WR / 1TE / 1FLEX / 1K / 1DST / 6 bench / 1 IR. */
export const STD_SLOTS: Record<number, number> = { 0: 1, 2: 2, 4: 2, 6: 1, 23: 1, 17: 1, 16: 1, 20: 6, 21: 1 };

export function mkCtx(overrides: Partial<ValueContext> = {}): ValueContext {
  return {
    currentWeek: 5,
    finalWeek: 17,
    weekProj: new Map(),
    byeWeekOf: () => undefined,
    ...overrides,
  };
}

/** Deterministic PRNG (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
