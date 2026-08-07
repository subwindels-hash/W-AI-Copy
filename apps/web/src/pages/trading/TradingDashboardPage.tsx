/**
 * WINDELS AI OS — Trading Dashboard (Phase 4).
 *
 * Single-screen overview for every MT5 / Simulator / EA-connected account:
 * equity, PnL windows, win rate, open positions, pending orders, recent
 * executions (with approve/reject for assisted mode), attached EAs, risk
 * controls, kill switch, connector health. Honest numbers from the Broker
 * Integration Service's /brokers/dashboard rollup endpoint.
 */
import { useCallback, useEffect, useState } from "react";
import { brokerApi, type DashboardSummary, type TradeExecution } from "@/lib/brokerIntegration";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataBanner } from "@/components/ui/DataBanner";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bot, CheckCircle2,
  CircleSlash, Gauge, Layers, Loader2, Power, RefreshCw, ShieldAlert, Target,
  TrendingUp, Wallet, XCircle,
} from "lucide-react";

const usd = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(1)}%`;
const timeAgo = (iso?: string) => {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const statusColor: Record<string, string> = {
  connected: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  connecting: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  syncing: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  reconnecting: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  disconnected: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  error: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  requires_config: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const execStatusColor: Record<string, string> = {
  submitted: "bg-sky-500/15 text-sky-300",
  pending_approval: "bg-amber-500/15 text-amber-300",
  approved: "bg-violet-500/15 text-violet-300",
  filled: "bg-emerald-500/15 text-emerald-300",
  failed: "bg-rose-500/15 text-rose-300",
  blocked: "bg-rose-500/15 text-rose-300",
  rejected: "bg-rose-500/15 text-rose-300",
};

function Kpi({ label, value, sub, icon: Icon, tone = "default" }: {
  label: string; value: string; sub?: string; icon?: any;
  tone?: "default" | "pos" | "neg" | "warn";
}) {
  const toneCls =
    tone === "pos" ? "text-emerald-300" :
    tone === "neg" ? "text-rose-300" :
    tone === "warn" ? "text-amber-300" :
    "text-slate-100";
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        {Icon && <div className={`mt-0.5 rounded-md bg-slate-800/70 p-2 ${toneCls}`}><Icon className="h-4 w-4" /></div>}
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
          <p className={`text-xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusDot({ connected }: { connected: boolean }) {
  return connected
    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
    : <CircleSlash className="h-3.5 w-3.5 text-slate-500" />;
}

export function TradingDashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [killSwitch, setKillSwitch] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await brokerApi.dashboard();
      setData(d);
      setKillSwitch(d.risk.killSwitch);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load dashboard");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleKillSwitch = useCallback(async () => {
    setBusy("kill");
    try { await brokerApi.killSwitch(!killSwitch); await load(); }
    catch (e: any) { setErr(e?.message ?? "kill switch failed"); }
    finally { setBusy(null); }
  }, [killSwitch, load]);

  const act = useCallback(async (id: string, verb: "approve" | "reject") => {
    setBusy(id);
    try {
      if (verb === "approve") await brokerApi.approve(id); else await brokerApi.reject(id);
      await load();
    } catch (e: any) { setErr(e?.message ?? "action failed"); }
    finally { setBusy(null); }
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading trading dashboard…
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="p-6">
        <DataBanner variant="no-data" title="Failed to load trading dashboard" message={err} />
        <Button className="mt-4" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />Retry</Button>
      </div>
    );
  }
  if (!data) return null;

  const { accounts, positions, orders, executions, eas, risk, pnl, winRate, health, connectors } = data;
  const pendingApprovals = executions.filter((e) => e.status === "pending_approval");
  const openPositions = positions.filter((p) => p.currentPrice > 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Trading Dashboard</h1>
          <p className="text-sm text-slate-400">
            MT5 • MQL5 EA • Deterministic Simulator — all governor-gated through one supervisor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={killSwitch ? "danger" : "secondary"} onClick={toggleKillSwitch} disabled={busy === "kill"}>
            {busy === "kill" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Power className="h-4 w-4 mr-2" />}
            Kill Switch: {killSwitch ? "ACTIVE" : "off"}
          </Button>
          <Button variant="ghost" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
        </div>
      </div>

      {err && <DataBanner variant="no-data" title="Error" message={err} />}
      {risk.killSwitch && (
        <DataBanner variant="no-data" title="Kill Switch Engaged" message="No new orders will be sent until the kill switch is released. Existing positions may be closed per policy." />
      )}

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Equity"    value={usd(accounts.reduce((s, a) => s + a.account.equity, 0))} sub={`${accounts.length} account(s)`} icon={Wallet} />
        <Kpi label="P&L Today"       value={usd(pnl.today)}   tone={pnl.today >= 0 ? "pos" : "neg"} icon={TrendingUp} />
        <Kpi label="Win Rate (24h)"  value={pct(winRate.day)} sub={`${pct(winRate.week)} 7d`} icon={Target} tone={winRate.day >= 50 ? "pos" : "warn"} />
        <Kpi label="Exposure"        value={usd(openPositions.reduce((s, p) => s + Math.abs(p.volume * p.currentPrice), 0))} sub={`${openPositions.length} open positions`} icon={Layers} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Accounts Online" value={`${health.connectedAccounts}/${health.totalAccounts}`} icon={Activity} tone={health.connectedAccounts === health.totalAccounts ? "pos" : "warn"} />
        <Kpi label="Attached EAs"    value={`${health.connectedEas}/${health.totalEas}`} icon={Bot} />
        <Kpi label="Uptime"          value={pct(health.uptimePct)} icon={Gauge} />
        <Kpi label="Recent Errors"   value={String(health.recentErrors)} tone={health.recentErrors > 0 ? "neg" : "default"} icon={AlertTriangle} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Accounts */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" />Broker Accounts</CardTitle>
            <CardDescription>Real MT5, deterministic simulator, and pure-EA deployments.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-white/5">
              {accounts.length === 0 && (
                <p className="p-6 text-sm text-slate-400">No broker accounts configured. Connect one from the Command Center.</p>
              )}
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusDot connected={a.status === "connected"} />
                      <p className="font-medium truncate">{a.name}</p>
                      <Badge className={statusColor[a.status] ?? ""}>{a.status}</Badge>
                      {a.transport && <Badge className="bg-slate-700/50 text-slate-300">{a.transport}</Badge>}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      {a.brokerLabel} · {a.login}@{a.server} · {a.currency} · {a.leverage}:1 · mode={a.mode} · sync {timeAgo(a.lastSyncAt)}
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="font-semibold">{usd(a.account.equity)}</p>
                    <p className={`text-xs ${a.account.profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {a.account.profit >= 0 ? <ArrowUpRight className="inline h-3 w-3" /> : <ArrowDownRight className="inline h-3 w-3" />}
                      {" "}{usd(a.account.profit)} · bal {usd(a.account.balance)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* EAs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4" />Expert Advisors</CardTitle>
            <CardDescription>MQL5 EAs attached to MT5 accounts.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-white/5">
              {eas.length === 0 && <p className="p-6 text-sm text-slate-400">No EAs paired.</p>}
              {eas.map((e) => (
                <div key={e.eaId} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusDot connected={e.connected} />
                      <p className="font-mono text-xs truncate">{e.eaId}</p>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{e.terminalName} · magic 0x{e.magic.toString(16)} · poll {timeAgo(e.lastPollAt)}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={async () => { await brokerApi.revokeEa(e.eaId); await load(); }}>
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Positions + Orders */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="h-4 w-4" />Open Positions ({openPositions.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr>
                <th className="text-left p-3">Symbol</th><th className="text-left">Side</th><th className="text-right">Vol</th>
                <th className="text-right">Open</th><th className="text-right">Current</th><th className="text-right">SL/TP</th><th className="text-right p-3">P/L</th>
              </tr></thead>
              <tbody className="divide-y divide-white/5">
                {openPositions.length === 0 && <tr><td colSpan={7} className="p-6 text-slate-400 text-center">No open positions.</td></tr>}
                {openPositions.map((p) => (
                  <tr key={p.ticket ?? p.id}>
                    <td className="p-3 font-medium">{p.symbol}</td>
                    <td><Badge className={p.side === "long" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}>{p.side}</Badge></td>
                    <td className="text-right tabular-nums">{p.volume.toFixed(2)}</td>
                    <td className="text-right tabular-nums">{p.openPrice.toFixed(p.openPrice < 10 ? 5 : 2)}</td>
                    <td className="text-right tabular-nums">{p.currentPrice.toFixed(p.currentPrice < 10 ? 5 : 2)}</td>
                    <td className="text-right tabular-nums text-slate-400 text-xs">
                      {p.sl ? p.sl.toFixed(p.sl < 10 ? 5 : 2) : "—"} / {p.tp ? p.tp.toFixed(p.tp < 10 ? 5 : 2) : "—"}
                    </td>
                    <td className={`text-right p-3 tabular-nums ${(p.profit ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{usd(p.profit ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-4 w-4" />Pending Orders ({orders.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr>
                <th className="text-left p-3">Symbol</th><th className="text-left">Type</th><th className="text-right">Vol</th><th className="text-right p-3">Price</th>
              </tr></thead>
              <tbody className="divide-y divide-white/5">
                {orders.length === 0 && <tr><td colSpan={4} className="p-6 text-slate-400 text-center">No pending orders.</td></tr>}
                {orders.map((o) => (
                  <tr key={o.ticket ?? o.id}>
                    <td className="p-3 font-medium">{o.symbol}</td>
                    <td><Badge className="bg-sky-500/15 text-sky-300">{o.type.replace("_", " ")}</Badge></td>
                    <td className="text-right tabular-nums">{o.volume.toFixed(2)}</td>
                    <td className="text-right p-3 tabular-nums">{o.price.toFixed(o.price < 10 ? 5 : 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Executions + approvals */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Trade Executions & Approvals</CardTitle>
            <CardDescription>Every order from AI / manual / strategy sources is logged here.</CardDescription>
          </div>
          {pendingApprovals.length > 0 && <Badge className="bg-amber-500/15 text-amber-300">{pendingApprovals.length} awaiting approval</Badge>}
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr>
              <th className="text-left p-3">Time</th><th>Symbol</th><th>Side</th><th className="text-right">Vol</th>
              <th>Source</th><th>Status</th><th>Decision</th><th className="text-right p-3">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-white/5">
              {executions.length === 0 && <tr><td colSpan={8} className="p-6 text-slate-400 text-center">No executions yet.</td></tr>}
              {executions.map((e: TradeExecution) => (
                <tr key={e.id}>
                  <td className="p-3 text-slate-400 whitespace-nowrap">{timeAgo(e.createdAt)}</td>
                  <td className="font-medium">{e.symbol}</td>
                  <td><Badge className={e.side === "long" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}>{e.side}</Badge></td>
                  <td className="text-right tabular-nums">{e.volume.toFixed(2)}</td>
                  <td className="text-slate-400 text-xs">{e.source}{e.strategyId ? ` · ${e.strategyId}` : ""}</td>
                  <td><Badge className={execStatusColor[e.status] ?? ""}>{e.status}</Badge></td>
                  <td className="text-slate-300 text-xs max-w-[240px] truncate" title={e.decision}>{e.decision}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {e.status === "pending_approval" ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" disabled={busy === e.id} onClick={() => act(e.id, "approve")}>
                          {busy === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          <span className="ml-1">Approve</span>
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy === e.id} onClick={() => act(e.id, "reject")}>
                          <XCircle className="h-3.5 w-3.5" /><span className="ml-1">Reject</span>
                        </Button>
                      </div>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Connector health */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-4 w-4" />Connector Health</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {connectors.map((c) => (
              <Badge key={c.broker} className={c.available ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-slate-500/15 text-slate-400 border-slate-500/30"}>
                {c.label}{c.transport ? ` · ${c.transport}` : ""}: {c.available ? "ready" : "unavailable"}
              </Badge>
            ))}
          </div>
          <div className="mt-4 grid gap-3 text-xs text-slate-400 md:grid-cols-3">
            <div>Daily loss limit: <span className="text-slate-200">{risk.maxDailyLossPct}%</span></div>
            <div>Max position size: <span className="text-slate-200">${risk.maxPositionSizeUsd.toLocaleString()}</span></div>
            <div>Max leverage: <span className="text-slate-200">{risk.maxLeverage}:1</span></div>
            <div>Max drawdown: <span className="text-slate-200">{risk.maxDrawdownPct}%</span></div>
            <div>Session: <span className="text-slate-200">{risk.tradingSessionStart}–{risk.tradingSessionEnd}</span></div>
            <div>Block news events: <span className="text-slate-200">{risk.blockNewsEvents ? "yes" : "no"}</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
