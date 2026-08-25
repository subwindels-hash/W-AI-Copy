/**
 * WINDELS Sports Intelligence — desktop + responsive console.
 *
 * Every number is loaded from the API. Empty states stay empty. SANDBOX
 * mode is labelled. NO QUALIFIED TICKET is a first-class outcome.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { sportsApi } from "@/lib/sportsIntelligence";
import type {
  SiAuditEntry,
  SiBacktestRun,
  SiDashboard,
  SiDecisionReport,
  SiJobRun,
  SiMatch,
  SiPerformanceSnapshot,
  SiPrediction,
  SiProviderHealth,
  SiResult,
  SiTicket,
  SiTicketConfig,
} from "@/lib/sportsIntelligence";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Activity, BarChart3, Brain, Database, Radar, RefreshCw, Shield, Ticket } from "lucide-react";

const VIEWS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "engine", label: "AI Ticket Engine" },
  { id: "live", label: "Live Matches" },
  { id: "upcoming", label: "Upcoming Matches" },
  { id: "intelligence", label: "Match Intelligence" },
  { id: "predictions", label: "AI Predictions" },
  { id: "daily", label: "Daily Tickets" },
  { id: "history", label: "Ticket History" },
  { id: "results", label: "Results" },
  { id: "performance", label: "Performance" },
  { id: "backtesting", label: "Backtesting" },
  { id: "odds", label: "Odds Intelligence" },
  { id: "risk", label: "Risk Monitor" },
  { id: "correlation", label: "Correlation Monitor" },
  { id: "models", label: "AI Models" },
  { id: "model-performance", label: "Model Performance" },
  { id: "sources", label: "Data Sources" },
  { id: "providers", label: "Provider Health" },
  { id: "audit", label: "Audit Logs" },
  { id: "settings", label: "Settings" },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}
function num(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}
function riskVariant(r: string | null | undefined) {
  if (r === "LOW") return "emerald" as const;
  if (r === "MEDIUM") return "amber" as const;
  if (r === "HIGH") return "warning" as const;
  return "danger" as const;
}
function statusVariant(s: string | null | undefined) {
  if (s === "WON" || s === "ONLINE" || s === "QUALIFIED" || s === "APPROVED") return "emerald" as const;
  if (s === "PENDING" || s === "AWAITING_APPROVAL" || s === "DEGRADED") return "amber" as const;
  if (s === "NO_QUALIFIED_TICKET" || s === "NOT_CONFIGURED") return "slate" as const;
  if (s === "LOST" || s === "OFFLINE" || s === "REJECTED") return "danger" as const;
  return "azure" as const;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
        <div className="text-2xl font-black text-text-bright truncate">{value}</div>
        {sub ? <div className="text-xs text-text-muted">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

export function SportsIntelligencePage() {
  const loc = useLocation();
  const nav = useNavigate();
  const view = (loc.pathname.split("/").filter(Boolean).pop() || "dashboard") as ViewId;
  const active: ViewId = VIEWS.some((v) => v.id === view) ? view : "dashboard";

  const [dash, setDash] = useState<SiDashboard | null>(null);
  const [matches, setMatches] = useState<SiMatch[]>([]);
  const [predictions, setPredictions] = useState<SiPrediction[]>([]);
  const [tickets, setTickets] = useState<SiTicket[]>([]);
  const [results, setResults] = useState<SiResult[]>([]);
  const [perf, setPerf] = useState<SiPerformanceSnapshot | null>(null);
  const [perfRange, setPerfRange] = useState("30d");
  const [providers, setProviders] = useState<SiProviderHealth[]>([]);
  const [jobs, setJobs] = useState<SiJobRun[]>([]);
  const [audit, setAudit] = useState<SiAuditEntry[]>([]);
  const [models, setModels] = useState<any>(null);
  const [backtests, setBacktests] = useState<SiBacktestRun[]>([]);
  const [report, setReport] = useState<SiDecisionReport | null>(null);
  const [cfg, setCfg] = useState<SiTicketConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [approveReason, setApproveReason] = useState("Reviewed candidate set against configured constraints.");

  const load = useCallback(async () => {
    try {
      const [d, m, p, t, r, pf, pr, j, c] = await Promise.all([
        sportsApi.dashboard(),
        sportsApi.matches(),
        sportsApi.predictions(),
        sportsApi.tickets(),
        sportsApi.results(),
        sportsApi.performance({ range: perfRange }),
        sportsApi.providers(),
        sportsApi.jobs(),
        sportsApi.config(),
      ]);
      setDash(d); setMatches(m); setPredictions(p); setTickets(t); setResults(r);
      setPerf(pf); setProviders(pr); setJobs(j); setCfg(c); setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [perfRange]);

  useEffect(() => { void load(); }, [load]);

  const go = (id: ViewId) => nav(id === "dashboard" ? "/app/sports" : `/app/sports/${id}`);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 4000); };

  const runPipeline = async () => {
    setBusy(true);
    try {
      const data = await sportsApi.pipeline();
      flash(data.ticket?.status === "NO_QUALIFIED_TICKET"
        ? "Pipeline complete — NO QUALIFIED TICKET"
        : `Pipeline complete — ticket ${data.ticket?.ticketCode ?? "n/a"}`);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const t = await sportsApi.generateTicket();
      flash(t.status === "NO_QUALIFIED_TICKET" ? "NO QUALIFIED TICKET" : `Ticket ${t.ticketCode} created`);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const latest = dash?.ticketEngine.latestTicket ?? tickets[0] ?? null;
  const live = matches.filter((m) => m.status === "LIVE" || m.status === "HT");
  const upcoming = matches.filter((m) => m.status === "SCHEDULED");
  const intelMatch = matches.find((m) => m.id === selectedMatch) ?? matches[0] ?? null;

  const modeBanner = dash?.mode === "SANDBOX"
    ? "DEMO / SANDBOX DATA — fictional clubs for development. Not live sport."
    : dash?.mode === "PAPER"
      ? "PAPER mode — real sports data when a provider is configured. No external execution."
      : "PRODUCTION mode — authorized operations only. Automated execution is disabled.";

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Sports Intelligence</h1>
          <p className="text-sm text-text-muted max-w-3xl">
            Explainable match intelligence and ticket optimization. The system never guarantees winnings
            and will return <span className="text-text-bright">NO QUALIFIED TICKET</span> when no combination qualifies.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void runPipeline()}>Run pipeline</Button>
          <Button size="sm" disabled={busy} onClick={() => void generate()}>Generate ticket</Button>
        </div>
      </div>

      <div className={`rounded-lg border px-4 py-2 text-sm ${dash?.mode === "SANDBOX" ? "border-amber/40 bg-amber/10 text-amber" : "border-azure/30 bg-azure/10 text-azure"}`}>
        <span className="font-semibold mr-2">{dash?.mode ?? "…"}</span>
        {modeBanner}
      </div>
      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => go(v.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs border transition ${
              active === v.id ? "bg-azure/20 border-azure/40 text-text-bright" : "border-white/10 text-text-muted hover:text-text-bright"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {active === "dashboard" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <Stat label="API / providers" value={String(providers.filter((p) => p.status === "ONLINE").length)} sub={`${providers.length} configured`} />
            <Stat label="Last sync" value={dash?.system.lastSyncAt ? new Date(dash.system.lastSyncAt).toLocaleTimeString() : "—"} />
            <Stat label="Freshness" value={dash?.system.dataFreshnessMinutes != null ? `${Math.round(dash.system.dataFreshnessMinutes)}m` : "—"} />
            <Stat label="AI status" value={dash?.system.aiStatus ?? "—"} />
            <Stat label="Upcoming" value={String(dash?.today.upcomingMatches ?? 0)} />
            <Stat label="Qualified today" value={String(dash?.today.qualifiedPredictions ?? 0)} sub={`${dash?.today.rejectedPredictions ?? 0} rejected`} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Ticket className="w-4 h-4 text-azure" /> AI Ticket Engine</CardTitle>
                <CardDescription>Current configuration and latest ticket — never forced.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {latest ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant(latest.status)}>{latest.status.replaceAll("_", " ")}</Badge>
                      <span className="text-sm text-text-bright font-semibold">{latest.ticketCode}</span>
                      <span className="text-xs text-text-muted">{latest.selectionCount} selections · odds {num(latest.totalOdds)}</span>
                    </div>
                    {latest.status === "NO_QUALIFIED_TICKET" ? (
                      <p className="text-sm text-amber">{latest.noQualifiedReason}</p>
                    ) : (
                      <ul className="space-y-2">
                        {latest.selections.map((s) => (
                          <li key={s.predictionId} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
                            <div className="text-text-bright">{s.matchLabel}</div>
                            <div className="text-xs text-text-muted">{s.market} · {s.selection} @ {num(s.oddsDecimal)} · model {pct(s.modelProbability)} · cal {pct(s.calibratedProbability)}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : <p className="text-sm text-text-muted">No ticket generated yet.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-azure" /> Performance</CardTitle>
                <CardDescription>Computed from stored settlements only.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Stat label="Tickets" value={String(perf?.totalTickets ?? 0)} />
                <Stat label="Win rate" value={pct(perf?.winRate ?? null)} />
                <Stat label="ROI" value={pct(perf?.roi ?? null)} />
                <Stat label="Accuracy" value={pct(perf?.modelAccuracy ?? null)} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {(active === "live" || active === "upcoming") && (
        <MatchTable
          title={active === "live" ? "Live matches" : "Upcoming matches"}
          rows={active === "live" ? live : upcoming}
          empty={active === "live" ? "No live matches in store." : "No upcoming matches. Configure a provider or run the sandbox pipeline."}
          onOpen={(id) => { setSelectedMatch(id); go("intelligence"); }}
        />
      )}

      {active === "intelligence" && (
        <MatchIntel matches={matches} selected={intelMatch} onSelect={setSelectedMatch} predictions={predictions} />
      )}

      {active === "predictions" && (
        <PredictionsPanel
          rows={predictions}
          onExplain={async (id) => { setReport(await sportsApi.prediction(id)); }}
          report={report}
        />
      )}

      {(active === "engine" || active === "daily") && (
        <TicketPanel
          title={active === "engine" ? "AI Ticket Engine" : "Daily tickets"}
          tickets={active === "daily" ? tickets.filter((t) => t.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)) : tickets.slice(0, 5)}
          cfg={cfg}
          approveReason={approveReason}
          setApproveReason={setApproveReason}
          onApprove={async (id, decision) => {
            try {
              await sportsApi.approveTicket(id, { decision, reason: approveReason });
              flash(`Ticket ${decision.toLowerCase()}`);
              await load();
            } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          }}
        />
      )}

      {active === "history" && <TicketPanel title="Ticket history" tickets={tickets} cfg={cfg} approveReason={approveReason} setApproveReason={setApproveReason} onApprove={async () => undefined} />}

      {active === "results" && (
        <Card>
          <CardHeader><CardTitle>Verified results</CardTitle><CardDescription>Unverified provider scores stay pending.</CardDescription></CardHeader>
          <CardContent>
            {results.length === 0 ? <p className="text-sm text-text-muted">No results stored.</p> : (
              <div className="space-y-2">
                {results.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
                    <span className="text-text-bright">{r.matchId} · {r.homeScore ?? "—"}–{r.awayScore ?? "—"}</span>
                    <Badge variant={r.verified ? "emerald" : "amber"}>{r.verified ? "VERIFIED" : "UNVERIFIED"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {active === "performance" && (
        <PerformancePanel perf={perf} range={perfRange} onRange={async (r) => { setPerfRange(r); setPerf(await sportsApi.performance({ range: r })); }} />
      )}

      {active === "backtesting" && (
        <BacktestPanel
          runs={backtests}
          onLoad={async () => setBacktests(await sportsApi.backtests())}
          onRun={async () => {
            const to = new Date().toISOString();
            const from = new Date(Date.now() - 90 * 86400_000).toISOString();
            await sportsApi.runBacktest({ from, to });
            setBacktests(await sportsApi.backtests());
            flash("Historical simulation recorded — not live performance.");
          }}
        />
      )}

      {active === "odds" && <OddsPanel matches={matches} />}
      {active === "risk" && <RiskPanel predictions={predictions} />}
      {active === "correlation" && <CorrelationPanel tickets={tickets} />}
      {(active === "models" || active === "model-performance") && (
        <ModelsPanel data={models} onLoad={async () => setModels(await sportsApi.models())} />
      )}
      {(active === "sources" || active === "providers") && <ProvidersPanel providers={providers} jobs={jobs} />}
      {active === "audit" && (
        <AuditPanel
          rows={audit}
          onLoad={async () => { try { setAudit(await sportsApi.audit()); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } }}
        />
      )}
      {active === "settings" && cfg && (
        <SettingsPanel
          cfg={cfg}
          onSave={async (patch) => {
            try {
              const next = await sportsApi.updateConfig({ ...patch, reason: "Updated from Sports Intelligence settings" });
              setCfg(next);
              flash("Configuration saved and audited.");
              await load();
            } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          }}
        />
      )}
    </div>
  );
}

function MatchTable({ title, rows, empty, onOpen }: { title: string; rows: SiMatch[]; empty: string; onOpen: (id: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? <p className="text-sm text-text-muted">{empty}</p> : rows.map((m) => (
          <button key={m.id} onClick={() => onOpen(m.id)} className="w-full text-left rounded-lg border border-white/5 bg-white/5 px-3 py-2 hover:bg-white/10">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm text-text-bright">{m.homeTeamName} vs {m.awayTeamName}</div>
                <div className="text-xs text-text-muted">{m.leagueName} · {new Date(m.kickoffAt).toLocaleString()} · {m.dataClass}</div>
              </div>
              <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function MatchIntel({ matches, selected, onSelect, predictions }: { matches: SiMatch[]; selected: SiMatch | null; onSelect: (id: string) => void; predictions: SiPrediction[] }) {
  const preds = predictions.filter((p) => p.matchId === selected?.id);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle>Matches</CardTitle></CardHeader>
        <CardContent className="space-y-1 max-h-[480px] overflow-y-auto">
          {matches.map((m) => (
            <button key={m.id} onClick={() => onSelect(m.id)} className={`w-full text-left rounded-lg px-3 py-2 text-sm ${selected?.id === m.id ? "bg-azure/15" : "hover:bg-white/5"}`}>
              {m.homeTeamName} vs {m.awayTeamName}
            </button>
          ))}
          {matches.length === 0 ? <p className="text-sm text-text-muted">No match intelligence yet.</p> : null}
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Match intelligence</CardTitle>
          <CardDescription>Every field is sourced. Missing information is shown as unavailable — never invented.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!selected ? <p className="text-text-muted">Select a match.</p> : (
            <>
              <div className="text-lg font-semibold text-text-bright">{selected.homeTeamName} vs {selected.awayTeamName}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Field k="Competition" v={selected.leagueName} />
                <Field k="Kickoff" v={new Date(selected.kickoffAt).toLocaleString()} />
                <Field k="Status" v={selected.status} />
                <Field k="Venue" v={selected.venue ?? "unavailable"} />
                <Field k="Home form" v={fmtForm(selected.homeForm)} />
                <Field k="Away form" v={fmtForm(selected.awayForm)} />
                <Field k="xG home" v={selected.homeXg === null ? "unavailable" : String(selected.homeXg)} />
                <Field k="xG away" v={selected.awayXg === null ? "unavailable" : String(selected.awayXg)} />
                <Field k="Injuries" v={selected.injuries.length ? selected.injuries.map((i) => i.player).join(", ") : "unavailable"} />
                <Field k="Lineups" v={selected.lineupsAvailable ? "available" : "unavailable"} />
                <Field k="Source" v={selected.providerId} />
                <Field k="Synced" v={selected.lastSyncedAt} />
              </div>
              <div className="space-y-2">
                {preds.map((p) => (
                  <div key={p.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(p.decision)}>{p.decision}</Badge>
                      <span>{p.market} {p.selection} @ {num(p.oddsDecimal)}</span>
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      model {pct(p.modelProbability)} · cal {pct(p.calibratedProbability)} · implied {pct(p.marketImpliedProbability)} · EV {num(p.expectedValue)} · conf {pct(p.confidence)} · risk {p.risk} · DQ {p.dataQuality.score}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return <div><span className="text-text-muted">{k}: </span><span className="text-text-bright">{v}</span></div>;
}
function fmtForm(f: SiMatch["homeForm"]): string {
  if (!f || f.played === null) return "unavailable";
  return `${f.played} played · ${f.won ?? "?"}W ${f.drawn ?? "?"}D ${f.lost ?? "?"}L · GF ${f.goalsFor ?? "—"} GA ${f.goalsAgainst ?? "—"}`;
}

function PredictionsPanel({ rows, onExplain, report }: { rows: SiPrediction[]; onExplain: (id: string) => void; report: SiDecisionReport | null }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <Card className="lg:col-span-3">
        <CardHeader><CardTitle>AI predictions</CardTitle><CardDescription>Metrics are stored separately — not collapsed into one fake percentage.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 ? <p className="text-sm text-text-muted">No predictions stored.</p> : rows.map((p) => (
            <button key={p.id} onClick={() => onExplain(p.id)} className="w-full text-left rounded-lg border border-white/5 bg-white/5 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={statusVariant(p.decision)}>{p.decision}</Badge>
                <span className="text-text-bright">{p.market} {p.selection}</span>
                <span className="text-text-muted">@ {num(p.oddsDecimal)}</span>
                <Badge variant={riskVariant(p.risk)}>{p.risk}</Badge>
              </div>
              <div className="text-[11px] text-text-muted mt-1">
                model {pct(p.modelProbability)} · calibrated {pct(p.calibratedProbability)} · implied {pct(p.marketImpliedProbability)} · EV {num(p.expectedValue)} · conf {pct(p.confidence)} · DQ {p.dataQuality.score} ({p.dataQuality.band})
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="flex items-center gap-2"><Brain className="w-4 h-4" /> Why did AI select this?</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!report ? <p className="text-text-muted">Select a prediction to reconstruct the stored decision.</p> : (
            <>
              <div className="text-text-bright font-semibold">{report.match ? `${report.match.homeTeamName} vs ${report.match.awayTeamName}` : report.prediction.matchId}</div>
              <Badge variant={statusVariant(report.prediction.decision)}>{report.prediction.decision}</Badge>
              <ul className="list-disc pl-4 space-y-1 text-text-muted">
                {report.why.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              {report.prediction.rejectionReasons.length > 0 ? (
                <div className="text-xs text-amber">Rejected: {report.prediction.rejectionReasons.join(", ")}</div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TicketPanel({ title, tickets, cfg, approveReason, setApproveReason, onApprove }: {
  title: string; tickets: SiTicket[]; cfg: SiTicketConfig | null;
  approveReason: string; setApproveReason: (s: string) => void;
  onApprove: (id: string, decision: "APPROVED" | "REJECTED") => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      {cfg ? (
        <Card>
          <CardHeader><CardTitle>{title}</CardTitle>
            <CardDescription>Target odds {cfg.targetOddsMin}–{cfg.targetOddsMax} · max {cfg.maxSelections} · min confidence {pct(cfg.minConfidence)} · min EV {num(cfg.minExpectedValue)} · max corr {cfg.maxCorrelation} · min DQ {cfg.minDataQuality}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {tickets.length === 0 ? <p className="text-sm text-text-muted">No tickets stored.</p> : tickets.map((t) => (
        <Card key={t.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t.ticketCode}
              <Badge variant={statusVariant(t.status)}>{t.status.replaceAll("_", " ")}</Badge>
              <span className="text-xs font-normal text-text-muted">{new Date(t.createdAt).toLocaleString()}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {t.status === "NO_QUALIFIED_TICKET" ? (
              <div className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-amber">
                NO QUALIFIED TICKET — {t.noQualifiedReason}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-3 text-xs text-text-muted">
                  <span>Odds {num(t.totalOdds)}</span>
                  <span>Selections {t.selectionCount}</span>
                  <span>Conf {pct(t.confidence)}</span>
                  <span>Risk {t.risk ?? "—"}</span>
                  <span>Corr {t.correlation ?? "—"}</span>
                  <span>DQ {num(t.dataQualityAvg, 0)}</span>
                </div>
                {t.selections.map((s) => (
                  <div key={s.predictionId} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-text-bright">{s.matchLabel}</span>
                      <Badge variant={statusVariant(s.result)}>{s.result}</Badge>
                    </div>
                    <div className="text-xs text-text-muted">{s.leagueName} · {s.market} {s.selection} @ {num(s.oddsDecimal)} · model {pct(s.modelProbability)} · cal {pct(s.calibratedProbability)} · EV {num(s.expectedValue)}</div>
                  </div>
                ))}
                {t.approvalStatus === "PENDING" ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input value={approveReason} onChange={(e) => setApproveReason(e.target.value)} />
                    <Button size="sm" onClick={() => void onApprove(t.id, "APPROVED")}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => void onApprove(t.id, "REJECTED")}>Reject</Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PerformancePanel({ perf, range, onRange }: { perf: SiPerformanceSnapshot | null; range: string; onRange: (r: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["today", "7d", "30d", "90d"].map((r) => (
          <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => onRange(r)}>{r}</Button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Predictions" value={String(perf?.totalPredictions ?? 0)} />
        <Stat label="Tickets" value={String(perf?.totalTickets ?? 0)} />
        <Stat label="Won / Lost / Void" value={`${perf?.won ?? 0} / ${perf?.lost ?? 0} / ${perf?.voided ?? 0}`} />
        <Stat label="No qualified" value={String(perf?.noQualified ?? 0)} />
        <Stat label="Win rate" value={pct(perf?.winRate ?? null)} />
        <Stat label="Avg odds" value={num(perf?.averageOdds ?? null)} />
        <Stat label="ROI" value={pct(perf?.roi ?? null)} />
        <Stat label="Calibration error" value={num(perf?.calibrationError ?? null, 3)} />
      </div>
      {perf?.dataClass === "SANDBOX" ? <div className="text-xs text-amber">DEMO / SANDBOX DATA — not production statistics.</div> : null}
    </div>
  );
}

function BacktestPanel({ runs, onLoad, onRun }: { runs: SiBacktestRun[]; onLoad: () => void; onRun: () => void }) {
  useEffect(() => { onLoad(); }, [onLoad]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historical backtesting</CardTitle>
        <CardDescription>Simulations are labelled HISTORICAL_SIMULATION and are never shown as live results.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button size="sm" onClick={() => void onRun()}>Run 90-day simulation</Button>
        {runs.map((r) => (
          <div key={r.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="slate">{r.label}</Badge>
              <span>{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            <div className="text-xs text-text-muted">n={r.result.totalPredictions} · win {pct(r.result.winRate)} · ROI {pct(r.result.roi)} · acc {pct(r.result.modelAccuracy)}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OddsPanel({ matches: _matches }: { matches: SiMatch[] }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { sportsApi.odds().then(setRows).catch(() => setRows([])); }, []);
  return (
    <Card>
      <CardHeader><CardTitle>Odds intelligence</CardTitle><CardDescription>Prices as stored from the configured provider. Missing odds are not invented.</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? <p className="text-sm text-text-muted">No odds stored.</p> : rows.map((o) => (
          <div key={o.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm flex justify-between">
            <span>{o.market} {o.selection} · {num(o.oddsDecimal)} · implied {pct(o.impliedProbability)}</span>
            <span className="text-xs text-text-muted">{o.suspended ? "SUSPENDED" : o.observedAt}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RiskPanel({ predictions }: { predictions: SiPrediction[] }) {
  const dist = useMemo(() => {
    const d = { LOW: 0, MEDIUM: 0, HIGH: 0, REJECTED: 0 };
    for (const p of predictions) d[p.risk] += 1;
    return d;
  }, [predictions]);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="w-4 h-4" /> Risk monitor</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(dist).map(([k, v]) => <Stat key={k} label={k} value={String(v)} />)}
      </CardContent>
    </Card>
  );
}

function CorrelationPanel({ tickets }: { tickets: SiTicket[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Radar className="w-4 h-4" /> Correlation monitor</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {tickets.filter((t) => t.selections.length > 0).map((t) => (
          <div key={t.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm flex justify-between">
            <span>{t.ticketCode} · {t.selectionCount} legs</span>
            <Badge variant={t.correlation === "HIGH" ? "danger" : t.correlation === "MEDIUM" ? "amber" : "emerald"}>{t.correlation ?? "—"}</Badge>
          </div>
        ))}
        {tickets.every((t) => t.selections.length === 0) ? <p className="text-sm text-text-muted">No multi-leg tickets to assess.</p> : null}
      </CardContent>
    </Card>
  );
}

function ModelsPanel({ data, onLoad }: { data: any; onLoad: () => void }) {
  useEffect(() => { onLoad(); }, [onLoad]);
  return (
    <Card>
      <CardHeader><CardTitle>Model versions</CardTitle><CardDescription>Historical predictions stay pinned to the model that created them.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {(data?.versions ?? []).map((v: any) => (
          <div key={`${v.name}-${v.version}`} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
            <div className="text-text-bright font-semibold">{v.name} v{v.version} {v.active ? <Badge variant="azure">active</Badge> : null}</div>
            <div className="text-xs text-text-muted">{v.notes}</div>
          </div>
        ))}
        {(data?.metrics ?? []).map((m: any) => (
          <div key={`${m.modelName}-${m.modelVersion}`} className="text-xs text-text-muted">
            {m.modelName} v{m.modelVersion}: n={m.sampleSize} acc {pct(m.accuracy)} cal {num(m.calibrationError, 3)} ROI {pct(m.roi)}
          </div>
        ))}
        {(data?.alerts ?? []).map((a: any) => (
          <div key={a.id} className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-amber">{a.message}</div>
        ))}
      </CardContent>
    </Card>
  );
}

function ProvidersPanel({ providers, jobs }: { providers: SiProviderHealth[]; jobs: SiJobRun[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Database className="w-4 h-4" /> Provider health</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {providers.map((p) => (
            <div key={p.providerId} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-text-bright">{p.name}</span>
                <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
              </div>
              <div className="text-xs text-text-muted">
                rtt {p.responseTimeMs ?? "—"}ms · last ok {p.lastSuccessAt ?? "—"} · last fail {p.lastFailureAt ?? "—"} · {p.lastError ?? "no error"}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="w-4 h-4" /> Recent jobs</CardTitle></CardHeader>
        <CardContent className="space-y-2 max-h-[420px] overflow-y-auto">
          {jobs.map((j) => (
            <div key={j.id} className="text-xs text-text-muted flex justify-between gap-2">
              <span>{j.kind} · {j.status}</span>
              <span>{j.recordsCreated}+ / {j.recordsUpdated}~ · {j.errors[0] ?? "ok"}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditPanel({ rows, onLoad }: { rows: SiAuditEntry[]; onLoad: () => void }) {
  useEffect(() => { onLoad(); }, [onLoad]);
  return (
    <Card>
      <CardHeader><CardTitle>Sports audit log</CardTitle><CardDescription>Administrator, timestamp, before/after and reason.</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((a) => (
          <div key={a.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs">
            <div className="text-text-bright">{a.action} · {a.actorId ?? "system"} · {new Date(a.createdAt).toLocaleString()}</div>
            <div className="text-text-muted">{a.reason ?? "—"}</div>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-text-muted">No sports audit entries (admin only).</p> : null}
      </CardContent>
    </Card>
  );
}

function SettingsPanel({ cfg, onSave }: { cfg: SiTicketConfig; onSave: (p: Partial<SiTicketConfig>) => void }) {
  const [form, setForm] = useState(cfg);
  useEffect(() => setForm(cfg), [cfg]);
  const set = (k: keyof SiTicketConfig, v: any) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sports Intelligence settings</CardTitle>
        <CardDescription>Automated external execution cannot be enabled. Every change is audited.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs text-text-muted">Mode
          <Select value={form.mode} onChange={(e) => set("mode", e.target.value)}>
            <option>SANDBOX</option><option>PAPER</option><option>PRODUCTION</option>
          </Select>
        </label>
        <label className="text-xs text-text-muted">Approval
          <Select value={form.approvalMode} onChange={(e) => set("approvalMode", e.target.value)}>
            <option>VIEW_ONLY</option><option>AI_ANALYSIS</option><option>AI_TICKET_GENERATION</option><option>USER_APPROVAL_REQUIRED</option>
          </Select>
        </label>
        <label className="text-xs text-text-muted">Target odds min<Input type="number" value={form.targetOddsMin} onChange={(e) => set("targetOddsMin", Number(e.target.value))} /></label>
        <label className="text-xs text-text-muted">Target odds max<Input type="number" value={form.targetOddsMax} onChange={(e) => set("targetOddsMax", Number(e.target.value))} /></label>
        <label className="text-xs text-text-muted">Max selections<Input type="number" value={form.maxSelections} onChange={(e) => set("maxSelections", Number(e.target.value))} /></label>
        <label className="text-xs text-text-muted">Min confidence<Input type="number" step="0.01" value={form.minConfidence} onChange={(e) => set("minConfidence", Number(e.target.value))} /></label>
        <label className="text-xs text-text-muted">Min EV<Input type="number" step="0.01" value={form.minExpectedValue} onChange={(e) => set("minExpectedValue", Number(e.target.value))} /></label>
        <label className="text-xs text-text-muted">Min data quality<Input type="number" value={form.minDataQuality} onChange={(e) => set("minDataQuality", Number(e.target.value))} /></label>
        <label className="text-xs text-text-muted">Risk
          <Select value={form.riskLevel} onChange={(e) => set("riskLevel", e.target.value)}>
            <option>conservative</option><option>balanced</option><option>aggressive</option>
          </Select>
        </label>
        <label className="text-xs text-text-muted">Max correlation
          <Select value={form.maxCorrelation} onChange={(e) => set("maxCorrelation", e.target.value)}>
            <option>LOW</option><option>MEDIUM</option><option>HIGH</option>
          </Select>
        </label>
        <div className="md:col-span-2 flex gap-2">
          <Button onClick={() => onSave({
            mode: form.mode, approvalMode: form.approvalMode, targetOddsMin: form.targetOddsMin,
            targetOddsMax: form.targetOddsMax, maxSelections: form.maxSelections, minConfidence: form.minConfidence,
            minExpectedValue: form.minExpectedValue, minDataQuality: form.minDataQuality, riskLevel: form.riskLevel,
            maxCorrelation: form.maxCorrelation, enabled: form.enabled, ticketEngineEnabled: form.ticketEngineEnabled,
          })}>Save settings</Button>
        </div>
      </CardContent>
    </Card>
  );
}

