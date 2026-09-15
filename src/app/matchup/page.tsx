import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ErrorNotice, NotConfigured } from "@/components/notices";
import { LineupTable } from "@/components/lineup-table";
import { StatTile } from "@/components/stat-tile";
import { NotConfiguredError } from "@/lib/data";
import { loadPageData } from "@/lib/page-data";
import { lineupDistribution, previewMatchup, winProbability } from "@/lib/features/matchup";
import { fmt1, fmtPct } from "@/components/format";
import { currentLineup } from "@/lib/features/current";

export const dynamic = "force-dynamic";

export default async function MatchupPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  let pd;
  try {
    pd = await loadPageData(week, { includeFreeAgents: false });
  } catch (err) {
    if (err instanceof NotConfiguredError) return <NotConfigured />;
    return <ErrorNotice error={err} />;
  }
  const { bundle, wp, myTeam, oppTeam, myLineup, oppLineup } = pd;
  if (!myTeam || !myLineup) return <ErrorNotice error="Could not find your team. Pick it in Settings." />;
  if (!oppTeam || !oppLineup) {
    return (
      <div className="space-y-6">
        <PageHeader title="Matchup" bundle={bundle} />
        <p className="text-muted-foreground">No matchup found for week {bundle.week}.</p>
      </div>
    );
  }
  const consensus = wp.bySource.consensus;
  const optimal = previewMatchup(myLineup, oppLineup, consensus);
  const myCur = lineupDistribution(currentLineup(myTeam.roster), consensus);
  const oppCur = lineupDistribution(currentLineup(oppTeam.roster), consensus);
  const asIs = winProbability(myCur, oppCur);
  const played = bundle.week < bundle.currentWeek;
  return (
    <div className="space-y-6">
      <PageHeader title="Matchup preview" bundle={bundle} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Win prob (both optimal)" value={fmtPct(optimal.winProb)} sub={`${fmt1(optimal.myMean)} ± ${fmt1(optimal.mySd)} vs ${fmt1(optimal.oppMean)} ± ${fmt1(optimal.oppSd)}`} />
        <StatTile label="Win prob (current lineups)" value={fmtPct(asIs)} sub={`${fmt1(myCur.mean)} vs ${fmt1(oppCur.mean)}`} />
        <StatTile label="Your optimal" value={fmt1(myLineup.total)} sub={`current ${fmt1(myLineup.currentTotal)}`} />
        <StatTile label={`${oppTeam.abbrev} optimal`} value={fmt1(oppLineup.total)} sub={`current ${fmt1(oppLineup.currentTotal)}`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{myTeam.name}</CardTitle>
            <CardDescription>{myTeam.wins}-{myTeam.losses}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <LineupTable team={myTeam} lineup={myLineup} bySource={wp.bySource} pd={pd} showActual={played} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{oppTeam.name}</CardTitle>
            <CardDescription>
              {oppTeam.wins}-{oppTeam.losses}
              {oppTeam.ownerName ? ` · ${oppTeam.ownerName}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <LineupTable team={oppTeam} lineup={oppLineup} bySource={wp.bySource} pd={pd} showActual={played} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
