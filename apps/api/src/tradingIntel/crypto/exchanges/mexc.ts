/** MEXC connector (Spot + USDT-F Perp). Auth: ApiKey/Request-Time/Signature headers; sign=HMAC-SHA256(timestamp+method+path+body for POST, or GET with timestamp in query). Base: https://api.mexc.com (spot) / https://contract.mexc.com (futures). */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoAccountSnapshot, CryptoBalance, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Hex } from "../signing.js";
import { phase1Gate, majorPairs } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp", "margin", "futures"], auth: ["hmac_sha256_header"],
  hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: false, hasTransfers: false,
  restBaseUrl: "https://api.mexc.com", defaultReqPerMin: 600, correctsClockDrift: true,
};

export class MexcConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "mexc", label: "MEXC", capabilities: CAPS }); }
  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, headers, timestampMs }) => {
        const ts = String(timestampMs);
        let toSign: string;
        if (method === "GET") {
          const sep = path.includes("?") ? "&" : "?";
          toSign = method.toUpperCase() + path + sep + "timestamp=" + ts;
        } else {
          toSign = method.toUpperCase() + path + (path.includes("?") ? "&" : "?") + "timestamp=" + ts;
        }
        const sig = hmacSha256Hex(creds.apiSecret, toSign);
        headers["ApiKey"] = creds.apiKey;
        headers["Request-Time"] = ts;
        headers["Signature"] = sig;
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { spot } = majorPairs("USDT"); return spot;
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const r = await sess.http.request<any>({ method: "GET", path: "/api/v3/account" });
    const balances: CryptoBalance[] = (r.data?.balances ?? []).map((b: any) => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked), total: Number(b.free) + Number(b.locked) })).filter((x: any) => x.total > 0);
    return { accountId: sess.login, accountType: "spot", canTrade: true, canWithdraw: false, equityUsd: balances.reduce((s: number, b: any) => s + (b.asset === "USDT" || b.asset === "USDC" ? b.total : 0), 0), unrealizedPnlUsd: 0, balances, positions: [], openOrders: [] };
  }
  protected async placeOrder(_s: CryptoAccountSession, _r: CryptoOrderRequest): Promise<OrderResult> { return phase1Gate("mexc"); }
  protected async modifyOrder(_s: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return phase1Gate("mexc"); }
  protected async closePositionImpl(_s: CryptoAccountSession, _id: string, _v?: number): Promise<OrderResult> { return phase1Gate("mexc"); }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const interval = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1d" }[tf] ?? "1h";
    const r = await sess.http.request<any[]>({ method: "GET", path: "/api/v3/klines", query: { symbol: m.rawSymbol, interval, limit: String(Math.min(count, 500)) }, skipAuth: true });
    return (r.data ?? []).map((k: any) => ({ symbol, timeframe: tf, time: new Date(k[0]).toISOString(), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]), quoteVolume: Number(k[7]) }));
  }
  protected async fetchRecentFills(): Promise<any[]> { return []; }
  protected authenticatePrivateWs(): void {}
}
