/**
 * WINDELS AI OS — Crypto Exchange Connector shared types (Phase 1 of the
 * Cryptocurrency Trading Platform vertical).
 *
 * Provides a unified model for the 12 launch exchanges (Binance, Bybit, OKX,
 * Coinbase Advanced, Kraken, KuCoin, Bitget, Gate.io, MEXC, HTX, Crypto.com
 * Exchange, Hyperliquid). Each exchange plugs in through ICryptoConnector
 * which extends the existing IBrokerConnector — crypto accounts appear as
 * first-class BrokerAccount records (broker=<exchange-id>) and show up
 * alongside MT5/MT4/cTrader/IBKR/... in the unified dashboard, risk engine,
 * AI agent workflow, and strategy runner.
 *
 * Design principles:
 *   - No SDK lock-in. Connectors speak raw REST + WebSocket with a small
 *     shared HttpFetcher / WsClient utility. This keeps bundle size small,
 *     avoids transitive CVE churn from upstream SDKs, and gives full
 *     control over signing, retries, and rate-limit budgeting.
 *   - Deterministic symbol normalization: BTC/USDT (spot), BTC/USDT:USDT
 *     (linear perp), BTC/USD:BTC (inverse perp), BTC-20250328-60000-C
 *     (option). Per-exchange raw symbol ↔ unified symbol converters live
 *     with the connector.
 *   - Capabilities declared up front per connector (which market types it
 *     supports, which auth schemes, which WS channels). Missing capabilities
 *     fail fast with a typed error rather than silently degrading.
 *   - Production hardening: signed-request HMAC/ED25519, nonce/clock-skew
 *     protection, idempotency keys where supported, per-endpoint rate
 *     budgeting with token bucket, WS auto-reconnect with exponential
 *     backoff, subscription replay on reconnect, graceful shutdown.
 */
import { z } from "zod";

/* ── Exchanges ────────────────────────────────────────────────── */

/** The 12 launch exchanges. IDs are kebab-case stable strings. */
export const CRYPTO_EXCHANGES = [
  "binance",
  "bybit",
  "okx",
  "coinbase",
  "kraken",
  "kucoin",
  "bitget",
  "gateio",
  "mexc",
  "htx",
  "cryptocom",
  "hyperliquid",
] as const;
export type CryptoExchangeId = (typeof CRYPTO_EXCHANGES)[number];

/** Canonical exchange display labels. */
export const CRYPTO_EXCHANGE_LABELS: Record<CryptoExchangeId, string> = {
  binance:     "Binance",
  bybit:       "Bybit",
  okx:         "OKX",
  coinbase:    "Coinbase Advanced",
  kraken:      "Kraken",
  kucoin:      "KuCoin",
  bitget:      "Bitget",
  gateio:      "Gate.io",
  mexc:        "MEXC",
  htx:         "HTX",
  cryptocom:   "Crypto.com Exchange",
  hyperliquid: "Hyperliquid",
};

/* ── Markets ─────────────────────────────────────────────────── */

export const CRYPTO_MARKET_TYPES = ["spot", "margin", "futures", "perp", "options"] as const;
export type CryptoMarketType = (typeof CRYPTO_MARKET_TYPES)[number];

export const CRYPTO_ORDER_SIDES = ["buy", "sell"] as const;
export type CryptoOrderSide = (typeof CRYPTO_ORDER_SIDES)[number];

export const CRYPTO_ORDER_TYPES = [
  "market", "limit", "stop_market", "stop_limit",
  "take_profit_market", "take_profit_limit",
  "post_only",  // limit maker-or-cancel
  "ioc",         // immediate-or-cancel
  "fok",         // fill-or-kill
  "limit_maker", // alias used by some exchanges
] as const;
export type CryptoOrderType = (typeof CRYPTO_ORDER_TYPES)[number];

export const CRYPTO_ORDER_STATUS = [
  "new", "partially_filled", "filled", "canceled", "rejected",
  "expired", "pending", "untriaged",
] as const;
export type CryptoOrderStatus = (typeof CRYPTO_ORDER_STATUS)[number];

export const CRYPTO_POSITION_SIDE = ["long", "short", "net"] as const;
export type CryptoPositionSide = (typeof CRYPTO_POSITION_SIDE)[number];

export const CRYPTO_ORDER_TIME_IN_FORCE = ["GTC", "IOC", "FOK", "PO", "GTX", "GTD"] as const;
export type CryptoTimeInForce = (typeof CRYPTO_ORDER_TIME_IN_FORCE)[number];

/* ── Symbol normalization ───────────────────────────────────── */

/**
 * Unified symbol format used throughout WINDELS:
 *   - Spot:                 BTC/USDT
 *   - Linear perp/futures:  BTC/USDT:USDT          (settled in USDT)
 *   - Inverse perp/futures: BTC/USD:BTC            (settled in BTC)
 *   - Option:               BTC-250328-60000-C     (Coin-YYMMDD-strike-C/P)
 */
export type UnifiedSymbol = string;

export interface CryptoMarket {
  /** Unified symbol. */
  symbol: UnifiedSymbol;
  /** Exchange-native symbol / instrument id. */
  rawSymbol: string;
  /** Market type. */
  type: CryptoMarketType;
  /** Base asset (BTC) and quote asset (USDT). */
  base: string;
  quote: string;
  /** Settlement asset (for perps/futures/options); spot omits or equals "". */
  settle: string;
  /** Contract size (for futures/perps/options); spot=1. */
  contractSize: number;
  /** Is the market currently tradeable? */
  active: boolean;
  /** Price precision (decimal places). */
  pricePrecision: number;
  /** Quantity precision (decimal places). */
  qtyPrecision: number;
  /** Minimum order size (in base units) or null if unknown. */
  minQty: number | null;
  /** Minimum notional order value (in quote units) or null if unknown. */
  minNotional: number | null;
  /** Max leverage allowed (for derivatives). 1 for spot. */
  maxLeverage: number;
  /** Tick size (minimum price increment). */
  tickSize: number;
  /** Lot size step. */
  stepSize: number;
}

/* ── Orders / positions / fills ─────────────────────────────── */

export interface CryptoOrderRequest {
  symbol: UnifiedSymbol;
  marketType: CryptoMarketType;
  side: CryptoOrderSide;
  type: CryptoOrderType;
  /** Quantity in base units (or contracts for derivatives). */
  quantity: number;
  /** Price (required for limit/stop_limit/take_profit_limit). */
  price?: number;
  /** Trigger price (for stop/take-profit orders). */
  triggerPrice?: number;
  /** Leverage (derivatives). */
  leverage?: number;
  /** Reduce-only flag (derivatives). */
  reduceOnly?: boolean;
  /** Post-only flag. */
  postOnly?: boolean;
  timeInForce?: CryptoTimeInForce;
  clientOrderId?: string;
  /** Position mode (one-way vs hedge) for exchanges that support it. */
  positionSide?: CryptoPositionSide;
  /** Stop loss / take profit attached. */
  stopLoss?: { price: number; type?: "market" | "limit" };
  takeProfit?: { price: number; type?: "market" | "limit" };
  comment?: string;
  magic?: number;
}

export interface CryptoOrder {
  id: string;              // exchange-assigned order id
  clientOrderId?: string;
  symbol: UnifiedSymbol;
  marketType: CryptoMarketType;
  side: CryptoOrderSide;
  type: CryptoOrderType;
  price: number | null;
  triggerPrice?: number | null;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  avgFillPrice: number | null;
  status: CryptoOrderStatus;
  timeInForce: CryptoTimeInForce | null;
  reduceOnly: boolean;
  leverage?: number;
  stopLoss?: { price: number; type?: "market" | "limit" } | null;
  takeProfit?: { price: number; type?: "market" | "limit" } | null;
  positionSide?: CryptoPositionSide;
  createdTime: string;
  updatedTime: string;
  fee: number;
  feeCurrency: string;
}

export interface CryptoPosition {
  symbol: UnifiedSymbol;
  marketType: CryptoMarketType;
  side: CryptoPositionSide;
  quantity: number;           // signed positive for long, negative for short (hedge mode: each side is positive)
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  leverage: number;
  margin: number;
  marginType: "cross" | "isolated";
  liquidationPrice: number | null;
  stopLoss?: number;
  takeProfit?: number;
  openedTime: string;
  updatedTime: string;
}

export interface CryptoFill {
  id: string;
  orderId: string;
  symbol: UnifiedSymbol;
  marketType: CryptoMarketType;
  side: CryptoOrderSide;
  price: number;
  quantity: number;
  fee: number;
  feeCurrency: string;
  realizedPnl?: number;
  time: string;
  isMaker: boolean;
  tradeId?: string;
}

export interface CryptoBalance {
  asset: string;
  total: number;
  free: number;
  locked: number;
  usdValue?: number;
}

export interface CryptoAccountSnapshot {
  /** Exchange-generated account/sub-account id. */
  accountId: string;
  /** Account type (spot/contract/etc.) */
  accountType: string;
  /** True when credentials can trade; false for read-only keys. */
  canTrade: boolean;
  /** True when credentials support withdrawal. */
  canWithdraw: boolean;
  /** Total equity in USD (spot + derivatives unrealized PnL). */
  equityUsd: number;
  /** Unrealized PnL across derivatives positions in USD. */
  unrealizedPnlUsd: number;
  balances: CryptoBalance[];
  positions: CryptoPosition[];
  openOrders: CryptoOrder[];
}

/* ── Market data ─────────────────────────────────────────────── */

export interface CryptoTicker {
  symbol: UnifiedSymbol;
  bid: number;
  ask: number;
  last: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume24h: number;
  changePct24h: number;
  time: string;
}

export interface CryptoCandle {
  symbol: UnifiedSymbol;
  timeframe: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  trades?: number;
}

export interface CryptoTrade {
  symbol: UnifiedSymbol;
  id: string;
  side: CryptoOrderSide;
  price: number;
  quantity: number;
  time: string;
}

export interface CryptoOrderBookLevel {
  price: number;
  quantity: number;
}
export interface CryptoOrderBook {
  symbol: UnifiedSymbol;
  bids: CryptoOrderBookLevel[];
  asks: CryptoOrderBookLevel[];
  time: string;
}

/* ── WebSocket subscriptions ────────────────────────────────── */

export type CryptoWsChannel =
  | { kind: "ticker"; symbols: UnifiedSymbol[] }
  | { kind: "trades"; symbols: UnifiedSymbol[] }
  | { kind: "orderbook"; symbols: UnifiedSymbol[]; depth?: "10" | "25" | "50" | "200" }
  | { kind: "candles"; symbols: UnifiedSymbol[]; timeframe: string }
  | { kind: "user_orders" }
  | { kind: "user_trades" }
  | { kind: "user_balances" }
  | { kind: "user_positions" };

export interface WsEvent {
  type: "ticker" | "trade" | "candle" | "orderbook" | "order" | "fill" | "balance" | "position" | "status" | "error";
  symbol?: UnifiedSymbol;
  data: unknown;
  time: string;
}

/* ── Auth & credentials ──────────────────────────────────────── */

export type CryptoAuthScheme =
  | "hmac_sha256_header"    // key + secret → HMAC-SHA256 signature in headers (Binance, OKX, Bybit, KuCoin, Gate, MEXC, Bitget)
  | "hmac_sha256_query"     // signature appended to query string (HTX/Huobi style)
  | "hmac_sha256_body"      // signature placed in JSON body (Crypto.com style)
  | "hmac_sha256_jwt"       // Coinbase Advanced: key name + JWT over uri+method+body
  | "hmac_sha512_header"    // Kraken: API-Sign = HMAC-SHA512(nonce+postdata, base64_secret) over uri path
  | "ecdsa_secp256k1"       // Hyperliquid: EIP-712 secp256k1 over wallet private key
  | "ed25519_wallet"        // ED25519 wallet signing
  | "none";                 // public-only, no auth

export interface CryptoCredentials {
  /** API key / public key. */
  apiKey: string;
  /** API secret (base64/hex — kept encrypted at rest; connector never logs it). */
  apiSecret: string;
  /** Optional passphrase (OKX, KuCoin, Coinbase legacy, Bitget require it). */
  passphrase?: string;
  /** Optional sub-account nick/id for multi-account (Bybit, Binance, OKX, KuCoin). */
  subAccount?: string;
  /** Optional wallet private key for ED25519/ECDSA exchanges (Hyperliquid). */
  walletKey?: string;
}

/* ── Connector capabilities ─────────────────────────────────── */

export interface CryptoConnectorCapabilities {
  /** Markets supported. */
  markets: CryptoMarketType[];
  /** Authentication schemes the connector can speak (first available is chosen). */
  auth: CryptoAuthScheme[];
  /** True when exchange supports a unified WebSocket API. */
  hasPublicWs: boolean;
  /** True when exchange supports private/user-data WebSocket. */
  hasPrivateWs: boolean;
  /** True when the REST endpoint supports batch queries (reduces rate limits). */
  hasBatchQueries: boolean;
  /** Does the connector currently support deposit/withdrawal APIs? (Phase 2) */
  hasTransfers: boolean;
  /** Default base URL for REST; can be overridden in connectorConfig for testnet. */
  restBaseUrl: string;
  /** Testnet/sandbox REST URL (where available). */
  testnetRestUrl?: string;
  /** Default public WS URL. */
  publicWsUrl?: string;
  /** Private/user-data WS URL. */
  privateWsUrl?: string;
  /** Testnet public WS URL (if different base host than testnet REST). */
  testnetPublicWsUrl?: string;
  /** Testnet private WS URL. */
  testnetPrivateWsUrl?: string;
  /** Optional ping interval for WS (ms) when exchange app-level ping is required. */
  publicWsPingIntervalMs?: number;
  privateWsPingIntervalMs?: number;
  /** True when private user-data stream requires REST-issued listenKey (Binance/MEXC style). */
  privateWsUsesListenKey?: boolean;
  /** Default rate-limit budget: requests per minute (weighted where applicable). */
  defaultReqPerMin: number;
  /** Server-time drift correction needed? (Binance/OKX/etc. send serverTime we latch onto). */
  correctsClockDrift: boolean;
}

/* ── Zod schemas ─────────────────────────────────────────────── */

export const CreateCryptoAccountSchema = z.object({
  name: z.string().min(1).max(120),
  exchange: z.enum(CRYPTO_EXCHANGES),
  apiKey: z.string().min(4).max(200),
  apiSecret: z.string().min(4).max(400),
  passphrase: z.string().max(200).optional(),
  subAccount: z.string().max(80).optional(),
  walletKey: z.string().max(200).optional(),
  marketTypes: z.array(z.enum(CRYPTO_MARKET_TYPES)).default(["spot"]),
  environment: z.enum(["live", "testnet"]).default("live"),
  mode: z.enum(["analysis_only", "assisted", "semi_autonomous", "fully_autonomous"]).default("analysis_only"),
  connectorConfig: z.object({
    testnet: z.boolean().optional(),
    restBaseUrl: z.string().max(300).optional(),
    publicWsUrl: z.string().max(300).optional(),
    privateWsUrl: z.string().max(300).optional(),
    syncIntervalMs: z.coerce.number().int().min(1_000).max(600_000).optional(),
    tickStream: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    allowedSymbols: z.array(z.string().max(64)).max(500).optional(),
    deniedSymbols: z.array(z.string().max(64)).max(500).optional(),
    leverageDefaults: z.record(z.string(), z.number().int().min(1).max(125)).optional(),
  }).default({}),
});
export type CreateCryptoAccountInput = z.input<typeof CreateCryptoAccountSchema>;

export const CryptoOrderRequestSchema = z.object({
  symbol: z.string().min(1).max(64),
  marketType: z.enum(CRYPTO_MARKET_TYPES),
  side: z.enum(CRYPTO_ORDER_SIDES),
  type: z.enum(CRYPTO_ORDER_TYPES),
  quantity: z.number().positive(),
  price: z.number().positive().optional(),
  triggerPrice: z.number().positive().optional(),
  leverage: z.number().int().min(1).max(125).optional(),
  reduceOnly: z.boolean().optional(),
  postOnly: z.boolean().optional(),
  timeInForce: z.enum(CRYPTO_ORDER_TIME_IN_FORCE).optional(),
  clientOrderId: z.string().max(64).optional(),
  positionSide: z.enum(CRYPTO_POSITION_SIDE).optional(),
  stopLoss: z.object({ price: z.number().positive(), type: z.enum(["market", "limit"]).optional() }).optional(),
  takeProfit: z.object({ price: z.number().positive(), type: z.enum(["market", "limit"]).optional() }).optional(),
  comment: z.string().max(80).optional(),
  magic: z.number().int().optional(),
});
