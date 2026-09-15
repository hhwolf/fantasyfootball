import { z } from "zod";

const numRecord = z.record(z.string(), z.number());

export const zStat = z
  .object({
    id: z.string().nullish(),
    seasonId: z.number(),
    scoringPeriodId: z.number(),
    statSourceId: z.number(),
    statSplitTypeId: z.number(),
    proTeamId: z.number().nullish(),
    appliedTotal: z.number().nullish().transform((v) => v ?? 0),
    appliedAverage: z.number().nullish(),
    appliedStats: numRecord.nullish(),
    stats: numRecord.nullish(),
  })
  .loose();
export type EspnStat = z.infer<typeof zStat>;

export const zPlayer = z
  .object({
    id: z.number(),
    fullName: z.string().nullish(),
    firstName: z.string().nullish(),
    lastName: z.string().nullish(),
    defaultPositionId: z.number(),
    proTeamId: z.number().nullish().transform((v) => v ?? 0),
    eligibleSlots: z.array(z.number()).nullish().transform((v) => v ?? []),
    injuryStatus: z.string().nullish(),
    injured: z.boolean().nullish(),
    active: z.boolean().nullish(),
    stats: z.array(zStat).nullish().transform((v) => v ?? []),
    ownership: z
      .object({
        percentOwned: z.number().nullish(),
        percentStarted: z.number().nullish(),
        percentChange: z.number().nullish(),
      })
      .loose()
      .nullish(),
  })
  .loose();
export type EspnPlayer = z.infer<typeof zPlayer>;

export const zPlayerPoolEntry = z
  .object({
    id: z.number(),
    onTeamId: z.number().nullish(),
    status: z.string().nullish(),
    appliedStatTotal: z.number().nullish(),
    player: zPlayer,
  })
  .loose();
export type EspnPlayerPoolEntry = z.infer<typeof zPlayerPoolEntry>;

export const zRosterEntry = z
  .object({
    playerId: z.number(),
    lineupSlotId: z.number(),
    acquisitionType: z.string().nullish(),
    injuryStatus: z.string().nullish(),
    playerPoolEntry: zPlayerPoolEntry,
  })
  .loose();
export type EspnRosterEntry = z.infer<typeof zRosterEntry>;

export const zTeam = z
  .object({
    id: z.number(),
    abbrev: z.string().nullish(),
    name: z.string().nullish(),
    location: z.string().nullish(),
    nickname: z.string().nullish(),
    logo: z.string().nullish(),
    owners: z.array(z.string()).nullish(),
    primaryOwner: z.string().nullish(),
    record: z
      .object({
        overall: z
          .object({ wins: z.number(), losses: z.number(), ties: z.number(), pointsFor: z.number().nullish(), pointsAgainst: z.number().nullish() })
          .loose()
          .nullish(),
      })
      .loose()
      .nullish(),
    roster: z.object({ entries: z.array(zRosterEntry) }).loose().nullish(),
    playoffSeed: z.number().nullish(),
  })
  .loose();
export type EspnTeam = z.infer<typeof zTeam>;

export const zMember = z
  .object({ id: z.string(), displayName: z.string().nullish(), firstName: z.string().nullish(), lastName: z.string().nullish() })
  .loose();

export const zScoringItem = z
  .object({
    statId: z.number(),
    points: z.number(),
    pointsOverrides: z.record(z.string(), z.number()).nullish(),
    isReverseItem: z.boolean().nullish(),
  })
  .loose();
export type ScoringItem = z.infer<typeof zScoringItem>;

export const zSettings = z
  .object({
    name: z.string().nullish(),
    size: z.number().nullish(),
    rosterSettings: z
      .object({
        lineupSlotCounts: z.record(z.string(), z.number()),
        positionLimits: z.record(z.string(), z.number()).nullish(),
      })
      .loose(),
    scoringSettings: z
      .object({
        scoringItems: z.array(zScoringItem),
        scoringType: z.string().nullish(),
        playoffMatchupPeriodLength: z.number().nullish(),
      })
      .loose(),
    scheduleSettings: z
      .object({
        matchupPeriodCount: z.number().nullish(),
        matchupPeriods: z.record(z.string(), z.array(z.number())).nullish(),
        playoffTeamCount: z.number().nullish(),
      })
      .loose()
      .nullish(),
  })
  .loose();
export type EspnSettings = z.infer<typeof zSettings>;

export const zStatus = z
  .object({
    currentMatchupPeriod: z.number(),
    latestScoringPeriod: z.number().nullish(),
    firstScoringPeriod: z.number().nullish(),
    finalScoringPeriod: z.number().nullish(),
    isActive: z.boolean().nullish(),
    previousSeasons: z.array(z.number()).nullish(),
  })
  .loose();

const zMatchupSide = z
  .object({
    teamId: z.number(),
    totalPoints: z.number().nullish(),
    totalPointsLive: z.number().nullish(),
    totalProjectedPointsLive: z.number().nullish(),
    pointsByScoringPeriod: z.record(z.string(), z.number()).nullish(),
    rosterForCurrentScoringPeriod: z.object({ entries: z.array(zRosterEntry) }).loose().nullish(),
  })
  .loose();

export const zMatchup = z
  .object({
    id: z.number(),
    matchupPeriodId: z.number(),
    home: zMatchupSide.nullish(),
    away: zMatchupSide.nullish(),
    winner: z.string().nullish(),
    playoffTierType: z.string().nullish(),
  })
  .loose();
export type EspnMatchup = z.infer<typeof zMatchup>;

/** Full league response; every view is optional since we request combinations. */
export const zLeague = z
  .object({
    id: z.number(),
    seasonId: z.number(),
    scoringPeriodId: z.number(),
    segmentId: z.number().nullish(),
    status: zStatus.nullish(),
    settings: zSettings.nullish(),
    teams: z.array(zTeam).nullish(),
    members: z.array(zMember).nullish(),
    schedule: z.array(zMatchup).nullish(),
    players: z.array(zPlayerPoolEntry).nullish(),
  })
  .loose();
export type EspnLeague = z.infer<typeof zLeague>;

export const zGameRoot = z
  .object({
    currentSeasonId: z.number().nullish(),
    currentScoringPeriod: z.object({ id: z.number() }).loose().nullish(),
  })
  .loose();

export const zProTeamSchedules = z
  .object({
    settings: z
      .object({
        proTeams: z.array(
          z
            .object({
              id: z.number(),
              abbrev: z.string().nullish(),
              byeWeek: z.number().nullish(),
              proGamesByScoringPeriod: z
                .record(
                  z.string(),
                  z.array(
                    z
                      .object({
                        id: z.number().nullish(),
                        date: z.number().nullish(),
                        homeProTeamId: z.number().nullish(),
                        awayProTeamId: z.number().nullish(),
                        scoringPeriodId: z.number().nullish(),
                      })
                      .loose(),
                  ),
                )
                .nullish(),
            })
            .loose(),
        ),
      })
      .loose(),
  })
  .loose();
export type EspnProTeamSchedules = z.infer<typeof zProTeamSchedules>;

/** Response shape for player-pool views (kona_player_info, kona_playercard): no league metadata. */
export const zPlayerPool = z
  .object({
    players: z.array(zPlayerPoolEntry).nullish().transform((v) => v ?? []),
  })
  .loose();
export type EspnPlayerPool = z.infer<typeof zPlayerPool>;
