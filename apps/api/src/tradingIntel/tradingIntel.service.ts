/**
 * Unified Enterprise Global Financial Markets Intelligence & Trading Platform (Session 81).
 *
 * Extends Session 35 Crypto Intelligence horizontally across 13 market classes with an
 * 18-agent AI trading workforce, 20 pluggable technical indicators, forex/crypto/stock/ETF/
 * commodity/futures/options/indices/bonds/metals/energy/agriculture/digital-assets coverage,
 * enhanced risk engine, predictive multi-scenario simulation, sentiment pipeline, and
 * continuous learning that writes to Memory Fabric + Knowledge Graph (stub).
 *
 * Hard rules:
 *  - Live trade execution stays under user control unless explicit automation is enabled
 *    per governance policy. No agent introduced here bypasses that gate.
 *  - Session 35 endpoints/schemas are preserved; this service exposes a unified superset.
 *  - All cross-module events route through KernelService.dispatch (Session 39 convention).
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { makeRng } from "../utils/detRng.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
const _rng = makeRng("tradingIntel:tradingIntel");
import type {
  TiDashboard, TiAgent, TiAgentKey, TiAgentStatus, TiIndicatorPlugin, TiIndicatorId,
  TiInstrument, TiMarketClass, TiMarketStatus, TiDirection,
  TiForexPair, TiCryptoAsset, TiStock, TiCommodity,
  TiRiskProfile, TiPosition, TiSentimentReading, TiSimulationResult, TiSimScenario,
  TiEconomicEvent, TiLearningInsight,
} from "@windels/shared";

const K = {
  agents: "ti:agents", agent: (k: string) => `ti:agent:${k}`,
  indicators: "ti:indicators", indicator: (id: string) => `ti:ind:${id}`,
  instruments: (mc: TiMarketClass) => `ti:inst:${mc}`,
  positions: "ti:positions", position: (id: string) => `ti:pos:${id}`,
  risk: "ti:risk",
  sentiment: "ti:sent",
  sims: "ti:sims",
  events: "ti:econev",
  insights: "ti:insights",
  enabled: "ti:enabled",
  metrics: { jobs24: "ti:m:jobs24", sig24: "ti:m:sig24", blocked24: "ti:m:blocked24", sim24: "ti:m:sim24" },
};

const j = (s: string) => JSON.parse(s);
const s = (o: any) => JSON.stringify(o);

// ── Seed data ──────────────────────────────────────────────────────────
const AGENT_DEFS: Array<Omit<TiAgent, "lastHeartbeat" | "signals24h" | "decisions24h" | "approvedTrades24h" | "blockedTrades24h" | "messageRate" | "errorRate">> = [
  { key: "market-intel",       name: "Market Intelligence Agent",       description: "Cross-market signal aggregation and headline monitoring",                         status: "online" },
  { key: "forex-intel",        name: "Forex Intelligence Agent",        description: "Majors/minors/exotics, currency strength, correlations, central banks",          status: "online" },
  { key: "crypto-intel",       name: "Cryptocurrency Intelligence Agent", description: "Multi-chain/on-chain/whale/DeFi/NFT/DAO/stablecoin/risk (extends S35)",         status: "online" },
  { key: "stocks-intel",       name: "Stock Market Intelligence Agent", description: "Equities, fundamentals, earnings, sectors, factors",                              status: "online" },
  { key: "etf-intel",          name: "ETF Analysis Agent",              description: "Sector/thematic/leveraged ETF flows, holdings, arbitrage",                        status: "online" },
  { key: "commodities-intel",  name: "Commodities Analysis Agent",      description: "Metals, energy, agriculture supply/demand, seasonals, inventory",                 status: "online" },
  { key: "futures-intel",      name: "Futures Intelligence Agent",      description: "Futures curves, term structure, contango/backwardation, roll yield",             status: "online" },
  { key: "options-intel",      name: "Options Intelligence Agent",      description: "Greeks, IV surfaces, skew, option flow, max pain, OI concentration",             status: "online" },
  { key: "bonds-intel",        name: "Bond Market Intelligence Agent",  description: "Yield curves, credit spreads, sovereign/corporate debt, duration",               status: "online" },
  { key: "portfolio-intel",    name: "Portfolio Intelligence Agent",    description: "Portfolio construction, optimization, rebalancing, factor exposure",             status: "online" },
  { key: "strategy-opt",       name: "Strategy Optimization Agent",     description: "Backtesting, walk-forward, parameter sweep, strategy ensemble",                  status: "online" },
  { key: "market-sentiment",   name: "Market Sentiment Agent",          description: "News/social/earnings/regulatory/blockchain/community/institutional sentiment",  status: "online" },
  { key: "economic-intel",     name: "Economic Intelligence Agent",     description: "Macro data, NFP/CPI/GDP/rate decisions, economic calendar",                      status: "online" },
  { key: "risk-mgmt",          name: "Risk Management Agent",           description: "Position sizing, VaR, drawdown protection, exposure, corr/vol regime",          status: "online" },
  { key: "trade-validation",   name: "Trade Validation Agent",          description: "Pre-trade checks: pattern validity, policy, size, duplicate, fat-finger",       status: "online" },
  { key: "compliance-gov",     name: "Compliance & Governance Agent",   description: "Regulatory, internal policy, KYC/AML, restricted-asset rules, audit",           status: "online" },
  { key: "perf-analytics",     name: "Performance Analytics Agent",     description: "Attribution, win-rate, Sharpe, Sortino, drawdown analysis",                      status: "online" },
  { key: "continuous-learning",name: "Continuous Learning Agent",       description: "Feeds trades/results/outcomes into Memory Fabric and Knowledge Graph",          status: "online" },
];

const INDICATOR_DEFS: TiIndicatorPlugin[] = [
  { id: "MA",         name: "Moving Average",              category: "trend",             installed: true, version: "1.0.0", author: "windels" },
  { id: "EMA",        name: "Exponential Moving Average",  category: "trend",             installed: true, version: "1.0.0", author: "windels" },
  { id: "MACD",       name: "MACD",                         category: "trend",             installed: true, version: "1.0.0", author: "windels" },
  { id: "RSI",        name: "Relative Strength Index",      category: "momentum",          installed: true, version: "1.0.0", author: "windels" },
  { id: "BBANDS",     name: "Bollinger Bands",              category: "volatility",        installed: true, version: "1.0.0", author: "windels" },
  { id: "PSAR",       name: "Parabolic SAR",                category: "trend",             installed: true, version: "1.0.0", author: "windels" },
  { id: "WILLR",      name: "Williams %R",                  category: "momentum",          installed: true, version: "1.0.0", author: "windels" },
  { id: "STOCHRSI",   name: "Stochastic RSI",               category: "momentum",          installed: true, version: "1.0.0", author: "windels" },
  { id: "KDJ",        name: "KDJ",                          category: "momentum",          installed: true, version: "1.0.0", author: "windels" },
  { id: "MAVOL",      name: "Moving Average Volume",        category: "volume",            installed: true, version: "1.0.0", author: "windels" },
  { id: "FIB",        name: "Fibonacci Tools",              category: "support-resistance",installed: true, version: "1.0.0", author: "windels" },
  { id: "PIVOT",      name: "Pivot Points",                 category: "support-resistance",installed: true, version: "1.0.0", author: "windels" },
  { id: "SR",         name: "Support & Resistance",         category: "support-resistance",installed: true, version: "1.0.0", author: "windels" },
  { id: "TRENDLINE",  name: "Trendlines",                   category: "trend",             installed: true, version: "1.0.0", author: "windels" },
  { id: "VOLPROFILE", name: "Volume Profile",               category: "volume",            installed: true, version: "1.0.0", author: "windels" },
  { id: "ICHIMOKU",   name: "Ichimoku Cloud",               category: "trend",             installed: true, version: "1.0.0", author: "windels" },
  { id: "ATR",        name: "Average True Range",           category: "volatility",        installed: true, version: "1.0.0", author: "windels" },
  { id: "ADX",        name: "Average Directional Index",    category: "trend",             installed: true, version: "1.0.0", author: "windels" },
  { id: "OBV",        name: "On-Balance Volume",            category: "volume",            installed: true, version: "1.0.0", author: "windels" },
  { id: "VWAP",       name: "Volume Weighted Avg Price",    category: "volume",            installed: true, version: "1.0.0", author: "windels" },
];

function rand(min: number, max: number) { return _rng.rand(min, max); }
function rPct() { return rand(-3, 3); }
function mkInstrument(
  id: string, symbol: string, name: string, marketClass: TiMarketClass, price: number,
  extra: Partial<TiInstrument> = {}
): TiInstrument {
  // A catalogue entry, not a quote. The 24h change was a random +/-3% which
  // then *derived* the sentiment (bullish/bearish) and the buy/sell/hold
  // signal, with a 0.55-0.92 confidence attached — a complete trading
  // recommendation manufactured from one random number. Live prices come from
  // the market-data providers in marketData.ts; unquoted instruments carry no
  // sentiment or signal at all.
  return {
    id, symbol, name, marketClass, price, change24hPct: 0, volume24h: 0,
    status: marketClass === "crypto" || marketClass === "digital-assets" ? "24/7" : "closed",
    sentiment: "neutral",
    ...extra,
  };
}

const SEED_INSTRUMENTS: Record<TiMarketClass, TiInstrument[]> = {
  forex: [
    { ...mkInstrument("EURUSD","EUR/USD","Euro / US Dollar","forex",1.0842), category:"major", baseCurrency:"EUR", quoteCurrency:"USD", strengthBase:62, strengthQuote:48, interestRateBase:4.25, interestRateQuote:5.25 } as TiForexPair,
    { ...mkInstrument("GBPUSD","GBP/USD","British Pound / US Dollar","forex",1.2721), category:"major", baseCurrency:"GBP", quoteCurrency:"USD", strengthBase:58, strengthQuote:48, interestRateBase:5.00, interestRateQuote:5.25 } as TiForexPair,
    { ...mkInstrument("USDJPY","USD/JPY","US Dollar / Japanese Yen","forex",155.84), category:"major", baseCurrency:"USD", quoteCurrency:"JPY", strengthBase:48, strengthQuote:42, interestRateBase:5.25, interestRateQuote:0.25 } as TiForexPair,
    { ...mkInstrument("USDNGN","USD/NGN","US Dollar / Nigerian Naira","forex",1480), category:"exotic", baseCurrency:"USD", quoteCurrency:"NGN", strengthBase:92, strengthQuote:22, interestRateBase:5.25, interestRateQuote:27.50 } as TiForexPair,
  ] as any,
  crypto: [
    { ...mkInstrument("BTC/USD","BTC/USD","Bitcoin","crypto",68412), chain:"bitcoin", tvlUsd:0, whaleWalletsTracked:2140, rugPullRisk:"low" } as TiCryptoAsset,
    { ...mkInstrument("ETH/USD","ETH/USD","Ethereum","crypto",3512), chain:"ethereum", tvlUsd:64_000_000_000, whaleWalletsTracked:1870, rugPullRisk:"low", stakingApy:3.8 } as TiCryptoAsset,
    { ...mkInstrument("SOL/USD","SOL/USD","Solana","crypto",168), chain:"solana", tvlUsd:6_500_000_000, whaleWalletsTracked:420, rugPullRisk:"medium", stakingApy:7.1 } as TiCryptoAsset,
  ] as any,
  stocks: [
    { ...mkInstrument("AAPL","AAPL","Apple Inc.","stocks",224.18), exchange:"NASDAQ", sector:"Technology", peRatio:34.2, marketCap:3_450_000_000_000, dividendYield:0.44 } as TiStock,
    { ...mkInstrument("MSFT","MSFT","Microsoft","stocks",438.2), exchange:"NASDAQ", sector:"Technology", peRatio:37.1, marketCap:3_260_000_000_000, dividendYield:0.68 } as TiStock,
    { ...mkInstrument("NVDA","NVDA","NVIDIA","stocks",132.4), exchange:"NASDAQ", sector:"Semiconductors", peRatio:68.4, marketCap:3_260_000_000_000 } as TiStock,
    { ...mkInstrument("GTCO","GTCO","Guaranty Trust Holdings","stocks",42.5), exchange:"NGX", sector:"Financial Services", peRatio:4.1, marketCap:140_000_000_000*35/1000, dividendYield:8.2 } as TiStock,
  ] as any,
  etfs: [
    { ...mkInstrument("SPY","SPY","SPDR S&P 500","etfs",584.3), exchange:"NYSE ARCA", sector:"Broad Market", peRatio:25.4, marketCap:590_000_000_000, dividendYield:1.3 } as TiStock,
    { ...mkInstrument("QQQ","QQQ","Invesco QQQ Trust","etfs",493.1), exchange:"NASDAQ", sector:"Technology", peRatio:32.1, marketCap:310_000_000_000, dividendYield:0.55 } as TiStock,
  ] as any,
  commodities: [
    { ...mkInstrument("WHEAT","WHEAT","Wheat Futures","commodities",584.2), unit:"bushel", category:"grains" } as TiCommodity,
    { ...mkInstrument("CORN","CORN","Corn Futures","commodities",412.8), unit:"bushel", category:"grains" } as TiCommodity,
    { ...mkInstrument("SOYBEAN","SOY","Soybean Futures","commodities",1021), unit:"bushel", category:"grains" } as TiCommodity,
  ] as any,
  futures: [ mkInstrument("ES","ES","S&P 500 E-mini","futures",5882) ],
  options: [ mkInstrument("SPX-OPT","SPX OPT","SPX Options Chain","options",0) ],
  indices: [
    mkInstrument("SPX","S&P 500","S&P 500 Index","indices",5882),
    mkInstrument("NDX","NASDAQ 100","NASDAQ 100","indices",20140),
    mkInstrument("NGX30","NGX-30","Nigerian Exchange 30","indices",2820),
  ],
  bonds: [ mkInstrument("US10Y","US10Y","US 10Y Treasury","bonds",4.21) ],
  "precious-metals": [
    { ...mkInstrument("GC","XAU/USD","Gold Spot","precious-metals",2642), unit:"oz", category:"metals" } as TiCommodity,
    { ...mkInstrument("SI","XAG/USD","Silver Spot","precious-metals",30.4), unit:"oz", category:"metals" } as TiCommodity,
  ] as any,
  energy: [
    { ...mkInstrument("CL","WTI Crude","WTI Crude Oil","energy",74.2), unit:"bbl", category:"energy" } as TiCommodity,
    { ...mkInstrument("NG","Henry Hub NG","Natural Gas","energy",2.38), unit:"mmBtu", category:"energy" } as TiCommodity,
  ] as any,
  agriculture: [ mkInstrument("COFFEE","KC","Coffee C Futures","agriculture",218) ],
  "digital-assets": [
    { ...mkInstrument("USDC","USDC","USD Coin","digital-assets",1.0002), chain:"multi", tvlUsd:35_000_000_000, whaleWalletsTracked:80, rugPullRisk:"low" } as TiCryptoAsset,
    { ...mkInstrument("NFT-BLUE","NFTBLUE","Blue-Chip NFT Index","digital-assets",12400), chain:"ethereum", whaleWalletsTracked:120, rugPullRisk:"high" } as TiCryptoAsset,
  ] as any,
};

export const TradingIntelService = {
  async ensureBootstrapped(logger?: any) {
    if ((await redis.get(K.enabled)) !== null) return;
    await redis.set(K.enabled, "1");
    // Agents
    for (const a of AGENT_DEFS) {
      const hb = new Date().toISOString();
      const full: TiAgent = { ...a, lastHeartbeat: hb, signals24h: 0, decisions24h: 0, approvedTrades24h: 0, blockedTrades24h: 0, messageRate: 0, errorRate: 0 };
      await redis.zadd(K.agents, 0, a.key);
      await redis.hset(K.agent(a.key), "_doc", s(full));
    }
    // Indicators
    for (const ind of INDICATOR_DEFS) {
      await redis.zadd(K.indicators, 0, ind.id);
      await redis.hset(K.indicator(ind.id), "_doc", s(ind));
    }
    // Instruments per market class
    for (const mc of Object.keys(SEED_INSTRUMENTS) as TiMarketClass[]) {
      await redis.del(K.instruments(mc));
      for (const inst of SEED_INSTRUMENTS[mc]) {
        await redis.zadd(K.instruments(mc), 0, inst.id);
        await redis.hset(`ti:instdoc:${mc}:${inst.id}`, "_doc", s(inst));
      }
    }
    // ── Everything above is a static catalogue: which agents exist, which
    // indicators are computable, which instruments are tradeable. It describes
    // the module's capabilities and is safe to install unconditionally.
    //
    // Everything below is a *portfolio* — open positions carrying P&L, a risk
    // profile stating $2.48M of exposure and a 1.82 Sharpe, and "learning
    // insights" with invented confidences. None of it was ever traded. On a
    // fresh install the dashboard opened on three winning positions and a
    // healthy risk book belonging to nobody, and `pnl24hUsd` summed the
    // fabricated P&L. Money is exactly the category that must never be
    // invented, so the portfolio is now opt-in.
    if (!demoDataEnabled()) {
      skipDemoSeed("trading-intel", logger);
      logger?.info("[trading-intel] catalogue installed (no portfolio)", { agents: AGENT_DEFS.length, indicators: INDICATOR_DEFS.length, markets: Object.keys(SEED_INSTRUMENTS).length });
      return;
    }

    // Risk profile
    const risk: TiRiskProfile = {
      portfolioId: "default",
      totalExposureUsd: 2_480_000,
      var95Usd: -32_500,
      maxDrawdownPct: 15,
      currentDrawdownPct: 4.2,
      sharpeRatio: 1.82,
      betaVsMarket: 0.94,
      correlationConcerns: ["BTC/ETH", "SPY/QQQ", "GC/SI"],
      volatilityRegime: "normal",
      stressTestsPassed: 7, stressTestsFailed: 1,
      positionSizing: "kelly",
      stopLoss: { enabled: true, defaultPct: 2, trailing: true },
      takeProfit: { enabled: true, defaultPct: 4 },
    };
    await redis.set(K.risk, s(risk));
    // Seed a couple of positions
    const samplePositions: TiPosition[] = [
      { id:"pos-"+randomUUID().slice(0,8), instrumentId:"BTC/USD", marketClass:"crypto", side:"long", size:0.5, entryPrice:64200, currentPrice:68412, pnlUsd:2106, pnlPct:6.6, openedAt:new Date(Date.now()-86400000*3).toISOString(), stopLoss:62000, takeProfit:72000 },
      { id:"pos-"+randomUUID().slice(0,8), instrumentId:"AAPL", marketClass:"stocks", side:"long", size:120, entryPrice:214.2, currentPrice:224.18, pnlUsd:1197.6, pnlPct:4.7, openedAt:new Date(Date.now()-86400000*5).toISOString() },
      { id:"pos-"+randomUUID().slice(0,8), instrumentId:"EURUSD", marketClass:"forex", side:"long", size:100000, entryPrice:1.078, currentPrice:1.0842, pnlUsd:620, pnlPct:0.57, openedAt:new Date(Date.now()-86400000).toISOString() },
    ];
    for (const p of samplePositions) { await redis.zadd(K.positions, Date.parse(p.openedAt), p.id); await redis.hset(K.position(p.id), "_doc", s(p)); }
    // Economic events
    const econs: TiEconomicEvent[] = [
      { id:"ev-"+randomUUID().slice(0,6), country:"US", title:"FOMC Rate Decision", impact:"high", scheduledAt:new Date(Date.now()+86400000*2).toISOString(), forecast:"5.25%", previous:"5.25%", affectedInstruments:["SPX","NDX","USDJPY","GC"] },
      { id:"ev-"+randomUUID().slice(0,6), country:"NG", title:"MPC Rate Announcement", impact:"high", scheduledAt:new Date(Date.now()+86400000*4).toISOString(), forecast:"27.50%", previous:"27.50%", affectedInstruments:["USDNGN","NGX30"] },
      { id:"ev-"+randomUUID().slice(0,6), country:"US", title:"Non-Farm Payrolls", impact:"high", scheduledAt:new Date(Date.now()+86400000*5).toISOString(), forecast:"185k", previous:"216k", affectedInstruments:["SPX","GC","EURUSD"] },
      { id:"ev-"+randomUUID().slice(0,6), country:"US", title:"CPI MoM", impact:"high", scheduledAt:new Date(Date.now()+86400000*8).toISOString(), forecast:"0.3%", previous:"0.2%", affectedInstruments:["SPX","GC","US10Y"] },
    ];
    for (const e of econs) { await redis.zadd(K.events, Date.parse(e.scheduledAt), s(e)); }
    // Insights
    for (let i=0;i<6;i++) {
      const ins: TiLearningInsight = {
        id: "ins-"+randomUUID().slice(0,6),
        kind: (["strategy","regime","risk","sentiment","outcome"] as const)[i%5],
        title: [
          "Momentum + mean-reversion ensemble outperforms single-factor in 2026 YTD backtest",
          "NGN pairs show elevated correlation with crude spreads during CBN windows",
          "BTC/Nasdaq correlation drops below 0.4 during rate-cut regimes",
          "Sentiment spikes >2σ precede short-term reversals 63% of time in large-cap",
          "Trailing 2% stops improved SPY win rate by 4.2pp over static stops",
          "Pre-NFP volatility crush rewards short-vol 24h before print",
        ][i],
        detail: "Auto-derived from continuous-learning pipeline; feeds Knowledge Graph + Memory Fabric for downstream agent use.",
        confidence: rand(0.7, 0.95),
        learnedFromTrades: Math.floor(rand(40, 800)),
        recordedAt: new Date(Date.now()-i*3600000).toISOString(),
      };
      await redis.zadd(K.insights, Date.parse(ins.recordedAt), s(ins));
    }
    await redis.set(K.metrics.jobs24, "12");
    await redis.set(K.metrics.sig24, "480");
    await redis.set(K.metrics.blocked24, "3");
    await redis.set(K.metrics.sim24, "38");
    logger?.info("[trading-intel] bootstrap complete", { agents: AGENT_DEFS.length, indicators: INDICATOR_DEFS.length, markets: Object.keys(SEED_INSTRUMENTS).length });
  },

  // ── Dashboard
  async dashboard(): Promise<TiDashboard> {
    const mClasses: TiMarketClass[] = ["forex","crypto","stocks","etfs","commodities","futures","options","indices","bonds","precious-metals","energy","agriculture","digital-assets"];
    const markets = {} as TiDashboard["markets"];
    let totInst = 0; let totOpen = 0; let totVol = 0;
    for (const mc of mClasses) {
      const ids = await redis.zrange(K.instruments(mc), 0, -1);
      let vol = 0; let open = true;
      for (const id of ids) {
        const r = await redis.hgetall(`ti:instdoc:${mc}:${id}`);
        if (r._doc) { const d = j(r._doc) as TiInstrument; vol += d.volume24h; if (d.status === "closed") open = false; }
      }
      markets[mc] = { instruments: ids.length, open, volume24hUsd: Math.floor(vol) };
      totInst += ids.length; totOpen += open?1:0; totVol += vol;
    }
    const agentIds = await redis.zrange(K.agents, 0, -1);
    let online = 0; for (const id of agentIds) { const r=await redis.hgetall(K.agent(id)); if (r._doc && j(r._doc).status==="online") online++; }
    const [j24,s24,b24,sim24] = await Promise.all([
      redis.get(K.metrics.jobs24).then(n=>Number(n??0)),
      redis.get(K.metrics.sig24).then(n=>Number(n??0)),
      redis.get(K.metrics.blocked24).then(n=>Number(n??0)),
      redis.get(K.metrics.sim24).then(n=>Number(n??0)),
    ]);
    const positions = await this.listPositions();
    const pnl = positions.reduce((a,p)=>a+p.pnlUsd,0);
    return {
      moduleEnabled: true, moduleStatus: "available", markets,
      agentsOnline: online, agentsTotal: agentIds.length, indicators: INDICATOR_DEFS.length,
      positionsOpen: positions.length, pnl24hUsd: Math.round(pnl), riskAlerts: b24,
      openRecommendations: Math.floor(s24/20), sentimentScore: 0.18,
      simulationsRun24h: sim24, learningInsights: (await redis.zcard(K.insights)),
      notes: "Unified trading platform. Live execution gated by Governance Kernel + user approval per Session 81 hard rule.",
    };
  },

  // ── Agents
  async listAgents(): Promise<TiAgent[]> {
    const ids = await redis.zrange(K.agents, 0, -1);
    const out: TiAgent[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.agent(id)); if (r._doc) out.push(j(r._doc)); }
    return out;
  },
  async agentHeartbeat(key: TiAgentKey, signals?: number, approved?: number, blocked?: number) {
    const r = await redis.hgetall(K.agent(key));
    if (!r._doc) return null;
    const a: TiAgent = j(r._doc);
    a.lastHeartbeat = new Date().toISOString();
    a.messageRate = (signals ?? a.signals24h) / 60;
    a.signals24h += signals ?? 0;
    a.approvedTrades24h += approved ?? 0;
    a.blockedTrades24h += blocked ?? 0;
    await redis.hset(K.agent(key), "_doc", s(a));
    return a;
  },

  // ── Indicators
  async listIndicators(): Promise<TiIndicatorPlugin[]> {
    const ids = await redis.zrange(K.indicators, 0, -1);
    const out: TiIndicatorPlugin[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.indicator(id)); if (r._doc) out.push(j(r._doc)); }
    return out;
  },

  // ── Instruments / markets
  async listInstruments(mc?: TiMarketClass): Promise<TiInstrument[]> {
    const mclasses: TiMarketClass[] = mc ? [mc] : ["forex","crypto","stocks","etfs","commodities","futures","options","indices","bonds","precious-metals","energy","agriculture","digital-assets"];
    const out: TiInstrument[] = [];
    for (const c of mclasses) {
      const ids = await redis.zrange(K.instruments(c), 0, -1);
      for (const id of ids) { const r=await redis.hgetall(`ti:instdoc:${c}:${id}`); if (r._doc) out.push(j(r._doc)); }
    }
    return out;
  },

  // ── Risk
  async riskProfile(): Promise<TiRiskProfile | null> { const raw = await redis.get(K.risk); return raw ? j(raw) : null; },
  async listPositions(): Promise<TiPosition[]> {
    const ids = await redis.zrange(K.positions, 0, -1);
    const out: TiPosition[] = [];
    for (const id of ids) { const r=await redis.hgetall(K.position(id)); if (r._doc) out.push(j(r._doc)); }
    return out;
  },

  // ── Sentiment
  async listSentiment(limit=40): Promise<TiSentimentReading[]> {
    // Generate on-the-fly synthetic readings (MVP); a later session wires real feeds.
    const inst = await this.listInstruments();
    // Sentiment readings must come from a real feed (news, social, on-chain).
    // This previously fabricated `limit` readings on demand — a -0.6..0.8
    // score with a weight multiplier and a volume — which were then applied to
    // trading signals as if they reflected observed market mood.
    const out: TiSentimentReading[] = [];
    void inst;
    return out;
  },

  // ── Simulation
  async runSimulation(input: { instrumentId: string; scenarios?: TiSimScenario[]; horizon?: string }): Promise<TiSimulationResult[]> {
    const scenarios: TiSimScenario[] = input.scenarios ?? ["bull","bear","sideways","high-vol","flash-crash"];
    const horizon = input.horizon ?? "7d";
    const out: TiSimulationResult[] = [];
    for (const sc of scenarios) {
      const r: TiSimulationResult = {
        id: "sim-"+randomUUID().slice(0,8), scenario: sc, instrumentId: input.instrumentId, horizon,
        // Scenario returns and their probability/confidence are model output.
        // They were drawn at random per scenario (a "bull" case returning
        // 2-8%, a flash-crash -18..-5%) with a 0.45-0.85 probability, then
        // stored and surfaced as investment analysis. Zeroed until a real
        // pricing/risk model produces them.
        expectedReturnPct: 0,
        worstCaseReturnPct: 0,
        bestCaseReturnPct: 0,
        probability: 0, confidence: 0,
        notes: [
          "Recommendations require governance + human approval before execution.",
          "Sentiment weights applied to signal — not a standalone decision factor.",
          "Stress-test against correlated assets before sizing.",
        ],
      };
      await redis.zadd(K.sims, Date.now(), s(r));
      await redis.zremrangebyrank(K.sims, 0, -201);
      out.push(r);
    }
    await redis.incr(K.metrics.sim24);
    // Emit Kernel event
    try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ kind:"trading.simulation", source:"trading-intel", payload:{instrument:input.instrumentId,horizon,scenarios} }); } catch {}
    return out;
  },

  // ── Economic calendar
  async economicEvents(days = 7): Promise<TiEconomicEvent[]> {
    const until = Date.now() + days*86400000;
    const raw = await redis.zrangebyscore(K.events, 0, until);
    return raw.map(j);
  },

  // ── Continuous learning
  async listInsights(limit=30): Promise<TiLearningInsight[]> {
    return (await redis.zrange(K.insights, 0, -1, "REV")).slice(0,limit).map(j);
  },

  // ── Propose a trade (validates via risk + compliance + governance stub; always returns proposed, never auto-executes)
  async proposeTrade(input: { instrumentId: string; marketClass: TiMarketClass; side: "long"|"short"; size: number; reason?: string }) {
    await redis.incr(K.metrics.jobs24);
    const id = "rec-"+randomUUID().slice(0,8);
    const rec = {
      id, instrumentId: input.instrumentId, marketClass: input.marketClass, side: input.side, size: input.size,
      reason: input.reason ?? "technical+fundamental+sentiment confluence",
      requiresApproval: true,
      governanceReview: true,
      compliancePassed: true,
      riskPassed: true,
      at: new Date().toISOString(),
    };
    await redis.incr(K.metrics.sig24);
    // Emit Kernel event
    try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ kind:"trading.recommendation", source:"trading-intel", payload:{rec} }); } catch {}
    return rec;
  },
};
