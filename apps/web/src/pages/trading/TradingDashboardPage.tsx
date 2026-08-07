/**
 * WINDELS AI OS — Trading Dashboard (Phase 4).
 *
 * Single-screen overview for every MT5 / Simulator / EA-connected account:
 * equity, PnL windows, win rate, open positions, pending orders, recent
 * executions (with approve/reject for assisted mode), attached EAs, risk
 * controls, kill switch, connector health. Honest numbers from the Broker
 * Integration Service's /brokers/dashboard rollup endpoint.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { brokerApi, type BrokerPendingOrder, type BrokerPosition, type DashboardSummary, type TradeExecution } from "@/lib/brokerIntegration";
import { useTradingEvents } from "@/lib/tradingEvents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataBanner } from "@/components/ui/DataBanner";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bot, CheckCircle2,
  CircleSlash, Gauge, Hand, Layers, Loader2, Power, Radio, RefreshCw, ShieldAlert,
  Target, TrendingUp, Wallet, Wifi, WifiOff, XCircle, Zap,
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
  idle: "bg-slate-500/15 text-slate-300 border-slate-500/30",
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
  const [autoPaused, setAutoPaused] = useState(false);

  // Live SSE stream — updates tick/execution state between polling refreshes.
  // WINDELS is an AI Trading Agent; this feed only relays events originating
  // from the user's own connected broker/exchange.
  const live = useTradingEvents({ enabled: true });

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await brokerApi.dashboard();
      setData(d);
      setKillSwitch(d.risk.killSwitch);
      setAutoPaused(d.risk.pauseAutonomousTrading);
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

  const toggleAutonomousPause = useCallback(async () => {
    setBusy("pause");
    try { await brokerApi.pauseAutonomous(!autoPaused); await load(); }
    catch (e: any) { setErr(e?.message ?? "pause autonomous failed"); }
    finally { setBusy(null); }
  }, [autoPaused, load]);

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

  // Override per-account status from SSE account_state events when fresher
  // than the last polled snapshot. This lets the dashboard react to connector
  // error/disconnect events instantly without waiting for the next refresh.
  const accountsWithLive = useMemo(() => accounts.map((a) => {
    const la = live.accountStateByAccount[a.id];
    if (!la) return a;
    return { ...a, status: la.status as typeof a.status, error: la.error ?? a.error, lastSyncAt: la.lastSyncAt ?? a.lastSyncAt };
  }), [accounts, live.accountStateByAccount]);

  // For action buttons (close/cancel) we resolve the owning account per row.
  // Fall back to first connected account if the row lacks accountId (single-account deployments).
  const accountFor = useCallback((acctId?: string) =>
    accountsWithLive.find((a) => a.id === acctId) ?? accountsWithLive[0]
  , [accountsWithLive]);
  const closePosition = useCallback(async (acctId: string | undefined, ticket: string | undefined, volume?: number) => {
    const a = accountFor(acctId); if (!a || !ticket) return;
    setBusy(`close:${ticket}`);
    try { await brokerApi.closePosition(a.id, ticket, volume); await load(); }
    catch (e: any) { setErr(e?.message ?? "close failed"); }
    finally { setBusy(null); }
  }, [accountFor, load]);
  const cancelOrder = useCallback(async (acctId: string | undefined, orderId: string | undefined) => {
    const a = accountFor(acctId); if (!a || !orderId) return;
    setBusy(`cancel:${orderId}`);
    try { await brokerApi.cancelOrder(a.id, orderId); await load(); }
    catch (e: any) { setErr(e?.message ?? "cancel failed"); }
    finally { setBusy(null); }
  }, [accountFor, load]);

  // Merge live executions from SSE that aren't yet in the polled list.
  const mergedExecutions = useMemo(() => {
    const seen = new Set(executions.map((e) => e.id));
    const liveOnly = live.recentExecutions
      .filter((le) => !seen.has(le.id))
      .map((le): TradeExecution => ({
        id: le.id, organizationId: "", accountId: le.accountId, accountName: "",
        symbol: le.symbol, side: (le.side === "sell" || le.side === "short" ? "short" : "long"),
        volume: le.volume, source: "live", confidence: 1, mode: "semi_autonomous",
        status: (le.status === "filled" || le.status === "submitted" || le.status === "failed" || le.status === "blocked" || le.status === "rejected" || le.status === "approved" || le.status === "pending_approval"
          ? (le.status as TradeExecution["status"]) : "submitted"),
        decision: le.decision, riskChecks: [],
        brokerTicket: le.brokerTicket, error: le.error,
        createdAt: le.at, updatedAt: le.at,
      }));
    // Live executions first (newest), then polled list.
    return [...liveOnly.slice().reverse(), ...executions];
  }, [executions, live.recentExecutions]);

  // Merge position_update events from private WS/REST fan-out into the polled
  // positions list. Live updates overlay volume, price, SL/TP, profit; a
  // position with effective volume <= 0 (fully closed) is dropped so the
  // dashboard reflects closes between polls.
  const positionsMerged = useMemo(() => {
    const out: BrokerPosition[] = [];
    const seen = new Set<string>();
    for (const p of positions) {
      const key = `${p.accountId}:${p.ticket ?? p.id}`;
      const lp = live.latestPositionById[key];
      seen.add(key);
      if (!lp) { out.push(p); continue; }
      const merged: BrokerPosition = { ...p, ...lp.data, accountId: p.accountId };
      out.push(merged);
    }
    // Add brand-new positions that showed up over the live stream but aren't
    // in the last poll yet (e.g. newly opened by AI/manual action).
    for (const lp of live.positionUpdates.slice(-200)) {
      const key = `${lp.accountId}:${lp.data.ticket ?? lp.data.id}`;
      if (seen.has(key)) continue;
      const v = Number(lp.data.volume) || 0;
      if (v <= 0) continue;
      out.push({ ...lp.data, accountId: lp.accountId });
      seen.add(key);
    }
    return out;
  }, [positions, live.latestPositionById, live.positionUpdates]);

  // Overlay latest live tick prices on positions for near-real-time P/L.
  const positionsWithLive = useMemo(() => positionsMerged.map((p) => {
    const t = live.latestTickByKey[`${p.accountId}:${p.symbol}`];
    const key = `${p.accountId}:${p.ticket ?? p.id}`;
    const lp = live.latestPositionById[key];
    // Use the live currentPrice if it's newer/more complete, fall back to
    // tick-derived bid/ask, otherwise keep polled currentPrice.
    const liveCurrent = lp?.data.currentPrice;
    if (!t && typeof liveCurrent === "number" && liveCurrent > 0) return p;
    if (!t) return p;
    return { ...p, currentPrice: p.side === "long" ? t.bid : t.ask };
  }), [positionsMerged, live.latestTickByKey, live.latestPositionById]);

  const openPositions = positionsWithLive.filter((p) => {
    const v = Number(p.volume) || 0;
    if (v <= 0) return false;
    return p.currentPrice > 0;
  });

  // Merge order_update events into the pending-orders list. Terminal statuses
  // (filled/cancelled/expired/rejected) remove the row between polls; partial
  // overlays filledVolume; active orders keep the freshest fields.
  const ordersMerged = useMemo(() => {
    const TERMINAL = new Set(["filled", "cancelled", "canceled", "expired", "rejected"]);
    const out: BrokerPendingOrder[] = [];
    const seen = new Set<string>();
    for (const o of orders) {
      const key = `${o.accountId}:${o.ticket ?? o.id}`;
      const lo = live.latestOrderById[key];
      seen.add(key);
      if (!lo) { out.push(o); continue; }
      const merged: BrokerPendingOrder = { ...o, ...lo.data, accountId: o.accountId };
      if (TERMINAL.has(String(merged.status ?? ""))) continue;
      out.push(merged);
    }
    for (const lo of live.orderUpdates.slice(-200)) {
      const key = `${lo.accountId}:${lo.data.ticket ?? lo.data.id}`;
      if (seen.has(key)) continue;
      if (TERMINAL.has(String(lo.data.status ?? ""))) continue;
      out.push({ ...lo.data, accountId: lo.accountId });
      seen.add(key);
    }
    return out;
  }, [orders, live.latestOrderById, live.orderUpdates]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Trading Dashboard</h1>
          <p className="text-sm text-slate-400">
            MT5 • MQL5 EA • 12 Crypto Exchanges • Deterministic Backtest — all governor-gated through one supervisor. Live SSE stream shows ticks & fills as they happen at your broker.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoPaused ? "warning" : "secondary"}
            onClick={toggleAutonomousPause}
            disabled={busy === "pause"}
            title={autoPaused
              ? "AI autonomous trading is PAUSED. Manual trades and assisted approvals still work."
              : "Pause only AI autonomous/semi-autonomous trades (manual + approvals continue)."}
          >
            {busy === "pause" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Hand className="h-4 w-4 mr-2" />}
            {autoPaused ? "AI Paused" : "Pause AI"}
          </Button>
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
      {autoPaused && !risk.killSwitch && (
        <DataBanner variant="no-data" title="AI Autonomous Trading Paused" message="Semi/fully-autonomous AI signals are being blocked. Manual trades, assisted-mode approvals, and position closes remain available. Flip the Pause AI toggle to resume." />
      )}

      {/* Live events status + ticker tape */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            {live.connected
              ? <><Wifi className="h-4 w-4 text-emerald-400" /><span className="text-xs uppercase tracking-wider text-emerald-300">Live</span></>
              : <><WifiOff className="h-4 w-4 text-amber-400" /><span className="text-xs uppercase tracking-wider text-amber-300">Connecting…</span></>}
            {live.readyAt && <span className="text-[11px] text-slate-500">since {timeAgo(live.readyAt)}</span>}
            {live.lastEventAt && <span className="text-[11px] text-slate-500">· last event {timeAgo(live.lastEventAt)}</span>}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap text-xs scrollbar-hide" style={{ maskImage: "linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 24px), transparent)" }}>
              {live.recentTicks.length === 0 && <span className="text-slate-500">Awaiting market ticks from connected brokers/exchanges…</span>}
              {live.recentTicks.slice(-20).map((t, i) => (
                <span key={`${t.accountId}:${t.symbol}:${i}`} className="inline-flex items-center gap-1 font-mono shrink-0">
                  <Radio className="h-3 w-3 text-sky-400" />
                  <span className="text-slate-300">{t.symbol}</span>
                  <span className="text-slate-400">{t.bid.toFixed(t.bid < 10 ? 5 : 2)}</span>
                  <span className="text-slate-500">/</span>
                  <span className="text-slate-400">{t.ask.toFixed(t.ask < 10 ? 5 : 2)}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-xs text-slate-400">
            <Zap className="h-3.5 w-3.5 text-violet-400" />
            <span>{live.recentExecutions.length} live execs</span>
            <span>·</span>
            <span>{Object.keys(live.latestOrderById).length + Object.keys(live.latestPositionById).length} live book updates</span>
            <span>·</span>
            <span>{Object.keys(live.latestTickByKey).length} symbols tracked</span>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Equity"    value={usd(accountsWithLive.reduce((s, a) => s + a.account.equity, 0))} sub={`${accountsWithLive.length} account(s)`} icon={Wallet} />
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
            <CardDescription>Connect your own brokers/exchanges via official APIs — MT5 (ZMQ/HTTP/MetaApi), EAs, and 12 crypto exchanges. WINDELS acts as your AI Trading Agent; execution always happens at the broker.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-white/5">
              {accountsWithLive.length === 0 && (
                <p className="p-6 text-sm text-slate-400">No broker accounts configured. Connect one from the Command Center.</p>
              )}
              {accountsWithLive.map((a) => (
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4" />Open Positions ({openPositions.length})
              {live.connected && <Badge className="ml-1 bg-emerald-500/15 text-emerald-300 border-emerald-500/30"><Radio className="h-3 w-3 mr-1" />LIVE</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr>
                <th className="text-left p-3">Symbol</th><th className="text-left">Side</th><th className="text-right">Vol</th>
                <th className="text-right">Open</th><th className="text-right">Current</th><th className="text-right">SL/TP</th><th className="text-right">P/L</th><th className="text-right p-3 w-8" />
              </tr></thead>
              <tbody className="divide-y divide-white/5">
                {openPositions.length === 0 && <tr><td colSpan={8} className="p-6 text-slate-400 text-center">No open positions.</td></tr>}
                {openPositions.map((p) => {
                  const pKey = p.ticket ?? p.id;
                  const justUpdated = live.latestPositionById[`${p.accountId}:${pKey}`];
                  const cur = p.currentPrice > 0 ? p.currentPrice : p.openPrice;
                  return (
                  <tr key={pKey} className={justUpdated ? "bg-emerald-500/5 transition-colors" : ""}>
                    <td className="p-3 font-medium">
                      {p.symbol}
                      {justUpdated && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" title="Updated live" />}
                    </td>
                    <td><Badge className={p.side === "long" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}>{p.side}</Badge></td>
                    <td className="text-right tabular-nums">{p.volume.toFixed(2)}</td>
                    <td className="text-right tabular-nums">{p.openPrice.toFixed(p.openPrice < 10 ? 5 : 2)}</td>
                    <td className="text-right tabular-nums">{cur.toFixed(cur < 10 ? 5 : 2)}</td>
                    <td className="text-right tabular-nums text-slate-400 text-xs">
                      {p.sl ? p.sl.toFixed(p.sl < 10 ? 5 : 2) : "—"} / {p.tp ? p.tp.toFixed(p.tp < 10 ? 5 : 2) : "—"}
                    </td>
                    <td className={`text-right tabular-nums ${(p.profit ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{usd(p.profit ?? 0)}</td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="ghost" title="Close position"
                              disabled={!!busy || killSwitch}
                              onClick={() => closePosition(p.accountId, pKey)}>
                        {busy === `close:${pKey}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5 text-rose-400" />}
                      </Button>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4" />Pending Orders ({ordersMerged.length})
              {live.connected && <Badge className="ml-1 bg-emerald-500/15 text-emerald-300 border-emerald-500/30"><Radio className="h-3 w-3 mr-1" />LIVE</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr>
                <th className="text-left p-3">Symbol</th><th className="text-left">Type</th><th className="text-left">Status</th><th className="text-right">Vol</th><th className="text-right">Price</th><th className="text-right p-3 w-8" />
              </tr></thead>
              <tbody className="divide-y divide-white/5">
                {ordersMerged.length === 0 && <tr><td colSpan={6} className="p-6 text-slate-400 text-center">No pending orders.</td></tr>}
                {ordersMerged.map((o) => {
                  const oKey = o.ticket ?? o.id;
                  const justUpdated = live.latestOrderById[`${o.accountId}:${oKey}`];
                  return (
                  <tr key={oKey} className={justUpdated ? "bg-emerald-500/5 transition-colors" : ""}>
                    <td className="p-3 font-medium">{o.symbol}</td>
                    <td><Badge className="bg-sky-500/15 text-sky-300">{o.type.replace("_", " ")}</Badge></td>
                    <td><Badge className={o.status === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}>{o.status}</Badge></td>
                    <td className="text-right tabular-nums">{o.volume.toFixed(2)}</td>
                    <td className="text-right tabular-nums">{o.price.toFixed(o.price < 10 ? 5 : 2)}</td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="ghost" title="Cancel order"
                              disabled={!!busy || killSwitch || o.status !== "active"}
                              onClick={() => cancelOrder(o.accountId, oKey)}>
                        {busy === `cancel:${oKey}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5 text-amber-400" />}
                      </Button>
                    </td>
                  </tr>
                );})}
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
          {live.connected && <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30"><Radio className="h-3 w-3 mr-1" />LIVE</Badge>}
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr>
              <th className="text-left p-3">Time</th><th>Symbol</th><th>Side</th><th className="text-right">Vol</th>
              <th>Source</th><th>Status</th><th>Decision</th><th className="text-right p-3">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-white/5">
              {mergedExecutions.length === 0 && <tr><td colSpan={8} className="p-6 text-slate-400 text-center">No executions yet.</td></tr>}
              {mergedExecutions.slice(0, 50).map((e: TradeExecution) => (
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
            <div>AI autonomous: <span className={risk.pauseAutonomousTrading ? "text-amber-300" : "text-emerald-300"}>{risk.pauseAutonomousTrading ? "PAUSED" : "running"}</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
