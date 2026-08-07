/**
 * Kraken connector (Spot + Futures).
 * Auth: HMAC-SHA512 of (path + SHA256(nonce + postdata)) keyed by base64-decoded API secret.
 * Header: API-Key + API-Sign.
 * Base: https://api.kraken.com (futures: https://futures.kraken.com).
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle, CryptoPosition } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha512Base64, sha256Hex, formEncode } from "../signing.js";
import { phase1Gate, majorPairs } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "futures", "margin"], auth: ["hmac_sha512_header"],
  hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: false, hasTransfers: true,
  restBaseUrl: "https://api.kraken.com", publicWsUrl: "wss://ws.kraken.com/v2", privateWsUrl: "wss://ws-auth.kraken.com/v2",
  defaultReqPerMin: 200, correctsClockDrift: false,
};

export class KrakenConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "kraken", label: "Kraken", capabilities: CAPS }); }
  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers }) => {
        // Kraken: nonce is ms. Body must be form-encoded and include nonce.
        const nonce = Date.now().toString();
        let postdata = "";
        if (method !== "GET") {
          const params = body ? JSON.parse(body) : {};
          params.nonce = nonce;
          postdata = formEncode(params);
          headers["content-type"] = "application/x-www-form-urlencoded";
        } else {
          // GET: append nonce to query
          const sep = path.includes("?") ? "&" : "?";
          path = path + sep + "nonce=" + nonce;
        }
        const urlPath = path.split("?")[0];
        const signed = hmacSha512Base64(creds.apiSecret, urlPath + sha256Hex(nonce + postdata));
        headers["API-Key"] = creds.apiKey;
        headers["API-Sign"] = signed;
        return method !== "GET" ? { body: postdata } : { path };
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { spot } = majorPairs("/USD");
    return spot.map((m) => ({ ...m, rawSymbol: m.symbol.replace("/", "") }));
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    let balances: CryptoBalance[] = [];
    try {
      const b = await sess.http.request<any>({ method: "POST", path: "/0/private/Balance" });
      balances = Object.entries(b.data?.result ?? {}).map(([asset, amt]) => ({ asset: asset.replace(/^[XZ]/, ""), free: Number(amt), locked: 0, total: Number(amt) })).filter((x) => x.total > 0);
    } catch { /* */ }
    const positions: CryptoPosition[] = [];
    const oo = await sess.http.request<any>({ method: "POST", path: "/0/private/OpenOrders" }).catch(() => null);
    const openOrders: CryptoOrder[] = [];
    for (const [txid, o] of Object.entries<any>(oo?.data?.result?.open ?? {})) {
      const [base, quote] = o.descr.pair.split("/");
      openOrders.push({
        id: txid, symbol: base + "/" + quote, marketType: "spot",
        side: o.descr.type === "buy" ? "buy" : "sell", type: o.descr.ordertype === "limit" ? "limit" : "market",
        price: Number(o.descr.price) || null, quantity: Number(o.vol), filledQuantity: Number(o.vol) - Number(o.vol), remainingQuantity: Number(o.vol), avgFillPrice: null,
        status: "new", timeInForce: "GTC", reduceOnly: false, createdTime: new Date(Number(o.opentm) * 1000).toISOString(), updatedTime: new Date(Number(o.opentm) * 1000).toISOString(), fee: 0, feeCurrency: quote,
      });
    }
    return { accountId: sess.login, accountType: "spot", canTrade: true, canWithdraw: true, equityUsd: balances.reduce((s, b) => s + (b.asset === "USD" || b.asset === "USDC" || b.asset === "USDT" ? b.total : 0), 0), unrealizedPnlUsd: 0, balances, positions, openOrders };
  }
  protected async placeOrder(_s: CryptoAccountSession, _r: CryptoOrderRequest): Promise<OrderResult> { return phase1Gate("kraken"); }
  protected async modifyOrder(_s: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return phase1Gate("kraken"); }
  protected async closePositionImpl(_s: CryptoAccountSession, _id: string, _v?: number): Promise<OrderResult> { return phase1Gate("kraken"); }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const interval = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440, W1: 10080, MN1: 21600 }[tf] ?? 60;
    const pair = m.rawSymbol;
    const r = await sess.http.request<any>({ method: "GET", path: "/0/public/OHLC", query: { pair, interval: String(interval) }, skipAuth: true });
    const candles = Object.values<any[]>(r.data?.result ?? {}).find(Array.isArray) ?? [];
    return candles.slice(0, count).map((k: any) => ({
      symbol, timeframe: tf, time: new Date(k[0] * 1000).toISOString(),
      open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[6]),
    }));
  }
  protected async fetchRecentFills(): Promise<CryptoFill[]> { return []; }
  protected authenticatePrivateWs(): void { /* Phase 2: token-based WS auth */ }
}
