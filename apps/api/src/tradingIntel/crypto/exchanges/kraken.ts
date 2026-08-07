/**
 * Kraken connector (Spot + Futures).
 * Auth: HMAC-SHA512 base64 of (path + SHA256(nonce+postdata)) keyed with API secret.
 * Header: API-Key + API-Sign.
 * Path prefix: /0/private/*.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha512Base64, sha256Hex } from "../signing.js";
import { notCertified, mkMarket } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "futures", "margin"],
  auth: ["hmac_sha512_header"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: false, hasTransfers: true,
  restBaseUrl: "https://api.kraken.com",
  testnetRestUrl: "https://demo-futures.kraken.com",
  publicWsUrl: "wss://ws.kraken.com/v2",
  privateWsUrl: "wss://ws-auth.kraken.com/v2",
  defaultReqPerMin: 200, correctsClockDrift: false,
};

export class KrakenConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "kraken", label: "Kraken", capabilities: CAPS }); }
  private nonce = () => Date.now().toString();

  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const nonce = String(timestampMs * 1000);
        // Kraken expects nonce in body (form) and signs SHA256(nonce + postdata).
        let postdata = body ?? "";
        if (method !== "GET") {
          const params = new URLSearchParams(postdata);
          params.set("nonce", nonce);
          postdata = params.toString();
        }
        const np = nonce + postdata;
        const hash = sha256Hex(np);
        // API-Sign = Base64(HMAC-SHA512(secret, path + SHA256(nonce+postdata)))
        const sig = hmacSha512Base64(creds.apiSecret, path + hash);
        headers["API-Key"] = creds.apiKey;
        headers["API-Sign"] = sig;
        headers["content-type"] = "application/x-www-form-urlencoded";
        return { body: method !== "GET" ? postdata : null };
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const bases = [
      "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT", "LTC", "MATIC",
      "BCH", "ETC", "FIL", "ATOM", "NEAR", "APT", "ARB", "OP", "SUI",
      "SEI", "INJ", "PEPE", "SHIB", "TRX", "UNI", "AAVE", "MKR", "LDO", "GRT",
    ];
    return bases.map((b) => mkMarket(`${b}/USD`, `${b}USD`, "spot", b, "USD", "", 0.01, 0.00001, 5, 0.00001, 10, 2, 5))
      .concat(bases.map((b) => mkMarket(`${b}/USDT`, `${b}USDT`, "spot", b, "USDT", "", 0.01, 0.00001, 5, 0.00001, 10, 2, 5)));
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const b = await sess.http.request<any>({ method: "POST", path: "/0/private/Balance" });
    const balances: CryptoBalance[] = Object.entries(b.data?.result ?? {}).map(([a, v]) => {
      const tot = Number(v); return { asset: a.replace(/^[XZ]/, ""), free: tot, locked: 0, total: tot };
    }).filter((b) => b.total > 0);
    let openOrders: CryptoOrder[] = [];
    try {
      const o = await sess.http.request<any>({ method: "POST", path: "/0/private/OpenOrders" });
      openOrders = Object.entries(o.data?.result?.open ?? {}).map(([id, x]: [string, any]) => ({
        id, symbol: x.descr?.pair ?? x.pair ?? "", marketType: "spot",
        side: x.descr?.type === "buy" ? "buy" : "sell",
        type: (x.descr?.ordertype === "limit" ? "limit" : "market"),
        price: Number(x.descr?.price) || Number(x.price) || null,
        quantity: Number(x.vol), filledQuantity: Number(x.vol_exec), remainingQuantity: Number(x.vol) - Number(x.vol_exec),
        avgFillPrice: Number(x.price) || null,
        status: x.status === "open" ? "new" : x.status === "closed" ? "filled" : "canceled",
        timeInForce: "GTC", reduceOnly: false, createdTime: new Date(Number(x.opentm) * 1000).toISOString(),
        updatedTime: new Date().toISOString(), fee: 0, feeCurrency: "ZUSD", clientOrderId: x.userref,
      }));
    } catch { /* */ }
    const positions: CryptoPosition[] = [];
    return { accountId: sess.login, accountType: "spot", canTrade: true, canWithdraw: true, equityUsd: balances.reduce((s, b) => s + (b.asset === "ZUSD" || b.asset === "USD" || b.asset === "USDT" ? b.total : 0), 0), unrealizedPnlUsd: 0, balances, positions, openOrders };
  }
  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const body: Record<string, any> = {
      pair: m.rawSymbol,
      type: req.side === "buy" ? "buy" : "sell",
      ordertype: req.type === "market" ? "market" : "limit",
      volume: String(req.quantity),
    };
    if (req.clientOrderId) body.userref = req.clientOrderId;
    if (req.price && body.ordertype === "limit") body.price = String(req.price);
    if (req.reduceOnly) body.reduce_only = true;
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/0/private/AddOrder", body });
      const err = r.data?.error;
      if (err && err.length) return { ok: false, error: err.join(";"), retcode: -1 };
      return { ok: true, ticket: r.data?.result?.txid?.[0], comment: req.clientOrderId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async modifyOrder(_sess: CryptoAccountSession, _id: string, _patch: any): Promise<OrderResult> { return notCertified("kraken:modify"); }
  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const m = sess.markets.get(orderIdOrSymbol);
    if (!m) return { ok: false, error: "market not found" };
    const bal = sess.balances.get(m.base);
    const qty = volume ?? bal?.free ?? 0;
    if (qty <= 0) return { ok: false, error: "no balance" };
    return this.placeOrder(sess, { symbol: orderIdOrSymbol, marketType: m.type, side: "sell", type: "market", quantity: qty });
  }
  protected async cancelOrderImpl(sess: CryptoAccountSession, orderId: string): Promise<OrderResult> {
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/0/private/CancelOrder", body: { txid: orderId } });
      if (r.data?.error?.length) return { ok: false, error: r.data.error.join(";") };
      return { ok: true, ticket: orderId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const interval = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440, W1: 10080, MN1: 21600 }[tf] ?? 60;
    const r = await sess.http.request<any>({ method: "GET", path: "/0/public/OHLC", query: { pair: m.rawSymbol, interval: String(interval) }, skipAuth: true });
    const key = Object.keys(r.data?.result ?? {}).find((k) => k !== "last");
    if (!key) return [];
    return (r.data.result[key] ?? []).slice(-count).map((k: any) => ({
      symbol, timeframe: tf, time: new Date(Number(k[0]) * 1000).toISOString(),
      open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[6]),
    }));
  }
  protected async fetchRecentFills(sess: CryptoAccountSession, since?: string): Promise<CryptoFill[]> {
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/0/private/TradesHistory" });
      const out: CryptoFill[] = Object.entries(r.data?.result?.trades ?? {}).map(([id, t]: [string, any]) => ({
        id, orderId: t.ordertxid, symbol: t.pair, marketType: "spot",
        side: t.type === "buy" ? "buy" : "sell", price: Number(t.price), quantity: Number(t.vol),
        fee: Number(t.fee), feeCurrency: t.fee, realizedPnl: undefined,
        time: new Date(Number(t.time) * 1000).toISOString(), isMaker: false, tradeId: id,
      }));
      if (since) return out.filter((f) => f.time >= since);
      return out;
    } catch { return []; }
  }
  protected authenticatePrivateWs(_sess: CryptoAccountSession, _send: (p: any) => void): void { /* Kraken private WS uses token obtained from REST; not yet wired. */ }
}
