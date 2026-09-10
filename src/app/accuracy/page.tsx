import { and, desc, eq, inArray } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NeedsDb } from "@/components/notices";
import { MaeChart, WeightsChart } from "@/components/accuracy-charts";
import { getDb, schema } from "@/lib/db";
import { loadSettings } from "@/lib/settings";
import { POSITIONS } from "@/lib/espn/constants";
import { DEFAULT_WEIGHTS } from "@/lib/projections/sources/consensus";
import { SOURCE_IDS, SOURCE_LABELS } from "@/lib/projections/types";
import { fmt1 } from "@/components/format";

export const dynamic = "force-dynamic";

export default async function AccuracyPage() {
  const db = getDb();
  if (!db) return <NeedsDb what="The accuracy tracker" />;
  const settings = await loadSettings();
  const season = settings.season ?? new Date().getFullYear();
  const rows = await db.select().from(schema.accuracy).where(eq(schema.accuracy.season, season));
  const weeks = [...new Set(rows.map((r) => r.week))].sort((a, b) => a - b);

  const series = (position: string) =>
    weeks.map((w) => {
      const o: Record<string, number | string> = { week: w };
      for (const s of SOURCE_IDS) {
        const r = rows.find((x) => x.week === w && x.source === s && x.position === position);
        if (r) o[s] = Number(r.mae);
      }
      return o;
    });

  const weights = POSITIONS.map((p) => ({ position: p, ...DEFAULT_WEIGHTS, ...(settings.consensusWeights?.[p] ?? settings.consensusWeights?.ALL ?? {}) }));

  // Biggest misses last completed week (consensus).
  const lastWeek = weeks.at(-1);
  let misses: { name: string; position: string; projected: number; actual: number }[] = [];
  if (lastWeek) {
    const proj = await db
      .select()
      .from(schema.projections)
      .where(and(eq(schema.projections.season, season), eq(schema.projections.week, lastWeek), eq(schema.projections.source, "consensus"), eq(schema.projections.isFinal, true)));
    const ids = proj.map((p) => p.espnId);
    if (ids.length) {
      const [acts, ps] = await Promise.all([
        db.select().from(schema.actuals).where(and(eq(schema.actuals.season, season), eq(schema.actuals.week, lastWeek), inArray(schema.actuals.espnId, ids))),
        db.select().from(schema.players).where(inArray(schema.players.espnId, ids)),
      ]);
      const act = new Map(acts.map((a) => [a.espnId, Number(a.points)]));
      const pl = new Map(ps.map((p) => [p.espnId, p]));
      misses = proj
        .filter((p) => act.has(p.espnId))
        .map((p) => ({ name: pl.get(p.espnId)?.name ?? String(p.espnId), position: pl.get(p.espnId)?.position ?? "", projected: Number(p.points), actual: act.get(p.espnId)! }))
        .sort((a, b) => Math.abs(b.projected - b.actual) - Math.abs(a.projected - a.actual))
        .slice(0, 12);
    }
  }
  const latest = lastWeek ? rows.filter((r) => r.week === lastWeek && r.position === "ALL").sort((a, b) => Number(a.mae) - Number(b.mae)) : [];
  void desc;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Projection accuracy</h1>
        <p className="text-sm text-muted-foreground">
          Mean absolute error per source, by week. Snapshots are taken before kickoff and compared with actuals every Tuesday. {weeks.length} week(s) tracked.
        </p>
      </div>
      {weeks.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No completed weeks yet. Once the daily cron has snapshotted projections and recorded a week of actuals, charts appear here. You can trigger it manually with
            <code className="ml-1 rounded bg-muted px-1">/api/cron/daily?jobs=snapshotProjections</code> and, after the games, <code className="rounded bg-muted px-1">?jobs=recordActuals</code>.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {latest.map((r) => (
              <Card key={r.source}>
                <CardContent className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">{SOURCE_LABELS[r.source as keyof typeof SOURCE_LABELS] ?? r.source} MAE (wk {lastWeek})</div>
                  <div className="text-2xl font-semibold tabular-nums">{fmt1(Number(r.mae))}</div>
                  <div className="text-xs text-muted-foreground">
                    RMSE {fmt1(Number(r.rmse))} · bias {Number(r.bias) >= 0 ? "+" : ""}
                    {fmt1(Number(r.bias))} · n={r.n}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>MAE by week</CardTitle>
              <CardDescription>Lower is better.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="ALL">
                <TabsList>
                  {["ALL", ...POSITIONS].map((p) => (
                    <TabsTrigger key={p} value={p}>
                      {p}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {["ALL", ...POSITIONS].map((p) => (
                  <TabsContent key={p} value={p}>
                    <MaeChart data={series(p)} sources={[...SOURCE_IDS]} />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Consensus weights</CardTitle>
            <CardDescription>{settings.consensusWeights ? "Tuned from trailing accuracy (inverse MSE)." : "Defaults until 3 weeks of accuracy data exist."}</CardDescription>
          </CardHeader>
          <CardContent>
            <WeightsChart data={weights} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Biggest misses{lastWeek ? ` (week ${lastWeek})` : ""}</CardTitle>
            <CardDescription>Consensus projection vs actual.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Proj</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Miss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {misses.map((m) => (
                  <TableRow key={m.name}>
                    <TableCell>
                      {m.name} <span className="text-muted-foreground">{m.position}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt1(m.projected)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt1(m.actual)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt1(m.actual - m.projected)}</TableCell>
                  </TableRow>
                ))}
                {misses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No data yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
