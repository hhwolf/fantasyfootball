import { POSITION_BY_DEFAULT_ID, PRO_TEAM, STAT_SOURCE, STAT_SPLIT, type Position } from "../espn/constants";
import type { EspnLeague, EspnPlayerPoolEntry, EspnRosterEntry } from "../espn/schemas";
import type { LeaguePlayer, LeagueSnapshot, LeagueTeam, StatLine } from "./types";

/** Drop zero/absent stats and round to 2dp to keep snapshots compact. */
function compactRaw(raw: Record<string, number> | undefined | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) if (v) out[k] = Math.round(v * 100) / 100;
  return out;
}

export function toLeaguePlayer(entry: EspnPlayerPoolEntry, season: number, week: number, extra: Partial<LeaguePlayer> = {}): LeaguePlayer | null {
  const p = entry.player;
  const position = POSITION_BY_DEFAULT_ID[p.defaultPositionId];
  if (!position) return null;
  const stats: StatLine[] = [];
  let espnWeekProj: number | undefined;
  let espnSeasonProj: number | undefined;
  let weekActual: number | undefined;
  let seasonActual: number | undefined;
  let lastSeasonActual: number | undefined;
  for (const s of p.stats ?? []) {
    const projected = s.statSourceId === STAT_SOURCE.PROJECTED;
    // Keep payloads small: only this season / last season totals and the requested week, raw line only for this week.
    const isThisWeek = s.seasonId === season && s.statSplitTypeId === STAT_SPLIT.WEEK && s.scoringPeriodId === week;
    const isSeasonTotal = s.statSplitTypeId === STAT_SPLIT.SEASON && (s.seasonId === season || s.seasonId === season - 1);
    if (!isThisWeek && !isSeasonTotal) continue;
    const line: StatLine = { season: s.seasonId, week: s.scoringPeriodId, projected, points: s.appliedTotal ?? 0, raw: isThisWeek ? compactRaw(s.stats) : {} };
    stats.push(line);
    if (s.seasonId === season && s.statSplitTypeId === STAT_SPLIT.WEEK && s.scoringPeriodId === week) {
      if (projected) espnWeekProj = line.points;
      else weekActual = line.points;
    } else if (s.seasonId === season && s.statSplitTypeId === STAT_SPLIT.SEASON) {
      if (projected) espnSeasonProj = line.points;
      else seasonActual = line.points;
    } else if (s.seasonId === season - 1 && s.statSplitTypeId === STAT_SPLIT.SEASON && !projected) {
      lastSeasonActual = line.points;
    }
  }
  return {
    espnId: p.id,
    name: p.fullName ?? [p.firstName, p.lastName].filter(Boolean).join(" ") ?? String(p.id),
    position,
    proTeamId: p.proTeamId ?? 0,
    proTeam: PRO_TEAM[p.proTeamId ?? 0] ?? "FA",
    eligibleSlots: p.eligibleSlots ?? [],
    injuryStatus: p.injuryStatus ?? "ACTIVE",
    percentOwned: p.ownership?.percentOwned ?? undefined,
    espnWeekProj,
    espnSeasonProj,
    weekActual,
    seasonActual,
    lastSeasonActual,
    stats,
    status: entry.status ?? undefined,
    teamId: entry.onTeamId ?? undefined,
    ...extra,
  };
}

function rosterEntryToPlayer(e: EspnRosterEntry, teamId: number, season: number, week: number): LeaguePlayer | null {
  const p = toLeaguePlayer(e.playerPoolEntry, season, week, { lineupSlotId: e.lineupSlotId, teamId, status: "ONTEAM" });
  if (p && e.injuryStatus && p.injuryStatus === "ACTIVE") p.injuryStatus = e.injuryStatus;
  return p;
}

export function normalizeLeague(raw: EspnLeague, week: number): LeagueSnapshot {
  const season = raw.seasonId;
  const settings = raw.settings;
  if (!settings) throw new Error("ESPN response missing settings; request mSettings view");
  const memberName = new Map<string, string>();
  for (const m of raw.members ?? []) memberName.set(m.id, m.displayName ?? [m.firstName, m.lastName].filter(Boolean).join(" "));

  const teams: LeagueTeam[] = (raw.teams ?? []).map((t) => ({
    id: t.id,
    name: t.name ?? [t.location, t.nickname].filter(Boolean).join(" ") ?? `Team ${t.id}`,
    abbrev: t.abbrev ?? `T${t.id}`,
    ownerName: t.primaryOwner ? memberName.get(t.primaryOwner) : t.owners?.[0] ? memberName.get(t.owners[0]) : undefined,
    logo: t.logo ?? undefined,
    wins: t.record?.overall?.wins ?? 0,
    losses: t.record?.overall?.losses ?? 0,
    ties: t.record?.overall?.ties ?? 0,
    pointsFor: t.record?.overall?.pointsFor ?? 0,
    roster: (t.roster?.entries ?? []).map((e) => rosterEntryToPlayer(e, t.id, season, week)).filter((p): p is LeaguePlayer => !!p),
  }));

  const slotCounts: Record<number, number> = {};
  for (const [k, v] of Object.entries(settings.rosterSettings.lineupSlotCounts)) if (v > 0) slotCounts[Number(k)] = v;

  return {
    leagueId: raw.id,
    leagueName: settings.name ?? `League ${raw.id}`,
    season,
    currentWeek: raw.scoringPeriodId,
    week,
    finalWeek: raw.status?.finalScoringPeriod ?? 17,
    slotCounts,
    scoringItems: settings.scoringSettings.scoringItems,
    teams,
    schedule: (raw.schedule ?? []).map((m) => ({
      id: m.id,
      matchupPeriodId: m.matchupPeriodId,
      homeTeamId: m.home?.teamId,
      awayTeamId: m.away?.teamId,
      homePoints: m.home?.totalPoints ?? undefined,
      awayPoints: m.away?.totalPoints ?? undefined,
      winner: m.winner ?? undefined,
    })),
    fetchedAt: new Date().toISOString(),
  };
}

export function allRosteredPlayers(league: LeagueSnapshot): LeaguePlayer[] {
  return league.teams.flatMap((t) => t.roster);
}

export function findTeam(league: LeagueSnapshot, teamId: number | undefined): LeagueTeam | undefined {
  return league.teams.find((t) => t.id === teamId);
}

export function findMatchup(league: LeagueSnapshot, teamId: number, matchupPeriod: number) {
  return league.schedule.find((m) => m.matchupPeriodId === matchupPeriod && (m.homeTeamId === teamId || m.awayTeamId === teamId));
}

export function positionOf(p: { position: Position }): Position {
  return p.position;
}
