/**
 * Trading Intelligence — Real Multi-Indicator Market Analysis Engine.
 *
 * Consumes TiCandles from marketData, runs the full indicator library,
 * and synthesizes a structured analysis (trend/momentum/volatility/volume/SR,
 * regime, scenarios, entry/SL/TP/RR, confidence).
 *
 * Honest about data provenance: every report carries dataSource, synthetic flag,
 * and freshness timestamp. If no data is available and synthetic is disabled,
 * returns MARKET DATA SOURCE REQUIRED.
 *
 * Does NOT execute trades — decision-support only per the clarified scope.
 */
import { marketData, type Timeframe } from "./marketData.js";
import { runAllIndicators } from "./indicators.js";
import type { TiMarketClass, TiCandle } from "@windels/shared";

export interface AnalysisReport {
  symbol: string;
  marketClass: TiMarketClass;
  timeframe: Timeframe;
  dataSource: string;
  synthetic: boolean;
  dataFreshnessSec: number;
  price: number;
  timestamp: number;
  candlesUsed: number;
  marketRegime: "trending-up" | "trending-down" | "ranging" | "high-volatility" | "low-liquidity";
  trend: { direction: "up" | "down" | "sideways"; strength: number; notes: string[] };
  momentum: { direction: "bullish" | "bearish" | "neutral"; strength: number; notes: string[] };
  volatility: { regime: "low" | "normal" | "high" | "extreme"; atr: number; atrPct: number; notes: string[] };
  volume: { profile: "accumulation" | "distribution" | "neutral"; trendVsPrice: "confirming" | "divergent" | "neutral"; notes: string[] };
  supportResistance: { support: number[]; resistance: number[]; pivotPoint?: number };
  signals: Array<{ source: string; bias: "bullish" | "bearish" | "neutral"; weight: number; detail: string }>;
  scenarios: {
    bullish: { probability: number; target: number; rationale: string };
    bearish: { probability: number; target: number; rationale: string };
    sideways: { probability: number; rangeLow: number; rangeHigh: number; rationale: string };
  };
  tradeSetup: {
    bias: "long" | "short" | "none";
    entryZone: [number, number];
    stopLoss: number;
    takeProfit: number;
    riskReward: number;
    positionSizePct: number;
    confidence: number;
    suggestedSizeUnits?: number;
    riskUsd?: number;
  } | null;
  indicators: Record<string, unknown>;
  disclaimer: string;
  warning?: string;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
}

function last<T>(arr: (T | null)[]): T | null {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i] as T;
  return null;
}

function obvTrend(obv: (number | null)[]): "up" | "down" | "flat" {
  const vals = obv.filter((v): v is number => v != null);
  if (vals.length < 5) return "flat";
  const tail = vals.slice(-10);
  let ups = 0, downs = 0;
  for (let i = 1; i < tail.length; i++) {
    if (tail[i] > tail[i - 1]) ups++; else if (tail[i] < tail[i - 1]) downs++;
  }
  if (ups > downs * 1.3) return "up";
  if (downs > ups * 1.3) return "down";
  return "flat";
}

export async function analyzeInstrument(opts: {
  symbol: string;
  marketClass: TiMarketClass;
  timeframe?: Timeframe;
  limit?: number;
  allowSynthetic?: boolean;
  capitalUsd?: number;
  riskPerTradePct?: number;
}): Promise<AnalysisReport | { error: "MARKET_DATA_SOURCE_REQUIRED"; message: string }> {
  const tf = opts.timeframe ?? "1d";
  const limit = opts.limit ?? 200;
  const allowSyn = opts.allowSynthetic ?? true;

  let candles: TiCandle[] = [];
  let source = "none";
  let synthetic = true;
  let stale = true;
  let quote: { price: number; timestamp: number; source: string; synthetic?: boolean } | null = null;

  try {
    const q = await marketData.getQuote(opts.symbol, opts.marketClass);
    quote = q.quote;
    if (q.synthetic && !allowSyn) {
      return { error: "MARKET_DATA_SOURCE_REQUIRED", message: `Only synthetic data available for ${opts.marketClass}:${opts.symbol}. Configure a real provider (e.g., CoinGecko for crypto) or pass allowSynthetic=true for SIMULATION mode.` };
    }
  } catch {
    // quote failed — try candles anyway
  }

  try {
    const c = await marketData.getCandles(opts.symbol, opts.marketClass, tf, limit);
    candles = c.candles;
    source = c.source;
    synthetic = c.synthetic;
    stale = c.stale;
    if (synthetic && !allowSyn) {
      return { error: "MARKET_DATA_SOURCE_REQUIRED", message: `Only synthetic candles available for ${opts.marketClass}:${opts.symbol}.` };
    }
  } catch (e) {
    if (!allowSyn) {
      return { error: "MARKET_DATA_SOURCE_REQUIRED", message: `No market data provider available for ${opts.marketClass}:${opts.symbol}: ${String(e)}` };
    }
  }

  if (!candles.length) {
    return { error: "MARKET_DATA_SOURCE_REQUIRED", message: `No candles returned for ${opts.marketClass}:${opts.symbol}.` };
  }

  if (candles.length < 30) {
    return { error: "MARKET_DATA_SOURCE_REQUIRED", message: `Insufficient history (${candles.length} bars) for ${opts.symbol}; need at least 30 for indicator analysis.` };
  }

  const closes = candles.map((c) => c.close);
  const lastBar = candles[candles.length - 1];
  const price = quote?.price ?? lastBar.close;
  const ts = quote?.timestamp ?? lastBar.time;
  const freshness = Math.floor(Date.now() / 1000) - ts;

  // Full indicator suite (raw arrays + aggregated signals)
  const ind = runAllIndicators(candles, opts.symbol, tf);
  const vals = ind.values;

  // ── Build signals ─────────────────────────────────────────────
  const signals: AnalysisReport["signals"] = [];

  const sma20 = vals.ma20 as number | null;
  const sma50 = vals.ma50 as number | null;
  const sma200 = vals.ma200 as number | null;
  const ema12 = vals.ema12 as number | null;
  const ema26 = vals.ema26 as number | null;
  const rsi14 = vals.rsi as number | null;
  const macd = vals.macd as { macd: number | null; signal: number | null; histogram: number | null };
  const boll = vals.bbands as { upper: number | null; middle: number | null; lower: number | null };
  const atr14 = vals.atr as number | null;
  const adx14 = vals.adx as number | null;
  const psarVal = vals.psar as number | null;
  const stochK = vals.stochK as number | null;
  const stochD = vals.stochD as number | null;
  const willr14 = vals.willr as number | null;
  const cci20 = vals.cci as number | null;
  const ich = vals.ichimoku as { tenkan: number | null; kijun: number | null; senkouA: number | null; senkouB: number | null };
  const pivot = ind.pivots;
  const sr = ind.supportResistance as Array<{ price: number; type: "support" | "resistance"; strength: number } | number>;
  const obvSlope = (ind as any)._obvArray ? obvTrend((ind as any)._obvArray as (number | null)[]) : "flat";
  if (sma20 != null) {
    if (price > sma20) signals.push({ source: "SMA20", bias: "bullish", weight: 1, detail: `Price above SMA20 (${sma20.toFixed(2)})` });
    else signals.push({ source: "SMA20", bias: "bearish", weight: 1, detail: `Price below SMA20 (${sma20.toFixed(2)})` });
  }
  if (sma50 != null && sma200 != null) {
    if (sma50 > sma200) signals.push({ source: "SMA50/200", bias: "bullish", weight: 2, detail: `SMA50 ${sma50.toFixed(2)} > SMA200 ${sma200.toFixed(2)} (golden-cross territory)` });
    else signals.push({ source: "SMA50/200", bias: "bearish", weight: 2, detail: `SMA50 ${sma50.toFixed(2)} < SMA200 ${sma200.toFixed(2)} (death-cross territory)` });
  }
  if (ema12 != null && ema26 != null) {
    if (ema12 > ema26) signals.push({ source: "EMA12/26", bias: "bullish", weight: 1, detail: "Short-term EMA above long-term EMA" });
    else signals.push({ source: "EMA12/26", bias: "bearish", weight: 1, detail: "Short-term EMA below long-term EMA" });
  }
  if (psarVal != null) {
    if (price > psarVal) signals.push({ source: "Parabolic SAR", bias: "bullish", weight: 1, detail: `PSAR ${psarVal.toFixed(2)} below price — uptrend` });
    else signals.push({ source: "Parabolic SAR", bias: "bearish", weight: 1, detail: `PSAR ${psarVal.toFixed(2)} above price — downtrend` });
  }
  if (ich.tenkan != null && ich.kijun != null) {
    const tkCross = ich.tenkan > ich.kijun ? "bullish" : "bearish";
    signals.push({ source: "Ichimoku TK", bias: tkCross, weight: 1.5, detail: `Tenkan ${ich.tenkan.toFixed(2)} ${tkCross === "bullish" ? ">" : "<"} Kijun ${ich.kijun.toFixed(2)}` });
  }
  if (rsi14 != null) {
    if (rsi14 > 70) signals.push({ source: "RSI(14)", bias: "bearish", weight: 1.5, detail: `RSI ${rsi14.toFixed(1)} overbought` });
    else if (rsi14 < 30) signals.push({ source: "RSI(14)", bias: "bullish", weight: 1.5, detail: `RSI ${rsi14.toFixed(1)} oversold` });
    else if (rsi14 > 55) signals.push({ source: "RSI(14)", bias: "bullish", weight: 0.5, detail: `RSI ${rsi14.toFixed(1)} bullish momentum` });
    else if (rsi14 < 45) signals.push({ source: "RSI(14)", bias: "bearish", weight: 0.5, detail: `RSI ${rsi14.toFixed(1)} bearish momentum` });
    else signals.push({ source: "RSI(14)", bias: "neutral", weight: 0.2, detail: `RSI ${rsi14.toFixed(1)} neutral` });
  }
  if (macd.macd != null && macd.signal != null) {
    if (macd.macd > macd.signal && (macd.histogram ?? 0) >= 0) signals.push({ source: "MACD", bias: "bullish", weight: 1.5, detail: `MACD (${macd.macd.toFixed(2)}) above signal (${macd.signal.toFixed(2)})` });
    else if (macd.macd < macd.signal && (macd.histogram ?? 0) <= 0) signals.push({ source: "MACD", bias: "bearish", weight: 1.5, detail: `MACD (${macd.macd.toFixed(2)}) below signal (${macd.signal.toFixed(2)})` });
    else signals.push({ source: "MACD", bias: "neutral", weight: 0.3, detail: "MACD histogram weakening" });
  }
  if (stochK != null && stochD != null) {
    if (stochK > 80 && stochD > 80) signals.push({ source: "Stochastic", bias: "bearish", weight: 0.8, detail: `Stoch overbought (K=${stochK.toFixed(1)})` });
    else if (stochK < 20 && stochD < 20) signals.push({ source: "Stochastic", bias: "bullish", weight: 0.8, detail: `Stoch oversold (K=${stochK.toFixed(1)})` });
  }
  if (willr14 != null) {
    if (willr14 > -20) signals.push({ source: "Williams %R", bias: "bearish", weight: 0.5, detail: `Williams %R ${willr14.toFixed(1)} overbought zone` });
    else if (willr14 < -80) signals.push({ source: "Williams %R", bias: "bullish", weight: 0.5, detail: `Williams %R ${willr14.toFixed(1)} oversold zone` });
  }
  if (cci20 != null) {
    if (cci20 > 100) signals.push({ source: "CCI", bias: "bullish", weight: 0.5, detail: `CCI ${cci20.toFixed(1)} strong uptrend` });
    else if (cci20 < -100) signals.push({ source: "CCI", bias: "bearish", weight: 0.5, detail: `CCI ${cci20.toFixed(1)} strong downtrend` });
  }

  const atr = atr14 ?? 0;
  const atrPct = price > 0 ? (atr / price) * 100 : 0;
  let volRegime: AnalysisReport["volatility"]["regime"] = "normal";
  if (atrPct < 0.3) volRegime = "low";
  else if (atrPct > 4) volRegime = "extreme";
  else if (atrPct > 2) volRegime = "high";

  if (boll.upper != null && boll.lower != null) {
    const bw = (boll.upper - boll.lower) / (boll.middle ?? price);
    if (bw > 0.08) signals.push({ source: "Bollinger Bandwidth", bias: "neutral", weight: 0.5, detail: `Bandwidth ${(bw * 100).toFixed(2)}% — elevated volatility` });
    if (price >= boll.upper) signals.push({ source: "Bollinger Upper", bias: "bearish", weight: 1, detail: `Touching upper band ${boll.upper.toFixed(2)} — potential pullback` });
    if (price <= boll.lower) signals.push({ source: "Bollinger Lower", bias: "bullish", weight: 1, detail: `Touching lower band ${boll.lower.toFixed(2)} — potential bounce` });
  }

  const volArr = candles.map((c) => c.volume);
  const avgVol = volArr.slice(-20).reduce((a, b) => a + b, 0) / 20 || 1;
  const lastVol = volArr[volArr.length - 1] ?? 0;
  const volSpike = lastVol > avgVol * 1.5;
  let volProfile: AnalysisReport["volume"]["profile"] = "neutral";
  if (obvSlope === "up") volProfile = "accumulation";
  else if (obvSlope === "down") volProfile = "distribution";

  let bullScore = 0, bearScore = 0, totalWeight = 0;
  for (const s of signals) {
    totalWeight += s.weight;
    if (s.bias === "bullish") bullScore += s.weight;
    else if (s.bias === "bearish") bearScore += s.weight;
  }
  const netBull = totalWeight > 0 ? (bullScore - bearScore) / totalWeight : 0;
  const bullProb = sigmoid(netBull * 2.5);

  const adxVal = adx14 ?? 0;
  let regime: AnalysisReport["marketRegime"] = "ranging";
  if (volRegime === "extreme") regime = "high-volatility";
  else if (atrPct < 0.2 && avgVol < 1000) regime = "low-liquidity";
  else if (adxVal > 25) regime = netBull > 0.2 ? "trending-up" : netBull < -0.2 ? "trending-down" : "ranging";

  const trendDir: AnalysisReport["trend"]["direction"] = netBull > 0.2 ? "up" : netBull < -0.2 ? "down" : "sideways";
  const trendStrength = Math.min(1, (Math.abs(netBull) * 1.5 + Math.min(1, adxVal / 50)) / 2);
  const momDir: AnalysisReport["momentum"]["direction"] =
    (rsi14 ?? 50) > 55 && macd.macd != null && macd.signal != null && macd.macd > macd.signal ? "bullish" :
    (rsi14 ?? 50) < 45 && macd.macd != null && macd.signal != null && macd.macd < macd.signal ? "bearish" : "neutral";
  const momStrength = Math.abs(netBull);

  const supports: number[] = [];
  const resistances: number[] = [];
  for (const level of sr) {
    const p = typeof level === "number" ? level : level.price;
    const t = typeof level === "number" ? null : level.type;
    if (p == null) continue;
    if (p < price) supports.push(p);
    else if (p > price) resistances.push(p);
    else { if (t === "resistance") resistances.push(p); else supports.push(p); }
  }
  supports.sort((a, b) => b - a);
  resistances.sort((a, b) => a - b);
  const nearestSupport = supports[0] ?? price - atr * 2;
  const nearestResistance = resistances[0] ?? price + atr * 2;

  const trendNotes: string[] = [];
  if (sma50 != null && sma200 != null) trendNotes.push(`SMA50 ${sma50 > sma200 ? "above" : "below"} SMA200`);
  if (adxVal != null) trendNotes.push(`ADX(14) = ${adxVal.toFixed(1)} (${adxVal > 25 ? "trending" : "ranging"})`);
  if (psarVal != null) trendNotes.push(`PSAR at ${psarVal.toFixed(2)}`);

  const momentumNotes: string[] = [];
  if (rsi14 != null) momentumNotes.push(`RSI(14) = ${rsi14.toFixed(1)}`);
  if (macd.histogram != null) momentumNotes.push(`MACD histogram ${macd.histogram >= 0 ? "positive" : "negative"}`);

  const volNotes: string[] = [
    `ATR(14) = ${atr.toFixed(price < 10 ? 4 : 2)} (${atrPct.toFixed(2)}% of price)`,
    `Volume ${volSpike ? "spike" : "normal"} vs 20-bar avg`,
  ];
  const volumeConfirm: AnalysisReport["volume"]["trendVsPrice"] =
    obvSlope === "up" && netBull > 0 ? "confirming" :
    obvSlope === "down" && netBull < 0 ? "confirming" :
    ((obvSlope === "up" && netBull < 0) || (obvSlope === "down" && netBull > 0)) ? "divergent" : "neutral";

  const baseUp = nearestResistance - price;
  const baseDown = price - nearestSupport;
  const bullProbNum = Math.round(bullProb * 100) / 100;
  const bearProbNum = Math.round((1 - bullProb) * 0.6 * 100) / 100;
  const sideProbNum = Math.max(0, +(1 - bullProbNum - bearProbNum).toFixed(2));
  const scenarios: AnalysisReport["scenarios"] = {
    bullish: {
      probability: bullProbNum,
      target: +(price + Math.max(baseUp, atr * 3)).toFixed(price < 10 ? 4 : 2),
      rationale: `Trend ${trendDir}, momentum ${momDir}, break above resistance ~${nearestResistance.toFixed(2)} with ${volProfile} volume favors continuation.`,
    },
    bearish: {
      probability: bearProbNum,
      target: +(price - Math.max(baseDown, atr * 3)).toFixed(price < 10 ? 4 : 2),
      rationale: `Rejection at resistance or break of support ~${nearestSupport.toFixed(2)} with ${volProfile} volume targets next support. ATR-based stop context: ${atr.toFixed(2)}.`,
    },
    sideways: {
      probability: sideProbNum,
      rangeLow: +nearestSupport.toFixed(price < 10 ? 4 : 2),
      rangeHigh: +nearestResistance.toFixed(price < 10 ? 4 : 2),
      rationale: `ADX ${adxVal.toFixed(0)} < 25 and balanced momentum suggest range-bound chop between support/resistance.`,
    },
  };

  let setup: AnalysisReport["tradeSetup"] | null = null;
  const capital = opts.capitalUsd ?? 10_000;
  const riskPct = opts.riskPerTradePct ?? 1;
  if ((bullProb > 0.6 && regime !== "ranging") || (bullProb < 0.4 && regime !== "ranging")) {
    const bias: "long" | "short" = bullProb > 0.6 ? "long" : "short";
    let entry: [number, number];
    let sl: number, tp: number;
    if (bias === "long") {
      entry = [+(price - atr * 0.3).toFixed(price < 10 ? 4 : 2), +(price + atr * 0.1).toFixed(price < 10 ? 4 : 2)];
      sl = +(Math.min(entry[0] - atr * 1.5, nearestSupport - atr * 0.2)).toFixed(price < 10 ? 4 : 2);
      tp = +(Math.max(entry[1] + atr * 3, nearestResistance)).toFixed(price < 10 ? 4 : 2);
    } else {
      entry = [+(price - atr * 0.1).toFixed(price < 10 ? 4 : 2), +(price + atr * 0.3).toFixed(price < 10 ? 4 : 2)];
      sl = +(Math.max(entry[1] + atr * 1.5, nearestResistance + atr * 0.2)).toFixed(price < 10 ? 4 : 2);
      tp = +(Math.min(entry[0] - atr * 3, nearestSupport)).toFixed(price < 10 ? 4 : 2);
    }
    const entryMid = (entry[0] + entry[1]) / 2;
    const risk = Math.abs(entryMid - sl);
    const reward = Math.abs(tp - entryMid);
    const rr = risk > 0 ? reward / risk : 0;
    const riskUsd = capital * (riskPct / 100);
    const sizeUnits = risk > 0 ? riskUsd / risk : 0;
    setup = {
      bias,
      entryZone: entry,
      stopLoss: sl,
      takeProfit: tp,
      riskReward: +rr.toFixed(2),
      positionSizePct: +riskPct.toFixed(2),
      confidence: +Math.max(0.3, Math.min(0.95, 0.4 + Math.abs(netBull) * 0.5)).toFixed(2),
      suggestedSizeUnits: +sizeUnits.toFixed(4),
      riskUsd: +riskUsd.toFixed(2),
    };
  }

  return {
    symbol: opts.symbol,
    marketClass: opts.marketClass,
    timeframe: tf,
    dataSource: source + (quote?.source ? `/${quote.source}` : ""),
    synthetic,
    dataFreshnessSec: freshness,
    price,
    timestamp: ts,
    candlesUsed: candles.length,
    marketRegime: regime,
    trend: { direction: trendDir, strength: +trendStrength.toFixed(2), notes: trendNotes },
    momentum: { direction: momDir, strength: +momStrength.toFixed(2), notes: momentumNotes },
    volatility: {
      regime: volRegime,
      atr: +atr.toFixed(price < 10 ? 4 : 2),
      atrPct: +atrPct.toFixed(2),
      notes: [`Bollinger: upper=${boll.upper?.toFixed(2)} lower=${boll.lower?.toFixed(2)}`].filter(Boolean),
    },
    volume: { profile: volProfile, trendVsPrice: volumeConfirm, notes: volNotes },
    supportResistance: {
      support: supports.slice(0, 5).map((n) => +n.toFixed(price < 10 ? 4 : 2)),
      resistance: resistances.slice(0, 5).map((n) => +n.toFixed(price < 10 ? 4 : 2)),
      pivotPoint: pivot?.pivot ? +pivot.pivot.toFixed(price < 10 ? 4 : 2) : undefined,
    },
    signals,
    scenarios,
    tradeSetup: setup,
    indicators: vals as unknown as Record<string, unknown>,
    disclaimer: "DECISION SUPPORT ONLY. AI analysis does not guarantee profits. WINDELS AI OS does not execute trades — user manually executes through their preferred broker. Past performance is not indicative of future results.",
    ...(stale ? { warning: "Data is stale; verify with live source before acting." } : {}),
    ...(synthetic ? { warning: (stale ? "Data is stale; " : "") + "SIMULATION: data is synthetic, not live market data. Use for educational/testing purposes only." } : {}),
  } as AnalysisReport;
}

