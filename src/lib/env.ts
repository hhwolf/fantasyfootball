import { z } from "zod";

const schema = z.object({
  APP_PASSWORD: z.string().min(1).default("changeme"),
  SESSION_SECRET: z.string().min(16).default("dev-session-secret-change-me-please"),
  ENCRYPTION_KEY: z.string().optional(), // base64, 32 bytes
  CRON_SECRET: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  ESPN_LEAGUE_ID: z.string().optional(),
  ESPN_SEASON: z.coerce.number().optional(),
  ESPN_S2: z.string().optional(),
  SWID: z.string().optional(),
  ESPN_TEAM_ID: z.coerce.number().optional(),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;
export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}
