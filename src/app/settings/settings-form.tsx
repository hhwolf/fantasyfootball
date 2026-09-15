"use client";
import { useActionState } from "react";
import { testConnectionAction, type SettingsState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Props = {
  initial: { leagueId?: string; season?: number; espnS2Masked?: string; swidMasked?: string; myTeamId?: number; hasDb: boolean; source: string };
  teams: { id: number; name: string }[];
};

export function SettingsForm({ initial, teams }: Props) {
  const [state, action, pending] = useActionState<SettingsState | undefined, FormData>(testConnectionAction, undefined);
  const teamOptions = state?.teams?.length ? state.teams : teams;
  return (
    <form action={action} className="space-y-5">
      {!initial.hasDb && (
        <Alert>
          <AlertDescription>
            No database configured. Settings are read from environment variables (ESPN_LEAGUE_ID, ESPN_S2, SWID, ESPN_TEAM_ID) and cannot be saved here.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="leagueId">ESPN League ID</Label>
          <Input id="leagueId" name="leagueId" defaultValue={initial.leagueId} placeholder="e.g. 123456" required />
          <p className="text-xs text-muted-foreground">From your league URL: fantasy.espn.com/football/league?leagueId=…</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="season">Season</Label>
          <Input id="season" name="season" type="number" defaultValue={initial.season ?? new Date().getFullYear()} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="espnS2">espn_s2 cookie (private leagues only)</Label>
        <Input id="espnS2" name="espnS2" placeholder={initial.espnS2Masked ? `saved: ${initial.espnS2Masked} (paste to replace)` : "AEB…"} autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="swid">SWID cookie (private leagues only)</Label>
        <Input id="swid" name="swid" placeholder={initial.swidMasked ? `saved: ${initial.swidMasked} (paste to replace)` : "{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"} autoComplete="off" />
        <p className="text-xs text-muted-foreground">
          Log in at fantasy.espn.com → DevTools → Application → Cookies → espn.com. Copy both values. They are stored encrypted.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="myTeamId">My team</Label>
        <select id="myTeamId" name="myTeamId" defaultValue={initial.myTeamId ?? ""} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
          <option value="">— test connection to load teams —</option>
          {teamOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state?.ok && (
        <Alert>
          <AlertDescription>{state.ok}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" name="intent" value="test" variant="outline" disabled={pending}>
          Test connection
        </Button>
        <Button type="submit" name="intent" value="save" disabled={pending || !initial.hasDb}>
          Save
        </Button>
      </div>
    </form>
  );
}
