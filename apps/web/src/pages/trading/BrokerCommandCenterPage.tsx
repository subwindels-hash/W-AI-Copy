/**
 * WINDELS AI OS — Trading Command Center (Broker Integration Layer).
 *
 * Upgrade to the AI Trading Intelligence Engine: connect broker accounts (MT5,
 * MT4, FIX, REST, WebSocket, crypto), choose an AI trading mode, submit signals
 * through the Trade Execution Supervisor (mode + risk + connectivity + margin +
 * duplicate checks), manage strategies + portfolio + risk controls, and view
 * everything in one command center.
 *
 * Honesty: live broker execution requires a real connector (shows
 * requires_config). The supervisor + risk controls + kill switch are real and
 * enforced regardless.
 */
import { useCallback, useEffect, useState } from "react";
import { brokerApi, BROKER_TYPES, TRADING_MODES, type BrokerAccount, type BrokerType, type TradingMode, type TradingStrategy, type TradeExecution, type BrokerRiskControls, type PortfolioIntelligence, type TradingCommandCenter, type BrokerTradingAgent } from "@/lib/brokerIntegration";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { DataBanner } from "@/components/ui/DataBanner";
import { Activity, Plus, Loader2, Trash2, ShieldAlert, Power, LineChart, Briefcase, CheckCircle2, XCircle, TrendingUp, Wallet, Layers, Target, Bot } from "lucide-react";

const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const modeColor: Record<string, string> = {
  analysis_only: "bg-slate-500/15 text-slate-300",
  assisted: "bg-violet-500/15 text-violet-300",
  semi_autonomous: "bg-amber-500/15 text-amber-300",
  fully_autonomous: "bg-azure-500/15 text-azure-300",
};
const statusColor: Record<string, string> = {
  requires_config: "bg-amber-500/15 text-amber-300",
  connected: "bg-emerald-500/15 text-emerald-300",
  disconnected: "bg-slate-500/15 text-slate-300",
  error: "bg-rose-500/15 text-rose-300",
};

export function BrokerCommandCenterPage() {
  const [cc, setCc] = useState<TradingCommandCenter | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioIntelligence | null>(null);
  const [strategies, setStrategies] = useState<TradingStrategy[]>([]);
  const [agents, setAgents] = useState<BrokerTradingAgent[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [broker, setBroker] = useState<BrokerType>("mt5");
  const [login, setLogin] = useState("");
  const [server, setServer] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<TradingMode>("analysis_only");

  // trade form
  const [symbol, setSymbol] = useState("EURUSD");
  const [side, setSide] = useState<"long" | "short">("long");
  const [volume, setVolume] = useState("0.1");

  // strategy form
  const [stratName, setStratName] = useState("");
  const [stratType, setStratType] = useState<TradingStrategy["type"]>("rule");

  const refresh = useCallback(async () => {
    try {
      const [c, p, s, ag] = await Promise.all([brokerApi.commandCenter(), brokerApi.portfolio(), brokerApi.strategies(), brokerApi.agents()]);
      setCc(c); setPortfolio(p); setStrategies(s); setAgents(ag);
    } catch { /* degrades before server config */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = useCallback(async (action: string, fn: () => Promise<unknown>) => {
    setBusy(action); setErr(null); setNotice(null);
    try {
      const res = await fn();
      if (res) setNotice(res as string);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }, [refresh]);

  const addAccount = useCallback(async () => {
    if (!name.trim() || !login.trim() || !server.trim() || !password) { setErr("Name, login, server and password are required."); return; }
    await run("addAccount", async () => {
      const a = await brokerApi.createAccount({ name: name.trim(), broker, login: login.trim(), server: server.trim(), password, mode });
      setCreating(false); setName(""); setLogin(""); setServer(""); setPassword("");
      return `Broker account "${a.name}" added (${a.brokerLabel}). ${a.status === "requires_config" ? "Add the live connector to connect." : ""}`;
    });
  }, [name, broker, login, server, password, mode, run]);

  const submitTrade = useCallback(async () => {
    if (!cc?.accounts.length) { setErr("Add a broker account first."); return; }
    const accountId = cc.accounts[0]!.id;
    await run("trade", async () => {
      const ex = await brokerApi.trade({ accountId, symbol: symbol.toUpperCase(), side, volume: Number(volume) || 0.1 });
      return `Signal → ${ex.status}: ${ex.decision}`;
    });
  }, [cc, symbol, side, volume, run]);

  const addStrategy = useCallback(async () => {
    if (!stratName.trim()) { setErr("Strategy name required."); return; }
    await run("strategy", async () => {
      const s = await brokerApi.createStrategy({ name: stratName.trim(), type: stratType, logic: { maxTrades: 30, winRate: 0.5 } });
      setStratName("");
      return `Strategy "${s.name}" created.`;
    });
  }, [stratName, stratType, run]);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2">
            <LineChart className="h-6 w-6 text-azure-400" /> Trading Command Center
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Broker integration + AI trading modes, supervisor-gated execution, strategies, portfolio &amp; risk.
          </p>
        </div>
        <Button onClick={() => { setCreating((c) => !c); setErr(null); }}>
          {creating ? <span className="mr-2">←</span> : <Plus className="h-4 w-4 mr-2" />}
          {creating ? "Done" : "Add Broker Account"}
        </Button>
      </div>

      {cc?.riskControls.killSwitch && (
        <div className="mb-4"><DataBanner message="KILL SWITCH is ACTIVE — all new trade execution is halted. Re-enable trading to continue." /></div>
      )}

      {err && <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{err}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{notice}</div>}

      {creating && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-sm">Connect a broker account</CardTitle><CardDescription>Credentials are encrypted at rest. Live connectivity requires the broker connector.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs text-text-muted">Account name</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main MT5" /></div>
              <div className="space-y-1"><label className="text-xs text-text-muted">Broker</label><Select value={broker} onChange={(e) => setBroker(e.target.value as BrokerType)}>{BROKER_TYPES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</Select></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs text-text-muted">Login</label><Input value={login} onChange={(e) => setLogin(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-xs text-text-muted">Server</label><Input value={server} onChange={(e) => setServer(e.target.value)} placeholder="BrokerServer" /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs text-text-muted">Password (encrypted)</label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-xs text-text-muted">Trading mode</label><Select value={mode} onChange={(e) => setMode(e.target.value as TradingMode)}>{TRADING_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></div>
            </div>
            <Button onClick={addAccount} disabled={busy === "addAccount"}>{busy === "addAccount" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Connect</Button>
          </CardContent>
        </Card>
      )}

      {/* Key stats */}
      {cc && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Stat label="Total Equity" value={usd(cc.totalEquity)} icon={<Wallet className="h-4 w-4" />} />
          <Stat label="Balance" value={usd(cc.totalBalance)} icon={<Wallet className="h-4 w-4" />} />
          <Stat label="Exposure" value={`${usd(cc.portfolioRisk.exposureUsd)} (${cc.portfolioRisk.exposurePct}%)`} icon={<Activity className="h-4 w-4" />} />
          <Stat label="Daily PnL / Confidence" value={`${usd(cc.portfolioRisk.dailyPnL)} / ${cc.tradeConfidence}%`} icon={<TrendingUp className="h-4 w-4" />} />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Accounts */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Briefcase className="h-4 w-4" /> Broker accounts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(!cc || cc.accounts.length === 0) ? (
              <p className="text-sm text-text-muted">No broker accounts yet. Add one above.</p>
            ) : cc.accounts.map((a) => (
              <div key={a.id} className="rounded-xl border border-border bg-bg-elevated px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-text-bright">{a.name} <span className="text-text-muted text-xs">({a.brokerLabel})</span></div>
                    <div className="text-xs text-text-muted mt-0.5">{a.login} @ {a.server} · {a.currency}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={modeColor[a.mode]}>{a.mode.replace(/_/g, " ")}</Badge>
                    <Badge className={statusColor[a.status] ?? ""}>{a.status}</Badge>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                  <div><span className="text-text-muted">Balance</span><div className="text-text-bright font-medium">{usd(a.account.balance)}</div></div>
                  <div><span className="text-text-muted">Equity</span><div className="text-text-bright font-medium">{usd(a.account.equity)}</div></div>
                  <div><span className="text-text-muted">Free margin</span><div className="text-text-bright font-medium">{usd(a.account.freeMargin)}</div></div>
                  <div><span className="text-text-muted">PnL</span><div className={`font-medium ${a.account.profit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{usd(a.account.profit)}</div></div>
                </div>
                {a.error && <div className="mt-1 text-[11px] text-amber-300">{a.error}</div>}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Trade execution */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Trade execution (supervisor-gated)</CardTitle>
            <CardDescription>Every signal passes mode + risk + connectivity + margin + duplicate checks.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><label className="text-xs text-text-muted">Symbol</label><Input value={symbol} onChange={(e) => setSymbol(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-xs text-text-muted">Side</label><Select value={side} onChange={(e) => setSide(e.target.value as "long" | "short")}><option value="long">Long</option><option value="short">Short</option></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-2 items-end">
              <div className="space-y-1"><label className="text-xs text-text-muted">Volume (lots)</label><Input type="number" value={volume} onChange={(e) => setVolume(e.target.value)} /></div>
              <Button onClick={submitTrade} disabled={busy === "trade"} variant="primary"><TrendingUp className="h-3 w-3 mr-1" /> Submit signal</Button>
            </div>
            <div className="border-t border-border pt-2">
              <div className="text-xs text-text-muted mb-1">Recent executions</div>
              {cc?.recentExecutions.length === 0 && <p className="text-sm text-text-muted">No signals yet.</p>}
              {cc?.recentExecutions.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-xs py-1 border-b border-border/50">
                  <span>{e.symbol} {e.side} {e.volume} <span className="text-text-muted">({e.mode.replace(/_/g, " ")})</span></span>
                  <span className="flex items-center gap-1">
                    {e.status === "pending_approval" && <><Button size="sm" variant="outline" onClick={() => void run(`app-${e.id}`, async () => { await brokerApi.approve(e.id); })}><CheckCircle2 className="h-3 w-3" /></Button><Button size="sm" variant="outline" onClick={() => void run(`rej-${e.id}`, async () => { await brokerApi.reject(e.id); })}><XCircle className="h-3 w-3" /></Button></>}
                    <Badge className={e.status === "blocked" ? "bg-rose-500/15 text-rose-300" : e.status === "pending_approval" ? "bg-violet-500/15 text-violet-300" : "bg-emerald-500/15 text-emerald-300"}>{e.status}</Badge>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Broker Trading agents */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Bot className="h-4 w-4" /> AI trading agents (chat-routable workforce)</CardTitle>
          <CardDescription>Specialized agents in the AI Workforce — run one to get a real, deterministic decision.</CardDescription>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-text-muted">No broker trading agents loaded.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {agents.map((a) => (
                <div key={a.key} className="rounded-xl border border-border bg-bg-elevated px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-bright">{a.name}</span>
                    <Badge className="bg-emerald-500/15 text-emerald-300">{a.status}</Badge>
                  </div>
                  <p className="text-xs text-text-muted mt-1">{a.description}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
                    <span>{a.decisions24h ?? 0} decisions · {a.blocked24h ?? 0} blocked</span>
                    <Button size="sm" variant="outline" onClick={() => void run(`agent-${a.key}`, async () => {
                      const r = await brokerApi.runAgent(a.key, a.key === "trade-execution-supervisor" && cc?.accounts.length ? { accountId: cc.accounts[0]!.id, symbol: "EURUSD", side: "long", volume: 0.1 } : undefined);
                      return `${r.agent}: ${r.verdict} — ${r.detail}`;
                    })} disabled={busy === `agent-${a.key}`}>
                      {busy === `agent-${a.key}` ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Bot className="h-3 w-3 mr-1" />}
                      Run
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Portfolio + strategies + risk */}
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" /> Portfolio intelligence</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {portfolio && (
              <>
                <Row label="Total equity" value={usd(portfolio.totalEquity)} />
                <Row label="Diversification" value={`${Math.round(portfolio.diversificationScore * 100)}%`} />
                <div className="pt-1">
                  <div className="text-xs text-text-muted mb-1">Exposure by asset class</div>
                  {Object.entries(portfolio.exposureByAssetClass).map(([k, v]) => <Row key={k} label={k} value={usd(v)} />)}
                </div>
                {portfolio.concentrationRisk.filter((c) => c.flag !== "ok").length > 0 && (
                  <div className="pt-1">
                    {portfolio.concentrationRisk.filter((c) => c.flag !== "ok").map((c) => (
                      <div key={c.symbol} className="text-xs text-rose-300">{c.symbol}: {c.weightPct}% — {c.flag}</div>
                    ))}
                  </div>
                )}
                {portfolio.recommendations.map((r, i) => <div key={i} className="text-xs text-azure-300">• {r}</div>)}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4" /> Strategies</CardTitle>
            <CardDescription>Create, backtest and toggle AI trading strategies.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="space-y-1 flex-1"><label className="text-xs text-text-muted">Strategy name</label><Input value={stratName} onChange={(e) => setStratName(e.target.value)} placeholder="e.g. Trend-follow v1" /></div>
              <div className="space-y-1"><label className="text-xs text-text-muted">Type</label><Select value={stratType} onChange={(e) => setStratType(e.target.value as TradingStrategy["type"])}><option value="rule">Rule</option><option value="ml">ML</option><option value="rl">RL</option><option value="hybrid">Hybrid</option></Select></div>
              <Button size="sm" variant="outline" onClick={addStrategy} disabled={busy === "strategy"}><Plus className="h-3 w-3 mr-1" /> Add</Button>
            </div>
            {strategies.length === 0 && <p className="text-sm text-text-muted">No strategies yet.</p>}
            {strategies.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-bg-elevated px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-bright font-medium">{s.name} <span className="text-text-muted text-xs">({s.type} · v{s.currentVersion})</span></span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => void run(`bt-${s.id}`, async () => { await brokerApi.backtest(s.id); })} title="Backtest"><Activity className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => void run(`tg-${s.id}`, async () => { await brokerApi.toggleStrategy(s.id, !s.enabled); })} title={s.enabled ? "Disable" : "Enable"}><Power className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => void run(`rm-${s.id}`, async () => { await brokerApi.removeStrategy(s.id); })}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
                {s.backtest && (
                  <div className="text-xs text-text-muted mt-1">Backtest: {s.backtest.trades} trades · {Math.round(s.backtest.winRate * 100)}% WR · {s.backtest.totalReturnPct}% return · max DD {s.backtest.maxDrawdownPct}%</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Enterprise risk controls</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {cc?.riskControls && (
              <>
                <Row label="Max daily loss" value={`${cc.riskControls.maxDailyLossPct}%`} />
                <Row label="Max drawdown" value={`${cc.riskControls.maxDrawdownPct}%`} />
                <Row label="Max position" value={usd(cc.riskControls.maxPositionSizeUsd)} />
                <Row label="Max exposure" value={`${cc.riskControls.maxExposurePct}%`} />
                <Row label="Trading session" value={`${cc.riskControls.tradingSessionStart}–${cc.riskControls.tradingSessionEnd}`} />
                <div className="pt-2">
                  <Button size="sm" variant={cc.riskControls.killSwitch ? "danger" : "outline"} onClick={() => void run("kill", async () => { await brokerApi.killSwitch(!cc.riskControls.killSwitch); })}>
                    <Power className="h-3 w-3 mr-1" /> {cc.riskControls.killSwitch ? "Deactivate Kill Switch" : "Activate Kill Switch"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card><CardContent className="flex items-center gap-3 py-4"><div className="text-azure-300">{icon}</div><div><div className="text-xs text-text-muted">{label}</div><div className="text-lg font-semibold text-text-bright">{value}</div></div></CardContent></Card>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-text-muted">{label}</span><span className="font-medium text-text-bright">{value}</span></div>;
}
