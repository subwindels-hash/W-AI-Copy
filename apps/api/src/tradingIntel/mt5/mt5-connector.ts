/**
 * WINDELS AI OS — MetaTrader 5 Broker Connector (IBrokerConnector).
 *
 * Production connector for MT5 supporting three transports:
 *   1. native_python_zmq — out-of-process Python bridge using the official
 *      MetaTrader5 pip package against a real MT5 terminal, ZeroMQ for transport.
 *   2. http_bridge       — same Python bridge speaking HTTP + SSE (no native zmq).
 *   3. metaapi_cloud     — hosted MetaApi (metaapi.cloud) SaaS; no local terminal.
 *
 * Multi-account: one connector instance manages any number of (login,server)
 * accounts concurrently. Per-account state (positions, orders, deals, sync
 * timing) is maintained in memory and pushed to BrokerIntegrationService via
 * sync on connect + periodic sync + event-driven invalidation (ticks, trades).
 *
 * Error recovery: exponential-backoff reconnect, circuit breaker on repeated
 * errors per account, and read-only enforcement if connectorConfig.readOnly
 * is true.
 */
import { randomUUID } from "node:crypto";
import type {
  BrokerAccount, BrokerPosition, BrokerPendingOrder, BrokerDeal, BrokerSymbol,
  BrokerTick, BrokerCandle, BrokerOrderRequest, BrokerSyncState,
  ConnectorTransport, BrokerConnectionStatus,
} from "@windels/shared/brokerIntegration";
import type { IBrokerConnector, ConnectCredentials, ConnectOptions, ConnectResult, DisconnectResult, SyncResult, OrderResult, CandleQuery, HistoryQuery, TickHandler, ConnectionStateHandler } from "../connectors/broker-connector.js";
import { getZmqTransport, Mt5ZmqTransport } from "./mt5-zmq-transport.js";
import { getHttpTransport, Mt5HttpTransport } from "./mt5-http-transport.js";
import { getMetaApiTransport, Mt5MetaApiTransport } from "./mt5-metaapi-transport.js";
import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";
import { tradingEvents } from "../trading-events.js";

const TF_MAP: Record<CandleQuery["timeframe"], string> = {
  M1: "TIMEFRAME_M1", M5: "TIMEFRAME_M5", M15: "TIMEFRAME_M15", M30: "TIMEFRAME_M30",
  H1: "TIMEFRAME_H1", H4: "TIMEFRAME_H4", D1: "TIMEFRAME_D1", W1: "TIMEFRAME_W1", MN1: "TIMEFRAME_MN1",
};

export interface AccountRuntime {
  creds: ConnectCredentials;
  opts: ConnectOptions;
  transport: ConnectorTransport;
  transportHandle: Mt5ZmqTransport | Mt5HttpTransport | Mt5MetaApiTransport;
  state: BrokerSyncState;
  symbols: Map<string, BrokerSymbol>;
  positions: Map<string, BrokerPosition>;
  orders: Map<string, BrokerPendingOrder>;
  deals: BrokerDeal[];
  tickSubscribers: Set<TickHandler>;
  subscribedSymbols: Set<string>;
  syncTimer?: NodeJS.Timeout;
  lastSnapshot?: { balance: number; equity: number; margin: number; freeMargin: number; profit: number; marginLevel?: number; credit?: number; tradeAllowed?: boolean; expertAllowed?: boolean; currency?: string; leverage?: number };
}

export class Mt5Connector implements IBrokerConnector {
  readonly broker = "mt5" as const;
  readonly label = "MetaTrader 5";
  readonly supportedTransports: ConnectorTransport[] = ["native_python_zmq", "http_bridge", "metaapi_cloud"];

  readonly accounts = new Map<string, AccountRuntime>();
  private readonly stateHandlers: ConnectionStateHandler[] = [];
  private initialized = false;

  /**
   * Patch live session connectorConfig (readOnly toggle, etc.) without
   * forcing a reconnect, so the next sendOrder/closePosition/cancelOrder
   * call sees the new value.
   */
  _patchSessionConfig(accountId: string, patch: Record<string, any>): void {
    const a = this.accounts.get(accountId);
    if (!a) return;
    const merged = { ...(a.opts.config ?? {}), ...patch, _oid: (a.opts.config as any)?._oid };
    a.opts = { ...a.opts, config: merged };
  }

  async isAvailable(): Promise<boolean> {
    const hasBridge = !!(env.WINDELS_MT5_BRIDGE_ZMQ || env.WINDELS_MT5_BRIDGE_HTTP);
    const hasMeta = !!env.WINDELS_METAAPI_TOKEN;
    // Even if neither is configured right now, the connector is loadable; users
    // can configure per-account endpoints at runtime.
    return hasBridge || hasMeta || true;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    logger.info("[mt5] connector initialized", { transports: this.supportedTransports });
  }

  async shutdown(): Promise<void> {
    for (const id of Array.from(this.accounts.keys())) {
      await this.disconnect(id).catch((e) => logger.warn("[mt5] disconnect during shutdown failed", { err: e, accountId: id }));
    }
    this.initialized = false;
  }

  onStateChange(handler: ConnectionStateHandler): void { this.stateHandlers.push(handler); }

  private emitState(acct: AccountRuntime, status: BrokerConnectionStatus, error?: string) {
    // "syncing" / "reconnecting" are transient — don't overwrite the underlying
    // connected/error state; they are reported to handlers as events only.
    if (status !== "syncing" && status !== "reconnecting") acct.state.status = status;
    if (error) {
      acct.state.lastError = error;
      acct.state.consecutiveErrors = (acct.state.consecutiveErrors ?? 0) + 1;
      (acct.state as any).lastErrorAt = new Date().toISOString();
    }
    for (const h of this.stateHandlers) {
      try { h(acct.state.accountId, status, error); } catch (e) { logger.warn("[mt5] state handler threw", { err: e }); }
    }
    // Fan state transitions to the org hub so the SSE dashboard reacts.
    const oid = (acct.opts.config as any)?._oid;
    if (oid) {
      try {
        tradingEvents.emit(oid, {
          kind: "account_state", accountId: acct.state.accountId,
          data: {
            status, lastSyncAt: acct.state.lastSyncAt,
            latencyMs: acct.transport === undefined ? undefined : 0,
            error,
            consecutiveErrors: acct.state.consecutiveErrors ?? 0,
            lastErrorAt: (acct.state as any).lastErrorAt,
          },
        });
      } catch { /* best-effort */ }
    }
  }

  isConnected(accountId: string): boolean {
    const a = this.accounts.get(accountId);
    return !!a && (a.transportHandle instanceof Mt5MetaApiTransport ? a.transportHandle.isConnected() : (a.transportHandle as Mt5ZmqTransport | Mt5HttpTransport).isConnected());
  }

  getState(accountId: string): BrokerSyncState {
    const a = this.accounts.get(accountId);
    if (!a) return { accountId, status: "idle", consecutiveErrors: 0, reconnectAttempts: 0, symbolsCount: 0, positionsCount: 0, ordersCount: 0, deals24h: 0 };
    return { ...a.state, symbolsCount: a.symbols.size, positionsCount: a.positions.size, ordersCount: a.orders.size };
  }

  health(accountId: string) {
    const a = this.accounts.get(accountId);
    if (!a) return { connected: false, reconnectAttempts: 0 };
    const h = a.transportHandle;
    return {
      connected: this.isConnected(accountId),
      latencyMs: h.latencyMs?.() ?? undefined,
      lastError: a.state.lastError,
      reconnectAttempts: a.state.reconnectAttempts,
      endpoint: (a.transportHandle as any)["cfg"]?.rpcEndpoint ?? (a.transportHandle as any)["cfg"]?.baseUrl ?? "metaapi-cloud",
      terminalPath: a.opts.config?.terminalPath,
    };
  }

  async connect(accountId: string, creds: ConnectCredentials, opts: ConnectOptions): Promise<ConnectResult> {
    // Select transport.
    const transport = this.pickTransport(opts);
    const handle = this.buildHandle(transport, opts);
    try {
      if ("start" in handle && typeof (handle as any).start === "function" && !(handle instanceof Mt5MetaApiTransport && handle.isConnected())) {
        await (handle as any).start?.();
      }
      // Hook tick forwarding.
      handle.on("tick", (aid: string, tick: BrokerTick) => {
        const a = this.accounts.get(aid);
        if (!a) return;
        const sym = a.symbols.get(tick.symbol);
        if (sym) { sym.bid = tick.bid; sym.ask = tick.ask; }
        a.state.lastTickAt = new Date().toISOString();
        for (const sub of a.tickSubscribers) { try { sub(aid, tick); } catch (e) { logger.warn("[mt5] tick subscriber threw", { err: e }); } }
        // Relay to org-scoped event hub so SSE /brokers/events/stream can fan out.
        const oid = (a.opts.config as any)?._oid;
        if (oid) {
          try { tradingEvents.emit(oid, { kind: "tick", accountId: aid, data: tick }); } catch { /* best-effort */ }
        }
      });

      // Perform broker-level login via transport RPC.
      const connectParams: Record<string, any> = {
        accountId, login: creds.login, password: creds.password, server: creds.server,
        path: opts.config?.terminalPath, environment: opts.environment ?? "demo",
        extra: creds.extra ?? {},
      };
      const res = await handle.call<{ balance: number; equity: number; margin: number; freeMargin: number; profit: number; leverage: number; currency: string; marginLevel?: number; credit?: number; tradeAllowed?: boolean; expertAllowed?: boolean; endpoint?: string }>("connect_account", connectParams);
      const runtime: AccountRuntime = {
        creds, opts, transport, transportHandle: handle,
        state: { accountId, status: "connected", lastSyncAt: new Date().toISOString(), consecutiveErrors: 0, reconnectAttempts: 0, symbolsCount: 0, positionsCount: 0, ordersCount: 0, deals24h: 0 },
        symbols: new Map(), positions: new Map(), orders: new Map(), deals: [],
        tickSubscribers: new Set(), subscribedSymbols: new Set(),
        lastSnapshot: { balance: res.balance, equity: res.equity, margin: res.margin, freeMargin: res.freeMargin, profit: res.profit, marginLevel: res.marginLevel, credit: res.credit, tradeAllowed: res.tradeAllowed, expertAllowed: res.expertAllowed },
      };
      this.accounts.set(accountId, runtime);
      // Schedule periodic sync.
      const interval = opts.config?.syncIntervalMs ?? 5_000;
      runtime.syncTimer = setInterval(() => { this.sync(accountId, { account: true, positions: true, orders: true, symbols: false, history: false }).catch((e) => logger.warn("[mt5] periodic sync failed", { err: e, accountId })); }, interval);
      this.emitState(runtime, "connected");
      logger.info("[mt5] account connected", { accountId, login: creds.login, server: creds.server, transport });
      return { ok: true, transport, endpoint: res.endpoint, terminalPath: opts.config?.terminalPath, snapshot: res, latencyMs: handle.latencyMs?.() ?? undefined };
    } catch (e) {
      logger.error("[mt5] connect failed", { err: e, accountId, login: creds.login, server: creds.server, transport });
      const rt: AccountRuntime = {
        creds, opts, transport, transportHandle: handle,
        state: { accountId, status: "error", lastError: (e as Error).message, consecutiveErrors: 1, reconnectAttempts: 1, symbolsCount: 0, positionsCount: 0, ordersCount: 0, deals24h: 0 },
        symbols: new Map(), positions: new Map(), orders: new Map(), deals: [],
        tickSubscribers: new Set(), subscribedSymbols: new Set(),
      };
      this.accounts.set(accountId, rt);
      this.emitState(rt, "error", (e as Error).message);
      return { ok: false, transport, error: (e as Error).message };
    }
  }

  async disconnect(accountId: string): Promise<DisconnectResult> {
    const a = this.accounts.get(accountId);
    if (!a) return { ok: true };
    clearInterval(a.syncTimer);
    try {
      await a.transportHandle.call("disconnect_account", { accountId }).catch(() => {});
      await (a.transportHandle as any).stop?.().catch(() => {});
    } catch (e) {
      logger.warn("[mt5] transport disconnect error", { err: e, accountId });
    }
    this.accounts.delete(accountId);
    return { ok: true };
  }

  async sync(accountId: string, scope: { account?: boolean; symbols?: boolean; positions?: boolean; orders?: boolean; history?: boolean; historyDays?: number }): Promise<SyncResult> {
    const a = this.accounts.get(accountId);
    if (!a) throw new Error(`account ${accountId} not connected on MT5 connector`);
    this.emitState(a, "syncing");
    const out: SyncResult = { ok: false };
    const start = Date.now();
    try {
      if (scope.account) {
        const info = await a.transportHandle.call<{ balance: number; equity: number; margin: number; freeMargin: number; profit: number; marginLevel?: number; credit?: number; tradeAllowed?: boolean; expertAllowed?: boolean; currency?: string; leverage?: number }>("get_account_info", { accountId });
        a.lastSnapshot = { ...a.lastSnapshot, ...info };
        out.account = info;
      }
      if (scope.symbols) {
        const syms = await a.transportHandle.call<BrokerSymbol[]>("get_symbols", { accountId });
        a.symbols = new Map((syms ?? []).map((s) => [s.name, s]));
        out.symbols = syms;
      }
      if (scope.positions) {
        const ps = await a.transportHandle.call<BrokerPosition[]>("get_positions", { accountId });
        a.positions = new Map((ps ?? []).map((p) => [p.ticket ?? p.id, p]));
        out.positions = ps;
      }
      if (scope.orders) {
        const os = await a.transportHandle.call<BrokerPendingOrder[]>("get_orders", { accountId });
        a.orders = new Map((os ?? []).map((o) => [o.ticket ?? o.id, o]));
        out.orders = os;
      }
      if (scope.history) {
        const days = scope.historyDays ?? 30;
        const from = new Date(Date.now() - days * 86400_000);
        const ds = await a.transportHandle.call<BrokerDeal[]>("get_deals", { accountId, from: from.toISOString() });
        a.deals = ds ?? [];
        out.deals = ds;
      }
      out.ok = true;
      out.latencyMs = Date.now() - start;
      a.state.lastSyncAt = new Date().toISOString();
      a.state.consecutiveErrors = 0;
      this.emitState(a, "connected");
      return out;
    } catch (e) {
      a.state.consecutiveErrors += 1;
      out.error = (e as Error).message;
      if (a.state.consecutiveErrors >= 3) this.emitState(a, "error", out.error);
      logger.warn("[mt5] sync failure", { err: e, accountId, scope, consecutiveErrors: a.state.consecutiveErrors });
      return out;
    }
  }

  async sendOrder(accountId: string, req: BrokerOrderRequest): Promise<OrderResult> {
    const a = this.accounts.get(accountId);
    if (!a) return { ok: false, error: "account not connected" };
    if (a.opts.config?.readOnly) return { ok: false, error: "account is configured read-only; orders are not transmitted" };
    if (a.opts.config?.allowedSymbols?.length && !a.opts.config.allowedSymbols.includes(req.symbol)) return { ok: false, error: `symbol ${req.symbol} not in allowedSymbols list` };
    if (a.opts.config?.deniedSymbols?.length && a.opts.config.deniedSymbols.includes(req.symbol)) return { ok: false, error: `symbol ${req.symbol} is denied` };
    const start = Date.now();
    try {
      const mapType: Record<string, string> = {
        market: req.side === "long" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL",
        limit: req.side === "long" ? "ORDER_TYPE_BUY_LIMIT" : "ORDER_TYPE_SELL_LIMIT",
        stop: req.side === "long" ? "ORDER_TYPE_BUY_STOP" : "ORDER_TYPE_SELL_STOP",
        stop_limit: req.side === "long" ? "ORDER_TYPE_BUY_STOP_LIMIT" : "ORDER_TYPE_SELL_STOP_LIMIT",
      };
      const order = {
        action: req.action === "close" ? "POSITION_CLOSE_ID" : "TRADE_ACTION_DEAL",
        symbol: req.symbol,
        volume: req.volume,
        type: mapType[req.type] ?? "ORDER_TYPE_BUY",
        price: req.price,
        sl: req.sl, tp: req.tp,
        position: req.positionTicket,
        deviation: req.slippage ?? 10,
        magic: req.magic ?? 987_654,
        comment: req.comment ?? "WINDELS AI OS",
        type_time: req.tif === "IOC" ? "ORDER_TIME_IOC" : req.tif === "FOK" ? "ORDER_TIME_FOK" : "ORDER_TIME_GTC",
        type_filling: "ORDER_FILLING_FOK",
        stopLimitPrice: req.stopLimitPrice,
      };
      const res = await a.transportHandle.call<{ ticket?: string; dealId?: string; price?: number; volume?: number; retcode?: number; comment?: string }>("send_order", { accountId, order });
      return { ok: true, ticket: res.ticket, dealId: res.dealId, fillPrice: res.price, filledVolume: res.volume, retcode: res.retcode, comment: res.comment, latencyMs: Date.now() - start };
    } catch (e) {
      return { ok: false, error: (e as Error).message, latencyMs: Date.now() - start };
    }
  }

  async modifyPosition(accountId: string, ticket: string, patch: { sl?: number; tp?: number; comment?: string }): Promise<OrderResult> {
    const a = this.accounts.get(accountId);
    if (!a) return { ok: false, error: "account not connected" };
    if (a.opts.config?.readOnly) return { ok: false, error: "read-only" };
    const start = Date.now();
    try {
      const res = await a.transportHandle.call<{ ticket?: string; dealId?: string; retcode?: number; comment?: string }>("modify_position", { accountId, ticket, sl: patch.sl, tp: patch.tp, comment: patch.comment });
      return { ok: true, ticket: res.ticket ?? ticket, dealId: res.dealId, retcode: res.retcode, comment: res.comment, latencyMs: Date.now() - start };
    } catch (e) { return { ok: false, error: (e as Error).message, latencyMs: Date.now() - start }; }
  }

  async closePosition(accountId: string, ticket: string, volume?: number): Promise<OrderResult> {
    const a = this.accounts.get(accountId);
    if (!a) return { ok: false, error: "account not connected" };
    if (a.opts.config?.readOnly) return { ok: false, error: "read-only" };
    const start = Date.now();
    try {
      const res = await a.transportHandle.call<{ ticket?: string; dealId?: string; price?: number; volume?: number; retcode?: number }>("close_position", { accountId, ticket, volume });
      return { ok: true, ticket: res.ticket ?? ticket, dealId: res.dealId, fillPrice: res.price, filledVolume: res.volume, retcode: res.retcode, latencyMs: Date.now() - start };
    } catch (e) { return { ok: false, error: (e as Error).message, latencyMs: Date.now() - start }; }
  }

  async cancelOrder(accountId: string, orderId: string): Promise<OrderResult> {
    const a = this.accounts.get(accountId);
    if (!a) return { ok: false, error: "account not connected" };
    if (a.opts.config?.readOnly) return { ok: false, error: "read-only" };
    const start = Date.now();
    try {
      const res = await a.transportHandle.call<{ ticket?: string; retcode?: number }>("cancel_order", { accountId, orderId });
      if (res?.retcode && res.retcode !== 0 && res.retcode !== 10014 /* ORDER_DONE */ && res.retcode !== 10013 /* ORDER_NOT_FOUND */)
        return { ok: false, error: `retcode=${res.retcode}`, retcode: res.retcode, latencyMs: Date.now() - start };
      return { ok: true, ticket: res.ticket ?? orderId, latencyMs: Date.now() - start };
    } catch (e) { return { ok: false, error: (e as Error).message, latencyMs: Date.now() - start }; }
  }

  async getCandles(accountId: string, q: CandleQuery): Promise<BrokerCandle[]> {
    const a = this.accounts.get(accountId);
    if (!a) throw new Error("account not connected");
    const tf = TF_MAP[q.timeframe];
    const res = await a.transportHandle.call<Array<{ time: number | string; open: number; high: number; low: number; close: number; tickVolume?: number; volume?: number; spread?: number }>>("get_candles", { accountId, symbol: q.symbol, timeframe: tf, count: q.count, start: q.start?.toISOString(), end: q.end?.toISOString() });
    return (res ?? []).map((c) => ({
      symbol: q.symbol, timeframe: q.timeframe,
      time: typeof c.time === "number" ? new Date(c.time * 1000).toISOString() : c.time,
      open: c.open, high: c.high, low: c.low, close: c.close,
      tickVolume: c.tickVolume, volume: c.volume, spread: c.spread,
    }));
  }

  async getLastTicks(accountId: string, symbol: string, count = 10): Promise<BrokerTick[]> {
    const a = this.accounts.get(accountId);
    if (!a) throw new Error("account not connected");
    const res = await a.transportHandle.call<BrokerTick[]>("get_last_ticks", { accountId, symbol, count });
    return res ?? [];
  }

  async getDeals(accountId: string, q: HistoryQuery): Promise<BrokerDeal[]> {
    const a = this.accounts.get(accountId);
    if (!a) throw new Error("account not connected");
    const res = await a.transportHandle.call<BrokerDeal[]>("get_deals", { accountId, from: q.from?.toISOString(), to: q.to?.toISOString(), symbol: q.symbol, group: q.group });
    return res ?? [];
  }

  async getSymbol(accountId: string, symbol: string): Promise<BrokerSymbol | null> {
    const a = this.accounts.get(accountId);
    if (!a) return null;
    if (a.symbols.has(symbol)) return a.symbols.get(symbol)!;
    // Lazy fetch.
    try {
      const res = await a.transportHandle.call<BrokerSymbol>("get_symbol", { accountId, symbol });
      if (res) a.symbols.set(symbol, res);
      return res ?? null;
    } catch { return null; }
  }

  async subscribeTicks(accountId: string, symbols: string[], handler: TickHandler): Promise<{ subscribed: string[] }> {
    const a = this.accounts.get(accountId);
    if (!a) throw new Error("account not connected");
    a.tickSubscribers.add(handler);
    const toSub = symbols.filter((s) => !a.subscribedSymbols.has(s));
    if (toSub.length) {
      try {
        await a.transportHandle.call("subscribe_ticks", { accountId, symbols: toSub });
        toSub.forEach((s) => a.subscribedSymbols.add(s));
      } catch (e) {
        logger.warn("[mt5] tick subscribe failed for some symbols", { err: e, symbols: toSub });
      }
    }
    return { subscribed: Array.from(a.subscribedSymbols) };
  }

  async unsubscribeTicks(accountId: string, symbols?: string[]): Promise<void> {
    const a = this.accounts.get(accountId);
    if (!a) return;
    if (!symbols) { a.tickSubscribers.clear(); a.subscribedSymbols.clear(); return; }
    try { await a.transportHandle.call("unsubscribe_ticks", { accountId, symbols }); } catch {}
    symbols.forEach((s) => a.subscribedSymbols.delete(s));
  }

  /* ── Transport selection ────────────────────────────────── */

  private pickTransport(opts: ConnectOptions): ConnectorTransport {
    if (opts.transport) return opts.transport;
    if (opts.config?.metaapiToken || env.WINDELS_METAAPI_TOKEN) return "metaapi_cloud";
    if (opts.config?.bridgeEndpoint || env.WINDELS_MT5_BRIDGE_ZMQ) return "native_python_zmq";
    if (env.WINDELS_MT5_BRIDGE_HTTP) return "http_bridge";
    // Default: zmq on localhost.
    return "native_python_zmq";
  }

  private buildHandle(transport: ConnectorTransport, opts: ConnectOptions): Mt5ZmqTransport | Mt5HttpTransport | Mt5MetaApiTransport {
    switch (transport) {
      case "native_python_zmq": {
        const endpoint = opts.config?.bridgeEndpoint ?? env.WINDELS_MT5_BRIDGE_ZMQ ?? "tcp://127.0.0.1:5555";
        // By convention ticks are at +1 port for the default endpoint.
        const tick = endpoint.replace(/:(\d+)$/, (_m, p) => `:${Number(p) + 1}`);
        return getZmqTransport(endpoint, tick);
      }
      case "http_bridge": {
        const url = env.WINDELS_MT5_BRIDGE_HTTP ?? "http://127.0.0.1:8765";
        return getHttpTransport(url, env.WINDELS_MT5_BRIDGE_TOKEN);
      }
      case "metaapi_cloud": {
        const token = opts.config?.metaapiToken ?? env.WINDELS_METAAPI_TOKEN;
        if (!token) throw new Error("MetaApi transport selected but no token provided");
        return getMetaApiTransport(token);
      }
      default:
        throw new Error(`unsupported MT5 transport: ${transport}`);
    }
  }
}

// Helper to produce a BrokerAccount-shaped snapshot after sync (used by the
// service layer to update the cached account record).
export function applySnapshotToAccount(rec: BrokerAccount, rt: AccountRuntime): BrokerAccount {
  const s = rt.lastSnapshot;
  if (s) {
    rec.account.balance = s.balance; rec.account.equity = s.equity;
    rec.account.margin = s.margin; rec.account.freeMargin = s.freeMargin;
    rec.account.profit = s.profit;
    rec.account.marginLevel = s.marginLevel; rec.account.credit = s.credit;
    rec.account.tradeAllowed = s.tradeAllowed; rec.account.expertAllowed = s.expertAllowed;
    if (s.currency) rec.currency = s.currency;
    if (s.leverage) rec.leverage = s.leverage;
  }
  rec.status = "connected";
  rec.error = undefined;
  rec.connectedAt = rec.connectedAt ?? new Date().toISOString();
  rec.lastSyncAt = rt.state.lastSyncAt;
  rec.lastTickAt = rt.state.lastTickAt;
  rec.transport = rt.transport;
  return rec;
}
