import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { LeaguePlayer } from "@/lib/league/types";
import { injuryBadge } from "./format";

export function PlayerCell({ p, opponent, bye }: { p: LeaguePlayer; opponent?: string; bye?: boolean }) {
  const inj = injuryBadge(p.injuryStatus);
  return (
    <div className="flex flex-col leading-tight">
      <div className="flex items-center gap-1.5">
        <Link href={`/players/${p.espnId}`} className="font-medium hover:underline">
          {p.name}
        </Link>
        {inj && (
          <Badge variant={inj.tone === "bad" ? "destructive" : "secondary"} className="px-1 py-0 text-[10px]">
            {inj.label}
          </Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {p.position} · {p.proTeam}
        {bye ? " · BYE" : opponent ? ` · vs ${opponent}` : ""}
      </div>
    </div>
  );
}
