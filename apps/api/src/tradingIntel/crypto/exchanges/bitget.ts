/**
 * Bitget connector (v2 API).
 * Auth: ACCESS-KEY, ACCESS-SIGN (HMAC-SHA256 of timestamp+method+path+body),
 * ACCESS-TIMESTAMP, ACCESS-PASSPHRASE.
 * Base: https://api.bitget.com.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Hex } from "../signing.js";
import { mkMarket, majorPairs, mapStatusStd } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp"],
  auth: ["hmac_sha256_header"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: true, hasTransfers: false,
  restBaseUrl: "https://api.bitget.com",
  testnetRestUrl: "https://api.bitget.com",
  publicWsUrl: "wss://ws.bitget.com/v2/ws/public",
  privateWsUrl: "wss://ws.bitget.com/v2/ws/private",
  publicWsPingIntervalMs: 25_000,
  privateWsPingIntervalMs: 25_000,
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class BitgetConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "bitget", label: "Bitget", capabilities: CAPS }); }

  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const ts = String(timestampMs);
        const payload = ts + method.toUpperCase() + path + (body ?? "");
        headers["ACCESS-KEY"] = creds.apiKey;
        headers["ACCESS-SIGN"] = hmacSha256Hex(creds.apiSecret, payload);
        headers["ACCESS-TIMESTAMP"] = ts;
        headers["ACCESS-PASSPHRASE"] = creds.passphrase ?? "";
        headers["content-type"] = "application/json";
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { perp, spot } = majorPairs("USDT");
    return [...perp, ...spot];
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const b = await sess.http.request<any>({ method: "GET", path: "/api/v2/spot/account/assets" }).catch(() => null);
    const balances: CryptoBalance[] = (b?.data?.data ?? []).map((x: any) => ({ asset: x.coin, free: Number(x.available), locked: Number(x.frozen), total: Number(x.available) + Number(x.frozen), usdValue: Number(x.usdtValue) || undefined })).filter((x: CryptoBalance) => x.total > 0);
    let positions: CryptoPosition[] = []; let openOrders: CryptoOrder[] = [];
    try {
      const p = await sess.http.request<any>({ method: "GET", path: "/api/v2/mix/position/all-position", query: { productType: "usdt-futures" } });
      positions = (p.data?.data ?? []).filter((x: any) => Number(x.total) !== 0).map((x: any) => ({
        symbol: `${x.symbol.replace("USDT","")}/USDT:USDT`, marketType: "perp",
        side: x.holdSide === "long" ? "long" : "short", quantity: Number(x.total),
        entryPrice: Number(x.openPriceAvg), markPrice: Number(x.markPrice),
        unrealizedPnl: Number(x.unrealizedPL), realizedPnl: 0, leverage: Number(x.leverage) || 1,
        margin: 0, marginType: x.marginMode === "cross" ? "cross" : "isolated", liquidationPrice: null,
        openedTime: new Date(Number(x.openTime)).toISOString(), updatedTime: new Date().toISOString(),
      }));
    } catch { /* */ }
    return { accountId: sess.login, accountType: "mix", canTrade: true, canWithdraw: false, equityUsd: balances.reduce((s, b) => s + (b.usdValue ?? 0), 0), unrealizedPnlUsd: 0, balances, positions, openOrders };
  }
  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const isPerp = m.type === "perp";
    const path = isPerp ? "/api/v2/mix/order/place-order" : "/api/v2/spot/trade/place-order";
    const body: Record<string, any> = { symbol: m.rawSymbol, side: req.side, orderType: req.type === "limit" ? "limit" : "market", clientOid: req.clientOrderId ?? this.genClientOrderId(sess) };
    if (isPerp) body.productType = "usdt-futures";
    if (isPerp) body.marginMode = "cross";
    if (req.type === "limit") { body.price = String(req.price); body.size = String(req.quantity); body.timeInForce = req.timeInForce ?? "GTC"; }
    else body.size = String(req.quantity);
    if (req.reduceOnly) body.reduceOnly = "yes";
    try {
      const r = await sess.http.request<any>({ method: "POST", path, body });
      if (r.data?.code && r.data.code !== "00000") return { ok: false, error: r.data.msg, retcode: Number(r.data.code) };
      return { ok: true, ticket: r.data?.data?.orderId, comment: body.clientOid };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async modifyOrder(_s: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return { ok: false, error: "bitget modify unsupported" }; }
  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const sym = orderIdOrSymbol.includes("/") ? orderIdOrSymbol : (sess.openOrders.get(orderIdOrSymbol)?.symbol ?? orderIdOrSymbol);
    const pos = sess.positions.get(sym); const m = sess.markets.get(sym);
    if (!m) return { ok: false, error: "not found" };
    const isPerp = m.type === "perp";
    if (isPerp && pos) {
      return this.placeOrder(sess, { symbol: sym, marketType: "perp", side: pos.side === "long" ? "sell" : "buy", type: "market", quantity: volume ?? pos.quantity, reduceOnly: true });
    }
    const bal = sess.balances.get(m.base);
    return this.placeOrder(sess, { symbol: sym, marketType: "spot", side: "sell", type: "market", quantity: volume ?? bal?.free ?? 0 });
  }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const granularity = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1H", H4: "4H", D1: "1D", W1: "1W", MN1: "1M" }[tf] ?? "1H";
    const path = m.type === "perp" ? "/api/v2/mix/market/candles" : "/api/v2/spot/market/candles";
    const q: any = { symbol: m.rawSymbol, granularity, limit: String(Math.min(count, 200)) };
    if (m.type === "perp") q.productType = "usdt-futures";
    const r = await sess.http.request<any>({ method: "GET", path, query: q, skipAuth: true });
    return (r.data?.data ?? []).map((k: any) => ({
      symbol, timeframe: tf, time: new Date(Number(k[0])).toISOString(),
      open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]),
    }));
  }
  protected async fetchRecentFills(_sess: CryptoAccountSession, _since?: string): Promise<CryptoFill[]> { return []; }
  protected authenticatePrivateWs(sess: CryptoAccountSession, send: (p: any) => void): void {
    const ts = Date.now();
    const sig = hmacSha256Hex(sess.creds.apiSecret, ts + "GET" + "/user/verify");
    send({ op: "login", args: [{ apiKey: sess.creds.apiKey, passphrase: sess.creds.passphrase ?? "", timestamp: String(ts), sign: sig }] });
  }
  protected publicPingMessage(): string { return "ping"; }
  protected privatePingMessage(): string { return "ping"; }
}
