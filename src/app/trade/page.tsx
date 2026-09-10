import { PageHeader } from "@/components/page-header";
import { ErrorNotice, NotConfigured } from "@/components/notices";
import { NotConfiguredError } from "@/lib/data";
import { loadPageData } from "@/lib/page-data";
import { restOfSeasonValue } from "@/lib/features/replacement";
import { TradeBuilder, type TradeTeam } from "./trade-builder";

export const dynamic = "force-dynamic";

export default async function TradePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
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
  const toTeam = (t: typeof myTeam): TradeTeam => ({
    id: t.id,
    name: t.name,
    roster: t.roster.map((p) => ({
      espnId: p.espnId,
      name: p.name,
      position: p.position,
      proTeam: p.proTeam,
      teamId: t.id,
      ros: restOfSeasonValue(p, pd.valueCtx).total,
      weekProj: wp.bySource.consensus.get(p.espnId)?.points,
    })),
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Trade analyzer" bundle={bundle} />
      <p className="text-sm text-muted-foreground">
        Values are rest-of-season projected points (consensus this week, ESPN season pace afterwards, byes and injuries applied). Value over replacement subtracts the best free agent at each position.
      </p>
      <TradeBuilder myTeam={toTeam(myTeam)} others={bundle.league.teams.filter((t) => t.id !== myTeam.id).map(toTeam)} week={bundle.week} />
    </div>
  );
}
