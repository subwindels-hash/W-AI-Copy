/**
 * Crypto.com Exchange connector (Exchange v1 API).
 *
 * Auth: api_key in body/params, sig = HMAC-SHA256-HEX(secret, method+id+api_key+paramsStr+nonce)
 * where paramsStr is sorted key+value concat of the params object.
 *
 * REST:  https://api.crypto.com/exchange/v1/
 * Public WS:  wss://stream.crypto.com/exchange/v1/market
 * Private WS: wss://stream.crypto.com/exchange/v1/user
 *
 * Phase 20: full private WS user-data stream (user.order, user.trade,
 * user.balance, user.positions) plus public WS tickers, cancel-order via
 * REST, fetchRecentFills, and corrected v1 signer.
 *
 * WINDELS is an AI Trading Agent, not a broker. The Crypto.com connector is
 * a client of Crypto.com's public API; WINDELS never matches, fills, or
 * custodies assets. All order execution is at the user's Crypto.com account.
 */
import type {
  CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest,
  CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoPosition,
  CryptoCandle,
} from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Hex } from "../signing.js";
import { mkMarket } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp"],
  auth: ["hmac_sha256_body"], hasPublicWs: true, hasPrivateWs: true,
  hasBatchQueries: false, hasTransfers: true,
  restBaseUrl: "https://api.crypto.com",
  publicWsUrl: "wss://stream.crypto.com/exchange/v1/market",
  privateWsUrl: "wss://stream.crypto.com/exchange/v1/user",
  publicWsPingIntervalMs: 25_000,
  privateWsPingIntervalMs: 30_000,
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class CryptocomConnector extends BaseCryptoConnector {
  private nextId = 1;
  constructor() { super({ exchange: "cryptocom", label: "Crypto.com Exchange", capabilities: CAPS }); }

  private nextReqId(): number { return this.nextId++; }

  /** Serialize params to Crypto.com's canonical sorted-keys string. */
  private paramsToStr(obj: any, level = 0): string {
    if (obj == null) return "";
    const MAX = 3;
    if (level >= MAX) return String(obj);
    if (Array.isArray(obj)) return obj.map((x) => this.paramsToStr(x, level + 1)).join("");
    if (typeof obj === "object") {
      return Object.keys(obj).sort().map((k) => k + this.paramsToStr((obj as any)[k], level + 1)).join("");
    }
    return String(obj);
  }

  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    const signParams = (method: string, id: number | string, params: any, nonce: number): string => {
      const pStr = this.paramsToStr(params ?? {});
      const payload = `${method}${id}${creds.apiKey}${pStr}${nonce}`;
      return hmacSha256Hex(creds.apiSecret, payload);
    };
    return {
      sign: ({ method: httpMethod, path, body, headers, timestampMs }) => {
        // Crypto.com Exchange v1 uses JSON-RPC-style POST bodies with id/method/params/nonce.
        // GET requests use query-string with api_key, sig, nonce.
        headers["content-type"] = "application/json";
        if (httpMethod === "GET") {
          // GET uses path already; for v1 public endpoints skipAuth is set.
          // For any GET private endpoints (none currently), sign via query.
          const url = new URL(path, "https://api.crypto.com");
          url.searchParams.set("api_key", creds.apiKey);
          url.searchParams.set("nonce", String(timestampMs));
          const sig = hmacSha256Hex(creds.apiSecret, "" + creds.apiKey + timestampMs);
          url.searchParams.set("sig", sig);
          return { path: url.pathname + url.search };
        }
        // POST body: body is a pre-built JSON string or object from request().
        let parsed: any = { id: this.nextReqId(), method: "", params: {} };
        if (body) {
          try { parsed = typeof body === "string" ? JSON.parse(body) : body; } catch { parsed = { id: this.nextReqId(), method: "", params: {} }; }
        }
        if (parsed.id == null) parsed.id = this.nextReqId();
        const m = parsed.method ?? "";
        const params = parsed.params ?? {};
        const nonce = parsed.nonce ?? Number(timestampMs);
        parsed.api_key = creds.apiKey;
        parsed.nonce = nonce;
        parsed.sig = signParams(m, parsed.id, params, nonce);
        return { body: JSON.stringify(parsed) };
      },
    };
  }

  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    // Crypto.com raw instrument names use underscores, e.g. BTC_USDT (spot) and BTC_USDT (perp).
    // We use "_USDT" suffix (Crypto.com style) and mark perps with settle USDT.
    const bases = [
      "BTC", "ETH", "SOL", "XRP", "DOGE", "BNB", "ADA", "AVAX", "LINK", "MATIC",
      "DOT", "LTC", "BCH", "ETC", "FIL", "ATOM", "NEAR", "APT", "ARB", "OP",
      "SUI", "SEI", "INJ", "TIA", "PEPE", "WIF", "SHIB", "TRX", "UNI", "AAVE",
      "MKR", "LDO", "RNDR", "IMX", "STX", "FET", "GRT", "PYTH", "JUP", "WLD",
      "ENS", "TON",
    ];
    const out: CryptoMarket[] = [];
    for (const base of bases) {
      out.push(mkMarket(`${base}/USDT:USDT`, `${base}_USDT`, "perp", base, "USDT", "USDT", 0.01, 0.001, 50, 0.001, 5));
      out.push(mkMarket(`${base}/USDT`, `${base}_USDT`, "spot", base, "USDT", "", 0.01, 0.00001, 1, 0.00001, 10, 2, 5));
    }
    return out;
  }

  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const id = this.nextReqId(); const nonce = Date.now();
    const r = await sess.http.request<any>({
      method: "POST", path: "/exchange/v1/private/get-account-summary",
      body: { id, method: "private/get-account-summary", params: {}, nonce },
    });
    const coins = r.data?.result?.accounts ?? [];
    const balances: CryptoBalance[] = coins
      .map((c: any) => ({
        asset: c.currency, free: Number(c.available ?? 0),
        locked: Number(c.order ?? 0), total: Number(c.balance ?? 0),
        usdValue: c.currency === "USDT" || c.currency === "USDC" ? Number(c.balance ?? 0) : undefined,
      }))
      .filter((b: CryptoBalance) => b.total > 0);
    // Positions (derivs).
    let positions: CryptoPosition[] = []; let openOrders: CryptoOrder[] = [];
    try {
      const pid = this.nextReqId();
      const pr = await sess.http.request<any>({
        method: "POST", path: "/exchange/v1/private/get-positions",
        body: { id: pid, method: "private/get-positions", params: {}, nonce: Date.now() },
      });
      positions = (pr.data?.result?.data ?? [])
        .filter((x: any) => Math.abs(Number(x.quantity ?? 0)) > 0.0000001)
        .map((x: any) => cryptocomPosToCrypto(x));
    } catch { /* derivs optional */ }
    // Open orders (spot+perp via get-open-orders).
    try {
      const oid = this.nextReqId();
      const or = await sess.http.request<any>({
        method: "POST", path: "/exchange/v1/private/get-open-orders",
        body: { id: oid, method: "private/get-open-orders", params: { page_size: 200 }, nonce: Date.now() },
      });
      for (const o of or.data?.result?.data ?? []) {
        const co = cryptocomOrderToCrypto(o, sess.marketsByRaw);
        if (co) openOrders.push(co);
      }
    } catch { /* optional */ }
    const equityUsd = balances.reduce((s, b) => s + (b.usdValue ?? 0), 0)
      + positions.reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0);
    return {
      accountId: sess.login, accountType: "mix", canTrade: true, canWithdraw: false,
      equityUsd, unrealizedPnlUsd: positions.reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0),
      balances, positions, openOrders,
    };
  }

  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const id = this.nextReqId(); const nonce = Date.now();
    const params: any = {
      instrument_name: m.rawSymbol,
      side: req.side.toUpperCase(),
      type: req.type === "limit" ? "LIMIT" : "MARKET",
      quantity: String(req.quantity),
      client_oid: req.clientOrderId ?? this.genClientOrderId(sess),
    };
    if (m.type === "perp") {
      // Perps require an explicit type marker; Crypto.com accepts the same instrument_name for USDT perps.
    }
    if (req.type === "limit") params.price = String(req.price);
    if (req.timeInForce) params.time_in_force = req.timeInForce;
    if (req.reduceOnly) params.exec_inst = ["POST_ONLY"];
    if (req.postOnly) params.exec_inst = ["POST_ONLY"];
    try {
      const r = await sess.http.request<any>({
        method: "POST", path: "/exchange/v1/private/create-order",
        body: { id, method: "private/create-order", params, nonce },
      });
      if (r.data?.code !== 0) return { ok: false, error: r.data?.message ?? "rejected", retcode: r.data?.code };
      return { ok: true, ticket: String(r.data?.result?.order_id ?? ""), comment: params.client_oid };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  protected async modifyOrder(_sess: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> {
    return { ok: false, error: "cryptocom modify not certified" };
  }

  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const sym = orderIdOrSymbol.includes("/") ? orderIdOrSymbol : (sess.openOrders.get(orderIdOrSymbol)?.symbol ?? orderIdOrSymbol);
    const m = sess.markets.get(sym); if (!m) return { ok: false, error: "not found" };
    if (m.type === "perp") {
      const pos = sess.positions.get(sym);
      if (pos) {
        return this.placeOrder(sess, {
          symbol: sym, marketType: "perp",
          side: pos.side === "long" ? "sell" : "buy", type: "market",
          quantity: volume ?? pos.quantity, reduceOnly: true,
        });
      }
    }
    const bal = sess.balances.get(m.base);
    const qty = volume ?? bal?.free ?? 0;
    if (qty <= 0) return { ok: false, error: "no balance" };
    return this.placeOrder(sess, { symbol: sym, marketType: "spot", side: "sell", type: "market", quantity: qty });
  }

  protected async cancelOrderImpl(sess: CryptoAccountSession, orderId: string): Promise<OrderResult> {
    const o = sess.openOrders.get(orderId);
    const raw = o ? sess.markets.get(o.symbol)?.rawSymbol : undefined;
    const params: any = { order_id: orderId };
    if (raw) params.instrument_name = raw;
    try {
      const r = await sess.http.request<any>({
        method: "POST", path: "/exchange/v1/private/cancel-order",
        body: { id: this.nextReqId(), method: "private/cancel-order", params, nonce: Date.now() },
      });
      if (r.data?.code !== 0) {
        // Retry without instrument_name if present (best-effort).
        if (params.instrument_name) {
          delete params.instrument_name;
          const r2 = await sess.http.request<any>({
            method: "POST", path: "/exchange/v1/private/cancel-order",
            body: { id: this.nextReqId(), method: "private/cancel-order", params: { order_id: orderId }, nonce: Date.now() },
          });
          if (r2.data?.code !== 0) return { ok: false, error: r2.data?.message ?? "cancel failed", retcode: r2.data?.code };
          return { ok: true, ticket: orderId };
        }
        return { ok: false, error: r.data?.message ?? "cancel failed", retcode: r.data?.code };
      }
      return { ok: true, ticket: orderId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const timeframe = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1D", W1: "1W", MN1: "1M" }[tf] ?? "1h";
    const r = await sess.http.request<any>({
      method: "GET", path: "/exchange/v1/public/get-candlestick",
      query: { instrument_name: m.rawSymbol, timeframe }, skipAuth: true,
    });
    return (r.data?.result?.data ?? []).slice(-count).map((k: any) => ({
      symbol, timeframe: tf, time: new Date(Number(k.t)).toISOString(),
      open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v),
    }));
  }

  protected async fetchRecentFills(sess: CryptoAccountSession, _since?: string): Promise<CryptoFill[]> {
    try {
      const r = await sess.http.request<any>({
        method: "POST", path: "/exchange/v1/private/get-trades",
        body: { id: this.nextReqId(), method: "private/get-trades", params: { page_size: 100 }, nonce: Date.now() },
      });
      const out: CryptoFill[] = [];
      for (const t of r.data?.result?.data ?? []) {
        const sym = cryptocomRawToSymbol(t.instrument_name, sess.marketsByRaw);
        out.push({
          id: String(t.trade_id ?? t.id ?? `${t.order_id}:${t.create_time}`),
          orderId: String(t.order_id ?? ""), symbol: sym,
          marketType: t.instrument_name && String(t.instrument_name).endsWith("_USDT") && sess.markets.get(sym)?.type === "perp" ? "perp" : "spot",
          side: String(t.side ?? "").toLowerCase() === "sell" ? "sell" : "buy",
          price: Number(t.traded_price ?? t.fee ?? 0),
          quantity: Number(t.traded_quantity ?? t.quantity ?? 0),
          fee: Math.abs(Number(t.fee ?? 0)),
          feeCurrency: t.fee_currency ?? "USDT",
          realizedPnl: 0,
          time: t.create_time_ms ? new Date(Number(t.create_time_ms)).toISOString() : (t.create_time ? new Date(Number(t.create_time)).toISOString() : new Date().toISOString()),
          isMaker: String(t.side ?? "").toLowerCase().includes("maker"),
          tradeId: String(t.trade_id ?? ""),
        });
      }
      return out;
    } catch { return []; }
  }

  /* ── WebSocket ── */

  private signWs(method: string, id: number, params: any, nonce: number, secret: string, apiKey: string): string {
    const pStr = this.paramsToStr(params ?? {});
    return hmacSha256Hex(secret, `${method}${id}${apiKey}${pStr}${nonce}`);
  }

  protected authenticatePrivateWs(sess: CryptoAccountSession, send: (p: any) => void): void {
    const id = this.nextReqId(); const nonce = Date.now();
    const sig = this.signWs("public/auth", id, {}, nonce, sess.creds.apiSecret, sess.creds.apiKey);
    send({ id, method: "public/auth", api_key: sess.creds.apiKey, sig, nonce });
  }

  protected async afterPrivateAuth(_sess: CryptoAccountSession, send: (p: any) => void): Promise<void> {
    const id = () => this.nextReqId();
    const nonce = () => Date.now();
    // Subscribe to all user streams. Omitting instrument_name gives us all symbols,
    // which is what the agent needs for multi-symbol trading.
    send({ id: id(), method: "subscribe", params: { channels: ["user.order"] }, nonce: nonce() });
    send({ id: id(), method: "subscribe", params: { channels: ["user.trade"] }, nonce: nonce() });
    send({ id: id(), method: "subscribe", params: { channels: ["user.balance"] }, nonce: nonce() });
    send({ id: id(), method: "subscribe", params: { channels: ["user.positions"] }, nonce: nonce() });
  }

  protected publicPingMessage(): object {
    return { id: this.nextReqId(), method: "public/respond-heartbeat" };
  }

  protected privatePingMessage(): object {
    return { id: this.nextReqId(), method: "public/respond-heartbeat" };
  }

  protected buildTickerSubscribePayload(m: CryptoMarket): object | null {
    return { id: this.nextReqId(), method: "subscribe", params: { channels: [`ticker.${m.rawSymbol}`] }, nonce: Date.now() };
  }
  protected buildTickerUnsubscribePayload(m: CryptoMarket): object | null {
    return { id: this.nextReqId(), method: "unsubscribe", params: { channels: [`ticker.${m.rawSymbol}`] }, nonce: Date.now() };
  }

  protected parsePublicMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any; try { msg = JSON.parse(raw); } catch { return []; }
    if (msg?.method === "public/heartbeat") {
      // Crypto.com server sends heartbeats; reply with public/respond-heartbeat echo.
      if (sess.publicWs) {
        try { (sess.publicWs as any).send?.({ id: msg.id, method: "public/respond-heartbeat" }); }
        catch { /* best effort */ }
      }
      return [];
    }
    if (!Array.isArray(msg?.result?.data)) return []; // sub/unsub acks have no data array
    // Error acks carry non-zero code.
    if (msg?.code !== undefined && msg.code !== 0) return [];
    const ch = msg?.result?.channel;
    if (!ch) return [];
    if (ch === "ticker") {
      const inst = msg.result?.instrument_name;
      if (!inst) return [];
      const data = Array.isArray(msg.result.data) ? msg.result.data[0] : msg.result.data;
      return [{ channel: `ticker:${inst}`, payload: data }];
    }
    return [];
  }

  protected parseTickerMessage(_s: CryptoAccountSession, _m: CryptoMarket, payload: any): { bid: number; ask: number } | null {
    if (!payload) return null;
    // Crypto.com ticker: b=best bid, k=best ask (NB: "k" is ask per docs).
    const bid = Number(payload.b ?? 0);
    const ask = Number(payload.k ?? 0);
    if (!bid || !ask) return null;
    return { bid, ask };
  }

  protected parsePrivateMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any; try { msg = JSON.parse(raw); } catch { return []; }
    // Handle server heartbeat.
    if (msg?.method === "public/heartbeat") {
      if (sess.privateWs) {
        try { (sess.privateWs as any).send?.({ id: msg.id, method: "public/respond-heartbeat" }); } catch { /* */ }
      }
      return [];
    }
    if (msg?.method === "public/auth" && !msg?.result?.channel) return []; // auth ack (pre-subscription)
    // Subscription/unsubscription acks carry result.channel but no data array
    // (code === 0 and result.subscription is the channel name). Push frames
    // always carry result.data as an array.
    if (!Array.isArray(msg?.result?.data)) return [];
    // Error acks (non-zero code with no actionable data).
    if (msg?.code !== undefined && msg.code !== 0) return [];
    const ch = msg?.result?.channel;
    if (!ch) return [];
    const data: any[] = Array.isArray(msg.result.data) ? msg.result.data : (msg.result.data ? [msg.result.data] : []);
    const out: Array<{ channel: string; payload: any }> = [];

    if (ch === "user.order" || ch?.startsWith("user.order.")) {
      for (const o of data) {
        if (!o?.order_id && !o?.client_oid) continue;
        const order = cryptocomWsOrderToCrypto(o, sess.marketsByRaw);
        if (!order) continue;
        const priorFilled = sess.openOrders.get(order.id)?.filledQuantity ?? 0;
        const wsCumQty = Number(o.cumulative_quantity ?? o.cumulative_quantity ?? 0);
        const delta = Math.max(0, wsCumQty - priorFilled);
        order.filledQuantity = priorFilled;
        order.remainingQuantity = Math.max(0, order.quantity - priorFilled);
        const wsStatus = mapCryptocomStatus(o.status);
        order.status = wsStatus;
        // Apply fill delta if any.
        if (delta > 0) {
          const fPrice = Number(o.avg_price ?? o.traded_price ?? o.limit_price ?? 0);
          this.applyFill(sess, {
            id: `${order.id}:${wsCumQty}:${o.update_time ?? o.create_time ?? Date.now()}`,
            orderId: order.id, symbol: order.symbol,
            marketType: order.marketType, side: order.side,
            price: fPrice > 0 ? fPrice : ((order.price as number) ?? 0),
            quantity: delta, fee: Math.abs(Number(o.fee ?? 0)), feeCurrency: o.fee_currency ?? "USDT",
            realizedPnl: 0, time: order.updatedTime,
            isMaker: false, tradeId: undefined,
          });
        } else {
          // No fill delta: just upsert into open orders if still open.
          sess.openOrders.set(order.id, order);
        }
        // If terminal, evict.
        if (wsStatus === "filled" || wsStatus === "canceled" || wsStatus === "rejected" || wsStatus === "expired") {
          sess.openOrders.delete(order.id);
        }
      }
      out.push({ channel: "order", payload: data });
    } else if (ch === "user.trade" || ch?.startsWith("user.trade.")) {
      for (const t of data) {
        if (!t?.order_id) continue;
        const sym = cryptocomRawToSymbol(t.instrument_name, sess.marketsByRaw);
        const fill: CryptoFill = {
          id: String(t.trade_id ?? `${t.order_id}:${t.create_time ?? Date.now()}`),
          orderId: String(t.order_id), symbol: sym,
          marketType: sym.includes(":USDT") ? "perp" : "spot",
          side: String(t.side ?? "").toUpperCase() === "SELL" ? "sell" : "buy",
          price: Number(t.traded_price ?? 0),
          quantity: Number(t.traded_quantity ?? t.quantity ?? 0),
          fee: Math.abs(Number(t.fee ?? 0)), feeCurrency: t.fee_currency ?? "USDT",
          realizedPnl: 0,
          time: t.create_time ? new Date(Number(t.create_time)).toISOString() : new Date().toISOString(),
          isMaker: false, tradeId: String(t.trade_id ?? ""),
        };
        this.applyFill(sess, fill);
      }
      out.push({ channel: "fill", payload: data });
    } else if (ch === "user.balance") {
      for (const b of data) {
        if (!b?.currency) continue;
        const free = Number(b.available ?? 0);
        const locked = Number(b.order ?? 0);
        const total = Number(b.balance ?? 0) || (free + locked);
        if (total <= 0.0000001) { sess.balances.delete(b.currency); continue; }
        sess.balances.set(b.currency, {
          asset: b.currency, free, locked, total,
          usdValue: (b.currency === "USDT" || b.currency === "USDC") ? total : undefined,
        });
      }
      out.push({ channel: "balance", payload: data });
    } else if (ch === "user.positions") {
      for (const p of data) {
        if (!p?.instrument_name) continue;
        const qty = Number(p.quantity ?? 0);
        const pos = cryptocomPosToCrypto(p);
        if (Math.abs(qty) <= 0.0000001) { sess.positions.delete(pos.symbol); continue; }
        sess.positions.set(pos.symbol, pos);
      }
      out.push({ channel: "position", payload: data });
    }
    return out;
  }
}

/* ── Helpers ── */

function mapCryptocomStatus(s: string | undefined): CryptoOrder["status"] {
  if (!s) return "new";
  const u = s.toUpperCase();
  if (u === "ACTIVE" || u === "NEW" || u === "PENDING" || u === "SUBMITTED" || u === "OPEN") return "new";
  if (u === "CANCELED" || u === "CANCELLED") return "canceled";
  if (u === "FILLED" || u === "COMPLETED" || u === "FILLED_FULLY") return "filled";
  if (u === "REJECTED" || u === "EXPIRED" || u === "FAILED") return u === "EXPIRED" ? "expired" : "rejected";
  if (u.includes("PARTIAL") || u.includes("PART_FILLED")) return "partially_filled";
  return "new";
}

function cryptocomRawToSymbol(raw: string | undefined, marketsByRaw: Map<string, CryptoMarket>): string {
  if (!raw) return "";
  const upper = String(raw).toUpperCase();
  if (marketsByRaw.has(upper)) return marketsByRaw.get(upper)!.symbol;
  // Heuristic: split on last underscore to get quote.
  const idx = upper.lastIndexOf("_");
  if (idx < 0) return upper;
  const base = upper.slice(0, idx);
  const quote = upper.slice(idx + 1);
  // Perp positions carry an instrument_name like BTCUSD-PERP on derivatives, but on
  // unified v1 it's BTC_USDT for USDT-margined perps.
  if (quote === "USDT" || quote === "USDC") return `${base}/${quote}`;
  return `${base}/${quote}`;
}

function cryptocomOrderToCrypto(o: any, marketsByRaw: Map<string, CryptoMarket>): CryptoOrder | null {
  const raw = String(o.instrument_name ?? "");
  if (!raw) return null;
  const m = marketsByRaw.get(raw.toUpperCase());
  const sym = m?.symbol ?? cryptocomRawToSymbol(raw, marketsByRaw);
  const mType: CryptoOrder["marketType"] = m?.type ?? (sym.includes(":USDT") ? "perp" : "spot");
  const qty = Number(o.quantity ?? 0);
  const filled = Number(o.cumulative_quantity ?? o.filled_quantity ?? 0);
  return {
    id: String(o.order_id ?? ""),
    clientOrderId: o.client_oid ?? undefined,
    symbol: sym,
    marketType: mType,
    side: String(o.side ?? "").toUpperCase() === "SELL" ? "sell" : "buy",
    type: String(o.type ?? "LIMIT").toUpperCase() === "MARKET" ? "market" : "limit",
    price: Number(o.limit_price ?? o.price ?? 0) || null,
    triggerPrice: Number(o.trigger_price ?? o.ref_price ?? 0) || null,
    quantity: qty,
    filledQuantity: filled,
    remainingQuantity: Math.max(0, qty - filled),
    avgFillPrice: Number(o.avg_price ?? 0) || null,
    status: mapCryptocomStatus(o.status),
    timeInForce: o.time_in_force ?? "GTC",
    reduceOnly: !!o.reduce_only,
    createdTime: o.create_time_ms ? new Date(Number(o.create_time_ms)).toISOString() : (o.create_time ? new Date(Number(o.create_time)).toISOString() : new Date().toISOString()),
    updatedTime: o.update_time_ms ? new Date(Number(o.update_time_ms)).toISOString() : (o.update_time ? new Date(Number(o.update_time)).toISOString() : new Date().toISOString()),
    fee: Math.abs(Number(o.cumulative_fee ?? 0)),
    feeCurrency: o.fee_currency ?? o.fee_instrument_name ?? "USDT",
  };
}

function cryptocomWsOrderToCrypto(o: any, marketsByRaw: Map<string, CryptoMarket>): CryptoOrder | null {
  // Ws user.order frames expose the same fields as REST but with slightly different
  // casing (create_time as ms number or string).
  return cryptocomOrderToCrypto(o, marketsByRaw);
}

function cryptocomPosToCrypto(p: any): CryptoPosition {
  const raw = String(p.instrument_name ?? "").toUpperCase();
  const idx = raw.lastIndexOf("_");
  let base = idx > 0 ? raw.slice(0, idx) : raw;
  let quote = idx > 0 ? raw.slice(idx + 1) : "USDT";
  // Derivatives perps use e.g. BTCUSD-PERP on legacy endpoints; normalize.
  if (base.endsWith("USD-PERP")) base = base.replace("USD-PERP", "");
  if (base.endsWith("-PERP")) base = base.replace("-PERP", "");
  const isPerp = String(p.type ?? "").toUpperCase().includes("PERPETUAL") || p.instrument_name?.includes("-PERP") || quote === "USDT";
  const qty = Number(p.quantity ?? 0);
  const cost = Number(p.cost ?? p.market_value ?? 0);
  const entryPrice = Number(p.open_pos_cost ?? p.cost ?? 0) / (Math.abs(qty) || 1);
  const markPrice = Number(p.mark_price ?? 0);
  const symbol = isPerp ? `${base}/${quote}:${quote}` : `${base}/${quote}`;
  return {
    symbol,
    marketType: isPerp ? "perp" : "spot",
    side: qty >= 0 ? "long" : "short",
    quantity: Math.abs(qty),
    entryPrice,
    markPrice,
    unrealizedPnl: Number(p.open_position_pnl ?? p.session_unrealized_pnl ?? 0),
    realizedPnl: Number(p.session_pnl ?? 0),
    leverage: Number(p.target_leverage ?? p.leverage ?? 1) || 1,
    margin: Number(p.pos_initial_margin ?? 0),
    marginType: (p.isolation_id ? "isolated" : "cross") as any,
    liquidationPrice: Number(p.liquidation_price ?? 0) || null,
    stopLoss: undefined,
    takeProfit: undefined,
    openedTime: new Date(Number(p.update_timestamp_ms ?? Date.now())).toISOString(),
    updatedTime: new Date(Number(p.update_timestamp_ms ?? Date.now())).toISOString(),
  };
}
