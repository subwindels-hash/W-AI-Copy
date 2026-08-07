/**
 * KuCoin connector.
 * Auth: KC-API-KEY, KC-API-SIGN (base64 HMAC-SHA256 of timestamp+method+path+body),
 * KC-API-TIMESTAMP, KC-API-PASSPHRASE, KC-API-KEY-VERSION=2.
 * Base: https://api.kucoin.com  (futures: https://api-futures.kucoin.com).
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle, CryptoMarketType } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import { logger } from "../../../config/logger.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Base64 } from "../signing.js";
import { mkMarket, mapStatusStd } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "margin", "futures"],
  auth: ["hmac_sha256_header"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: true, hasTransfers: true,
  restBaseUrl: "https://api.kucoin.com",
  testnetRestUrl: "https://openapi-sandbox.kucoin.com",
  publicWsUrl: "wss://ws-api.kucoin.com/endpoint",
  // Private URL is resolved dynamically via POST /api/v1/bullet-private on
  // every (re)connect; see preparePrivateWsUrl. Placeholder is never opened.
  privateWsUrl: "wss://ws-api.kucoin.com/endpoint",
  publicWsPingIntervalMs: 18_000,
  privateWsPingIntervalMs: 18_000,
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class KucoinConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "kucoin", label: "KuCoin", capabilities: CAPS }); }

  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const ts = String(timestampMs);
        const payload = ts + method.toUpperCase() + path + (body ?? "");
        headers["KC-API-KEY"] = creds.apiKey;
        headers["KC-API-SIGN"] = hmacSha256Base64(creds.apiSecret, payload);
        headers["KC-API-TIMESTAMP"] = ts;
        headers["KC-API-PASSPHRASE"] = hmacSha256Base64(creds.apiSecret, creds.passphrase ?? "");
        headers["KC-API-KEY-VERSION"] = "2";
        headers["content-type"] = "application/json";
      },
    };
  }

  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const bases = [
      "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "MATIC", "DOT", "LTC", "BNB",
      "BCH", "ETC", "FIL", "ATOM", "NEAR", "APT", "ARB", "OP", "SUI", "SEI", "INJ", "TIA",
      "PEPE", "WIF", "SHIB", "TRX", "UNI", "AAVE", "MKR", "LDO", "RNDR", "IMX", "STX",
      "FET", "GRT", "PYTH", "WLD", "TON",
    ];
    return bases.map((b) => {
      const r = `${b}-USDT`;
      return mkMarket(`${b}/USDT`, r, "spot", b, "USDT", "", 0.01, 0.00001, 5, 0.00001, 10, 2, 5);
    });
  }

  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const accs = await sess.http.request<any>({ method: "GET", path: "/api/v1/accounts" });
    const balances: CryptoBalance[] = (accs.data?.data ?? [])
      .map((a: any) => ({ asset: a.currency, free: Number(a.available), locked: Number(a.holds), total: Number(a.balance) }))
      .filter((b: CryptoBalance) => b.total > 0);
    let openOrders: CryptoOrder[] = [];
    try {
      const oo = await sess.http.request<any>({ method: "GET", path: "/api/v1/orders", query: { status: "active", pageSize: "50" } });
      openOrders = (oo.data?.data?.items ?? []).map((o: any) => kucoinOrderToCrypto(o));
    } catch { /* */ }
    return { accountId: sess.login, accountType: "spot", canTrade: true, canWithdraw: true, equityUsd: balances.reduce((s, b) => s + (b.asset === "USDT" || b.asset === "USDC" || b.asset === "USDT" ? b.total : 0), 0), unrealizedPnlUsd: 0, balances, positions: [], openOrders };
  }

  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const body: Record<string, any> = {
      clientOid: req.clientOrderId ?? this.genClientOrderId(sess),
      side: req.side,
      symbol: m.rawSymbol,
      type: req.type === "limit" ? "limit" : "market",
    };
    if (req.type === "limit") {
      body.price = String(req.price); body.size = String(req.quantity);
      body.timeInForce = req.timeInForce ?? "GTC";
      if (req.postOnly) body.postOnly = true;
    } else {
      body.size = String(req.quantity);
    }
    if (req.reduceOnly) body.reduceOnly = true;
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/api/v1/orders", body });
      const d = r.data?.data;
      if (r.data?.code && r.data.code !== "200000") return { ok: false, error: r.data.msg || "rejected", retcode: Number(r.data.code) };
      return { ok: true, ticket: d?.orderId, comment: body.clientOid };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async modifyOrder(_sess: CryptoAccountSession, _id: string, _patch: any): Promise<OrderResult> { return { ok: false, error: "kucoin modify: cancel and re-place" }; }
  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const sym = orderIdOrSymbol.includes("/") ? orderIdOrSymbol : (sess.openOrders.get(orderIdOrSymbol)?.symbol ?? orderIdOrSymbol);
    const m = sess.markets.get(sym); if (!m) return { ok: false, error: "market not found" };
    const bal = sess.balances.get(m.base);
    const qty = volume ?? bal?.free ?? 0;
    if (qty <= 0) return { ok: false, error: "no balance" };
    return this.placeOrder(sess, { symbol: sym, marketType: "spot", side: "sell", type: "market", quantity: qty });
  }
  protected async cancelOrderImpl(sess: CryptoAccountSession, orderId: string): Promise<OrderResult> {
    try {
      await sess.http.request<any>({ method: "DELETE", path: `/api/v1/orders/${orderId}` });
      return { ok: true, ticket: orderId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const interval = { M1: "1min", M5: "5min", M15: "15min", M30: "30min", H1: "1hour", H4: "4hour", D1: "1day", W1: "1week", MN1: "1month" }[tf] ?? "1hour";
    const r = await sess.http.request<any>({ method: "GET", path: "/api/v1/market/candles", query: { symbol: m.rawSymbol, type: interval }, skipAuth: true });
    return (r.data?.data ?? []).slice(0, count).reverse().map((k: any) => ({
      symbol, timeframe: tf, time: new Date(Number(k[0]) * 1000).toISOString(),
      open: Number(k[1]), high: Number(k[3]), low: Number(k[4]), close: Number(k[2]), volume: Number(k[5]),
    }));
  }
  protected async fetchRecentFills(sess: CryptoAccountSession, since?: string): Promise<CryptoFill[]> {
    try {
      const r = await sess.http.request<any>({ method: "GET", path: "/api/v1/fills", query: { pageSize: "50" } });
      const out: CryptoFill[] = (r.data?.data?.items ?? []).map((f: any) => ({
        id: f.tradeId, orderId: f.orderId, symbol: f.symbol.replace("-", "/"), marketType: "spot",
        side: f.side === "buy" ? "buy" : "sell", price: Number(f.price), quantity: Number(f.size),
        fee: Number(f.fee), feeCurrency: f.feeCurrency, time: new Date(Number(f.createdAt)).toISOString(), isMaker: f.liquidity === "maker", tradeId: f.tradeId,
      }));
      if (since) return out.filter((f) => f.time >= since);
      return out;
    } catch { return []; }
  }
  protected publicPingMessage(): object { return { id: String(Date.now()), type: "ping" }; }
  protected privatePingMessage(): object { return { id: String(Date.now()), type: "ping" }; }

  protected async preparePrivateWsUrl(sess: CryptoAccountSession): Promise<string | undefined> {
    // KuCoin bullet-private returns a per-connect WSS endpoint + token.
    // Token TTL is short; it is re-fetched by prepareUrl on every reconnect.
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/api/v1/bullet-private" });
      const d = r.data?.data;
      const token: string = d?.token;
      const server = d?.instanceServers?.[0];
      if (!token || !server?.endpoint) return undefined;
      const endpoint: string = server.endpoint.replace(/\/+$/, "");
      const connectId = `wkc-${sess.id}-${Date.now()}`;
      return `${endpoint}?token=${token}&connectId=${connectId}`;
    } catch (e) {
      logger.warn("[kucoin] bullet-private failed", { err: (e as Error).message });
      return undefined;
    }
  }

  protected authenticatePrivateWs(_sess: CryptoAccountSession, _send: (p: any) => void): void {
    // KuCoin private WS authenticates via the ?token= query parameter returned
    // from /api/v1/bullet-private; no post-connect login frame is required.
  }

  protected async afterPrivateAuth(_sess: CryptoAccountSession, send: (p: any) => void): Promise<void> {
    // Subscribe to the private order-change & account-balance topics.
    const ack = (topic: string) => ({
      id: `sub-${topic}-${Date.now()}`,
      type: "subscribe",
      topic,
      privateChannel: true,
      response: true,
    });
    send(ack("/spotMarket/tradeOrders"));
    send(ack("/account/balance"));
  }

  private nextSubId = 1;
  protected buildTickerSubscribePayload(m: CryptoMarket): object | null {
    // KuCoin public ticker topic: /market/ticker:<symbol>
    const id = this.nextSubId++;
    return { id, type: "subscribe", topic: `/market/ticker:${m.rawSymbol}`, response: true };
  }
  protected buildTickerUnsubscribePayload(m: CryptoMarket): object | null {
    const id = this.nextSubId++;
    return { id, type: "unsubscribe", topic: `/market/ticker:${m.rawSymbol}`, response: true };
  }
  protected parsePublicMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any; try { msg = JSON.parse(raw); } catch { return []; }
    if (msg?.type === "pong" || msg?.type === "ack" || msg?.type === "welcome") return [];
    const topic: string = msg?.topic ?? "";
    if (!topic.startsWith("/market/ticker:")) return [];
    const rawSym = topic.slice("/market/ticker:".length);
    const m = sess.marketsByRaw.get(rawSym);
    if (!m) return [];
    return [{ channel: `ticker:${m.rawSymbol}`, payload: msg.data ?? msg }];
  }
  protected parseTickerMessage(_s: CryptoAccountSession, _m: CryptoMarket, payload: any): { bid: number; ask: number } | null {
    // KuCoin ticker pushes {sequence,bestAsk,bestAskSize,bestBid,bestBidSize,price,...}
    const bid = Number(payload?.bestBid);
    const ask = Number(payload?.bestAsk);
    if (!bid || !ask) return null;
    return { bid, ask };
  }

  protected parsePrivateMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any; try { msg = JSON.parse(raw); } catch { return []; }
    if (!msg) return [];
    if (msg.type === "pong" || msg.type === "ack" || msg.type === "welcome") return [];
    const topic: string = msg.topic ?? "";
    const subject: string = msg.subject ?? "";
    const data = msg.data;
    const out: Array<{ channel: string; payload: unknown }> = [];
    if (topic === "/spotMarket/tradeOrders" && data) {
      const rawSym = String(data.symbol ?? "");
      const sym = rawSym ? rawSym.replace("-", "/") : "";
      if (!sym) return out;
      const m = sess.markets.get(sym);
      const order: CryptoOrder = {
        id: String(data.orderId ?? data.id ?? ""),
        clientOrderId: data.clientOid,
        symbol: sym, marketType: (m?.type ?? "spot") as CryptoMarketType,
        side: String(data.side ?? "buy").toLowerCase() === "sell" ? "sell" : "buy",
        type: mapKucoinType(data.orderType ?? data.type),
        price: Number(data.price ?? 0) || null,
        triggerPrice: null,
        quantity: Number(data.size ?? 0),
        filledQuantity: Number(data.filledSize ?? data.dealSize ?? 0),
        remainingQuantity: Math.max(0, Number(data.size ?? 0) - Number(data.filledSize ?? data.dealSize ?? 0)),
        avgFillPrice: null,
        status: mapKucoinStatus(data.status ?? data.type),
        timeInForce: "GTC", reduceOnly: false, leverage: undefined,
        stopLoss: null, takeProfit: null,
        createdTime: data.orderTime ? new Date(Number(data.orderTime)).toISOString() : new Date().toISOString(),
        updatedTime: data.ts ? new Date(Number(data.ts) / 1_000_000).toISOString() : new Date().toISOString(),
        fee: 0, feeCurrency: "USDT",
      };
      sess.openOrders.set(order.id, order);
      if (order.status === "filled" || order.status === "canceled" || order.status === "rejected" || order.status === "expired") {
        sess.openOrders.delete(order.id);
      }
      if (subject === "match" || subject === "filled") {
        const qty = Number(data.matchSize ?? data.filledSize ?? data.size ?? 0);
        const price = Number(data.matchPrice ?? data.price ?? 0);
        if (qty > 0 && price > 0) {
          const fill = {
            id: String(data.tradeId ?? data.id ?? order.id + ":" + Date.now()),
            orderId: order.id, symbol: sym, marketType: (m?.type ?? "spot") as CryptoMarketType,
            side: order.side, price, quantity: qty,
            fee: Number(data.fee ?? 0), feeCurrency: data.feeCurrency ?? "USDT",
            realizedPnl: 0,
            time: order.updatedTime, isMaker: data.liquidity === "maker",
            tradeId: String(data.tradeId ?? ""),
          };
          this.applyFill(sess, fill as any);
          out.push({ channel: "fill", payload: fill });
        }
      }
      out.push({ channel: "order", payload: order });
    } else if (topic === "/account/balance" && data) {
      const asset = data.currency;
      if (asset) {
        const available = Number(data.available ?? 0);
        const holds = Number(data.hold ?? 0);
        sess.balances.set(asset, { asset, free: available, locked: holds, total: available + holds });
      }
      out.push({ channel: "balance", payload: data });
    }
    return out;
  }
}

/* ── KuCoin helpers ──────────────────────────────────────── */

function kucoinOrderToCrypto(o: any): CryptoOrder {
  const sym = String(o.symbol ?? "").replace("-", "/");
  const qty = Number(o.size ?? 0);
  const filled = Number(o.dealSize ?? o.filledSize ?? 0);
  return {
    id: String(o.id), clientOrderId: o.clientOid, symbol: sym,
    marketType: "spot",
    side: o.side === "buy" ? "buy" : "sell",
    type: o.type === "limit" ? "limit" : (o.type === "market" ? "market" : "limit"),
    price: Number(o.price) || null, triggerPrice: null,
    quantity: qty, filledQuantity: filled,
    remainingQuantity: Math.max(0, qty - filled), avgFillPrice: null,
    status: mapStatusStd(o.isActive ? "active" : (o.cancelExist ? "canceled" : "done")),
    timeInForce: "GTC", reduceOnly: false, leverage: undefined,
    stopLoss: null, takeProfit: null,
    createdTime: new Date(Number(o.createdAt)).toISOString(),
    updatedTime: new Date().toISOString(), fee: 0, feeCurrency: "USDT",
  };
}

function mapKucoinType(t: string): CryptoOrder["type"] {
  const u = String(t || "").toLowerCase();
  if (u === "market") return "market";
  if (u === "limit") return "limit";
  if (u === "stop") return "stop_market";
  return "limit";
}

function mapKucoinStatus(s: string): CryptoOrder["status"] {
  const u = String(s || "").toLowerCase();
  if (u === "open" || u === "received" || u === "match") return "new";
  if (u === "done" || u === "filled") return "filled";
  if (u === "cancel" || u === "canceled" || u === "cancelled") return "canceled";
  if (u === "reject" || u === "rejected") return "rejected";
  if (u === "partial" || u === "partially_filled") return "partially_filled";
  return "new";
}
