import { boolean, index, integer, jsonb, numeric, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  leagueId: text("league_id"),
  season: integer("season"),
  espnS2Enc: text("espn_s2_enc"),
  swidEnc: text("swid_enc"),
  myTeamId: integer("my_team_id"),
  consensusWeights: jsonb("consensus_weights").$type<Record<string, Record<string, number>>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const leagueSnapshot = pgTable(
  "league_snapshot",
  {
    id: serial("id").primaryKey(),
    season: integer("season").notNull(),
    scoringPeriod: integer("scoring_period").notNull(),
    view: text("view").notNull(),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("league_snapshot_key").on(t.season, t.scoringPeriod, t.view)],
);

export const players = pgTable(
  "players",
  {
    espnId: integer("espn_id").primaryKey(),
    sleeperId: text("sleeper_id"),
    gsisId: text("gsis_id"),
    name: text("name").notNull(),
    position: text("position").notNull(),
    proTeamId: integer("pro_team_id").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("players_sleeper_idx").on(t.sleeperId), index("players_gsis_idx").on(t.gsisId)],
);

export const projections = pgTable(
  "projections",
  {
    id: serial("id").primaryKey(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    espnId: integer("espn_id").notNull(),
    source: text("source").notNull(),
    points: numeric("points", { precision: 6, scale: 2 }).notNull(),
    sd: numeric("sd", { precision: 5, scale: 2 }),
    rawStats: jsonb("raw_stats"),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).defaultNow().notNull(),
    isFinal: boolean("is_final").notNull().default(false),
  },
  (t) => [
    uniqueIndex("projections_final_key").on(t.season, t.week, t.espnId, t.source, t.isFinal),
    index("projections_week_idx").on(t.season, t.week, t.source),
  ],
);

export const actuals = pgTable(
  "actuals",
  {
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    espnId: integer("espn_id").notNull(),
    points: numeric("points", { precision: 6, scale: 2 }).notNull(),
    rawStats: jsonb("raw_stats"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.season, t.week, t.espnId] })],
);

export const usageWeekly = pgTable(
  "usage_weekly",
  {
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    gsisId: text("gsis_id").notNull(),
    position: text("position").notNull(),
    team: text("team"),
    opponent: text("opponent"),
    passAtt: integer("pass_att").default(0),
    passYds: integer("pass_yds").default(0),
    passTd: integer("pass_td").default(0),
    passInt: integer("pass_int").default(0),
    carries: integer("carries").default(0),
    rushYds: integer("rush_yds").default(0),
    rushTd: integer("rush_td").default(0),
    targets: integer("targets").default(0),
    receptions: integer("receptions").default(0),
    recYds: integer("rec_yds").default(0),
    recTd: integer("rec_td").default(0),
    airYards: integer("air_yards").default(0),
    fumLost: integer("fum_lost").default(0),
    fptsPpr: numeric("fpts_ppr", { precision: 6, scale: 2 }).default("0"),
  },
  (t) => [primaryKey({ columns: [t.season, t.week, t.gsisId] }), index("usage_pos_idx").on(t.season, t.position)],
);

export const accuracy = pgTable(
  "accuracy",
  {
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    source: text("source").notNull(),
    position: text("position").notNull(),
    n: integer("n").notNull(),
    mae: numeric("mae", { precision: 6, scale: 3 }).notNull(),
    rmse: numeric("rmse", { precision: 6, scale: 3 }).notNull(),
    bias: numeric("bias", { precision: 6, scale: 3 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.season, t.week, t.source, t.position] })],
);

export type SettingsRow = typeof settings.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type ProjectionRow = typeof projections.$inferSelect;
export type ActualRow = typeof actuals.$inferSelect;
export type UsageRow = typeof usageWeekly.$inferSelect;
export type AccuracyRow = typeof accuracy.$inferSelect;
