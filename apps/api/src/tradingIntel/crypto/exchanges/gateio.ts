/**
 * Gate.io v4 connector.
 * Auth: KEY / SIGN (HMAC-SHA512 hex of method + "\n" + path + "\n" + queryHash + "\n" +
 * timestamp on REST; for WebSocket v4 the SIGN is HMAC-SHA512 hex of
 * "channel\nevent\ntime\n"). Headers KEY, SIGN, Timestamp.
 *
 * Phase 16: full private WS user-data stream (spot orders, USDT perp orders,
 * perp positions, spot balance), public WS ticker, cancel order REST, ping.
 *
 * WINDELS is an AI Trading Agent, not a broker or exchange. The Gate.io
 * connector is a client of Gate.io's public API; WINDELS never matches,
 * fills, settles, or custodies customer assets.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha512Hex, sha512Hex } from "../signing.js";
import { majorPairs } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp", "options"],
  auth: ["hmac_sha512_header"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: true, hasTransfers: true,
  restBaseUrl: "https://api.gateio.ws/api/v4",
  publicWsUrl: "wss://api.gateio.ws/ws/v4/",
  privateWsUrl: "wss://api.gateio.ws/ws/v4/",
  publicWsPingIntervalMs: 20_000,
  privateWsPingIntervalMs: 20_000,
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class GateioConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "gateio", label: "Gate.io", capabilities: CAPS }); }
  private nextWsReqId = 1;

  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const ts = String(Math.floor(timestampMs / 1000));
        const bodyHash = body ? sha512Hex(body) : "";
        const sig = hmacSha512Hex(creds.apiSecret, `${method.toUpperCase()}\n${path}\n\n${bodyHash}\n${ts}`);
        headers["KEY"] = creds.apiKey;
        headers["SIGN"] = sig;
        headers["Timestamp"] = ts;
        headers["content-type"] = "application/json";
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { perp, spot } = majorPairs("USDT"); return [...perp, ...spot];
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const r = await sess.http.request<any>({ method: "GET", path: "/spot/accounts" }).catch(() => null);
    const balances: CryptoBalance[] = (r?.data ?? []).map((a: any) => ({ asset: a.currency, free: Number(a.available), locked: Number(a.locked), total: Number(a.available) + Number(a.locked), usdValue: undefined })).filter((x: CryptoBalance) => x.total > 0);
    // Tag USDT/USDT balances as usdValue for equity calc.
    for (const b of balances) {
      if (b.asset === "USDT" || b.asset === "USDC" || b.asset === "BUSD" || b.asset === "TUSD" || b.asset === "FDUSD") {
        b.usdValue = b.total;
      }
    }
    let positions: CryptoPosition[] = [];
    let openOrders: CryptoOrder[] = [];
    try {
      const pl = await sess.http.request<any[]>({ method: "GET", path: "/futures/usdt/positions" });
      positions = (pl.data ?? []).filter((p: any) => Number(p.size) !== 0).map((p: any) => ({
        symbol: gateRawToUnified(p.contract, "perp"),
        marketType: "perp",
        side: Number(p.size) > 0 ? "long" : "short",
        quantity: Math.abs(Number(p.size)),
        entryPrice: Number(p.entry_price),
        markPrice: Number(p.mark_price ?? 0),
        unrealizedPnl: Number(p.unrealised_pnl ?? 0),
        realizedPnl: Number(p.realised_pnl ?? 0),
        leverage: Number(p.leverage ?? 1),
        margin: Number(p.margin ?? 0),
        marginType: p.mode === "cross" ? "cross" : "isolated",
        liquidationPrice: Number(p.liq_price ?? 0) || null,
        stopLoss: undefined, takeProfit: undefined,
        openedTime: new Date(Number(p.open_time ?? 0) * 1000 || Date.now()).toISOString(),
        updatedTime: new Date(Number(p.update_time ?? 0) * 1000 || Date.now()).toISOString(),
      }));
      // Spot open orders.
      const so = await sess.http.request<any[]>({ method: "GET", path: "/spot/open_orders" });
      for (const o of so.data ?? []) {
        openOrders.push(gateSpotOrderToCrypto(o));
      }
      // Futures open orders.
      const fo = await sess.http.request<any[]>({ method: "GET", path: "/futures/usdt/orders", query: { status: "open", limit: "50" } });
      for (const o of fo.data ?? []) {
        openOrders.push(gateFuturesOrderToCrypto(o));
      }
    } catch { /* futures not enabled */ }
    return {
      accountId: sess.login, accountType: "spot", canTrade: true, canWithdraw: true,
      equityUsd: balances.reduce((s, b) => s + (b.usdValue ?? 0), 0),
      unrealizedPnlUsd: positions.reduce((s, p) => s + p.unrealizedPnl, 0),
      balances, positions, openOrders,
    };
  }
  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const body: Record<string, any> = { currency_pair: m.rawSymbol, side: req.side, amount: String(req.quantity) };
    let path: string;
    if (m.type === "spot") {
      path = "/spot/orders";
      if (req.type === "limit") { body.type = "limit"; body.price = String(req.price); body.time_in_force = "gtc"; }
      else body.type = "market";
      if (req.reduceOnly) Object.assign(body, { auto_borrow: false });
    } else {
      path = "/futures/usdt/orders";
      body.contract = m.rawSymbol;
      delete body.currency_pair;
      if (req.type === "limit") { body.type = "limit"; body.price = String(req.price); body.tif = "gtc"; } else body.type = "market";
      body.size = String(req.side === "sell" ? -req.quantity : req.quantity);
      delete body.amount; delete body.side;
      if (req.reduceOnly) body.reduce_only = true;
      body.auto_size = req.reduceOnly ? "close_long_short" : undefined;
      if (req.takeProfit?.price) { body.take_profit = String(req.takeProfit.price); }
      if (req.stopLoss?.price) { body.stop_loss = String(req.stopLoss.price); }
    }
    // Strip undefined.
    for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
    try {
      const r = await sess.http.request<any>({ method: "POST", path, body });
      if (r.data?.id || r.data?.order_id) return { ok: true, ticket: String(r.data.id ?? r.data.order_id), comment: r.data.text ?? r.data.client_order_id };
      return { ok: false, error: r.data?.message ?? r.data?.label ?? "rejected", retcode: r.data?.code ? Number(r.data.code) : undefined };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async modifyOrder(_sess: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return { ok: false, error: "gateio modify not yet certified" }; }
  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const sym = orderIdOrSymbol.includes("/") ? orderIdOrSymbol : (sess.openOrders.get(orderIdOrSymbol)?.symbol ?? orderIdOrSymbol);
    const m = sess.markets.get(sym); if (!m) return { ok: false, error: "market not found" };
    const pos = sess.positions.get(sym); const bal = sess.balances.get(m.base);
    if (m.type === "perp" && pos) {
      return this.placeOrder(sess, { symbol: sym, marketType: "perp", side: pos.side === "long" ? "sell" : "buy", type: "market", quantity: volume ?? pos.quantity, reduceOnly: true });
    }
    return this.placeOrder(sess, { symbol: sym, marketType: "spot", side: "sell", type: "market", quantity: volume ?? bal?.free ?? 0 });
  }
  protected async cancelOrderImpl(sess: CryptoAccountSession, orderId: string): Promise<OrderResult> {
    const o = sess.openOrders.get(orderId);
    const sym = o?.symbol;
    const m = sym ? sess.markets.get(sym) : undefined;
    try {
      if (m?.type === "perp") {
        const r = await sess.http.request<any>({ method: "DELETE", path: `/futures/usdt/orders/${orderId}`, query: { contract: m.rawSymbol } });
        return { ok: true, ticket: String(r.data?.id ?? orderId) };
      }
      // Spot cancel requires currency_pair.
      const rawSym = m?.rawSymbol;
      if (rawSym) {
        const r = await sess.http.request<any>({ method: "DELETE", path: `/spot/orders/${orderId}`, query: { currency_pair: rawSym } });
        return { ok: true, ticket: String(r.data?.id ?? orderId) };
      }
      // Fallback: scan spot markets (best effort).
      for (const mk of sess.markets.values()) {
        if (mk.type !== "spot") continue;
        try {
          const r = await sess.http.request<any>({ method: "DELETE", path: `/spot/orders/${orderId}`, query: { currency_pair: mk.rawSymbol } });
          if (r.data?.id) return { ok: true, ticket: String(r.data.id) };
        } catch { /* try next */ }
      }
      return { ok: false, error: "order not found" };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const interval = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1d", W1: "1w", MN1: "30d" }[tf] ?? "1h";
    const path = m.type === "perp" ? "/futures/usdt/candlesticks" : "/spot/candlesticks";
    const q: any = { limit: String(Math.min(count, 1000)), interval };
    if (m.type === "perp") q.contract = m.rawSymbol; else q.currency_pair = m.rawSymbol;
    const r = await sess.http.request<any[]>({ method: "GET", path, query: q, skipAuth: true });
    return (r.data ?? []).map((k: any) => ({ symbol, timeframe: tf, time: new Date(Number(k.t) * 1000).toISOString(), open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v) }));
  }
  protected async fetchRecentFills(_sess: CryptoAccountSession, _since?: string): Promise<CryptoFill[]> { return []; }

  /* ── WebSocket ── */

  /**
   * Gate.io v4 WS uses per-subscription auth (api_key method). There is no
   * separate login frame; every subscribe payload carries KEY/SIGN/Timestamp.
   * To simplify, authenticatePrivateWs is a no-op; afterPrivateAuth sends the
   * individual subscribe frames with their own auth signatures.
   */
  protected authenticatePrivateWs(_sess: CryptoAccountSession, _send: (p: any) => void): void {
    // no-op — auth is per-subscription in afterPrivateAuth.
  }

  protected async afterPrivateAuth(sess: CryptoAccountSession, send: (p: any) => void): Promise<void> {
    const time = Math.floor(Date.now() / 1000);
    const channels: Array<{ ch: string; payloadKey: string; isPair?: boolean }> = [
      { ch: "spot.orders", payloadKey: "currency_pair" },
      { ch: "spot.balances", payloadKey: "currency" },
      { ch: "futures.orders", payloadKey: "contract" },
      { ch: "futures.positions", payloadKey: "contract" },
    ];
    for (const { ch } of channels) {
      const event = "subscribe";
      const signPayload = `${ch}\n${event}\n${time}\n`;
      const sig = hmacSha512Hex(sess.creds.apiSecret, signPayload);
      send({
        time,
        channel: ch,
        event,
        payload: [], // empty payload = all instruments for the account
        auth: { method: "api_key", KEY: sess.creds.apiKey, SIGN: sig, Timestamp: String(time) },
        id: this.nextWsReqId++,
      });
    }
  }

  protected publicPingMessage(): object {
    return { time: Math.floor(Date.now() / 1000), channel: "%2Eping", event: "subscribe", payload: "pong", id: this.nextWsReqId++ };
  }
  // Gate.io v4 private WS responds to pings built as {channel:"spot.ping"...}; simplest is server ping auto-responded by client; we use the same ping frame on both.
  protected privatePingMessage(): object { return this.publicPingMessage(); }

  protected buildTickerSubscribePayload(m: CryptoMarket): object | null {
    const channel = m.type === "perp" ? "futures.tickers" : "spot.tickers";
    return {
      time: Math.floor(Date.now() / 1000),
      channel,
      event: "subscribe",
      payload: [m.rawSymbol],
      id: this.nextWsReqId++,
    };
  }
  protected buildTickerUnsubscribePayload(m: CryptoMarket): object | null {
    const channel = m.type === "perp" ? "futures.tickers" : "spot.tickers";
    return {
      time: Math.floor(Date.now() / 1000),
      channel,
      event: "unsubscribe",
      payload: [m.rawSymbol],
      id: this.nextWsReqId++,
    };
  }

  protected parsePublicMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any; try { msg = JSON.parse(raw); } catch { return []; }
    if (!msg?.channel) return [];
    if (msg.channel === "spot.pong" || msg.channel === "%2Epong") return [];
    if (msg.event === "subscribe" || msg.event === "unsubscribe" || msg.event === "error" || msg.error) return [];
    if (msg.channel === "spot.tickers" || msg.channel === "futures.tickers") {
      const data = msg.result ?? msg.data ?? msg;
      const arr = Array.isArray(data) ? data : [data];
      const out: Array<{ channel: string; payload: unknown }> = [];
      for (const t of arr) {
        if (!t) continue;
        const rawSym = t.currency_pair ?? t.contract ?? t.s;
        if (!rawSym) continue;
        out.push({ channel: `ticker:${rawSym}`, payload: t });
      }
      return out;
    }
    return [];
  }

  protected parseTickerMessage(_sess: CryptoAccountSession, _m: CryptoMarket, payload: any): { bid: number; ask: number } | null {
    if (!payload) return null;
    const bid = Number(payload.highest_bid ?? payload.best_bid ?? payload.bid ?? 0);
    const ask = Number(payload.lowest_ask ?? payload.best_ask ?? payload.ask ?? 0);
    if (!bid || !ask) return null;
    return { bid, ask };
  }

  protected parsePrivateMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any; try { msg = JSON.parse(raw); } catch { return []; }
    if (!msg?.channel) return [];
    if (msg.event === "subscribe" || msg.event === "unsubscribe" || msg.event === "error" || msg.error) return [];
    if (msg.channel === "spot.pong" || msg.channel.endsWith(".pong")) return [];
    const ch = msg.channel;
    const result = msg.result ?? msg.data ?? [];
    const arr = Array.isArray(result) ? result : [result];

    if (ch === "spot.orders") {
      for (const o of arr) {
        if (!o?.id) continue;
        const order = gateSpotOrderToCrypto(o);
        const priorFilled = sess.openOrders.get(order.id)?.filledQuantity ?? 0;
        const delta = Math.max(0, order.filledQuantity - priorFilled);
        // Seed order with prior fill level so applyFill's add gives correct total.
        order.filledQuantity = priorFilled;
        order.remainingQuantity = Math.max(0, order.quantity - priorFilled);
        sess.openOrders.set(order.id, order);
        if (delta > 0) {
          this.applyFill(sess, {
            id: `${order.id}:${o.update_time_ms ?? o.update_time ?? Date.now()}`,
            orderId: order.id,
            symbol: order.symbol,
            marketType: "spot",
            side: order.side,
            price: Number(o.fill_price ?? o.price_avg ?? 0) || Number(o.price) || 0,
            quantity: delta,
            fee: Number(o.fee ?? 0) * -1,
            feeCurrency: o.fee_currency ?? "USDT",
            realizedPnl: 0,
            time: new Date(Number(o.update_time_ms ?? Date.now())).toISOString(),
            isMaker: false,
            tradeId: o.trade_id,
          });
        }
        const after = sess.openOrders.get(order.id);
        if (after && (after.status === "filled" || after.status === "canceled" || after.status === "rejected")) {
          sess.openOrders.delete(order.id);
        } else if (order.status === "canceled" || order.status === "rejected") {
          sess.openOrders.delete(order.id);
        }
      }
      return [{ channel: "order", payload: arr }];
    }

    if (ch === "futures.orders") {
      for (const o of arr) {
        if (!o?.id) continue;
        const order = gateFuturesOrderToCrypto(o);
        const priorFilled = sess.openOrders.get(order.id)?.filledQuantity ?? 0;
        const fillCum = Math.abs(Number(o.fill_size ?? o.filled_size ?? 0));
        const delta = Math.max(0, fillCum - priorFilled);
        order.filledQuantity = priorFilled;
        order.remainingQuantity = Math.max(0, order.quantity - priorFilled);
        sess.openOrders.set(order.id, order);
        if (delta > 0) {
          this.applyFill(sess, {
            id: `${order.id}:${o.update_time_ms ?? o.update_time ?? Date.now()}`,
            orderId: order.id,
            symbol: order.symbol,
            marketType: "perp",
            side: order.side,
            price: Number(o.fill_price ?? o.fill_price_ ?? o.price_avg ?? 0) || Number(o.price) || 0,
            quantity: delta,
            fee: Number(o.fee ?? 0) * -1,
            feeCurrency: o.fee_currency ?? "USDT",
            realizedPnl: 0,
            time: new Date(Number(o.update_time_ms ?? Date.now())).toISOString(),
            isMaker: false,
            tradeId: o.trade_id,
          });
        }
        const after = sess.openOrders.get(order.id);
        if (after && (after.status === "filled" || after.status === "canceled" || after.status === "rejected")) {
          sess.openOrders.delete(order.id);
        } else if (order.status === "canceled" || order.status === "rejected") {
          sess.openOrders.delete(order.id);
        }
      }
      return [{ channel: "order", payload: arr }];
    }

    if (ch === "futures.positions") {
      for (const p of arr) {
        if (!p?.contract) continue;
        const sym = gateRawToUnified(p.contract, "perp");
        const size = Number(p.size ?? 0);
        if (size === 0) { sess.positions.delete(sym); continue; }
        sess.positions.set(sym, {
          symbol: sym,
          marketType: "perp",
          side: size > 0 ? "long" : "short",
          quantity: Math.abs(size),
          entryPrice: Number(p.entry_price ?? p.entry_price_ ?? 0),
          markPrice: Number(p.mark_price ?? 0),
          unrealizedPnl: Number(p.unrealised_pnl ?? 0),
          realizedPnl: Number(p.realised_pnl ?? 0),
          leverage: Number(p.leverage ?? 1),
          margin: Number(p.margin ?? 0),
          marginType: p.mode === "cross" ? "cross" : "isolated",
          liquidationPrice: Number(p.liq_price ?? 0) || null,
          stopLoss: undefined, takeProfit: undefined,
          openedTime: new Date(Number(p.open_time ?? 0) * 1000 || Date.now()).toISOString(),
          updatedTime: new Date(Number(p.update_time_ms ?? Date.now())).toISOString(),
        });
      }
      return [{ channel: "position", payload: arr }];
    }

    if (ch === "spot.balances") {
      for (const b of arr) {
        if (!b?.currency) continue;
        const free = Number(b.available ?? 0);
        const locked = Number(b.locked ?? 0);
        const total = free + locked;
        if (total <= 0) { sess.balances.delete(b.currency); continue; }
        sess.balances.set(b.currency, {
          asset: b.currency, free, locked, total,
          usdValue: (b.currency === "USDT" || b.currency === "USDC") ? total : undefined,
        });
      }
      return [{ channel: "balance", payload: arr }];
    }

    return [];
  }
}

/* ── Helpers ── */

function gateRawToUnified(raw: string, type: "spot" | "perp"): string {
  // Gate.io raw symbols are e.g. "BTC_USDT" for both spot and perp.
  const upper = String(raw ?? "").toUpperCase();
  const [base, quote] = upper.split("_");
  if (!base || !quote) return upper;
  if (type === "perp") return `${base}/${quote}:${quote}`;
  return `${base}/${quote}`;
}

function gateSpotOrderToCrypto(o: any): CryptoOrder {
  const sym = gateRawToUnified(o.currency_pair ?? o.symbol ?? "", "spot");
  const qty = Number(o.amount ?? o.size ?? 0);
  const filled = Number(o.filled_amount ?? o.filled_size ?? o.left?.[0] ?? 0);
  return {
    id: String(o.id ?? o.order_id ?? ""),
    clientOrderId: o.client_order_id ?? o.text,
    symbol: sym,
    marketType: "spot",
    side: String(o.side ?? "buy").toLowerCase() === "sell" ? "sell" : "buy",
    type: String(o.type ?? "limit").toLowerCase() === "market" ? "market" : "limit",
    price: Number(o.price ?? 0) || null,
    triggerPrice: null,
    quantity: qty,
    filledQuantity: filled,
    remainingQuantity: Math.max(0, qty - filled),
    avgFillPrice: Number(o.avg_deal_price ?? o.price_avg ?? 0) || null,
    status: mapGateStatus(o.status ?? o.state),
    timeInForce: String(o.time_in_force ?? "gtc").toUpperCase() === "IOC" ? "IOC" : "GTC",
    reduceOnly: !!o.is_reduce_only,
    createdTime: new Date(Number(o.create_time_ms ?? o.create_time ?? Date.now())).toISOString(),
    updatedTime: new Date(Number(o.update_time_ms ?? o.update_time ?? Date.now())).toISOString(),
    fee: Number(o.fee ?? 0) * -1,
    feeCurrency: o.fee_currency ?? "USDT",
  };
}

function gateFuturesOrderToCrypto(o: any): CryptoOrder {
  const sym = gateRawToUnified(o.contract ?? o.symbol ?? "", "perp");
  const size = Number(o.size ?? 0);
  const qty = Math.abs(size);
  const side: "buy" | "sell" = size < 0 || String(o.side ?? "").toLowerCase() === "sell" ? "sell" : "buy";
  const filled = Math.abs(Number(o.fill_size ?? o.filled_size ?? 0));
  return {
    id: String(o.id ?? o.order_id ?? ""),
    clientOrderId: o.text ?? o.client_order_id,
    symbol: sym,
    marketType: "perp",
    side,
    type: String(o.type ?? "limit").toLowerCase() === "market" ? "market" : "limit",
    price: Number(o.price ?? 0) || null,
    triggerPrice: Number(o.stop_price ?? 0) || null,
    quantity: qty,
    filledQuantity: filled,
    remainingQuantity: Math.max(0, qty - filled),
    avgFillPrice: Number(o.fill_price ?? o.price_avg ?? 0) || null,
    status: mapGateStatus(o.status ?? o.state),
    timeInForce: String(o.tif ?? "gtc").toUpperCase() === "IOC" ? "IOC" : "GTC",
    reduceOnly: !!o.is_reduce_only || !!o.is_liq,
    createdTime: new Date(Number(o.create_time_ms ?? o.create_time ?? Date.now())).toISOString(),
    updatedTime: new Date(Number(o.update_time_ms ?? o.update_time ?? Date.now())).toISOString(),
    fee: Number(o.fee ?? 0) * -1,
    feeCurrency: o.fee_currency ?? "USDT",
  };
}

function mapGateStatus(s: string | undefined): CryptoOrder["status"] {
  if (!s) return "new";
  const u = s.toLowerCase();
  if (u === "open" || u === "new" || u === "untriaged" || u === "received" || u === "queued") return "new";
  if (u === "filled" || u === "closed" || u === "done" || u === "finish") return "filled";
  if (u === "partial" || u === "partially_filled" || u === "partial-fill") return "partially_filled";
  if (u.includes("cancel")) return "canceled";
  if (u.includes("reject") || u === "failed") return "rejected";
  if (u.includes("expir")) return "expired";
  return "new";
}
