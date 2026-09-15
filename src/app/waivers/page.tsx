import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { ErrorNotice, NotConfigured } from "@/components/notices";
import { PlayerCell } from "@/components/player-cell";
import { NotConfiguredError } from "@/lib/data";
import { loadPageData } from "@/lib/page-data";
import { suggestWaivers } from "@/lib/features/waivers";
import { fmt1, fmtSigned } from "@/components/format";

export const dynamic = "force-dynamic";

export default async function WaiversPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  let pd;
  try {
    pd = await loadPageData(week);
  } catch (err) {
    if (err instanceof NotConfiguredError) return <NotConfigured />;
    return <ErrorNotice error={err} />;
  }
  const { bundle, wp, myTeam } = pd;
  if (!myTeam) return <ErrorNotice error="Could not find your team. Pick it in Settings." />;
  const suggestions = suggestWaivers(wp.freeAgents, myTeam.roster, bundle.league.slotCounts, pd.valueCtx, { limit: 30 });
  return (
    <div className="space-y-6">
      <PageHeader title="Waiver wire" bundle={bundle} />
      <Card>
        <CardHeader>
          <CardTitle>Recommended adds</CardTitle>
          <CardDescription>
            Ranked by projected value over the next 3 weeks compared with the weakest player you could drop at that position. {wp.freeAgents.length} free agents scanned.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Add</TableHead>
                <TableHead className="text-right">This week</TableHead>
                <TableHead className="text-right">Next 3</TableHead>
                <TableHead className="text-right">ROS</TableHead>
                <TableHead>Drop</TableHead>
                <TableHead className="text-right">Δ next 3</TableHead>
                <TableHead className="text-right">Lineup Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map((s) => (
                <TableRow key={s.player.espnId}>
                  <TableCell>
                    <PlayerCell p={s.player} opponent={pd.opponentOf(s.player.proTeamId)} bye={pd.byeThisWeek(s.player.proTeamId)} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt1(s.valueNow)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt1(s.valueNext3)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt1(s.ros)}</TableCell>
                  <TableCell className="text-sm">{s.replaces ? `${s.replaces.name} (${s.replaces.position})` : <span className="text-muted-foreground">open slot</span>}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{fmtSigned(s.delta)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtSigned(s.lineupGain)} {s.startsThisWeek && <Badge variant="secondary">starts</Badge>}
                  </TableCell>
                </TableRow>
              ))}
              {suggestions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No free agent improves your roster right now.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
