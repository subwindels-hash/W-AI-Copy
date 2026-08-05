/** WINDELS AI OS — Broker Integration Layer client (Trading Intel upgrade). */
import { api } from "./api";

export type BrokerType = "mt5" | "mt4" | "fix" | "rest" | "websocket" | "crypto";
export type BrokerConnectionStatus = "disconnected" | "connecting" | "connected" | "error" | "requires_config";
export type TradingMode = "analysis_only" | "assisted" | "semi_autonomous" | "fully_autonomous";
export type TradeExecutionStatus = "rejected" | "pending_approval" | "approved" | "submitted" | "filled" | "failed" | "blocked";
export type StrategyType = "rule" | "ml" | "rl" | "hybrid";

export interface BrokerAccount {
  id: string;
  organizationId: string;
  name: string;
  broker: BrokerType;
  brokerLabel: string;
  login: string;
  server: string;
  mode: TradingMode;
  status: BrokerConnectionStatus;
  connectedAt?: string;
  error?: string;
  currency: string;
  leverage: number;
  account: { balance: number; equity: number; margin: number; freeMargin: number; profit: number; dailyPnl: number };
  createdAt: string;
  updatedAt: string;
}

export interface BrokerPosition {
  id: string; accountId: string; symbol: string; side: "long" | "short"; volume: number;
  openPrice: number; currentPrice: number; sl?: number; tp?: number; openTime: string; profit: number;
}

export interface BrokerPendingOrder {
  id: string; accountId: string; symbol: string; type: string; volume: number;
  price: number; sl?: number; tp?: number; openTime: string; status: string;
}

export interface TradeExecution {
  id: string; organizationId: string; accountId: string; accountName: string;
  symbol: string; side: "long" | "short"; volume: number; source: string;
  strategyId?: string; confidence: number; mode: TradingMode; status: TradeExecutionStatus;
  decision: string; riskChecks: { rule: string; pass: boolean; reason?: string }[];
  price?: number; stopLoss?: number; takeProfit?: number; approvedBy?: string; error?: string;
  createdAt: string; updatedAt: string;
}

export interface TradingStrategy {
  id: string; organizationId: string; name: string; description: string; type: StrategyType;
  enabled: boolean; logic: Record<string, any>; accountIds: string[];
  versions: { version: number; name: string; at: string; note?: string }[];
  currentVersion: number;
  backtest?: { winRate: number; trades: number; totalReturnPct: number; maxDrawdownPct: number; at: string };
  paper?: { trades: number; winRate: number; pnl: number; at: string };
  createdAt: string; updatedAt: string;
}

export interface BrokerRiskControls {
  maxDailyLossPct: number; maxWeeklyLossPct: number; maxMonthlyLossPct: number;
  maxPositionSizeUsd: number; maxExposurePct: number; maxDrawdownPct: number; maxLeverage: number;
  tradingSessionStart: string; tradingSessionEnd: string; blockNewsEvents: boolean; killSwitch: boolean; updatedAt: string;
}

export interface PortfolioIntelligence {
  accountId?: string; totalEquity: number; allocated: Record<string, number>;
  exposureBySymbol: Record<string, number>; exposureByAssetClass: Record<string, number>;
  currencyExposure: Record<string, number>;
  correlation: { symbolA: string; symbolB: string; corr: number }[];
  diversificationScore: number; attribution: { symbol: string; pnl: number; contributionPct: number }[];
  concentrationRisk: { symbol: string; weightPct: number; flag: string }[];
  recommendations: string[];
}

export interface TradingCommandCenter {
  accounts: BrokerAccount[]; totalEquity: number; totalBalance: number;
  openPositions: BrokerPosition[]; pendingOrders: BrokerPendingOrder[];
  activeStrategies: number; tradeConfidence: number;
  portfolioRisk: { exposureUsd: number; exposurePct: number; dailyPnL: number; drawdownPct: number };
  riskControls: BrokerRiskControls; recentExecutions: TradeExecution[];
  aiRecommendations: string[];
  systemHealth: { brokerConnected: number; brokerTotal: number; ffmpeg: boolean; lastSyncAt?: string };
}

export type BrokerAgentKey = "trade-execution-supervisor" | "strategy-optimizer" | "portfolio-risk" | "broker-connectivity" | "trade-validator" | "trading-compliance";

export interface BrokerTradingAgent {
  key: BrokerAgentKey;
  name: string;
  description: string;
  routable: true;
  status: "online" | "paused";
  lastHeartbeat: string;
  runs24h: number;
  decisions24h: number;
  blocked24h: number;
}

export const BROKER_TYPES: { value: BrokerType; label: string }[] = [
  { value: "mt5", label: "MetaTrader 5" },
  { value: "mt4", label: "MetaTrader 4" },
  { value: "fix", label: "FIX Protocol" },
  { value: "rest", label: "REST Broker API" },
  { value: "websocket", label: "WebSocket Broker API" },
  { value: "crypto", label: "Cryptocurrency Exchange" },
];

export const TRADING_MODES: { value: TradingMode; label: string; blurb: string }[] = [
  { value: "analysis_only", label: "Analysis Only", blurb: "Analyze + recommend, never execute." },
  { value: "assisted", label: "Assisted", blurb: "Prepare trades, user approves before execution." },
  { value: "semi_autonomous", label: "Semi-Autonomous", blurb: "Execute within user-defined rules." },
  { value: "fully_autonomous", label: "Fully Autonomous", blurb: "Execute + manage under governance limits." },
];

export const brokerApi = {
  connectors: () => api<{ broker: string; name: string; protocol: string; requiresConfig: boolean }[]>("/brokers/connectors"),
  accounts: () => api<BrokerAccount[]>("/brokers/accounts"),
  createAccount: (input: { name: string; broker: BrokerType; login: string; server: string; password: string; mode?: TradingMode; currency?: string; leverage?: number }) =>
    api<BrokerAccount>("/brokers/accounts", { method: "POST", json: input }),
  updateAccount: (id: string, patch: { name?: string; mode?: TradingMode }) =>
    api<BrokerAccount>(`/brokers/accounts/${id}`, { method: "PATCH", json: patch }),
  removeAccount: (id: string) => api<void>(`/brokers/accounts/${id}`, { method: "DELETE" }),
  verify: (id: string) => api<{ valid: boolean; login: string }>(`/brokers/accounts/${id}/verify`, { method: "POST" }),
  positions: (id: string) => api<BrokerPosition[]>(`/brokers/accounts/${id}/positions`),
  orders: (id: string) => api<BrokerPendingOrder[]>(`/brokers/accounts/${id}/orders`),
  trade: (signal: { accountId: string; symbol: string; side: "long" | "short"; volume: number; source?: string; strategyId?: string; confidence?: number; stopLoss?: number; takeProfit?: number }) =>
    api<TradeExecution>("/brokers/trade", { method: "POST", json: signal }),
  executions: () => api<TradeExecution[]>("/brokers/executions"),
  approve: (id: string) => api<TradeExecution>(`/brokers/executions/${id}/approve`, { method: "POST" }),
  reject: (id: string) => api<TradeExecution>(`/brokers/executions/${id}/reject`, { method: "POST" }),
  strategies: () => api<TradingStrategy[]>("/brokers/strategies"),
  createStrategy: (input: { name: string; description?: string; type?: StrategyType; logic?: Record<string, any>; accountIds?: string[] }) =>
    api<TradingStrategy>("/brokers/strategies", { method: "POST", json: input }),
  toggleStrategy: (id: string, enabled: boolean) => api<TradingStrategy>(`/brokers/strategies/${id}/toggle`, { method: "POST", json: { enabled } }),
  backtest: (id: string) => api<TradingStrategy>(`/brokers/strategies/${id}/backtest`, { method: "POST" }),
  removeStrategy: (id: string) => api<void>(`/brokers/strategies/${id}`, { method: "DELETE" }),
  risk: () => api<BrokerRiskControls>("/brokers/risk"),
  updateRisk: (patch: Partial<BrokerRiskControls>) => api<BrokerRiskControls>("/brokers/risk", { method: "PATCH", json: patch }),
  killSwitch: (active: boolean) => api<BrokerRiskControls>("/brokers/risk/kill-switch", { method: "POST", json: { active } }),
  portfolio: (accountId?: string) => api<PortfolioIntelligence>("/brokers/portfolio", accountId ? { params: { accountId } } : {}),
  commandCenter: () => api<TradingCommandCenter>("/brokers/command-center"),
  agents: () => api<BrokerTradingAgent[]>("/brokers/agents"),
  runAgent: (key: string, payload?: Record<string, any>) => api<{ agent: string; verdict: string; detail: string; data?: any }>(`/brokers/agents/${key}/run`, { method: "POST", json: payload ?? {} }),
};
