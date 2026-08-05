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

export const BROKER_TYPES = ["mt5", "mt4", "fix", "rest", "websocket", "crypto"] as const;
export type BrokerType = (typeof BROKER_TYPES)[number];

export const BROKER_CONNECTION_STATUS = ["disconnected", "connecting", "connected", "error", "requires_config"] as const;
export type BrokerConnectionStatus = (typeof BROKER_CONNECTION_STATUS)[number];

export const TRADING_MODES = ["analysis_only", "assisted", "semi_autonomous", "fully_autonomous"] as const;
export type TradingMode = (typeof TRADING_MODES)[number];

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
  error?: string;
  currency: string;
  leverage: number;
  /** Live (or last synced) account snapshot. */
  account: {
    balance: number;
    equity: number;
    margin: number;
    freeMargin: number;
    profit: number;
    dailyPnl: number;
  };
  createdAt: string;
  updatedAt: string;
}

export const CreateBrokerAccountSchema = z.object({
  name: z.string().min(1).max(120),
  broker: z.enum(BROKER_TYPES),
  login: z.string().min(1).max(80),
  server: z.string().min(1).max(120),
  /** Secret credentials — stored encrypted at rest, never returned. */
  password: z.string().min(1).max(200),
  mode: z.enum(TRADING_MODES).default("analysis_only"),
  currency: z.string().default("USD"),
  leverage: z.number().int().positive().default(100),
});
export type CreateBrokerAccountInput = z.input<typeof CreateBrokerAccountSchema>;

export const UpdateBrokerAccountSchema = z.object({
  name: z.string().max(120).optional(),
  mode: z.enum(TRADING_MODES).optional(),
});
export type UpdateBrokerAccountInput = z.input<typeof UpdateBrokerAccountSchema>;

/* ── Positions / orders (synced from broker) ────────────────────── */

export interface BrokerPosition {
  id: string;
  accountId: string;
  symbol: string;
  side: "long" | "short";
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl?: number;
  tp?: number;
  openTime: string;
  profit: number;
}

export interface BrokerPendingOrder {
  id: string;
  accountId: string;
  symbol: string;
  type: "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop" | "buy_stop_limit" | "sell_stop_limit";
  volume: number;
  price: number;
  sl?: number;
  tp?: number;
  openTime: string;
  status: "active" | "filled" | "cancelled";
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
});
export type TradeSignalInput = z.input<typeof TradeSignalSchema>;

export const TRADE_EXECUTION_STATUS = ["rejected", "pending_approval", "approved", "submitted", "filled", "failed", "blocked"] as const;
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
  /** Human approver (assisted mode). */
  approvedBy?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
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
  systemHealth: { brokerConnected: number; brokerTotal: number; ffmpeg: boolean; lastSyncAt?: string };
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

/* ── Id params ─────────────────────────────────────────────────── */

export const BrokerIdSchema = z.object({ id: z.string().min(1).max(64) });
export const StrategyIdSchema = z.object({ id: z.string().min(1).max(64) });
