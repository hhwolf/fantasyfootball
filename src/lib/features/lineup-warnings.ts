import { NON_STARTING_SLOTS, SLOT_NAMES } from "../espn/constants";
import type { LeaguePlayer } from "../league/types";
import { expandSlots } from "./optimizer";

export type LineupWarning = { kind: "out" | "doubtful" | "questionable" | "bye" | "empty"; text: string };

const BAD = new Set(["OUT", "INJURY_RESERVE", "IR", "SUSPENSION", "SUSPENDED", "PUP"]);

/** Problems with the lineup as currently set on ESPN. Pure so it can be unit-tested. */
export function lineupWarnings(roster: LeaguePlayer[], slotCounts: Record<number, number>, isBye: (proTeamId: number) => boolean): LineupWarning[] {
  const out: LineupWarning[] = [];
  const starters = roster.filter((p) => p.lineupSlotId != null && !NON_STARTING_SLOTS.has(p.lineupSlotId));
  for (const p of starters) {
    const s = (p.injuryStatus ?? "").toUpperCase();
    const slot = SLOT_NAMES[p.lineupSlotId!] ?? String(p.lineupSlotId);
    if (isBye(p.proTeamId)) out.push({ kind: "bye", text: `${p.name} (${slot}) is on bye.` });
    else if (BAD.has(s)) out.push({ kind: "out", text: `${p.name} (${slot}) is ${s.replace(/_/g, " ").toLowerCase()}.` });
    else if (s === "DOUBTFUL") out.push({ kind: "doubtful", text: `${p.name} (${slot}) is doubtful.` });
    else if (s === "QUESTIONABLE") out.push({ kind: "questionable", text: `${p.name} (${slot}) is questionable. Check status before kickoff.` });
  }
  const filled = new Map<number, number>();
  for (const p of starters) filled.set(p.lineupSlotId!, (filled.get(p.lineupSlotId!) ?? 0) + 1);
  for (const slot of new Set(expandSlots(slotCounts))) {
    const missing = (slotCounts[slot] ?? 0) - (filled.get(slot) ?? 0);
    if (missing > 0) out.push({ kind: "empty", text: `${missing} empty ${SLOT_NAMES[slot] ?? slot} slot${missing > 1 ? "s" : ""}.` });
  }
  const order = { out: 0, bye: 0, empty: 1, doubtful: 2, questionable: 3 };
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}

