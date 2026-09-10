"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { EspnAuthError, getLeagueMeta } from "@/lib/espn/client";
import { normalizeSwid, saveSettings } from "@/lib/settings";

export type SettingsState = { ok?: string; error?: string; teams?: { id: number; name: string }[] };

export async function testConnectionAction(_prev: SettingsState | undefined, formData: FormData): Promise<SettingsState> {
  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const season = Number(formData.get("season") ?? new Date().getFullYear());
  const espnS2 = String(formData.get("espnS2") ?? "").trim() || undefined;
  const swidRaw = String(formData.get("swid") ?? "").trim();
  const swid = swidRaw ? normalizeSwid(swidRaw) : undefined;
  if (!leagueId) return { error: "League ID is required." };
  try {
    const league = await getLeagueMeta({ leagueId, season, espnS2, swid });
    const teams = (league.teams ?? []).map((t) => ({ id: t.id, name: t.name ?? `Team ${t.id}` }));
    const intent = String(formData.get("intent") ?? "test");
    if (intent === "save") {
      const myTeamId = Number(formData.get("myTeamId")) || undefined;
      await saveSettings({ leagueId, season, espnS2, swid, myTeamId });
      revalidateTag("league");
      revalidatePath("/", "layout");
      return { ok: `Saved. Connected to "${league.settings?.name ?? leagueId}" (${teams.length} teams).`, teams };
    }
    return { ok: `Connected to "${league.settings?.name ?? leagueId}" (${teams.length} teams). Pick your team and save.`, teams };
  } catch (err) {
    if (err instanceof EspnAuthError) return { error: "ESPN denied access. This league is private: paste espn_s2 and SWID from your browser cookies." };
    return { error: err instanceof Error ? err.message : "Connection failed." };
  }
}
