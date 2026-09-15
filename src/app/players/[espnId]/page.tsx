import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ErrorNotice, NotConfigured } from "@/components/notices";
import { StatTile } from "@/components/stat-tile";
import { NotConfiguredError, loadPlayersById } from "@/lib/data";
import { loadPageData } from "@/lib/page-data";
import { getDb, schema } from "@/lib/db";
import { fmt1 } from "@/components/format";
import { SOURCE_IDS, SOURCE_LABELS } from "@/lib/projections/types";
import { STAT } from "@/lib/espn/constants";
import { injuryBadge } from "@/components/format";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params, searchParams }: { params: Promise<{ espnId: string }>; searchParams: Promise<{ week?: string }> }) {
  const { espnId: idStr } = await params;
  const { week } = await searchParams;
  const espnId = Number(idStr);
  if (!Number.isFinite(espnId)) notFound();
  let pd;
  try {
    pd = await loadPageData(week);
  } catch (err) {
    if (err instanceof NotConfiguredError) return <NotConfigured />;
    return <ErrorNotice error={err} />;
  }
  const { bundle, wp } = pd;
  let player = wp.ctx.players.get(espnId);
  if (!player) player = (await loadPlayersById(bundle.creds, bundle.week, [espnId]))[0];
  if (!player) notFound();

  const custom = wp.bySource.custom.get(espnId);
  const meta = (custom?.meta ?? {}) as Record<string, number | boolean | null | undefined>;
  const inj = injuryBadge(player.injuryStatus);
  const owner = bundle.league.teams.find((t) => t.id === player!.teamId);

  // History (needs DB).
  const db = getDb();
  let history: { week: number; source: string; points: number }[] = [];
  let actuals = new Map<number, number>();
  if (db) {
    const [ps, as] = await Promise.all([
      db.select().from(schema.projections).where(and(eq(schema.projections.season, bundle.season), eq(schema.projections.espnId, espnId), eq(schema.projections.isFinal, true))).orderBy(asc(schema.projections.week)),
      db.select().from(schema.actuals).where(and(eq(schema.actuals.season, bundle.season), eq(schema.actuals.espnId, espnId))),
    ]);
    history = ps.map((p) => ({ week: p.week, source: p.source, points: Number(p.points) }));
    actuals = new Map(as.map((a) => [a.week, Number(a.points)]));
  }
  const histWeeks = [...new Set([...history.map((h) => h.week), ...actuals.keys()])].sort((a, b) => a - b);
  const usage = (wp.ctx.usage.get(espnId) ?? []).sort((a, b) => b.season - a.season || b.week - a.week).slice(0, 6);
  const espnRaw = wp.bySource.espn.get(espnId)?.rawStats ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          {player.name}
          {inj && <Badge variant={inj.tone === "bad" ? "destructive" : "secondary"}>{player.injuryStatus}</Badge>}
        </h1>
        <p className="text-sm text-muted-foreground">
          {player.position} · {player.proTeam} · {owner ? `Rostered by ${owner.name}` : player.status ?? "Free agent"} · Week {bundle.week}
          {pd.opponentOf(player.proTeamId) ? ` vs ${pd.opponentOf(player.proTeamId)}` : pd.byeThisWeek(player.proTeamId) ? " · BYE" : ""}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SOURCE_IDS.map((s) => (
          <StatTile key={s} label={SOURCE_LABELS[s]} value={fmt1(wp.bySource[s].get(espnId)?.points)} sub={`± ${fmt1(wp.bySource[s].get(espnId)?.sd)}`} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Model breakdown</CardTitle>
            <CardDescription>How the rules-based projection was built.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">Market prior (ESPN/Sleeper avg)</div>
            <div className="tabular-nums">{fmt1(meta.prior as number)}</div>
            <div className="text-muted-foreground">Volume model (usage × efficiency)</div>
            <div className="tabular-nums">{meta.volumePts == null ? "n/a (insufficient games)" : fmt1(meta.volumePts as number)}</div>
            <div className="text-muted-foreground">Weight on prior</div>
            <div className="tabular-nums">{meta.wPrior != null ? `${Math.round((meta.wPrior as number) * 100)}%` : "–"}</div>
            <div className="text-muted-foreground">Games of usage used</div>
            <div className="tabular-nums">{String(meta.gamesUsed ?? 0)}</div>
            <div className="text-muted-foreground">Opponent factor (DvP)</div>
            <div className="tabular-nums">{meta.dvp != null ? `×${(meta.dvp as number).toFixed(2)}` : "–"}</div>
            <div className="text-muted-foreground">Game script (Vegas)</div>
            <div className="tabular-nums">
              {meta.script != null ? `×${(meta.script as number).toFixed(2)}` : "–"}
              {meta.impliedTotal != null ? ` · implied ${(meta.impliedTotal as number).toFixed(1)} pts, spread ${(meta.spread as number) > 0 ? "+" : ""}${(meta.spread as number).toFixed(1)}` : ""}
            </div>
            <div className="text-muted-foreground">Injury factor</div>
            <div className="tabular-nums">{meta.injury != null ? `×${(meta.injury as number).toFixed(2)}` : "–"}</div>
            <div className="text-muted-foreground">Bye</div>
            <div>{meta.bye ? "yes" : "no"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Season</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">ESPN season projection</div>
            <div className="tabular-nums">{fmt1(player.espnSeasonProj)}</div>
            <div className="text-muted-foreground">Season actual so far</div>
            <div className="tabular-nums">{fmt1(player.seasonActual)}</div>
            <div className="text-muted-foreground">Last season</div>
            <div className="tabular-nums">{fmt1(player.lastSeasonActual)}</div>
            <div className="text-muted-foreground">% rostered (ESPN)</div>
            <div className="tabular-nums">{player.percentOwned != null ? `${player.percentOwned.toFixed(1)}%` : "–"}</div>
            <div className="text-muted-foreground">ESPN proj. line</div>
            <div className="tabular-nums text-xs">
              {[
                espnRaw[STAT.PASS_YDS] ? `${Math.round(espnRaw[STAT.PASS_YDS])} pass yds` : null,
                espnRaw[STAT.PASS_TD] ? `${espnRaw[STAT.PASS_TD].toFixed(1)} pass TD` : null,
                espnRaw[STAT.RUSH_ATT] ? `${espnRaw[STAT.RUSH_ATT].toFixed(1)} car` : null,
                espnRaw[STAT.RUSH_YDS] ? `${Math.round(espnRaw[STAT.RUSH_YDS])} rush yds` : null,
                espnRaw[STAT.REC] ? `${espnRaw[STAT.REC].toFixed(1)} rec` : null,
                espnRaw[STAT.REC_YDS] ? `${Math.round(espnRaw[STAT.REC_YDS])} rec yds` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "–"}
            </div>
          </CardContent>
        </Card>
      </div>
      {usage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent usage</CardTitle>
            <CardDescription>From nflverse weekly stats (most recent first).</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>Opp</TableHead>
                  <TableHead className="text-right">Att</TableHead>
                  <TableHead className="text-right">Car</TableHead>
                  <TableHead className="text-right">Tgt</TableHead>
                  <TableHead className="text-right">Rec</TableHead>
                  <TableHead className="text-right">Yds</TableHead>
                  <TableHead className="text-right">TD</TableHead>
                  <TableHead className="text-right">PPR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.map((u) => (
                  <TableRow key={`${u.season}-${u.week}`}>
                    <TableCell>
                      {u.season} W{u.week}
                    </TableCell>
                    <TableCell>{u.opponent}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.passAtt}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.carries}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.targets}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.receptions}</TableCell>
                    <TableCell className="text-right tabular-nums">{(u.passYds ?? 0) + (u.rushYds ?? 0) + (u.recYds ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{(u.passTd ?? 0) + (u.rushTd ?? 0) + (u.recTd ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt1(Number(u.fptsPpr))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {histWeeks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Projection history</CardTitle>
            <CardDescription>Pre-kickoff snapshots vs actual.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  {SOURCE_IDS.map((s) => (
                    <TableHead key={s} className="text-right">
                      {SOURCE_LABELS[s]}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Actual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {histWeeks.map((w) => (
                  <TableRow key={w}>
                    <TableCell>W{w}</TableCell>
                    {SOURCE_IDS.map((s) => (
                      <TableCell key={s} className="text-right tabular-nums">
                        {fmt1(history.find((h) => h.week === w && h.source === s)?.points)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">{fmt1(actuals.get(w))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
