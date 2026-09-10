"use client";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { evaluateTradeAction, type TradeResult } from "./actions";
import { fmt1, fmtSigned } from "@/components/format";

export type TradePlayer = { espnId: number; name: string; position: string; proTeam: string; teamId: number; ros: number; weekProj?: number };
export type TradeTeam = { id: number; name: string; roster: TradePlayer[] };

function PlayerPicker({ players, selected, onToggle }: { players: TradePlayer[]; selected: Set<number>; onToggle: (id: number) => void }) {
  const sorted = useMemo(() => [...players].sort((a, b) => b.ros - a.ros), [players]);
  return (
    <ul className="max-h-96 divide-y overflow-y-auto rounded-md border text-sm">
      {sorted.map((p) => (
        <li key={p.espnId}>
          <label className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 hover:bg-muted ${selected.has(p.espnId) ? "bg-muted" : ""}`}>
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={selected.has(p.espnId)} onChange={() => onToggle(p.espnId)} />
              <span>
                {p.name} <span className="text-muted-foreground">{p.position} · {p.proTeam}</span>
              </span>
            </span>
            <span className="tabular-nums text-muted-foreground">ROS {fmt1(p.ros)}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export function TradeBuilder({ myTeam, others, week }: { myTeam: TradeTeam; others: TradeTeam[]; week: number }) {
  const [partnerId, setPartnerId] = useState(others[0]?.id);
  const [give, setGive] = useState<Set<number>>(new Set());
  const [get, setGet] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<TradeResult | null>(null);
  const [pending, start] = useTransition();
  const partner = others.find((t) => t.id === partnerId);
  const toggle = (set: Set<number>, setter: (s: Set<number>) => void) => (id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };
  const evaluate = () => start(async () => setResult(await evaluateTradeAction({ week, give: [...give], get: [...get] })));
  const verdictTone = result?.ok ? (result.eval.verdict === "accept" ? "default" : result.eval.verdict === "reject" ? "destructive" : "secondary") : "secondary";

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>You give</CardTitle>
            <CardDescription>{myTeam.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <PlayerPicker players={myTeam.roster} selected={give} onToggle={toggle(give, setGive)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>You get</CardTitle>
            <select
              className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm"
              value={partnerId}
              onChange={(e) => {
                setPartnerId(Number(e.target.value));
                setGet(new Set());
              }}
            >
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </CardHeader>
          <CardContent>{partner && <PlayerPicker players={partner.roster} selected={get} onToggle={toggle(get, setGet)} />}</CardContent>
        </Card>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={evaluate} disabled={pending || (give.size === 0 && get.size === 0)}>
          {pending ? "Evaluating…" : "Evaluate trade"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setGive(new Set());
            setGet(new Set());
            setResult(null);
          }}
        >
          Clear
        </Button>
      </div>
      {result && !result.ok && <p className="text-sm text-destructive">{result.error}</p>}
      {result?.ok && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Verdict <Badge variant={verdictTone}>{result.eval.verdict.toUpperCase()}</Badge>
            </CardTitle>
            <CardDescription>{result.eval.rationale}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Rest-of-season points</div>
              <div className="tabular-nums">
                give {fmt1(result.eval.giveRos)} → get {fmt1(result.eval.getRos)} <b>({fmtSigned(result.eval.netRos)})</b>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Value over replacement</div>
              <div className="tabular-nums">
                give {fmt1(result.eval.giveVorp)} → get {fmt1(result.eval.getVorp)} <b>({fmtSigned(result.eval.netVorp)})</b>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">This week&apos;s optimal lineup</div>
              <div className="tabular-nums">
                {fmt1(result.eval.lineupBefore)} → {fmt1(result.eval.lineupAfter)} <b>({fmtSigned(result.eval.lineupDelta)})</b>
              </div>
            </div>
            <div className="sm:col-span-3 grid gap-2 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Giving</div>
                {result.give.map((p) => (
                  <div key={p.id}>
                    {p.name} <span className="text-muted-foreground tabular-nums">ROS {fmt1(p.ros)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Getting</div>
                {result.get.map((p) => (
                  <div key={p.id}>
                    {p.name} <span className="text-muted-foreground tabular-nums">ROS {fmt1(p.ros)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
