import { describe, expect, it } from "vitest";
import { MODEL_PARAMS, recentGames, scriptFactor, volumeStatLine } from "@/lib/projections/sources/custom";
import type { UsageRow } from "@/lib/db/schema";

const row = (season: number, week: number, o: Partial<UsageRow> = {}): UsageRow =>
  ({ season, week, gsisId: "x", position: "WR", team: "DET", opponent: "GB", passAtt: 0, passYds: 0, passTd: 0, passInt: 0, carries: 0, rushYds: 0, rushTd: 0, targets: 8, receptions: 5, recYds: 70, recTd: 0.5, airYards: 0, fumLost: 0, fptsPpr: "12", ...o }) as UsageRow;

describe("scriptFactor", () => {
  it("is neutral without odds", () => {
    expect(scriptFactor("WR", undefined, undefined, 22.5)).toBe(1);
  });
  it("rewards high implied totals and clamps", () => {
    expect(scriptFactor("WR", 27, 20, 22.5)).toBeGreaterThan(1);
    expect(scriptFactor("WR", 40, 20, 22.5)).toBe(MODEL_PARAMS.scriptClamp[1]);
    expect(scriptFactor("RB", 27, 20, 22.5)).toBeLessThan(scriptFactor("WR", 27, 20, 22.5));
  });
  it("inverts for defenses", () => {
    expect(scriptFactor("DST", 20, 30, 22.5)).toBeLessThan(1);
    expect(scriptFactor("DST", 20, 15, 22.5)).toBeGreaterThan(1);
  });
});

describe("usage window", () => {
  it("uses prior-season games early, current-season games later", () => {
    const rows = [row(2025, 17), row(2025, 18), row(2026, 1), row(2026, 2), row(2026, 3), row(2026, 4)];
    const early = recentGames(rows, 2026, 2);
    expect(early.map((g) => `${g.row.season}-${g.row.week}`)).toEqual(["2026-1", "2025-18", "2025-17"]);
    expect(early[1].weight).toBe(MODEL_PARAMS.priorSeasonWeight);
    const later = recentGames(rows, 2026, 5);
    expect(later.every((g) => g.row.season === 2026)).toBe(true);
    expect(later[0].row.week).toBe(4);
  });
  it("needs a minimum number of games", () => {
    expect(volumeStatLine("WR", [{ row: row(2026, 1), weight: 1 }])).toBeNull();
    const line = volumeStatLine("WR", [{ row: row(2026, 1), weight: 1 }, { row: row(2026, 2), weight: 1 }]);
    expect(line?.[58]).toBeCloseTo(8);
    expect(line?.[42]).toBeGreaterThan(50);
  });
});
