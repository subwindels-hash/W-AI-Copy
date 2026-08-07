/** HTX (Huobi) connector. Auth: AccessKeyId/SignatureMethod/SignatureVersion/Timestamp/Signature as query params (GET) or in body (POST). Signature = base64(HMAC-SHA256(secret, "METHOD\nHOST\n/path\ncanonical-qs")). */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoAccountSnapshot, CryptoBalance, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { createHmac } from "node:crypto";
import { phase1Gate, majorPairs } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp", "futures", "margin"], auth: ["hmac_sha256_header"],
  hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: false, hasTransfers: true,
  restBaseUrl: "https://api.huobi.pro", defaultReqPerMin: 600, correctsClockDrift: false,
};

export class HtxConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "htx", label: "HTX", capabilities: CAPS }); }
  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, headers }) => {
        const url = new URL("https://api.huobi.pro" + path);
        const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
        params.push(["AccessKeyId", creds.apiKey]);
        params.push(["SignatureMethod", "HmacSHA256"]);
        params.push(["SignatureVersion", "2"]);
        params.push(["Timestamp", new Date().toISOString().slice(0, 19)]);
        const qs = params.map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
        const toSign = method.toUpperCase() + "\napi.huobi.pro\n" + url.pathname + "\n" + qs;
        const sig = createHmac("sha256", creds.apiSecret).update(toSign).digest("base64");
        const newPath = url.pathname + "?" + qs + "&Signature=" + encodeURIComponent(sig);
        return { path: newPath };
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { spot } = majorPairs("usdt"); return spot.map((m) => ({ ...m, rawSymbol: m.rawSymbol.toLowerCase() }));
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const r = await sess.http.request<any>({ method: "GET", path: "/v1/account/accounts" });
    const accId = r.data?.data?.[0]?.id;
    const b = accId ? await sess.http.request<any>({ method: "GET", path: `/v1/account/accounts/${accId}/balance` }) : null;
    const balances: CryptoBalance[] = [];
    for (const bal of b?.data?.data?.list ?? []) {
      if (bal.type === "trade") {
        balances.push({ asset: bal.currency, free: Number(bal.balance), locked: 0, total: Number(bal.balance) });
      }
    }
    const filtered = balances.filter((x) => x.total > 0);
    return { accountId: sess.login, accountType: "spot", canTrade: true, canWithdraw: true, equityUsd: filtered.reduce((s, b) => s + (b.asset === "usdt" ? b.total : 0), 0), unrealizedPnlUsd: 0, balances: filtered, positions: [], openOrders: [] };
  }
  protected async placeOrder(_s: CryptoAccountSession, _r: CryptoOrderRequest): Promise<OrderResult> { return phase1Gate("htx"); }
  protected async modifyOrder(_s: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return phase1Gate("htx"); }
  protected async closePositionImpl(_s: CryptoAccountSession, _id: string, _v?: number): Promise<OrderResult> { return phase1Gate("htx"); }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const period = { M1: "1min", M5: "5min", M15: "15min", M30: "30min", H1: "60min", H4: "4hour", D1: "1day", W1: "1week", MN1: "1mon" }[tf] ?? "60min";
    const r = await sess.http.request<any[]>({ method: "GET", path: "/market/history/kline", query: { symbol: m.rawSymbol, period, size: String(Math.min(count, 2000)) }, skipAuth: true });
    return (r.data ?? []).reverse().map((k: any) => ({ symbol, timeframe: tf, time: new Date(k.id * 1000).toISOString(), open: k.open, high: k.high, low: k.low, close: k.close, volume: k.vol }));
  }
  protected async fetchRecentFills(): Promise<any[]> { return []; }
  protected authenticatePrivateWs(): void {}
}
