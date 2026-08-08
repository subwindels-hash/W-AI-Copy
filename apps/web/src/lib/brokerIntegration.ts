/** WINDELS AI OS — Broker Integration Layer client (Trading Intel upgrade). */
import { api } from "./api";

export type BrokerType =
  | "mt5" | "mt4" | "ctrader" | "fix" | "rest" | "websocket"
  | "binance" | "bybit" | "okx" | "coinbase" | "kraken" | "kucoin" | "bitget"
  | "gateio" | "mexc" | "htx" | "cryptocom" | "hyperliquid"
  | "interactive_brokers" | "alpaca" | "tradestation" | "oanda" | "ig";

export type BrokerConnectionStatus = "disconnected" | "connecting" | "connected" | "error" | "requires_config" | "syncing" | "reconnecting";
export type ConnectorTransport = "native_python_zmq" | "http_bridge" | "metaapi_cloud" | "exchange_rest" | "exchange_ws" | "ea";
export type TradingMode = "analysis_only" | "assisted" | "semi_autonomous" | "fully_autonomous";
export type TradeExecutionStatus = "submitted" | "pending_approval" | "approved" | "filled" | "failed" | "blocked" | "rejected";
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
  transport?: ConnectorTransport;
  environment?: "demo" | "live" | "contest" | "sandbox";
  connectedAt?: string;
  lastSyncAt?: string;
  error?: string;
  currency: string;
  leverage: number;
  /** Most recent observed connector latency in ms (REST RTT or WS round trip). */
  latencyMs?: number;
  /** Count of consecutive connector/sync errors since last successful sync. */
  consecutiveErrors?: number;
  /** ISO timestamp of the last recorded connector error (for "X ago" sublabel). */
  lastErrorAt?: string;
  account: { balance: number; equity: number; margin: number; freeMargin: number; profit: number; dailyPnl: number; marginLevel?: number; credit?: number };
  connectorConfig?: { allowedSymbols?: string[]; deniedSymbols?: string[]; readOnly?: boolean };
  createdAt: string;
  updatedAt: string;
}

export interface BrokerPosition {
  id: string; ticket?: string; accountId: string; symbol: string; side: "long" | "short";
  volume: number; openPrice: number; currentPrice: number; sl?: number; tp?: number;
  openTime: string; profit: number; swap?: number; commission?: number; magic?: number;
}

export interface BrokerPendingOrder {
  id: string; ticket?: string; accountId: string; symbol: string;
  type: "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop" | "buy_stop_limit" | "sell_stop_limit";
  volume: number; price: number; sl?: number; tp?: number; openTime: string; status: string;
  comment?: string; magic?: number;
}

export interface BrokerDeal {
  id: string; ticket?: string; orderId?: string; accountId: string; symbol: string;
  side: "long" | "short"; entry: "in" | "out" | "inout"; volume: number; price: number;
  profit: number; swap?: number; commission?: number; time: string; comment?: string;
}

export interface TradeExecution {
  id: string; organizationId: string; accountId: string; accountName: string;
  symbol: string; side: "long" | "short"; volume: number; source: string;
  strategyId?: string; confidence: number; mode: TradingMode; status: TradeExecutionStatus;
  decision: string; riskChecks: { rule: string; pass: boolean; reason?: string }[];
  price?: number; stopLoss?: number; takeProfit?: number; brokerTicket?: string;
  brokerDealId?: string; fillPrice?: number; filledVolume?: number;
  approvedBy?: string; error?: string; connectorTransport?: ConnectorTransport;
  createdAt: string; updatedAt: string;
}

export interface EaSummary {
  eaId: string; brokerAccountId: string; magic: number; terminalName: string;
  mt5Login: string; connected: boolean; lastPollAt?: string; createdAt: string;
}

export interface TradingStrategy {
  id: string; name: string; description: string; type: StrategyType; enabled: boolean;
  logic: Record<string, any>; accountIds: string[]; currentVersion: number;
  backtest?: { winRate: number; trades: number; totalReturnPct: number; maxDrawdownPct: number; at: string };
  createdAt: string; updatedAt: string;
}

export interface BrokerRiskControls {
  maxDailyLossPct: number; maxWeeklyLossPct: number; maxMonthlyLossPct: number;
  maxPositionSizeUsd: number; maxExposurePct: number; maxDrawdownPct: number; maxLeverage: number;
  tradingSessionStart: string; tradingSessionEnd: string; blockNewsEvents: boolean; killSwitch: boolean;
  /** When true, blocks fully_autonomous/semi_autonomous signals; manual + assisted-approval still work. */
  pauseAutonomousTrading: boolean;
  updatedAt: string;
}

export interface PortfolioIntelligence {
  accountId?: string; totalEquity: number; allocated: Record<string, number>;
  exposureBySymbol: Record<string, number>; exposureByAssetClass: Record<string, number>;
  currencyExposure: Record<string, number>;
  correlation: { symbolA: string; symbolB: string; corr: number }[];
  diversificationScore: number;
  attribution: { symbol: string; pnl: number; contributionPct: number }[];
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
  systemHealth: { brokerConnected: number; brokerTotal: number; eaConnected: number; eaTotal: number; lastSyncAt?: string };
}

/** Phase 21 — Structured connector error entry for the recent-errors panel. */
export interface ConnectorErrorEntry {
  at: string;
  message: string;
  category: "rest" | "ws" | "auth" | "sync" | "order" | "rate_limit" | "network" | "unknown";
}

/** Phase 21 — Per-connector error history aggregated for the dashboard. */
export interface ConnectorErrorGroup {
  broker: string;
  label: string;
  accountId: string;
  errors: ConnectorErrorEntry[];
}

export interface DashboardSummary {
  generatedAt: string;
  accounts: BrokerAccount[];
  positions: BrokerPosition[];
  orders: BrokerPendingOrder[];
  executions: TradeExecution[];
  deals: BrokerDeal[];
  strategies: TradingStrategy[];
  eas: EaSummary[];
  risk: BrokerRiskControls;
  portfolio: PortfolioIntelligence;
  health: { connectedAccounts: number; totalAccounts: number; connectedEas: number; totalEas: number; recentErrors: number; uptimePct: number };
  pnl: { today: number; week: number; month: number; allTime: number };
  winRate: { day: number; week: number };
  connectors: { broker: string; label: string; available: boolean; transport?: string }[];
  /** Phase 21 — per-connector recent error history. */
  recentErrorsByConnector: ConnectorErrorGroup[];
}

export type BrokerAgentKey = "trade-execution-supervisor" | "strategy-optimizer" | "portfolio-risk" | "broker-connectivity" | "trade-validator" | "trading-compliance";

export interface BrokerTradingAgent {
  key: BrokerAgentKey; name: string; description: string;
  status: "online" | "paused"; lastHeartbeat: string;
  runs24h: number; decisions24h: number; blocked24h: number;
}

export const BROKER_TYPES: { value: BrokerType; label: string }[] = [
  // Forex / CFDs — connect to your own external broker account via official API
  { value: "mt5", label: "MetaTrader 5" },
  { value: "mt4", label: "MetaTrader 4" },
  { value: "ctrader", label: "cTrader" },
  // Crypto — connect to your own exchange account via official API
  { value: "binance", label: "Binance" },
  { value: "bybit", label: "Bybit" },
  { value: "okx", label: "OKX" },
  { value: "coinbase", label: "Coinbase" },
  { value: "kraken", label: "Kraken" },
  { value: "kucoin", label: "KuCoin" },
  { value: "bitget", label: "Bitget" },
  { value: "gateio", label: "Gate.io" },
  { value: "mexc", label: "MEXC" },
  { value: "htx", label: "HTX (Huobi)" },
  { value: "cryptocom", label: "Crypto.com" },
  { value: "hyperliquid", label: "Hyperliquid" },
  // Traditional markets
  { value: "interactive_brokers", label: "Interactive Brokers" },
  { value: "alpaca", label: "Alpaca" },
  { value: "tradestation", label: "TradeStation" },
  { value: "oanda", label: "OANDA" },
  { value: "ig", label: "IG" },
  // Generic (future)
  { value: "fix", label: "FIX Protocol" },
  { value: "rest", label: "REST Broker API" },
  { value: "websocket", label: "WebSocket Broker API" },
];

/** Paper/demo note: WINDELS does NOT hold funds or run an internal simulator.
 *  Paper trading uses the broker/exchange's own demo/testnet accounts. */

export const TRADING_MODES: { value: TradingMode; label: string; blurb: string }[] = [
  { value: "analysis_only", label: "Analysis Only", blurb: "Analyze + recommend, never execute." },
  { value: "assisted", label: "Assisted", blurb: "Prepare trades, user approves before execution." },
  { value: "semi_autonomous", label: "Semi-Autonomous", blurb: "Execute within user-defined rules." },
  { value: "fully_autonomous", label: "Fully Autonomous", blurb: "Execute + manage under governance limits." },
];

export const brokerApi = {
  connectors: () => api<{ catalog: any[]; live: { broker: string; label: string; transports: string[]; available: boolean; reason?: string }[] }>("/brokers/connectors"),
  accounts: () => api<BrokerAccount[]>("/brokers/accounts"),
  createAccount: (input: { name: string; broker: BrokerType; login: string; server: string; password: string; mode?: TradingMode; currency?: string; leverage?: number; environment?: "demo" | "live" | "contest" | "sandbox" }) =>
    api<BrokerAccount>("/brokers/accounts", { method: "POST", json: input }),
  updateAccount: (id: string, patch: { name?: string; mode?: TradingMode; connectorConfig?: { readOnly?: boolean; allowedSymbols?: string[]; deniedSymbols?: string[] } }) =>
    api<BrokerAccount>(`/brokers/accounts/${id}`, { method: "PATCH", json: patch }),
  removeAccount: (id: string) => api<void>(`/brokers/accounts/${id}`, { method: "DELETE" }),
  verify: (id: string) => api<{ valid: boolean; login: string }>(`/brokers/accounts/${id}/verify`, { method: "POST" }),
  connect: (id: string, opts: { force?: boolean; transport?: ConnectorTransport } = {}) =>
    api<BrokerAccount>(`/brokers/accounts/${id}/connect`, { method: "POST", json: opts }),
  disconnect: (id: string) => api<BrokerAccount>(`/brokers/accounts/${id}/disconnect`, { method: "POST" }),
  sync: (id: string, scope: string[] = ["account","symbols","positions","orders","history"]) =>
    api<BrokerAccount>(`/brokers/accounts/${id}/sync`, { method: "POST", json: { scope } }),
  health: (id: string) => api<{ health: any; state: any }>(`/brokers/accounts/${id}/health`),
  positions: (id: string) => api<BrokerPosition[]>(`/brokers/accounts/${id}/positions`),
  orders: (id: string) => api<BrokerPendingOrder[]>(`/brokers/accounts/${id}/orders`),
  symbols: (id: string) => api<any[]>(`/brokers/accounts/${id}/symbols`),
  deals: (id: string, params: { days?: number; symbol?: string } = {}) =>
    api<BrokerDeal[]>(`/brokers/accounts/${id}/deals`, { params }),
  closePosition: (id: string, ticket: string, volume?: number) =>
    api<TradeExecution>(`/brokers/accounts/${id}/positions/${ticket}/close`, { method: "POST", json: { volume } }),
  modifyPosition: (id: string, ticket: string, patch: { sl?: number; tp?: number }) =>
    api<TradeExecution>(`/brokers/accounts/${id}/positions/${ticket}`, { method: "PATCH", json: patch }),
  cancelOrder: (id: string, orderId: string) =>
    api<TradeExecution>(`/brokers/accounts/${id}/orders/${orderId}/cancel`, { method: "POST" }),
  sendOrder: (id: string, order: { symbol: string; side: "long" | "short"; volume: number; type?: string; price?: number; sl?: number; tp?: number; slippage?: number; comment?: string; magic?: number }) =>
    api<TradeExecution>(`/brokers/accounts/${id}/orders`, { method: "POST", json: order }),
  trade: (signal: { accountId: string; symbol: string; side: "long" | "short"; volume: number; source?: string; strategyId?: string; confidence?: number; stopLoss?: number; takeProfit?: number; price?: number; orderType?: string; slippage?: number }) =>
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
  demoPreset: () => api<{ account: BrokerAccount; risk: BrokerRiskControls; strategy: TradingStrategy; instructions: Array<{step:number;title:string;detail:string;warning?:string}> }>("/brokers/demo-preset", { method: "POST" }),
  demoInstructions: () => api<{ instructions: Array<{step:number;title:string;detail:string;warning?:string}>; disclaimer: string }>("/brokers/demo-preset/instructions"),
  pauseAutonomous: (paused: boolean) => api<BrokerRiskControls>("/brokers/risk", { method: "PATCH", json: { pauseAutonomousTrading: paused } }),
  portfolio: (accountId?: string) => api<PortfolioIntelligence>("/brokers/portfolio", accountId ? { params: { accountId } } : {}),
  commandCenter: () => api<TradingCommandCenter>("/brokers/command-center"),
  dashboard: () => api<DashboardSummary>("/brokers/dashboard"),
  /** Phase 21 — dedicated recent-errors endpoint (alternative to dashboard rollup). */
  recentErrors: (limit = 10) => api<ConnectorErrorGroup[]>("/brokers/recent-errors", { params: { limit } }),
  agents: () => api<BrokerTradingAgent[]>("/brokers/agents"),
  runAgent: (key: string, payload?: Record<string, any>) => api<{ agent: string; verdict: string; detail: string; data?: any }>(`/brokers/agents/${key}/run`, { method: "POST", json: payload ?? {} }),
  detailedHealth: () => api<Array<{accountId:string;name:string;broker:string;state:string;connected:boolean;reason?:string;latencyMs?:number}>>("/brokers/health/detailed"),
  backtestHistory: (body:{symbol:string;timeframe:string;startDate:string;endDate:string;strategyId?:string;riskPct?:number}) => api<{symbol:string;timeframe:string;candles:any[];backtest?:any;labels:string[];disclaimer:string}>("/brokers/backtest/history",{method:"POST", json: body}),
  pnlSparkline: (period?:string) => api<{period:string;points:Array<{t:string;equity:number;balance:number;floatingPnL:number}>;reason?:string;label:string}>(`/brokers/pnl/sparkline${period?`?period=${period}`:""}`),
  eas: () => api<EaSummary[]>("/ea"),
  revokeEa: (eaId: string) => api<void>(`/ea/${eaId}`, { method: "DELETE" }),
  audit: (limit = 100) => api<any[]>("/brokers/audit", { params: { limit } }),
};
