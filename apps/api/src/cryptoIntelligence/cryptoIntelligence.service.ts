/**
 * Enterprise Crypto Intelligence singleton (Session 35, Slices 295-299).
 * OPT-IN MODULE: disabled by default; all trading actions require governance+human approval.
 */
import { randomUUID } from "node:crypto";
import type {
  CiDashboard, ChainMonitor, MarketTicker, DefiProtocol, YieldOpportunity,
  Wallet, PortfolioPosition, SecurityAlert, TradeProposal, Strategy, ExchangeConnector,
  CiModuleStatus, TradeState, RiskLevel,
} from "@windels/shared";
import { redisCmd as redis } from "../db/redis.js";

const K = {
  config: "ci:config",
  chains: "ci:chains",
  tickers: "ci:tickers",
  defi: "ci:defi",
  yields: "ci:yields",
  wallets: "ci:wallets",
  positions: "ci:positions",
  alerts: "ci:alerts",
  trades: "ci:trades",
  approvals: "ci:approvals",
  strategies: "ci:strategies",
  exchanges: "ci:exchanges",
  trades24h: "ci:trades24h",
};

export const CryptoIntelligenceService = {
  async isEnabled(): Promise<{ enabled: boolean; status: CiModuleStatus }> {
    const raw = await redis.hgetall(K.config);
    return { enabled: raw?.enabled === "true", status: (raw?.status as CiModuleStatus) ?? "disabled" };
  },
  async setModuleStatus(status: CiModuleStatus): Promise<void> {
    await redis.hset(K.config, "enabled", String(status !== "disabled"), "status", status);
  },

  // Slice 295 — Blockchain & Market
  async listChains(): Promise<ChainMonitor[]> {
    const raw = await redis.zrange(K.chains, 0, -1);
    return raw.map(s => JSON.parse(s));
  },
  async listTickers(): Promise<MarketTicker[]> {
    const raw = await redis.zrange(K.tickers, 0, -1);
    return raw.map(s => JSON.parse(s));
  },

  // Slice 296 — DeFi
  async listProtocols(): Promise<DefiProtocol[]> {
    const raw = await redis.zrange(K.defi, 0, -1);
    return raw.map(s => JSON.parse(s));
  },
  async listYields(): Promise<YieldOpportunity[]> {
    const raw = await redis.zrange(K.yields, 0, -1);
    return raw.map(s => JSON.parse(s));
  },

  // Slice 297 — Portfolio & Security
  async listWallets(): Promise<Wallet[]> {
    const raw = await redis.zrange(K.wallets, 0, -1);
    return raw.map(s => JSON.parse(s));
  },
  async listPositions(walletId?: string): Promise<PortfolioPosition[]> {
    const raw = await redis.zrange(K.positions, 0, -1);
    let positions = raw.map(s => JSON.parse(s));
    if (walletId) positions = positions.filter((p: PortfolioPosition) => p.walletId === walletId);
    return positions;
  },
  async listAlerts(severity?: RiskLevel): Promise<SecurityAlert[]> {
    const raw = await redis.zrange(K.alerts, 0, -1, "REV");
    let alerts = raw.map(s => JSON.parse(s));
    if (severity) alerts = alerts.filter((a: SecurityAlert) => a.severity === severity);
    return alerts.slice(0, 50);
  },

  // Slice 298 — Trading
  async listStrategies(): Promise<Strategy[]> {
    const raw = await redis.zrange(K.strategies, 0, -1);
    return raw.map(s => JSON.parse(s));
  },
  async proposeTrade(t: Omit<TradeProposal,"id"|"proposedAt"|"state"|"approvalsReceived"|"approvalsRequired">): Promise<TradeProposal> {
    const cfg = await this.isEnabled();
    if (!cfg.enabled || cfg.status === "disabled") throw Object.assign(new Error("Crypto module disabled; enable under governance"), { code: "MODULE_DISABLED" });
    const id = "tp-" + randomUUID().slice(0, 8);
    const proposal: TradeProposal = {
      ...t, id, proposedAt: new Date().toISOString(),
      state: cfg.status === "enabled-live" ? "governance-review" : "proposed",
      approvalsReceived: 0, approvalsRequired: 2,
    };
    await redis.zadd(K.trades, Date.now(), JSON.stringify(proposal));
    await redis.zadd(K.approvals, Date.now(), id);
    return proposal;
  },
  async listTrades(filter?: { state?: TradeState }): Promise<TradeProposal[]> {
    const raw = await redis.zrange(K.trades, 0, -1, "REV");
    let trades = raw.map(s => JSON.parse(s));
    if (filter?.state) trades = trades.filter((t: TradeProposal) => t.state === filter.state);
    return trades.slice(0, 100);
  },
  async approveTrade(id: string, approver: string): Promise<TradeProposal | null> {
    const all = await redis.zrange(K.trades, 0, -1);
    let updated: TradeProposal | null = null;
    const multi = redis.multi();
    multi.del(K.trades);
    for (const s of all) {
      const t: TradeProposal = JSON.parse(s);
      if (t.id === id) {
        t.approvalsReceived = Math.min(t.approvalsReceived + 1, t.approvalsRequired);
        t.approvedBy = [...(t.approvedBy ?? []), approver];
        if (t.approvalsReceived >= t.approvalsRequired) t.state = "approved";
        updated = t;
      }
      multi.zadd(K.trades, Date.parse(t.proposedAt), JSON.stringify(t));
    }
    await multi.exec();
    if (updated && updated.state === "approved") await redis.zrem(K.approvals, id);
    return updated;
  },
  async rejectTrade(id: string, reason: string): Promise<TradeProposal | null> {
    const all = await redis.zrange(K.trades, 0, -1);
    let updated: TradeProposal | null = null;
    const multi = redis.multi();
    multi.del(K.trades);
    for (const s of all) {
      const t: TradeProposal = JSON.parse(s);
      if (t.id === id) { t.state = "rejected"; t.rejectReason = reason; updated = t; }
      multi.zadd(K.trades, Date.parse(t.proposedAt), JSON.stringify(t));
    }
    await multi.exec();
    await redis.zrem(K.approvals, id);
    return updated;
  },

  // Slice 299 — Exchanges
  async listExchanges(): Promise<ExchangeConnector[]> {
    const raw = await redis.zrange(K.exchanges, 0, -1);
    return raw.map(s => JSON.parse(s));
  },

  async summary(): Promise<CiDashboard> {
    const cfg = await this.isEnabled();
    const [chains, tickers, protos, wallets, alerts, trades, exchs, approvals, positions] = await Promise.all([
      this.listChains(), this.listTickers(), this.listProtocols(), this.listWallets(),
      this.listAlerts(), this.listTrades(), this.listExchanges(),
      redis.zcard(K.approvals), this.listPositions(),
    ]);
    const connectedExchs = exchs.filter(e => e.status === "connected" || e.status === "readonly" || e.status === "trade-enabled").length;
    const portfolioValueUsd = positions.reduce((s, p) => s + p.valueUsd, 0);
    const pnl24h = positions.reduce((s, p) => s + p.pnl24hUsd, 0);
    const open = trades.filter(t => t.state === "proposed" || t.state === "governance-review" || t.state === "approved" || t.state === "submitted");
    const trades24h = Number(await redis.get(K.trades24h) ?? "0");
    return {
      moduleEnabled: cfg.enabled, moduleStatus: cfg.status,
      chains: chains.length, chainsLive: chains.filter(c => c.status === "online").length,
      marketsTracked: tickers.length, defiProtocols: protos.length,
      walletsTracked: wallets.length, portfolioValueUsd: Math.round(portfolioValueUsd),
      portfolioPnl24hUsd: Math.round(pnl24h), openPositions: positions.filter(p => Math.abs(p.valueUsd) > 1).length,
      openOrders: open.length, riskAlerts: alerts.length, approvalsPending: approvals,
      tradesExecuted24h: trades24h, exchangeConnectors: exchs.length, exchangesConnected: connectedExchs,
      note: cfg.enabled
        ? (cfg.status === "enabled-live" ? "LIVE TRADING — every trade requires governance approval." : `Module in ${cfg.status} mode (no live execution).`)
        : "OPT-IN MODULE DISABLED. Enable explicitly for your organization; every action governed by the Enterprise Governance Kernel and subject to human approval.",
    };
  },
};
