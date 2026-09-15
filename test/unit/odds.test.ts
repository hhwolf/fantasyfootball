import { describe, expect, it } from "vitest";
import { averageImplied, getWeekOdds, impliedTotals } from "@/lib/espn/odds";

describe("odds", () => {
  it("splits the total by the spread, favorite gets more", () => {
    expect(impliedTotals(48.5, -3.5)).toEqual({ home: 26, away: 22.5 });
    expect(impliedTotals(44, 6)).toEqual({ home: 19, away: 25 });
  });
  it("parses a scoreboard payload into per-team odds", async () => {
    const payload = {
      events: [
        {
          date: "2026-09-11T00:35Z",
          competitions: [
            {
              competitors: [
                { homeAway: "home", team: { id: "14", abbreviation: "LAR" } },
                { homeAway: "away", team: { id: 25, abbreviation: "SF" } },
              ],
              odds: [{ overUnder: 48.5, spread: -3.5, provider: { name: "DraftKings" } }],
            },
          ],
        },
        { competitions: [{ competitors: [{ homeAway: "home", team: { id: "1" } }, { homeAway: "away", team: { id: "2" } }], odds: [] }] },
      ],
    };
    const fetchImpl = (async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const odds = await getWeekOdds(2026, 1, fetchImpl);
    expect(odds[14]).toMatchObject({ opponentId: 25, home: true, impliedTotal: 26, spread: -3.5 });
    expect(odds[25]).toMatchObject({ opponentId: 14, home: false, impliedTotal: 22.5, spread: 3.5 });
    expect(odds[1]).toBeUndefined();
    expect(averageImplied(odds)).toBeCloseTo(24.25);
    expect(averageImplied({})).toBe(22.5);
  });
});
