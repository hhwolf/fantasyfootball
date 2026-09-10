import { WeekSelect } from "./week-select";
import { StaleBanner } from "./notices";
import type { LeagueBundle } from "@/lib/data";
import { Suspense } from "react";

export function PageHeader({ title, bundle, right }: { title: string; bundle: LeagueBundle; right?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {bundle.league.leagueName} · {bundle.season}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {right}
          <Suspense>
            <WeekSelect week={bundle.week} finalWeek={bundle.league.finalWeek} currentWeek={bundle.currentWeek} />
          </Suspense>
        </div>
      </div>
      {bundle.stale && <StaleBanner fetchedAt={bundle.league.fetchedAt} error={bundle.error} />}
    </div>
  );
}
