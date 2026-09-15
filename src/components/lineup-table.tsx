import type { LeagueTeam } from "@/lib/league/types";
import type { OptimizedLineup } from "@/lib/features/optimizer";
import type { ProjectionsBySource } from "@/lib/projections/types";
import { ProjectionTable, type ProjectionTableRow } from "./projection-table";
import type { PageData } from "@/lib/page-data";

/** Optimized starters first (slot order), then bench, then IR. Highlights changes vs current lineup. */
export function LineupTable({ team, lineup, bySource, pd, showActual }: { team: LeagueTeam; lineup: OptimizedLineup; bySource: ProjectionsBySource; pd: PageData; showActual?: boolean }) {
  const byId = new Map(team.roster.map((p) => [p.espnId, p]));
  const changed = new Map(lineup.changes.map((c) => [c.espnId, c]));
  const rows: ProjectionTableRow[] = [];
  for (const s of lineup.starters) {
    const p = byId.get(s.espnId);
    if (!p) continue;
    const c = changed.get(p.espnId);
    rows.push({ player: p, slotId: s.slotId, opponent: pd.opponentOf(p.proTeamId), bye: pd.byeThisWeek(p.proTeamId), highlight: c && c.to != null && c.from !== c.to ? "in" : null });
  }
  for (const id of lineup.bench) {
    const p = byId.get(id);
    if (!p) continue;
    const c = changed.get(id);
    rows.push({ player: p, slotId: 20, opponent: pd.opponentOf(p.proTeamId), bye: pd.byeThisWeek(p.proTeamId), highlight: c && c.to == null && c.from != null ? "out" : null });
  }
  for (const id of lineup.ir) {
    const p = byId.get(id);
    if (p) rows.push({ player: p, slotId: 21, opponent: pd.opponentOf(p.proTeamId), bye: pd.byeThisWeek(p.proTeamId) });
  }
  return <ProjectionTable rows={rows} bySource={bySource} showActual={showActual} />;
}
