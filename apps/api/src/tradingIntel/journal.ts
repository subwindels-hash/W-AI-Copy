/**
 * Trade Journal — records user-entered (or AI-suggested) trades for
 * performance analytics. WINDELS does not execute trades; users manually
 * execute at their broker and log outcomes here for AI-driven analytics.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";

export interface JournalTrade {
  id: string;
  userId: string;
  symbol: string;
  marketClass: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice?: number;
  size: number;
  sizeUnits?: string;
  stopLoss?: number;
  takeProfit?: number;
  entryAt: string;
  exitAt?: string;
  pnlUsd?: number;
  pnlPct?: number;
  rMultiple?: number; // (exit - entry) / risk, signed
  riskUsd?: number;
  fees?: number;
  notes?: string;
  tags?: string[];
  broker?: string;
  strategy?: string;
  confidenceAtEntry?: number;
  emotionAtEntry?: string;
  createdAt: string;
  updatedAt: string;
}

const K = {
  tradesByUser: (uid: string) => `journal:user:${uid}:trades`,
  trade: (id: string) => `journal:trade:${id}`,
  metrics: (uid: string) => `journal:metrics:${uid}`,
};

function s(o: any) { return JSON.stringify(o); }
function j(s: string) { return JSON.parse(s); }

export const JournalService = {
  async addTrade(userId: string, input: Omit<JournalTrade, "id"|"userId"|"createdAt"|"updatedAt"|"pnlUsd"|"pnlPct"|"rMultiple">): Promise<JournalTrade> {
    const id = "tr-" + randomUUID().slice(0, 10);
    const now = new Date().toISOString();
    const pnl = input.exitPrice != null ? computePnl(input) : undefined;
    const trade: JournalTrade = {
      id, userId,
      symbol: input.symbol.toUpperCase(),
      marketClass: input.marketClass,
      side: input.side,
      entryPrice: +input.entryPrice,
      exitPrice: input.exitPrice != null ? +input.exitPrice : undefined,
      size: +input.size,
      sizeUnits: input.sizeUnits,
      stopLoss: input.stopLoss != null ? +input.stopLoss : undefined,
      takeProfit: input.takeProfit != null ? +input.takeProfit : undefined,
      entryAt: input.entryAt || now,
      exitAt: input.exitAt,
      fees: input.fees != null ? +input.fees : undefined,
      notes: input.notes,
      tags: input.tags,
      broker: input.broker,
      strategy: input.strategy,
      confidenceAtEntry: input.confidenceAtEntry,
      emotionAtEntry: input.emotionAtEntry,
      ...pnl,
      createdAt: now, updatedAt: now,
    };
    const multi = redis.multi();
    multi.zadd(K.tradesByUser(userId), new Date(trade.entryAt).getTime(), id);
    multi.set(K.trade(id), s(trade));
    await multi.exec();
    return trade;
  },

  async closeTrade(userId: string, tradeId: string, exitPrice: number, exitAt?: string, fees?: number, notes?: string): Promise<JournalTrade | null> {
    const raw = await redis.get(K.trade(tradeId));
    if (!raw) return null;
    const t = j(raw) as JournalTrade;
    if (t.userId !== userId) return null;
    t.exitPrice = +exitPrice;
    t.exitAt = exitAt || new Date().toISOString();
    if (fees != null) t.fees = (t.fees ?? 0) + +fees;
    if (notes) t.notes = notes;
    const pnl = computePnl(t);
    Object.assign(t, pnl);
    t.updatedAt = new Date().toISOString();
    await redis.set(K.trade(t.id), s(t));
    return t;
  },

  async deleteTrade(userId: string, tradeId: string): Promise<boolean> {
    const raw = await redis.get(K.trade(tradeId));
    if (!raw) return false;
    const t = j(raw) as JournalTrade;
    if (t.userId !== userId) return false;
    const multi = redis.multi();
    multi.zrem(K.tradesByUser(userId), tradeId);
    multi.del(K.trade(tradeId));
    await multi.exec();
    return true;
  },

  async listTrades(userId: string, opts: { limit?: number; status?: "open"|"closed"; symbol?: string } = {}): Promise<JournalTrade[]> {
    const ids = await redis.zrange(K.tradesByUser(userId), 0, -1, "REV");
    const out: JournalTrade[] = [];
    for (const id of ids) {
      const raw = await redis.get(K.trade(id));
      if (!raw) continue;
      const t = j(raw) as JournalTrade;
      if (opts.status === "open" && t.exitPrice != null) continue;
      if (opts.status === "closed" && t.exitPrice == null) continue;
      if (opts.symbol && !t.symbol.includes(opts.symbol.toUpperCase())) continue;
      out.push(t);
      if (opts.limit && out.length >= opts.limit) break;
    }
    return out;
  },

  /**
   * Compute performance analytics over closed trades:
   *   win rate, loss rate, profit factor, gross profit/loss, net P&L,
   *   average win/loss, max win/loss, total trades, expectancy,
   *   Sharpe-like (mean/std of per-trade returns), max drawdown
   *   (peak-to-trough over equity curve of closed P&Ls),
   *   win/loss streak stats, best/worst trade, by-symbol breakdown.
   *
   * All metrics are derived strictly from user-imported/journaled trades —
   * we never invent results.
   */
  async analytics(userId: string): Promise<Record<string, any>> {
    const trades = (await this.listTrades(userId, { status: "closed" }))
      .filter((t) => t.exitPrice != null)
      .sort((a, b) => new Date(a.exitAt!).getTime() - new Date(b.exitAt!).getTime());

    if (trades.length === 0) {
      return {
        available: false,
        message: "No closed trades logged. Add trades via POST /trading-intel/journal to unlock performance analytics.",
        totals: { trades: 0 },
      };
    }

    const wins = trades.filter((t) => (t.pnlUsd ?? 0) > 0);
    const losses = trades.filter((t) => (t.pnlUsd ?? 0) < 0);
    const scratch = trades.filter((t) => (t.pnlUsd ?? 0) === 0);
    const grossProfit = wins.reduce((a, t) => a + (t.pnlUsd ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + (t.pnlUsd ?? 0), 0));
    const netPnl = trades.reduce((a, t) => a + (t.pnlUsd ?? 0), 0);
    const winRate = wins.length / trades.length;
    const lossRate = losses.length / trades.length;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    const avgWin = wins.length ? grossProfit / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    const expectancy = winRate * avgWin - lossRate * avgLoss;
    const maxWin = wins.reduce((m, t) => Math.max(m, t.pnlUsd ?? 0), 0);
    const maxLoss = losses.reduce((m, t) => Math.min(m, t.pnlUsd ?? 0), 0);
    const avgRMultiple = trades.reduce((a, t) => a + (t.rMultiple ?? 0), 0) / trades.length;

    // Equity curve & max drawdown
    let equity = 0, peak = 0, maxDd = 0;
    const equityCurve: { at: string; equity: number }[] = [];
    for (const t of trades) {
      equity += t.pnlUsd ?? 0;
      peak = Math.max(peak, equity);
      const dd = peak - equity;
      if (dd > maxDd) maxDd = dd;
      equityCurve.push({ at: t.exitAt!, equity: +equity.toFixed(2) });
    }

    // Sharpe-like (annualized) on per-trade % returns
    const rets = trades.map((t) => t.pnlPct ?? 0);
    const meanR = rets.reduce((a, b) => a + b, 0) / rets.length;
    const varR = rets.reduce((a, b) => a + (b - meanR) ** 2, 0) / Math.max(1, rets.length);
    const stdR = Math.sqrt(varR);
    const sharpeLike = stdR > 0 ? (meanR / stdR) * Math.sqrt(Math.max(1, trades.length)) : 0;

    // Streaks
    let curWinStreak = 0, curLossStreak = 0, maxWinStreak = 0, maxLossStreak = 0;
    for (const t of trades) {
      const p = t.pnlUsd ?? 0;
      if (p > 0) { curWinStreak++; curLossStreak = 0; maxWinStreak = Math.max(maxWinStreak, curWinStreak); }
      else if (p < 0) { curLossStreak++; curWinStreak = 0; maxLossStreak = Math.max(maxLossStreak, curLossStreak); }
      else { curWinStreak = 0; curLossStreak = 0; }
    }

    // By-symbol breakdown
    const bySymbol: Record<string, { trades: number; wins: number; pnl: number; winRate: number }> = {};
    for (const t of trades) {
      const k = t.symbol;
      if (!bySymbol[k]) bySymbol[k] = { trades: 0, wins: 0, pnl: 0, winRate: 0 };
      bySymbol[k].trades++;
      if ((t.pnlUsd ?? 0) > 0) bySymbol[k].wins++;
      bySymbol[k].pnl += t.pnlUsd ?? 0;
    }
    for (const k of Object.keys(bySymbol)) bySymbol[k].winRate = bySymbol[k].wins / bySymbol[k].trades;

    // By-strategy breakdown
    const byStrategy: Record<string, { trades: number; wins: number; pnl: number; winRate: number }> = {};
    for (const t of trades) {
      const k = t.strategy ?? "unlabeled";
      if (!byStrategy[k]) byStrategy[k] = { trades: 0, wins: 0, pnl: 0, winRate: 0 };
      byStrategy[k].trades++;
      if ((t.pnlUsd ?? 0) > 0) byStrategy[k].wins++;
      byStrategy[k].pnl += t.pnlUsd ?? 0;
    }
    for (const k of Object.keys(byStrategy)) byStrategy[k].winRate = byStrategy[k].wins / byStrategy[k].trades;

    const totalFees = trades.reduce((a, t) => a + (t.fees ?? 0), 0);

    return {
      available: true,
      dataSource: "user-journal",
      synthetic: false,
      generatedAt: new Date().toISOString(),
      totals: {
        trades: trades.length,
        wins: wins.length, losses: losses.length, scratches: scratch.length,
        winRate: +winRate.toFixed(4),
        lossRate: +lossRate.toFixed(4),
        grossProfit: +grossProfit.toFixed(2),
        grossLoss: +grossLoss.toFixed(2),
        netPnl: +netPnl.toFixed(2),
        totalFees: +totalFees.toFixed(2),
        profitFactor: profitFactor === Infinity ? null : +profitFactor.toFixed(3),
        avgWin: +avgWin.toFixed(2),
        avgLoss: +avgLoss.toFixed(2),
        expectancy: +expectancy.toFixed(2),
        bestTrade: +maxWin.toFixed(2),
        worstTrade: +maxLoss.toFixed(2),
        avgRMultiple: +avgRMultiple.toFixed(3),
        sharpeLike: +sharpeLike.toFixed(3),
        maxDrawdownUsd: +maxDd.toFixed(2),
        maxWinStreak, maxLossStreak,
      },
      equityCurve: equityCurve.slice(-100),
      bySymbol,
      byStrategy,
      disclaimer: "Analytics are computed from user-journaled closed trades only. WINDELS does not execute trades or connect to brokers.",
    };
  },
};

function computePnl(t: { side: "long"|"short"; entryPrice: number; exitPrice?: number; size: number; stopLoss?: number; fees?: number }) {
  if (t.exitPrice == null) return {};
  const direction = t.side === "long" ? 1 : -1;
  const gross = direction * (t.exitPrice - t.entryPrice) * t.size;
  const fees = t.fees ?? 0;
  const pnlUsd = gross - fees;
  const pnlPct = t.entryPrice !== 0 ? direction * (t.exitPrice - t.entryPrice) / t.entryPrice : 0;
  const riskPerUnit = t.stopLoss != null ? Math.abs(t.entryPrice - t.stopLoss) : Math.abs(t.exitPrice - t.entryPrice);
  const rMultiple = riskPerUnit > 0 ? direction * (t.exitPrice - t.entryPrice) / riskPerUnit : 0;
  const riskUsd = riskPerUnit * t.size;
  return { pnlUsd: +pnlUsd.toFixed(2), pnlPct: +pnlPct.toFixed(4), rMultiple: +rMultiple.toFixed(3), riskUsd: +riskUsd.toFixed(2) };
}

// Attach analytics to perf-analytics agent by adding a helper.
export async function perfAnalyticsReport(userId: string): Promise<any> {
  const a = await JournalService.analytics(userId);
  return { ...a, agent: "perf-analytics" };
}
