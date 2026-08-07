/**
 * KuCoin connector (Spot + Futures).
 * Auth: KC-API-KEY, KC-API-SIGN (base64 HMAC-SHA256 of ts+METHOD+path+body64),
 * KC-API-TIMESTAMP, KC-API-PASSPHRASE.
 * Base: https://api.kucoin.com (futures: https://api-futures.kucoin.com).
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle, CryptoPosition } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { createHmac } from "node:crypto";
import { phase1Gate, majorPairs, mapStatusStd } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "margin", "perp", "futures"], auth: ["hmac_sha256_header"],
  hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: false, hasTransfers: true,
  restBaseUrl: "https://api.kucoin.com", publicWsUrl: "wss://ws-api.kucoin.com/endpoint", privateWsUrl: "wss://ws-api.kucoin.com/endpoint",
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class KucoinConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "kucoin", label: "KuCoin", capabilities: CAPS }); }
  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const ts = String(timestampMs);
        const b64 = body ? Buffer.from(body).toString("base64") : "";
        const sig = createHmac("sha256", creds.apiSecret).update(ts + method.toUpperCase() + path + b64).digest("base64");
        headers["KC-API-KEY"] = creds.apiKey;
        headers["KC-API-SIGN"] = sig;
        headers["KC-API-TIMESTAMP"] = ts;
        headers["KC-API-PASSPHRASE"] = createHmac("sha256", creds.apiSecret).update(creds.passphrase ?? "").digest("base64");
        headers["KC-API-KEY-VERSION"] = "2";
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { perp, spot } = majorPairs("-USDT");
    return [...perp, ...spot];
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const balances: CryptoBalance[] = [];
    try {
      const r = await sess.http.request<any>({ method: "GET", path: "/api/v1/accounts" });
      for (const a of r.data?.data ?? []) {
        const total = Number(a.balance);
        if (total > 0) balances.push({ asset: a.currency, free: Number(a.available), locked: Number(a.holds), total });
      }
    } catch {}
    const positions: CryptoPosition[] = [];
    const openOrders: CryptoOrder[] = [];
    try {
      const oo = await sess.http.request<any>({ method: "GET", path: "/api/v1/orders?status=active&pageSize=50" });
      for (const o of oo.data?.data?.items ?? []) {
        openOrders.push({
          id: o.id, clientOrderId: o.clientOid, symbol: o.symbol.replace("-", "/"), marketType: "spot",
          side: o.side === "buy" ? "buy" : "sell", type: o.type === "limit" ? "limit" : "market",
          price: Number(o.price) || null, quantity: Number(o.size), filledQuantity: Number(o.dealSize),
          remainingQuantity: Number(o.size) - Number(o.dealSize), avgFillPrice: Number(o.price) ? Number(o.dealFunds) / Math.max(Number(o.dealSize), 0.00001) : null,
          status: mapStatusStd(o.isActive ? "NEW" : "FILLED"), timeInForce: "GTC", reduceOnly: false,
          createdTime: new Date(Number(o.createdAt)).toISOString(), updatedTime: new Date(Number(o.createdAt)).toISOString(), fee: Number(o.fee ?? 0), feeCurrency: o.feeCurrency ?? "USDT",
        });
      }
    } catch {}
    return { accountId: sess.login, accountType: "spot", canTrade: true, canWithdraw: true, equityUsd: balances.reduce((s, b) => s + (b.asset === "USDT" || b.asset === "USDC" ? b.total : 0), 0), unrealizedPnlUsd: 0, balances, positions, openOrders };
  }
  protected async placeOrder(_s: CryptoAccountSession, _r: CryptoOrderRequest): Promise<OrderResult> { return phase1Gate("kucoin"); }
  protected async modifyOrder(_s: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return phase1Gate("kucoin"); }
  protected async closePositionImpl(_s: CryptoAccountSession, _id: string, _v?: number): Promise<OrderResult> { return phase1Gate("kucoin"); }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const type = m.type === "spot" ? "" : "type:" + m.type + ",";
    const klines = { M1: "1min", M5: "5min", M15: "15min", M30: "30min", H1: "1hour", H4: "4hour", D1: "1day", W1: "1week" }[tf] ?? "1hour";
    const r = await sess.http.request<any>({ method: "GET", path: "/api/v1/market/candles", query: { symbol: m.rawSymbol, type: type + klines }, skipAuth: true });
    return (r.data?.data ?? []).slice(0, count).map((k: any) => ({
      symbol, timeframe: tf, time: new Date(Number(k[0]) * 1000).toISOString(),
      open: Number(k[1]), high: Number(k[3]), low: Number(k[4]), close: Number(k[2]), volume: Number(k[5]),
    }));
  }
  protected async fetchRecentFills(): Promise<CryptoFill[]> { return []; /* Phase 2 via /api/v1/fills */ }
  protected authenticatePrivateWs(sess: CryptoAccountSession, send: (p: any) => void): void {
    // KuCoin requires a server-issued WS token from POST /api/v1/bullet-private; Phase 2 wires this.
    void sess; void send;
  }
}
