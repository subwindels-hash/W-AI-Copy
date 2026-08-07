/**
 * MEXC connector (Spot + USDT perps — Binance-compatible API).
 * Auth: ApiKey / Request-Time / Signature headers; HMAC-SHA256 hex of `timestamp+params`.
 * Base: https://api.mexc.com.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoCandle } from "@windels/shared/crypto";
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
  protected authenticatePrivateWs(_sess: CryptoAccountSession, _send: (p: any) => void): void { /* MEXC uses listenKey via POST /api/v3/userDataStream; deferred */ }
  protected async createListenKey(sess: CryptoAccountSession): Promise<string | undefined> {
    try { const r = await sess.http.request<any>({ method: "POST", path: "/api/v3/userDataStream" }); return r.data?.listenKey; } catch { return undefined; }
  }
  protected async keepAliveListenKey(sess: CryptoAccountSession): Promise<void> { if (sess.privateListenKey) await sess.http.request<any>({ method: "PUT", path: "/api/v3/userDataStream", query: { listenKey: sess.privateListenKey } }).catch(() => {}); }
  protected async disposeListenKey(sess: CryptoAccountSession): Promise<void> { if (sess.privateListenKey) await sess.http.request<any>({ method: "DELETE", path: "/api/v3/userDataStream", query: { listenKey: sess.privateListenKey } }).catch(() => {}); }
}
