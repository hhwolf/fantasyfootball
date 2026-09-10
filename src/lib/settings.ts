import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { decrypt, encrypt } from "./crypto/aesgcm";
import { env } from "./env";
import type { EspnCreds } from "./espn/client";

export type AppSettings = {
  leagueId?: string;
  season?: number;
  espnS2?: string;
  swid?: string;
  myTeamId?: number;
  consensusWeights?: Record<string, Record<string, number>>;
  source: "db" | "env" | "none";
  hasDb: boolean;
};

export async function loadSettings(): Promise<AppSettings> {
  const e = env();
  const db = getDb();
  const fromEnv: AppSettings = {
    leagueId: e.ESPN_LEAGUE_ID,
    season: e.ESPN_SEASON,
    espnS2: e.ESPN_S2,
    swid: e.SWID,
    myTeamId: e.ESPN_TEAM_ID,
    source: e.ESPN_LEAGUE_ID ? "env" : "none",
    hasDb: !!db,
  };
  if (!db) return fromEnv;
  try {
    const [row] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1)).limit(1);
    if (!row?.leagueId) return fromEnv;
    return {
      leagueId: row.leagueId,
      season: row.season ?? undefined,
      espnS2: row.espnS2Enc ? await decrypt(row.espnS2Enc) : undefined,
      swid: row.swidEnc ? await decrypt(row.swidEnc) : undefined,
      myTeamId: row.myTeamId ?? undefined,
      consensusWeights: row.consensusWeights ?? undefined,
      source: "db",
      hasDb: true,
    };
  } catch (err) {
    console.error("loadSettings failed, falling back to env", err);
    return fromEnv;
  }
}

export async function saveSettings(input: { leagueId: string; season: number; espnS2?: string; swid?: string; myTeamId?: number }) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL not configured; set ESPN_LEAGUE_ID/ESPN_S2/SWID env vars instead.");
  const values = {
    id: 1,
    leagueId: input.leagueId.trim(),
    season: input.season,
    espnS2Enc: input.espnS2 ? await encrypt(input.espnS2.trim()) : null,
    swidEnc: input.swid ? await encrypt(normalizeSwid(input.swid)) : null,
    myTeamId: input.myTeamId ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.settings)
    .values(values)
    .onConflictDoUpdate({ target: schema.settings.id, set: { ...values, id: undefined } });
}

export async function saveMyTeamId(myTeamId: number) {
  const db = getDb();
  if (!db) return;
  await db.update(schema.settings).set({ myTeamId, updatedAt: new Date() }).where(eq(schema.settings.id, 1));
}

export async function saveConsensusWeights(weights: Record<string, Record<string, number>>) {
  const db = getDb();
  if (!db) return;
  await db.update(schema.settings).set({ consensusWeights: weights, updatedAt: new Date() }).where(eq(schema.settings.id, 1));
}

/** SWID must keep its braces. Users sometimes paste without them. */
export function normalizeSwid(swid: string): string {
  const s = swid.trim();
  if (!s) return s;
  return s.startsWith("{") ? s : `{${s.replace(/[{}]/g, "")}}`;
}

export function toCreds(s: AppSettings, fallbackSeason: number): EspnCreds | null {
  if (!s.leagueId) return null;
  return { leagueId: s.leagueId, season: s.season ?? fallbackSeason, espnS2: s.espnS2, swid: s.swid };
}

export function maskSecret(v?: string): string {
  if (!v) return "";
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}
