import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/stat-tile";
import { PageHeader } from "@/components/page-header";
import { ErrorNotice, NotConfigured } from "@/components/notices";
import { LineupTable } from "@/components/lineup-table";
import { fmt1, fmtPct, fmtSigned } from "@/components/format";
import { NotConfiguredError } from "@/lib/data";
import { loadPageData } from "@/lib/page-data";
import { previewMatchup } from "@/lib/features/matchup";
import { suggestWaivers } from "@/lib/features/waivers";
import { PlayerCell } from "@/components/player-cell";
import { SLOT_NAMES } from "@/lib/espn/constants";
import { LineupWarnings } from "@/components/lineup-warnings";
import { lineupWarnings } from "@/lib/features/lineup-warnings";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  let pd;
  try {
    pd = await loadPageData(week);
  } catch (err) {
    if (err instanceof NotConfiguredError) return <NotConfigured />;
    return <ErrorNotice error={err} />;
  }
  const { bundle, wp, myTeam, oppTeam, myLineup, oppLineup } = pd;
  if (!myTeam || !myLineup) return <ErrorNotice error="Could not find your team. Pick it in Settings." />;
  const preview = oppLineup ? previewMatchup(myLineup, oppLineup, wp.bySource.consensus) : undefined;
  const waivers = suggestWaivers(wp.freeAgents, myTeam.roster, bundle.league.slotCounts, pd.valueCtx, { limit: 5 });
  const gain = myLineup.total - myLineup.currentTotal;
  const warnings = lineupWarnings(myTeam.roster, bundle.league.slotCounts, pd.byeThisWeek);

  return (
    <div className="space-y-6">
      <PageHeader title={myTeam.name} bundle={bundle} />
      <LineupWarnings warnings={warnings} week={bundle.week} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Projected (optimal)" value={fmt1(myLineup.total)} sub={`current lineup ${fmt1(myLineup.currentTotal)} (${fmtSigned(gain)})`} />
        <StatTile label="Win probability" value={preview ? fmtPct(preview.winProb) : "–"} sub={oppTeam ? `vs ${oppTeam.name} (${fmt1(preview?.oppMean)})` : "no matchup this week"} />
        <StatTile label="Record" value={`${myTeam.wins}-${myTeam.losses}${myTeam.ties ? `-${myTeam.ties}` : ""}`} sub={`${fmt1(myTeam.pointsFor)} points for`} />
        <StatTile label="Lineup changes" value={String(myLineup.changes.filter((c) => c.from !== c.to).length)} sub={myLineup.emptySlots.length ? `${myLineup.emptySlots.length} empty slot(s)` : "vs. your current lineup"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Optimal lineup</CardTitle>
            <Link href={`/lineup?week=${bundle.week}`} className="text-sm underline">
              Details
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <LineupTable team={myTeam} lineup={myLineup} bySource={wp.bySource} pd={pd} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Top waiver adds</CardTitle>
            <Link href={`/waivers?week=${bundle.week}`} className="text-sm underline">
              All
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {waivers.length === 0 && <p className="text-sm text-muted-foreground">No upgrades found.</p>}
            {waivers.map((w) => (
              <div key={w.player.espnId} className="flex items-start justify-between gap-2 text-sm">
                <PlayerCell p={w.player} opponent={pd.opponentOf(w.player.proTeamId)} bye={pd.byeThisWeek(w.player.proTeamId)} />
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{fmtSigned(w.delta)}</div>
                  <div className="text-xs text-muted-foreground">
                    {w.replaces ? `drop ${w.replaces.name}` : "open slot"}
                    {w.startsThisWeek ? " · starts" : ""}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      {myLineup.changes.some((c) => c.from !== c.to) && (
        <Card>
          <CardHeader>
            <CardTitle>Suggested moves</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm sm:grid-cols-2">
            {myLineup.changes
              .filter((c) => c.from !== c.to)
              .map((c) => {
                const p = myTeam.roster.find((x) => x.espnId === c.espnId);
                return (
                  <div key={c.espnId}>
                    <span className="font-medium">{p?.name}</span>: {c.from == null ? "Bench" : SLOT_NAMES[c.from]} → {c.to == null ? "Bench" : SLOT_NAMES[c.to]}
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
