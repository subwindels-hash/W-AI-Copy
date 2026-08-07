/**
 * Bybit connector (Unified Trading Account v5 — spot, linear/inverse perp, options).
 *
 * Phase 2: live order routing (create/modify/cancel), ticker WS subscription,
 * private WS auth, execution/position updates via private stream.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Hex } from "../signing.js";
import { buildOrderParams, resultFromCreateResponse } from "../order-utils.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp", "futures", "options"],
  auth: ["hmac_sha256_header"],
  hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: true, hasTransfers: false,
  restBaseUrl: "https://api.bybit.com",
  testnetRestUrl: "https://api-testnet.bybit.com",
  publicWsUrl: "wss://stream.bybit.com/v5/public/linear",
  privateWsUrl: "wss://stream.bybit.com/v5/private",
  testnetPublicWsUrl: "wss://stream-testnet.bybit.com/v5/public/linear",
  testnetPrivateWsUrl: "wss://stream-testnet.bybit.com/v5/private",
  publicWsPingIntervalMs: 20_000,
  privateWsPingIntervalMs: 20_000,
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class BybitConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "bybit", label: "Bybit", capabilities: CAPS }); }
  private nextWsReqId = 1;

  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    const recvWindow = "5000";
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const ts = String(timestampMs);
        let payload = ts + creds.apiKey + recvWindow;
        if (method === "GET") {
          const q = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
          payload += q;
        } else {
          payload += body ?? "";
        }
        headers["X-BAPI-API-KEY"] = creds.apiKey;
        headers["X-BAPI-TIMESTAMP"] = ts;
        headers["X-BAPI-RECV-WINDOW"] = recvWindow;
        headers["X-BAPI-SIGN"] = hmacSha256Hex(creds.apiSecret, payload);
      },
    };
  }
  protected async fetchMarkets(_sess: CryptoAccountSession): Promise<CryptoMarket[]> {
    const pairs = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "MATICUSDT", "DOTUSDT", "LTCUSDT", "BNBUSDT"];
    return pairs.flatMap((r) => {
      const base = r.replace(/USDT$/, "");
      return [
        { symbol: `${base}/USDT`, rawSymbol: r, type: "spot" as const, base, quote: "USDT", settle: "", contractSize: 1, active: true, pricePrecision: 2, qtyPrecision: 5, minQty: 0.00001, minNotional: 10, maxLeverage: 1, tickSize: 0.01, stepSize: 0.00001 },
        { symbol: `${base}/USDT:USDT`, rawSymbol: r, type: "perp" as const, base, quote: "USDT", settle: "USDT", contractSize: 1, active: true, pricePrecision: 2, qtyPrecision: 3, minQty: 0.001, minNotional: 5, maxLeverage: 100, tickSize: 0.01, stepSize: 0.001 },
      ];
    });
  }

  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const w = await sess.http.request<any>({ method: "GET", path: "/v5/account/wallet-balance", query: { accountType: "UNIFIED" } });
    const coins = w.data?.result?.list?.[0]?.coin ?? [];
    const balances: CryptoBalance[] = coins
      .map((c: any) => ({ asset: c.coin, free: Number(c.availableToWithdraw), locked: 0, total: Number(c.walletBalance), usdValue: Number(c.usdValue) }))
      .filter((b: CryptoBalance) => b.total > 0);
    let positions: CryptoPosition[] = [];
    let openOrders: CryptoOrder[] = [];
    try {
      const pos = await sess.http.request<any>({ method: "GET", path: "/v5/position/list", query: { category: "linear", limit: 50 } });
      positions = (pos.data?.result?.list ?? [])
        .filter((p: any) => Number(p.size) !== 0)
        .map((p: any) => ({
          symbol: symToUnified(p.symbol), marketType: "perp",
          side: p.side === "Buy" ? "long" : p.side === "Sell" ? "short" : (Number(p.size) > 0 ? "long" : "short"),
          quantity: Math.abs(Number(p.size)), entryPrice: Number(p.avgPrice), markPrice: Number(p.markPrice),
          unrealizedPnl: Number(p.unrealisedPnl), realizedPnl: Number(p.curRealisedPnl), leverage: Number(p.leverage),
          margin: 0, marginType: p.tradeMode === 1 ? "cross" : "isolated", liquidationPrice: Number(p.liqPrice) || null,
          stopLoss: Number(p.stopLoss) || undefined, takeProfit: Number(p.takeProfit) || undefined,
          openedTime: new Date(Number(p.createdTime)).toISOString(), updatedTime: new Date(Number(p.updatedTime)).toISOString(),
        }));
      const oo = await sess.http.request<any>({ method: "GET", path: "/v5/order/realtime", query: { category: "linear", limit: 50 } });
      openOrders = (oo.data?.result?.list ?? []).map((o: any) => ({
        id: o.orderId, clientOrderId: o.orderLinkId, symbol: symToUnified(o.symbol), marketType: "perp",
        side: (o.side || "").toLowerCase() === "buy" ? "buy" : "sell",
        type: mapOrderType(o.orderType), price: Number(o.price) || null,
        triggerPrice: Number(o.triggerPrice) || null,
        quantity: Number(o.qty), filledQuantity: Number(o.cumExecQty),
        remainingQuantity: Number(o.qty) - Number(o.cumExecQty), avgFillPrice: Number(o.avgPrice) || null,
        status: mapOrderStatus(o.orderStatus), timeInForce: o.timeInForce ?? "GTC",
        reduceOnly: !!o.reduceOnly, createdTime: new Date(Number(o.createdTime)).toISOString(),
        updatedTime: new Date(Number(o.updatedTime)).toISOString(), fee: 0, feeCurrency: "USDT",
      }));
    } catch { /* futures not enabled */ }
    return {
      accountId: sess.login, accountType: "unified", canTrade: true, canWithdraw: false,
      equityUsd: balances.reduce((s, b) => s + (b.usdValue ?? 0), 0),
      unrealizedPnlUsd: positions.reduce((s, p) => s + p.unrealizedPnl, 0),
      balances, positions, openOrders,
    };
  }

  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const category = m.type === "spot" ? "spot" : "linear";
    const params: Record<string, any> = { category, symbol: m.rawSymbol };
    const p = buildOrderParams(req, {
      rawSymbol: m.rawSymbol, pricePrecision: m.pricePrecision, qtyPrecision: m.qtyPrecision,
      tickSize: m.tickSize, stepSize: m.stepSize,
      qtyKey: "qty", priceKey: "price", stopKey: "triggerPrice", clientKey: "orderLinkId", reduceKey: "reduceOnly",
    });
    Object.assign(params, p);
    if (req.leverage) params.leverage = String(req.leverage);
    if (req.positionSide) params.positionIdx = req.positionSide === "long" ? 1 : req.positionSide === "short" ? 2 : 0;
    // Bybit uses tp/sl fields directly on the order.
    if (req.takeProfit?.price) params.takeProfit = req.takeProfit.price;
    if (req.stopLoss?.price) params.stopLoss = req.stopLoss.price;
    params.orderFilter = category === "spot" ? "ORDER" : undefined;
    if (category === "spot" && req.type === "market") delete params.price;
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/v5/order/create", body: params });
      const oid = r.data?.result?.orderId;
      return { ok: r.data?.retCode === 0, ticket: oid, comment: r.data?.result?.orderLinkId, retcode: r.data?.retCode, error: r.data?.retMsg, latencyMs: 0 };
    } catch (e: any) {
      return { ok: false, error: e.message, retcode: e.exchangeCode ? Number(e.exchangeCode) : -1 };
    }
  }

  protected async modifyOrder(sess: CryptoAccountSession, orderId: string, patch: { sl?: number; tp?: number; comment?: string }): Promise<OrderResult> {
    const o = sess.openOrders.get(orderId);
    const symbol = o?.symbol ?? orderId;
    const m = sess.markets.get(symbol); if (!m) return { ok: false, error: "market not found" };
    const body: any = { category: m.type === "spot" ? "spot" : "linear", symbol: m.rawSymbol };
    if (o) body.orderId = orderId;
    else body.symbol = m.rawSymbol;
    if (patch.sl) body.stopLoss = String(patch.sl);
    if (patch.tp) body.takeProfit = String(patch.tp);
    try {
      await sess.http.request<any>({ method: "POST", path: "/v5/order/amend", body });
      return { ok: true, ticket: orderId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const sym = orderIdOrSymbol.includes("/") ? orderIdOrSymbol : (sess.openOrders.get(orderIdOrSymbol)?.symbol ?? orderIdOrSymbol);
    const pos = sess.positions.get(sym); const m = sess.markets.get(sym);
    if (!pos || !m) return { ok: false, error: "no open position" };
    const side = pos.side === "long" ? "Sell" : "Buy";
    const category = m.type === "spot" ? "spot" : "linear";
    const body: Record<string, any> = { category, symbol: m.rawSymbol, side, orderType: "Market", qty: String(volume ?? pos.quantity), reduceOnly: true, orderLinkId: this.genClientOrderId(sess) };
    if (category === "spot") delete body.reduceOnly;
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/v5/order/create", body });
      return { ok: r.data?.retCode === 0, ticket: r.data?.result?.orderId, error: r.data?.retMsg };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  protected async cancelOrderImpl(sess: CryptoAccountSession, orderId: string): Promise<OrderResult> {
    const o = sess.openOrders.get(orderId); if (!o) return { ok: false, error: "not found" };
    const m = sess.markets.get(o.symbol); if (!m) return { ok: false, error: "market not found" };
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/v5/order/cancel", body: { category: m.type === "spot" ? "spot" : "linear", symbol: m.rawSymbol, orderId } });
      return { ok: r.data?.retCode === 0, ticket: orderId, error: r.data?.retMsg };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const cat = m.type === "spot" ? "spot" : "linear";
    const r = await sess.http.request<any>({ method: "GET", path: "/v5/market/kline", query: { category: cat, symbol: m.rawSymbol, interval: tfToBybit(tf), limit: Math.min(count, 200) }, skipAuth: true });
    return (r.data?.result?.list ?? []).reverse().map((k: any) => ({
      symbol, timeframe: tf, time: new Date(Number(k[0])).toISOString(),
      open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]),
      volume: Number(k[5]), quoteVolume: Number(k[6]),
    }));
  }
  protected async fetchRecentFills(sess: CryptoAccountSession, since?: string): Promise<CryptoFill[]> {
    try {
      const r = await sess.http.request<any>({ method: "GET", path: "/v5/execution/list", query: { category: "linear", limit: 50 } });
      const out: CryptoFill[] = (r.data?.result?.list ?? []).map((t: any) => ({
        id: t.execId, orderId: t.orderId, symbol: symToUnified(t.symbol), marketType: "perp",
        side: (t.side || "").toLowerCase() === "buy" ? "buy" : "sell", price: Number(t.execPrice), quantity: Number(t.execQty),
        fee: Number(t.execFee), feeCurrency: t.feeCurrency ?? "USDT", realizedPnl: Number(t.closedPnl) || 0,
        time: new Date(Number(t.execTime)).toISOString(), isMaker: !t.isMaker, tradeId: t.execId,
      }));
      if (since) return out.filter((f) => f.time >= since);
      return out;
    } catch { return []; }
  }

  protected authenticatePrivateWs(sess: CryptoAccountSession, send: (p: any) => void): void {
    const expires = Date.now() + 10_000;
    const sig = hmacSha256Hex(sess.creds.apiSecret, "GET/realtime" + expires);
    send({ op: "auth", args: [sess.creds.apiKey, expires, sig] });
  }
  protected async afterPrivateAuth(_sess: CryptoAccountSession, send: (p: any) => void): Promise<void> {
    // Subscribe to order and position channels. Bybit UTA uses "order" and "position" topics (category inferred).
    send({ op: "subscribe", args: ["order", "position"], req_id: String(this.nextWsReqId++) });
  }

  /* WS */
  protected publicPingMessage(): object {
    return { op: "ping" };
  }
  protected privatePingMessage(): object {
    return { op: "ping" };
  }
  protected buildTickerSubscribePayload(m: CryptoMarket): object | null {
    return { op: "subscribe", args: [`tickers.${m.rawSymbol}`], req_id: String(this.nextWsReqId++) };
  }
  protected buildTickerUnsubscribePayload(m: CryptoMarket): object | null {
    return { op: "unsubscribe", args: [`tickers.${m.rawSymbol}`], req_id: String(this.nextWsReqId++) };
  }
  protected parsePublicMessage(_sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any; try { msg = JSON.parse(raw); } catch { return []; }
    if (!msg || !msg.topic || !msg.topic.startsWith("tickers.")) return [];
    const rawSym = msg.topic.slice("tickers.".length);
    const channel = `ticker:${rawSym}`;
    const data = Array.isArray(msg.data) ? msg.data[0] : msg.data;
    return [{ channel, payload: data }];
  }
  protected parseTickerMessage(_s: CryptoAccountSession, _m: CryptoMarket, payload: any): { bid: number; ask: number } | null {
    if (!payload) return null;
    const bid = Number(payload.bid1Price ?? payload.bid ?? 0);
    const ask = Number(payload.ask1Price ?? payload.ask ?? 0);
    if (!bid || !ask) return null;
    return { bid, ask };
  }
  protected parsePrivateMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any; try { msg = JSON.parse(raw); } catch { return []; }
    const topic = msg.topic;
    if (topic === "order") {
      const arr = Array.isArray(msg.data) ? msg.data : [msg.data];
      for (const o of arr) {
        if (!o) continue;
        const sym = symToUnified(o.symbol);
        const priorFilled = sess.openOrders.get(o.orderId)?.filledQuantity ?? 0;
        const newFilled = Math.max(0, Number(o.cumExecQty) - priorFilled);
        const order: CryptoOrder = {
          id: o.orderId, clientOrderId: o.orderLinkId, symbol: sym, marketType: "perp",
          side: (o.side || "").toLowerCase() === "buy" ? "buy" : "sell",
          type: mapOrderType(o.orderType), price: Number(o.price) || null, triggerPrice: Number(o.triggerPrice) || null,
          quantity: Number(o.qty), filledQuantity: Number(o.cumExecQty), remainingQuantity: Math.max(0, Number(o.qty) - Number(o.cumExecQty)),
          avgFillPrice: Number(o.avgPrice) || null, status: mapOrderStatus(o.orderStatus),
          timeInForce: o.timeInForce ?? "GTC", reduceOnly: !!o.reduceOnly,
          createdTime: new Date(Number(o.createdTime)).toISOString(), updatedTime: new Date(Number(o.updatedTime)).toISOString(),
          fee: 0, feeCurrency: "USDT",
        };
        sess.openOrders.set(o.orderId, order);
        if (order.status === "filled" || order.status === "canceled" || order.status === "rejected") sess.openOrders.delete(o.orderId);
        if (newFilled > 0) {
          this.applyFill(sess, {
            id: o.execId ?? o.orderId, orderId: o.orderId, symbol: sym, marketType: "perp",
            side: order.side, price: Number(o.avgPrice) || Number(o.price), quantity: newFilled,
            fee: 0, feeCurrency: "USDT", time: order.updatedTime, isMaker: false,
          });
        }
      }
      return [{ channel: "order", payload: msg.data }];
    }
    if (topic === "position") {
      const arr = Array.isArray(msg.data) ? msg.data : [msg.data];
      for (const p of arr) {
        const sym = symToUnified(p.symbol);
        if (Number(p.size) === 0) { sess.positions.delete(sym); continue; }
        sess.positions.set(sym, {
          symbol: sym, marketType: "perp", side: (p.side || "").toLowerCase() === "buy" ? "long" : "short",
          quantity: Math.abs(Number(p.size)), entryPrice: Number(p.avgPrice), markPrice: Number(p.markPrice),
          unrealizedPnl: Number(p.unrealisedPnl) || 0, realizedPnl: Number(p.curRealisedPnl) || 0,
          leverage: Number(p.leverage) || 1, margin: 0,
          marginType: p.tradeMode === 1 ? "cross" : "isolated", liquidationPrice: Number(p.liqPrice) || null,
          stopLoss: Number(p.stopLoss) || undefined, takeProfit: Number(p.takeProfit) || undefined,
          openedTime: new Date(Number(p.createdTime)).toISOString(), updatedTime: new Date().toISOString(),
        });
      }
      return [{ channel: "position", payload: msg.data }];
    }
    return [];
  }
}

function symToUnified(raw: string): string {
  if (raw.endsWith("USDT")) return raw.replace(/USDT$/, "") + "/USDT:USDT";
  return raw;
}
function tfToBybit(tf: string): string {
  const m: Record<string, string> = { M1: "1", M5: "5", M15: "15", M30: "30", H1: "60", H4: "240", D1: "D", W1: "W", MN1: "M" };
  return m[tf] ?? "60";
}
function mapOrderType(t: string): CryptoOrderRequest["type"] {
  const u = String(t).toUpperCase();
  if (u === "MARKET") return "market";
  if (u === "LIMIT") return "limit";
  if (u === "STOP" || u === "STOP_MARKET") return "stop_market";
  if (u === "STOP_LIMIT") return "stop_limit";
  if (u === "TAKE_PROFIT_MARKET" || u === "TP_MARKET") return "take_profit_market";
  return "limit";
}
function mapOrderStatus(s: string): CryptoOrder["status"] {
  const u = String(s).toUpperCase();
  if (u === "CREATED" || u === "NEW" || u === "PENDING") return "new";
  if (u === "PARTIALLY_FILLED") return "partially_filled";
  if (u === "FILLED") return "filled";
  if (u === "CANCELED" || u === "CANCELLED" || u === "DEACTIVATED" || u === "REJECTED") return u === "REJECTED" ? "rejected" : "canceled";
  if (u === "REJECTED") return "rejected";
  return "new";
}
