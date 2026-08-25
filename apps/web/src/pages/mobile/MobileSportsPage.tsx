/**
 * Mobile Sports Intelligence — card-first, not a shrunk desktop table.
 */
import { useCallback, useEffect, useState } from "react";
import { sportsApi } from "@/lib/sportsIntelligence";
import type { SiDashboard, SiPrediction, SiTicket } from "@/lib/sportsIntelligence";
import { MobileTopBar } from "@/app/mobile/MobileTopBar";

const TABS = ["ticket", "matches", "predictions", "results"] as const;

export function MobileSportsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("ticket");
  const [dash, setDash] = useState<SiDashboard | null>(null);
  const [preds, setPreds] = useState<SiPrediction[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([sportsApi.dashboard(), sportsApi.predictions()]);
      setDash(d); setPreds(p); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const ticket: SiTicket | null = dash?.ticketEngine.latestTicket ?? null;

  return (
    <div className="pb-8">
      <MobileTopBar title="Sports Intel" subtitle={dash?.mode ?? ""} />
      <div className="px-4 pt-3">
        <div className={`rounded-2xl px-3 py-2 text-xs ${dash?.mode === "SANDBOX" ? "bg-amber/15 text-amber" : "bg-azure/15 text-azure"}`}>
          {dash?.mode === "SANDBOX" ? "DEMO / SANDBOX DATA" : `${dash?.mode ?? "…"} · no guaranteed winnings`}
        </div>
        {err ? <div className="mt-2 text-xs text-crimson">{err}</div> : null}
      </div>
      <div className="px-4 mt-3 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs border ${tab === t ? "border-azure/40 bg-azure/20 text-white" : "border-white/10 text-text-muted"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "ticket" && (
        <div className="px-4 mt-4 space-y-3">
          {!ticket ? <Empty text="No ticket yet." /> : ticket.status === "NO_QUALIFIED_TICKET" ? (
            <Card>
              <div className="text-xs uppercase tracking-widest text-amber">NO QUALIFIED TICKET</div>
              <p className="text-sm text-text-main mt-2">{ticket.noQualifiedReason}</p>
            </Card>
          ) : (
            <Card>
              <div className="flex items-center justify-between">
                <div className="text-xs text-text-muted">{ticket.ticketCode}</div>
                <div className="text-xs text-azure">{ticket.status}</div>
              </div>
              <div className="text-3xl font-black text-white mt-2">{ticket.totalOdds?.toFixed(2) ?? "—"}</div>
              <div className="text-xs text-text-muted">{ticket.selectionCount} selections · conf {fmt(ticket.confidence)} · risk {ticket.risk ?? "—"} · corr {ticket.correlation ?? "—"}</div>
              <div className="mt-3 space-y-2">
                {ticket.selections.map((s) => (
                  <div key={s.predictionId} className="rounded-xl bg-white/5 px-3 py-2">
                    <div className="text-sm text-white">{s.matchLabel}</div>
                    <div className="text-[11px] text-text-muted">{s.selection} @ {s.oddsDecimal.toFixed(2)} · cal {(s.calibratedProbability * 100).toFixed(0)}% · {s.risk}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <button onClick={() => void sportsApi.generateTicket().then(load)} className="w-full rounded-2xl bg-azure-600 text-white py-3 text-sm font-semibold">
            Generate today's ticket
          </button>
        </div>
      )}

      {tab === "matches" && (
        <div className="px-4 mt-4 space-y-2">
          <Matches />
        </div>
      )}

      {tab === "predictions" && (
        <div className="px-4 mt-4 space-y-2">
          {preds.length === 0 ? <Empty text="No predictions stored." /> : preds.slice(0, 20).map((p) => (
            <Card key={p.id}>
              <div className="flex justify-between text-xs">
                <span className="text-azure">{p.decision}</span>
                <span className="text-text-muted">{p.risk}</span>
              </div>
              <div className="text-sm text-white mt-1">{p.market} {p.selection}</div>
              <div className="text-[11px] text-text-muted">model {(p.modelProbability * 100).toFixed(0)}% · cal {(p.calibratedProbability * 100).toFixed(0)}% · implied {p.marketImpliedProbability == null ? "—" : `${(p.marketImpliedProbability * 100).toFixed(0)}%`}</div>
            </Card>
          ))}
        </div>
      )}

      {tab === "results" && (
        <div className="px-4 mt-4">
          <Card>
            <div className="text-xs text-text-muted">Stored performance</div>
            <div className="text-2xl font-black text-white mt-1">{dash?.performance.won ?? 0} won</div>
            <div className="text-xs text-text-muted">{dash?.performance.lost ?? 0} lost · {dash?.performance.noQualified ?? 0} no ticket · win {fmt(dash?.performance.winRate ?? null)}</div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Matches() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { sportsApi.matches().then(setRows).catch(() => setRows([])); }, []);
  if (!rows.length) return <Empty text="No matches in store." />;
  return (
    <>
      {rows.map((m) => (
        <Card key={m.id}>
          <div className="text-sm text-white">{m.homeTeamName} vs {m.awayTeamName}</div>
          <div className="text-[11px] text-text-muted">{m.leagueName} · {m.status} · {new Date(m.kickoffAt).toLocaleString()}</div>
        </Card>
      ))}
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-bg-elevated px-4 py-3">{children}</div>;
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-white/10 px-4 py-6 text-sm text-text-muted text-center">{text}</div>;
}
function fmt(n: number | null | undefined) {
  return n == null ? "—" : `${(n * 100).toFixed(0)}%`;
}
