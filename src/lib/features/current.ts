import { NON_STARTING_SLOTS } from "../espn/constants";
import type { LeaguePlayer } from "../league/types";
import type { LineupAssignment } from "./optimizer";

/** The lineup as currently set on ESPN (players in starting slots). */
export function currentLineup(roster: LeaguePlayer[]): LineupAssignment[] {
  return roster
    .filter((p) => p.lineupSlotId != null && !NON_STARTING_SLOTS.has(p.lineupSlotId))
    .map((p) => ({ espnId: p.espnId, slotId: p.lineupSlotId! }));
}
