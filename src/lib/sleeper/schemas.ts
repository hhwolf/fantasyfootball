import { z } from "zod";

/** Sleeper stat maps occasionally contain nulls; strip them so consumers get a clean numeric record. */
const zNumRecordStripNulls = z
  .record(z.string(), z.number().nullable())
  .nullable()
  .optional()
  .transform((rec): Record<string, number> => {
    const out: Record<string, number> = {};
    if (!rec) return out;
    for (const [k, v] of Object.entries(rec)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  });

export const zSleeperPlayerInfo = z
  .object({
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    position: z.string().nullable().optional(),
    fantasy_positions: z.array(z.string()).nullable().optional(),
    team: z.string().nullable().optional(),
    injury_status: z.string().nullable().optional(),
    years_exp: z.number().nullable().optional(),
  })
  .loose();
export type SleeperPlayerInfo = z.infer<typeof zSleeperPlayerInfo>;

/** One entry of /projections/nfl/{season}/{week} (category "proj") or /stats/... (category "stat"). */
export const zSleeperProjection = z
  .object({
    player_id: z.string(),
    week: z.number(),
    season: z.union([z.string(), z.number()]).transform(String),
    season_type: z.string().optional(),
    category: z.string(),
    team: z.string().nullable().optional(),
    opponent: z.string().nullable().optional(),
    game_id: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    stats: zNumRecordStripNulls,
    player: zSleeperPlayerInfo.nullable().optional(),
  })
  .loose();
export type SleeperProjection = z.infer<typeof zSleeperProjection>;

export const zSleeperProjectionList = z.array(zSleeperProjection);

/** Raw entry of the /v1/players/nfl file (only the fields we use). */
export const zSleeperRawPlayer = z
  .object({
    player_id: z.string().optional(),
    espn_id: z.union([z.number(), z.string()]).nullable().optional(),
    gsis_id: z.string().nullable().optional(),
    full_name: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    position: z.string().nullable().optional(),
    fantasy_positions: z.array(z.string()).nullable().optional(),
    team: z.string().nullable().optional(),
    injury_status: z.string().nullable().optional(),
    active: z.boolean().nullable().optional(),
  })
  .loose();
export type SleeperRawPlayer = z.infer<typeof zSleeperRawPlayer>;

export const zSleeperPlayersFile = z.record(z.string(), zSleeperRawPlayer);
