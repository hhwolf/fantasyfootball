/**
 * Lineup optimizer (pure).
 *
 * Solves the "which player goes in which starting slot" problem as a
 * max-weight bipartite matching between roster players and expanded unit
 * slots, using the Hungarian algorithm. A greedy fallback (specific slots
 * first, then flex) is also exported for comparison / sanity checks.
 *
 * Design notes:
 *  - Weight of (player, slot) = projected points (0 if no projection) plus a
 *    tiny tie-break favouring lower `sd`, plus an even tinier "stickiness"
 *    bonus for the player's current slot so equal-value swaps do not show up
 *    as spurious changes.
 *  - Ineligible pairs get a large negative weight and are treated as "slot
 *    left empty" if the matching is ever forced to pick one.
 *  - Players sitting in the IR slot (21) are never candidates and are listed
 *    separately in `ir`.
 */
import { SLOT, SLOT_ELIGIBLE_POSITIONS } from "../espn/constants";
import type { LeaguePlayer } from "../league/types";
import type { PlayerProjection } from "../projections/types";

export type LineupAssignment = { espnId: number; slotId: number };

export type OptimizedLineup = {
  /** One per filled unit slot, in expanded slot order; empty slots omitted. */
  starters: LineupAssignment[];
  /** espnIds not starting (IR players excluded; see `ir`). */
  bench: number[];
  ir: number[];
  /** Sum of projected points of starters. */
  total: number;
  /** Slot ids (one entry per unit slot) that could not be filled. */
  emptySlots: number[];
  /** Projected total of the roster's current lineup (players in non-bench/IR slots). */
  currentTotal: number;
  /** Diff vs current `lineupSlotId` (null = bench / not starting). */
  changes: { espnId: number; from: number | null; to: number | null }[];
};

export type OptimizeOptions = {
  /** Exclude players whose injuryStatus is OUT / INJURY_RESERVE / SUSPENSION from consideration. */
  lockInjuredOut?: boolean;
};

const INELIGIBLE = -1e6;
const FILL_BONUS = 1e4;
const SD_EPS = 1e-6;
const STICKY_EPS = 1e-9;
const DEFAULT_SD = 6;

/** Flex-type slots that accept multiple positions; filled after specific slots. */
const FLEX_SLOTS = new Set<number>([SLOT.RB_WR, SLOT.WR_TE, SLOT.OP, SLOT.FLEX]);

const LOCKED_STATUSES = new Set(["OUT", "INJURY_RESERVE", "IR", "SUSPENSION", "SUSPENDED"]);

/**
 * Expand `lineupSlotCounts` into one entry per unit slot. Bench (20) and IR
 * (21) are excluded. Specific slots (QB, RB, WR, TE, K, DST, ...) come first,
 * then flex-type slots (RB/WR, WR/TE, OP, FLEX); ties by slot id.
 */
export function expandSlots(slotCounts: Record<number, number>): number[] {
  const ids = Object.keys(slotCounts)
    .map(Number)
    .filter((id) => Number.isFinite(id) && id !== SLOT.BENCH && id !== SLOT.IR && (slotCounts[id] ?? 0) > 0)
    .sort((a, b) => {
      const fa = FLEX_SLOTS.has(a) ? 1 : 0;
      const fb = FLEX_SLOTS.has(b) ? 1 : 0;
      return fa - fb || a - b;
    });
  const out: number[] = [];
  for (const id of ids) for (let i = 0; i < slotCounts[id]; i++) out.push(id);
  return out;
}

/** Slot eligibility: ESPN `eligibleSlots` when present, else the position fallback table. */
export function isEligible(player: LeaguePlayer, slotId: number): boolean {
  if (player.eligibleSlots && player.eligibleSlots.length > 0) return player.eligibleSlots.includes(slotId);
  return SLOT_ELIGIBLE_POSITIONS[slotId]?.includes(player.position) ?? false;
}

function isLockedOut(p: LeaguePlayer): boolean {
  return LOCKED_STATUSES.has((p.injuryStatus ?? "").toUpperCase());
}

function projPoints(p: LeaguePlayer, proj: Map<number, PlayerProjection>): number {
  const pr = proj.get(p.espnId);
  return pr && Number.isFinite(pr.points) ? pr.points : 0;
}

/** Points plus tie-breakers (lower sd preferred, current slot preferred). */
function weight(p: LeaguePlayer, slotId: number, proj: Map<number, PlayerProjection>): number {
  const pr = proj.get(p.espnId);
  const pts = pr && Number.isFinite(pr.points) ? pr.points : 0;
  const sd = pr && Number.isFinite(pr.sd) ? pr.sd : DEFAULT_SD;
  const sticky = p.lineupSlotId === slotId ? STICKY_EPS : 0;
  return pts + SD_EPS * (50 - sd) + sticky;
}

function splitRoster(roster: LeaguePlayer[], opts?: OptimizeOptions) {
  const ir: LeaguePlayer[] = [];
  const candidates: LeaguePlayer[] = [];
  const excluded: LeaguePlayer[] = [];
  for (const p of roster) {
    if (p.lineupSlotId === SLOT.IR) ir.push(p);
    else if (opts?.lockInjuredOut && isLockedOut(p)) excluded.push(p);
    else candidates.push(p);
  }
  return { ir, candidates, excluded };
}

function currentSlot(p: LeaguePlayer): number | null {
  const s = p.lineupSlotId;
  if (s === undefined || s === null || s === SLOT.BENCH || s === SLOT.IR) return null;
  return s;
}

/** Assemble the result object from a slot-index -> player assignment. */
function finalize(
  roster: LeaguePlayer[],
  slots: number[],
  assignment: (LeaguePlayer | null)[],
  proj: Map<number, PlayerProjection>,
): OptimizedLineup {
  const starters: LineupAssignment[] = [];
  const emptySlots: number[] = [];
  const startingIds = new Map<number, number>();
  let total = 0;
  slots.forEach((slotId, i) => {
    const p = assignment[i];
    if (!p) {
      emptySlots.push(slotId);
      return;
    }
    starters.push({ espnId: p.espnId, slotId });
    startingIds.set(p.espnId, slotId);
    total += projPoints(p, proj);
  });

  const ir: number[] = [];
  const bench: number[] = [];
  const changes: OptimizedLineup["changes"] = [];
  let currentTotal = 0;
  for (const p of roster) {
    if (p.lineupSlotId === SLOT.IR) {
      ir.push(p.espnId);
      continue;
    }
    const from = currentSlot(p);
    if (from !== null) currentTotal += projPoints(p, proj);
    const to = startingIds.get(p.espnId) ?? null;
    if (to === null) bench.push(p.espnId);
    if (from !== to) changes.push({ espnId: p.espnId, from, to });
  }

  return { starters, bench, ir, total, emptySlots, currentTotal, changes };
}

/**
 * Hungarian algorithm (Kuhn-Munkres, O(n^3)) for a square cost matrix,
 * minimising total cost. Returns `rowToCol` assignment.
 */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  // 1-indexed working arrays, e-maxx formulation.
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0); // p[j] = row matched to column j
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(Infinity);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const rowToCol = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j] !== 0) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

/**
 * Optimal lineup via max-weight bipartite matching (Hungarian algorithm).
 * The players x slots matrix is padded to square with zero-weight dummies so
 * either side may be larger.
 */
export function optimizeLineup(
  roster: LeaguePlayer[],
  slotCounts: Record<number, number>,
  proj: Map<number, PlayerProjection>,
  opts?: OptimizeOptions,
): OptimizedLineup {
  const slots = expandSlots(slotCounts);
  const { candidates } = splitRoster(roster, opts);
  const n = Math.max(candidates.length, slots.length);
  const assignment: (LeaguePlayer | null)[] = new Array(slots.length).fill(null);
  if (n === 0) return finalize(roster, slots, assignment, proj);

  // cost = -weight; dummy rows/cols cost 0.
  const cost: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n).fill(0);
    if (i < candidates.length) {
      const p = candidates[i];
      for (let j = 0; j < slots.length; j++) {
        // FILL_BONUS makes any eligible player preferable to leaving the slot
        // empty (matched to a dummy), even with a negative projection.
        row[j] = isEligible(p, slots[j]) ? -(weight(p, slots[j], proj) + FILL_BONUS) : -INELIGIBLE;
      }
    }
    cost.push(row);
  }
  const rowToCol = hungarian(cost);
  for (let i = 0; i < candidates.length; i++) {
    const j = rowToCol[i];
    if (j < 0 || j >= slots.length) continue; // matched to a dummy slot => bench
    if (!isEligible(candidates[i], slots[j])) continue; // forced ineligible => leave empty
    assignment[j] = candidates[i];
  }
  return finalize(roster, slots, assignment, proj);
}

/**
 * Greedy lineup: fill specific slots first (in `expandSlots` order) with the
 * best remaining eligible player, then flex slots from the remainder.
 */
export function greedyLineup(
  roster: LeaguePlayer[],
  slotCounts: Record<number, number>,
  proj: Map<number, PlayerProjection>,
  opts?: OptimizeOptions,
): OptimizedLineup {
  const slots = expandSlots(slotCounts);
  const { candidates } = splitRoster(roster, opts);
  const used = new Set<number>();
  const assignment: (LeaguePlayer | null)[] = new Array(slots.length).fill(null);
  slots.forEach((slotId, i) => {
    let best: LeaguePlayer | null = null;
    let bestW = -Infinity;
    for (const p of candidates) {
      if (used.has(p.espnId) || !isEligible(p, slotId)) continue;
      const w = weight(p, slotId, proj);
      if (w > bestW) {
        bestW = w;
        best = p;
      }
    }
    if (best) {
      used.add(best.espnId);
      assignment[i] = best;
    }
  });
  return finalize(roster, slots, assignment, proj);
}
