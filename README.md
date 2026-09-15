# FF Dash — personal ESPN fantasy football dashboard & predictor

Links to your ESPN league, blends projections from ESPN, Sleeper, and a rules-based model into a
consensus, and uses them to power a lineup optimizer, matchup preview, waiver finder, trade analyzer,
and a season-long accuracy tracker that re-tunes the consensus weights.

## Quick start (local)

```bash
cp .env.example .env            # set APP_PASSWORD and SESSION_SECRET at minimum
docker compose up -d            # optional: local Postgres
# DATABASE_URL=postgres://postgres:postgres@localhost:5432/ffdash  (add to .env)
pnpm install
pnpm db:push                    # creates tables (skip if running without a DB)
pnpm dev
```

Open http://localhost:3000, sign in with `APP_PASSWORD`, then go to **Settings** and enter your ESPN
league ID. Private league? Log in at fantasy.espn.com, open DevTools → Application → Cookies →
`espn.com`, and paste `espn_s2` and `SWID`. Click **Test connection**, pick your team, **Save**.

Without a database, configure the league through `ESPN_LEAGUE_ID`, `ESPN_TEAM_ID`, `ESPN_S2`, `SWID`
instead. Everything works except history (accuracy tracker, projection snapshots).

## Deploy to Vercel

1. Create a Neon (or Vercel Postgres) database and set `DATABASE_URL`.
2. Set `APP_PASSWORD`, `SESSION_SECRET`, `ENCRYPTION_KEY` (`openssl rand -base64 32`), `CRON_SECRET`.
3. `pnpm db:push` once against the production database.
4. Deploy. `vercel.json` registers one daily cron (`/api/cron/daily`, 10:00 UTC) that refreshes the
   league, snapshots projections before games (Thu/Sat/Sun/Mon), and on Tuesdays records actuals,
   recomputes accuracy, and refreshes Sleeper/nflverse reference data. On Vercel Pro you can split
   these into multiple schedules; the job functions live in `src/lib/jobs.ts`.

On **Vercel Pro**, replace the single cron with per-job schedules (query strings are allowed in cron paths):

```json
{ "crons": [
  { "path": "/api/cron/daily?jobs=refreshLeague", "schedule": "0 */6 * * *" },
  { "path": "/api/cron/daily?jobs=snapshotProjections", "schedule": "0 0 * * 5" },
  { "path": "/api/cron/daily?jobs=snapshotProjections", "schedule": "30 16 * * 0" },
  { "path": "/api/cron/daily?jobs=snapshotProjections", "schedule": "0 23 * * 1" },
  { "path": "/api/cron/daily?jobs=refreshReferenceData,recordActuals", "schedule": "0 10 * * 2" }
]}
```
(Times are UTC: Thu 8pm ET, Sun 12:30pm ET, Mon 7pm ET, Tue 6am ET.)

Run a job manually: `curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/cron/daily?jobs=refreshReferenceData,snapshotProjections"`.

## How projections work

| Source | What it is |
|---|---|
| ESPN | ESPN's weekly projection, already scored with your league's settings |
| Sleeper | Sleeper's raw stat projections re-scored with your league's scoring items, calibrated per position against ESPN's own applied totals (matters for K and D/ST) |
| Model | Rules-based: recent usage (targets/carries/attempts, EWMA) × regressed efficiency, blended with the market prior, adjusted for opponent (defense vs position), Vegas implied team total (game script), injury status and byes. Coefficients in `src/lib/projections/sources/custom.ts` (`MODEL_PARAMS`). |
| Consensus | Weighted blend (default ESPN .4 / Sleeper .4 / Model .2). After 3 weeks of tracked accuracy, weights become inverse-MSE per position. |

Data sources, all free and keyless: ESPN fantasy API (league, rosters, projections), ESPN scoreboard (Vegas lines), Sleeper (projections, player id map), nflverse (weekly usage stats, id map).

## Scripts

`pnpm dev` · `pnpm build` · `pnpm test` (vitest) · `pnpm typecheck` · `pnpm db:push` · `pnpm db:studio`
