/**
 * WINDELS AI OS — Base class for crypto exchange connectors.
 *
 * Crypto connectors extend IBrokerConnector so they slot directly into the
 * existing BrokerIntegrationService, dashboard, risk engine, and AI agent
 * workflow. Subclasses implement exchange-specific REST/WS signing, symbol
 * normalization, and message parsing.
 *
 * Responsibilities of this base:
 *   - Account sessions map (multi-account; one instance ↔ many API keys)
 *   - HttpSigner + ExchangeHttpClient + ExchangeWsClient lifecycle
 *   - Rate-limit / reconnect plumbing
 *   - Normalized order/position/balance/candle/ticker dispatch onto the
 *     broker-integration shapes (BrokerPosition, BrokerPendingOrder,
 *     BrokerDeal, BrokerSymbol, BrokerTick, BrokerCandle)
 *   - Tick fan-out to subscribers (same pattern as Mt5Connector)
 *   - Honoring connectorConfig.readOnly globally for order send/modify/cancel
 *
 * Subclasses implement:
 *   - id, label, capabilities
 *   - buildSigner(creds) → HttpSigner
 *   - normalizeSymbol(raw) / toRawSymbol(unified)
 *   - parseMarkets() → CryptoMarket[] (load instrument metadata)
 *   - placeOrder() / cancelOrder() / modifyOrder() / fetchBalances()
 *   - fetchPositions() / fetchOpenOrders() / fetchOrdersHistory()
 *   - fetchTicker(sym) / fetchOrderBook(sym) / fetchCandles(sym,tf,count)
 *   - buildWsParser() / buildWsAuth() if publicWs/privateWs used
 */
import { EventEmitter } from "node:events";
import type {
  BrokerType, ConnectorTransport, BrokerConnectionStatus,
  BrokerPosition, BrokerPendingOrder, BrokerDeal, BrokerSymbol, BrokerTick,
  BrokerCandle, BrokerSyncState, BrokerOrderRequest,
} from "@windels/shared/brokerIntegration";
import type {
  CryptoExchangeId, CryptoCredentials, CryptoConnectorCapabilities,
  CryptoMarket, CryptoMarketType, CryptoOrderRequest, CryptoOrder,
  CryptoPosition, CryptoFill, CryptoBalance, CryptoAccountSnapshot,
  CryptoCandle,
} from "@windels/shared/crypto";
import type {
  IBrokerConnector, ConnectCredentials, ConnectOptions, ConnectResult,
  DisconnectResult, SyncResult, OrderResult, CandleQuery, HistoryQuery,
  TickHandler, ConnectionStateHandler,
} from "../connectors/broker-connector.js";
import { ExchangeHttpClient, type HttpSigner } from "./exchange-http.js";
import { ExchangeWsClient } from "./exchange-ws.js";
import { logger } from "../../config/logger.js";

export interface CryptoAccountSession {
  id: string;
  login: string;
  creds: CryptoCredentials;
  opts: ConnectOptions;
  http: ExchangeHttpClient;
  /** Public WS (lazy init). */
  publicWs?: ExchangeWsClient;
  /** Private/user-data WS (lazy init). */
  privateWs?: ExchangeWsClient;
  name: string;
  environment: string;
  status: BrokerConnectionStatus;
  lastError?: string;
  connectedAt: string;
  lastSyncAt?: string;
  lastTickAt?: string;
  latencyMs: number;
  markets: Map<string, CryptoMarket>; // unified symbol -> market
  marketsByRaw: Map<string, CryptoMarket>; // raw symbol -> market
  balances: Map<string, CryptoBalance>;
  positions: Map<string, CryptoPosition>;
  openOrders: Map<string, CryptoOrder>;
  fills: CryptoFill[];
  snapshot?: CryptoAccountSnapshot;
  tickHandlers: Map<string, TickHandler>;
}

export interface BaseCryptoOpts {
  exchange: CryptoExchangeId;
  label: string;
  brokerType?: BrokerType; // defaults to exchange id
  capabilities: CryptoConnectorCapabilities;
}

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
    const baseUrl = opts.config?.bridgeEndpoint ??
      (testnet && this.capabilities.testnetRestUrl ? this.capabilities.testnetRestUrl : this.capabilities.restBaseUrl);

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
      tickHandlers: new Map(),
    };
    this.accounts.set(accountId, sess);

    try {
      // 1. Load markets.
      const markets = await this.fetchMarkets(sess);
      for (const m of markets) {
        sess.markets.set(m.symbol, m);
        sess.marketsByRaw.set(m.rawSymbol, m);
      }
      // 2. Initial account snapshot.
      const snap = await this.fetchAccountSnapshot(sess);
      sess.snapshot = snap;
      for (const b of snap.balances) sess.balances.set(b.asset, b);
      for (const p of snap.positions) sess.positions.set(p.symbol, p);
      for (const o of snap.openOrders) sess.openOrders.set(o.id, o);

      // 3. Optional WS startup.
      if ((opts.config?.tickStream ?? true) && this.capabilities.hasPublicWs) {
        try { this.startPublicWs(sess); } catch (e) { logger.warn("[crypto] public WS failed to start", { err: e }); }
      }
      if (this.capabilities.hasPrivateWs) {
        try { this.startPrivateWs(sess); } catch (e) { logger.warn("[crypto] private WS failed to start", { err: e }); }
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
          tradeAllowed: snap.canTrade && !opts.config?.readOnly, expertAllowed: snap.canTrade,
        },
        latencyMs: 0,
      };
    } catch (e) {
      sess.status = "error";
      sess.lastError = (e as Error).message;
      this.emitState(accountId, "error", sess.lastError);
      return { ok: false, transport: "exchange_rest", error: sess.lastError };
    }
  }

  async disconnect(accountId: string): Promise<DisconnectResult> {
    const a = this.accounts.get(accountId);
    if (!a) return { ok: false, error: "not connected" };
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
    try {
      if (scope.symbols) {
        // refresh markets cache
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
        digits: m.pricePrecision,
        point: m.tickSize,
        contractSize: m.contractSize,
        volumeMin: m.minQty ?? 0,
        volumeMax: 1_000_000,
        volumeStep: m.stepSize,
        spread: 0,
        tradeMode: m.active ? "full" : "disabled",
        currencyBase: m.base,
        currencyProfit: m.quote,
      }));
      const positions = cryptoPositionsToBroker(a.positions, a.markets);
      const orders = cryptoOrdersToBroker(a.openOrders, a.markets);
      const deals = cryptoFillsToBroker(accountId, a.fills);
      const account = {
        balance: snap.equityUsd, equity: snap.equityUsd,
        margin: 0, freeMargin: snap.equityUsd, profit: snap.unrealizedPnlUsd ?? 0,
        tradeAllowed: snap.canTrade && !a.opts.config?.readOnly, expertAllowed: snap.canTrade,
      };
      return { ok: true, latencyMs: a.latencyMs, account, symbols, positions, orders, deals };
    } catch (e) {
      a.status = "error"; a.lastError = (e as Error).message;
      return { ok: false, error: a.lastError, latencyMs: a.latencyMs };
    }
  }

  /* ── Orders ─────────────────────────────────────────────── */

  async sendOrder(accountId: string, req: BrokerOrderRequest): Promise<OrderResult> {
    const a = this.mustGet(accountId);
    if (a.opts.config?.readOnly) return { ok: false, retcode: -1, error: "read-only mode" };
    const market = a.markets.get(req.symbol);
    if (!market) return { ok: false, retcode: -2, error: `unknown symbol ${req.symbol}` };
    const cryptoReq = brokerRequestToCrypto(req, market);
    const started = Date.now();
    try {
      const r = await this.placeOrder(a, cryptoReq);
      const ms = Date.now() - started;
      a.latencyMs = ms;
      // Best-effort refresh after fill.
      this.backgroundSync(accountId).catch(() => {});
      return r;
    } catch (e) {
      const msg = (e as Error).message;
      return { ok: false, error: msg, latencyMs: Date.now() - started };
    }
  }

  async modifyPosition(accountId: string, ticket: string, patch: { sl?: number; tp?: number; comment?: string }): Promise<OrderResult> {
    const a = this.mustGet(accountId);
    if (a.opts.config?.readOnly) return { ok: false, error: "read-only mode" };
    try { return await this.modifyOrder(a, ticket, patch); }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  async closePosition(accountId: string, ticket: string, volume?: number): Promise<OrderResult> {
    const a = this.mustGet(accountId);
    if (a.opts.config?.readOnly) return { ok: false, error: "read-only mode" };
    try {
      const r = await this.closePositionImpl(a, ticket, volume);
      this.backgroundSync(accountId).catch(() => {});
      return r;
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  /* ── Market data ──────────────────────────────────────── */

  async getCandles(accountId: string, q: CandleQuery): Promise<BrokerCandle[]> {
    const a = this.mustGet(accountId);
    const tf = q.timeframe;
    const candles = await this.fetchCandles(a, q.symbol, tf, q.count);
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
    return cryptoFillsToBroker(accountId, fills);
  }

  async subscribeTicks(accountId: string, symbols: string[], handler: TickHandler): Promise<{ subscribed: string[] }> {
    const a = this.mustGet(accountId);
    const key = "h" + a.tickHandlers.size;
    a.tickHandlers.set(key, handler);
    const ok: string[] = [];
    for (const s of symbols) if (a.markets.has(s)) ok.push(s);
    // TODO: per-symbol WS ticker subscribe (Phase 1 — market data is polled; WS is wired in Phase 2)
    return { subscribed: ok };
  }

  async unsubscribeTicks(accountId: string, _symbols?: string[]): Promise<void> {
    const a = this.accounts.get(accountId);
    if (a) a.tickHandlers.clear();
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

  /* ── Helpers ──────────────────────────────────────────── */

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

  protected startPublicWs(sess: CryptoAccountSession) {
    if (!this.capabilities.publicWsUrl) return;
    // Phase 1: WS client is created but per-channel subscriptions are wired
    // in a follow-up once market-data WS parsing is complete for each exchange.
    const ws = new ExchangeWsClient({ url: this.capabilities.publicWsUrl, label: `${this.exchange}:public` });
    sess.publicWs = ws;
    ws.on("error", (e) => logger.warn("[crypto] public WS error", { exchange: this.exchange, err: e }));
    ws.connect().catch((e) => logger.warn("[crypto] public WS connect failed", { err: e }));
  }

  protected startPrivateWs(sess: CryptoAccountSession) {
    if (!this.capabilities.privateWsUrl) return;
    const ws = new ExchangeWsClient({
      url: this.capabilities.privateWsUrl,
      label: `${this.exchange}:private`,
      onConnect: (send) => this.authenticatePrivateWs(sess, send),
    });
    sess.privateWs = ws;
    ws.on("error", (e) => logger.warn("[crypto] private WS error", { exchange: this.exchange, err: e }));
    ws.connect().catch((e) => logger.warn("[crypto] private WS connect failed", { err: e }));
  }

  private async backgroundSync(accountId: string) {
    try { await this.sync(accountId, { account: true, positions: true, orders: true }); }
    catch { /* background */ }
  }

  /* ── Abstract (per-exchange) ──────────────────────────── */

  /** Build the HTTP signer for a given set of credentials. */
  protected abstract buildSigner(creds: CryptoCredentials): HttpSigner;

  /** Load instrument/market metadata (all types the connector supports). */
  protected abstract fetchMarkets(sess: CryptoAccountSession): Promise<CryptoMarket[]>;

  /** Fetch account snapshot — balances, positions, open orders. */
  protected abstract fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot>;

  /** Place a normalized order; return an OrderResult. */
  protected abstract placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult>;

  /** Modify an existing order's SL/TP (or price/qty where supported). */
  protected abstract modifyOrder(sess: CryptoAccountSession, orderId: string, patch: { sl?: number; tp?: number; comment?: string }): Promise<OrderResult>;

  /** Close an open position (market reduce-only order). */
  protected abstract closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult>;

  /** OHLCV candles. */
  protected abstract fetchCandles(sess: CryptoAccountSession, symbol: string, timeframe: string, count: number): Promise<CryptoCandle[]>;

  /** Recent fills (since ISO timestamp). */
  protected abstract fetchRecentFills(sess: CryptoAccountSession, sinceIso?: string): Promise<CryptoFill[]>;

  /** Send auth message on private WS connect. */
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
      accountId: "", // caller fills
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
    out.push({
      id: o.id, accountId: "", ticket: o.id,
      symbol: o.symbol,
      type: o.type.includes("limit") ? "buy_limit" : o.type.includes("stop") ? "buy_stop" : "buy_limit",
      volume: o.quantity - o.filledQuantity,
      price: o.price ?? 0,
      sl: undefined, tp: undefined, openTime: o.createdTime,
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
  const side: CryptoOrderRequest["side"] = req.side === "short" ? "sell" : "buy";
  let type: CryptoOrderRequest["type"] = "market";
  if (req.type === "limit") type = "limit";
  else if (req.type === "stop") type = req.price ? "stop_limit" : "stop_market";
  return {
    symbol: m.symbol,
    marketType: m.type,
    side, type,
    quantity: req.volume,
    price: req.price,
    stopLoss: req.sl ? { price: req.sl } : undefined,
    takeProfit: req.tp ? { price: req.tp } : undefined,
    timeInForce: "GTC",
    comment: req.comment,
    magic: req.magic,
    reduceOnly: false,
  };
}

function dedupeFills(existing: CryptoFill[], incoming: CryptoFill[]): CryptoFill[] {
  const seen = new Set<string>(existing.map((f) => f.id));
  for (const f of incoming) { if (!seen.has(f.id)) { existing.push(f); seen.add(f.id); } }
  return existing;
}
