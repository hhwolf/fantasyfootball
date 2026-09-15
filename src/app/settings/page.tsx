import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadSettings, maskSecret } from "@/lib/settings";
import { SettingsForm } from "./settings-form";
import { logoutAction } from "../login/actions";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await loadSettings();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <form action={logoutAction}>
          <Button variant="ghost" size="sm">Sign out</Button>
        </form>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>ESPN league</CardTitle>
          <CardDescription>
            Currently configured from: <span className="font-mono">{s.source}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            initial={{ leagueId: s.leagueId, season: s.season, espnS2Masked: maskSecret(s.espnS2), swidMasked: maskSecret(s.swid), myTeamId: s.myTeamId, hasDb: s.hasDb, source: s.source }}
            teams={[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
