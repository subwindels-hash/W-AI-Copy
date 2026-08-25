/**
 * WINDELS Lottery Intelligence — EuroMillions console.
 * Statistical analysis only. Never presents a win probability.
 */
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { lotteryApi } from "@/lib/lotteryIntelligence";
import type {
  LiBacktestResult, LiConfig, LiDashboard, LiDistributionSnapshot, LiDraw,
  LiGeneratedLine, LiNumberStat, LiPerformance, LiProviderHealth, LiSystemPlan, LiTicket,
} from "@/lib/lotteryIntelligence";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const VIEWS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "euromillions", label: "EuroMillions" },
  { id: "powerball", label: "Powerball" },
  { id: "results", label: "Draw Results" },
  { id: "history", label: "Historical Results" },
  { id: "numbers", label: "Number Intelligence" },
  { id: "stars", label: "Lucky Star Intelligence" },
  { id: "generator", label: "AI Combination Generator" },
  { id: "system", label: "System Builder" },
  { id: "analyzer", label: "Combination Analyzer" },
  { id: "backtesting", label: "Backtesting" },
  { id: "strategy", label: "Strategy Lab" },
  { id: "tickets", label: "Saved Tickets" },
  { id: "performance", label: "Performance" },
  { id: "reports", label: "AI Reports" },
  { id: "sources", label: "Data Sources" },
  { id: "providers", label: "Provider Health" },
  { id: "audit", label: "Audit Logs" },
  { id: "settings", label: "Settings" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

function fmtNums(n: number[]) { return n.map((x) => String(x).padStart(2, "0")).join(" · "); }
function pct(n: number | null | undefined) { return n == null ? "—" : `${(n * 100).toFixed(1)}%`; }

export function LotteryIntelligencePage() {
  const loc = useLocation();
  const nav = useNavigate();
  const seg = loc.pathname.split("/").filter(Boolean).pop() || "dashboard";
  const active: ViewId = VIEWS.some((v) => v.id === seg) ? (seg as ViewId) : "dashboard";
  const go = (id: ViewId) => nav(id === "dashboard" ? "/app/lottery" : `/app/lottery/${id}`);

  const [dash, setDash] = useState<LiDashboard | null>(null);
  const [draws, setDraws] = useState<LiDraw[]>([]);
  const [nums, setNums] = useState<LiNumberStat[]>([]);
  const [stars, setStars] = useState<LiNumberStat[]>([]);
  const [dist, setDist] = useState<LiDistributionSnapshot | null>(null);
  const [tickets, setTickets] = useState<LiTicket[]>([]);
  const [generated, setGenerated] = useState<LiGeneratedLine[]>([]);
  const [plan, setPlan] = useState<LiSystemPlan | null>(null);
  const [perf, setPerf] = useState<LiPerformance | null>(null);
  const [providers, setProviders] = useState<LiProviderHealth[]>([]);
  const [backtests, setBacktests] = useState<LiBacktestResult[]>([]);
  const [cfg, setCfg] = useState<LiConfig | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [windowN, setWindowN] = useState(50);
  const [mode, setMode] = useState<"RANDOM" | "BALANCED" | "HISTORICAL" | "DIVERSIFIED" | "ANTI_POPULAR" | "AI_ANALYSIS">("BALANCED");
  const [count, setCount] = useState(5);
  const [lockMain, setLockMain] = useState("");
  const [exMain, setExMain] = useState("");
  const [poolMain, setPoolMain] = useState("1,2,3,4,5,6,7");
  const [poolStars, setPoolStars] = useState("1,2,3");
  const [analyzeMain, setAnalyzeMain] = useState("7,18,24,36,49");
  const [analyzeStars, setAnalyzeStars] = useState("3,11");
  const [analysis, setAnalysis] = useState<any>(null);
  const [ticketName, setTicketName] = useState("EuroMillions line set");
  const [lotteryId, setLotteryId] = useState<"euromillions" | "powerball">("euromillions");
  const bonusLabel = dash?.rules.bonusLabel ?? (lotteryId === "powerball" ? "Powerball" : "Lucky Stars");

  const parseList = (s: string) => s.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n));

  const load = useCallback(async () => {
    try {
      const [d, dr, n, s, di, t, p, pr, c] = await Promise.all([
        lotteryApi.dashboard(lotteryId), lotteryApi.draws(lotteryId), lotteryApi.numbers({ lastN: windowN, lotteryId }),
        lotteryApi.stars({ lastN: windowN, lotteryId }), lotteryApi.distribution({ lastN: windowN, lotteryId }),
        lotteryApi.tickets(), lotteryApi.performance(lotteryId), lotteryApi.providers(), lotteryApi.config(),
      ]);
      setDash(d); setDraws(dr); setNums(n); setStars(s); setDist(di);
      setTickets(t); setPerf(p); setProviders(pr); setCfg(c); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [windowN, lotteryId]);
  useEffect(() => { void load(); }, [load]);

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 4000); };

  const generate = async () => {
    try {
      const data = await lotteryApi.generate({
        lotteryId, mode, count,
        window: windowN,
        lockedMain: parseList(lockMain), excludedMain: parseList(exMain),
        lockedBonus: [], excludedBonus: [],
      });
      setGenerated(data.lines);
      flash(`${data.lines.length} combination(s) generated — statistical analysis only.`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const saveGenerated = async () => {
    if (!generated.length) return;
    try {
      await lotteryApi.saveTicket({
        lotteryId, name: ticketName, generationMode: mode,
        lockedMain: parseList(lockMain), excludedMain: parseList(exMain),
        lockedBonus: [], excludedBonus: [],
        lines: generated.map((l) => ({ mainNumbers: l.mainNumbers, bonusNumbers: l.bonusNumbers, mode: l.mode })),
      });
      flash("Ticket saved.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-black text-text-bright">Lottery Intelligence</h1>
        <p className="text-sm text-text-muted max-w-3xl">
          EuroMillions and Powerball statistical analysis, combination building and historical simulation.
          Lottery draws are random — this module does not predict winning numbers.
        </p>
      </div>
      <div className={`rounded-lg border px-4 py-2 text-sm ${dash?.mode === "SANDBOX" ? "border-amber/40 bg-amber/10 text-amber" : "border-azure/30 bg-azure/10 text-azure"}`}>
        <span className="font-semibold mr-2">{dash?.mode ?? "…"}</span>
        {dash?.mode === "SANDBOX" ? `DEMO / SANDBOX DATA — fictional ${dash.rules.name} draws for development. Not official results.` : dash?.disclaimer}
      </div>
      {dash?.stale ? <div className="rounded-lg border border-amber/30 bg-amber/10 px-4 py-2 text-sm text-amber">STALE DATA — last retrieved result is older than the configured freshness window.</div> : null}
      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      <div className="flex gap-1 overflow-x-auto pb-1">
        {VIEWS.map((v) => (
          <button key={v.id} onClick={() => go(v.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs border ${active === v.id ? "bg-azure/20 border-azure/40 text-text-bright" : "border-white/10 text-text-muted"}`}>
            {v.label}
          </button>
        ))}
      </div>

      {(active === "dashboard" || active === "euromillions" || active === "powerball") && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Last result" value={dash?.lastDraw ? fmtNums(dash.lastDraw.mainNumbers) : "—"} sub={dash?.lastDraw ? `${bonusLabel} ${fmtNums(dash.lastDraw.bonusNumbers)}` : "No official/sandbox draw stored"} />
            <Stat label="Jackpot" value={dash?.jackpotMinor == null ? "unavailable" : `${dash.currency ?? ""} ${(dash.jackpotMinor / 100).toLocaleString()}`} />
            <Stat label="Next draw" value={dash?.rules.drawWeekdays.map((d) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]).join(" / ") ?? "—"} sub={dash?.nextDrawHint} />
            <Stat label="Draws stored" value={String(dash?.performance.drawsTracked ?? 0)} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Number intelligence</CardTitle><CardDescription>HISTORICAL FREQUENCY ANALYSIS — not a prediction.</CardDescription></CardHeader>
              <CardContent className="text-sm space-y-2">
                <div>Hot (window): {dash?.hotMain.map((n) => String(n).padStart(2, "0")).join(" · ") || "—"}</div>
                <div>Cold (window): {dash?.coldMain.map((n) => String(n).padStart(2, "0")).join(" · ") || "—"}</div>
                <div className="text-xs text-text-muted">A long gap is an observation, not evidence a number is “due”.</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{bonusLabel}</CardTitle><CardDescription>Same honesty rule as main numbers.</CardDescription></CardHeader>
              <CardContent className="text-sm space-y-2">
                <div>Hot: {dash?.hotBonus.map((n) => String(n).padStart(2, "0")).join(" · ") || "—"}</div>
                <div>Cold: {dash?.coldBonus.map((n) => String(n).padStart(2, "0")).join(" · ") || "—"}</div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {(active === "results" || active === "history") && (
        <Card>
          <CardHeader><CardTitle>Draw results</CardTitle><CardDescription>Source and verification are stored with every row.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {draws.length === 0 ? <p className="text-sm text-text-muted">No draws stored. Configure an official feed or run the sandbox pipeline.</p> : draws.map((d) => (
              <div key={d.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm flex flex-wrap justify-between gap-2">
                <div>
                  <div className="text-text-bright">{d.drawDate.slice(0, 10)} · {fmtNums(d.mainNumbers)} ★ {fmtNums(d.bonusNumbers)}</div>
                  <div className="text-xs text-text-muted">{d.source} · retrieved {d.retrievedAt} · {d.dataClass}</div>
                </div>
                <div className="flex gap-2">
                  <Badge variant={d.verified ? "emerald" : "amber"}>{d.verified ? "VERIFIED" : "UNVERIFIED"}</Badge>
                  <Badge variant={d.validationStatus === "VALID" ? "azure" : "danger"}>{d.validationStatus}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(active === "numbers" || active === "stars") && (
        <Card>
          <CardHeader>
            <CardTitle>{active === "stars" ? `${bonusLabel} intelligence` : "Number intelligence"}</CardTitle>
            <CardDescription>STATISTICAL OBSERVATION over the selected window. Not a next-draw forecast.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3">
              {[10, 25, 50, 100, 250].map((n) => (
                <Button key={n} size="sm" variant={windowN === n ? "primary" : "outline"} onClick={() => setWindowN(n)}>{n}</Button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-text-muted">
                  <tr>{["#", "Appearances", "%", "Last", "Gap", "Avg gap", "Recent", "Trend"].map((h) => <th key={h} className="text-left py-1 pr-3">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {(active === "stars" ? stars : nums).map((s) => (
                    <tr key={s.number} className="border-t border-white/5">
                      <td className="py-1 pr-3 text-text-bright">{String(s.number).padStart(2, "0")}</td>
                      <td>{s.appearances}</td>
                      <td>{pct(s.appearancePct)}</td>
                      <td>{s.lastAppearance?.slice(0, 10) ?? "—"}</td>
                      <td>{s.drawsSince ?? "—"}</td>
                      <td>{s.averageGap == null ? "—" : s.averageGap.toFixed(1)}</td>
                      <td>{s.recentAppearances}</td>
                      <td>{s.frequencyTrend}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {active === "generator" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI combination generator</CardTitle>
              <CardDescription>Every valid line has the same mathematical chance of being drawn. Scores are statistical-fit / diversity only.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-xs text-text-muted">Mode
                <Select value={mode} onChange={(e) => setMode(e.target.value as any)}>
                  <option>RANDOM</option><option>BALANCED</option><option>HISTORICAL</option>
                  <option>DIVERSIFIED</option><option>ANTI_POPULAR</option><option>AI_ANALYSIS</option>
                </Select>
              </label>
              <label className="text-xs text-text-muted">Lines<Input type="number" value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
              <label className="text-xs text-text-muted">Lock main<Input value={lockMain} onChange={(e) => setLockMain(e.target.value)} placeholder="7, 24" /></label>
              <label className="text-xs text-text-muted">Exclude main<Input value={exMain} onChange={(e) => setExMain(e.target.value)} placeholder="1, 2" /></label>
              <div className="md:col-span-2 flex flex-wrap gap-2">
                <Button onClick={() => void generate()}>Generate</Button>
                <Input value={ticketName} onChange={(e) => setTicketName(e.target.value)} />
                <Button variant="outline" onClick={() => void saveGenerated()} disabled={!generated.length}>Save ticket</Button>
              </div>
            </CardContent>
          </Card>
          {generated.map((l) => (
            <Card key={l.id}>
              <CardContent className="p-4 space-y-2">
                <div className="text-lg font-semibold text-text-bright">{fmtNums(l.mainNumbers)} ★ {fmtNums(l.bonusNumbers)}</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="azure">STATISTICAL FIT {l.profile.statisticalFitScore}/100</Badge>
                  <Badge variant="slate">{l.profile.assessment}</Badge>
                  {l.profile.diversityScore != null ? <Badge variant="violet">DIVERSITY {l.profile.diversityScore}</Badge> : null}
                </div>
                <div className="text-xs text-text-muted">odd/even {l.profile.odd}/{l.profile.even} · low/high {l.profile.low}/{l.profile.high} · sum {l.profile.sum} · spread {l.profile.spread}</div>
                <details className="text-xs text-text-muted">
                  <summary className="cursor-pointer text-text-bright">Why did AI generate this?</summary>
                  <ul className="list-disc pl-4 mt-1 space-y-1">{l.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {active === "system" && (
        <Card>
          <CardHeader><CardTitle>System builder</CardTitle><CardDescription>Line count is C(N,{dash?.rules.mainCount ?? 5}) × C(S,{dash?.rules.bonusCount ?? 2}). Large systems are truncated to the configured limit.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input value={poolMain} onChange={(e) => setPoolMain(e.target.value)} />
              <Input value={poolStars} onChange={(e) => setPoolStars(e.target.value)} />
            </div>
            <Button onClick={async () => {
              try { setPlan(await lotteryApi.system({ lotteryId, mainPool: parseList(poolMain), bonusPool: parseList(poolStars), expand: true })); }
              catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
            }}>Calculate system</Button>
            {plan ? (
              <div className="text-sm space-y-2">
                <div>{plan.mainCombinations} main × {plan.bonusCombinations} star = <span className="text-text-bright font-semibold">{plan.totalLines} lines</span></div>
                {plan.truncated ? <div className="text-amber text-xs">Expansion truncated at the configured maximum.</div> : null}
                <div className="max-h-64 overflow-y-auto space-y-1 text-xs">
                  {plan.lines.map((l, i) => <div key={i}>{fmtNums(l.mainNumbers)} ★ {fmtNums(l.bonusNumbers)}</div>)}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {active === "analyzer" && (
        <Card>
          <CardHeader><CardTitle>Combination analyzer</CardTitle><CardDescription>Profile a {dash?.rules.mainCount ?? 5}+{dash?.rules.bonusCount ?? 2} line. The fit score is not a win chance.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input value={analyzeMain} onChange={(e) => setAnalyzeMain(e.target.value)} />
              <Input value={analyzeStars} onChange={(e) => setAnalyzeStars(e.target.value)} />
            </div>
            <Button onClick={async () => {
              try { setAnalysis(await lotteryApi.analyze({ lotteryId, mainNumbers: parseList(analyzeMain), bonusNumbers: parseList(analyzeStars), window: windowN })); }
              catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
            }}>Analyze</Button>
            {analysis ? (
              <div className="text-sm space-y-1">
                <Badge variant="azure">STATISTICAL FIT {analysis.profile.statisticalFitScore}/100</Badge>
                <div>{analysis.note}</div>
                <div className="text-xs text-text-muted">{analysis.disclaimer}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {(active === "backtesting" || active === "strategy") && (
        <Card>
          <CardHeader>
            <CardTitle>Strategy lab</CardTitle>
            <CardDescription>HISTORICAL SIMULATION with a random baseline. Past hits do not prove future edge.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={async () => {
                const r = await lotteryApi.backtest({ lotteryId, strategy: mode, linesPerDraw: 1, lastN: windowN });
                setBacktests([r, ...backtests]);
                flash("Simulation stored.");
              }}>Backtest current mode</Button>
              <Button variant="outline" onClick={async () => {
                const c = await lotteryApi.compare(["BALANCED", "HISTORICAL", "RANDOM", "DIVERSIFIED"], Math.min(windowN, 30));
                setBacktests(c.runs);
                flash(c.note);
              }}>Compare strategies</Button>
            </div>
            {backtests.map((b) => (
              <div key={b.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
                <div className="flex gap-2 items-center"><Badge variant="slate">{b.label}</Badge> {b.params.strategy} · {b.drawsEvaluated} draws · {b.linesGenerated} lines</div>
                <div className="text-xs text-text-muted">Tiers: {Object.entries(b.prizeTiers).map(([k, v]) => `${k}:${v}`).join(" ") || "none"}</div>
                {b.randomBaseline ? <div className="text-xs text-text-muted">Random baseline tiers: {Object.entries(b.randomBaseline.prizeTiers).map(([k, v]) => `${k}:${v}`).join(" ") || "none"}</div> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {active === "tickets" && (
        <Card>
          <CardHeader><CardTitle>Saved tickets</CardTitle><CardDescription>Your lines only. Matching runs after a verified draw.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {tickets.length === 0 ? <p className="text-sm text-text-muted">No saved tickets.</p> : tickets.map((t) => (
              <div key={t.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
                <div className="flex justify-between"><span className="text-text-bright">{t.name}</span><Badge variant="slate">{t.status}</Badge></div>
                {t.lines.map((l) => (
                  <div key={l.id} className="text-xs text-text-muted">{fmtNums(l.mainNumbers)} ★ {fmtNums(l.bonusNumbers)} {l.prizeTier && l.prizeTier !== "NONE" ? `· ${l.prizeTier}` : ""}</div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {active === "performance" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Saved tickets" value={String(perf?.savedTickets ?? 0)} sub="ACTUAL TICKET RESULTS" />
          <Stat label="Lines" value={String(perf?.totalLines ?? 0)} />
          <Stat label="Draws tracked" value={String(perf?.drawsTracked ?? 0)} />
          <Stat label="Avg diversity" value={perf?.averageDiversity == null ? "—" : `${Math.round(perf.averageDiversity)}`} />
          <Stat label="Backtests" value={String(perf?.backtests ?? 0)} sub="HISTORICAL BACKTEST RESULTS — separate" />
          {perf?.dataClass === "SANDBOX" ? <div className="col-span-2 text-xs text-amber">DEMO / SANDBOX DATA — not official performance.</div> : null}
        </div>
      )}

      {active === "reports" && generated[0] && (
        <Card>
          <CardHeader><CardTitle>Latest generation report</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>Model {generated[0].versions.modelName} v{generated[0].versions.modelVersion}</div>
            <ul className="list-disc pl-4 text-text-muted">{generated[0].why.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </CardContent>
        </Card>
      )}

      {(active === "sources" || active === "providers") && (
        <Card>
          <CardHeader><CardTitle>Provider health</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {providers.map((p) => (
              <div key={p.providerId} className="flex justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
                <span>{p.name}</span>
                <Badge variant={p.status === "ONLINE" ? "emerald" : p.status === "NOT_CONFIGURED" ? "slate" : "danger"}>{p.status}</Badge>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => void lotteryApi.pipeline().then(load)}>Sync now</Button>
          </CardContent>
        </Card>
      )}

      {active === "audit" && (
        <Card>
          <CardHeader><CardTitle>Audit logs</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button size="sm" variant="outline" onClick={async () => { try { setAudit(await lotteryApi.audit()); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } }}>Load</Button>
            {audit.map((a) => (
              <div key={a.id} className="text-xs text-text-muted">{a.action} · {a.actorId} · {a.createdAt} · {a.reason}</div>
            ))}
          </CardContent>
        </Card>
      )}

      {active === "settings" && cfg && (
        <Card>
          <CardHeader><CardTitle>Admin settings</CardTitle><CardDescription>Every change is audited. There is no purchase or live-play switch.</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs">Mode
              <Select value={cfg.mode} onChange={(e) => setCfg({ ...cfg, mode: e.target.value as any })}>
                <option>SANDBOX</option><option>PAPER</option><option>PRODUCTION</option>
              </Select>
            </label>
            <label className="text-xs">Default window<Input type="number" value={cfg.defaultWindow} onChange={(e) => setCfg({ ...cfg, defaultWindow: Number(e.target.value) })} /></label>
            <label className="text-xs">Max generate<Input type="number" value={cfg.maxGenerateLines} onChange={(e) => setCfg({ ...cfg, maxGenerateLines: Number(e.target.value) })} /></label>
            <label className="text-xs">Max system lines<Input type="number" value={cfg.maxSystemLines} onChange={(e) => setCfg({ ...cfg, maxSystemLines: Number(e.target.value) })} /></label>
            <Button onClick={async () => {
              const next = await lotteryApi.updateConfig({
                mode: cfg.mode, defaultWindow: cfg.defaultWindow, maxGenerateLines: cfg.maxGenerateLines,
                maxSystemLines: cfg.maxSystemLines, reason: "Updated from Lottery Intelligence settings",
              });
              setCfg(next); flash("Settings saved.");
            }}>Save</Button>
          </CardContent>
        </Card>
      )}

      {dist && (active === "numbers" || active === "dashboard") ? (
        <Card>
          <CardHeader><CardTitle>Distribution (selected window)</CardTitle></CardHeader>
          <CardContent className="text-xs text-text-muted grid grid-cols-2 gap-2">
            <div>Sum min/avg/max: {dist.sum.min ?? "—"} / {dist.sum.average?.toFixed(1) ?? "—"} / {dist.sum.max ?? "—"}</div>
            <div>Draws with consecutives: {dist.consecutiveDraws} ({pct(dist.consecutivePct)})</div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
        <div className="text-xl font-black text-text-bright truncate">{value}</div>
        {sub ? <div className="text-xs text-text-muted">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
