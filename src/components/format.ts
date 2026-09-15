export const fmt1 = (n: number | undefined | null) => (n == null || Number.isNaN(n) ? "–" : n.toFixed(1));
export const fmtPct = (n: number | undefined | null) => (n == null || Number.isNaN(n) ? "–" : `${Math.round(n * 100)}%`);
export const fmtSigned = (n: number | undefined | null) => (n == null || Number.isNaN(n) ? "–" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}`);

export function injuryBadge(status: string | undefined): { label: string; tone: "ok" | "warn" | "bad" } | null {
  if (!status || status === "ACTIVE" || status === "NORMAL") return null;
  const s = status.toUpperCase();
  if (s === "DAY_TO_DAY") return { label: "DTD", tone: "warn" };
  if (s === "QUESTIONABLE") return { label: "Q", tone: "warn" };
  if (s === "DOUBTFUL") return { label: "D", tone: "bad" };
  if (s === "OUT") return { label: "O", tone: "bad" };
  if (s.startsWith("INJURY_RESERVE") || s === "IR") return { label: "IR", tone: "bad" };
  if (s.startsWith("SUSP")) return { label: "SUSP", tone: "bad" };
  return { label: s.slice(0, 3), tone: "warn" };
}
