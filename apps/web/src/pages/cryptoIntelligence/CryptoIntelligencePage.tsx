/**
 * WINDELS AI OS — Crypto Intelligence console.
 *
 * Opt-in module: chain monitoring, market tickers, DeFi, wallets/portfolio,
 * security alerts, strategies and trade proposals. Values are live from the
 * module; nothing is fabricated.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Bitcoin, Activity, ShieldAlert, X } from "lucide-react";
import type { CiDashboard, ChainMonitor, MarketTicker, PortfolioPosition, Strategy, TradeProposal, SecurityAlert } from "@windels/shared";
import { ciApi } from "@/lib/cryptoIntelligence";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function fmtMoney(n: number) { return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function statTone(s: string): any { return s === "online" ? "emerald" : s === "offline" ? "crimson" : "amber"; }

export function CryptoIntelligencePage() {
  const [dash, setDash] = useState<CiDashboard | null>(null);
  const [chains, setChains] = useState<ChainMonitor[]>([]);
  const [markets, setMarkets] = useState<MarketTicker[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [trades, setTrades] = useState<TradeProposal[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, c, m, p, a, s, t] = await Promise.all([
        ciApi.dashboard(), ciApi.listChains(), ciApi.listMarkets(), ciApi.listPortfolio(), ciApi.listAlerts(), ciApi.listStrategies(), ciApi.listTrades(),
      ]);
      setDash(d); setChains(c); setMarkets(m); setPortfolio(p); setAlerts(a); setStrategies(s); setTrades(t);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading crypto intelligence…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Bitcoin className="h-6 w-6 text-azure" /> Crypto Intelligence</h1>
          <p className="text-sm text-text-muted">Chain monitoring, markets, DeFi, portfolio &amp; security.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={dash.moduleEnabled ? "emerald" : "slate"}>{dash.moduleEnabled ? "enabled" : "disabled"}</Badge>
          <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
        </div>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{dash.chains}</div><div className="text-sm text-text-muted">Chains ({dash.chainsLive} live)</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{dash.marketsTracked}</div><div className="text-sm text-text-muted">Markets</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-azure">{fmtMoney(dash.portfolioValueUsd)}</div><div className="text-sm text-text-muted">Portfolio value</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{dash.walletsTracked}</div><div className="text-sm text-text-muted">Wallets</div></CardContent></Card>
      </div>

      <Tabs defaultValue="markets">
        <TabsList>
          <TabsTrigger value="markets">Markets ({markets.length})</TabsTrigger>
          <TabsTrigger value="chains">Chains ({chains.length})</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio ({portfolio.length})</TabsTrigger>
          <TabsTrigger value="trades">Trades ({trades.length})</TabsTrigger>
          <TabsTrigger value="strategies">Strategies ({strategies.length})</TabsTrigger>
          <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="markets">
          <Card><CardContent className="space-y-1 pt-4">
            {markets.length === 0 ? <div className="text-sm text-text-muted">No market tickers.</div> : markets.map((m) => (
              <div key={m.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                <span className="font-medium">{m.symbol}</span>
                <span className="flex items-center gap-3">
                  <span className="text-azure">{fmtMoney(m.priceUsd)}</span>
                  <span className={m.change24hPct >= 0 ? "text-emerald-400" : "text-crimson"}>{m.change24hPct >= 0 ? "+" : ""}{m.change24hPct.toFixed(2)}%</span>
                  <span className="text-text-muted text-xs">vol {fmtMoney(m.volume24hUsd)}</span>
                </span>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="chains">
          <Card><CardContent className="space-y-1 pt-4">
            {chains.length === 0 ? <div className="text-sm text-text-muted">No chains monitored.</div> : chains.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-azure"/>{c.chain}</span>
                <span className="flex items-center gap-3">
                  <span className="text-text-muted text-xs">block {c.blockHeight} · {c.tps} tps</span>
                  <Badge variant={statTone(c.status)}>{c.status}</Badge>
                </span>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="portfolio">
          <Card><CardContent className="space-y-1 pt-4">
            {portfolio.length === 0 ? <div className="text-sm text-text-muted">No positions.</div> : portfolio.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                <span className="font-medium">{p.asset}</span>
                <span className="flex items-center gap-3">
                  <span>{p.amount}</span>
                  <span className="text-azure">{fmtMoney(p.valueUsd)}</span>
                  <span className={p.pnl24hUsd >= 0 ? "text-emerald-400" : "text-crimson"}>{p.pnl24hUsd >= 0 ? "+" : ""}{fmtMoney(p.pnl24hUsd)}</span>
                </span>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="trades">
          <Card><CardContent className="space-y-1 pt-4">
            {trades.length === 0 ? <div className="text-sm text-text-muted">No trade proposals.</div> : trades.map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                <span className="flex items-center gap-2">
                  <Badge variant={t.side === "buy" ? "emerald" : "crimson"}>{t.side}</Badge>
                  {t.symbol}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-text-muted text-xs">{t.reason}</span>
                  <Badge variant="outline">{t.state}</Badge>
                </span>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="strategies">
          <Card><CardContent className="space-y-1 pt-4">
            {strategies.length === 0 ? <div className="text-sm text-text-muted">No strategies.</div> : strategies.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                <span className="font-medium">{s.name} <Badge variant="outline">{s.kind}</Badge></span>
                <Badge variant={s.enabled ? "emerald" : "slate"}>{s.enabled ? "enabled" : "disabled"}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card><CardContent className="space-y-1 pt-4">
            {alerts.length === 0 ? <div className="text-sm text-text-muted flex items-center gap-2"><ShieldAlert className="h-4 w-4"/>No security alerts.</div> : alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                <span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-400"/>{a.title}</span>
                <span className="flex items-center gap-3"><span className="text-text-muted text-xs">{a.category}</span>
                <Badge variant={a.severity === "high" ? "crimson" : a.severity === "medium" ? "amber" : "azure"}>{a.severity}</Badge></span>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CryptoIntelligencePage;
