import { loadLeague, projectWeek, type LeagueBundle, type WeekProjections } from "./data";
import { optimizeLineup, type OptimizedLineup } from "./features/optimizer";
import type { ValueContext } from "./features/replacement";
import { findMatchup, findTeam } from "./league/snapshot";
import type { LeagueTeam } from "./league/types";
import { isOnBye } from "./projections/types";

export type PageData = {
  bundle: LeagueBundle;
  wp: WeekProjections;
  myTeam: LeagueTeam | undefined;
  oppTeam: LeagueTeam | undefined;
  myLineup: OptimizedLineup | undefined;
  oppLineup: OptimizedLineup | undefined;
  valueCtx: ValueContext;
  opponentOf: (proTeamId: number) => string | undefined;
  byeThisWeek: (proTeamId: number) => boolean;
};

/** Everything the feature pages need for a given week. */
export async function loadPageData(weekParam?: string | number, opts: { includeFreeAgents?: boolean } = {}): Promise<PageData> {
  const bundle = await loadLeague(weekParam);
  const wp = await projectWeek(bundle, opts);
  const { league, week, myTeamId } = bundle;
  const consensus = wp.bySource.consensus;
  const myTeam = findTeam(league, myTeamId);
  const matchup = myTeamId != null ? findMatchup(league, myTeamId, week) : undefined;
  const oppId = matchup ? (matchup.homeTeamId === myTeamId ? matchup.awayTeamId : matchup.homeTeamId) : undefined;
  const oppTeam = findTeam(league, oppId);
  const myLineup = myTeam ? optimizeLineup(myTeam.roster, league.slotCounts, consensus) : undefined;
  const oppLineup = oppTeam ? optimizeLineup(oppTeam.roster, league.slotCounts, consensus) : undefined;
  const valueCtx: ValueContext = {
    currentWeek: week,
    finalWeek: league.finalWeek,
    weekProj: consensus,
    byeWeekOf: (proTeamId) => wp.ctx.proTeams[proTeamId]?.byeWeek || undefined,
  };
  const opponentOf = (proTeamId: number) => {
    const opp = wp.ctx.proTeams[proTeamId]?.gamesByWeek[week]?.opponentId;
    return opp != null ? wp.ctx.proTeams[opp]?.abbrev : undefined;
  };
  return { bundle, wp, myTeam, oppTeam, myLineup, oppLineup, valueCtx, opponentOf, byeThisWeek: (id) => isOnBye(wp.ctx, id) };
}
