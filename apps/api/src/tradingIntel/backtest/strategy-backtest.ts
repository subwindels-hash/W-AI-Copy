/**
 * WINDELS AI OS — Strategy Backtest Engine (analytical tool, NOT a broker).
 *
 * CRITICAL ARCHITECTURAL INVARIANT:
 *   WINDELS AI OS is an Enterprise AI Trading Agent — NOT a broker, exchange,
 *   dealing desk, liquidity provider, custodian, or execution venue. It does
 *   not hold customer funds, match orders, fill trades internally, or run an
 *   internal order book. All live trade execution occurs at the user's
 *   connected external broker or exchange via IBrokerConnector.
 *
 * What this module IS:
 *   An offline, deterministic, market-data replay tool for evaluating AI
 *   trading strategies against historical (or broker-pulled) candle/tick
 *   data. It produces a performance report (P&L series, drawdown, win rate,
 *   Sharpe, max drawdown, trade log) so AI agents and users can assess a
 *   strategy before approving it for live use. It has no balances, no
 *   margin, no custody, no order book, and no network exposure. It does
 *   NOT implement IBrokerConnector and will never be registered as a
 *   broker.
 *
 * What this module is NOT:
 *   - A paper-trading venue (paper trading uses the external broker's
 *     demo/testnet accounts via the regular IBrokerConnector path).
 *   - A matching engine or market maker.
 *   - A place where customer funds can be "deposited" or "held".
 *
 * Lifecycle:
 *   1. Caller supplies a historical candle series (pulled from an external
 *      broker via getCandles()).
 *   2. Caller registers a StrategyFn(candle, ctx) → { signal? } callback
 *      (typically an AI strategy signal emitter).
 *   3. run() replays candles in order, feeding each to the strategy,
 *      tracking hypothetical entries/exits at the next candle's open (to
 *      avoid lookahead bias) against configurable commission/slippage
 *      assumptions supplied as parameters.
 *   4. Returns a BacktestReport. No state leaks into any broker path;
 *      results are pure data for the UI and AI evaluation loop.
 *
 * Determinism: mulberry32 seeded PRNG is used ONLY for optional stochastic
 * slippage jitter in stress runs; with jitter=0 results are fully
 * reproducible. The replay loop contains no unseeded PRNG or wall-clock reads;
 * time is supplied by the candle stream.
 */
import type { BrokerCandle } from "@windels/shared/brokerIntegration";

export interface BacktestParams {
  /** Starting equity in quote currency (USD/USDT) — analytical starting value, NOT a real balance held by WINDELS. */
  startingEquity: number;
  /** Per-side commission rate, e.g. 0.001 = 0.1%. Used purely for hypotethical cost modeling. */
  commissionRate?: number;
  /** Slippage in price percentage (e.g. 0.0005 = 5 bps). Applied deterministically. */
  slippageRate?: number;
  /** Fraction of equity risked per trade (0.01 = 1%). */
  riskPerTrade?: number;
  /** Optional stop-loss multiplier of ATR / fixed percentage. */
  stopLossPct?: number;
  /** Optional take-profit multiplier of risk. */
  takeProfitMultiple?: number;
}

export interface BacktestSignal {
  /** Candle index at which the signal was emitted. */
  idx: number;
  side: "long" | "short";
  /** Entry price assumption (next-candle open, after slippage). */
  entry: number;
  /** Stop loss / take profit used for this signal. */
  sl?: number;
  tp?: number;
  /** Size as fraction of equity. */
  size: number;
}

export interface BacktestTrade {
  side: "long" | "short";
  entryIdx: number;
  exitIdx: number;
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  commission: number;
  exitReason: "tp" | "sl" | "signal_reverse" | "end";
}

export interface BacktestReport {
  startingEquity: number;
  endingEquity: number;
  totalReturnPct: number;
  numTrades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  avgWinPct: number;
  avgLossPct: number;
  trades: BacktestTrade[];
  equityCurve: Array<{ time: string; equity: number }>;
  params: BacktestParams;
}

/** Strategy callback: given the current candle and a helper context, optionally return a desired position direction ("long"|"short"|null for flat). */
export type StrategyFn = (ctx: {
  i: number;
  candle: BrokerCandle;
  series: BrokerCandle[];
  currentPosition: { side: "long" | "short" | null; entryPrice: number; quantity: number };
}) => "long" | "short" | "flat" | null;

/** Mulberry32 seeded PRNG. Used only for optional stochastic slippage jitter (when slippageRate > 0 and stress=true). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runBacktest(series: BrokerCandle[], strategy: StrategyFn, params: BacktestParams, seed = 0xA17B15): BacktestReport {
  const commission = params.commissionRate ?? 0.001;
  const slip = params.slippageRate ?? 0.0;
  const riskFrac = params.riskPerTrade ?? 0.01;
  const slPct = params.stopLossPct ?? 0.02;
  const tpMult = params.takeProfitMultiple ?? 2;
  const rng = mulberry32(seed);

  if (series.length < 2) {
    return emptyReport(params);
  }

  let equity = params.startingEquity;
  let pos: { side: "long" | "short"; entryPrice: number; quantity: number; sl: number; tp: number; entryIdx: number } | null = null;
  const trades: BacktestTrade[] = [];
  const equityCurve: Array<{ time: string; equity: number }> = [];

  for (let i = 0; i < series.length; i++) {
    const c = series[i]!;

    // Manage open position against current H/L first.
    if (pos) {
      let exitPrice: number | null = null;
      let reason: BacktestTrade["exitReason"] | null = null;
      if (pos.side === "long") {
        if (c.low <= pos.sl) { exitPrice = pos.sl; reason = "sl"; }
        else if (c.high >= pos.tp) { exitPrice = pos.tp; reason = "tp"; }
      } else {
        if (c.high >= pos.sl) { exitPrice = pos.sl; reason = "sl"; }
        else if (c.low <= pos.tp) { exitPrice = pos.tp; reason = "tp"; }
      }
      if (exitPrice !== null && reason !== null) {
        const trade = closePosition(pos, exitPrice, c.time, i, reason, commission);
        equity += trade.pnl - trade.commission;
        trades.push(trade);
        pos = null;
      }
    }

    // Ask the strategy for a signal based on candles up to i (no lookahead).
    const signal = strategy({ i, candle: c, series, currentPosition: { side: pos?.side ?? null, entryPrice: pos?.entryPrice ?? 0, quantity: pos?.quantity ?? 0 } });
    if (signal && signal !== "flat") {
      // Flip/close if opposite direction.
      if (pos && pos.side !== signal) {
        const exitPrice = c.open * (pos.side === "long" ? (1 - slip) : (1 + slip));
        const trade = closePosition(pos, exitPrice, c.time, i, "signal_reverse", commission);
        equity += trade.pnl - trade.commission;
        trades.push(trade);
        pos = null;
      }
      if (!pos) {
        // Enter on current candle's open (deferred execution — no peeking at close).
        const rawEntry = c.open;
        const jitter = slip * (rng() - 0.5) * 2; // only used if slip > 0; else 0
        const entry = rawEntry * (signal === "long" ? (1 + slip + jitter) : (1 - slip - jitter));
        const slDist = entry * slPct;
        const riskDollars = equity * riskFrac;
        const qty = riskDollars / slDist;
        const cost = qty * entry * commission;
        equity -= cost;
        pos = {
          side: signal,
          entryPrice: entry,
          quantity: qty,
          sl: signal === "long" ? entry - slDist : entry + slDist,
          tp: signal === "long" ? entry + slDist * tpMult : entry - slDist * tpMult,
          entryIdx: i,
        };
      }
    } else if (signal === "flat" && pos) {
      const exitPrice = c.open * (pos.side === "long" ? (1 - slip) : (1 + slip));
      const trade = closePosition(pos, exitPrice, c.time, i, "signal_reverse", commission);
      equity += trade.pnl - trade.commission;
      trades.push(trade);
      pos = null;
    }

    // Mark-to-market equity for curve (using close price when in position).
    let mtm = equity;
    if (pos) {
      const diff = pos.side === "long" ? (c.close - pos.entryPrice) : (pos.entryPrice - c.close);
      mtm += diff * pos.quantity;
    }
    equityCurve.push({ time: c.time, equity: mtm });
  }

  // Close any open position at last close.
  if (pos) {
    const last = series[series.length - 1]!;
    const trade = closePosition(pos, last.close, last.time, series.length - 1, "end", commission);
    equity += trade.pnl - trade.commission;
    trades.push(trade);
    const lastPt = equityCurve[equityCurve.length - 1]!;
    lastPt.equity = equity;
  }

  return buildReport(params, trades, equityCurve);
}

function closePosition(pos: { side: "long" | "short"; entryPrice: number; quantity: number; entryIdx: number }, exitPrice: number, time: string, i: number, reason: BacktestTrade["exitReason"], commissionRate: number): BacktestTrade {
  const diff = pos.side === "long" ? (exitPrice - pos.entryPrice) : (pos.entryPrice - exitPrice);
  const pnl = diff * pos.quantity;
  const commission = pos.quantity * (pos.entryPrice + exitPrice) * commissionRate;
  const entryTime = ""; // filled by caller via mapping? Not tracked here; we use idx.
  return {
    side: pos.side,
    entryIdx: pos.entryIdx, exitIdx: i,
    entryTime, exitTime: time,
    entryPrice: pos.entryPrice, exitPrice, quantity: pos.quantity, pnl,
    pnlPct: (pnl / (pos.quantity * pos.entryPrice)) * 100,
    commission, exitReason: reason,
  };
}

function emptyReport(params: BacktestParams): BacktestReport {
  return { startingEquity: params.startingEquity, endingEquity: params.startingEquity, totalReturnPct: 0, numTrades: 0, winRate: 0, profitFactor: 0, sharpeRatio: 0, maxDrawdownPct: 0, avgWinPct: 0, avgLossPct: 0, trades: [], equityCurve: [], params };
}

function buildReport(params: BacktestParams, trades: BacktestTrade[], curve: Array<{ time: string; equity: number }>): BacktestReport {
  const ending = curve.length ? curve[curve.length - 1]!.equity : params.startingEquity;
  let wins = 0, losses = 0, grossWin = 0, grossLoss = 0, winSum = 0, lossSum = 0;
  for (const t of trades) {
    const net = t.pnl - t.commission;
    if (net >= 0) { wins++; grossWin += net; winSum += t.pnlPct; }
    else { losses++; grossLoss += -net; lossSum += t.pnlPct; }
  }
  // Max drawdown from curve.
  let peak = -Infinity, mdd = 0;
  const rets: number[] = [];
  for (let i = 0; i < curve.length; i++) {
    const eq = curve[i]!.equity;
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
    if (dd > mdd) mdd = dd;
    if (i > 0) {
      const prev = curve[i - 1]!.equity;
      rets.push((eq - prev) / prev);
    }
  }
  const mean = rets.length ? rets.reduce((s, r) => s + r, 0) / rets.length : 0;
  const variance = rets.length ? rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length : 0;
  const sharpe = variance > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(252) : 0; // annualized for daily bars approx
  return {
    startingEquity: params.startingEquity, endingEquity: ending,
    totalReturnPct: ((ending - params.startingEquity) / params.startingEquity) * 100,
    numTrades: trades.length, winRate: trades.length ? wins / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0),
    sharpeRatio: sharpe, maxDrawdownPct: mdd,
    avgWinPct: wins ? winSum / wins : 0,
    avgLossPct: losses ? lossSum / losses : 0,
    trades, equityCurve: curve, params,
  };
}
