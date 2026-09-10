"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/lineup", label: "Lineup" },
  { href: "/matchup", label: "Matchup" },
  { href: "/waivers", label: "Waivers" },
  { href: "/trade", label: "Trade" },
  { href: "/accuracy", label: "Accuracy" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ leagueName, week }: { leagueName?: string; week?: number }) {
  const path = usePathname();
  return (
    <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          FF Dash
        </Link>
        <nav className="flex flex-1 gap-1 overflow-x-auto text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground whitespace-nowrap",
                (l.href === "/" ? path === "/" : path.startsWith(l.href)) && "bg-muted text-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden text-xs text-muted-foreground sm:block">
          {leagueName ? `${leagueName}${week ? ` · Week ${week}` : ""}` : "Not connected"}
        </div>
      </div>
    </header>
  );
}
