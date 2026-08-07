/**
 * MEXC connector (Spot + USDT perps — Binance-compatible API).
 * Auth: ApiKey / Request-Time / Signature headers; HMAC-SHA256 hex of `timestamp+params`.
 * Base: https://api.mexc.com.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoCandle, CryptoOrder, CryptoMarketType } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Hex } from "../signing.js";
import { majorPairs } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp"],
  auth: ["hmac_sha256_header"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: false, hasTransfers: false,
  restBaseUrl: "https://api.mexc.com",
  testnetRestUrl: "https://api.mexc.com",
  publicWsUrl: "wss://wbs.mexc.com/ws",
  privateWsUrl: "wss://wbs.mexc.com/ws",
  defaultReqPerMin: 600, correctsClockDrift: true,
  privateWsUsesListenKey: true,
  publicWsPingIntervalMs: 20_000,
};

export class MexcConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "mexc", label: "MEXC", capabilities: CAPS }); }

  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const ts = String(timestampMs);
        let qs = "";
        if (method === "GET" || method === "DELETE") {
          const qIdx = path.indexOf("?");
          qs = qIdx >= 0 ? path.slice(qIdx + 1) : "";
        } else {
          qs = body ?? "";
        }
        const sigPayload = ts + (qs ? qs : "");
        headers["ApiKey"] = creds.apiKey;
        headers["Request-Time"] = ts;
        headers["Signature"] = hmacSha256Hex(creds.apiSecret, sigPayload);
        if (body) headers["content-type"] = "application/json";
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { perp, spot } = majorPairs("USDT"); return [...perp, ...spot];
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const r = await sess.http.request<any>({ method: "GET", path: "/api/v3/account" });
    const balances: CryptoBalance[] = (r.data?.balances ?? []).map((b: any) => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked), total: Number(b.free) + Number(b.locked) })).filter((b: CryptoBalance) => b.total > 0);
    return { accountId: sess.login, accountType: "spot", canTrade: true, canWithdraw: true, equityUsd: balances.reduce((s, b) => s + (b.asset === "USDT" ? b.total : 0), 0), unrealizedPnlUsd: 0, balances, positions: [], openOrders: [] };
  }
  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const params: Record<string, any> = { symbol: m.rawSymbol, side: req.side.toUpperCase(), type: req.type === "limit" ? "LIMIT" : "MARKET", quantity: String(req.quantity), newClientOrderId: req.clientOrderId ?? this.genClientOrderId(sess) };
    if (req.type === "limit") { params.price = String(req.price); params.timeInForce = req.timeInForce ?? "GTC"; }
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/api/v3/order", query: params });
      return { ok: true, ticket: String(r.data?.orderId ?? params.newClientOrderId), comment: params.newClientOrderId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async modifyOrder(_sess: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return { ok: false, error: "mexc modify: cancel + re-place" }; }
  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const sym = orderIdOrSymbol.includes("/") ? orderIdOrSymbol : (sess.openOrders.get(orderIdOrSymbol)?.symbol ?? orderIdOrSymbol);
    const m = sess.markets.get(sym); if (!m) return { ok: false, error: "not found" };
    const bal = sess.balances.get(m.base);
    const qty = volume ?? bal?.free ?? 0;
    if (qty <= 0) return { ok: false, error: "no balance" };
    return this.placeOrder(sess, { symbol: sym, marketType: "spot", side: "sell", type: "market", quantity: qty });
  }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const interval = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1d", W1: "1w", MN1: "1M" }[tf] ?? "1h";
    const r = await sess.http.request<any[]>({ method: "GET", path: "/api/v3/klines", query: { symbol: m.rawSymbol, interval, limit: String(Math.min(count, 1000)) }, skipAuth: true });
    return (r.data ?? []).map((k: any) => ({ symbol, timeframe: tf, time: new Date(k[0]).toISOString(), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]) }));
  }
  protected async fetchRecentFills(sess: CryptoAccountSession, since?: string): Promise<CryptoFill[]> {
    try {
      const r = await sess.http.request<any[]>({ method: "GET", path: "/api/v3/myTrades", query: { limit: "50" } });
      const out: CryptoFill[] = (r.data ?? []).map((t: any) => ({ id: String(t.id), orderId: String(t.orderId), symbol: t.symbol, marketType: "spot", side: t.isBuyer ? "buy" : "sell", price: Number(t.price), quantity: Number(t.qty), fee: Number(t.commission), feeCurrency: t.commissionAsset, time: new Date(t.time).toISOString(), isMaker: t.isMaker, tradeId: String(t.id) }));
      if (since) return out.filter((f) => f.time >= since);
      return out;
    } catch { return []; }
  }
  protected publicPingMessage() {
    // MEXC requires an app-level ping frame every ~20s to keep public WS alive.
    return { method: "PING" };
  }
  protected privatePingMessage() { return { method: "PING" }; }
  protected authenticatePrivateWs(_sess: CryptoAccountSession, _send: (p: any) => void): void {
    // MEXC user stream is authenticated purely by the listenKey baked into the URL.
  }

  protected buildTickerSubscribePayload(m: CryptoMarket): object | null {
    // MEXC spot bookTicker: "spot@public.bookTicker.v3.api@<raw>".
    const inst = m.rawSymbol;
    const channel = m.type === "perp" ? `${inst.toLowerCase()}@bookTicker` : `spot@public.bookTicker.v3.api@${inst}`;
    return { method: "SUBSCRIPTION", params: [channel] };
  }
  protected buildTickerUnsubscribePayload(m: CryptoMarket): object | null {
    const inst = m.rawSymbol;
    const channel = m.type === "perp" ? `${inst.toLowerCase()}@bookTicker` : `spot@public.bookTicker.v3.api@${inst}`;
    return { method: "UNSUBSCRIPTION", params: [channel] };
  }
  protected parseTickerMessage(_sess: CryptoAccountSession, _m: CryptoMarket, payload: any): { bid: number; ask: number } | null {
    if (!payload) return null;
    const d = payload.d ?? payload;
    const bid = Number(d.b ?? d.bidPrice ?? d.bid ?? 0);
    const ask = Number(d.a ?? d.askPrice ?? d.ask ?? 0);
    if (!bid || !ask) return null;
    return { bid, ask };
  }
  protected parsePublicMessage(_sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return []; }
    if (!msg) return [];
    // Pong frames are handled; subscription acks ignored.
    if (msg.msg === "PONG" || msg.code === 0 || msg.id) return [];
    if (!msg.c) return [];
    return [{ channel: `ticker:${(msg.s ?? "")}`, payload: msg }];
  }

  protected parsePrivateMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return []; }
    if (!msg?.c) return [];
    const out: Array<{ channel: string; payload: unknown }> = [];
    const ev = String(msg.c);
    // MEXC spot user-data push events on /api/v3/userDataStream listenKey:
    //   "spot@private.deals.v3.api"  — fills (deals/trades)
    //   "spot@private.orders.v3.api" — order updates
    //   "spot@private.account.v3.api" — balance changes
    if (ev.includes("orders") || ev === "ORDER_UPDATE") {
      const d = msg.d ?? msg.data ?? msg;
      const rawSym = String(d.s ?? d.symbol ?? "");
      const sym = rawToUnified(rawSym);
      if (!sym) return out;
      const m = sess.markets.get(sym);
      const o: CryptoOrder = {
        id: String(d.i ?? d.orderId ?? d.clientOrderId ?? ""),
        clientOrderId: d.c ?? d.clientOrderId,
        symbol: sym, marketType: m?.type ?? "spot",
        side: String(d.S ?? d.side ?? "buy").toLowerCase() === "sell" ? "sell" : "buy",
        type: normalizeOrderType(d.o ?? d.type),
        price: Number(d.p ?? d.price ?? 0) || null,
        triggerPrice: null,
        quantity: Number(d.q ?? d.origQty ?? d.qty ?? 0),
        filledQuantity: Number(d.z ?? d.executedQty ?? d.filledQty ?? 0),
        remainingQuantity: Math.max(0, Number(d.q ?? d.origQty ?? 0) - Number(d.z ?? d.executedQty ?? 0)),
        avgFillPrice: Number(d.ap ?? d.avgPrice ?? 0) || null,
        status: normalizeOrderStatus(d.X ?? d.state ?? d.status),
        timeInForce: (d.f ?? d.timeInForce ?? "GTC") as any,
        reduceOnly: false, leverage: undefined,
        stopLoss: null, takeProfit: null,
        createdTime: d.O ? new Date(Number(d.O)).toISOString() : new Date().toISOString(),
        updatedTime: d.T ? new Date(Number(d.T)).toISOString() : new Date().toISOString(),
        fee: Number(d.n ?? 0), feeCurrency: d.N ?? "USDT",
      };
      sess.openOrders.set(o.id, o);
      if (o.status === "filled" || o.status === "canceled" || o.status === "rejected" || o.status === "expired") {
        sess.openOrders.delete(o.id);
      }
      // If this is a TRADE event, also synthesize a fill record.
      if ((d.x ?? d.executionType) === "TRADE" || ev.includes("deals")) {
        const fqty = Number(d.l ?? d.lastQty ?? 0) || Math.max(0, o.quantity - (o.quantity - o.filledQuantity));
        if (fqty > 0) {
          const fill = {
            id: String(d.t ?? d.tradeId ?? o.id + ":" + Date.now()),
            orderId: o.id, symbol: sym, marketType: (m?.type ?? "spot") as CryptoMarketType,
            side: o.side, price: Number(d.L ?? d.lastPrice ?? o.avgFillPrice ?? o.price ?? 0),
            quantity: fqty, fee: o.fee, feeCurrency: o.feeCurrency,
            realizedPnl: 0,
            time: o.updatedTime, isMaker: !!d.m, tradeId: String(d.t ?? ""),
          };
          this.applyFill(sess, fill as any);
          out.push({ channel: "fill", payload: fill });
        }
      }
      out.push({ channel: "order", payload: o });
    } else if (ev.includes("account") || ev.includes("balances")) {
      const d = msg.d ?? msg.data ?? msg;
      const bals = Array.isArray(d.B ?? d.balances) ? (d.B ?? d.balances) : [];
      for (const b of bals) {
        const asset = b.a ?? b.asset;
        if (!asset) continue;
        const free = Number(b.f ?? b.free);
        const locked = Number(b.l ?? b.locked);
        sess.balances.set(asset, { asset, free, locked, total: free + locked });
      }
      out.push({ channel: "balance", payload: msg });
    } else if (ev.includes("deals")) {
      // Stand-alone trade push; forward as fill.
      const d = msg.d ?? msg.data ?? msg;
      const rawSym = String(d.s ?? d.symbol ?? "");
      const sym = rawToUnified(rawSym);
      if (sym) {
        const fill = {
          id: String(d.t ?? d.id ?? Date.now()),
          orderId: String(d.i ?? d.orderId ?? ""),
          symbol: sym, marketType: "spot" as CryptoMarketType,
          side: String(d.S ?? d.side ?? "buy").toLowerCase() === "sell" ? "sell" : "buy",
          price: Number(d.p ?? d.price ?? 0), quantity: Number(d.v ?? d.qty ?? d.q ?? 0),
          fee: Number(d.n ?? 0), feeCurrency: d.N ?? "USDT",
          realizedPnl: 0,
          time: d.T ? new Date(Number(d.T)).toISOString() : new Date().toISOString(),
          isMaker: !!d.m, tradeId: String(d.t ?? d.id ?? ""),
        };
        this.applyFill(sess, fill as any);
        out.push({ channel: "fill", payload: fill });
      }
    }
    return out;
  }

  protected async cancelOrderImpl(sess: CryptoAccountSession, orderId: string): Promise<OrderResult> {
    const o = sess.openOrders.get(orderId);
    if (!o) return { ok: false, error: "order not tracked" };
    const m = sess.markets.get(o.symbol);
    if (!m) return { ok: false, error: "market not found" };
    try {
      const r = await sess.http.request<any>({ method: "DELETE", path: "/api/v3/order", query: { symbol: m.rawSymbol, orderId } });
      return { ok: true, ticket: String(r.data?.orderId ?? orderId) };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  protected async createListenKey(sess: CryptoAccountSession): Promise<string | undefined> {
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/api/v3/userDataStream" });
      return r.data?.listenKey;
    } catch { return undefined; }
  }
  protected async keepAliveListenKey(sess: CryptoAccountSession): Promise<void> {
    if (sess.privateListenKey) {
      await sess.http.request<any>({ method: "PUT", path: "/api/v3/userDataStream", query: { listenKey: sess.privateListenKey } }).catch(() => {});
    }
  }
  protected async disposeListenKey(sess: CryptoAccountSession): Promise<void> {
    if (sess.privateListenKey) {
      await sess.http.request<any>({ method: "DELETE", path: "/api/v3/userDataStream", query: { listenKey: sess.privateListenKey } }).catch(() => {});
    }
  }
}

function rawToUnified(rawSym: string): string | null {
  if (!rawSym) return null;
  const s = rawSym.toUpperCase().replace(/USDT$/, "");
  if (!s) return null;
  return `${s}/USDT`;
}

function normalizeOrderType(t: string): CryptoOrder["type"] {
  const u = String(t).toUpperCase();
  if (u === "LIMIT") return "limit";
  if (u === "MARKET") return "market";
  if (u === "STOP" || u === "STOP_MARKET") return "stop_market";
  if (u === "TAKE_PROFIT_MARKET") return "take_profit_market";
  if (u === "LIMIT_MAKER") return "post_only";
  return "limit";
}

function normalizeOrderStatus(s: string): CryptoOrder["status"] {
  const u = String(s).toUpperCase();
  if (u === "NEW" || u === "PENDING" || u === "ACCEPTED") return "new";
  if (u === "PARTIALLY_FILLED") return "partially_filled";
  if (u === "FILLED") return "filled";
  if (u === "CANCELED" || u === "CANCELLED" || u === "EXPIRED") return "canceled";
  if (u === "REJECTED") return "rejected";
  return "new";
}
