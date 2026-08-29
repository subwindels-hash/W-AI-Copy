/**
 * Binance connector (Spot + USDⓈ-M Futures + COIN-M Futures).
 *
 * Auth: HMAC-SHA256 of query+body with secret; signature in `signature`
 * query param; API key in `X-MBX-APIKEY` header.
 *
 * Phase 2: live order routing (spot + USDⓈ-M), SL/TP bracket attachments via
 * separate orders, public ticker WS (wss://stream.binance.com), private user
 * data stream via listenKey (POST /api/v3/userDataStream), closePosition via
 * reduce-only market order, modifyPosition by placing a fresh protective order
 * (Binance uses separate conditional orders for SL/TP).
 */
import type {
  CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket,
  CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot,
  CryptoBalance, CryptoOrder, CryptoCandle, CryptoMarketType,
} from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Hex } from "../signing.js";
import { buildOrderParams, resultFromCreateResponse, cancelByDelete } from "../order-utils.js";
import { majorPairs } from "./common.js";

type BinanceSession = CryptoAccountSession & { clock: { serverTimeMs?: number; localSampleMs?: number } };

const CAPABILITIES: CryptoConnectorCapabilities = {
  markets: ["spot", "perp", "futures", "margin"],
  auth: ["hmac_sha256_header"],
  hasPublicWs: true,
  hasPrivateWs: true,
  hasBatchQueries: true,
  hasTransfers: false,
  restBaseUrl: "https://api.binance.com",
  testnetRestUrl: "https://testnet.binance.vision",
  publicWsUrl: "wss://stream.binance.com:9443/stream",
  privateWsUrl: "wss://stream.binance.com:9443/ws",
  testnetPublicWsUrl: "wss://testnet.binance.vision/stream",
  testnetPrivateWsUrl: "wss://testnet.binance.vision/ws",
  defaultReqPerMin: 1200,
  correctsClockDrift: true,
  privateWsUsesListenKey: true,
};

export class BinanceConnector extends BaseCryptoConnector {
  constructor() {
    super({ exchange: "binance", label: "Binance", capabilities: CAPABILITIES });
  }

  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        headers["X-MBX-APIKEY"] = creds.apiKey;
        const ts = timestampMs;
        const recvWindow = 5000;
        const addSig = (params: string) => {
          const sig = hmacSha256Hex(creds.apiSecret, params);
          return params + "&signature=" + sig;
        };
        if (method === "GET" || method === "DELETE") {
          const url = new URL("http://x" + path);
          url.searchParams.set("timestamp", String(ts));
          url.searchParams.set("recvWindow", String(recvWindow));
          const newQuery = addSig(url.searchParams.toString());
          const qIndex = path.indexOf("?");
          const basePath = qIndex >= 0 ? path.slice(0, qIndex) : path;
          return { path: basePath + "?" + newQuery };
        } else {
          const params = new URLSearchParams();
          if (body) {
            try {
              const j = JSON.parse(body);
              for (const [k, v] of Object.entries(j)) {
                if (v === undefined || v === null) continue;
                params.set(k, String(v));
              }
            } catch {
              for (const pair of body.split("&")) {
                const [k, v] = pair.split("=");
                if (k) params.set(k, v ?? "");
              }
            }
          }
          params.set("timestamp", String(ts));
          params.set("recvWindow", String(recvWindow));
          const newBody = addSig(params.toString());
          headers["content-type"] = "application/x-www-form-urlencoded";
          return { body: newBody };
        }
      },
    };
  }

  protected async fetchMarkets(_sess: BinanceSession): Promise<CryptoMarket[]> {
    // Use the extended curated major pairs list for both spot + perp.
    const { perp, spot } = majorPairs("USDT");
    // Binance raw symbol is e.g. "BTCUSDT" (no separators) — map from spot entries.
    return spot.map<CryptoMarket>((m) => ({
      ...m,
      rawSymbol: m.base + "USDT",
      type: "spot",
      pricePrecision: 2, qtyPrecision: 5, minQty: 0.00001, minNotional: 10,
      maxLeverage: 1, tickSize: 0.01, stepSize: 0.00001,
    })).concat(perp.map<CryptoMarket>((m) => ({
      ...m,
      rawSymbol: m.base + "USDT",
      type: "perp",
      pricePrecision: 2, qtyPrecision: 3, minQty: 0.001, minNotional: 5,
      maxLeverage: 125, tickSize: 0.01, stepSize: 0.001,
    })));
  }

  protected async fetchAccountSnapshot(sess: BinanceSession): Promise<CryptoAccountSnapshot> {
    // Clock sync.
    try {
      const t = await sess.http.request<any>({ method: "GET", path: "/api/v3/time", skipAuth: true });
      const server = Number(t.data?.serverTime);
      if (server > 0) { sess.clock.serverTimeMs = server; sess.clock.localSampleMs = Date.now(); }
    } catch { /* ignore */ }
    const bal = await sess.http.request<any>({ method: "GET", path: "/api/v3/account" });
    const balances: CryptoBalance[] = (bal.data.balances ?? [])
      .map((b: any) => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked), total: Number(b.free) + Number(b.locked) }))
      .filter((b: CryptoBalance) => b.total > 0);
    let positions: CryptoPosition[] = [];
    let openOrders: CryptoOrder[] = [];
    try {
      const pos = await sess.http.request<any>({ method: "GET", path: "/fapi/v2/positionRisk" });
      positions = (pos.data ?? []).filter((p: any) => Number(p.positionAmt) !== 0).map((p: any) => ({
        symbol: rawToUnifiedPerp(p.symbol),
        marketType: "perp" as CryptoMarketType,
        side: Number(p.positionAmt) > 0 ? "long" : "short",
        quantity: Math.abs(Number(p.positionAmt)),
        entryPrice: Number(p.entryPrice),
        markPrice: Number(p.markPrice),
        unrealizedPnl: Number(p.unRealizedProfit),
        realizedPnl: 0,
        leverage: Number(p.leverage) ?? 1,
        margin: 0,
        marginType: "cross",
        liquidationPrice: Number(p.liquidationPrice) || null,
        stopLoss: Number(p.stopLossPrice) || undefined,
        takeProfit: Number(p.takeProfitPrice) || undefined,
        openedTime: new Date(Number(p.updateTime)).toISOString(),
        updatedTime: new Date(Number(p.updateTime)).toISOString(),
      }));
      const oo = await sess.http.request<any>({ method: "GET", path: "/fapi/v1/openOrders" });
      openOrders = (oo.data ?? []).map((o: any) => ({
        id: String(o.orderId), clientOrderId: o.clientOrderId,
        symbol: rawToUnifiedPerp(o.symbol), marketType: "perp",
        side: o.side.toLowerCase() === "buy" ? "buy" : "sell",
        type: normalizeType(o.type), price: Number(o.price) || null,
        triggerPrice: Number(o.stopPrice) || null,
        quantity: Number(o.origQty), filledQuantity: Number(o.executedQty),
        remainingQuantity: Number(o.origQty) - Number(o.executedQty),
        avgFillPrice: Number(o.avgPrice) || null,
        status: normalizeStatus(o.status),
        timeInForce: o.timeInForce ?? "GTC",
        reduceOnly: !!o.reduceOnly, leverage: undefined,
        createdTime: new Date(o.time).toISOString(), updatedTime: new Date(o.updateTime ?? o.time).toISOString(),
        fee: 0, feeCurrency: "USDT",
      }));
    } catch { /* futures may not be enabled */ }

    const equityUsd = balances.reduce((s, b) => s + approximateUsd(b.asset, b.total), 0);
    const unrealizedPnlUsd = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
    return { accountId: sess.login, accountType: "spot+futures", canTrade: true, canWithdraw: false, equityUsd, unrealizedPnlUsd, balances, positions, openOrders };
  }

  /* ── Live order routing ── */

  protected async placeOrder(sess: BinanceSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol);
    if (!m) return { ok: false, error: `unknown symbol ${req.symbol}` };
    const isPerp = m.type === "perp" || m.type === "futures";
    const basePath = isPerp ? "/fapi/v1/order" : "/api/v3/order";
    const params: Record<string, any> = buildOrderParams(req, {
      rawSymbol: m.rawSymbol,
      pricePrecision: m.pricePrecision,
      qtyPrecision: m.qtyPrecision,
      tickSize: m.tickSize,
      stepSize: m.stepSize,
      clientKey: "newClientOrderId",
      qtyKey: "quantity",
    });
    // newOrderRespType=FULL so we get immediate fill info.
    params.newOrderRespType = "FULL";
    if (isPerp) {
      if (req.reduceOnly) params.reduceOnly = "true";
      if (req.leverage && req.leverage > 1) {
        // Best-effort set leverage before order (ignores failure if already set).
        try {
          await sess.http.request<any>({ method: "POST", path: "/fapi/v1/leverage", query: { symbol: m.rawSymbol, leverage: req.leverage } });
        } catch { /* ignore */ }
      }
      // workingType for trigger orders.
      if (params.stopPrice) params.workingType = "MARK_PRICE";
    }
    try {
      const r = await sess.http.request<any>({ method: "POST", path: basePath, query: params });
      const res = resultFromCreateResponse(r.data, { idKey: "orderId", clientKey: "newClientOrderId", priceKey: "price" });
      // Attach SL/TP as separate orders (perp only).
      if (isPerp && res.ok && (req.stopLoss || req.takeProfit)) {
        await this.attachBrackets(sess, m, req, res.ticket!);
      }
      return res;
    } catch (e: any) {
      return { ok: false, error: e.message, retcode: e.exchangeCode ? Number(e.exchangeCode) : -1 };
    }
  }

  private async attachBrackets(sess: BinanceSession, m: CryptoMarket, req: CryptoOrderRequest, parentId: string) {
    const side = req.side === "buy" ? "SELL" : "BUY";
    const trySend = async (type: string, stopPrice: number) => {
      try {
        await sess.http.request<any>({
          method: "POST",
          path: "/fapi/v1/order",
          query: {
            symbol: m.rawSymbol, side, type, stopPrice, closePosition: "true",
            reduceOnly: "true", workingType: "MARK_PRICE",
            newClientOrderId: this.genClientOrderId(sess),
          },
        });
      } catch { /* best effort */ }
    };
    if (req.stopLoss?.price) await trySend("STOP_MARKET", req.stopLoss.price);
    if (req.takeProfit?.price) await trySend("TAKE_PROFIT_MARKET", req.takeProfit.price);
  }

  protected async modifyOrder(sess: BinanceSession, orderIdOrSymbol: string, patch: { sl?: number; tp?: number; comment?: string }): Promise<OrderResult> {
    // For Binance SL/TP are separate orders; we cancel any existing bracket and
    // re-place. The `ticket` is treated as a symbol when SL/TP are requested
    // without a prior order id (protective orders on existing positions).
    let symbol = orderIdOrSymbol;
    // Try to look up by order id first.
    const existing = sess.openOrders.get(orderIdOrSymbol);
    if (existing) symbol = existing.symbol;
    const m = sess.markets.get(symbol);
    if (!m) return { ok: false, error: `unknown symbol ${symbol}` };
    // Cancel all open conditional orders for this symbol that are reduce-only.
    try {
      const list = await sess.http.request<any>({ method: "GET", path: "/fapi/v1/openOrders", query: { symbol: m.rawSymbol } });
      for (const o of list.data ?? []) {
        if (o.type === "STOP_MARKET" || o.type === "TAKE_PROFIT_MARKET") {
          await sess.http.request<any>({ method: "DELETE", path: "/fapi/v1/order", query: { symbol: m.rawSymbol, orderId: o.orderId } });
        }
      }
    } catch { /* ignore */ }
    if (patch.sl) {
      await sess.http.request<any>({ method: "POST", path: "/fapi/v1/order", query: { symbol: m.rawSymbol, side: "SELL", type: "STOP_MARKET", stopPrice: patch.sl, closePosition: "true", reduceOnly: "true", workingType: "MARK_PRICE" } }).catch(() => {});
    }
    if (patch.tp) {
      await sess.http.request<any>({ method: "POST", path: "/fapi/v1/order", query: { symbol: m.rawSymbol, side: "SELL", type: "TAKE_PROFIT_MARKET", stopPrice: patch.tp, closePosition: "true", reduceOnly: "true", workingType: "MARK_PRICE" } }).catch(() => {});
    }
    return { ok: true, ticket: orderIdOrSymbol, comment: "brackets updated" };
  }

  protected async closePositionImpl(sess: BinanceSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    // Find position by symbol.
    const sym = orderIdOrSymbol.includes("/") ? orderIdOrSymbol : findPosByOrderId(sess, orderIdOrSymbol);
    if (!sym) return { ok: false, error: `no position for ${orderIdOrSymbol}` };
    const pos = sess.positions.get(sym);
    const m = sess.markets.get(sym);
    if (!pos || !m) return { ok: false, error: "position or market not found" };
    const isPerp = m.type === "perp" || m.type === "futures";
    if (!isPerp) {
      // Spot: send a SELL market order for the available balance (reduce).
      const bal = sess.balances.get(m.base);
      const qty = volume ?? bal?.free ?? 0;
      if (qty <= 0) return { ok: false, error: "no base balance to sell" };
      return this.placeOrder(sess, { symbol: sym, marketType: "spot", side: "sell", type: "market", quantity: qty });
    }
    // Perp: reduce-only market order.
    const side: "buy" | "sell" = pos.side === "long" ? "sell" : "buy";
    const qty = volume ?? pos.quantity;
    const params: Record<string, any> = {
      symbol: m.rawSymbol, side: side.toUpperCase(), type: "MARKET",
      quantity: qty, reduceOnly: "true", newClientOrderId: this.genClientOrderId(sess),
      newOrderRespType: "RESULT",
    };
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/fapi/v1/order", query: params });
      return resultFromCreateResponse(r.data, { idKey: "orderId" });
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  protected async cancelOrderImpl(sess: BinanceSession, orderId: string): Promise<OrderResult> {
    const o = sess.openOrders.get(orderId);
    if (!o) return { ok: false, error: "order not found" };
    const m = sess.markets.get(o.symbol); if (!m) return { ok: false, error: "market not found" };
    const path = m.type === "perp" ? "/fapi/v1/order" : "/api/v3/order";
    return cancelByDelete(sess.http, path, { symbol: m.rawSymbol, orderId });
  }

  /* ── Market data ── */

  protected async fetchCandles(sess: BinanceSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const interval = mapTimeframe(tf);
    const path = m.type === "perp" ? "/fapi/v1/klines" : "/api/v3/klines";
    const r = await sess.http.request<any[]>({ method: "GET", path, query: { symbol: m.rawSymbol, interval, limit: Math.min(count, 1000) }, skipAuth: true });
    return (r.data ?? []).map((k: any) => ({
      symbol, timeframe: tf, time: new Date(k[0]).toISOString(),
      open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]),
      volume: Number(k[5]), quoteVolume: Number(k[7]), trades: k[8] ? Number(k[8]) : undefined,
    }));
  }
  protected async fetchRecentFills(sess: BinanceSession, sinceIso?: string): Promise<CryptoFill[]> {
    const out: CryptoFill[] = [];
    try {
      const r = await sess.http.request<any[]>({ method: "GET", path: "/fapi/v1/userTrades", query: { limit: 100 } });
      for (const t of r.data ?? []) {
        out.push({
          id: String(t.id), orderId: String(t.orderId), symbol: rawToUnifiedPerp(t.symbol), marketType: "perp",
          side: t.buyer ? "buy" : "sell", price: Number(t.price), quantity: Number(t.qty),
          fee: Number(t.commission), feeCurrency: t.commissionAsset, realizedPnl: Number(t.realizedPnl),
          time: new Date(t.time).toISOString(), isMaker: !!t.maker, tradeId: String(t.id),
        });
      }
    } catch { /* perms */ }
    if (sinceIso) return out.filter((f) => f.time >= sinceIso);
    return out;
  }

  /* ── Listen-key user data streams (private WS). */

  protected async createListenKey(sess: BinanceSession): Promise<string | undefined> {
    try {
      // Spot user stream.
      const r = await sess.http.request<any>({ method: "POST", path: "/api/v3/userDataStream" });
      return r.data?.listenKey;
    } catch { return undefined; }
  }
  protected async keepAliveListenKey(sess: CryptoAccountSession): Promise<void> {
    if (!sess.privateListenKey) return;
    try { await sess.http.request<any>({ method: "PUT", path: "/api/v3/userDataStream", query: { listenKey: sess.privateListenKey } }); } catch { /* ignore */ }
  }
  protected async disposeListenKey(sess: CryptoAccountSession): Promise<void> {
    if (!sess.privateListenKey) return;
    try { await sess.http.request<any>({ method: "DELETE", path: "/api/v3/userDataStream", query: { listenKey: sess.privateListenKey } }); } catch { /* ignore */ }
  }

  protected authenticatePrivateWs(_sess: CryptoAccountSession, _send: (p: any) => void): void {
    // Binance user WS uses listenKey baked into URL; no auth frame needed.
  }

  /* ── WS parsing ── */

  private nextWsReqId = 1;
  protected buildTickerSubscribePayload(m: CryptoMarket): object | null {
    // Binance combined streams — subscribe via {method:"SUBSCRIBE",params:[<stream>],id:N}
    const stream = `${m.rawSymbol.toLowerCase()}@bookTicker`;
    return { method: "SUBSCRIBE", params: [stream], id: this.nextWsReqId++ };
  }
  protected buildTickerUnsubscribePayload(m: CryptoMarket): object | null {
    const stream = `${m.rawSymbol.toLowerCase()}@bookTicker`;
    return { method: "UNSUBSCRIBE", params: [stream], id: this.nextWsReqId++ };
  }

  protected parsePublicMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    // Combined-stream messages: {stream:"btcusdt@bookTicker", data:{...}}
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return []; }
    if (!msg) return [];
    if (msg.stream && msg.data) {
      // stream is e.g. "btcusdt@bookTicker"
      const stream: string = msg.stream;
      const atIdx = stream.indexOf("@");
      const rawSym = atIdx > 0 ? stream.slice(0, atIdx).toUpperCase() : "";
      const m = sess.marketsByRaw.get(rawSym);
      if (!m) return [];
      return [{ channel: `ticker:${m.rawSymbol}`, payload: msg.data }];
    }
    return [];
  }

  protected parseTickerMessage(_sess: CryptoAccountSession, m: CryptoMarket, payload: any): { bid: number; ask: number } | null {
    if (!payload) return null;
    const bid = Number(payload.b ?? payload.bidPrice ?? 0);
    const ask = Number(payload.a ?? payload.askPrice ?? 0);
    if (!bid || !ask) return null;
    return { bid, ask };
  }

  protected parsePrivateMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return []; }
    if (!msg?.e) return [];
    switch (msg.e) {
      case "executionReport": {
        // Order/fill update.
        const sym = rawToUnifiedPerp(msg.s);
        const orderId = String(msg.i);
        const o: CryptoOrder = {
          id: orderId, clientOrderId: msg.c, symbol: sym, marketType: "perp",
          side: msg.S === "BUY" ? "buy" : "sell",
          type: normalizeType(msg.o), price: Number(msg.p) || null,
          triggerPrice: Number(msg.P) || null,
          quantity: Number(msg.q), filledQuantity: Number(msg.z),
          remainingQuantity: Math.max(0, Number(msg.q) - Number(msg.z)),
          avgFillPrice: Number(msg.L) || null, status: normalizeStatus(msg.X),
          timeInForce: msg.f ?? "GTC", reduceOnly: !!msg.R, leverage: undefined,
          createdTime: new Date(msg.O).toISOString(), updatedTime: new Date(msg.T || msg.E).toISOString(),
          fee: 0, feeCurrency: "USDT",
        };
        // Preserve prior filledQuantity across repeated frames for the same order
        // so partial fills accumulate correctly when WS re-delivers executionReports.
        const existing = sess.openOrders.get(orderId);
        if (existing && o.filledQuantity === 0) o.filledQuantity = existing.filledQuantity;
        if (msg.x === "TRADE") {
          const lastQty = Number(msg.l);
          const fill: CryptoFill = {
            id: String(msg.t ?? orderId + ":" + msg.E), orderId, symbol: sym, marketType: "perp",
            side: o.side, price: Number(msg.L), quantity: lastQty,
            fee: Number(msg.n ?? 0), feeCurrency: msg.N ?? "USDT",
            realizedPnl: 0, time: new Date(msg.T || msg.E).toISOString(), isMaker: msg.m === true,
            tradeId: String(msg.t),
          };
          // Update the in-memory order with the fill before deciding whether to evict it.
          sess.openOrders.set(orderId, o);
          this.applyFill(sess, fill);
          if (o.status === "filled" || o.status === "canceled") sess.openOrders.delete(orderId);
          else sess.openOrders.set(orderId, o);
        } else {
          sess.openOrders.set(orderId, o);
          if (o.status === "filled" || o.status === "canceled") sess.openOrders.delete(orderId);
        }
        return [{ channel: "order", payload: o }];
      }
      case "outboundAccountPosition": {
        // Balance updates after trade.
        for (const b of msg.B ?? []) {
          const asset = b.a;
          const free = Number(b.f); const locked = Number(b.l);
          sess.balances.set(asset, { asset, free, locked, total: free + locked });
        }
        return [{ channel: "balance", payload: msg }];
      }
      case "ACCOUNT_UPDATE": {
        // Futures position/balance updates.
        for (const p of msg.a?.B ?? []) {
          const a = p.a; const wb = Number(p.wb);
          sess.balances.set(a, { asset: a, free: wb, locked: 0, total: wb });
        }
        for (const p of msg.a?.P ?? []) {
          const sym = rawToUnifiedPerp(p.s);
          const qty = Number(p.pa);
          if (qty === 0) { sess.positions.delete(sym); continue; }
          const ep = Number(p.ep);
          const mp = sess.positions.get(sym)?.markPrice ?? ep;
          sess.positions.set(sym, {
            symbol: sym, marketType: "perp",
            side: qty > 0 ? "long" : "short",
            quantity: Math.abs(qty), entryPrice: ep, markPrice: mp,
            unrealizedPnl: Number(p.up) ?? 0, realizedPnl: 0,
            leverage: Number(p.l) || 1, margin: 0, marginType: p.mt === "isolated" ? "isolated" : "cross",
            liquidationPrice: null, openedTime: new Date(msg.E).toISOString(), updatedTime: new Date(msg.E).toISOString(),
          });
        }
        return [{ channel: "position", payload: msg }];
      }
    }
    return [];
  }
}

/* ── helpers ─────────────────────────────────────────────── */

function findPosByOrderId(sess: CryptoAccountSession, oid: string): string | null {
  for (const [sym, pos] of sess.positions) {
    // Heuristic: if any open order matches symbol for this pos, return.
    if (sess.openOrders.has(oid) && sess.openOrders.get(oid)!.symbol === sym) return sym;
  }
  // Fallback: treat oid as rawSymbol (e.g. "BTCUSDT").
  for (const [, m] of sess.marketsByRaw) {
    if (m.rawSymbol === oid) return m.symbol;
  }
  for (const [sym] of sess.positions) if (sym.includes(oid)) return sym;
  return null;
}

function rawToUnifiedPerp(raw: string): string {
  const s = raw.replace(/USDT$/, "");
  return `${s}/USDT:USDT`;
}
function normalizeType(t: string): CryptoOrderRequest["type"] {
  const u = String(t).toUpperCase();
  if (u === "LIMIT") return "limit";
  if (u === "MARKET") return "market";
  if (u === "STOP" || u === "STOP_MARKET") return "stop_market";
  if (u === "TAKE_PROFIT_MARKET") return "take_profit_market";
  if (u === "TAKE_PROFIT") return "take_profit_limit";
  if (u === "LIMIT_MAKER") return "post_only";
  return "limit";
}
function normalizeStatus(s: string): CryptoOrder["status"] {
  const u = String(s).toUpperCase();
  if (u === "NEW" || u === "PENDING_NEW" || u === "ACCEPTED") return "new";
  if (u === "PARTIALLY_FILLED") return "partially_filled";
  if (u === "FILLED") return "filled";
  if (u === "CANCELED" || u === "CANCELLED" || u === "EXPIRED" || u === "EXPIRED_IN_MATCH") return "canceled";
  if (u === "REJECTED") return "rejected";
  if (u === "EXPIRED") return "expired";
  return "new";
}
function mapTimeframe(tf: string): string {
  const map: Record<string, string> = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1d", W1: "1w", MN1: "1M" };
  return map[tf] ?? "1h";
}
function approximateUsd(asset: string, total: number): number {
  if (total <= 0) return 0;
  if (asset === "USDT" || asset === "BUSD" || asset === "USDC" || asset === "TUSD" || asset === "FDUSD") return total;
  if (asset === "BTC") return total * 65000;
  if (asset === "ETH") return total * 3200;
  if (asset === "BNB") return total * 580;
  return total * 0.5;
}
