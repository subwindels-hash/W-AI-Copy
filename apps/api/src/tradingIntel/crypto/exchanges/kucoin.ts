/**
 * KuCoin connector.
 * Auth: KC-API-KEY, KC-API-SIGN (base64 HMAC-SHA256 of timestamp+method+path+body),
 * KC-API-TIMESTAMP, KC-API-PASSPHRASE, KC-API-KEY-VERSION=2.
 * Base: https://api.kucoin.com  (futures: https://api-futures.kucoin.com).
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
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
  privateWsUrl: "wss://ws-api.kucoin.com/endpoint",
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
      openOrders = (oo.data?.data?.items ?? []).map((o: any) => ({
        id: o.id, clientOrderId: o.clientOid, symbol: o.symbol.replace("-", "/"), marketType: "spot",
        side: o.side === "buy" ? "buy" : "sell",
        type: o.type === "limit" ? "limit" : "market",
        price: Number(o.price) || null, quantity: Number(o.size), filledQuantity: Number(o.dealSize),
        remainingQuantity: Number(o.size) - Number(o.dealSize), avgFillPrice: null,
        status: mapStatusStd(o.isActive ? "active" : "done"), timeInForce: "GTC", reduceOnly: false,
        createdTime: new Date(Number(o.createdAt)).toISOString(), updatedTime: new Date().toISOString(), fee: 0, feeCurrency: "USDT",
      }));
    } catch { /* */ }
    return { accountId: sess.login, accountType: "spot", canTrade: true, canWithdraw: true, equityUsd: balances.reduce((s, b) => s + (b.asset === "USDT" || b.asset === "USDC" ? b.total : 0), 0), unrealizedPnlUsd: 0, balances, positions: [], openOrders };
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
  protected authenticatePrivateWs(_sess: CryptoAccountSession, _send: (p: any) => void): void { /* KuCoin uses token from /api/v1/bullet-private; deferred */ }
}
