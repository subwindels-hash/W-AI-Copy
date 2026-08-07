/**
 * Bybit connector (Unified Trading Account — spot, linear/inverse perp, options).
 * Auth: HMAC-SHA256 of `timestamp+apiKey+recvWindow+(query|body)` with
 * `X-BAPI-SIGN` header. Base: https://api.bybit.com.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Hex } from "../signing.js";
import { mkMarket, phase1Gate, majorPairs, mapStatusStd } from "./common.js";
export { mkMarket }; // re-export for tests

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp", "futures", "options"],
  auth: ["hmac_sha256_header"],
  hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: true, hasTransfers: false,
  restBaseUrl: "https://api.bybit.com",
  testnetRestUrl: "https://api-testnet.bybit.com",
  publicWsUrl: "wss://stream.bybit.com/v5/public/linear",
  privateWsUrl: "wss://stream.bybit.com/v5/private",
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class BybitConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "bybit", label: "Bybit", capabilities: CAPS }); }
  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    const recvWindow = "5000";
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const ts = String(timestampMs);
        let payload = ts + creds.apiKey + recvWindow;
        if (method === "GET") {
          const q = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
          payload += q;
        } else {
          payload += body ?? "";
        }
        headers["X-BAPI-API-KEY"] = creds.apiKey;
        headers["X-BAPI-TIMESTAMP"] = ts;
        headers["X-BAPI-RECV-WINDOW"] = recvWindow;
        headers["X-BAPI-SIGN"] = hmacSha256Hex(creds.apiSecret, payload);
      },
    };
  }
  protected async fetchMarkets(_sess: CryptoAccountSession): Promise<CryptoMarket[]> {
    const { perp, spot } = majorPairs("USDT");
    return [...perp, ...spot];
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const w = await sess.http.request<any>({ method: "GET", path: "/v5/account/wallet-balance", query: { accountType: "UNIFIED" } });
    const coins = w.data?.result?.list?.[0]?.coin ?? [];
    const balances: CryptoBalance[] = coins
      .map((c: any) => ({ asset: c.coin, free: Number(c.availableToWithdraw), locked: 0, total: Number(c.walletBalance), usdValue: Number(c.usdValue) }))
      .filter((b: CryptoBalance) => b.total > 0);
    let positions: CryptoPosition[] = [];
    let openOrders: CryptoOrder[] = [];
    try {
      const pos = await sess.http.request<any>({ method: "GET", path: "/v5/position/list", query: { category: "linear", limit: 50 } });
      positions = (pos.data?.result?.list ?? [])
        .filter((p: any) => Number(p.size) !== 0)
        .map((p: any) => ({
          symbol: symToUnified(p.symbol), marketType: "perp",
          side: p.side === "Buy" ? "long" : p.side === "Sell" ? "short" : (Number(p.size) > 0 ? "long" : "short"),
          quantity: Math.abs(Number(p.size)), entryPrice: Number(p.avgPrice), markPrice: Number(p.markPrice),
          unrealizedPnl: Number(p.unrealisedPnl), realizedPnl: Number(p.curRealisedPnl), leverage: Number(p.leverage),
          margin: 0, marginType: p.tradeMode === 1 ? "cross" : "isolated", liquidationPrice: Number(p.liqPrice) || null,
          openedTime: new Date(Number(p.createdTime)).toISOString(), updatedTime: new Date(Number(p.updatedTime)).toISOString(),
        }));
      const oo = await sess.http.request<any>({ method: "GET", path: "/v5/order/realtime", query: { category: "linear", limit: 50 } });
      openOrders = (oo.data?.result?.list ?? []).map((o: any) => ({
        id: o.orderId, clientOrderId: o.orderLinkId, symbol: symToUnified(o.symbol), marketType: "perp",
        side: o.side.toLowerCase() === "buy" ? "buy" : "sell",
        type: o.orderType.toLowerCase() === "limit" ? "limit" : "market",
        price: Number(o.price) || null, quantity: Number(o.qty), filledQuantity: Number(o.cumExecQty),
        remainingQuantity: Number(o.qty) - Number(o.cumExecQty), avgFillPrice: Number(o.avgPrice) || null,
        status: mapStatusStd(o.orderStatus), timeInForce: o.timeInForce ?? "GTC",
        reduceOnly: !!o.reduceOnly, createdTime: new Date(Number(o.createdTime)).toISOString(),
        updatedTime: new Date(Number(o.updatedTime)).toISOString(), fee: 0, feeCurrency: "USDT",
      }));
    } catch { /* futures not enabled for key */ }
    return {
      accountId: sess.login, accountType: "unified", canTrade: true, canWithdraw: false,
      equityUsd: balances.reduce((s, b) => s + (b.usdValue ?? 0), 0),
      unrealizedPnlUsd: positions.reduce((s, p) => s + p.unrealizedPnl, 0),
      balances, positions, openOrders,
    };
  }
  protected async placeOrder(_s: CryptoAccountSession, _r: CryptoOrderRequest): Promise<OrderResult> { return phase1Gate("bybit"); }
  protected async modifyOrder(_s: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return phase1Gate("bybit"); }
  protected async closePositionImpl(_s: CryptoAccountSession, _id: string, _v?: number): Promise<OrderResult> { return phase1Gate("bybit"); }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const cat = m.type === "spot" ? "spot" : "linear";
    const r = await sess.http.request<any>({ method: "GET", path: "/v5/market/kline", query: { category: cat, symbol: m.rawSymbol, interval: tfToBybit(tf), limit: Math.min(count, 200) }, skipAuth: true });
    return (r.data?.result?.list ?? []).reverse().map((k: any) => ({
      symbol, timeframe: tf, time: new Date(Number(k[0])).toISOString(),
      open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]),
      volume: Number(k[5]), quoteVolume: Number(k[6]),
    }));
  }
  protected async fetchRecentFills(sess: CryptoAccountSession, since?: string): Promise<CryptoFill[]> {
    try {
      const r = await sess.http.request<any>({ method: "GET", path: "/v5/execution/list", query: { category: "linear", limit: 50 } });
      const out: CryptoFill[] = (r.data?.result?.list ?? []).map((t: any) => ({
        id: t.execId, orderId: t.orderId, symbol: symToUnified(t.symbol), marketType: "perp",
        side: t.side.toLowerCase() === "buy" ? "buy" : "sell", price: Number(t.execPrice), quantity: Number(t.execQty),
        fee: Number(t.execFee), feeCurrency: t.feeCurrency ?? "USDT", realizedPnl: Number(t.closedPnl) || 0,
        time: new Date(Number(t.execTime)).toISOString(), isMaker: !t.isMaker, tradeId: t.execId,
      }));
      if (since) return out.filter((f) => f.time >= since);
      return out;
    } catch { return []; }
  }
  protected authenticatePrivateWs(sess: CryptoAccountSession, send: (p: any) => void): void {
    const expires = Date.now() + 10_000;
    const sig = hmacSha256Hex(sess.creds.apiSecret, "GET/realtime" + expires);
    send({ op: "auth", args: [sess.creds.apiKey, expires, sig] });
  }
}

function symToUnified(raw: string): string {
  if (raw.endsWith("USDT")) return raw.replace(/USDT$/, "") + "/USDT:USDT";
  return raw;
}
function tfToBybit(tf: string): string {
  const m: Record<string, string> = { M1: "1", M5: "5", M15: "15", M30: "30", H1: "60", H4: "240", D1: "D", W1: "W", MN1: "M" };
  return m[tf] ?? "60";
}
