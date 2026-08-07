/**
 * HTX (Huobi) connector.
 *
 * Auth: HMAC-SHA256 of `METHOD\nHOST\nPATH\nSORTED_QUERY` → base64 signature
 * appended to query as `Signature=...`. Headers: content-type only (no
 * API key header; all auth is query-parameter based).
 *
 * WebSockets:
 *   Public market data: wss://api.htx.com/ws
 *     - Subscribe: {sub:"market.$symbol.bbo", id:"..."} → market.BTCUSDT.bbo
 *     - All public frames are GZIP-compressed binary; the ExchangeWsClient
 *       is constructed with gzip:true which gunzips before parsePublicMessage.
 *     - Server-initiated ping: {ping: <ts>} → reply {pong: <ts>}.
 *     - Ticker/BBO push format: {ch:"market.btcusdt.bbo", ts, tick:{bid, bidSize, ask, askSize, ...}}
 *   Private user data: wss://api.htx.com/ws/v2
 *     - Auth: {action:"req", ch:"auth", params:{authType:"api", accessKey, signatureMethod:"HmacSHA256", signatureVersion:"2.1", timestamp, signature}}
 *     - Signature string: "GET\napi.htx.com\n/ws/v2\naccessKey=<key>&signatureMethod=HmacSHA256&signatureVersion=2.1&timestamp=<UTC-ISO>"
 *       (lowercase param names, signatureVersion "2.1", UTC ISO timestamp; URL-encode values).
 *     - After auth reply (code 200), subscribe:
 *         {action:"sub", ch:"accounts.update"}
 *         {action:"sub", ch:"orders#*"}         (wildcard all symbols)
 *         {action:"sub", ch:"trade.clearing#*"} (post-match fills with fees)
 *     - Private frames are uncompressed JSON.
 *     - v2 ping: {action:"ping", data:{ts:<ms>}} → {action:"pong", data:{ts:<ms>}}
 *     - Order pushes: {action:"push", ch:"orders#btcusdt", data:{eventType:"creation"|"trade"|"cancellation"|"rejection"|"trigger", orderId, clientOrderId, orderStatus, type, orderPrice, orderSize, filledAmount, tradePrice, tradeVolume, tradeId, lastActTime, ...}}
 *     - Trade-clearing pushes: {action:"push", ch:"trade.clearing#btcusdt", data:{orderId, orderSide, tradePrice, tradeVolume, tradeId, feeDeduct, ...}}
 *     - Account pushes: {action:"push", ch:"accounts.update#0", data:{currency, accountId, balance?, available?, changeType, accountType, changeTime}}
 *
 * WINDELS is an AI Trading Agent, not a broker or exchange. The HTX connector is
 * a client of HTX's public API; WINDELS never matches, fills, settles, or
 * custodies customer assets. All trades are dispatched to the user's own HTX
 * account via HTX's official REST+WS endpoints.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { ExchangeWsClient } from "../exchange-ws.js";
import { hmacSha256Base64 } from "../signing.js";
import { majorPairs, mapStatusStd } from "./common.js";

const HOST = "api.htx.com";
const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "margin", "perp"],
  auth: ["hmac_sha256_query"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: false, hasTransfers: true,
  restBaseUrl: `https://${HOST}`,
  publicWsUrl: "wss://api.htx.com/ws",
  privateWsUrl: "wss://api.htx.com/ws/v2",
  publicWsPingIntervalMs: 20_000,
  privateWsPingIntervalMs: 20_000,
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class HtxConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "htx", label: "HTX", capabilities: CAPS }); }

  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, headers, timestampMs }) => {
        const dt = new Date(timestampMs).toISOString().slice(0, 19);
        const params: Record<string, string> = {
          AccessKeyId: creds.apiKey,
          SignatureMethod: "HmacSHA256",
          SignatureVersion: "2",
          Timestamp: dt,
        };
        const qIdx = path.indexOf("?");
        let basePath = path;
        if (qIdx >= 0) {
          basePath = path.slice(0, qIdx);
          for (const [k, v] of new URLSearchParams(path.slice(qIdx + 1))) params[k] = v;
        }
        const sorted = Object.keys(params).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
        const toSign = `${method.toUpperCase()}\n${HOST}\n${basePath}\n${sorted}`;
        const sig = hmacSha256Base64(creds.apiSecret, toSign);
        const newQuery = sorted + `&Signature=${encodeURIComponent(sig)}`;
        headers["content-type"] = "application/json";
        return { path: basePath + "?" + newQuery };
      },
    };
  }

  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { perp, spot } = majorPairs("USDT");
    // HTX uses lowercase raw symbols e.g. "btcusdt".
    return [...perp, ...spot].map((m) => ({ ...m, rawSymbol: m.rawSymbol.toLowerCase() }));
  }

  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const r = await sess.http.request<any>({ method: "GET", path: "/v1/account/accounts" });
    const acctId = r.data?.data?.[0]?.id;
    let balances: CryptoBalance[] = [];
    if (acctId) {
      const b = await sess.http.request<any>({ method: "GET", path: `/v1/account/accounts/${acctId}/balance` });
      const list: any[] = b.data?.data?.list ?? [];
      // HTX returns separate entries per balance type (trade/frozen/loan/interest); merge.
      const map = new Map<string, { free: number; locked: number }>();
      for (const x of list) {
        const asset = String(x.currency ?? "").toUpperCase();
        const amt = Number(x.balance ?? 0);
        if (!asset || !(amt > 0)) continue;
        const rec = map.get(asset) ?? { free: 0, locked: 0 };
        if (x.type === "trade") rec.free += amt;
        else if (x.type === "frozen") rec.locked += amt;
        else rec.free += amt;
        map.set(asset, rec);
      }
      for (const [asset, v] of map.entries()) {
        const total = v.free + v.locked;
        if (total <= 0) continue;
        balances.push({
          asset, free: v.free, locked: v.locked, total,
          usdValue: isUsdStable(asset) ? total : undefined,
        });
      }
    }
    let openOrders: CryptoOrder[] = [];
    try {
      const o = await sess.http.request<any>({ method: "GET", path: "/v1/order/openOrders", query: { "account-id": String(acctId ?? ""), size: "100" } });
      openOrders = (o.data?.data ?? []).map((x: any) => htxRestOrderToCrypto(x));
    } catch { /* */ }
    return {
      accountId: String(acctId ?? sess.login), accountType: "spot", canTrade: true, canWithdraw: true,
      equityUsd: balances.reduce((s, b) => s + (b.usdValue ?? 0), 0), unrealizedPnlUsd: 0,
      balances, positions: [], openOrders,
    };
  }

  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol);
    if (!m) return { ok: false, error: "unknown symbol" };
    const acctId = (sess.snapshot as any)?.accountId;
    const body: Record<string, any> = {
      "account-id": String(acctId ?? ""),
      symbol: m.rawSymbol,
      type: `${req.side}-${req.type === "limit" ? "limit" : "market"}`,
      amount: String(req.quantity),
      "client-order-id": req.clientOrderId ?? this.genClientOrderId(sess),
    };
    if (req.type === "limit") body.price = String(req.price);
    if (req.postOnly) body["post-only"] = "true";
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/v1/order/orders/place", body });
      if (r.data?.status === "ok") return { ok: true, ticket: String(r.data.data), comment: body["client-order-id"] };
      return { ok: false, error: r.data?.["err-msg"] ?? "rejected", retcode: r.data?.["err-code"] };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  protected async modifyOrder(_s: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> {
    return { ok: false, error: "htx modify: cancel+re-place" };
  }

  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const sym = orderIdOrSymbol.includes("/") ? orderIdOrSymbol : (sess.openOrders.get(orderIdOrSymbol)?.symbol ?? orderIdOrSymbol);
    const m = sess.markets.get(sym); if (!m) return { ok: false, error: "not found" };
    const bal = sess.balances.get(m.base);
    const qty = volume ?? bal?.free ?? 0;
    if (qty <= 0) return { ok: false, error: "no balance" };
    return this.placeOrder(sess, { symbol: sym, marketType: "spot", side: "sell", type: "market", quantity: qty });
  }

  protected async cancelOrderImpl(sess: CryptoAccountSession, orderId: string): Promise<OrderResult> {
    try {
      const r = await sess.http.request<any>({ method: "POST", path: `/v1/order/orders/${orderId}/submitcancel` });
      return { ok: r.data?.status === "ok", ticket: orderId, error: r.data?.["err-msg"] };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const period = { M1: "1min", M5: "5min", M15: "15min", M30: "30min", H1: "60min", H4: "4hour", D1: "1day", W1: "1week", MN1: "1mon" }[tf] ?? "60min";
    const r = await sess.http.request<any>({ method: "GET", path: "/market/history/kline", query: { symbol: m.rawSymbol, period, size: String(Math.min(count, 2000)) }, skipAuth: true });
    return (r.data?.data ?? []).map((k: any) => ({ symbol, timeframe: tf, time: new Date(k.id * 1000).toISOString(), open: Number(k.open), high: Number(k.high), low: Number(k.low), close: Number(k.close), volume: Number(k.amount) }));
  }

  protected async fetchRecentFills(sess: CryptoAccountSession, since?: string): Promise<CryptoFill[]> {
    try {
      const r = await sess.http.request<any>({ method: "GET", path: "/v1/order/matchresults", query: { size: "50" } });
      const out: CryptoFill[] = (r.data?.data ?? []).map((f: any) => ({
        id: String(f.id), orderId: String(f.orderId),
        symbol: htxRawToSymbol(f.symbol), marketType: "spot",
        side: (f.type ?? "").startsWith("buy") ? "buy" : "sell",
        price: Number(f.price), quantity: Number(f.filledAmount ?? f.filledPoints ?? f.amount),
        fee: Number(f.fee ?? 0), feeCurrency: String(f.feeCurrency ?? "USDT").toUpperCase(),
        time: new Date(f.createdAt ?? Date.now()).toISOString(), isMaker: false, tradeId: String(f.id),
      }));
      if (since) return out.filter((f) => f.time >= since);
      return out;
    } catch { return []; }
  }

  /* ── Public WS (wss://api.htx.com/ws) ── */
  // HTX public frames are GZIP-compressed binary; override createPublicWsClient
  // to set gzip:true on the ExchangeWsClient.

  protected createPublicWsClient(sess: CryptoAccountSession, url: string): ExchangeWsClient {
    return new ExchangeWsClient({
      url,
      label: `${this.exchange}:public`,
      parser: (raw) => this.parsePublicMessage(sess, raw),
      pingIntervalMs: CAPS.publicWsPingIntervalMs,
      pingMessage: this.publicPingMessage(),
      gzip: true,
    });
  }

  protected publicPingMessage(): string {
    return JSON.stringify({ ping: Date.now() });
  }

  protected buildTickerSubscribePayload(m: CryptoMarket): object {
    return { sub: `market.${m.rawSymbol}.bbo`, id: `bbo-${m.rawSymbol}` };
  }
  protected buildTickerUnsubscribePayload(m: CryptoMarket): object {
    return { unsub: `market.${m.rawSymbol}.bbo`, id: `bbo-${m.rawSymbol}` };
  }

  protected parseTickerMessage(_s: CryptoAccountSession, _m: CryptoMarket, payload: any): { bid: number; ask: number } | null {
    const t = payload?.tick ?? payload;
    if (!t) return null;
    const bid = Number(t.bid ?? 0);
    const ask = Number(t.ask ?? 0);
    if (!bid || !ask) return null;
    return { bid, ask };
  }

  protected parsePublicMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return []; }
    // Server ping {ping: ts} → reply {pong: ts}. The ExchangeWsClient's
    // outbound client ping is separate; HTX's server-initiated ping must be
    // answered here because the WS client doesn't know exchange semantics.
    if (msg && typeof msg.ping === "number") {
      try { sess.publicWs?.send({ pong: msg.ping } as any); } catch { /* best effort */ }
      return [];
    }
    if (msg?.pong !== undefined) return [];
    if (msg?.status === "ok" || msg?.status === "error") return []; // sub ack
    const ch: string = msg.ch ?? "";
    if (!ch) return [];
    // market.btcusdt.bbo → ticker:btcusdt
    const m = ch.match(/^market\.(.+)\.bbo$/);
    if (m) {
      return [{ channel: `ticker:${m[1]}`, payload: msg }];
    }
    return [];
  }

  /* ── Private WS (wss://api.htx.com/ws/v2) ── */

  protected authenticatePrivateWs(sess: CryptoAccountSession, send: (p: any) => void): void {
    const ts = new Date().toISOString().slice(0, 19);
    // v2 WS auth signature: lowercase param names; signatureVersion "2.1";
    // sign "GET\napi.htx.com\n/ws/v2\n<sorted_urlencoded_params>".
    const params: Record<string, string> = {
      accessKey: sess.creds.apiKey,
      signatureMethod: "HmacSHA256",
      signatureVersion: "2.1",
      timestamp: ts,
    };
    const sorted = Object.keys(params).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
    const toSign = `GET\n${HOST}\n/ws/v2\n${sorted}`;
    const sig = hmacSha256Base64(sess.creds.apiSecret, toSign);
    send({
      action: "req",
      ch: "auth",
      params: {
        authType: "api",
        accessKey: params.accessKey,
        signatureMethod: params.signatureMethod,
        signatureVersion: params.signatureVersion,
        timestamp: ts,
        signature: sig,
      },
    });
  }

  protected async afterPrivateAuth(_s: CryptoAccountSession, send: (p: any) => void): Promise<void> {
    send({ action: "sub", ch: "accounts.update" });
    send({ action: "sub", ch: "orders#*" });
    send({ action: "sub", ch: "trade.clearing#*" });
  }

  protected privatePingMessage(): object {
    return { action: "ping", data: { ts: Date.now() } };
  }

  protected parsePrivateMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return []; }
    const out: Array<{ channel: string; payload: unknown }> = [];
    if (!msg || typeof msg !== "object") return out;

    // Respond to server-initiated pings on v2.
    if (msg.action === "ping" && msg.data?.ts !== undefined) {
      try { sess.privateWs?.send({ action: "pong", data: { ts: msg.data.ts } } as any); } catch { /* */ }
      return out;
    }
    if (msg.action === "pong") return out;
    if (msg.action === "req" && msg.ch === "auth") return out;
    if (msg.action === "sub") return out;

    if (msg.action === "push") {
      const ch: string = msg.ch ?? "";
      const data = msg.data ?? {};
      if (ch.startsWith("orders#")) {
        // Merge new fields over any existing tracked order (HTX sends deltas).
        const prior = sess.openOrders.get(String(data.orderId));
        const merged: any = { ...(prior ? cryptoOrderToHtxRaw(prior) : {}), ...data };
        const order = htxWsOrderToCrypto(merged);
        const priorFilled = prior?.filledQuantity ?? 0;
        // Prefer tradeVolume as the incremental delta when present (this event
        // is a single match); otherwise fall back to cumulative difference.
        let delta: number;
        if (data.eventType === "trade" && data.tradeVolume) {
          delta = Number(data.tradeVolume);
        } else {
          delta = Math.max(0, order.filledQuantity - priorFilled);
        }
        // Re-seed so applyFill's += math ends at correct cumulative total.
        order.filledQuantity = priorFilled;
        order.remainingQuantity = Math.max(0, order.quantity - priorFilled);
        sess.openOrders.set(order.id, order);
        if (delta > 0 && !sess.fills.find((f) => f.id === `${order.id}:${data.tradeId ?? data.lastActTime}`)) {
          this.applyFill(sess, {
            id: `${order.id}:${data.tradeId ?? data.lastActTime ?? Date.now()}`,
            orderId: order.id,
            symbol: order.symbol,
            marketType: "spot",
            side: order.side,
            price: Number(data.tradePrice ?? order.avgFillPrice ?? order.price ?? 0),
            quantity: delta,
            fee: Math.abs(Number(data.feeDeduct ?? data.fee ?? 0)),
            feeCurrency: String(data.feeCurrency ?? "USDT").toUpperCase(),
            realizedPnl: 0,
            time: data.lastActTime ? new Date(Number(data.lastActTime)).toISOString() : new Date().toISOString(),
            isMaker: data.aggressor === false, tradeId: data.tradeId ? String(data.tradeId) : undefined,
          });
        }
        const terminal = order.status === "filled" || order.status === "canceled" || order.status === "rejected" || order.status === "expired";
        if (terminal) sess.openOrders.delete(order.id);
        out.push({ channel: "order", payload: order });
      } else if (ch.startsWith("trade.clearing#")) {
        const sym = htxRawToSymbol(data.symbol ?? ch.split("#")[1] ?? "");
        if (data.orderId && Number(data.tradeVolume ?? 0) > 0) {
          const fill: CryptoFill = {
            id: `${data.orderId}:${data.tradeId ?? Date.now()}`,
            orderId: String(data.orderId),
            symbol: sym, marketType: "spot",
            side: String(data.orderSide ?? "buy") === "sell" ? "sell" : "buy",
            price: Number(data.tradePrice ?? 0),
            quantity: Number(data.tradeVolume ?? 0),
            fee: Math.abs(Number(data.feeDeduct ?? data.fee ?? 0)),
            feeCurrency: String(data.feeCurrency ?? "USDT").toUpperCase(),
            realizedPnl: 0,
            time: new Date().toISOString(),
            isMaker: data.aggressor === false,
            tradeId: data.tradeId ? String(data.tradeId) : undefined,
          };
          this.applyFill(sess, fill);
          out.push({ channel: "fill", payload: fill });
        }
      } else if (ch.startsWith("accounts.update")) {
        const asset = String(data.currency ?? "").toUpperCase();
        if (asset) {
          const free = Number(data.available ?? 0);
          const total = Number(data.balance ?? (free || 0));
          const locked = Math.max(0, total - free);
          if (total > 0) {
            sess.balances.set(asset, {
              asset, free, locked, total,
              usdValue: isUsdStable(asset) ? total : undefined,
            });
          } else {
            sess.balances.delete(asset);
          }
        }
        out.push({ channel: "balance", payload: data });
      }
    }
    return out;
  }
}

/* ── Helpers ── */

function isUsdStable(asset: string): boolean {
  return asset === "USDT" || asset === "USDC" || asset === "USD" || asset === "HUSD" || asset === "BUSD" || asset === "TUSD" || asset === "FDUSD";
}

function htxRawToSymbol(raw: string): string {
  if (!raw) return "";
  const s = String(raw).toLowerCase();
  // Longest-first quote matching to avoid "usdt" being mis-parsed when "fdusd"/"tusd" exist.
  const quotes = ["fdusd", "tusd", "usdt", "husd", "usdc", "usd"];
  for (const q of quotes) {
    if (s.endsWith(q) && s.length > q.length) {
      const base = s.slice(0, s.length - q.length).toUpperCase();
      return `${base}/${q.toUpperCase()}`;
    }
  }
  return s.toUpperCase();
}

function htxSideTo(type: string | undefined): "buy" | "sell" {
  if (!type) return "buy";
  return type.startsWith("sell") ? "sell" : "buy";
}
function htxTypeTo(type: string | undefined): CryptoOrder["type"] {
  if (!type) return "limit";
  if (type.includes("market")) return "market";
  return "limit";
}

function htxRestOrderToCrypto(x: any): CryptoOrder {
  const sym = htxRawToSymbol(x.symbol);
  const qty = Number(x.amount ?? 0);
  const filled = Number(x["filled-amount"] ?? x.filledAmount ?? x.filledCashAmount ?? 0);
  return {
    id: String(x.id),
    clientOrderId: x["client-order-id"] ?? undefined,
    symbol: sym, marketType: "spot",
    side: htxSideTo(x.type),
    type: htxTypeTo(x.type),
    price: Number(x.price ?? 0) || null,
    triggerPrice: Number(x["stop-price"] ?? 0) || null,
    quantity: qty,
    filledQuantity: filled,
    remainingQuantity: Math.max(0, qty - filled),
    avgFillPrice: Number(x["field-amount"] ?? 0) || null,
    status: mapStatusStd(x.state ?? x.status),
    timeInForce: "GTC",
    reduceOnly: false,
    createdTime: x["created-at"] ? new Date(Number(x["created-at"])).toISOString() : new Date().toISOString(),
    updatedTime: x["finished-at"] ? new Date(Number(x["finished-at"])).toISOString() : new Date().toISOString(),
    fee: 0, feeCurrency: "USDT",
  };
}

function htxWsOrderToCrypto(d: any): CryptoOrder {
  const sym = htxRawToSymbol(d.symbol);
  const qty = Number(d.orderSize ?? d.orderAmt ?? d.amount ?? 0);
  const filled = Number(d.filledAmount ?? d.filledCashAmount ?? d.filledPoints ?? d["field-amount"] ?? 0);
  const type = String(d.type ?? "buy-limit");
  return {
    id: String(d.orderId),
    clientOrderId: d.clientOrderId ? String(d.clientOrderId) : undefined,
    symbol: sym, marketType: "spot",
    side: htxSideTo(d.orderSide ?? type),
    type: htxTypeTo(d.type ?? d.orderType),
    price: Number(d.orderPrice ?? d.price ?? 0) || null,
    triggerPrice: null,
    quantity: qty,
    filledQuantity: filled,
    remainingQuantity: Math.max(0, qty - filled),
    avgFillPrice: Number(d.price ?? d.tradePrice ?? 0) || null,
    status: mapHtxStatus(d.orderStatus),
    timeInForce: "GTC",
    reduceOnly: false,
    createdTime: d.orderCreateTime ? new Date(Number(d.orderCreateTime)).toISOString() : new Date().toISOString(),
    updatedTime: d.lastActTime ? new Date(Number(d.lastActTime)).toISOString() : new Date().toISOString(),
    fee: 0, feeCurrency: "USDT",
  };
}

function mapHtxStatus(s: string | undefined): CryptoOrder["status"] {
  if (!s) return "new";
  const u = s.toLowerCase();
  if (u === "submitted" || u === "pre-submitted" || u === "created") return "new";
  if (u === "partial-filled") return "partially_filled";
  if (u === "partial-canceled" || u === "partial-cancelled") return "canceled";
  if (u === "filled") return "filled";
  if (u === "canceled" || u === "cancelled") return "canceled";
  if (u === "rejected") return "rejected";
  return mapStatusStd(s);
}

/** Reverse helper: merge existing CryptoOrder into an HTX-raw-shaped object so
 *  delta updates from WS (which often contain only changed fields) can be
 *  interpreted by htxWsOrderToCrypto against the prior tracked state. */
function cryptoOrderToHtxRaw(o: CryptoOrder): any {
  return {
    orderId: o.id, clientOrderId: o.clientOrderId, symbol: o.symbol.replace("/", "").toLowerCase(),
    orderSide: o.side, type: `${o.side}-${o.type}`,
    orderPrice: o.price ?? undefined, orderSize: String(o.quantity),
    filledAmount: String(o.filledQuantity),
    orderStatus: o.status === "partially_filled" ? "partial-filled"
      : o.status === "filled" ? "filled"
      : o.status === "canceled" ? "canceled"
      : o.status === "rejected" ? "rejected"
      : "submitted",
    lastActTime: String(Math.floor(new Date(o.updatedTime).getTime())),
  };
}
