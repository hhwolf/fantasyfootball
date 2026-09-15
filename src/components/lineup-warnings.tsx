import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { LineupWarning } from "@/lib/features/lineup-warnings";

export function LineupWarnings({ warnings, week }: { warnings: LineupWarning[]; week: number }) {
  if (!warnings.length) return null;
  const severe = warnings.some((w) => w.kind === "out" || w.kind === "bye" || w.kind === "empty");
  return (
    <Alert variant={severe ? "destructive" : "default"}>
      <AlertTitle>{severe ? "Your current ESPN lineup has problems" : "Watch these starters"}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {warnings.map((w, i) => (
            <li key={i}>{w.text}</li>
          ))}
        </ul>
        <Link href={`/lineup?week=${week}`} className="underline">
          See the optimal lineup
        </Link>
      </AlertDescription>
    </Alert>
  );
}
