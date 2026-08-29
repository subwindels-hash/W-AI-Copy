/**
 * Session 35 — Crypto Intelligence API client (opt-in module).
 */
import { api } from "./api";
import type { CiDashboard, ChainMonitor, MarketTicker, DefiProtocol, YieldOpportunity, Wallet, PortfolioPosition, SecurityAlert, TradeProposal, Strategy, ExchangeConnector, CiModuleStatus } from "@windels/shared";
export type { CiDashboard, ChainMonitor, MarketTicker, DefiProtocol, YieldOpportunity, Wallet, PortfolioPosition, SecurityAlert, TradeProposal, Strategy, ExchangeConnector, CiModuleStatus } from "@windels/shared";


export const ciApi = {
  dashboard: () => api<CiDashboard>("/crypto-intel/dashboard/rollup"),
  enable: (status: CiModuleStatus) => api<CiDashboard>("/crypto-intel/enable", { method: "POST", json: { status } }),

  listChains: () => api<ChainMonitor[]>("/crypto-intel/chains"),
  listMarkets: () => api<MarketTicker[]>("/crypto-intel/markets"),
  listDefiProtocols: () => api<DefiProtocol[]>("/crypto-intel/defi/protocols"),
  listYields: () => api<YieldOpportunity[]>("/crypto-intel/defi/yields"),
  listWallets: () => api<Wallet[]>("/crypto-intel/wallets"),
  listPortfolio: (walletId?: string) => api<PortfolioPosition[]>(`/crypto-intel/portfolio${walletId?`?walletId=${walletId}`:""}`),
  listAlerts: (severity?: string) => api<SecurityAlert[]>(`/crypto-intel/security/alerts${severity?`?severity=${severity}`:""}`),
  listStrategies: () => api<Strategy[]>("/crypto-intel/strategies"),
  listTrades: (state?: string) => api<TradeProposal[]>(`/crypto-intel/trades${state?`?state=${state}`:""}`),
  proposeTrade: (input: any) => api<TradeProposal>("/crypto-intel/trades", { method: "POST", json: input }),
  approveTrade: (id: string, approver?: string) => api<TradeProposal>(`/crypto-intel/trades/${id}/approve`, { method: "POST", json: { approver } }),
  rejectTrade: (id: string, reason: string) => api<TradeProposal>(`/crypto-intel/trades/${id}/reject`, { method: "POST", json: { reason } }),
  listExchanges: () => api<ExchangeConnector[]>("/crypto-intel/exchanges"),
};
