/**
 * Bitget connector (v2 API).
 * Auth: ACCESS-KEY, ACCESS-SIGN (HMAC-SHA256 of timestamp+method+path+body),
 * ACCESS-TIMESTAMP, ACCESS-PASSPHRASE.
 * Base: https://api.bitget.com.
 *
 * Phase 15: full private WS user data stream (orders/positions/account),
 * public WS ticker, cancel-order via REST. The connector is a client of
 * Bitget's official public API — WINDELS is an AI Trading Agent, not a
 * broker, exchange, or custodian. No orders are matched or filled internally.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Hex } from "../signing.js";
import { mkMarket, majorPairs, mapStatusStd } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp"],
  auth: ["hmac_sha256_header"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: true, hasTransfers: false,
  restBaseUrl: "https://api.bitget.com",
  testnetRestUrl: "https://api.bitget.com",
  publicWsUrl: "wss://ws.bitget.com/v2/ws/public",
  privateWsUrl: "wss://ws.bitget.com/v2/ws/private",
  publicWsPingIntervalMs: 25_000,
  privateWsPingIntervalMs: 25_000,
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class BitgetConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "bitget", label: "Bitget", capabilities: CAPS }); }
  private nextWsReqId = 1;

  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const ts = String(timestampMs);
        const payload = ts + method.toUpperCase() + path + (body ?? "");
        headers["ACCESS-KEY"] = creds.apiKey;
        headers["ACCESS-SIGN"] = hmacSha256Hex(creds.apiSecret, payload);
        headers["ACCESS-TIMESTAMP"] = ts;
        headers["ACCESS-PASSPHRASE"] = creds.passphrase ?? "";
        headers["content-type"] = "application/json";
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { perp, spot } = majorPairs("USDT");
    // Bitget perp rawSymbol is e.g. "BTCUSDT" (no suffix) and productType "usdt-futures".
    return [
      ...perp.map((m) => ({ ...m })),
      ...spot.map((m) => ({ ...m })),
    ];
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const b = await sess.http.request<any>({ method: "GET", path: "/api/v2/spot/account/assets" }).catch(() => null);
    const balances: CryptoBalance[] = (b?.data?.data ?? []).map((x: any) => ({ asset: x.coin, free: Number(x.available), locked: Number(x.frozen), total: Number(x.available) + Number(x.frozen), usdValue: Number(x.usdtValue) || undefined })).filter((x: CryptoBalance) => x.total > 0);
    let positions: CryptoPosition[] = []; let openOrders: CryptoOrder[] = [];
    try {
      const p = await sess.http.request<any>({ method: "GET", path: "/api/v2/mix/position/all-position", query: { productType: "usdt-futures" } });
      positions = (p.data?.data ?? []).filter((x: any) => Number(x.total) !== 0).map((x: any) => ({
        symbol: `${x.symbol.replace("USDT","")}/USDT:USDT`, marketType: "perp",
        side: x.holdSide === "long" ? "long" : "short", quantity: Number(x.total),
        entryPrice: Number(x.openPriceAvg), markPrice: Number(x.markPrice),
        unrealizedPnl: Number(x.unrealizedPL), realizedPnl: 0, leverage: Number(x.leverage) || 1,
        margin: 0, marginType: x.marginMode === "cross" ? "cross" : "isolated", liquidationPrice: null,
        stopLoss: Number(x.stopLossPrice) || undefined, takeProfit: Number(x.takeProfitPrice) || undefined,
        openedTime: new Date(Number(x.cTime ?? x.openTime)).toISOString(), updatedTime: new Date(Number(x.uTime ?? Date.now())).toISOString(),
      }));
      const oo = await sess.http.request<any>({ method: "GET", path: "/api/v2/mix/order/orders-pending", query: { productType: "usdt-futures" } });
      openOrders = (oo.data?.data?.entrustedList ?? []).map((o: any) => bitgetOrderToCrypto(o, "perp"));
    } catch { /* */ }
    try {
      const so = await sess.http.request<any>({ method: "GET", path: "/api/v2/spot/trade/unfilled-orders" });
      for (const o of so.data?.data ?? []) openOrders.push(bitgetOrderToCrypto(o, "spot"));
    } catch { /* spot orders optional */ }
    return { accountId: sess.login, accountType: "mix", canTrade: true, canWithdraw: false, equityUsd: balances.reduce((s, b) => s + (b.usdValue ?? 0), 0), unrealizedPnlUsd: positions.reduce((s, p) => s + p.unrealizedPnl, 0), balances, positions, openOrders };
  }
  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const isPerp = m.type === "perp";
    const path = isPerp ? "/api/v2/mix/order/place-order" : "/api/v2/spot/trade/place-order";
    const body: Record<string, any> = { symbol: m.rawSymbol, side: req.side, orderType: req.type === "limit" ? "limit" : "market", clientOid: req.clientOrderId ?? this.genClientOrderId(sess) };
    if (isPerp) body.productType = "usdt-futures";
    if (isPerp) body.marginMode = "cross";
    if (req.type === "limit") { body.price = String(req.price); body.size = String(req.quantity); body.timeInForce = req.timeInForce ?? "GTC"; }
    else body.size = String(req.quantity);
    if (req.reduceOnly) body.reduceOnly = "yes";
    try {
      const r = await sess.http.request<any>({ method: "POST", path, body });
      if (r.data?.code && r.data.code !== "00000") return { ok: false, error: r.data.msg, retcode: Number(r.data.code) };
      return { ok: true, ticket: r.data?.data?.orderId, comment: body.clientOid };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async modifyOrder(sess: CryptoAccountSession, orderId: string, patch: { sl?: number; tp?: number; comment?: string }): Promise<OrderResult> {
    const o = sess.openOrders.get(orderId); if (!o) return { ok: false, error: "not found" };
    const m = sess.markets.get(o.symbol); if (!m) return { ok: false, error: "market not found" };
    const isPerp = m.type === "perp";
    const path = isPerp ? "/api/v2/mix/order/modify-order" : "/api/v2/spot/trade/modify-order";
    const body: any = { symbol: m.rawSymbol, orderId };
    if (isPerp) body.productType = "usdt-futures";
    if (patch.sl) body.stopLossPrice = String(patch.sl);
    if (patch.tp) body.takeProfitPrice = String(patch.tp);
    if (patch.sl) body.stopLossTriggerPrice = String(patch.sl);
    try {
      const r = await sess.http.request<any>({ method: "POST", path, body });
      if (r.data?.code && r.data.code !== "00000") return { ok: false, error: r.data.msg, retcode: Number(r.data.code) };
      return { ok: true, ticket: orderId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const sym = orderIdOrSymbol.includes("/") ? orderIdOrSymbol : (sess.openOrders.get(orderIdOrSymbol)?.symbol ?? orderIdOrSymbol);
    const pos = sess.positions.get(sym); const m = sess.markets.get(sym);
    if (!m) return { ok: false, error: "not found" };
    const isPerp = m.type === "perp";
    if (isPerp && pos) {
      return this.placeOrder(sess, { symbol: sym, marketType: "perp", side: pos.side === "long" ? "sell" : "buy", type: "market", quantity: volume ?? pos.quantity, reduceOnly: true });
    }
    const bal = sess.balances.get(m.base);
    return this.placeOrder(sess, { symbol: sym, marketType: "spot", side: "sell", type: "market", quantity: volume ?? bal?.free ?? 0 });
  }
  protected async cancelOrderImpl(sess: CryptoAccountSession, orderId: string): Promise<OrderResult> {
    const o = sess.openOrders.get(orderId);
    const sym = o?.symbol;
    const m = sym ? sess.markets.get(sym) : undefined;
    const isPerp = m?.type === "perp";
    const path = isPerp ? "/api/v2/mix/order/cancel-order" : "/api/v2/spot/trade/cancel-order";
    const body: any = { orderId };
    if (m) body.symbol = m.rawSymbol;
    if (isPerp) body.productType = "usdt-futures";
    // Bitget spot cancel requires symbol; fall back to scanning markets if we don't have the order tracked.
    if (!m) {
      for (const mk of sess.markets.values()) {
        if (mk.type === "spot") {
          try {
            const r = await sess.http.request<any>({ method: "POST", path: "/api/v2/spot/trade/cancel-order", body: { orderId, symbol: mk.rawSymbol } });
            if (r.data?.code === "00000") return { ok: true, ticket: orderId };
          } catch { /* try next */ }
        }
      }
      return { ok: false, error: "order not found" };
    }
    try {
      const r = await sess.http.request<any>({ method: "POST", path, body });
      if (r.data?.code && r.data.code !== "00000") return { ok: false, error: r.data.msg, retcode: Number(r.data.code) };
      return { ok: true, ticket: orderId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const granularity = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1H", H4: "4H", D1: "1D", W1: "1W", MN1: "1M" }[tf] ?? "1H";
    const path = m.type === "perp" ? "/api/v2/mix/market/candles" : "/api/v2/spot/market/candles";
    const q: any = { symbol: m.rawSymbol, granularity, limit: String(Math.min(count, 200)) };
    if (m.type === "perp") q.productType = "usdt-futures";
    const r = await sess.http.request<any>({ method: "GET", path, query: q, skipAuth: true });
    return (r.data?.data ?? []).map((k: any) => ({
      symbol, timeframe: tf, time: new Date(Number(k[0])).toISOString(),
      open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]),
    }));
  }
  protected async fetchRecentFills(_sess: CryptoAccountSession, _since?: string): Promise<CryptoFill[]> { return []; }

  /* ── WebSocket ── */

  protected authenticatePrivateWs(sess: CryptoAccountSession, send: (p: any) => void): void {
    const ts = Date.now();
    const sig = hmacSha256Hex(sess.creds.apiSecret, ts + "GET" + "/user/verify");
    send({ op: "login", args: [{ apiKey: sess.creds.apiKey, passphrase: sess.creds.passphrase ?? "", timestamp: String(ts), sign: sig }] });
  }

  protected async afterPrivateAuth(_sess: CryptoAccountSession, send: (p: any) => void): Promise<void> {
    // Bitget v2 private channels. Use instId "default" (wildcard) where accepted,
    // and explicit instType for perp. Subscribing with instType covers all symbols
    // of that product type, which is what we want for an agent that trades many majors.
    send({
      op: "subscribe",
      args: [
        { instType: "USDT-FUTURES", channel: "orders", instId: "default" },
        { instType: "SPOT", channel: "orders", instId: "default" },
        { instType: "USDT-FUTURES", channel: "positions", instId: "default" },
        { channel: "account", coin: "default" },
      ],
    });
  }

  protected publicPingMessage(): string { return "ping"; }
  protected privatePingMessage(): string { return "ping"; }

  protected buildTickerSubscribePayload(m: CryptoMarket): object | null {
    return {
      op: "subscribe",
      args: [{
        instType: m.type === "perp" ? "USDT-FUTURES" : "SPOT",
        channel: "ticker",
        instId: m.rawSymbol,
      }],
    };
  }
  protected buildTickerUnsubscribePayload(m: CryptoMarket): object | null {
    return {
      op: "unsubscribe",
      args: [{
        instType: m.type === "perp" ? "USDT-FUTURES" : "SPOT",
        channel: "ticker",
        instId: m.rawSymbol,
      }],
    };
  }

  protected parsePublicMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    // Ping/pong + ack events carry no action/arg.
    if (raw === "pong" || raw === "ping") return [];
    let msg: any; try { msg = JSON.parse(raw); } catch { return []; }
    if (msg?.event === "login" || msg?.event === "subscribe" || msg?.event === "unsubscribe" || msg?.event === "error") return [];
    const arg = msg?.arg; if (!arg || arg.channel !== "ticker") return [];
    const data = Array.isArray(msg.data) ? msg.data[0] : msg.data;
    if (!data) return [];
    const rawSym = arg.instId;
    return [{ channel: `ticker:${rawSym}`, payload: data }];
  }

  protected parseTickerMessage(_sess: CryptoAccountSession, _m: CryptoMarket, payload: any): { bid: number; ask: number } | null {
    if (!payload) return null;
    const bid = Number(payload.bidPr ?? payload.bestBid ?? 0);
    const ask = Number(payload.askPr ?? payload.bestAsk ?? 0);
    if (!bid || !ask) return null;
    return { bid, ask };
  }

  protected parsePrivateMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    if (raw === "pong" || raw === "ping") return [];
    let msg: any; try { msg = JSON.parse(raw); } catch { return []; }
    // Ack / error / login events carry no actionable data.
    if (msg?.event === "login" || msg?.event === "subscribe" || msg?.event === "unsubscribe" || msg?.event === "error") return [];
    const arg = msg?.arg; if (!arg?.channel) return [];
    const data = Array.isArray(msg.data) ? msg.data : (msg.data ? [msg.data] : []);
    switch (arg.channel) {
      case "orders": {
        for (const o of data) {
          if (!o) continue;
          const instType = (arg.instType ?? o.instType ?? "").toString().toUpperCase();
          const mType: CryptoOrder["marketType"] = instType === "SPOT" ? "spot" : "perp";
          const order = bitgetWsOrderToCrypto(o, mType);
          if (!order) continue;
          // Capture prior fill amount BEFORE upserting so we can compute the
          // incremental fill delta. Bitget reports cumulative filledSize in
          // every frame, so delta = fillSize - priorFilled.
          const priorFilled = sess.openOrders.get(order.id)?.filledQuantity ?? 0;
          const fillQty = Number(o.fillSize ?? o.baseVolume ?? o.accBaseVolume ?? 0);
          const fillPrice = Number(o.fillPrice ?? o.priceAvg ?? 0);
          const delta = Math.max(0, fillQty - priorFilled);
          // Seed the order with priorFilled (not the WS cumulative) so that
          // applyFill's addition of `delta` produces the correct total.
          order.filledQuantity = priorFilled;
          order.remainingQuantity = Math.max(0, order.quantity - priorFilled);
          sess.openOrders.set(order.id, order);
          if (delta > 0 && fillPrice > 0) {
            this.applyFill(sess, {
              id: String(o.tradeId ?? `${order.id}:${o.cTime ?? o.uTime ?? Date.now()}`),
              orderId: order.id,
              symbol: order.symbol,
              marketType: order.marketType,
              side: order.side,
              price: fillPrice,
              quantity: delta,
              fee: Number(o.fee ?? 0) * -1,
              feeCurrency: o.feeCcy ?? "USDT",
              realizedPnl: Number(o.profit ?? 0),
              time: order.updatedTime,
              isMaker: o.tradeSide === "maker",
              tradeId: o.tradeId,
            });
          }
          // After applyFill the order's filledQuantity/status reflect latest state.
          // Evict when terminal: filled/canceled/rejected.
          const after = sess.openOrders.get(order.id);
          const wsTerminal = order.status === "filled" || order.status === "canceled" || order.status === "rejected";
          if (after && (after.status === "filled" || after.status === "canceled" || after.status === "rejected")) {
            sess.openOrders.delete(order.id);
          } else if (!after && wsTerminal) {
            // already evicted
          } else if (wsTerminal) {
            sess.openOrders.delete(order.id);
          }
        }
        return [{ channel: "order", payload: data }];
      }
      case "positions": {
        for (const p of data) {
          if (!p?.instId && !p?.symbol) continue;
          const rawSym = String(p.instId ?? p.symbol ?? "");
          const sym = bitgetSymToUnified(rawSym);
          const total = Math.abs(Number(p.total ?? p.positions ?? 0));
          if (total <= 0.0000001) { sess.positions.delete(sym); continue; }
          sess.positions.set(sym, {
            symbol: sym,
            marketType: "perp",
            side: (p.holdSide ?? "").toLowerCase() === "short" ? "short" : "long",
            quantity: total,
            entryPrice: Number(p.openPriceAvg ?? p.averageOpenPrice ?? 0),
            markPrice: Number(p.markPrice ?? p.markPx ?? 0),
            unrealizedPnl: Number(p.unrealizedPL ?? p.unrealizedPnl ?? 0),
            realizedPnl: Number(p.realizedPnl ?? 0),
            leverage: Number(p.leverage ?? 1),
            margin: Number(p.margin ?? 0),
            marginType: (p.marginMode ?? "cross") === "cross" ? "cross" : "isolated",
            liquidationPrice: Number(p.liquidationPrice ?? 0) || null,
            stopLoss: Number(p.stopLossPrice ?? 0) || undefined,
            takeProfit: Number(p.takeProfitPrice ?? 0) || undefined,
            openedTime: new Date(Number(p.cTime ?? Date.now())).toISOString(),
            updatedTime: new Date(Number(p.uTime ?? Date.now())).toISOString(),
          });
        }
        return [{ channel: "position", payload: data }];
      }
      case "account": {
        // Balance snapshot per coin.
        for (const b of data) {
          if (!b?.coin) continue;
          const free = Number(b.available ?? 0);
          const locked = Number(b.frozen ?? b.hold ?? 0);
          const total = free + locked;
          if (total <= 0) { sess.balances.delete(b.coin); continue; }
          sess.balances.set(b.coin, {
            asset: b.coin,
            free,
            locked,
            total,
            usdValue: Number(b.usdtValue ?? 0) || undefined,
          });
        }
        return [{ channel: "balance", payload: data }];
      }
    }
    return [];
  }
}

/* ── Helpers ── */

function bitgetSymToUnified(raw: string): string {
  // raw is e.g. "BTCUSDT" (spot) or "BTCUSDT" (perp). We tag perp with :USDT settle.
  // Heuristic: caller passes context; we default to perp form here (private positions
  // channel only pushes perps). Spot orders go through the REST snapshot and are
  // identified by mType.
  const upper = raw.toUpperCase();
  if (upper.endsWith("USDT")) {
    const base = upper.slice(0, -4);
    return `${base}/USDT:USDT`;
  }
  return upper;
}

function mapBitgetStatus(s: string | undefined): CryptoOrder["status"] {
  if (!s) return "new";
  const u = s.toLowerCase();
  // Bitget uses "partially_filled" directly; mapStatusStd checks includes("fill") first
  // which would prematurely mark it filled, so handle explicit cases before delegation.
  if (u === "partially_filled" || u === "partial_fill" || u === "partial") return "partially_filled";
  if (u === "filled" || u === "full_fill" || u === "full_filled" || u === "complete" || u === "success") return "filled";
  if (u === "new" || u === "live" || u === "init" || u === "pending" || u === "created" || u === "open") return "new";
  if (u.includes("cancel")) return "canceled";
  if (u.includes("reject") || u.includes("fail")) return "rejected";
  if (u.includes("expir")) return "expired";
  return "new";
}

function bitgetOrderToCrypto(o: any, mType: CryptoOrder["marketType"]): CryptoOrder {
  const rawSym = String(o.symbol ?? o.instId ?? "");
  const base = rawSym.toUpperCase().replace(/USDT$/, "");
  const symbol = mType === "perp" ? `${base}/USDT:USDT` : `${base}/USDT`;
  const qty = Number(o.size ?? o.quantity ?? 0);
  const filled = Number(o.filledSize ?? o.filledQuantity ?? o.baseVolume ?? 0);
  return {
    id: String(o.orderId ?? o.ordId ?? ""),
    clientOrderId: o.clientOid ?? o.clientOrderId,
    symbol,
    marketType: mType,
    side: String(o.side ?? "").toLowerCase() === "sell" ? "sell" : "buy",
    type: String(o.orderType ?? "limit").toLowerCase() === "market" ? "market" : "limit",
    price: Number(o.price ?? 0) || null,
    triggerPrice: Number(o.triggerPrice ?? 0) || null,
    quantity: qty,
    filledQuantity: filled,
    remainingQuantity: Math.max(0, qty - filled),
    avgFillPrice: Number(o.priceAvg ?? o.fillPrice ?? 0) || null,
    status: mapBitgetStatus(o.status ?? o.state),
    timeInForce: o.timeInForce ?? "GTC",
    reduceOnly: String(o.reduceOnly ?? "").toLowerCase() === "yes" || o.reduceOnly === true,
    createdTime: new Date(Number(o.cTime ?? Date.now())).toISOString(),
    updatedTime: new Date(Number(o.uTime ?? Date.now())).toISOString(),
    fee: Number(o.fee ?? 0) * -1,
    feeCurrency: o.feeCcy ?? "USDT",
  };
}

function bitgetWsOrderToCrypto(o: any, mType: CryptoOrder["marketType"]): CryptoOrder | null {
  try {
    const rawSym = String(o.instId ?? o.symbol ?? "");
    if (!rawSym) return null;
    const base = rawSym.toUpperCase().replace(/USDT$/, "");
    const symbol = mType === "perp" ? `${base}/USDT:USDT` : `${base}/USDT`;
    const qty = Number(o.size ?? o.quantity ?? 0);
    const filled = Number(o.fillSize ?? o.filledSize ?? o.baseVolume ?? o.accBaseVolume ?? 0);
    return {
      id: String(o.orderId ?? o.ordId ?? ""),
      clientOrderId: o.clientOid ?? o.clientOrderId,
      symbol,
      marketType: mType,
      side: String(o.side ?? "").toLowerCase() === "sell" ? "sell" : "buy",
      type: String(o.orderType ?? "limit").toLowerCase() === "market" ? "market" : "limit",
      price: Number(o.price ?? 0) || null,
      triggerPrice: Number(o.triggerPrice ?? 0) || null,
      quantity: qty,
      filledQuantity: filled,
      remainingQuantity: Math.max(0, qty - filled),
      avgFillPrice: Number(o.priceAvg ?? o.fillPrice ?? 0) || null,
      status: mapBitgetStatus(o.status ?? o.state ?? o.orderStatus),
      timeInForce: o.timeInForce ?? "GTC",
      reduceOnly: String(o.reduceOnly ?? "").toLowerCase() === "yes" || o.reduceOnly === true,
      createdTime: new Date(Number(o.cTime ?? Date.now())).toISOString(),
      updatedTime: new Date(Number(o.uTime ?? Date.now())).toISOString(),
      fee: Number(o.fee ?? 0) * -1,
      feeCurrency: o.feeCcy ?? "USDT",
    };
  } catch { return null; }
}
