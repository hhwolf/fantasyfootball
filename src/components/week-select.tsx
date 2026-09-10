"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function WeekSelect({ week, finalWeek, currentWeek }: { week: number; finalWeek: number; currentWeek: number }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const weeks = Array.from({ length: Math.max(finalWeek, currentWeek) }, (_, i) => i + 1);
  return (
    <select
      className="h-8 rounded-md border bg-background px-2 text-sm"
      value={week}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        next.set("week", e.target.value);
        router.push(`${path}?${next.toString()}`);
      }}
    >
      {weeks.map((w) => (
        <option key={w} value={w}>
          Week {w}
          {w === currentWeek ? " (current)" : ""}
        </option>
      ))}
    </select>
  );
}
