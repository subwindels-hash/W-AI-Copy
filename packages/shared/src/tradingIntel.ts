/**
 * Shared types — Unified Enterprise Global Financial Markets Intelligence & Trading Platform (Session 81).
 *
 * Horizontal expansion of Session 35 Crypto Intelligence into a multi-market (forex, crypto,
 * stocks, ETFs, commodities, futures, options, indices, bonds, metals, energy, agriculture,
 * digital assets), multi-agent (18 AI workforce) trading platform. All trading remains subject
 * to Governance Kernel, human-approval gate, and user risk preferences. Session 35's original
 * API contracts are preserved; this module adds a unified superset.
 */

export type TiMarketClass =
  | "forex" | "crypto" | "stocks" | "etfs" | "commodities"
  | "futures" | "options" | "indices" | "bonds"
  | "precious-metals" | "energy" | "agriculture" | "digital-assets";

export type TiMarketStatus = "open" | "closed" | "pre-market" | "after-hours" | "holiday" | "24/7";
export type TiAgentKey =
  | "market-intel" | "forex-intel" | "crypto-intel" | "stocks-intel" | "etf-intel"
  | "commodities-intel" | "futures-intel" | "options-intel" | "bonds-intel"
  | "portfolio-intel" | "strategy-opt" | "market-sentiment" | "economic-intel"
  | "risk-mgmt" | "trade-validation" | "compliance-gov" | "perf-analytics" | "continuous-learning";

export type TiAgentStatus = "online" | "syncing" | "paused" | "stub";

// ── Market data primitives ──────────────────────────────────────────────
export interface TiCandle {
  time: number;                // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TiQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume24h: number;
  change24hPct: number;
  marketStatus: TiMarketStatus;
  timestamp: number;
  source: string;              // provider id
  synthetic?: boolean;         // true if seeded/demo data
}

export interface TiOrderBook {
  symbol: string;
  bids: Array<[number, number]>;  // [price, size]
  asks: Array<[number, number]>;
  timestamp: number;
}

export interface TiProviderStatus {
  id: string;
  name: string;
  connected: boolean;
  rateLimitRemaining: number;
  rateLimitResetAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastError?: string;
  latencyMs?: number;
  supports: TiMarketClass[];
}

// ── Indicators (pluggable) ──────────────────────────────────────────────
export type TiIndicatorId =
  | "MA" | "EMA" | "SMA" | "WMA" | "MACD" | "RSI" | "BBANDS" | "PSAR" | "WILLR" | "STOCHRSI" | "KDJ"
  | "MAVOL" | "FIB" | "PIVOT" | "SR" | "TRENDLINE" | "VOLPROFILE" | "ICHIMOKU"
  | "ATR" | "ADX" | "OBV" | "VWAP" | "STOCHASTIC" | "CCI" | "ROC";

export interface TiIndicatorPlugin {
  id: TiIndicatorId;
  name: string;
  category: "trend" | "momentum" | "volatility" | "volume" | "support-resistance";
  installed: boolean;
  version: string;
  author: string;
}

export interface TiIndicatorResult {
  indicator: TiIndicatorId;
  symbol: string;
  timeframe: string;
  timestamp: number;
  values: Record<string, number | number[] | null>;
  signal?: "buy" | "sell" | "hold";
  confidence?: number;
  sufficientData: boolean;
  barsRequired: number;
  barsUsed: number;
}

// ── Market / Instrument abstractions ────────────────────────────────────
export type TiDirection = "bullish" | "bearish" | "neutral";

export interface TiInstrument {
  id: string;                  // e.g. "EURUSD", "BTC/USD", "AAPL", "GC"
  symbol: string;
  name: string;
  marketClass: TiMarketClass;
  price: number;
  change24hPct: number;
  volume24h: number;
  marketCap?: number;
  status: TiMarketStatus;
  sentiment: TiDirection;
  /** Trading recommendation. Undefined until a real analysis produces one —
   *  an instrument with no signal must not imply "hold" was a decision. */
  signal?: "buy" | "sell" | "hold";
  /** 0..1. Undefined until a model scores the signal. */
  confidence?: number;
}

export interface TiForexPair extends TiInstrument {
  marketClass: "forex";
  category: "major" | "minor" | "exotic";
  baseCurrency: string;
  quoteCurrency: string;
  strengthBase: number;        // 0..100
  strengthQuote: number;
  interestRateBase: number;
  interestRateQuote: number;
}

export interface TiCryptoAsset extends TiInstrument {
  marketClass: "crypto" | "digital-assets";
  chain: string;
  tvlUsd?: number;
  whaleWalletsTracked: number;
  rugPullRisk: "low" | "medium" | "high";
  stakingApy?: number;
}

export interface TiStock extends TiInstrument {
  marketClass: "stocks" | "etfs";
  exchange: string;
  sector: string;
  peRatio?: number;
  marketCap: number;
  dividendYield?: number;
}

export interface TiCommodity extends TiInstrument {
  marketClass: "commodities" | "precious-metals" | "energy" | "agriculture";
  unit: string;                // "oz", "bbl", "bushel"
  category: string;             // "metals" | "energy" | "grains" | "softs" | "livestock"
}

// ── Risk Management enhancements ────────────────────────────────────────
/**
 * A tenant's risk profile, derived from its own connected-broker positions.
 *
 * Every field that needs a risk model or a return series the platform does not
 * compute is `number | null`. The pre-S209 shape made them all required
 * `number`, which is why the demo seed could state a 1.82 Sharpe, a -$32,500
 * VaR and 7-of-8 passing stress tests for a portfolio nobody held — the type
 * left no way to say "not computed". `totalExposureUsd` is real: it is summed
 * from live position notionals.
 */
export interface TiRiskProfile {
  portfolioId: string;
  totalExposureUsd: number;
  var95Usd: number | null;             // value-at-risk 95%
  maxDrawdownPct: number | null;
  currentDrawdownPct: number | null;
  sharpeRatio: number | null;
  betaVsMarket: number | null;
  correlationConcerns: string[];
  volatilityRegime: "low" | "normal" | "high" | "extreme" | null;
  stressTestsPassed: number | null;
  stressTestsFailed: number | null;
  positionSizing: "fixed" | "kelly" | "risk-parity" | "inverse-vol" | null;
  stopLoss: { enabled: boolean; defaultPct: number | null; trailing: boolean | null };
  takeProfit: { enabled: boolean; defaultPct: number | null };
}

export interface TiPosition {
  id: string;
  instrumentId: string;
  marketClass: TiMarketClass;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnlUsd: number;
  pnlPct: number;
  openedAt: string;
  stopLoss?: number;
  takeProfit?: number;
}

// ── Sentiment ───────────────────────────────────────────────────────────
export interface TiSentimentReading {
  source: "news" | "social" | "economic" | "announcements" | "regulatory" | "blockchain" | "community" | "institutional";
  instrumentId: string;
  score: number;               // -1..+1
  weight: number;              // multiplier applied to technical/fundamental
  volume: number;
  at: string;
}

// ── Predictive Simulation ──────────────────────────────────────────────
export type TiSimScenario =
  | "bull" | "bear" | "sideways" | "high-vol" | "liquidity-crisis"
  | "flash-crash" | "economic-announcement" | "geopolitical";

export interface TiSimulationResult {
  id: string;
  scenario: TiSimScenario;
  instrumentId: string;
  horizon: string;             // "24h", "7d", "30d"
  expectedReturnPct: number;
  worstCaseReturnPct: number;
  bestCaseReturnPct: number;
  probability: number;         // 0..1
  confidence: number;          // 0..1
  notes: string[];
}

// ── Workforce agent registry ───────────────────────────────────────────
export interface TiAgent {
  key: TiAgentKey;
  name: string;
  description: string;
  status: TiAgentStatus;
  lastHeartbeat: string;
  signals24h: number;
  decisions24h: number;
  approvedTrades24h: number;
  blockedTrades24h: number;
  messageRate: number;
  errorRate: number;
}

// ── Economic calendar (light) ──────────────────────────────────────────
export interface TiEconomicEvent {
  id: string;
  country: string;
  title: string;
  impact: "low" | "medium" | "high";
  scheduledAt: string;
  actual?: string;
  forecast?: string;
  previous?: string;
  affectedInstruments: string[];
}

// ── Continuous learning ────────────────────────────────────────────────
export interface TiLearningInsight {
  id: string;
  kind: "strategy" | "regime" | "risk" | "sentiment" | "outcome";
  title: string;
  detail: string;
  confidence: number;
  learnedFromTrades: number;
  recordedAt: string;
}

// ── Dashboard ───────────────────────────────────────────────────────────
export interface TiDashboard {
  moduleEnabled: boolean;
  moduleStatus: "available";
  markets: Record<TiMarketClass, { instruments: number; open: boolean; volume24hUsd: number }>;
  agentsOnline: number;
  agentsTotal: number;
  indicators: number;
  positionsOpen: number;
  pnl24hUsd: number;
  riskAlerts: number;
  openRecommendations: number;
  sentimentScore: number;
  simulationsRun24h: number;
  learningInsights: number;
  notes: string;
}
