/**
 * Trading Agents — Multi-agent decision support orchestration.
 *
 * Each agent is a domain-specialized analyst that consumes real (or synthetic,
 * clearly flagged) market data, runs the technical-analysis engine, and returns
 * a structured report with recommendations, confidence, and risk notes.
 *
 * SCOPE (clarified): decision-support ONLY — no broker connectivity, no order
 * placement, no custody. All outputs are advisory.
 */
import { analyzeInstrument, type AnalysisReport } from "./analysis.js";
import { marketData } from "./marketData.js";
import type { TiMarketClass } from "@windels/shared";

type AgentId =
  | "trading-intel" | "forex" | "crypto" | "stocks" | "etfs"
  | "commodities" | "futures" | "options" | "bonds"
  | "technical" | "fundamental" | "market-structure" | "sentiment"
  | "risk-mgmt" | "strategy-opt" | "perf-analytics";

interface AgentMeta {
  id: AgentId;
  name: string;
  description: string;
  markets: TiMarketClass[];
}

const AGENTS: AgentMeta[] = [
  { id: "trading-intel", name: "Trading Intelligence Agent", description: "Cross-market synthesis & confluence scoring", markets: ["forex","crypto","stocks","etfs","commodities","futures","options","indices","bonds","precious-metals","energy","agriculture","digital-assets"] },
  { id: "forex", name: "Forex Analysis Agent", description: "Majors/minors/exotics, central banks, rate differentials", markets: ["forex"] },
  { id: "crypto", name: "Cryptocurrency Intelligence Agent", description: "Chains, on-chain heuristics, liquidity, DeFi context", markets: ["crypto","digital-assets"] },
  { id: "stocks", name: "Stock Market Analysis Agent", description: "Equities, sectors, earnings, factors", markets: ["stocks"] },
  { id: "etfs", name: "ETF Analysis Agent", description: "Thematic/leveraged/broad ETFs, flows, holdings context", markets: ["etfs","indices"] },
  { id: "commodities", name: "Commodities Analysis Agent", description: "Energy, metals, ags: supply/demand + seasonality context", markets: ["commodities","precious-metals","energy","agriculture"] },
  { id: "futures", name: "Futures Analysis Agent", description: "Term structure context, roll/expiry/margin awareness", markets: ["futures","commodities","indices"] },
  { id: "options", name: "Options Analysis Agent", description: "IV surface, Greeks, OI, strategy selection (where data available)", markets: ["options","stocks","etfs","indices","crypto"] },
  { id: "bonds", name: "Bond Market Analysis Agent", description: "Yield, duration, credit-spread context, rate sensitivity", markets: ["bonds"] },
  { id: "technical", name: "Technical Analysis Agent", description: "Indicator confluence, patterns, setups", markets: ["forex","crypto","stocks","etfs","commodities","futures","options","indices","bonds","precious-metals","energy","agriculture","digital-assets"] },
  { id: "fundamental", name: "Fundamental Analysis Agent", description: "Macro context overlay (rates, events, ratios where available)", markets: ["forex","crypto","stocks","etfs","commodities","bonds"] },
  { id: "market-structure", name: "Market Structure Agent", description: "Liquidity, break of structure, order blocks, gaps", markets: ["forex","crypto","stocks","etfs","futures","indices"] },
  { id: "sentiment", name: "Sentiment Analysis Agent", description: "News/social/on-chain sentiment overlay", markets: ["forex","crypto","stocks","etfs","commodities","indices"] },
  { id: "risk-mgmt", name: "Risk Management Agent", description: "Position sizing, drawdown, exposure, stop placement", markets: ["forex","crypto","stocks","etfs","commodities","futures","options","indices","bonds"] },
  { id: "strategy-opt", name: "Strategy Optimization Agent", description: "Scenario comparison and strategy fitness scores", markets: ["forex","crypto","stocks","etfs","commodities","futures","options","indices","bonds"] },
  { id: "perf-analytics", name: "Performance Analytics Agent", description: "Win rate, P&L, Sharpe-like, drawdown from trade history", markets: ["forex","crypto","stocks","etfs","commodities","futures","options","indices","bonds"] },
];

export function listAgents(): AgentMeta[] { return AGENTS; }

export interface AgentReport {
  agent: AgentId;
  agentName: string;
  symbol: string;
  marketClass: TiMarketClass;
  synthetic: boolean;
  dataSource: string;
  summary: string;
  technicalBias: "bullish" | "bearish" | "neutral";
  confidence: number;
  keyFindings: string[];
  risks: string[];
  recommendations: string[];
  tradeSetup?: AnalysisReport["tradeSetup"];
  scenarios: AnalysisReport["scenarios"];
  disclaimer: string;
}

function fmt(n: number, p = 2): string { return n.toFixed(p); }

function domainAugment(agentId: AgentId, rep: AnalysisReport): { findings: string[]; risks: string[]; recs: string[]; bias: "bullish" | "bearish" | "neutral"; confidence: number } {
  const findings: string[] = [];
  const risks: string[] = [];
  const recs: string[] = [];
  let bias: "bullish" | "bearish" | "neutral" = rep.trend.direction === "up" ? "bullish" : rep.trend.direction === "down" ? "bearish" : "neutral";
  let conf = 0.4 + rep.trend.strength * 0.3 + Math.abs(rep.momentum.strength) * 0.2;

  const bs = rep.tradeSetup;
  switch (agentId) {
    case "commodities":
      findings.push(`Volatility regime: ${rep.volatility.regime} (ATR ${fmt(rep.volatility.atr, rep.price < 10 ? 4 : 2)} / ${fmt(rep.volatility.atrPct)}%)`);
      risks.push("Supply shocks, inventory reports, and geopolitics can move commodity prices sharply outside of technical setups.");
      if (bs) recs.push(`Prefer ${bs.bias} setups with sub-${fmt(bs.riskReward,2)}x R:R filtered against next ${rep.marketRegime === "trending-up" || rep.marketRegime === "trending-down" ? "trend-following" : "mean-reversion"} regime.`);
      break;
    case "futures":
      findings.push(`Futures-aware note: contract expiration, roll yield and margin considerations apply (sourced symbol ${rep.symbol}).`);
      risks.push("Futures have expiry dates; rolls introduce basis risk and gap risk.");
      if (bs) recs.push(`Size to ${fmt(bs.positionSizePct,2)}% risk with ATR-based stop at ${fmt(bs.stopLoss, rep.price < 10 ? 4 : 2)}.`);
      break;
    case "options":
      findings.push("Options analytics require a full options chain (strike/expiry/IV/Greeks). CoinGecko and synthetic providers do not supply chains; when a chain provider is configured Greeks/IV/max-pain/OI concentration will populate here.");
      risks.push("Without a configured options-chain provider, directional delta-one analysis is a proxy only; no Greeks/IV are computed.");
      recs.push("Configure an options data provider (e.g., Polygon/Tradier/IEX) to enable Greeks, IV skew, and strategy selection.");
      break;
    case "bonds":
      findings.push(`Bond sensitivity: duration/rates context placeholder. Price ${fmt(rep.price, rep.price < 10 ? 4 : 2)} over ${rep.timeframe}.`);
      risks.push("Duration and convexity react non-linearly to rate moves; central-bank surprises dominate.");
      recs.push("Pair technical levels with macro calendar (CPI/NFP/FOMC) before acting.");
      break;
    case "risk-mgmt":
      findings.push(`Suggested risk per trade: 1% of capital (${bs ? "$"+fmt(bs.riskUsd ?? 0,2)+" risk on "+fmt(bs.suggestedSizeUnits ?? 0,4)+" units" : "no setup"}).`);
      risks.push(`Volatility regime = ${rep.volatility.regime}; ATR% = ${fmt(rep.volatility.atrPct,2)}%.`);
      recs.push("Use the stop-loss and take-profit from tradeSetup; cap daily loss to 3% per risk engine policy.");
      conf = 0.8;
      break;
    case "perf-analytics":
      findings.push("Performance analytics operate on closed-trade journal records. Seed or import trades to compute win-rate, profit factor, Sharpe-like, and max drawdown.");
      risks.push("Without trade history, only live-position P&L (if any) is shown.");
      recs.push("Log each trade (entry/exit/size/fees) via POST /trading-intel/journal for analytics.");
      conf = 0.5;
      break;
    case "sentiment":
      findings.push("Sentiment feed currently synthesizes from price/volume proxy; wire news/social providers for real sentiment scores.");
      risks.push("Sentiment is contrarian at extremes; do not trade it in isolation.");
      break;
    case "technical":
      findings.push(`${rep.signals.length} indicator signals synthesized; aggregate score ${rep.scenarios.bullish.probability.toFixed(2)} bull / ${rep.scenarios.bearish.probability.toFixed(2)} bear.`);
      risks.push("Technical setups fail under news events and liquidity gaps.");
      break;
    case "market-structure":
      findings.push(`Nearest support ${rep.supportResistance.support[0] ?? "n/a"}, nearest resistance ${rep.supportResistance.resistance[0] ?? "n/a"}; pivot ${rep.supportResistance.pivotPoint?.toFixed(2) ?? "n/a"}.`);
      risks.push("Break of structure is confirmed only on close + retest, not wicks.");
      break;
    case "crypto":
      findings.push("On-chain/whale/DeFi analysis requires a blockchain-data provider (e.g., Glassnode, Nansen, self-hosted indexer). CoinGecko prices are a starting point only.");
      risks.push("Smart-contract/rug-pull risk, exchange risk, and gas volatility are not yet analyzed by the default provider stack.");
      recs.push("Configure an on-chain provider for enhanced crypto intelligence.");
      break;
    default:
      findings.push(`Market regime: ${rep.marketRegime}; trend ${rep.trend.direction} (strength ${fmt(rep.trend.strength,2)}); momentum ${rep.momentum.direction}.`);
      risks.push("Decision-support only — no execution.");
  }
  return { findings, risks, recs, bias, confidence: Math.max(0.1, Math.min(0.95, conf)) };
}

export async function runAgent(agentId: AgentId, input: {
  symbol: string; marketClass: TiMarketClass; timeframe?: any; limit?: number;
  capitalUsd?: number; riskPerTradePct?: number; allowSynthetic?: boolean;
}): Promise<AgentReport | { error: string; message: string }> {
  const meta = AGENTS.find((a) => a.id === agentId);
  if (!meta) return { error: "UNKNOWN_AGENT", message: `Unknown agent: ${agentId}` };

  // "MARKET DATA SOURCE REQUIRED" mode when allowSynthetic=false
  const rep = await analyzeInstrument({
    symbol: input.symbol,
    marketClass: input.marketClass,
    timeframe: input.timeframe ?? "1d",
    limit: input.limit ?? 200,
    allowSynthetic: input.allowSynthetic ?? true,
    capitalUsd: input.capitalUsd,
    riskPerTradePct: input.riskPerTradePct,
  });
  if ("error" in rep) return { error: rep.error, message: rep.message };

  const dom = domainAugment(agentId, rep);
  const findings = [
    `Regime: ${rep.marketRegime}`,
    `Trend: ${rep.trend.direction} (${fmt(rep.trend.strength,2)}); Momentum: ${rep.momentum.direction}`,
    `Volatility: ${rep.volatility.regime} (ATR% ${fmt(rep.volatility.atrPct,2)})`,
    `Volume: ${rep.volume.profile} / ${rep.volume.trendVsPrice}`,
    ...dom.findings,
  ];
  const risks = [
    rep.synthetic ? "SIMULATION: synthetic data in use — not live" : null,
    rep.warning ? rep.warning : null,
    ...dom.risks,
  ].filter(Boolean) as string[];

  const recommendations = [
    ...(rep.tradeSetup ? [`Bias ${rep.tradeSetup.bias.toUpperCase()}: entry ${rep.tradeSetup.entryZone.join("-")}, SL ${fmt(rep.tradeSetup.stopLoss, rep.price<10?4:2)}, TP ${fmt(rep.tradeSetup.takeProfit, rep.price<10?4:2)} (R:R ${fmt(rep.tradeSetup.riskReward,2)})`] : ["No high-conviction setup — wait for confluence"]),
    ...dom.recs,
  ];

  return {
    agent: agentId,
    agentName: meta.name,
    symbol: rep.symbol,
    marketClass: rep.marketClass,
    synthetic: rep.synthetic,
    dataSource: rep.dataSource,
    summary: `${meta.name} on ${rep.symbol} (${rep.marketClass}/${rep.timeframe}): ${dom.bias.toUpperCase()} bias, confidence ${fmt(dom.confidence,2)} using ${rep.candlesUsed} bars from ${rep.dataSource}${rep.synthetic ? " [SYNTHETIC]" : ""}.`,
    technicalBias: dom.bias,
    confidence: dom.confidence,
    keyFindings: findings,
    risks,
    recommendations,
    tradeSetup: rep.tradeSetup,
    scenarios: rep.scenarios,
    disclaimer: rep.disclaimer,
  };
}

export function providers() { return marketData.listProviders(); }
