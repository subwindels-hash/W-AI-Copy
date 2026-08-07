/** Bitget connector (Spot + USDT-Futures + Coin-Futures). Auth: ACCESS-KEY/ACCESS-SIGN/ACCESS-TIMESTAMP/ACCESS-PASSPHRASE; SIGN=HMAC-SHA256(timestamp+method+path+body). */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle, CryptoPosition } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Hex } from "../signing.js";
import { phase1Gate, majorPairs, mapStatusStd } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp", "futures", "margin"], auth: ["hmac_sha256_header"],
  hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: true, hasTransfers: true,
  restBaseUrl: "https://api.bitget.com", publicWsUrl: "wss://ws.bitget.com/v2/ws/public", privateWsUrl: "wss://ws.bitget.com/v2/ws/private",
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class BitgetConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "bitget", label: "Bitget", capabilities: CAPS }); }
  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const ts = String(timestampMs);
        const sig = hmacSha256Hex(creds.apiSecret, ts + method.toUpperCase() + path + (body ?? ""));
        headers["ACCESS-KEY"] = creds.apiKey;
        headers["ACCESS-SIGN"] = sig;
        headers["ACCESS-TIMESTAMP"] = ts;
        headers["ACCESS-PASSPHRASE"] = creds.passphrase ?? "";
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { perp, spot } = majorPairs("USDT");
    return [...perp, ...spot];
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const balances: CryptoBalance[] = [];
    const positions: CryptoPosition[] = [];
    const openOrders: CryptoOrder[] = [];
    try {
      const r = await sess.http.request<any>({ method: "GET", path: "/api/v2/spot/account/assets" });
      for (const a of r.data?.data ?? []) {
        const total = Number(a.available) + Number(a.frozen);
        if (total > 0) balances.push({ asset: a.coin, free: Number(a.available), locked: Number(a.frozen), total });
      }
    } catch {}
    try {
      const p = await sess.http.request<any>({ method: "GET", path: "/api/v2/mix/position/all-position", query: { productType: "usdt-futures" } });
      for (const pos of p.data?.data ?? []) {
        if (Number(pos.total) === 0) continue;
        positions.push({
          symbol: pos.symbol.replace("USDT", "") + "/USDT:USDT", marketType: "perp",
          side: pos.holdSide === "long" ? "long" : "short", quantity: Math.abs(Number(pos.total)), entryPrice: Number(pos.openPriceAvg), markPrice: Number(pos.markPrice),
          unrealizedPnl: Number(pos.unrealizedPL), realizedPnl: 0, leverage: Number(pos.leverage), margin: Number(pos.marginSize) ?? 0,
          marginType: pos.marginMode === "cross" ? "cross" : "isolated", liquidationPrice: null, openedTime: new Date(Number(pos.cTime)).toISOString(), updatedTime: new Date(Number(pos.uTime)).toISOString(),
        });
      }
    } catch {}
    try {
      const oo = await sess.http.request<any>({ method: "GET", path: "/api/v2/mix/order/orders-pending", query: { productType: "usdt-futures" } });
      for (const o of oo.data?.data?.entrustedList ?? []) {
        openOrders.push({
          id: o.orderId, clientOrderId: o.clientOid, symbol: o.symbol.replace("USDT", "") + "/USDT:USDT", marketType: "perp",
          side: o.side === "buy" ? "buy" : "sell", type: o.orderType === "limit" ? "limit" : "market",
          price: Number(o.price) || null, quantity: Number(o.size), filledQuantity: Number(o.filledQty), remainingQuantity: Number(o.size) - Number(o.filledQty), avgFillPrice: Number(o.avgPrice) || null,
          status: mapStatusStd(o.status), timeInForce: "GTC", reduceOnly: !!o.reduceOnly, createdTime: new Date(Number(o.cTime)).toISOString(), updatedTime: new Date(Number(o.cTime)).toISOString(), fee: 0, feeCurrency: "USDT",
        });
      }
    } catch {}
    return { accountId: sess.login, accountType: "mixed", canTrade: true, canWithdraw: false, equityUsd: balances.reduce((s, b) => s + (b.asset === "USDT" || b.asset === "USDC" ? b.total : 0), 0), unrealizedPnlUsd: positions.reduce((s, p) => s + p.unrealizedPnl, 0), balances, positions, openOrders };
  }
  protected async placeOrder(_s: CryptoAccountSession, _r: CryptoOrderRequest): Promise<OrderResult> { return phase1Gate("bitget"); }
  protected async modifyOrder(_s: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return phase1Gate("bitget"); }
  protected async closePositionImpl(_s: CryptoAccountSession, _id: string, _v?: number): Promise<OrderResult> { return phase1Gate("bitget"); }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const granularity = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1H", H4: "4H", D1: "1D", W1: "1W", MN1: "1M" }[tf] ?? "1H";
    const productType = m.type === "spot" ? "spot" : "usdt-futures";
    const path = m.type === "spot" ? "/api/v2/spot/market/candles" : "/api/v2/mix/market/candles";
    const r = await sess.http.request<any>({ method: "GET", path, query: { symbol: m.rawSymbol, granularity, limit: String(Math.min(count, 200)), productType }, skipAuth: true });
    return (r.data?.data ?? []).map((k: any) => ({ symbol, timeframe: tf, time: new Date(Number(k[0])).toISOString(), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]), quoteVolume: Number(k[6]) }));
  }
  protected async fetchRecentFills(): Promise<CryptoFill[]> { return []; }
  protected authenticatePrivateWs(sess: CryptoAccountSession, send: (p: any) => void): void {
    const ts = Date.now();
    const sig = hmacSha256Hex(sess.creds.apiSecret, ts + "GET" + "/user/verify");
    send({ op: "login", args: [{ apiKey: sess.creds.apiKey, passphrase: sess.creds.passphrase ?? "", timestamp: String(ts), sign: sig }] });
  }
}
