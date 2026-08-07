/** Crypto.com Exchange connector. Auth: apiKey/sign/timestamp/nonce in params; sign = HMAC-SHA256(apiKey + ts + nonce + method + path + body, secret). Base: https://api.crypto.com. */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoAccountSnapshot, CryptoBalance, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Hex } from "../signing.js";
import { phase1Gate, majorPairs } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp", "futures", "margin", "options"], auth: ["hmac_sha256_header"],
  hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: true, hasTransfers: true,
  restBaseUrl: "https://api.crypto.com", defaultReqPerMin: 600, correctsClockDrift: false,
};

export class CryptocomConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "cryptocom", label: "Crypto.com Exchange", capabilities: CAPS }); }
  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign({ method, path, body, headers, timestampMs }) {
        const ts = String(timestampMs);
        const nonce = String(timestampMs + 1);
        const b = body ?? "";
        const sig = hmacSha256Hex(creds.apiSecret, creds.apiKey + ts + nonce + method + path + b);
        // crypto.com expects params in JSON body (for POST) / query (for GET). We mutate body.
        if (method !== "GET" && body) {
          try {
            const j = JSON.parse(body);
            j.api_key = creds.apiKey; j.sig = sig; j.nonce = nonce; j.timestamp = ts;
            return { body: JSON.stringify(j) };
          } catch { /* */ }
        }
        headers["api-key"] = creds.apiKey;
        headers["api-signature"] = sig;
        headers["api-timestamp"] = ts;
        headers["api-nonce"] = nonce;
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { spot } = majorPairs("_USDT"); return spot.map((m) => ({ ...m, rawSymbol: m.rawSymbol }));
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const r = await sess.http.request<any>({ method: "POST", path: "/v2/private/get-account-summary", body: {} });
    const accts = r.data?.result?.accounts ?? [];
    const balances: CryptoBalance[] = [];
    for (const a of accts) {
      const total = Number(a.balance);
      if (total > 0) balances.push({ asset: a.currency, free: Number(a.available), locked: Number(a.order), total });
    }
    return { accountId: sess.login, accountType: "spot", canTrade: true, canWithdraw: true, equityUsd: balances.reduce((s: number, b: any) => s + (b.asset === "USDT" || b.asset === "USDC" ? b.total : 0), 0), unrealizedPnlUsd: 0, balances, positions: [], openOrders: [] };
  }
  protected async placeOrder(_s: CryptoAccountSession, _r: CryptoOrderRequest): Promise<OrderResult> { return phase1Gate("cryptocom"); }
  protected async modifyOrder(_s: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return phase1Gate("cryptocom"); }
  protected async closePositionImpl(_s: CryptoAccountSession, _id: string, _v?: number): Promise<OrderResult> { return phase1Gate("cryptocom"); }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const timeframe = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1D" }[tf] ?? "1h";
    const r = await sess.http.request<any>({ method: "GET", path: "/v2/public/get-candlestick", query: { instrument_name: m.rawSymbol, timeframe }, skipAuth: true });
    return (r.data?.result?.data ?? []).slice(-count).map((k: any) => ({ symbol, timeframe: tf, time: new Date(k.t).toISOString(), open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v) }));
  }
  protected async fetchRecentFills(): Promise<any[]> { return []; }
  protected authenticatePrivateWs(): void {}
}
