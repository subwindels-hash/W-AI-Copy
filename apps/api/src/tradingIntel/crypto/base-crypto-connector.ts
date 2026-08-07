/**
 * WINDELS AI OS — Base class for crypto exchange connectors (Phase 2).
 *
 * Crypto connectors extend IBrokerConnector so they slot directly into the
 * existing BrokerIntegrationService, dashboard, risk engine, and AI agent
 * workflow. Subclasses implement exchange-specific REST/WS signing, symbol
 * normalization, order-parameter translation, and message parsing.
 *
 * Responsibilities of this base:
 *   - Account sessions map (multi-account; one instance ↔ many API keys)
 *   - HttpSigner + ExchangeHttpClient + ExchangeWsClient lifecycle
 *   - Rate-limit / reconnect plumbing
 *   - Normalized order/position/balance/candle/ticker dispatch onto the
 *     broker-integration shapes (BrokerPosition, BrokerPendingOrder,
 *     BrokerDeal, BrokerSymbol, BrokerTick, BrokerCandle)
 *   - Pre-trade risk gate (read-only env, connector read-only, RiskEngine)
 *   - Tick fan-out to subscribers via public WS ticker subscriptions
 *   - Private WS user-data ingestion (orders/positions/balances/executions)
 *   - Client-order-id generation with magic+comment correlation
 *   - Honoring connectorConfig.readOnly globally for order send/modify/cancel
 *   - Generating Metrics counters/timings for observability
 *
 * Subclasses implement:
 *   - id, label, capabilities
 *   - buildSigner(creds) → HttpSigner
 *   - fetchMarkets() → CryptoMarket[]
 *   - fetchAccountSnapshot() → CryptoAccountSnapshot
 *   - placeOrderImpl / modifyOrderImpl / closePositionImpl → OrderResult
 *   - fetchCandles() / fetchRecentFills()
 *   - buildPublicWsParser() / buildPrivateWsParser() → WsParser
 *   - subscribePublicTickerPayload() / authenticatePrivateWs()
 */
import { EventEmitter, once } from "node:events";
import { randomUUID } from "node:crypto";
import type {
  BrokerType, ConnectorTransport, BrokerConnectionStatus,
  BrokerPosition, BrokerPendingOrder, BrokerDeal, BrokerSymbol, BrokerTick,
  BrokerCandle, BrokerSyncState, BrokerOrderRequest,
} from "@windels/shared/brokerIntegration";
import type {
  CryptoExchangeId, CryptoCredentials, CryptoConnectorCapabilities,
  CryptoMarket, CryptoMarketType, CryptoOrderRequest, CryptoOrder,
  CryptoPosition, CryptoFill, CryptoBalance, CryptoAccountSnapshot,
  CryptoCandle, CryptoOrderSide, CryptoOrderType,
} from "@windels/shared/crypto";
import type {
  IBrokerConnector, ConnectCredentials, ConnectOptions, ConnectResult,
  DisconnectResult, SyncResult, OrderResult, CandleQuery, HistoryQuery,
  TickHandler, ConnectionStateHandler,
} from "../connectors/broker-connector.js";
import { ExchangeHttpClient, type HttpSigner } from "./exchange-http.js";
import { ExchangeWsClient, type WsSubscription } from "./exchange-ws.js";
import { RiskEngine, type TiOrderRequest } from "../risk.js";
import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";
import { Metrics } from "../../observability/metrics.js";

export interface CryptoAccountSession {
  id: string;
  login: string;
  creds: CryptoCredentials;
  opts: ConnectOptions;
  http: ExchangeHttpClient;
  /** Public WS (lazy init per-subscriber). */
  publicWs?: ExchangeWsClient;
  /** Private/user-data WS (lazy init on connect). */
  privateWs?: ExchangeWsClient;
  /** Active public ticker subscriptions (unified symbol -> sub key). */
  publicTickers: Map<string, string>;
  /** Active listenKey / subscription token for private streams (if any). */
  privateListenKey?: string;
  privateListenKeyTimer?: ReturnType<typeof setInterval>;
  name: string;
  environment: string;
  status: BrokerConnectionStatus;
  lastError?: string;
  connectedAt: string;
  lastSyncAt?: string;
  lastTickAt?: string;
  latencyMs: number;
  markets: Map<string, CryptoMarket>;
  marketsByRaw: Map<string, CryptoMarket>;
  balances: Map<string, CryptoBalance>;
  positions: Map<string, CryptoPosition>;
  openOrders: Map<string, CryptoOrder>;
  fills: CryptoFill[];
  clientOrderIdCounter: number;
  snapshot?: CryptoAccountSnapshot;
  tickHandlers: Map<string, TickHandler>;
  /** Inbound private-stream handlers. */
  privateQueue: Array<{ kind: "order" | "fill" | "position" | "balance"; payload: any; recvAt: string }>;
}

export interface BaseCryptoOpts {
  exchange: CryptoExchangeId;
  label: string;
  brokerType?: BrokerType;
  capabilities: CryptoConnectorCapabilities;
}

/** Risk pre-check result. */
interface RiskPass { ok: true }
interface RiskBlock { ok: false; error: string; blockedBy?: string }
type RiskResult = RiskPass | RiskBlock;

/** Default risk engine instance (crypto uses the same rules as equities). */
const riskEngine = new RiskEngine();

export abstract class BaseCryptoConnector extends EventEmitter implements IBrokerConnector {
  readonly broker: BrokerType;
  readonly label: string;
  readonly supportedTransports: ConnectorTransport[];
  readonly capabilities: CryptoConnectorCapabilities;
  readonly exchange: CryptoExchangeId;
  private accounts = new Map<string, CryptoAccountSession>();
  private stateHandlers: ConnectionStateHandler[] = [];
  private initialized = false;

  constructor(opts: BaseCryptoOpts) {
    super();
    this.exchange = opts.exchange;
    this.label = opts.label;
    this.broker = (opts.brokerType ?? opts.exchange) as BrokerType;
    this.capabilities = opts.capabilities;
    const transports: ConnectorTransport[] = ["exchange_rest"];
    if (this.capabilities.hasPublicWs || this.capabilities.hasPrivateWs) transports.push("exchange_ws");
    this.supportedTransports = transports;
  }

  async isAvailable(): Promise<boolean> { return true; }
  async initialize(): Promise<void> { this.initialized = true; }
  async shutdown(): Promise<void> {
    for (const a of this.accounts.values()) {
      if (a.privateListenKeyTimer) clearInterval(a.privateListenKeyTimer);
      a.publicWs?.close(); a.privateWs?.close();
      a.status = "disconnected";
    }
    this.accounts.clear();
    this.initialized = false;
  }

  /* ── Connect / disconnect ──────────────────────────────── */

  async connect(accountId: string, creds: ConnectCredentials, opts: ConnectOptions): Promise<ConnectResult> {
    const environment = opts.environment ?? "live";
    const testnet = environment === "demo" || environment === "sandbox" || environment === "contest";
    const defaultTestnet = env.WINDELS_CRYPTO_DEFAULT_TESTNET;
    const useTestnet = testnet || (defaultTestnet && environment !== "live");
    const baseUrl = opts.config?.bridgeEndpoint ??
      (useTestnet && this.capabilities.testnetRestUrl ? this.capabilities.testnetRestUrl : this.capabilities.restBaseUrl);
    const wsBase = useTestnet && this.capabilities.testnetPublicWsUrl
      ? this.capabilities.testnetPublicWsUrl
      : this.capabilities.publicWsUrl;
    const privateWsBase = useTestnet && this.capabilities.testnetPrivateWsUrl
      ? this.capabilities.testnetPrivateWsUrl
      : this.capabilities.privateWsUrl;

    const cryptoCreds: CryptoCredentials = {
      apiKey: creds.login,
      apiSecret: creds.password,
      passphrase: creds.extra?.passphrase,
      subAccount: creds.extra?.subAccount,
      walletKey: creds.extra?.walletKey,
    };

    const signer = this.buildSigner(cryptoCreds);
    const http = new ExchangeHttpClient({
      baseUrl,
      signer,
      timeoutMs: env.WINDELS_CRYPTO_HTTP_TIMEOUT_MS,
      defaultReqPerMinute: this.capabilities.defaultReqPerMin,
      onRequest: ({ method, path, status, latencyMs }) => {
        const sess = this.accounts.get(accountId);
        if (sess) sess.latencyMs = latencyMs;
        logger.debug("[crypto] request", { exchange: this.exchange, method, path, status, latencyMs });
      },
    });

    const sess: CryptoAccountSession = {
      id: accountId, login: creds.login, creds: cryptoCreds, opts,
      http, name: opts.name ?? `${this.label} ${creds.login}`,
      environment, status: "connecting", connectedAt: new Date().toISOString(),
      latencyMs: 0,
      markets: new Map(), marketsByRaw: new Map(),
      balances: new Map(), positions: new Map(), openOrders: new Map(), fills: [],
      clientOrderIdCounter: 0,
      publicTickers: new Map(),
      tickHandlers: new Map(),
      privateQueue: [],
    };
    this.accounts.set(accountId, sess);

    try {
      const markets = await this.fetchMarkets(sess);
      for (const m of markets) {
        sess.markets.set(m.symbol, m);
        sess.marketsByRaw.set(m.rawSymbol, m);
      }
      const snap = await this.fetchAccountSnapshot(sess);
      sess.snapshot = snap;
      for (const b of snap.balances) sess.balances.set(b.asset, b);
      for (const p of snap.positions) sess.positions.set(p.symbol, p);
      for (const o of snap.openOrders) sess.openOrders.set(o.id, o);

      // Public WS (lazy — starts when tickers are subscribed).
      // Private WS (start if available and tickStream != false).
      if (this.capabilities.hasPrivateWs && (opts.config?.tickStream ?? true)) {
        try { this.startPrivateWs(sess, privateWsBase); } catch (e) { logger.warn("[crypto] private WS failed to start", { exchange: this.exchange, err: e }); }
      }
      // Seed public WS client so subscribeTicks can add subscriptions to it lazily.
      if (this.capabilities.hasPublicWs && wsBase) {
        try { this.seedPublicWs(sess, wsBase); } catch (e) { logger.warn("[crypto] public WS seed failed", { exchange: this.exchange, err: e }); }
      }

      sess.status = "connected";
      sess.lastSyncAt = new Date().toISOString();
      this.emitState(accountId, "connected");
      const equityUsd = snap.equityUsd ?? 0;
      return {
        ok: true, transport: "exchange_rest", endpoint: baseUrl,
        snapshot: {
          balance: equityUsd, equity: equityUsd, margin: 0, freeMargin: equityUsd,
          profit: snap.unrealizedPnlUsd ?? 0, leverage: 1, currency: "USD",
          tradeAllowed: snap.canTrade && !opts.config?.readOnly && !env.WINDELS_CRYPTO_GLOBAL_READONLY,
          expertAllowed: snap.canTrade,
        },
        latencyMs: 0,
      };
    } catch (e) {
      sess.status = "error";
      sess.lastError = (e as Error).message;
      this.emitState(accountId, "error", sess.lastError);
      Metrics.counter("crypto.connect.failed", { exchange: this.exchange }).incr();
      return { ok: false, transport: "exchange_rest", error: sess.lastError };
    }
  }

  async disconnect(accountId: string): Promise<DisconnectResult> {
    const a = this.accounts.get(accountId);
    if (!a) return { ok: false, error: "not connected" };
    if (a.privateListenKeyTimer) { clearInterval(a.privateListenKeyTimer); a.privateListenKeyTimer = undefined; }
    try {
      if (a.privateListenKey) await this.disposeListenKey(a).catch(() => {});
    } catch { /* best effort */ }
    a.publicWs?.close(); a.privateWs?.close();
    this.accounts.delete(accountId);
    this.emitState(accountId, "disconnected");
    return { ok: true };
  }
  isConnected(accountId: string): boolean {
    return this.accounts.get(accountId)?.status === "connected";
  }

  getState(accountId: string): BrokerSyncState {
    const a = this.accounts.get(accountId);
    if (!a) return { accountId, status: "error", consecutiveErrors: 1, reconnectAttempts: 0, symbolsCount: 0, positionsCount: 0, ordersCount: 0, deals24h: 0, lastError: "not connected" };
    return {
      accountId,
      status: a.status === "error" ? "error" : (a.status === "syncing" ? "syncing" : "idle"),
      lastSyncAt: a.lastSyncAt, lastError: a.lastError,
      consecutiveErrors: a.lastError ? 1 : 0, reconnectAttempts: 0,
      symbolsCount: a.markets.size, positionsCount: a.positions.size,
      ordersCount: a.openOrders.size, deals24h: a.fills.length,
      latencyMs: a.latencyMs,
    };
  }

  /* ── Sync ──────────────────────────────────────────────── */

  async sync(accountId: string, scope: { account?: boolean; symbols?: boolean; positions?: boolean; orders?: boolean; history?: boolean; historyDays?: number }): Promise<SyncResult> {
    const a = this.mustGet(accountId);
    a.status = "syncing";
    const start = Date.now();
    try {
      if (scope.symbols) {
        a.markets.clear(); a.marketsByRaw.clear();
        const markets = await this.fetchMarkets(a);
        for (const m of markets) { a.markets.set(m.symbol, m); a.marketsByRaw.set(m.rawSymbol, m); }
      }
      const snap = await this.fetchAccountSnapshot(a);
      a.snapshot = snap;
      a.balances.clear(); a.positions.clear(); a.openOrders.clear();
      for (const b of snap.balances) a.balances.set(b.asset, b);
      for (const p of snap.positions) a.positions.set(p.symbol, p);
      for (const o of snap.openOrders) a.openOrders.set(o.id, o);

      if (scope.history) {
        const days = scope.historyDays ?? 7;
        const since = new Date(Date.now() - days * 86400_000).toISOString();
        const recent = await this.fetchRecentFills(a, since);
        a.fills = dedupeFills(a.fills, recent).slice(-500);
      }

      a.lastSyncAt = new Date().toISOString();
      a.status = "connected"; a.lastError = undefined;
      const symbols: BrokerSymbol[] = [...a.markets.values()].map((m) => ({
        name: m.symbol,
        description: `${m.base}/${m.quote}${m.settle ? ":" + m.settle : ""}`,
        digits: m.pricePrecision, point: m.tickSize, contractSize: m.contractSize,
        volumeMin: m.minQty ?? 0, volumeMax: 1_000_000, volumeStep: m.stepSize,
        spread: 0, tradeMode: m.active ? "full" : "disabled",
        currencyBase: m.base, currencyProfit: m.quote,
      }));
      const positions = cryptoPositionsToBroker(a.positions, a.markets);
      for (const p of positions) p.accountId = accountId;
      const orders = cryptoOrdersToBroker(a.openOrders, a.markets);
      for (const o of orders) o.accountId = accountId;
      const deals = cryptoFillsToBroker(accountId, a.fills);
      const account = {
        balance: snap.equityUsd, equity: snap.equityUsd,
        margin: 0, freeMargin: snap.equityUsd, profit: snap.unrealizedPnlUsd ?? 0,
        tradeAllowed: snap.canTrade && !a.opts.config?.readOnly && !env.WINDELS_CRYPTO_GLOBAL_READONLY,
        expertAllowed: snap.canTrade,
      };
      const ms = Date.now() - start;
      Metrics.timing("crypto.sync", ms, { exchange: this.exchange });
      return { ok: true, latencyMs: ms, account, symbols, positions, orders, deals };
    } catch (e) {
      a.status = "error"; a.lastError = (e as Error).message;
      Metrics.counter("crypto.sync.failed", { exchange: this.exchange }).incr();
      return { ok: false, error: a.lastError, latencyMs: Date.now() - start };
    }
  }

  /* ── Orders ─────────────────────────────────────────────── */

  async sendOrder(accountId: string, req: BrokerOrderRequest): Promise<OrderResult> {
    const a = this.mustGet(accountId);
    const started = Date.now();
    try {
      // Global kill switch for crypto.
      if (env.WINDELS_CRYPTO_GLOBAL_READONLY) {
        return { ok: false, retcode: -10, error: "WINDELS_CRYPTO_GLOBAL_READONLY is active", latencyMs: 0 };
      }
      if (a.opts.config?.readOnly) return { ok: false, retcode: -1, error: "read-only mode", latencyMs: 0 };

      const market = a.markets.get(req.symbol);
      if (!market) return { ok: false, retcode: -2, error: `unknown symbol ${req.symbol}` };
      const cryptoReq = brokerRequestToCrypto(req, market);
      cryptoReq.clientOrderId = this.genClientOrderId(a, req.magic);

      // Pre-trade risk.
      const risk = this.preTradeRisk(a, market, cryptoReq);
      if (risk.ok === false) {
        Metrics.counter("crypto.order.risk_blocked", { exchange: this.exchange, reason: risk.blockedBy ?? "unknown" }).incr();
        return { ok: false, retcode: -20, error: risk.error, latencyMs: Date.now() - started };
      }

      const r = await this.placeOrder(a, cryptoReq);
      const ms = Date.now() - started;
      a.latencyMs = ms;
      Metrics.timing("crypto.order.place", ms, { exchange: this.exchange, ok: String(r.ok) });
      if (r.ok) Metrics.counter("crypto.order.dispatched", { exchange: this.exchange }).incr();
      else Metrics.counter("crypto.order.rejected", { exchange: this.exchange }).incr();
      // Best-effort refresh after fill.
      setTimeout(() => this.backgroundSync(accountId).catch(() => {}), 1500);
      return { ...r, latencyMs: ms };
    } catch (e) {
      const msg = (e as Error).message;
      Metrics.counter("crypto.order.error", { exchange: this.exchange }).incr();
      return { ok: false, error: msg, latencyMs: Date.now() - started };
    }
  }

  async modifyPosition(accountId: string, ticket: string, patch: { sl?: number; tp?: number; comment?: string }): Promise<OrderResult> {
    const a = this.mustGet(accountId);
    const started = Date.now();
    if (env.WINDELS_CRYPTO_GLOBAL_READONLY) return { ok: false, retcode: -10, error: "WINDELS_CRYPTO_GLOBAL_READONLY is active" };
    if (a.opts.config?.readOnly) return { ok: false, error: "read-only mode" };
    try {
      const r = await this.modifyOrder(a, ticket, patch);
      Metrics.timing("crypto.order.modify", Date.now() - started, { exchange: this.exchange });
      return { ...r, latencyMs: Date.now() - started };
    } catch (e) { return { ok: false, error: (e as Error).message, latencyMs: Date.now() - started }; }
  }

  async closePosition(accountId: string, ticket: string, volume?: number): Promise<OrderResult> {
    const a = this.mustGet(accountId);
    const started = Date.now();
    if (env.WINDELS_CRYPTO_GLOBAL_READONLY) return { ok: false, retcode: -10, error: "WINDELS_CRYPTO_GLOBAL_READONLY is active" };
    if (a.opts.config?.readOnly) return { ok: false, error: "read-only mode" };
    try {
      const r = await this.closePositionImpl(a, ticket, volume);
      Metrics.timing("crypto.order.close", Date.now() - started, { exchange: this.exchange });
      setTimeout(() => this.backgroundSync(accountId).catch(() => {}), 1500);
      return { ...r, latencyMs: Date.now() - started };
    } catch (e) { return { ok: false, error: (e as Error).message, latencyMs: Date.now() - started }; }
  }

  /* ── Cancel-order support (not in IBrokerConnector surface but used by closePosition/replace). */
  async cancelOrder?(accountId: string, orderId: string): Promise<OrderResult> {
    const a = this.mustGet(accountId);
    if (env.WINDELS_CRYPTO_GLOBAL_READONLY) return { ok: false, retcode: -10, error: "WINDELS_CRYPTO_GLOBAL_READONLY is active" };
    if (a.opts.config?.readOnly) return { ok: false, error: "read-only mode" };
    return this.cancelOrderImpl(a, orderId);
  }

  /* ── Market data ──────────────────────────────── */

  async getCandles(accountId: string, q: CandleQuery): Promise<BrokerCandle[]> {
    const a = this.mustGet(accountId);
    const start = Date.now();
    const candles = await this.fetchCandles(a, q.symbol, q.timeframe, q.count);
    Metrics.timing("crypto.candles.fetch", Date.now() - start, { exchange: this.exchange });
    return candles.map((c) => ({
      symbol: c.symbol, timeframe: c.timeframe, time: c.time,
      open: c.open, high: c.high, low: c.low, close: c.close,
      tickVolume: Math.floor(c.volume), spread: 0,
    }));
  }

  async getSymbol(accountId: string, symbol: string): Promise<BrokerSymbol | null> {
    const a = this.mustGet(accountId);
    const m = a.markets.get(symbol);
    if (!m) return null;
    return {
      name: m.symbol, description: `${m.base}/${m.quote}${m.settle ? ":" + m.settle : ""}`,
      digits: m.pricePrecision, point: m.tickSize, contractSize: m.contractSize,
      volumeMin: m.minQty ?? 0, volumeMax: 1_000_000, volumeStep: m.stepSize,
      spread: 0, tradeMode: m.active ? "full" : "disabled",
      currencyBase: m.base, currencyProfit: m.quote,
    };
  }

  async getDeals(accountId: string, q: HistoryQuery): Promise<BrokerDeal[]> {
    const a = this.mustGet(accountId);
    const from = q.from ? new Date(q.from).toISOString() : undefined;
    const fills = await this.fetchRecentFills(a, from);
    a.fills = dedupeFills(a.fills, fills).slice(-500);
    return cryptoFillsToBroker(accountId, a.fills);
  }

  async subscribeTicks(accountId: string, symbols: string[], handler: TickHandler): Promise<{ subscribed: string[] }> {
    const a = this.mustGet(accountId);
    const key = "h" + a.tickHandlers.size + "-" + randomUUID().slice(0, 6);
    a.tickHandlers.set(key, handler);
    const ok: string[] = [];
    for (const s of symbols) {
      const m = a.markets.get(s);
      if (!m) continue;
      ok.push(s);
      if (this.capabilities.hasPublicWs && a.publicWs) {
        const subKey = `ticker:${m.rawSymbol}`;
        if (!a.publicTickers.has(s)) {
          a.publicTickers.set(s, subKey);
          this.addPublicTickerSubscription(a, m, subKey);
        }
      }
    }
    return { subscribed: ok };
  }

  async unsubscribeTicks(accountId: string, symbols?: string[]): Promise<void> {
    const a = this.accounts.get(accountId);
    if (!a) return;
    if (!symbols) {
      a.tickHandlers.clear();
      for (const [, subKey] of a.publicTickers) a.publicWs?.unsubscribe(subKey);
      a.publicTickers.clear();
      return;
    }
    for (const s of symbols) {
      const subKey = a.publicTickers.get(s);
      if (subKey) { a.publicWs?.unsubscribe(subKey); a.publicTickers.delete(s); }
    }
  }

  onStateChange(h: ConnectionStateHandler): void { this.stateHandlers.push(h); }

  health(accountId: string) {
    const a = this.accounts.get(accountId);
    return {
      connected: !!a && a.status === "connected",
      latencyMs: a?.latencyMs,
      lastError: a?.lastError,
      reconnectAttempts: 0,
      endpoint: a ? this.capabilities.restBaseUrl : undefined,
    };
  }

  /* ── Helpers ──────────────────────────────────── */

  protected mustGet(id: string): CryptoAccountSession {
    const a = this.accounts.get(id);
    if (!a) throw new Error(`${this.exchange}: account not connected: ${id}`);
    return a;
  }

  protected emitState(id: string, status: BrokerConnectionStatus, err?: string) {
    const a = this.accounts.get(id);
    if (a) { a.status = status; if (err) a.lastError = err; else a.lastError = undefined; }
    for (const h of this.stateHandlers) { try { h(id, status, err); } catch { /* ignore */ } }
  }

  protected dispatchTick(sess: CryptoAccountSession, symbol: string, bid: number, ask: number) {
    const tick: BrokerTick = { symbol, time: new Date().toISOString(), bid, ask };
    sess.lastTickAt = tick.time;
    for (const h of sess.tickHandlers.values()) {
      try { h(sess.id, tick); } catch { /* ignore */ }
    }
  }

  /** Generate a short-ish client order id with embedded magic. */
  protected genClientOrderId(sess: CryptoAccountSession, magic?: number): string {
    sess.clientOrderIdCounter = (sess.clientOrderIdCounter + 1) % 1_000_000;
    const m = magic ?? 987_654;
    // x-<exchange>-<magic>-<counter>-<shortuuid>
    return `x-${this.exchange.slice(0, 4)}-${m}-${sess.clientOrderIdCounter}-${randomUUID().slice(0, 8)}`;
  }

  /** Apply a fill received via REST or WS into the local books. */
  protected applyFill(sess: CryptoAccountSession, f: CryptoFill) {
    if (!sess.fills.find((x) => x.id === f.id)) sess.fills.push(f);
    if (sess.fills.length > 500) sess.fills.splice(0, sess.fills.length - 500);
    // Update matching order if tracked.
    const o = sess.openOrders.get(f.orderId);
    if (o) {
      o.filledQuantity = Math.min(o.quantity, o.filledQuantity + f.quantity);
      o.remainingQuantity = Math.max(0, o.quantity - o.filledQuantity);
      if (o.avgFillPrice == null) o.avgFillPrice = f.price;
      else o.avgFillPrice = (o.avgFillPrice * (o.filledQuantity - f.quantity) + f.price * f.quantity) / Math.max(0.0000001, o.filledQuantity);
      o.fee += f.fee;
      if (o.remainingQuantity <= 0.0000001) o.status = "filled";
      else o.status = "partially_filled";
      o.updatedTime = f.time;
    }
  }

  /* ── Pre-trade risk gate (uses shared RiskEngine). */
  private preTradeRisk(a: CryptoAccountSession, m: CryptoMarket, req: CryptoOrderRequest): RiskResult {
    const equity = a.snapshot?.equityUsd ?? 0;
    if (equity <= 0) return { ok: false, error: "account equity unknown — run sync first", blockedBy: "NO_EQUITY" };
    const refPrice = req.price ?? (m.type === "perp" ? this.lastMarkPrice(a, m.symbol) : 0);
    const leverage = req.leverage ?? 1;
    const tiReq: TiOrderRequest = {
      portfolioId: a.id,
      instrumentId: m.symbol,
      marketClass: "crypto",
      side: req.side === "buy" ? "long" : "short",
      type: (req.type === "limit" ? "limit" : req.type === "stop_limit" ? "stop-limit" : "market"),
      size: req.quantity,
      price: refPrice || undefined,
      stopLoss: req.stopLoss?.price,
      takeProfit: req.takeProfit?.price,
      leverage,
      account: {
        equityUsd: equity,
        positions: [...a.positions.values()].map((p) => ({
          id: p.symbol, instrumentId: p.symbol, marketClass: "crypto",
          side: p.side === "short" ? "short" : "long",
          size: p.quantity, entryPrice: p.entryPrice, currentPrice: p.markPrice,
          pnlUsd: p.unrealizedPnl, pnlPct: p.entryPrice > 0 ? (p.markPrice - p.entryPrice) / p.entryPrice * 100 : 0,
          openedAt: p.openedTime ?? new Date().toISOString(),
        })),
        dailyPnlUsd: this.dailyPnlUsd(a),
        peakEquityUsd: Math.max(equity, a.snapshot?.equityUsd ?? equity),
      },
    };
    const dec = riskEngine.evaluate(tiReq);
    if (!dec.approved) return { ok: false, error: `risk blocked: ${dec.reason ?? dec.blockedBy}`, blockedBy: dec.blockedBy };
    // Symbol allow/deny lists.
    if (a.opts.config?.allowedSymbols?.length && !a.opts.config.allowedSymbols.includes(m.symbol))
      return { ok: false, error: `${m.symbol} not in allowedSymbols`, blockedBy: "SYMBOL_ALLOWLIST" };
    if (a.opts.config?.deniedSymbols?.length && a.opts.config.deniedSymbols.includes(m.symbol))
      return { ok: false, error: `${m.symbol} is in deniedSymbols`, blockedBy: "SYMBOL_DENYLIST" };
    return { ok: true };
  }

  private lastMarkPrice(a: CryptoAccountSession, symbol: string): number {
    return a.positions.get(symbol)?.markPrice ?? 0;
  }

  private dailyPnlUsd(a: CryptoAccountSession): number {
    const cutoff = new Date(Date.now() - 86_400_000).toISOString();
    return a.fills.filter((f) => f.time >= cutoff).reduce((s, f) => s + (f.realizedPnl ?? -f.fee), 0);
  }

  private async backgroundSync(accountId: string) {
    try { await this.sync(accountId, { account: true, positions: true, orders: true }); }
    catch { /* background */ }
  }

  /* ── WebSocket plumbing (overridable) ── */

  /** Create (lazily) the public WS client and attach the parser. */
  private seedPublicWs(sess: CryptoAccountSession, url: string) {
    const ws = new ExchangeWsClient({
      url,
      label: `${this.exchange}:public`,
      parser: (raw) => this.parsePublicMessage(sess, raw),
      pingIntervalMs: this.capabilities.publicWsPingIntervalMs,
      pingMessage: this.publicPingMessage(),
    });
    sess.publicWs = ws;
    ws.on("error", (e) => logger.warn("[crypto] public WS error", { exchange: this.exchange, err: e }));
    ws.connect().catch((e) => logger.warn("[crypto] public WS connect failed", { err: e }));
  }

  private startPrivateWs(sess: CryptoAccountSession, url?: string) {
    if (!url || !this.capabilities.hasPrivateWs) return;
    const ws = new ExchangeWsClient({
      url,
      label: `${this.exchange}:private`,
      parser: (raw) => this.parsePrivateMessage(sess, raw),
      onConnect: async (send) => {
        try {
          // Exchanges that use a listenKey (Binance style) create one before connecting.
          if (this.capabilities.privateWsUsesListenKey) {
            sess.privateListenKey = await this.createListenKey(sess);
            // Subclasses may need to refresh — schedule a keep-alive.
            if (sess.privateListenKeyTimer) clearInterval(sess.privateListenKeyTimer);
            sess.privateListenKeyTimer = setInterval(() => { this.keepAliveListenKey(sess).catch((e) => logger.warn("[crypto] listenKey keepalive failed", { err: (e as Error).message })); }, 30 * 60_000);
          }
          await this.authenticatePrivateWs(sess, send);
        } catch (e) {
          logger.warn("[crypto] private WS auth failed", { exchange: this.exchange, err: (e as Error).message });
        }
      },
      pingIntervalMs: this.capabilities.privateWsPingIntervalMs,
      pingMessage: this.privatePingMessage(),
    });
    sess.privateWs = ws;
    ws.on("error", (e) => logger.warn("[crypto] private WS error", { exchange: this.exchange, err: e }));
    ws.connect().catch((e) => logger.warn("[crypto] private WS connect failed", { err: e }));
  }

  /** Subscribe to ticker for a market on the public WS. Defaults to no-op. */
  protected addPublicTickerSubscription(sess: CryptoAccountSession, m: CryptoMarket, subKey: string) {
    const payload = this.buildTickerSubscribePayload(m);
    const unsubPayload = this.buildTickerUnsubscribePayload(m);
    if (!payload || !sess.publicWs) return;
    const sub: WsSubscription = {
      key: subKey,
      subscribe: payload,
      unsubscribe: unsubPayload ?? undefined,
      onMessage: (p: any) => {
        const tick = this.parseTickerMessage(sess, m, p);
        if (tick) this.dispatchTick(sess, m.symbol, tick.bid, tick.ask);
      },
    };
    sess.publicWs.subscribe(sub);
  }

  /* ── Hooks subclasses MAY override ── */

  /** Parse a public WS frame into zero or more routed events. */
  protected parsePublicMessage(_sess: CryptoAccountSession, _raw: string): Array<{ channel: string; payload: unknown }> { return []; }
  /** Parse a private WS frame into routed events (orders/fills/positions/balances). */
  protected parsePrivateMessage(_sess: CryptoAccountSession, _raw: string): Array<{ channel: string; payload: unknown }> { return []; }
  /** Build the subscribe payload for a ticker channel; returns null to skip WS. */
  protected buildTickerSubscribePayload(_m: CryptoMarket): object | null { return null; }
  /** Build the unsubscribe payload; optional. */
  protected buildTickerUnsubscribePayload(_m: CryptoMarket): object | null { return null; }
  /** Parse a ticker payload into {bid, ask}; null if not a ticker frame. */
  protected parseTickerMessage(_sess: CryptoAccountSession, _m: CryptoMarket, _payload: unknown): { bid: number; ask: number } | null { return null; }
  /** Public ping message to keep WS alive (exchanges vary). */
  protected publicPingMessage(): string | object | (() => string | object) | undefined { return undefined; }
  protected privatePingMessage(): string | object | (() => string | object) | undefined { return undefined; }
  /** Create & return a listenKey for exchanges that use REST-extended user streams (Binance). */
  protected async createListenKey(_sess: CryptoAccountSession): Promise<string | undefined> { return undefined; }
  protected async keepAliveListenKey(_sess: CryptoAccountSession): Promise<void> { return; }
  protected async disposeListenKey(_sess: CryptoAccountSession): Promise<void> { return; }
  /** Cancel order default (returns unsupported; subclasses override when supported). */
  protected async cancelOrderImpl(_sess: CryptoAccountSession, _orderId: string): Promise<OrderResult> {
    return { ok: false, error: "cancelOrder not supported on this exchange" };
  }

  /* ── Abstract (per-exchange) ── */

  protected abstract buildSigner(creds: CryptoCredentials): HttpSigner;
  protected abstract fetchMarkets(sess: CryptoAccountSession): Promise<CryptoMarket[]>;
  protected abstract fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot>;
  protected abstract placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult>;
  protected abstract modifyOrder(sess: CryptoAccountSession, orderId: string, patch: { sl?: number; tp?: number; comment?: string }): Promise<OrderResult>;
  protected abstract closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult>;
  protected abstract fetchCandles(sess: CryptoAccountSession, symbol: string, timeframe: string, count: number): Promise<CryptoCandle[]>;
  protected abstract fetchRecentFills(sess: CryptoAccountSession, sinceIso?: string): Promise<CryptoFill[]>;
  protected abstract authenticatePrivateWs(sess: CryptoAccountSession, send: (p: string | object) => void): void | Promise<void>;
}

/* ── Conversion helpers ──────────────────────────────────── */

export function cryptoPositionsToBroker(
  pos: Map<string, CryptoPosition>,
  markets: Map<string, CryptoMarket>,
): BrokerPosition[] {
  const out: BrokerPosition[] = [];
  for (const p of pos.values()) {
    const m = markets.get(p.symbol);
    const mult = p.side === "short" ? -1 : 1;
    const signedQty = p.quantity * (p.side === "net" ? (p.quantity >= 0 ? 1 : -1) : mult);
    out.push({
      id: p.symbol,
      accountId: "",
      ticket: p.symbol,
      symbol: p.symbol,
      side: signedQty >= 0 ? "long" : "short",
      volume: Math.abs(p.quantity),
      openPrice: p.entryPrice,
      currentPrice: p.markPrice,
      sl: p.stopLoss,
      tp: p.takeProfit,
      openTime: p.openedTime,
      profit: p.unrealizedPnl,
      swap: 0,
      commission: 0,
      comment: `${m?.type ?? "spot"} ${p.marginType} lev=${p.leverage}`,
      magic: 0,
    });
  }
  return out;
}

export function cryptoOrdersToBroker(
  orders: Map<string, CryptoOrder>,
  _markets: Map<string, CryptoMarket>,
): BrokerPendingOrder[] {
  const out: BrokerPendingOrder[] = [];
  for (const o of orders.values()) {
    if (o.status === "filled" || o.status === "canceled" || o.status === "rejected" || o.status === "expired") continue;
    const side: "buy" | "sell" = o.side;
    const isBuy = side === "buy";
    let mtType: BrokerPendingOrder["type"] = isBuy ? "buy_limit" : "sell_limit";
    if (o.type === "market" || o.type === "stop_market" || o.type === "take_profit_market") {
      mtType = isBuy ? "buy_stop" : "sell_stop";
      if (o.type === "market") mtType = isBuy ? "buy_limit" : "sell_limit";
    }
    out.push({
      id: o.id, accountId: "", ticket: o.id,
      symbol: o.symbol,
      type: mtType,
      volume: Math.max(0, o.quantity - o.filledQuantity),
      price: o.price ?? 0,
      sl: o.stopLoss?.price, tp: o.takeProfit?.price, openTime: o.createdTime,
      status: o.status === "partially_filled" ? "partial" : "active",
      filledVolume: o.filledQuantity,
      comment: o.clientOrderId, magic: 0,
    });
  }
  return out;
}

export function cryptoFillsToBroker(accountId: string, fills: CryptoFill[]): BrokerDeal[] {
  return fills.map((f) => ({
    id: f.id, accountId, ticket: f.orderId, orderId: f.orderId,
    symbol: f.symbol, side: f.side === "buy" ? "long" : "short",
    entry: "in" as const, volume: f.quantity, price: f.price,
    profit: f.realizedPnl ?? -f.fee,
    swap: 0, commission: f.fee, time: f.time, comment: f.isMaker ? "maker" : "taker", magic: 0,
  }));
}

export function brokerRequestToCrypto(req: BrokerOrderRequest, m: CryptoMarket): CryptoOrderRequest {
  const side: CryptoOrderSide = req.side === "short" ? "sell" : "buy";
  let type: CryptoOrderType = "market";
  const t = (req.type ?? "market").toLowerCase();
  if (t === "limit") type = "limit";
  else if (t === "stop") type = req.price ? "stop_limit" : "stop_market";
  else if (t === "stop_limit") type = "stop_limit";
  else if (t === "take_profit") type = "take_profit_market";
  const reduce = req.action === "close" || req.sl !== undefined && req.tp === undefined && false;
  return {
    symbol: m.symbol,
    marketType: m.type,
    side, type,
    quantity: req.volume,
    price: req.price,
    triggerPrice: req.price && (type === "stop_market" || type === "stop_limit" || type === "take_profit_market") ? req.price : undefined,
    stopLoss: req.sl ? { price: req.sl } : undefined,
    takeProfit: req.tp ? { price: req.tp } : undefined,
    timeInForce: (req.tif as any) ?? "GTC",
    comment: req.comment,
    magic: req.magic,
    reduceOnly: !!reduce || req.action === "close",
    postOnly: false,
    leverage: m.maxLeverage > 1 ? 1 : undefined,
  };
}

function dedupeFills(existing: CryptoFill[], incoming: CryptoFill[]): CryptoFill[] {
  const seen = new Set<string>(existing.map((f) => f.id));
  for (const f of incoming) { if (!seen.has(f.id)) { existing.push(f); seen.add(f.id); } }
  return existing;
}
