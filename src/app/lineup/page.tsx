import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ErrorNotice, NotConfigured } from "@/components/notices";
import { LineupTable } from "@/components/lineup-table";
import { NotConfiguredError } from "@/lib/data";
import { loadPageData } from "@/lib/page-data";
import { fmt1, fmtSigned } from "@/components/format";

export const dynamic = "force-dynamic";

export default async function LineupPage({ searchParams }: { searchParams: Promise<{ week?: string; team?: string }> }) {
  const { week, team } = await searchParams;
  let pd;
  try {
    pd = await loadPageData(week, { includeFreeAgents: false });
  } catch (err) {
    if (err instanceof NotConfiguredError) return <NotConfigured />;
    return <ErrorNotice error={err} />;
  }
  const { bundle, wp } = pd;
  const teamId = team ? Number(team) : bundle.myTeamId;
  const t = bundle.league.teams.find((x) => x.id === teamId) ?? pd.myTeam;
  if (!t) return <ErrorNotice error="No team found." />;
  const lineup = t.id === pd.myTeam?.id && pd.myLineup ? pd.myLineup : (await import("@/lib/features/optimizer")).optimizeLineup(t.roster, bundle.league.slotCounts, wp.bySource.consensus);
  const played = bundle.week < bundle.currentWeek;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Lineup optimizer"
        bundle={bundle}
        right={
          <form className="flex items-center gap-2">
            <input type="hidden" name="week" value={bundle.week} />
            <select name="team" defaultValue={t.id} className="h-8 rounded-md border bg-background px-2 text-sm" onChange={undefined}>
              {bundle.league.teams.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <button className="h-8 rounded-md border px-2 text-sm">Go</button>
          </form>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>{t.name}</CardTitle>
          <CardDescription>
            Optimal {fmt1(lineup.total)} vs current {fmt1(lineup.currentTotal)} ({fmtSigned(lineup.total - lineup.currentTotal)}) by consensus. Green rows move into the lineup, amber rows move to the bench.
            {" "}Sleeper coverage {Math.round(wp.sleeperCoverage * 100)}%, usage data {Math.round(wp.usageCoverage * 100)}%.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <LineupTable team={t} lineup={lineup} bySource={wp.bySource} pd={pd} showActual={played} />
        </CardContent>
      </Card>
    </div>
  );
}
