import { describe, expect, it } from "vitest";
import fixture from "../fixtures/espn/league-week1.json";
import { zLeague } from "@/lib/espn/schemas";
import { scoreStats } from "@/lib/espn/scoring";
import { normalizeLeague } from "@/lib/league/snapshot";
import { POSITION_BY_DEFAULT_ID } from "@/lib/espn/constants";

describe("ESPN scoring against real appliedTotal", () => {
  const league = zLeague.parse(fixture);
  const items = league.settings!.scoringSettings.scoringItems;

  it("parses a real league payload and normalizes it", () => {
    const snap = normalizeLeague(league, 1);
    expect(snap.teams.length).toBe(10);
    expect(Object.keys(snap.slotCounts).length).toBeGreaterThan(0);
    // TQB pseudo-players are kept as QBs restricted to slot 1.
    const tqb = snap.teams.flatMap((t) => t.roster).find((p) => p.name.endsWith("TQB"));
    expect(tqb?.position).toBe("QB");
    expect(tqb?.eligibleSlots).toContain(1);
  });

  it("re-scores every offensive player's projected raw line to ESPN's appliedTotal", () => {
    let checked = 0;
    for (const t of league.teams ?? []) {
      for (const e of t.roster?.entries ?? []) {
        const p = e.playerPoolEntry.player;
        const position = POSITION_BY_DEFAULT_ID[p.defaultPositionId];
        if (!position || position === "DST") continue;
        const line = p.stats.find((s) => s.id === "1120261");
        if (!line?.stats) continue;
        const ours = scoreStats(line.stats, items, position);
        expect(Math.abs(ours - (line.appliedTotal ?? 0)), `${p.fullName} (${position})`).toBeLessThan(0.05);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("D/ST re-score is within a few points (ESPN applies opaque tier logic)", () => {
    for (const t of league.teams ?? []) {
      for (const e of t.roster?.entries ?? []) {
        const p = e.playerPoolEntry.player;
        if (p.defaultPositionId !== 16) continue;
        const line = p.stats.find((s) => s.id === "1120261");
        if (!line?.stats) continue;
        const ours = scoreStats(line.stats, items, "DST");
        expect(Math.abs(ours - (line.appliedTotal ?? 0)), p.fullName ?? "").toBeLessThan(4);
      }
    }
  });
});
