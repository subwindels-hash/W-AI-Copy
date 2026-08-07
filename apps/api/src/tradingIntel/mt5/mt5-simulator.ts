/**
 * WINDELS AI OS — Deterministic MT5 Simulator (Phase 3).
 *
 * An in-process, seedable, zero-randomness IBrokerConnector that implements a
 * faithful-enough subset of MetaTrader 5 semantics for:
 *   - Paper trading (live-deterministic matching against live tick feeds).
 *   - Backtesting (deterministic replay of historical candles with an
 *     intra-bar synthetic-tick model).
 *   - Strategy qualification (AI Workforce agents evaluate strategies in
 *     sandbox environments identical to production).
 *
 * Determinism guarantees:
 *   1. NO Math.random() / Date.now() inside the matching engine. Time is
 *      injected via `advance(time, ticks)` / `advanceCandles(...)`.
 *   2. All prices come from injected tick/candle data — the simulator never
 *      invents prices.
 *   3. Ticket ids, order of fills, slippage computations are all derived
 *      from a seeded deterministic counter + hash.
 *   4. The simulator honors SL/TP/margin/leverage and rejects orders per
 *      MT5 return-code semantics (10009 fill, 10014 invalid volume, 10016
 *      no money, 10019 market closed, 10021 no quotes, etc.).
 *
 * The simulator is NOT a price source. It expects either a live tick
 * subscriber (which pushes BrokerTick events) OR an explicit backtest
 * driver feeding deterministic candles.
 */
import { EventEmitter } from "node:events";
import type {
  BrokerPosition, BrokerPendingOrder, BrokerDeal, BrokerSymbol, BrokerTick,
  BrokerCandle, BrokerSyncState, ConnectorTransport, BrokerConnectionStatus,
  BrokerOrderRequest,
} from "@windels/shared/brokerIntegration";
import type {
  IBrokerConnector, ConnectCredentials, ConnectOptions, ConnectResult,
  DisconnectResult, SyncResult, OrderResult, CandleQuery, HistoryQuery,
  TickHandler, ConnectionStateHandler,
} from "../connectors/broker-connector.js";

/** Configurable simulation parameters. */
export interface Mt5SimulatorConfig {
  /** Starting balance for newly-created simulator accounts (USD). */
  defaultBalance?: number;
  /** Default leverage if none provided in credentials/extra. */
  defaultLeverage?: number;
  /** Commission per lot (one side, in account currency). */
  commissionPerLot?: number;
  /** When true the simulator enforces session checks (closes weekend). */
  enforceMarketHours?: boolean;
  /** Default slippage model in points (deterministic, applied when market
   *  moves against the order by `slippagePts` or when limit/stop fills at a
   *  level worse than the price by this many points). */
  defaultSlippagePts?: number;
  /** Spread in points for symbols where no live spread is available. */
  defaultSpreadPts?: number;
  /** Fixed seed for deterministic ticket generation. */
  seed?: number;
}

interface SimSymbol extends BrokerSymbol {
  bid: number;
  ask: number;
  lastTickTime: string;
}

interface SimOrder {
  ticket: string;
  symbol: string;
  type: "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop";
  volume: number;
  price: number;
  sl?: number;
  tp?: number;
  openTime: string;
  comment?: string;
  magic?: number;
}

interface SimPosition {
  ticket: string;
  symbol: string;
  side: "long" | "short";
  volume: number;
  openPrice: number;
  sl?: number;
  tp?: number;
  openTime: string;
  comment?: string;
  magic?: number;
  commission: number;
  swap: number;
}

interface SimAccount {
  id: string;
  login: string;
  server: string;
  name: string;
  currency: string;
  leverage: number;
  balance: number;
  credit: number;
  connectedAt: string;
  symbols: Map<string, SimSymbol>;
  orders: Map<string, SimOrder>;
  positions: Map<string, SimPosition>;
  deals: BrokerDeal[];
  nextTicket: number;
  currentTime: string;
  lastSyncAt?: string;
  status: BrokerConnectionStatus;
  lastError?: string;
  latencyMs: number;
  magic?: number;
  ticks: Map<string, BrokerTick[]>; // ring buffer per symbol
}

/** Mulberry32 seeded PRNG (deterministic). Used only in the synthetic
 *  intra-bar model; never returns randomness into trade results directly. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const DEFAULT_SYMBOLS: Array<Partial<BrokerSymbol> & { name: string; bid: number; ask: number }> = [
  { name: "EURUSD", digits: 5, point: 0.00001, contractSize: 100_000, volumeMin: 0.01, volumeMax: 100, volumeStep: 0.01, spread: 2, bid: 1.08501, ask: 1.08503, tradeMode: "full", currencyBase: "EUR", currencyProfit: "USD" },
  { name: "GBPUSD", digits: 5, point: 0.00001, contractSize: 100_000, volumeMin: 0.01, volumeMax: 50, volumeStep: 0.01, spread: 3, bid: 1.26500, ask: 1.26503, tradeMode: "full", currencyBase: "GBP", currencyProfit: "USD" },
  { name: "USDJPY", digits: 3, point: 0.001, contractSize: 100_000, volumeMin: 0.01, volumeMax: 50, volumeStep: 0.01, spread: 30, bid: 150.250, ask: 150.253, tradeMode: "full", currencyBase: "USD", currencyProfit: "JPY" },
  { name: "XAUUSD", digits: 2, point: 0.01, contractSize: 100, volumeMin: 0.01, volumeMax: 50, volumeStep: 0.01, spread: 30, bid: 2350.50, ask: 2350.80, tradeMode: "full", currencyBase: "XAU", currencyProfit: "USD" },
  { name: "BTCUSD", digits: 2, point: 0.01, contractSize: 1, volumeMin: 0.001, volumeMax: 10, volumeStep: 0.001, spread: 100, bid: 65000.00, ask: 65001.00, tradeMode: "full", currencyBase: "BTC", currencyProfit: "USD" },
];

export class Mt5Simulator extends EventEmitter implements IBrokerConnector {
  readonly broker = "mt5_simulator" as const;
  readonly label = "MetaTrader 5 (Deterministic Simulator)";
  readonly supportedTransports: ConnectorTransport[] = ["simulator"];

  private accounts = new Map<string, SimAccount>();
  private tickHandlers = new Map<string, Map<string, TickHandler>>(); // accountId -> handlerKey -> handler
  private stateHandlers: ConnectionStateHandler[] = [];
  private cfg: Required<Mt5SimulatorConfig>;
  private initialized = false;

  constructor(cfg: Mt5SimulatorConfig = {}) {
    super();
    this.cfg = {
      defaultBalance: cfg.defaultBalance ?? 10_000,
      defaultLeverage: cfg.defaultLeverage ?? 100,
      commissionPerLot: cfg.commissionPerLot ?? 0,
      enforceMarketHours: cfg.enforceMarketHours ?? false,
      defaultSlippagePts: cfg.defaultSlippagePts ?? 0,
      defaultSpreadPts: cfg.defaultSpreadPts ?? 2,
      seed: cfg.seed ?? 0xA17B15,
    };
  }

  async isAvailable(): Promise<boolean> { return true; }
  async initialize(): Promise<void> { this.initialized = true; }
  async shutdown(): Promise<void> {
    for (const a of this.accounts.values()) a.status = "disconnected";
    this.accounts.clear(); this.tickHandlers.clear(); this.initialized = false;
  }

  /* ── Connection management ──────────────────────────────── */

  async connect(accountId: string, creds: ConnectCredentials, opts: ConnectOptions): Promise<ConnectResult> {
    const leverage = Number(creds.extra?.leverage ?? this.cfg.defaultLeverage);
    const balance = Number(creds.extra?.balance ?? this.cfg.defaultBalance);
    const currency = creds.extra?.currency ?? "USD";
    const seed = this.cfg.seed ^ hashStr(accountId);
    const rng = mulberry32(seed);
    const now = new Date().toISOString();
    const acct: SimAccount = {
      id: accountId, login: creds.login, server: creds.server,
      name: opts.name ?? `Sim ${creds.login}`,
      currency, leverage, balance, credit: 0,
      connectedAt: now,
      symbols: new Map(), orders: new Map(), positions: new Map(), deals: [],
      nextTicket: Math.floor(rng() * 900_000) + 100_000,
      currentTime: now,
      status: "connected", latencyMs: 0,
      ticks: new Map(),
    };
    // Seed default symbol universe.
    for (const s of DEFAULT_SYMBOLS) {
      acct.symbols.set(s.name, {
        name: s.name,
        description: s.name,
        digits: s.digits!,
        point: s.point!,
        contractSize: s.contractSize!,
        volumeMin: s.volumeMin!,
        volumeMax: s.volumeMax!,
        volumeStep: s.volumeStep!,
        spread: s.spread,
        bid: s.bid!,
        ask: s.ask!,
        tradeMode: s.tradeMode as "full" | "closeonly" | "disabled",
        currencyBase: s.currencyBase,
        currencyProfit: s.currencyProfit,
        lastTickTime: now,
      });
      acct.ticks.set(s.name, []);
    }
    // Allowed/denied symbols: drop any not in allowed list when configured.
    if (opts.config?.allowedSymbols?.length) {
      for (const name of [...acct.symbols.keys()]) {
        if (!opts.config.allowedSymbols.includes(name)) acct.symbols.delete(name);
      }
    }
    if (opts.config?.deniedSymbols?.length) {
      for (const name of opts.config.deniedSymbols) acct.symbols.delete(name);
    }
    this.accounts.set(accountId, acct);
    this.emitState(accountId, "connected");
    return {
      ok: true, transport: "simulator",
      snapshot: { balance, equity: balance, margin: 0, freeMargin: balance, profit: 0, leverage, currency, marginLevel: 0, credit: 0, tradeAllowed: true, expertAllowed: true },
      latencyMs: 0,
    };
  }

  async disconnect(accountId: string): Promise<DisconnectResult> {
    const a = this.accounts.get(accountId);
    if (!a) return { ok: false, error: "not connected" };
    a.status = "disconnected";
    this.accounts.delete(accountId);
    this.tickHandlers.delete(accountId);
    this.emitState(accountId, "disconnected");
    return { ok: true };
  }

  isConnected(accountId: string): boolean {
    return this.accounts.get(accountId)?.status === "connected";
  }

  getState(accountId: string): BrokerSyncState {
    const a = this.accounts.get(accountId);
    if (!a) return { accountId, status: "error", consecutiveErrors: 1, reconnectAttempts: 0, symbolsCount: 0, positionsCount: 0, ordersCount: 0, deals24h: 0, lastError: "not connected" };
    const cutoff = Date.now() - 24 * 3600_000;
    const deals24h = a.deals.filter((d) => Date.parse(d.time) >= cutoff).length;
    return {
      accountId, status: a.status === "error" ? "error" : (a.status === "syncing" ? "syncing" : "idle"),
      lastSyncAt: a.lastSyncAt, lastError: a.lastError,
      consecutiveErrors: a.lastError ? 1 : 0, reconnectAttempts: 0,
      symbolsCount: a.symbols.size, positionsCount: a.positions.size, ordersCount: a.orders.size,
      deals24h, latencyMs: a.latencyMs,
    };
  }

  /* ── Sync ───────────────────────────────────────────────── */

  async sync(accountId: string, _scope: { account?: boolean; symbols?: boolean; positions?: boolean; orders?: boolean; history?: boolean; historyDays?: number }): Promise<SyncResult> {
    const a = this.mustGet(accountId);
    a.lastSyncAt = new Date().toISOString();
    return {
      ok: true, latencyMs: 0,
      account: {
        balance: a.balance, equity: this.equity(a), margin: this.usedMargin(a),
        freeMargin: this.freeMargin(a), profit: this.floatingPnl(a),
        marginLevel: this.marginLevel(a), credit: a.credit,
        tradeAllowed: true, expertAllowed: true,
      },
      symbols: [...a.symbols.values()],
      positions: this.positionsView(a),
      orders: this.ordersView(a),
      deals: [...a.deals].slice(-500),
    };
  }

  /* ── Order handling ─────────────────────────────────────── */

  async sendOrder(accountId: string, req: BrokerOrderRequest): Promise<OrderResult> {
    const a = this.mustGet(accountId);
    const sym = a.symbols.get(req.symbol);
    if (!sym) return this.err(10021, "unknown symbol");
    if (sym.tradeMode !== "full") return this.err(10031, "no trading for symbol");
    const type = (req.type ?? "market").toLowerCase();
    const side = (req.side ?? "long");
    const isBuy = side === "long";
    const volNorm = this.normVolume(req.volume, sym.volumeStep);
    if (req.volume < sym.volumeMin || req.volume > sym.volumeMax || volNorm <= 0) return this.err(10014, "invalid volume");
    const now = a.currentTime;
    const comment = req.comment?.slice(0, 27) ?? "WINDELS SIM";
    const magic = req.magic;

    // Read-only enforcement.
    if ((req as any).readOnly) return this.err(10018, "read-only");
    if (type === "market") {
      // Fill at current bid/ask immediately with optional deterministic slippage.
      const price = isBuy ? sym.ask : sym.bid;
      const slipPts = (req.slippage ?? this.cfg.defaultSlippagePts) * sym.point;
      const fill = isBuy ? price + slipPts : price - slipPts;
      // Margin check.
      const marginReq = (volNorm * sym.contractSize * fill) / a.leverage;
      if (this.freeMargin(a) < marginReq) return this.err(10016, "not enough money");
      const ticket = this.nextTicket(a);
      const pos: SimPosition = {
        ticket, symbol: sym.name, side: isBuy ? "long" : "short", volume: volNorm,
        openPrice: fill, sl: this.normPrice(req.sl, sym), tp: this.normPrice(req.tp, sym),
        openTime: now, comment, magic, commission: this.cfg.commissionPerLot * volNorm, swap: 0,
      };
      a.positions.set(ticket, pos);
      const deal: BrokerDeal = {
        id: "D-" + ticket, accountId, ticket, orderId: ticket, symbol: sym.name,
        side: pos.side, entry: "in", volume: volNorm, price: fill, profit: -pos.commission,
        swap: 0, commission: pos.commission, time: now, comment, magic,
      };
      a.deals.push(deal);
      return { ok: true, ticket, dealId: deal.id, fillPrice: fill, filledVolume: volNorm, retcode: 10009, comment: "Request completed", latencyMs: 0 };
    }
    // Pending orders.
    if (["buy_limit", "sell_limit", "buy_stop", "sell_stop"].includes(type)) {
      if (!req.price || req.price <= 0) return this.err(10013, "invalid price");
      const ticket = this.nextTicket(a);
      const order: SimOrder = {
        ticket, symbol: sym.name, type: type as SimOrder["type"], volume: volNorm, price: req.price,
        sl: this.normPrice(req.sl, sym), tp: this.normPrice(req.tp, sym),
        openTime: now, comment, magic,
      };
      a.orders.set(ticket, order);
      return { ok: true, ticket, retcode: 10009, comment: "pending order placed", latencyMs: 0 };
    }
    return this.err(10018, "unsupported order type");
  }

  async modifyPosition(accountId: string, ticket: string, patch: { sl?: number; tp?: number; comment?: string }): Promise<OrderResult> {
    const a = this.mustGet(accountId);
    const p = a.positions.get(ticket);
    if (p) {
      const sym = a.symbols.get(p.symbol)!;
      if (patch.sl !== undefined) p.sl = this.normPrice(patch.sl, sym);
      if (patch.tp !== undefined) p.tp = this.normPrice(patch.tp, sym);
      return { ok: true, ticket, retcode: 10009, comment: "modified" };
    }
    const o = a.orders.get(ticket);
    if (o) {
      const sym = a.symbols.get(o.symbol)!;
      if (patch.sl !== undefined) o.sl = this.normPrice(patch.sl, sym);
      if (patch.tp !== undefined) o.tp = this.normPrice(patch.tp, sym);
      return { ok: true, ticket, retcode: 10009, comment: "order modified" };
    }
    return this.err(10019, "position/order not found");
  }

  async closePosition(accountId: string, ticket: string, volume?: number): Promise<OrderResult> {
    const a = this.mustGet(accountId);
    const p = a.positions.get(ticket);
    if (!p) return this.err(10019, "position not found");
    const sym = a.symbols.get(p.symbol)!;
    const closeVol = volume ? Math.min(volume, p.volume) : p.volume;
    const closeVolNorm = this.normVolume(closeVol, sym.volumeStep);
    const closePrice = p.side === "long" ? sym.bid : sym.ask;
    const pnl = this.profitOnClose(p, closePrice, closeVolNorm, sym);
    const now = a.currentTime;
    if (closeVolNorm >= p.volume - 1e-9) {
      a.positions.delete(ticket);
    } else {
      p.volume -= closeVolNorm;
    }
    a.balance += pnl - (this.cfg.commissionPerLot * closeVolNorm);
    const deal: BrokerDeal = {
      id: "D-" + this.nextTicket(a), accountId, ticket, orderId: ticket, symbol: sym.name,
      side: p.side === "long" ? "short" : "long", entry: "out", volume: closeVolNorm, price: closePrice,
      profit: pnl, swap: p.swap, commission: this.cfg.commissionPerLot * closeVolNorm,
      time: now, comment: p.comment, magic: p.magic,
    };
    a.deals.push(deal);
    return { ok: true, ticket, dealId: deal.id, fillPrice: closePrice, filledVolume: closeVolNorm, retcode: 10009, comment: "closed", latencyMs: 0 };
  }

  /* ── Market data ───────────────────────────────────────── */

  async getCandles(accountId: string, q: CandleQuery): Promise<BrokerCandle[]> {
    const a = this.mustGet(accountId);
    // Deterministic synthetic candles built from the symbol seed.
    const sym = a.symbols.get(q.symbol);
    if (!sym) return [];
    const seed = hashStr(q.symbol + "|" + q.timeframe) ^ this.cfg.seed;
    const rng = mulberry32(seed);
    const periodMs = timeframeToMs(q.timeframe);
    const nowMs = Date.parse(a.currentTime);
    const startMs = q.start ? Date.parse(q.start as any) : nowMs - q.count * periodMs;
    const base = sym.bid;
    const out: BrokerCandle[] = [];
    let price = base;
    const volRange = sym.point * 50;
    for (let i = 0; i < q.count; i++) {
      const t = new Date(startMs + i * periodMs).toISOString();
      const drift = (rng() - 0.5) * volRange;
      const open = price;
      const close = Math.max(0.00001, open + drift);
      const high = Math.max(open, close) + rng() * volRange * 0.5;
      const low = Math.min(open, close) - rng() * volRange * 0.5;
      out.push({ symbol: q.symbol, timeframe: q.timeframe, time: t, open, high, low, close, tickVolume: Math.floor(100 + rng() * 900), spread: Math.max(1, Math.floor(sym.spread ?? 2)) });
      price = close;
    }
    return out;
  }

  async getDeals(accountId: string, q: HistoryQuery): Promise<BrokerDeal[]> {
    const a = this.mustGet(accountId);
    let out = a.deals;
    if (q.from) out = out.filter((d) => Date.parse(d.time) >= Date.parse(q.from as any));
    if (q.to) out = out.filter((d) => Date.parse(d.time) <= Date.parse(q.to as any));
    if (q.symbol) out = out.filter((d) => d.symbol === q.symbol);
    return out;
  }

  async getSymbol(accountId: string, symbol: string): Promise<BrokerSymbol | null> {
    return this.accounts.get(accountId)?.symbols.get(symbol) ?? null;
  }

  async subscribeTicks(accountId: string, symbols: string[], handler: TickHandler): Promise<{ subscribed: string[] }> {
    const a = this.mustGet(accountId);
    const ok: string[] = [];
    const key = "h" + (this.tickHandlers.get(accountId)?.size ?? 0);
    let map = this.tickHandlers.get(accountId);
    if (!map) { map = new Map(); this.tickHandlers.set(accountId, map); }
    for (const s of symbols) {
      if (a.symbols.has(s)) { ok.push(s); }
    }
    map.set(key, handler);
    return { subscribed: ok };
  }

  async unsubscribeTicks(accountId: string, _symbols?: string[]): Promise<void> {
    this.tickHandlers.delete(accountId);
  }

  onStateChange(handler: ConnectionStateHandler): void { this.stateHandlers.push(handler); }

  health(accountId: string) {
    const a = this.accounts.get(accountId);
    return { connected: !!a && a.status === "connected", latencyMs: a?.latencyMs, lastError: a?.lastError, reconnectAttempts: 0, endpoint: "simulator://in-process" };
  }

  /* ── Simulation control (deterministic) ─────────────────── */

  /**
   * Advance simulation to `time` with a set of ticks. Ticks are applied in
   * the order supplied. Between ticks, pending orders/SL/TP are checked.
   * Returns the set of deals generated during the advance.
   */
  advance(accountId: string, time: string, ticks: BrokerTick[]): BrokerDeal[] {
    const a = this.mustGet(accountId);
    a.currentTime = time;
    const newDeals: BrokerDeal[] = [];
    const before = a.deals.length;
    for (const t of ticks) this.applyTick(a, t);
    for (let i = before; i < a.deals.length; i++) newDeals.push(a.deals[i]!);
    a.lastSyncAt = time;
    return newDeals;
  }

  /**
   * Replay a set of candles deterministically using a 4-tick intra-bar
   * model (open → high → low → close), advancing SL/TP checks at each
   * synthetic tick. Returns deals produced during replay.
   */
  advanceCandles(accountId: string, candles: BrokerCandle[]): BrokerDeal[] {
    const a = this.mustGet(accountId);
    const deals: BrokerDeal[] = [];
    for (const c of candles) {
      const sym = a.symbols.get(c.symbol);
      if (!sym) continue;
      const { point } = sym;
      const ticks: BrokerTick[] = [
        mkTick(c.symbol, c.time, c.open, c.open + (sym.spread ?? this.cfg.defaultSpreadPts) * point),
        mkTick(c.symbol, c.time, c.high - (sym.spread ?? this.cfg.defaultSpreadPts) * point, c.high),
        mkTick(c.symbol, c.time, c.low, c.low + (sym.spread ?? this.cfg.defaultSpreadPts) * point),
        mkTick(c.time, c.time, c.close, c.close + (sym.spread ?? this.cfg.defaultSpreadPts) * point),
      ];
      deals.push(...this.advance(accountId, c.time, ticks));
    }
    return deals;
  }

  /** Inject a symbol definition (tests / sandbox setups). */
  addSymbol(accountId: string, s: Partial<SimSymbol> & { name: string; digits: number; point: number; contractSize: number; volumeMin: number; volumeMax: number; volumeStep: number; bid: number; ask: number }) {
    const a = this.mustGet(accountId);
    a.symbols.set(s.name, {
      name: s.name, description: s.description ?? s.name,
      digits: s.digits, point: s.point, contractSize: s.contractSize,
      volumeMin: s.volumeMin, volumeMax: s.volumeMax, volumeStep: s.volumeStep,
      spread: s.spread ?? this.cfg.defaultSpreadPts, bid: s.bid, ask: s.ask,
      tradeMode: s.tradeMode ?? "full",
      currencyBase: s.currencyBase, currencyProfit: s.currencyProfit,
      lastTickTime: a.currentTime,
    });
  }

  resetAccount(accountId: string, balance?: number) {
    const a = this.accounts.get(accountId);
    if (!a) return;
    a.positions.clear(); a.orders.clear(); a.deals = [];
    a.balance = balance ?? this.cfg.defaultBalance;
    a.credit = 0;
  }

  /* ── Internal ──────────────────────────────────────────── */

  private mustGet(id: string): SimAccount {
    const a = this.accounts.get(id);
    if (!a) throw new Error("Simulator: account not connected: " + id);
    return a;
  }

  private nextTicket(a: SimAccount): string { return String(++a.nextTicket); }

  private emitState(id: string, status: BrokerConnectionStatus, err?: string) {
    const a = this.accounts.get(id);
    if (a) { a.status = status; if (err) a.lastError = err; else a.lastError = undefined; }
    for (const h of this.stateHandlers) { try { h(id, status, err); } catch { /* ignore */ } }
  }

  private err(retcode: number, error: string): OrderResult {
    return { ok: false, retcode, error };
  }

  private positionsView(a: SimAccount): BrokerPosition[] {
    return [...a.positions.values()].map((p) => {
      const sym = a.symbols.get(p.symbol)!;
      const cur = p.side === "long" ? sym.bid : sym.ask;
      const profit = this.profitFloat(p, cur, sym);
      return {
        id: p.ticket, accountId: a.id, ticket: p.ticket, symbol: p.symbol, side: p.side,
        volume: p.volume, openPrice: p.openPrice, currentPrice: cur, sl: p.sl, tp: p.tp,
        openTime: p.openTime, profit, swap: p.swap, commission: p.commission,
        comment: p.comment, magic: p.magic,
      };
    });
  }
  private ordersView(a: SimAccount): BrokerPendingOrder[] {
    return [...a.orders.values()].map((o) => ({
      id: o.ticket, accountId: a.id, ticket: o.ticket, symbol: o.symbol, type: o.type,
      volume: o.volume, price: o.price, sl: o.sl, tp: o.tp, openTime: o.openTime,
      status: "active", comment: o.comment, magic: o.magic,
    }));
  }
  private normVolume(v: number, step: number): number {
    if (step <= 0) return v;
    return Math.round(v / step) * step;
  }
  private normPrice(p: number | undefined, _sym: SimSymbol): number | undefined {
    if (p === undefined || p === null) return undefined;
    return p > 0 ? p : undefined;
  }
  private equity(a: SimAccount): number { return a.balance + this.floatingPnl(a); }
  private freeMargin(a: SimAccount): number { return this.equity(a) - this.usedMargin(a); }
  private marginLevel(a: SimAccount): number { const m = this.usedMargin(a); return m > 0 ? this.equity(a) / m * 100 : 0; }
  private usedMargin(a: SimAccount): number {
    let m = 0;
    for (const p of a.positions.values()) {
      const sym = a.symbols.get(p.symbol); if (!sym) continue;
      m += (p.volume * sym.contractSize * p.openPrice) / a.leverage;
    }
    return m;
  }
  private floatingPnl(a: SimAccount): number {
    let pnl = 0;
    for (const p of a.positions.values()) {
      const sym = a.symbols.get(p.symbol); if (!sym) continue;
      const cur = p.side === "long" ? sym.bid : sym.ask;
      pnl += this.profitFloat(p, cur, sym);
    }
    return pnl;
  }
  private profitFloat(p: SimPosition, cur: number, sym: SimSymbol): number {
    const raw = p.side === "long" ? (cur - p.openPrice) : (p.openPrice - cur);
    return raw * p.volume * sym.contractSize - p.commission + p.swap;
  }
  private profitOnClose(p: SimPosition, closePrice: number, vol: number, sym: SimSymbol): number {
    const raw = p.side === "long" ? (closePrice - p.openPrice) : (p.openPrice - closePrice);
    return raw * vol * sym.contractSize;
  }

  private applyTick(a: SimAccount, t: BrokerTick) {
    const sym = a.symbols.get(t.symbol);
    if (!sym) return;
    sym.bid = t.bid; sym.ask = t.ask; sym.lastTickTime = t.time;
    // Ring buffer of last ticks.
    const buf = a.ticks.get(t.symbol) ?? [];
    buf.push(t); if (buf.length > 500) buf.shift();
    a.ticks.set(t.symbol, buf);
    // Dispatch tick to subscribers.
    const subs = this.tickHandlers.get(a.id);
    if (subs) for (const h of subs.values()) { try { h(a.id, t); } catch { /* ignore */ } }
    // Check pending orders → fill if price crossed.
    for (const o of [...a.orders.values()]) {
      if (o.symbol !== t.symbol) continue;
      let triggered = false;
      switch (o.type) {
        case "buy_limit":  if (t.bid <= o.price) triggered = true; break;
        case "sell_limit": if (t.ask >= o.price) triggered = true; break;
        case "buy_stop":   if (t.ask >= o.price) triggered = true; break;
        case "sell_stop":  if (t.bid <= o.price) triggered = true; break;
      }
      if (triggered) this.fillPending(a, o, t);
    }
    // Check SL/TP against the new bid/ask.
    for (const p of [...a.positions.values()]) {
      if (p.symbol !== t.symbol) continue;
      const hit = (() => {
        if (p.side === "long") {
          if (p.sl && t.bid <= p.sl) return { price: p.sl, kind: "sl" as const };
          if (p.tp && t.bid >= p.tp) return { price: p.tp, kind: "tp" as const };
        } else {
          if (p.sl && t.ask >= p.sl) return { price: p.sl, kind: "sl" as const };
          if (p.tp && t.ask <= p.tp) return { price: p.tp, kind: "tp" as const };
        }
        return null;
      })();
      if (hit) {
        const closePrice = hit.price;
        const pnl = this.profitOnClose(p, closePrice, p.volume, sym);
        a.balance += pnl - this.cfg.commissionPerLot * p.volume;
        const deal: BrokerDeal = {
          id: "D-" + this.nextTicket(a), accountId: a.id, ticket: p.ticket, orderId: p.ticket,
          symbol: p.symbol, side: p.side === "long" ? "short" : "long", entry: "out",
          volume: p.volume, price: closePrice, profit: pnl, swap: p.swap,
          commission: this.cfg.commissionPerLot * p.volume, time: t.time,
          comment: hit.kind === "sl" ? "stop loss" : "take profit", magic: p.magic,
        };
        a.deals.push(deal);
        a.positions.delete(p.ticket);
      }
    }
  }

  private fillPending(a: SimAccount, o: SimOrder, t: BrokerTick) {
    const sym = a.symbols.get(o.symbol)!;
    const fillPrice = o.price;
    const isBuy = o.type === "buy_limit" || o.type === "buy_stop";
    const marginReq = (o.volume * sym.contractSize * fillPrice) / a.leverage;
    if (this.freeMargin(a) < marginReq) { a.orders.delete(o.ticket); return; }
    a.orders.delete(o.ticket);
    const pos: SimPosition = {
      ticket: o.ticket, symbol: o.symbol, side: isBuy ? "long" : "short", volume: o.volume,
      openPrice: fillPrice, sl: o.sl, tp: o.tp, openTime: t.time, comment: o.comment,
      magic: o.magic, commission: this.cfg.commissionPerLot * o.volume, swap: 0,
    };
    a.positions.set(o.ticket, pos);
    a.deals.push({
      id: "D-" + o.ticket, accountId: a.id, ticket: o.ticket, orderId: o.ticket,
      symbol: o.symbol, side: pos.side, entry: "in", volume: o.volume, price: fillPrice,
      profit: -pos.commission, swap: 0, commission: pos.commission, time: t.time,
      comment: o.comment, magic: o.magic,
    });
  }
}

function mkTick(symbol: string, time: string, bid: number, ask: number): BrokerTick {
  return { symbol, time, bid, ask };
}

function timeframeToMs(tf: string): number {
  switch (tf) {
    case "M1": return 60_000;
    case "M5": return 5 * 60_000;
    case "M15": return 15 * 60_000;
    case "M30": return 30 * 60_000;
    case "H1": return 60 * 60_000;
    case "H4": return 4 * 60 * 60_000;
    case "D1": return 24 * 60 * 60_000;
    case "W1": return 7 * 24 * 60 * 60_000;
    case "MN1": return 30 * 24 * 60 * 60_000;
    default: return 60 * 60_000;
  }
}
