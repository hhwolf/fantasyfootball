import { describe, expect, it } from "vitest";
import { computeAccuracy } from "@/lib/accuracy/compute";
import { deriveConsensusWeights, type WeeklyAccuracy } from "@/lib/accuracy/weights";

describe("computeAccuracy", () => {
  it("computes MAE/RMSE/bias on known vectors", () => {
    const rows = [
      { espnId: 1, position: "RB" as const, source: "espn" as const, projected: 10, actual: 12 },
      { espnId: 2, position: "RB" as const, source: "espn" as const, projected: 14, actual: 10 },
    ];
    const [all, rb] = computeAccuracy(rows).sort((a, b) => a.position.localeCompare(b.position));
    expect(rb.position).toBe("RB");
    expect(rb.n).toBe(2);
    expect(rb.mae).toBe(3);
    expect(rb.rmse).toBeCloseTo(Math.sqrt(10), 3);
    expect(rb.bias).toBe(1);
    expect(all.position).toBe("ALL");
  });
  it("skips irrelevant rows", () => {
    expect(computeAccuracy([{ espnId: 1, position: "WR", source: "espn", projected: 0.5, actual: 0 }])).toEqual([]);
  });
});

describe("deriveConsensusWeights", () => {
  const mk = (week: number, source: WeeklyAccuracy["source"], rmse: number): WeeklyAccuracy => ({ week, source, position: "ALL", n: 50, rmse });
  it("returns null with too few weeks", () => {
    expect(deriveConsensusWeights([mk(1, "espn", 6), mk(1, "sleeper", 6)])).toBeNull();
  });
  it("favors lower RMSE and normalizes to 1", () => {
    const rows: WeeklyAccuracy[] = [];
    for (const w of [1, 2, 3]) rows.push(mk(w, "espn", 5), mk(w, "sleeper", 7), mk(w, "custom", 9));
    const res = deriveConsensusWeights(rows)!;
    const all = res.ALL;
    expect(all.espn).toBeGreaterThan(all.sleeper);
    expect(all.sleeper).toBeGreaterThan(all.custom);
    expect(all.espn + all.sleeper + all.custom).toBeCloseTo(1, 2);
    expect(all.custom).toBeGreaterThanOrEqual(0.09);
  });
});
