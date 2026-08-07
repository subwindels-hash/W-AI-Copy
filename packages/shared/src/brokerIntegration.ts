// WINDELS AI OS — Broker Integration Layer (single source of truth).
//
// An upgrade to the existing AI Trading Intelligence Engine (Session 81). It
// adds a unified Broker Integration Layer around MetaTrader 5 (MT5) and other
// broker ecosystems, plus AI trading modes, a trade execution supervisor,
// strategy management, portfolio intelligence, backtesting/simulation, and
// enterprise risk controls. It REUSES the existing RiskEngine, encryption util,
// Redis job pattern, and Kernel dispatch — it does not duplicate trading logic.

import { z } from "zod";

/* ── Broker / account ──────────────────────────────────────────── */

export const BROKER_TYPES = [
  "mt5", "mt5_simulator", "mt4", "ctrader", "fix", "rest", "websocket",
  // crypto exchanges (plug-in via same IBrokerConnector)
  "binance", "bybit", "okx", "coinbase", "kraken", "kucoin", "bitget",
  "gateio", "mexc", "htx", "cryptocom", "hyperliquid",
  // traditional markets (future plug-ins)
  "interactive_brokers", "alpaca", "tradestation", "oanda", "ig",
] as const;
export type BrokerType = (typeof BROKER_TYPES)[number];

/** Transport used by a broker connector. */
export const CONNECTOR_TRANSPORTS = ["native_python_zmq", "http_bridge", "metaapi_cloud", "exchange_rest", "exchange_ws", "ea", "simulator"] as const;
export type ConnectorTransport = (typeof CONNECTOR_TRANSPORTS)[number];

export const BROKER_CONNECTION_STATUS = ["disconnected", "connecting", "connected", "error", "requires_config", "syncing", "reconnecting"] as const;
export type BrokerConnectionStatus = (typeof BROKER_CONNECTION_STATUS)[number];

export const TRADING_MODES = ["analysis_only", "assisted", "semi_autonomous", "fully_autonomous"] as const;
export type TradingMode = (typeof TRADING_MODES)[number];

export const ACCOUNT_ENVIRONMENTS = ["demo", "live", "contest", "sandbox"] as const;
export type AccountEnvironment = (typeof ACCOUNT_ENVIRONMENTS)[number];

/** A connected broker account (credentials stored encrypted). */
export interface BrokerAccount {
  id: string;
  organizationId: string;
  name: string;
  broker: BrokerType;
  /** Broker platform display name. */
  brokerLabel: string;
  /** Account login / identifier (never the secret). */
  login: string;
  server: string;
  /** The platform trading mode assigned to this account. */
  mode: TradingMode;
  status: BrokerConnectionStatus;
  /** Real connector availability — honest `requires_config` when not configured. */
  connectedAt?: string;
  lastSyncAt?: string;
  lastTickAt?: string;
  error?: string;
  /** Transport actually used (native ZMQ bridge, MetaApi cloud, REST, etc.). */
  transport?: ConnectorTransport;
  /** Environment: demo / live / contest / sandbox. */
  environment?: AccountEnvironment;
  currency: string;
  leverage: number;
  /** Connector-specific configuration (encrypted when it contains secrets). */
  connectorConfig?: {
    /** Native MT5 ZMQ bridge endpoint, e.g. tcp://127.0.0.1:5555 */
    bridgeEndpoint?: string;
    /** MetaApi cloud account token (encrypted at rest). */
    metaapiToken?: string;
    /** Path to MT5 terminal (for Python bridge startup). */
    terminalPath?: string;
    /** Sync intervals. */
    syncIntervalMs?: number;
    tickStream?: boolean;
    /** Optional read-only flag (AI may never place orders). */
    readOnly?: boolean;
    /** Symbols allow/deny lists. */
    allowedSymbols?: string[];
    deniedSymbols?: string[];
  };
  /** Live (or last synced) account snapshot. */
  account: {
    balance: number;
    equity: number;
    margin: number;
    freeMargin: number;
    marginLevel?: number;
    profit: number;
    dailyPnl: number;
    credit?: number;
    tradeAllowed?: boolean;
    expertAllowed?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export const BrokerConnectorConfigSchema = z.object({
  bridgeEndpoint: z.string().max(200).optional(),
  metaapiToken: z.string().max(300).optional(),
  terminalPath: z.string().max(400).optional(),
  syncIntervalMs: z.coerce.number().int().min(500).max(3_600_000).optional(),
  tickStream: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  allowedSymbols: z.array(z.string().max(40)).max(500).optional(),
  deniedSymbols: z.array(z.string().max(40)).max(500).optional(),
}).default({});

export const CreateBrokerAccountSchema = z.object({
  name: z.string().min(1).max(120),
  broker: z.enum(BROKER_TYPES),
  login: z.string().min(1).max(80),
  server: z.string().min(1).max(120),
  /** Secret credentials — stored encrypted at rest, never returned. */
  password: z.string().min(1).max(200),
  mode: z.enum(TRADING_MODES).default("analysis_only"),
  currency: z.string().default("USD"),
  leverage: z.coerce.number().int().positive().default(100),
  environment: z.enum(ACCOUNT_ENVIRONMENTS).default("demo"),
  connectorConfig: BrokerConnectorConfigSchema.optional(),
});
export type CreateBrokerAccountInput = z.input<typeof CreateBrokerAccountSchema>;

export const UpdateBrokerAccountSchema = z.object({
  name: z.string().max(120).optional(),
  mode: z.enum(TRADING_MODES).optional(),
  connectorConfig: BrokerConnectorConfigSchema.optional(),
});
export type UpdateBrokerAccountInput = z.input<typeof UpdateBrokerAccountSchema>;

/* ── Positions / orders (synced from broker) ────────────────────── */

export interface BrokerPosition {
  id: string;
  accountId: string;
  /** Broker-native ticket id (MT5 POSITION_TICKET). */
  ticket?: string;
  symbol: string;
  side: "long" | "short";
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl?: number;
  tp?: number;
  openTime: string;
  /** Last update time on broker side. */
  updateTime?: string;
  profit: number;
  swap?: number;
  commission?: number;
  comment?: string;
  magic?: number;
  identifier?: number;
  reason?: string;
}

export interface BrokerPendingOrder {
  id: string;
  accountId: string;
  /** Broker-native order ticket. */
  ticket?: string;
  symbol: string;
  type: "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop" | "buy_stop_limit" | "sell_stop_limit";
  volume: number;
  price: number;
  sl?: number;
  tp?: number;
  openTime: string;
  expiryTime?: string;
  status: "active" | "filled" | "cancelled" | "expired" | "rejected" | "partial";
  filledVolume?: number;
  comment?: string;
  magic?: number;
}

/** Closed trades / deal history (MT5 deals). */
export interface BrokerDeal {
  id: string;
  accountId: string;
  ticket?: string;
  orderId?: string;
  symbol: string;
  side: "long" | "short";
  entry: "in" | "out" | "inout";
  volume: number;
  price: number;
  profit: number;
  swap?: number;
  commission?: number;
  fee?: number;
  time: string;
  comment?: string;
  magic?: number;
}

/** Symbol metadata from broker. */
export interface BrokerSymbol {
  name: string;
  description?: string;
  path?: string;
  /** Base / quote / margin currencies. */
  currencyBase?: string;
  currencyProfit?: string;
  currencyMargin?: string;
  digits: number;
  point: number;
  pipSize?: number;
  pipValue?: number;
  contractSize: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  spread?: number;
  spreadFloat?: boolean;
  stopsLevel?: number;
  freezeLevel?: number;
  tradeMode?: "full" | "closeonly" | "disabled";
  bid?: number;
  ask?: number;
  sessionClose?: string;
}

/** Tick data. */
export interface BrokerTick {
  symbol: string;
  time: string;
  bid: number;
  ask: number;
  last?: number;
  volume?: number;
  flags?: number;
}

/** OHLCV bar. */
export interface BrokerCandle {
  symbol: string;
  timeframe: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
  volume?: number;
  spread?: number;
}

/** Sync state for an account. */
export interface BrokerSyncState {
  accountId: string;
  status: BrokerConnectionStatus | "idle" | "syncing" | "error";
  lastSyncAt?: string;
  lastTickAt?: string;
  lastError?: string;
  consecutiveErrors: number;
  reconnectAttempts: number;
  symbolsCount: number;
  positionsCount: number;
  ordersCount: number;
  deals24h: number;
  latencyMs?: number;
}

/* ── Trade execution + supervisor ──────────────────────────────── */

export const TradeSignalSchema = z.object({
  accountId: z.string().min(1).max(64),
  symbol: z.string().min(1).max(40),
  side: z.enum(["long", "short"]),
  volume: z.number().positive(),
  /** Strategy key or manual signal source. */
  source: z.string().max(80).default("manual"),
  /** Reference to a strategy for attribution. */
  strategyId: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
  comment: z.string().max(200).optional(),
  /** Type of order to place with the broker. */
  orderType: z.enum(["market", "limit", "stop", "stop_limit"]).default("market"),
  price: z.number().positive().optional(),
  /** Magic number for MT5 Expert Advisor attribution. */
  magic: z.number().int().optional(),
  slippage: z.number().positive().optional(),
  /** If true, skip live broker send (paper path) even on a connected live account. */
  paper: z.boolean().optional(),
});
export type TradeSignalInput = z.input<typeof TradeSignalSchema>;

/** Order action sent directly to broker (post-approval). */
export const BrokerOrderRequestSchema = z.object({
  accountId: z.string().min(1).max(64),
  symbol: z.string().min(1).max(40),
  side: z.enum(["long", "short"]),
  type: z.enum(["market", "limit", "stop", "stop_limit"]).default("market"),
  volume: z.number().positive(),
  price: z.number().positive().optional(),
  stopLimitPrice: z.number().positive().optional(),
  sl: z.number().positive().optional(),
  tp: z.number().positive().optional(),
  comment: z.string().max(200).optional(),
  magic: z.number().int().optional(),
  slippage: z.number().int().min(0).max(1000).optional(),
  /** Time-in-force: GTC / IOC / FOK / DAY / SPECIFIED */
  tif: z.enum(["GTC", "IOC", "FOK", "DAY", "SPECIFIED"]).default("GTC"),
  expiry: z.string().datetime().optional(),
  positionTicket: z.string().optional(), // for close/modify
  action: z.enum(["open", "close", "modify", "cancel"]).default("open"),
});
export type BrokerOrderRequest = z.input<typeof BrokerOrderRequestSchema>;

export const TRADE_EXECUTION_STATUS = ["rejected", "pending_approval", "approved", "submitted", "filled", "partially_filled", "failed", "blocked", "cancelled"] as const;
export type TradeExecutionStatus = (typeof TRADE_EXECUTION_STATUS)[number];

export interface TradeExecution {
  id: string;
  organizationId: string;
  accountId: string;
  accountName: string;
  symbol: string;
  side: "long" | "short";
  volume: number;
  source: string;
  strategyId?: string;
  confidence: number;
  /** Mode at time of submission. */
  mode: TradingMode;
  status: TradeExecutionStatus;
  /** Supervisor decision: why allowed/blocked/needs-approval. */
  decision: string;
  riskChecks: { rule: string; pass: boolean; reason?: string }[];
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  /** Broker-native ticket id once sent. */
  brokerTicket?: string;
  /** Broker deal id once filled. */
  brokerDealId?: string;
  fillPrice?: number;
  filledVolume?: number;
  /** Human approver (assisted mode). */
  approvedBy?: string;
  error?: string;
  /** Audit trail: connector, latency. */
  connectorTransport?: ConnectorTransport;
  brokerLatencyMs?: number;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  filledAt?: string;
}

/* ── Strategy management ───────────────────────────────────────── */

export const STRATEGY_TYPES = ["rule", "ml", "rl", "hybrid"] as const;
export type StrategyType = (typeof STRATEGY_TYPES)[number];

export interface TradingStrategy {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  type: StrategyType;
  enabled: boolean;
  /** Rules (rule-based) or model descriptor. */
  logic: Record<string, any>;
  /** Assigned broker account ids. */
  accountIds: string[];
  /** Version history. */
  versions: { version: number; name: string; at: string; note?: string }[];
  currentVersion: number;
  /** Real backtest/paper results (measured, not invented). */
  backtest?: { winRate: number; trades: number; totalReturnPct: number; maxDrawdownPct: number; at: string };
  paper?: { trades: number; winRate: number; pnl: number; at: string };
  createdAt: string;
  updatedAt: string;
}

export const CreateStrategySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  type: z.enum(STRATEGY_TYPES).default("rule"),
  logic: z.record(z.any()).default({}),
  accountIds: z.array(z.string()).default([]),
});
export type CreateStrategyInput = z.input<typeof CreateStrategySchema>;

/* ── Risk controls ─────────────────────────────────────────────── */

export interface BrokerRiskControls {
  maxDailyLossPct: number;
  maxWeeklyLossPct: number;
  maxMonthlyLossPct: number;
  maxPositionSizeUsd: number;
  maxExposurePct: number;
  maxDrawdownPct: number;
  maxLeverage: number;
  tradingSessionStart: string; // "HH:MM"
  tradingSessionEnd: string;
  blockNewsEvents: boolean;
  /** Emergency stop: when true, all new trade execution is halted. */
  killSwitch: boolean;
  updatedAt: string;
}

export const DEFAULT_RISK_CONTROLS: Omit<BrokerRiskControls, "updatedAt"> = {
  maxDailyLossPct: 3,
  maxWeeklyLossPct: 5,
  maxMonthlyLossPct: 8,
  maxPositionSizeUsd: 100_000,
  maxExposurePct: 20,
  maxDrawdownPct: 10,
  maxLeverage: 200,
  tradingSessionStart: "00:00",
  tradingSessionEnd: "23:59",
  blockNewsEvents: false,
  killSwitch: false,
};

export const UpdateRiskControlsSchema = z.object({
  maxDailyLossPct: z.number().min(0).max(100).optional(),
  maxWeeklyLossPct: z.number().min(0).max(100).optional(),
  maxMonthlyLossPct: z.number().min(0).max(100).optional(),
  maxPositionSizeUsd: z.number().nonnegative().optional(),
  maxExposurePct: z.number().min(0).max(100).optional(),
  maxDrawdownPct: z.number().min(0).max(100).optional(),
  maxLeverage: z.number().positive().optional(),
  tradingSessionStart: z.string().optional(),
  tradingSessionEnd: z.string().optional(),
  blockNewsEvents: z.boolean().optional(),
  killSwitch: z.boolean().optional(),
});
export type UpdateRiskControlsInput = z.input<typeof UpdateRiskControlsSchema>;

/* ── Portfolio intelligence ────────────────────────────────────── */

export interface PortfolioIntelligence {
  accountId?: string;
  totalEquity: number;
  allocated: Record<string, number>;
  exposureBySymbol: Record<string, number>;
  exposureByAssetClass: Record<string, number>;
  currencyExposure: Record<string, number>;
  correlation: { symbolA: string; symbolB: string; corr: number }[];
  diversificationScore: number; // 0..1
  attribution: { symbol: string; pnl: number; contributionPct: number }[];
  concentrationRisk: { symbol: string; weightPct: number; flag: string }[];
  recommendations: string[];
}

/* ── Command center dashboard ──────────────────────────────────── */

export interface TradingCommandCenter {
  accounts: BrokerAccount[];
  totalEquity: number;
  totalBalance: number;
  openPositions: BrokerPosition[];
  pendingOrders: BrokerPendingOrder[];
  activeStrategies: number;
  tradeConfidence: number;
  portfolioRisk: { exposureUsd: number; exposurePct: number; dailyPnL: number; drawdownPct: number };
  riskControls: BrokerRiskControls;
  recentExecutions: TradeExecution[];
  aiRecommendations: string[];
  systemHealth: { brokerConnected: number; brokerTotal: number; ffmpeg: boolean; lastSyncAt?: string; eaConnected?: number; eaTotal?: number };
}

/* ── AI Broker Trading agents (chat-routable workforce) ────────── */

export type BrokerAgentKey =
  | "trade-execution-supervisor"
  | "strategy-optimizer"
  | "portfolio-risk"
  | "broker-connectivity"
  | "trade-validator"
  | "trading-compliance";

export interface BrokerTradingAgent {
  key: BrokerAgentKey;
  name: string;
  description: string;
  /** Chat-routable: the agent can be invoked with a natural-language/structured task. */
  routable: true;
  status: "online" | "paused";
  lastHeartbeat: string;
  runs24h: number;
  decisions24h: number;
  blocked24h: number;
}

/** Structured input for the supervisor agent's signal validation. */
export const SupervisorValidateSchema = z.object({
  accountId: z.string().min(1).max(64),
  symbol: z.string().min(1).max(40),
  side: z.enum(["long", "short"]),
  volume: z.number().positive(),
  source: z.string().max(80).default("agent"),
  strategyId: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
});

/* ── Connect / disconnect / sync control ───────────────────────── */

export const ConnectAccountSchema = z.object({
  /** Force reconnection even if already connected. */
  force: z.boolean().default(false),
  /** Optional override: transport to use. */
  transport: z.enum(CONNECTOR_TRANSPORTS).optional(),
});

export const SyncAccountSchema = z.object({
  /** What to sync; defaults to all. */
  scope: z.array(z.enum(["account", "symbols", "positions", "orders", "history"])).default(["account", "symbols", "positions", "orders", "history"]),
  /** History window (days back). */
  historyDays: z.coerce.number().int().min(1).max(3650).default(30),
});

export const BrokerOrderActionSchema = z.object({
  action: z.enum(["open", "close", "modify", "cancel"]),
  ticket: z.string().optional(),
  request: BrokerOrderRequestSchema.optional(),
});

export const TickQuerySchema = z.object({
  symbols: z.array(z.string()).min(1).max(100),
});

export const CandleQuerySchema = z.object({
  symbol: z.string().min(1).max(40),
  timeframe: z.enum(["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"]).default("H1"),
  count: z.coerce.number().int().min(1).max(2000).default(100),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
});

export const HistoryQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  days: z.coerce.number().int().min(1).max(3650).default(30),
  symbol: z.string().max(40).optional(),
  group: z.string().max(40).optional(),
});

/* ── Connector health ──────────────────────────────────────────── */

export interface ConnectorHealth {
  broker: BrokerType;
  transport: ConnectorTransport;
  accountId: string;
  connected: boolean;
  latencyMs?: number;
  lastError?: string;
  reconnectAttempts: number;
  lastConnectAt?: string;
  lastDisconnectAt?: string;
  /** ZMQ / HTTP / cloud endpoint actually in use. */
  endpoint?: string;
  /** Terminal path (native MT5). */
  terminalPath?: string;
}

/* ── Id params ─────────────────────────────────────────────────── */

export const BrokerIdSchema = z.object({ id: z.string().min(1).max(64) });
export const StrategyIdSchema = z.object({ id: z.string().min(1).max(64) });
