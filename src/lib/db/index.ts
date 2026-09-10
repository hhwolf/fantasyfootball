import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "../env";

export type Db = NeonHttpDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

let instance: Db | null | undefined;

/** Returns null when DATABASE_URL is unset (read-only, env-configured mode). */
export function getDb(): Db | null {
  if (instance !== undefined) return instance;
  const url = env().DATABASE_URL;
  if (!url) {
    instance = null;
    return instance;
  }
  if (/neon\.tech|neon\.build|-pooler\./.test(url) || url.startsWith("postgresql://") && url.includes("neon")) {
    instance = drizzleNeon(neon(url), { schema });
  } else {
    instance = drizzlePg(postgres(url, { max: 3, prepare: false }), { schema });
  }
  return instance;
}

export function requireDb(): Db {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");
  return db;
}

export { schema };
