"use server";
import { loadPageData } from "@/lib/page-data";
import { evaluateTrade, type TradeEvaluation } from "@/lib/features/trade";
import { replacementLevels } from "@/lib/features/replacement";
import { allRosteredPlayers } from "@/lib/league/snapshot";

export type TradeResult = { ok: true; eval: TradeEvaluation; give: { id: number; name: string; ros: number }[]; get: { id: number; name: string; ros: number }[] } | { ok: false; error: string };

export async function evaluateTradeAction(input: { week?: number; give: number[]; get: number[] }): Promise<TradeResult> {
  try {
    const pd = await loadPageData(input.week);
    const { bundle, wp, myTeam } = pd;
    if (!myTeam) return { ok: false, error: "No team selected in settings." };
    const all = new Map(allRosteredPlayers(bundle.league).map((p) => [p.espnId, p]));
    const give = input.give.map((id) => all.get(id)).filter((p): p is NonNullable<typeof p> => !!p && p.teamId === myTeam.id);
    const get = input.get.map((id) => all.get(id)).filter((p): p is NonNullable<typeof p> => !!p && p.teamId !== myTeam.id);
    if (!give.length && !get.length) return { ok: false, error: "Pick at least one player on each side." };
    const repl = replacementLevels(wp.freeAgents, pd.valueCtx, "ros");
    const ev = evaluateTrade(myTeam.roster, { give, get }, bundle.league.slotCounts, pd.valueCtx, repl);
    const { restOfSeasonValue } = await import("@/lib/features/replacement");
    const summarize = (ps: typeof give) => ps.map((p) => ({ id: p.espnId, name: `${p.name} (${p.position})`, ros: restOfSeasonValue(p, pd.valueCtx).total }));
    return { ok: true, eval: ev, give: summarize(give), get: summarize(get) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
