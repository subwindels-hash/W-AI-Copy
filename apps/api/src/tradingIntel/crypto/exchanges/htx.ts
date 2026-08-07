/**
 * HTX (Huobi) connector.
 * Auth: HMAC-SHA256 of sorted query string with AccessKeyId, SignatureMethod,
 * SignatureVersion, Timestamp; signature added to query (base64 of HMAC of
 * "METHOD\nHOST\nPATH\nSORTED_QUERY").
 * Base: https://api.huobi.pro (HTX rebranded; the host is still api.huobi.pro in
 * many deployments; api.htx.com is also valid; we use api.htx.com here).
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Base64 } from "../signing.js";
import { majorPairs } from "./common.js";

const HOST = "api.htx.com";
const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "margin", "perp", "futures"],
  auth: ["hmac_sha256_query"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: false, hasTransfers: true,
  restBaseUrl: `https://${HOST}`,
  publicWsUrl: "wss://api.htx.com/ws",
  privateWsUrl: "wss://api.htx.com/ws/v2",
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class HtxConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "htx", label: "HTX", capabilities: CAPS }); }
  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const dt = new Date(timestampMs).toISOString().slice(0, 19);
        const params: Record<string, string> = {
          AccessKeyId: creds.apiKey,
          SignatureMethod: "HmacSHA256",
          SignatureVersion: "2",
          Timestamp: dt,
        };
        // Merge existing query params if present.
        const qIdx = path.indexOf("?");
        let basePath = path;
        if (qIdx >= 0) {
          basePath = path.slice(0, qIdx);
          for (const [k, v] of new URLSearchParams(path.slice(qIdx + 1))) params[k] = v;
        }
        if (method !== "GET" && body) {
          // HTX signs the body hash into a separate header for POST; for simplicity
          // in Phase 2 we only sign GET/DELETE path+query and POST without body (account).
        }
        const sorted = Object.keys(params).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
        const toSign = `${method.toUpperCase()}\n${HOST}\n${basePath}\n${sorted}`;
        const sig = hmacSha256Base64(creds.apiSecret, toSign);
        const newQuery = sorted + `&Signature=${encodeURIComponent(sig)}`;
        headers["content-type"] = method === "GET" ? "application/json" : "application/json";
        return { path: basePath + "?" + newQuery };
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { perp, spot } = majorPairs("USDT"); return [...perp, ...spot];
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const r = await sess.http.request<any>({ method: "GET", path: "/v1/account/accounts" });
    const acctId = r.data?.data?.[0]?.id;
    let balances: CryptoBalance[] = [];
    if (acctId) {
      const b = await sess.http.request<any>({ method: "GET", path: `/v1/account/accounts/${acctId}/balance` });
      balances = (b.data?.data?.list ?? []).map((x: any) => ({ asset: x.currency, free: x.type === "trade" ? Number(x.balance) : 0, locked: 0, total: Number(x.balance) }))
        .reduce((acc: CryptoBalance[], b: CryptoBalance) => {
          const ex = acc.find((x) => x.asset === b.asset);
          if (ex) { ex.total += b.total; ex.free += b.free; } else acc.push(b);
          return acc;
        }, []).filter((b: CryptoBalance) => b.total > 0);
    }
    return { accountId: String(acctId ?? sess.login), accountType: "spot", canTrade: true, canWithdraw: true, equityUsd: balances.reduce((s, b) => s + (b.asset === "usdt" ? b.total : 0), 0), unrealizedPnlUsd: 0, balances, positions: [], openOrders: [] };
  }
  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const acctId = (sess.snapshot as any)?.accountId;
    const body: Record<string, any> = {
      "account-id": acctId, symbol: m.rawSymbol.toLowerCase(),
      type: `${req.side}-${req.type === "limit" ? "limit" : "market"}`,
      amount: String(req.quantity),
      "client-order-id": req.clientOrderId ?? this.genClientOrderId(sess),
    };
    if (req.type === "limit") body.price = String(req.price);
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/v1/order/orders/place", body });
      if (r.data?.status === "ok") return { ok: true, ticket: String(r.data.data), comment: body["client-order-id"] };
      return { ok: false, error: r.data?.["err-msg"] ?? "rejected", retcode: r.data?.["err-code"] };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async modifyOrder(_sess: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return { ok: false, error: "htx modify: cancel+re-place" }; }
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
    const r = await sess.http.request<any>({ method: "GET", path: "/market/history/kline", query: { symbol: m.rawSymbol.toLowerCase(), period, size: String(Math.min(count, 2000)) }, skipAuth: true });
    return (r.data?.data ?? []).map((k: any) => ({ symbol, timeframe: tf, time: new Date(k.id * 1000).toISOString(), open: k.open, high: k.high, low: k.low, close: k.close, volume: k.amount }));
  }
  protected async fetchRecentFills(_sess: CryptoAccountSession, _since?: string): Promise<CryptoFill[]> { return []; }
  protected authenticatePrivateWs(_sess: CryptoAccountSession, _send: (p: any) => void): void { /* HTX private WS uses /ws/v2 with auth message — deferred */ }
}
