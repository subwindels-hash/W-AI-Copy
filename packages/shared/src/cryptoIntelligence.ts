/**
 * Shared types — Enterprise Cryptocurrency Intelligence & Trading Workforce (Phase 34 / Session 35)
 * OPT-IN MODULE — disabled by default; requires explicit org enable flag.
 * All trading actions route through the Enterprise Governance Kernel and Human Approval.
 *
 * Slices covered:
 *   295 — Blockchain & Market Intelligence
 *   296 — DeFi Intelligence
 *   297 — Portfolio & Security Intelligence
 *   298 — Trading Intelligence & Execution
 *   299 — Exchange & Infrastructure Integration
 */

export type CiModuleStatus = "disabled" | "enabled-readonly" | "enabled-paper" | "enabled-live";
export type TradeSide = "buy" | "sell";
export type TradeState = "proposed" | "governance-review" | "approved" | "rejected" | "submitted" | "filled" | "failed" | "canceled";
export type OrderType = "market" | "limit" | "stop-loss" | "take-profit";
export type RiskLevel = "low" | "medium" | "high" | "extreme";

// Common
export interface CiDashboard {
  moduleEnabled: boolean;
  moduleStatus: CiModuleStatus;
  chains: number;
  chainsLive: number;
  marketsTracked: number;
  defiProtocols: number;
  walletsTracked: number;
  portfolioValueUsd: number;
  portfolioPnl24hUsd: number;
  openPositions: number;
  openOrders: number;
  riskAlerts: number;
  approvalsPending: number;
  tradesExecuted24h: number;
  exchangeConnectors: number;
  exchangesConnected: number;
  note: string;
}

// Slice 295 — Blockchain & Market Intelligence
export interface ChainMonitor {
  id: string;
  chain: string;
  status: "online" | "degraded" | "offline";
  blockHeight: number;
  tps: number;
  gasToken: string;
  gasPriceGwei: number;
  validators: number;
  stakedPct: number;
  lastBlockAt: string;
}
export interface MarketTicker {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number;
  volume24hUsd: number;
  marketCapUsd: number;
  volatility30d: number;
  sentiment: "bearish" | "neutral" | "bullish";
  liquidityUsd: number;
}

// Slice 296 — DeFi Intelligence
export interface DefiProtocol {
  id: string;
  name: string;
  chain: string;
  category: "dex" | "lending" | "yield" | "derivatives" | "bridge" | "staking" | "restaking";
  tvlUsd: number;
  apy: number;
  riskScore: number; // 0..100 higher = riskier
  audited: boolean;
  hacked24m: boolean;
}
export interface YieldOpportunity {
  id: string;
  protocolId: string;
  asset: string;
  apy: number;
  tvlUsd: number;
  impermanentLossRisk: RiskLevel;
  lockupDays: number;
}

// Slice 297 — Portfolio & Security Intelligence
export interface Wallet {
  id: string;
  label: string;
  address: string;
  chain: string;
  balanceUsd: number;
  tags: string[];
  riskScore: number;
  lastActivity: string;
}
export interface PortfolioPosition {
  id: string;
  walletId: string;
  asset: string;
  amount: number;
  priceUsd: number;
  valueUsd: number;
  pnl24hUsd: number;
  allocationPct: number;
}
export interface SecurityAlert {
  id: string;
  severity: RiskLevel;
  category: "rug-pull" | "scam" | "anomaly" | "wallet-risk" | "governance-risk" | "rug-pull-detected";
  title: string;
  detail: string;
  relatedEntity?: string;
  detectedAt: string;
}

// Slice 298 — Trading Intelligence & Execution
export interface TradeProposal {
  id: string;
  side: TradeSide;
  symbol: string;
  orderType: OrderType;
  amountUsd?: number;
  amountAsset?: number;
  limitPrice?: number;
  reason: string;
  confidence: number;
  riskLevel: RiskLevel;
  expectedSlippagePct?: number;
  strategyId?: string;
  proposedAt: string;
  state: TradeState;
  approvalsRequired: number;
  approvalsReceived: number;
  approvedBy?: string[];
  rejectReason?: string;
  executedAt?: string;
  exchangeId?: string;
  fillPrice?: number;
}
export interface Strategy {
  id: string;
  name: string;
  kind: "arbitrage" | "trend" | "mean-reversion" | "market-making" | "rebalance";
  enabled: boolean;
  maxPositionUsd: number;
  dailyLossLimitUsd: number;
  winRate: number;
  pnl30dUsd: number;
}

// Slice 299 — Exchange & Infrastructure Integration
export interface ExchangeConnector {
  id: string;
  name: string;
  kind: "cex" | "dex" | "wallet" | "data-provider";
  status: "disconnected" | "connected" | "readonly" | "trade-enabled";
  authMethod: "api-key" | "oauth" | "wallet-connect" | "mTLS";
  requiresGovernance: boolean;
  lastSyncAt?: string;
}
