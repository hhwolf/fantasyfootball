import { z } from "zod";

/**
 * Game odds from ESPN's public scoreboard (no key). Team ids here match fantasy `proTeamId`.
 * The `site.api` host started returning 403 in Aug 2026; `site.web.api` still serves the same JSON.
 */
export const SCOREBOARD_URL = "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

const zScoreboard = z
  .object({
    events: z
      .array(
        z
          .object({
            date: z.string().optional(),
            competitions: z.array(
              z
                .object({
                  date: z.string().optional(),
                  status: z.object({ type: z.object({ name: z.string().optional() }).loose().optional() }).loose().optional(),
                  competitors: z.array(
                    z.object({ homeAway: z.string(), team: z.object({ id: z.union([z.string(), z.number()]), abbreviation: z.string().optional() }).loose() }).loose(),
                  ),
                  odds: z
                    .array(z.object({ overUnder: z.number().nullish(), spread: z.number().nullish(), details: z.string().nullish(), provider: z.object({ name: z.string().optional() }).loose().nullish() }).loose())
                    .nullish(),
                })
                .loose(),
            ),
          })
          .loose(),
      )
      .default([]),
  })
  .loose();

export type TeamOdds = {
  proTeamId: number;
  opponentId: number;
  home: boolean;
  /** Vegas implied points for this team: (O/U ∓ spread) / 2. */
  impliedTotal: number;
  /** Negative = this team favored. */
  spread: number;
  overUnder: number;
  kickoff?: string;
  provider?: string;
};

export function impliedTotals(overUnder: number, homeSpread: number): { home: number; away: number } {
  // homeSpread is negative when the home team is favored, so the favorite gets the larger share.
  return { home: (overUnder - homeSpread) / 2, away: (overUnder + homeSpread) / 2 };
}

export async function getWeekOdds(season: number, week: number, fetchImpl: typeof fetch = fetch): Promise<Record<number, TeamOdds>> {
  const url = `${SCOREBOARD_URL}?week=${week}&seasontype=2&dates=${season}`;
  const res = await fetchImpl(url, { headers: { "User-Agent": "ffdash/1.0", Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`);
  const data = zScoreboard.parse(await res.json());
  const out: Record<number, TeamOdds> = {};
  for (const ev of data.events) {
    const c = ev.competitions[0];
    if (!c) continue;
    const home = c.competitors.find((t) => t.homeAway === "home");
    const away = c.competitors.find((t) => t.homeAway === "away");
    const o = c.odds?.[0];
    if (!home || !away || !o || o.overUnder == null || o.spread == null) continue;
    const homeId = Number(home.team.id);
    const awayId = Number(away.team.id);
    const { home: hPts, away: aPts } = impliedTotals(o.overUnder, o.spread);
    const base = { overUnder: o.overUnder, kickoff: c.date ?? ev.date, provider: o.provider?.name ?? undefined };
    out[homeId] = { proTeamId: homeId, opponentId: awayId, home: true, impliedTotal: round1(hPts), spread: o.spread, ...base };
    out[awayId] = { proTeamId: awayId, opponentId: homeId, home: false, impliedTotal: round1(aPts), spread: -o.spread, ...base };
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** League-average implied team total; falls back to a typical NFL figure when no odds exist. */
export function averageImplied(odds: Record<number, TeamOdds>): number {
  const vals = Object.values(odds).map((o) => o.impliedTotal);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 22.5;
}
