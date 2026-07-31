/**
 * Trading Intelligence Dashboard — WINDELS AI OS
 *
 * Connects the real backend endpoints:
 *   GET /trading-intel/analyze           — multi-indicator analysis (CoinGecko for crypto, real math)
 *   GET /trading-intel/agents/registry   — 16 specialized advisory agents
 *   GET /trading-intel/agents/run        — run a single agent on a symbol
 *   GET /trading-intel/market-data/providers — provider health
 *   GET /trading-intel/journal           — user trade journal
 *   GET /trading-intel/analytics         — performance analytics
 *   GET /trading-intel/positions         — open positions (seeded/synthetic flagged)
 *   GET /trading-intel/sentiment         — sentiment (flagged demo)
 *
 * Decision-support only — NO execution. Every simulation/demo is clearly labeled via DataBanner.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import { Card, CardTitle, CardDescription, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataBanner } from "@/components/ui/DataBanner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  TrendingUp, TrendingDown, Activity, Shield, AlertTriangle,
  RefreshCw, Search, BarChart3, Brain, Cpu, LineChart as LineIcon,
  Target, Scale, Zap, Clock, Database, CircleDot
} from "lucide-react";

type MarketClass = "forex"|"crypto"|"stocks"|"etfs"|"commodities"|"futures"|"options"|"indices"|"bonds"|"precious-metals"|"energy"|"agriculture"|"digital-assets";
type Timeframe = "1m"|"5m"|"15m"|"1h"|"4h"|"1d"|"1w";
type AgentId = "trading-intel"|"forex"|"crypto"|"stocks"|"etfs"|"commodities"|"futures"|"options"|"bonds"|"technical"|"fundamental"|"market-structure"|"sentiment"|"risk-mgmt"|"strategy-opt"|"perf-analytics";

interface ProviderInfo { id: string; name: string; connected: boolean; rateLimitRemaining?: number; lastSuccessAt?: string; latencyMs?: number; supports: string[]; }
interface AgentMeta { id: AgentId; name: string; description: string; markets: string[]; }
interface Signal { source: string; bias: "bullish"|"bearish"|"neutral"; weight: number; detail: string; }
interface Scenario { name: "bull"|"bear"|"sideways"; probability: number; rationale: string; }
interface TradeSetup { side: "long"|"short"; entry: number; stopLoss: number; takeProfit: number[]; riskReward: number; positionSizeUsd: number; confidence: number; rationale: string[]; warnings: string[]; }
interface Analysis {
  symbol: string; marketClass: MarketClass; timeframe: Timeframe;
  dataSource: string; synthetic: boolean; dataFreshnessSec: number;
  price: number; timestamp: number; candlesUsed: number;
  marketRegime: string;
  trend: { direction: "up"|"down"|"sideways"; strength: number; notes: string[] };
  momentum: { direction: "bullish"|"bearish"|"neutral"; strength: number; notes: string[] };
  volatility: { regime: string; atr: number; atrPct: number; notes: string[] };
  volume: { profile: string; trendVsPrice: string; notes: string[] };
  supportResistance: { support: number[]; resistance: number[]; pivotPoint: number };
  signals: Signal[]; scenarios: Scenario[];
  tradeSetup?: TradeSetup;
  disclaimer?: string;
  warnings?: string[];
}
interface AgentReport {
  agent: AgentId; agentName: string; symbol: string; marketClass: MarketClass;
  verdict: string; bias: "bullish"|"bearish"|"neutral"; conviction: number;
  keyPoints: string[]; risks: string[]; dataSource: string; synthetic: boolean;
  timestamp: number; requiredProvider?: string;
}
interface JournalTrade { id: string; symbol: string; side: "long"|"short"; entryPrice: number; exitPrice?: number; size: number; pnl?: number; rMultiple?: number; status: "open"|"closed"; strategy?: string; }
interface Analytics {
  totalTrades: number; wins: number; losses: number; winRate: number; profitFactor: number;
  netPnl: number; grossProfit: number; grossLoss: number; expectancy: number;
  sharpeLike?: number; maxDrawdownPct?: number; bestTrade?: number; worstTrade?: number;
}

const MARKET_CLASSES: { id: MarketClass; label: string; hasRealProvider: boolean }[] = [
  { id: "crypto", label: "Crypto", hasRealProvider: true },
  { id: "forex", label: "Forex", hasRealProvider: false },
  { id: "stocks", label: "Stocks", hasRealProvider: false },
  { id: "etfs", label: "ETFs", hasRealProvider: false },
  { id: "commodities", label: "Commodities", hasRealProvider: false },
  { id: "futures", label: "Futures", hasRealProvider: false },
  { id: "options", label: "Options", hasRealProvider: false },
  { id: "indices", label: "Indices", hasRealProvider: false },
  { id: "bonds", label: "Bonds", hasRealProvider: false },
  { id: "precious-metals", label: "Precious Metals", hasRealProvider: false },
  { id: "energy", label: "Energy", hasRealProvider: false },
  { id: "agriculture", label: "Agriculture", hasRealProvider: false },
  { id: "digital-assets", label: "Digital Assets", hasRealProvider: true },
];

const POPULAR_SYMBOLS: Record<MarketClass, string[]> = {
  crypto: ["BTC/USD", "ETH/USD", "SOL/USD", "BNB/USD", "XRP/USD", "DOGE/USD"],
  forex: ["EUR/USD", "GBP/USD", "USD/JPY", "USD/NGN", "AUD/USD"],
  stocks: ["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "META"],
  etfs: ["SPY", "QQQ", "VTI", "ARKK"],
  commodities: ["XAU/USD", "XAG/USD", "WTI/USD", "BRENT/USD"],
  futures: ["ES", "NQ", "CL", "GC"],
  options: ["SPX", "QQQ"],
  indices: ["SPX", "NDX", "DJI"],
  bonds: ["US10Y", "US2Y", "DE10Y"],
  "precious-metals": ["XAU/USD", "XAG/USD", "XPT/USD"],
  energy: ["WTI/USD", "BRENT/USD", "NG/USD"],
  agriculture: ["CORN", "WHEAT", "SOY"],
  "digital-assets": ["BTC/USD", "ETH/USD"],
};

function fmt(n: number | undefined, digits = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: digits });
  return n.toFixed(digits);
}
function pct(n: number | undefined, digits = 1): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return (n * 100).toFixed(digits) + "%";
}
function timeAgo(ts: number | string | undefined): string {
  if (!ts) return "—";
  const ms = typeof ts === "number" ? (ts > 1e12 ? ts : ts * 1000) : new Date(ts).getTime();
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  return Math.floor(s / 3600) + "h ago";
}
function biasColor(b: string): string {
  if (b === "bullish") return "text-emerald-400";
  if (b === "bearish") return "text-rose-400";
  return "text-amber-400";
}
function biasBg(b: string): string {
  if (b === "bullish") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (b === "bearish") return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  return "bg-amber-500/15 text-amber-300 border-amber-500/30";
}

export function TradingIntelPage() {
  const [symbol, setSymbol] = useState<string>("BTC/USD");
  const [marketClass, setMarketClass] = useState<MarketClass>("crypto");
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [allowSynthetic, setAllowSynthetic] = useState<boolean>(true);
  const [capital, setCapital] = useState<number>(10000);
  const [riskPct, setRiskPct] = useState<number>(1);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [analysisErr, setAnalysisErr] = useState<string | null>(null);

  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [agents, setAgents] = useState<AgentMeta[] | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentId>("trading-intel");
  const [agentReport, setAgentReport] = useState<AgentReport | null>(null);
  const [agentLoading, setAgentLoading] = useState<boolean>(false);
  const [agentErr, setAgentErr] = useState<string | null>(null);

  const [journal, setJournal] = useState<JournalTrade[] | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  const [tab, setTab] = useState<"overview"|"agents"|"journal">("overview");

  const loadAnalysis = useCallback(async () => {
    setAnalysisLoading(true); setAnalysisErr(null);
    try {
      const data = await api.get<Analysis>("/trading-intel/analyze", {
        symbol, marketClass, timeframe,
        allowSynthetic: allowSynthetic ? "true" : "false",
        capitalUsd: capital, riskPerTradePct: riskPct,
        limit: 200,
      });
      setAnalysis(data);
    } catch (e) {
      setAnalysisErr(e instanceof ApiError ? e.message : String(e));
      setAnalysis(null);
    } finally { setAnalysisLoading(false); }
  }, [symbol, marketClass, timeframe, allowSynthetic, capital, riskPct]);

  const runActiveAgent = useCallback(async () => {
    setAgentLoading(true); setAgentErr(null); setAgentReport(null);
    try {
      const data = await api.get<AgentReport>("/trading-intel/agents/run", {
        agent: activeAgent, symbol, marketClass, timeframe,
        allowSynthetic: allowSynthetic ? "true" : "false",
        capitalUsd: capital, riskPerTradePct: riskPct, limit: 200,
      });
      setAgentReport(data);
    } catch (e) {
      setAgentErr(e instanceof ApiError ? e.message : String(e));
    } finally { setAgentLoading(false); }
  }, [activeAgent, symbol, marketClass, timeframe, allowSynthetic, capital, riskPct]);

  useEffect(() => {
    api.get<ProviderInfo[]>("/trading-intel/market-data/providers").then(setProviders).catch(() => {});
    api.get<AgentMeta[]>("/trading-intel/agents/registry").then(setAgents).catch(() => {});
    api.get<JournalTrade[]>("/trading-intel/journal").then(setJournal).catch(() => {});
    api.get<Analytics>("/trading-intel/analytics").then(setAnalytics).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void loadAnalysis(); }, 150);
    return () => clearTimeout(t);
  }, [loadAnalysis]);

  const liveProviderForClass = useMemo(() => {
    if (!providers) return null;
    return providers.find(p => p.connected && p.id !== "synthetic" && p.supports.includes(marketClass)) ?? null;
  }, [providers, marketClass]);

  const showNoDataBanner = !allowSynthetic && !liveProviderForClass;

  return (
    <div className="space-y-5 p-1">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-azure" /> Trading Intelligence
          </h1>
          <p className="text-sm text-text-muted mt-1">
            AI-driven market analysis, multi-agent advisory, and decision support. <span className="text-amber-400">WINDELS is not a broker — you execute manually.</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            <CircleDot className="h-3 w-3 text-emerald-400" /> {providers?.filter(p=>p.connected && p.id!=="synthetic").length ?? 0} live providers
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <Database className="h-3 w-3 text-violet" /> 16 agents
          </Badge>
        </div>
      </div>

      {/* Provider banners */}
      {!liveProviderForClass && marketClass !== "crypto" && (
        <DataBanner variant="no-data" message={`No live market-data provider is configured for ${marketClass.toUpperCase()}. Results below will use the Synthetic Demo provider (clearly labeled) until you connect a real source (e.g., Polygon, TwelveData, OANDA).`} />
      )}
      {!allowSynthetic && showNoDataBanner && (
        <DataBanner variant="no-data" />
      )}
      {analysis && analysis.synthetic && !showNoDataBanner && (
        <DataBanner variant="simulation" title="SIMULATION / DEMO DATA" message="Prices & candles come from the Synthetic Demo provider, not a live exchange. Use for UI walkthroughs only." />
      )}
      {analysis && !analysis.synthetic && (
        <DataBanner variant="simulation" title="LIVE MARKET DATA" message={`Source: ${analysis.dataSource} · ${analysis.candlesUsed} candles · ${timeAgo(analysis.timestamp)} · Advisory only.`} className="!border-emerald-500/40 !bg-emerald-500/10 ![&>div>div:first-child+div>div:first-child]:!text-emerald-300" />
      )}
      {analysisErr && (
        <DataBanner variant="no-data" title="ANALYSIS ERROR" message={analysisErr} />
      )}

      {/* Control bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px]">
              <label className="text-[11px] uppercase tracking-wider text-text-muted">Symbol</label>
              <Input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                list="symbol-suggestions"
                placeholder="BTC/USD"
              />
              <datalist id="symbol-suggestions">
                {(POPULAR_SYMBOLS[marketClass] ?? []).map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-muted">Market</label>
              <Select value={marketClass} onChange={(e) => { setMarketClass(e.target.value as MarketClass); const list = POPULAR_SYMBOLS[e.target.value as MarketClass]; if (list?.length) setSymbol(list[0] ?? ""); }}>
                {MARKET_CLASSES.map(mc => (
                  <option key={mc.id} value={mc.id}>
                    {mc.label}{mc.hasRealProvider ? " (live)" : " (synthetic)"}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-muted">Timeframe</label>
              <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>
                {(["1m","5m","15m","1h","4h","1d","1w"] as Timeframe[]).map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-muted">Capital (USD)</label>
              <Input type="number" value={capital} onChange={(e)=>setCapital(Number(e.target.value))} min={100} />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-muted">Risk / Trade (%)</label>
              <Input type="number" value={riskPct} onChange={(e)=>setRiskPct(Number(e.target.value))} min={0.1} max={10} step={0.1} />
            </div>
            <label className="flex items-center gap-2 text-xs text-text-muted pb-2">
              <input type="checkbox" checked={allowSynthetic} onChange={(e)=>setAllowSynthetic(e.target.checked)} className="accent-azure" />
              Allow synthetic demo
            </label>
            <Button onClick={loadAnalysis} disabled={analysisLoading} className="gap-2">
              {analysisLoading ? <RefreshCw className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>} Analyze
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/5">
        {([["overview","Overview",LineIcon],["agents","AI Agents",Brain],["journal","Journal & Analytics",Target]] as const).map(([id,label,Icon])=>(
          <button key={id} onClick={()=>setTab(id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${tab===id?"border-azure text-white":"border-transparent text-text-muted hover:text-white"}`}>
            <Icon className="h-4 w-4"/>{label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewPanel analysis={analysis} loading={analysisLoading} />}
      {tab === "agents" && (
        <AgentsPanel
          agents={agents} activeAgent={activeAgent} setActiveAgent={setActiveAgent}
          report={agentReport} loading={agentLoading} error={agentErr}
          onRun={runActiveAgent} symbol={symbol}
        />
      )}
      {tab === "journal" && <JournalPanel journal={journal} analytics={analytics} onRefresh={() => {
        api.get<JournalTrade[]>("/trading-intel/journal").then(setJournal).catch(()=>{});
        api.get<Analytics>("/trading-intel/analytics").then(setAnalytics).catch(()=>{});
      }} />}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, sub, tone="azure" }:{icon:any;label:string;value:React.ReactNode;sub?:React.ReactNode;tone?:string}) {
  const toneBg: Record<string,string> = { azure:"bg-azure/15 text-azure", emerald:"bg-emerald-500/15 text-emerald-400", rose:"bg-rose-500/15 text-rose-400", amber:"bg-amber-500/15 text-amber-400", violet:"bg-violet/15 text-violet" };
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className={`h-9 w-9 rounded-lg grid place-items-center ${toneBg[tone] ?? toneBg.azure}`}>
          <Icon className="h-5 w-5"/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-text-muted">{label}</div>
          <div className="text-lg font-semibold text-text-bright truncate">{value}</div>
          {sub && <div className="text-xs text-text-muted truncate">{sub}</div>}
        </div>
      </div>
    </Card>
  );
}

function OverviewPanel({ analysis, loading }:{analysis:Analysis|null;loading:boolean}) {
  if (loading && !analysis) {
    return <div className="grid grid-cols-1 md:grid-cols-4 gap-3">{Array.from({length:8}).map((_,i)=>(<Skeleton key={i} className="h-24 rounded-xl"/>))}</div>;
  }
  if (!analysis) {
    return <Card className="p-8 text-center text-text-muted">Enter a symbol and click Analyze to begin.</Card>;
  }
  const bullPct = Math.round((analysis.scenarios.find(s=>s.name==="bull")?.probability ?? 0)*100);
  const bearPct = Math.round((analysis.scenarios.find(s=>s.name==="bear")?.probability ?? 0)*100);
  const sidePct = Math.round((analysis.scenarios.find(s=>s.name==="sideways")?.probability ?? 0)*100);

  return (
    <div className="space-y-4">
      {/* Price + regime row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={analysis.trend.direction==="up"?TrendingUp:analysis.trend.direction==="down"?TrendingDown:Activity}
          label="Price" value={`$ ${fmt(analysis.price, analysis.price<10?4:2)}`} sub={`${analysis.symbol} · ${analysis.timeframe}`} tone="azure"/>
        <StatTile icon={Cpu} label="Regime" value={analysis.marketRegime.toUpperCase()}
          sub={`Trend ${analysis.trend.direction} · ${pct(analysis.trend.strength,0)} strength`}
          tone={analysis.trend.direction==="up"?"emerald":analysis.trend.direction==="down"?"rose":"amber"}/>
        <StatTile icon={Zap} label="Momentum" value={analysis.momentum.direction} sub={`${pct(analysis.momentum.strength,0)} strength`} tone={analysis.momentum.direction==="bullish"?"emerald":analysis.momentum.direction==="bearish"?"rose":"amber"}/>
        <StatTile icon={Activity} label="Volatility" value={analysis.volatility.regime} sub={`ATR ${fmt(analysis.volatility.atr)} (${pct(analysis.volatility.atrPct/100)})`} tone="violet"/>
      </div>

      {/* Trade setup + scenarios */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-azure"/> Trade Setup (Advisory)</CardTitle>
            <CardDescription>Entry / SL / TP computed from ATR & S/R. Position sized by your risk %.</CardDescription>
          </CardHeader>
          <CardContent>
            {analysis.tradeSetup ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className={biasBg(analysis.tradeSetup.side==="long"?"bullish":"bearish")}>
                    {analysis.tradeSetup.side.toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className="gap-1"><Scale className="h-3 w-3"/> R:R {analysis.tradeSetup.riskReward.toFixed(2)}</Badge>
                  <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3"/> Size ${fmt(analysis.tradeSetup.positionSizeUsd)}</Badge>
                  <Badge variant="outline" className="gap-1"><Brain className="h-3 w-3"/> Confidence {pct(analysis.tradeSetup.confidence,0)}</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <InfoBox label="Entry" value={fmt(analysis.tradeSetup.entry)} accent="azure"/>
                  <InfoBox label="Stop Loss" value={fmt(analysis.tradeSetup.stopLoss)} accent="rose"/>
                  <InfoBox label="TP1" value={fmt(analysis.tradeSetup.takeProfit[0])} accent="emerald"/>
                  <InfoBox label="TP2" value={fmt(analysis.tradeSetup.takeProfit[1])} accent="emerald"/>
                </div>
                {analysis.tradeSetup.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5"/>
                    <ul className="text-xs text-amber-100/90 space-y-1 list-disc list-inside">
                      {analysis.tradeSetup.warnings.map((w,i)=><li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] text-text-muted italic">{analysis.disclaimer}</p>
              </div>
            ) : (
              <p className="text-sm text-text-muted">No trade setup generated for this context.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><LineIcon className="h-5 w-5 text-azure"/> Scenarios</CardTitle>
            <CardDescription>Probabilistic outlook (SIMULATION).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysis.scenarios.map(s=>(
              <div key={s.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="capitalize">{s.name}</span>
                  <span className={`font-semibold ${s.name==="bull"?"text-emerald-400":s.name==="bear"?"text-rose-400":"text-amber-400"}`}>{Math.round(s.probability*100)}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className={`h-full ${s.name==="bull"?"bg-emerald-500":s.name==="bear"?"bg-rose-500":"bg-amber-500"}`} style={{width:`${s.probability*100}%`}}/>
                </div>
                <p className="text-[11px] text-text-muted mt-1 leading-snug">{s.rationale}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Support/Resistance + Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-azure"/> Support & Resistance</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-rose-400 mb-1">Resistance</div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.supportResistance.resistance.slice(0,5).map((r,i)=>(
                  <Badge key={i} variant="outline" className="border-rose-500/30 text-rose-300">{fmt(r)}</Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1">Pivot</div>
              <Badge variant="outline">{fmt(analysis.supportResistance.pivotPoint)}</Badge>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-emerald-400 mb-1">Support</div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.supportResistance.support.slice(0,5).map((r,i)=>(
                  <Badge key={i} variant="outline" className="border-emerald-500/30 text-emerald-300">{fmt(r)}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-azure"/> Indicator Signals</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {analysis.signals.map((s,i)=>(
                <div key={i} className="flex items-center justify-between gap-2 text-sm p-2 rounded-lg bg-white/[0.03]">
                  <div className="min-w-0">
                    <div className="font-medium text-text-bright truncate">{s.source}</div>
                    <div className="text-xs text-text-muted truncate">{s.detail}</div>
                  </div>
                  <Badge className={biasBg(s.bias)+" shrink-0"}>{s.bias}</Badge>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-white/5 text-[11px] text-text-muted leading-snug">
              <div className="flex items-center gap-1 mb-1"><Clock className="h-3 w-3"/> Data freshness: {Math.round(analysis.dataFreshnessSec)}s · {analysis.candlesUsed} candles</div>
              <div className="flex items-center gap-1"><Database className="h-3 w-3"/> Source: <code className="text-azure">{analysis.dataSource}</code></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Technical notes */}
      <Card>
        <CardHeader><CardTitle>Technical Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <NoteList title="Trend" items={analysis.trend.notes}/>
            <NoteList title="Momentum" items={analysis.momentum.notes}/>
            <NoteList title="Volatility" items={analysis.volatility.notes}/>
            <NoteList title="Volume" items={analysis.volume.notes}/>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoBox({label,value,accent}:{label:string;value:React.ReactNode;accent:string}){
  const map: Record<string,string> = { azure:"border-azure/30 text-azure", rose:"border-rose-500/30 text-rose-400", emerald:"border-emerald-500/30 text-emerald-400" };
  return (
    <div className={`rounded-lg border ${map[accent]??map.azure} bg-white/[0.03] p-2.5`}>
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
function NoteList({title,items}:{title:string;items:string[]}){
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1">{title}</div>
      <ul className="space-y-1 text-text-bright/90">
        {items.map((n,i)=><li key={i} className="flex gap-2 text-xs"><span className="text-azure mt-1">•</span><span>{n}</span></li>)}
      </ul>
    </div>
  );
}

function AgentsPanel({agents,activeAgent,setActiveAgent,report,loading,error,onRun,symbol}:{
  agents:AgentMeta[]|null; activeAgent:AgentId; setActiveAgent:(a:AgentId)=>void;
  report:AgentReport|null; loading:boolean; error:string|null; onRun:()=>void; symbol:string;
}){
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5 text-azure"/>Advisory Agents</CardTitle></CardHeader>
        <CardContent className="p-2 space-y-0.5 max-h-[600px] overflow-y-auto">
          {!agents && <Skeleton className="h-40"/>}
          {agents?.map(a=>(
            <button key={a.id} onClick={()=>setActiveAgent(a.id)}
              className={`w-full text-left p-2.5 rounded-lg transition-colors ${activeAgent===a.id?"bg-azure/15 border border-azure/30":"hover:bg-white/5 border border-transparent"}`}>
              <div className="text-sm font-medium text-text-bright">{a.name}</div>
              <div className="text-[11px] text-text-muted line-clamp-2">{a.description}</div>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>{agents?.find(a=>a.id===activeAgent)?.name ?? "Agent"}</CardTitle>
            <CardDescription>{agents?.find(a=>a.id===activeAgent)?.description}</CardDescription>
          </div>
          <Button onClick={onRun} disabled={loading} className="gap-2">
            {loading?<RefreshCw className="h-4 w-4 animate-spin"/>:<Zap className="h-4 w-4"/>} Run on {symbol}
          </Button>
        </CardHeader>
        <CardContent>
          {error && <DataBanner variant="no-data" title="AGENT ERROR" message={error}/>}
          {!report && !loading && !error && (
            <p className="text-sm text-text-muted">Select an agent and click <b>Run on {symbol}</b> to generate an advisory report.</p>
          )}
          {loading && <div className="space-y-2">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-14 rounded-lg"/>)}</div>}
          {report && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={biasBg(report.bias)}>{report.bias.toUpperCase()}</Badge>
                <Badge variant="outline">Conviction {Math.round(report.conviction*100)}%</Badge>
                <Badge variant="outline" className={report.synthetic?"border-amber-500/30 text-amber-300":"border-emerald-500/30 text-emerald-300"}>
                  {report.synthetic?"SIMULATION":"LIVE"} · {report.dataSource}
                </Badge>
                <span className="text-xs text-text-muted ml-auto"><Clock className="inline h-3 w-3 mr-1"/>{timeAgo(report.timestamp)}</span>
              </div>
              <p className="text-sm text-text-bright leading-relaxed">{report.verdict}</p>
              {report.requiredProvider && (
                <DataBanner variant="no-creds" message={`Deep ${report.agentName} analysis requires: ${report.requiredProvider}. The current report uses heuristics only.`}/>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-emerald-400 mb-2">Key Points</div>
                  <ul className="space-y-1.5 text-sm">
                    {report.keyPoints.map((k,i)=><li key={i} className="flex gap-2"><span className="text-emerald-400">+</span><span className="text-text-bright/90">{k}</span></li>)}
                  </ul>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-rose-400 mb-2">Risks</div>
                  <ul className="space-y-1.5 text-sm">
                    {report.risks.map((k,i)=><li key={i} className="flex gap-2"><span className="text-rose-400">!</span><span className="text-text-bright/90">{k}</span></li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function JournalPanel({journal,analytics,onRefresh}:{journal:JournalTrade[]|null;analytics:Analytics|null;onRefresh:()=>void}){
  return (
    <div className="space-y-4">
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile icon={Target} label="Net P&L" value={`$ ${fmt(analytics.netPnl)}`} sub={`${analytics.totalTrades} trades`} tone={analytics.netPnl>=0?"emerald":"rose"}/>
          <StatTile icon={Activity} label="Win Rate" value={pct(analytics.winRate/100,1)} sub={`${analytics.wins}W / ${analytics.losses}L`} tone="azure"/>
          <StatTile icon={Scale} label="Profit Factor" value={analytics.profitFactor.toFixed(2)} sub={`Expectancy $${fmt(analytics.expectancy)}`} tone={analytics.profitFactor>=1?"emerald":"rose"}/>
          <StatTile icon={TrendingDown} label="Max Drawdown" value={pct((analytics.maxDrawdownPct ?? 0)/100,1)} sub={`Sharpe ${fmt(analytics.sharpeLike)}`} tone="rose"/>
        </div>
      )}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Trade Journal</CardTitle><CardDescription>Manually recorded executions — WINDELS never places orders.</CardDescription></div>
          <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1"><RefreshCw className="h-3.5 w-3.5"/>Refresh</Button>
        </CardHeader>
        <CardContent>
          {!journal ? <Skeleton className="h-24"/> : journal.length===0 ? (
            <p className="text-sm text-text-muted">No journal entries yet. Use <code>POST /trading-intel/journal</code> to record trades.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-text-muted">
                  <tr><th className="text-left py-2 pr-3">Symbol</th><th className="text-left py-2 pr-3">Side</th><th className="text-right py-2 pr-3">Entry</th><th className="text-right py-2 pr-3">Exit</th><th className="text-right py-2 pr-3">Size</th><th className="text-right py-2 pr-3">P&L</th><th className="text-right py-2 pr-3">R</th><th className="text-left py-2">Strategy</th></tr>
                </thead>
                <tbody>
                  {journal.map(t=>(
                    <tr key={t.id} className="border-t border-white/5">
                      <td className="py-2 pr-3 font-medium">{t.symbol}</td>
                      <td className="py-2 pr-3"><Badge className={biasBg(t.side==="long"?"bullish":"bearish")}>{t.side}</Badge></td>
                      <td className="py-2 pr-3 text-right">{fmt(t.entryPrice)}</td>
                      <td className="py-2 pr-3 text-right">{t.exitPrice?fmt(t.exitPrice):<span className="text-text-muted">open</span>}</td>
                      <td className="py-2 pr-3 text-right">{fmt(t.size,4)}</td>
                      <td className={`py-2 pr-3 text-right font-semibold ${(t.pnl??0)>=0?"text-emerald-400":"text-rose-400"}`}>{t.pnl!==undefined?"$"+fmt(t.pnl):"—"}</td>
                      <td className="py-2 pr-3 text-right">{t.rMultiple!==undefined?fmt(t.rMultiple)+"R":"—"}</td>
                      <td className="py-2 text-text-muted">{t.strategy ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default TradingIntelPage;
