/**
 * WINDELS AI OS — Unified Broker Connector interface.
 *
 * Every market vertical — Forex/CFDs (MT5, MT4, cTrader, FIX), Crypto (Binance,
 * Bybit, OKX, Coinbase, Kraken, KuCoin, Bitget, Gate.io, MEXC, HTX, Crypto.com,
 * Hyperliquid), Traditional Markets (IBKR, Alpaca, Tradestation, OANDA, IG) —
 * plugs into this single interface. The AI Trading Intelligence, Risk Engine,
 * Trade Execution Supervisor, AI Workforce agents, Kernel, and Billing layer
 * speak only to this interface. Connectors are transport-specific (native
 * Python bridge over ZeroMQ for MT5, REST/WS for exchanges, MetaApi cloud,
 * etc.) but share identical domain semantics.
 *
 * Hard rules:
 *   - No synthetic randomness in live code paths — connectors report real measurements
 *     or return `null`/honest errors; never invent prices or fills.
 *   - Every mutation returns a structured result; errors never crash the loop.
 *   - Every connector is multi-account capable (one instance ↔ many logins).
 *   - Credentials are passed in as opaque strings/objects; connectors must not
 *     persist secrets themselves (BrokerIntegrationService owns encryption).
 *   - Connectors MUST honor `connectorConfig.readOnly` — when true, no order
 *     send/modify/cancel may be transmitted (safe read-only monitoring).
 */
import type {
  BrokerType, BrokerAccount, BrokerPosition, BrokerPendingOrder, BrokerDeal,
  BrokerSymbol, BrokerTick, BrokerCandle, BrokerOrderRequest, BrokerSyncState,
  ConnectorTransport, BrokerConnectionStatus,
} from "@windels/shared/brokerIntegration";

export interface ConnectCredentials {
  /** Login / account id / api key (public). */
  login: string;
  /** Password / api secret (SENSITIVE — never logged, never persisted here). */
  password: string;
  /** Server / host / endpoint (broker-dependent). */
  server: string;
  /** Additional secret material (e.g. MT5 investor password, exchange passphrase). */
  extra?: Record<string, string>;
}

export interface ConnectOptions {
  /** Account display name, for log correlation. */
  name: string;
  /** Environment: demo / live / contest / sandbox. */
  environment?: "demo" | "live" | "contest" | "sandbox";
  /** Transport preference; connector may choose best available if omitted. */
  transport?: ConnectorTransport;
  /** Per-account connector config (bridge endpoint, read-only, etc.). */
  config?: BrokerAccount["connectorConfig"];
}

export interface ConnectResult {
  ok: boolean;
  transport: ConnectorTransport;
  endpoint?: string;
  terminalPath?: string;
  error?: string;
  /** Initial account snapshot returned immediately after connect. */
  snapshot?: {
    balance: number; equity: number; margin: number; freeMargin: number;
    profit: number; leverage: number; currency: string;
    marginLevel?: number; credit?: number;
    tradeAllowed?: boolean; expertAllowed?: boolean;
  };
  latencyMs?: number;
}

export interface DisconnectResult { ok: boolean; error?: string }

export interface SyncResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  account?: { balance: number; equity: number; margin: number; freeMargin: number; profit: number; marginLevel?: number; credit?: number; tradeAllowed?: boolean; expertAllowed?: boolean };
  symbols?: BrokerSymbol[];
  positions?: BrokerPosition[];
  orders?: BrokerPendingOrder[];
  deals?: BrokerDeal[];
}

export interface OrderResult {
  ok: boolean;
  /** Broker-native ticket/order id when ok=true. */
  ticket?: string;
  /** Broker deal id when immediately filled. */
  dealId?: string;
  fillPrice?: number;
  filledVolume?: number;
  /** MT5 retcode / exchange error code. */
  retcode?: number;
  error?: string;
  /** Broker comment echoed back (for audit). */
  comment?: string;
  latencyMs?: number;
}

export interface CandleQuery {
  symbol: string;
  timeframe: "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1" | "W1" | "MN1";
  count: number;
  start?: Date;
  end?: Date;
}

export interface HistoryQuery {
  from?: Date;
  to?: Date;
  symbol?: string;
  group?: string;
}

export type TickHandler = (accountId: string, tick: BrokerTick) => void;
export type ConnectionStateHandler = (accountId: string, status: BrokerConnectionStatus, error?: string) => void;

export interface IBrokerConnector {
  /** Stable identifier ("mt5", "binance", etc.). */
  readonly broker: BrokerType;
  /** Human-readable label. */
  readonly label: string;
  /** Transport(s) this connector supports. */
  readonly supportedTransports: ConnectorTransport[];
  /** Whether this connector is usable on the running host (binary deps installed, keys configured, etc.). */
  isAvailable(): Promise<boolean>;
  /** Best-effort startup (initialize pools, warm HTTP clients, etc.). */
  initialize(): Promise<void>;
  /** Graceful shutdown. */
  shutdown(): Promise<void>;
  /** Connect a single account; idempotent. */
  connect(accountId: string, creds: ConnectCredentials, opts: ConnectOptions): Promise<ConnectResult>;
  /** Disconnect a single account. */
  disconnect(accountId: string): Promise<DisconnectResult>;
  /** True when the account has an active live session. */
  isConnected(accountId: string): boolean;
  /** Current connection state summary for the account. */
  getState(accountId: string): BrokerSyncState;
  /** Pull fresh state from the broker. */
  sync(accountId: string, scope: { account?: boolean; symbols?: boolean; positions?: boolean; orders?: boolean; history?: boolean; historyDays?: number }): Promise<SyncResult>;
  /** Send / modify / cancel an order. */
  sendOrder(accountId: string, req: BrokerOrderRequest): Promise<OrderResult>;
  /** Modify position SL/TP/comment. */
  modifyPosition(accountId: string, ticket: string, patch: { sl?: number; tp?: number; comment?: string }): Promise<OrderResult>;
  /** Close a position (full or partial). */
  closePosition(accountId: string, ticket: string, volume?: number): Promise<OrderResult>;
  /** OHLCV history candles. */
  getCandles(accountId: string, q: CandleQuery): Promise<BrokerCandle[]>;
  /** Last n ticks for a symbol. */
  getLastTicks?(accountId: string, symbol: string, count?: number): Promise<BrokerTick[]>;
  /** Trade/deal history. */
  getDeals(accountId: string, q: HistoryQuery): Promise<BrokerDeal[]>;
  /** Symbol metadata. */
  getSymbol(accountId: string, symbol: string): Promise<BrokerSymbol | null>;
  /** Subscribe a handler for streaming ticks (must be idempotent per-symbol). */
  subscribeTicks(accountId: string, symbols: string[], handler: TickHandler): Promise<{ subscribed: string[] }>;
  /** Unsubscribe all handlers for an account (or a specific symbol set). */
  unsubscribeTicks(accountId: string, symbols?: string[]): Promise<void>;
  /** Register a connection-state change callback. */
  onStateChange(handler: ConnectionStateHandler): void;
  /** Health for a given account. */
  health(accountId: string): { connected: boolean; latencyMs?: number; lastError?: string; reconnectAttempts: number; endpoint?: string };
  /** Recent error history for an account (Phase 21 — dashboard errors panel). */
  getRecentErrors?(accountId: string, limit?: number): Array<{ at: string; message: string; category: string }>;
}
