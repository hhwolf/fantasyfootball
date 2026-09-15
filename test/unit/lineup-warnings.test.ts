import { describe, expect, it } from "vitest";
import { lineupWarnings } from "@/lib/features/lineup-warnings";
import { mkPlayer } from "../helpers/players";

describe("lineupWarnings", () => {
  const slots = { 0: 1, 2: 2, 4: 2, 6: 1, 20: 5 };
  it("flags out/bye/questionable starters and empty slots, severe first", () => {
    const roster = [
      mkPlayer({ espnId: 1, name: "QB1", position: "QB", lineupSlotId: 0, injuryStatus: "QUESTIONABLE" }),
      mkPlayer({ espnId: 2, name: "RB1", position: "RB", lineupSlotId: 2, injuryStatus: "OUT" }),
      mkPlayer({ espnId: 3, name: "RB2", position: "RB", lineupSlotId: 2, proTeamId: 99 }),
      mkPlayer({ espnId: 4, name: "WR1", position: "WR", lineupSlotId: 4 }),
      mkPlayer({ espnId: 5, name: "WRb", position: "WR", lineupSlotId: 20, injuryStatus: "OUT" }),
    ];
    const w = lineupWarnings(roster, slots, (id) => id === 99);
    expect(w.map((x) => x.kind)).toEqual(["out", "bye", "empty", "empty", "questionable"]);
    expect(w.find((x) => x.kind === "bye")?.text).toContain("RB2");
    expect(w.filter((x) => x.kind === "empty").map((x) => x.text)).toEqual(["1 empty WR slot.", "1 empty TE slot."]);
  });
  it("is empty for a healthy full lineup", () => {
    const roster = [
      mkPlayer({ espnId: 1, position: "QB", lineupSlotId: 0 }),
      mkPlayer({ espnId: 2, position: "RB", lineupSlotId: 2 }),
      mkPlayer({ espnId: 3, position: "RB", lineupSlotId: 2 }),
      mkPlayer({ espnId: 4, position: "WR", lineupSlotId: 4 }),
      mkPlayer({ espnId: 5, position: "WR", lineupSlotId: 4 }),
      mkPlayer({ espnId: 6, position: "TE", lineupSlotId: 6 }),
    ];
    expect(lineupWarnings(roster, slots, () => false)).toEqual([]);
  });
});
