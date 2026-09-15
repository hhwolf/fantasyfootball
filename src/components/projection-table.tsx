import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeaguePlayer } from "@/lib/league/types";
import type { PlayerProjection, ProjectionsBySource } from "@/lib/projections/types";
import { SLOT_NAMES } from "@/lib/espn/constants";
import { PlayerCell } from "./player-cell";
import { fmt1 } from "./format";

export type ProjectionTableRow = {
  player: LeaguePlayer;
  slotId?: number;
  opponent?: string;
  bye?: boolean;
  highlight?: "in" | "out" | null;
};

const SOURCES: { key: keyof ProjectionsBySource; label: string }[] = [
  { key: "espn", label: "ESPN" },
  { key: "sleeper", label: "Sleeper" },
  { key: "custom", label: "Model" },
  { key: "consensus", label: "Consensus" },
];

export function ProjectionTable({ rows, bySource, showSlot = true, showActual = false }: { rows: ProjectionTableRow[]; bySource: ProjectionsBySource; showSlot?: boolean; showActual?: boolean }) {
  const get = (m: Map<number, PlayerProjection>, id: number) => m.get(id)?.points;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showSlot && <TableHead className="w-16">Slot</TableHead>}
          <TableHead>Player</TableHead>
          {SOURCES.map((s) => (
            <TableHead key={s.key} className="text-right">
              {s.label}
            </TableHead>
          ))}
          {showActual && <TableHead className="text-right">Actual</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.player.espnId}-${r.slotId ?? "x"}`} className={r.highlight === "in" ? "bg-emerald-500/10" : r.highlight === "out" ? "bg-amber-500/10" : undefined}>
            {showSlot && <TableCell className="text-xs text-muted-foreground">{r.slotId != null ? SLOT_NAMES[r.slotId] ?? r.slotId : ""}</TableCell>}
            <TableCell>
              <PlayerCell p={r.player} opponent={r.opponent} bye={r.bye} />
            </TableCell>
            {SOURCES.map((s) => (
              <TableCell key={s.key} className={`text-right tabular-nums ${s.key === "consensus" ? "font-semibold" : ""}`}>
                {fmt1(get(bySource[s.key], r.player.espnId))}
              </TableCell>
            ))}
            {showActual && <TableCell className="text-right tabular-nums">{fmt1(r.player.weekActual)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
