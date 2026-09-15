import { sql } from "drizzle-orm";
import type { Db } from "../db";
import { players, type PlayerRow } from "../db/schema";
import { PRO_TEAM_ID_BY_ABBR } from "../espn/constants";
import { fetchSleeperPlayersSlim, type FetchImpl } from "./client";

const BATCH_SIZE = 500;

export type PlayerIdMap = {
  bySleeper: Map<string, PlayerRow>;
  byGsis: Map<string, PlayerRow>;
  byEspn: Map<number, PlayerRow>;
};

/**
 * Pull the Sleeper players file and upsert id mappings into `players` (keyed by espnId).
 * Rows without an ESPN id are skipped. Returns the number of rows written.
 */
export async function syncSleeperPlayers(db: Db, fetchImpl?: FetchImpl): Promise<number> {
  const slim = await fetchSleeperPlayersSlim(fetchImpl);
  const now = new Date();

  // Dedupe by espnId; the Sleeper file occasionally has two entries sharing one ESPN id.
  const rows = new Map<number, typeof players.$inferInsert>();
  for (const p of slim) {
    if (p.espnId === null) continue;
    if (rows.has(p.espnId)) continue;
    rows.set(p.espnId, {
      espnId: p.espnId,
      sleeperId: p.sleeperId,
      gsisId: p.gsisId,
      name: p.name,
      position: p.position,
      proTeamId: p.team ? (PRO_TEAM_ID_BY_ABBR[p.team] ?? 0) : 0,
      updatedAt: now,
    });
  }

  const all = [...rows.values()];
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const batch = all.slice(i, i + BATCH_SIZE);
    await db
      .insert(players)
      .values(batch)
      .onConflictDoUpdate({
        target: players.espnId,
        set: {
          sleeperId: sql`excluded.sleeper_id`,
          gsisId: sql`excluded.gsis_id`,
          name: sql`excluded.name`,
          position: sql`excluded.position`,
          proTeamId: sql`excluded.pro_team_id`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
  return all.length;
}

/** Load the whole players table into lookup maps by Sleeper id, GSIS id, and ESPN id. */
export async function loadPlayerIdMap(db: Db): Promise<PlayerIdMap> {
  const rows = await db.select().from(players);
  return buildPlayerIdMap(rows);
}

export function buildPlayerIdMap(rows: PlayerRow[]): PlayerIdMap {
  const bySleeper = new Map<string, PlayerRow>();
  const byGsis = new Map<string, PlayerRow>();
  const byEspn = new Map<number, PlayerRow>();
  for (const r of rows) {
    byEspn.set(r.espnId, r);
    if (r.sleeperId) bySleeper.set(r.sleeperId, r);
    if (r.gsisId) byGsis.set(r.gsisId, r);
  }
  return { bySleeper, byGsis, byEspn };
}
