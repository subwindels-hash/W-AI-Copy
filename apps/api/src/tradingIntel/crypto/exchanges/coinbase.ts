/**
 * Coinbase Advanced Trade connector.
 * Auth: API key name as CB-ACCESS-KEY, HMAC-SHA256(timestamp+method+path+body)
 * as CB-ACCESS-SIGN, CB-ACCESS-TIMESTAMP (unix seconds), CB-ACCESS-PASSPHRASE.
 * Base: https://api.coinbase.com (no testnet for Advanced).
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle, CryptoPosition } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Hex } from "../signing.js";
import { notCertified, majorPairs, mapStatusStd } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp", "futures"],
  auth: ["hmac_sha256_header"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: false, hasTransfers: true,
  restBaseUrl: "https://api.coinbase.com",
  testnetRestUrl: "https://api.coinbase.com",
  publicWsUrl: "wss://advanced-trade-ws.coinbase.com",
  privateWsUrl: "wss://advanced-trade-ws.coinbase.com",
  publicWsPingIntervalMs: 25_000,
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class CoinbaseConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "coinbase", label: "Coinbase Advanced", capabilities: CAPS }); }
  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const ts = String(timestampMs).slice(0, 10);
        const sig = hmacSha256Hex(creds.apiSecret, ts + method.toUpperCase() + path + (body ?? ""));
        headers["CB-ACCESS-KEY"] = creds.apiKey;
        headers["CB-ACCESS-SIGN"] = sig;
        headers["CB-ACCESS-TIMESTAMP"] = ts;
        headers["CB-ACCESS-PASSPHRASE"] = creds.passphrase ?? "";
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { spot } = majorPairs("-USD");
    return spot.map((m) => ({ ...m, symbol: m.symbol.replace("/", "-") }));
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const r = await sess.http.request<any>({ method: "GET", path: "/api/v3/brokerage/accounts", query: { limit: "100" } });
    const balances: CryptoBalance[] = (r.data?.accounts ?? [])
      .map((a: any) => ({ asset: a.currency, free: Number(a.available_balance?.value ?? 0), locked: Number(a.hold?.value ?? 0), total: Number(a.available_balance?.value ?? 0) + Number(a.hold?.value ?? 0) }))
      .filter((b: CryptoBalance) => b.total > 0);
    // Coinbase Advanced uses separate orders/fills endpoints; positions list is empty for spot.
    const positions: CryptoPosition[] = [];
    const ordersResp = await sess.http.request<any>({ method: "GET", path: "/api/v3/brokerage/orders/historical/batch", query: { order_status: "OPEN", limit: "50" } }).catch(() => null);
    const openOrders: CryptoOrder[] = (ordersResp?.data?.orders ?? []).map((o: any) => ({
      id: o.order_id, clientOrderId: o.client_order_id,
      symbol: o.product_id.replace("-", "/"), marketType: "spot",
      side: o.side.toLowerCase() === "buy" ? "buy" : "sell",
      type: o.order_type === "LIMIT" ? "limit" : "market",
      price: Number(o.limit_price) || null, quantity: Number(o.base_size), filledQuantity: Number(o.filled_size),
      remainingQuantity: Number(o.base_size) - Number(o.filled_size), avgFillPrice: Number(o.average_filled_price) || null,
      status: mapStatusStd(o.status), timeInForce: o.time_in_force ?? "GTC", reduceOnly: false,
      createdTime: o.created_time, updatedTime: o.created_time, fee: 0, feeCurrency: "USD",
    }));
    return { accountId: sess.login, accountType: "advanced", canTrade: true, canWithdraw: true, equityUsd: balances.reduce((s, b) => s + (b.asset === "USD" || b.asset === "USDC" ? b.total : 0), 0), unrealizedPnlUsd: 0, balances, positions, openOrders };
  }
  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const clientId = req.clientOrderId ?? this.genClientOrderId(sess);
    const body: Record<string, any> = {
      client_order_id: clientId, product_id: m.rawSymbol, side: req.side.toUpperCase(),
      order_configuration: {},
    };
    if (req.type === "market") {
      body.order_configuration.market_market_ioc = { quote_size: String((req.quantity * (req.price ?? 0)).toFixed(2)), base_size: String(req.quantity) };
    } else if (req.type === "limit") {
      body.order_configuration.limit_limit_gtc = { base_size: String(req.quantity), limit_price: String(req.price), post_only: !!req.postOnly };
    } else {
      return notCertified("coinbase:stop-orders");
    }
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/api/v3/brokerage/orders", body });
      if (!r.data?.success) return { ok: false, error: r.data?.error_response?.message || "order rejected", retcode: -1 };
      const res = r.data.success_response || r.data;
      return { ok: true, ticket: res.order_id ?? clientId, comment: clientId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async modifyOrder(_s: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return notCertified("coinbase:modify"); }
  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const sym = orderIdOrSymbol.includes("/") || orderIdOrSymbol.includes("-") ? orderIdOrSymbol.replace("-", "/") : (sess.openOrders.get(orderIdOrSymbol)?.symbol);
    if (!sym) return { ok: false, error: "not found" };
    const m = sess.markets.get(sym); if (!m) return { ok: false, error: "market not found" };
    const pos = sess.positions.get(sym);
    const bal = sess.balances.get(m.base);
    const qty = volume ?? pos?.quantity ?? bal?.free;
    if (!qty || qty <= 0) return { ok: false, error: "no size" };
    return this.placeOrder(sess, { symbol: sym, marketType: "spot", side: "sell", type: "market", quantity: qty });
  }
  protected publicPingMessage(): string { return JSON.stringify({ type: "heartbeat" }); }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const productId = m.rawSymbol;
    const gran = { M1: "ONE_MINUTE", M5: "FIVE_MINUTE", M15: "FIFTEEN_MINUTE", M30: "THIRTY_MINUTE", H1: "ONE_HOUR", H4: "FOUR_HOUR", D1: "ONE_DAY", W1: "TWO_HOUR", MN1: "ONE_DAY" }[tf] ?? "ONE_HOUR";
    const end = Math.floor(Date.now() / 1000);
    const start = end - count * 3600;
    const r = await sess.http.request<any>({ method: "GET", path: "/api/v3/brokerage/products/" + productId + "/candles", query: { start: String(start), end: String(end), granularity: gran }, skipAuth: true });
    return (r.data?.candles ?? []).reverse().map((k: any) => ({
      symbol, timeframe: tf, time: new Date(Number(k.start) * 1000).toISOString(),
      open: Number(k.open), high: Number(k.high), low: Number(k.low), close: Number(k.close), volume: Number(k.volume),
    }));
  }
  protected async fetchRecentFills(sess: CryptoAccountSession, since?: string): Promise<CryptoFill[]> {
    try {
      const r = await sess.http.request<any>({ method: "GET", path: "/api/v3/brokerage/orders/historical/fills", query: { limit: "50" } });
      const out: CryptoFill[] = (r.data?.fills ?? []).map((f: any) => ({
        id: f.fill_id, orderId: f.order_id, symbol: f.product_id.replace("-", "/"), marketType: "spot",
        side: f.side.toLowerCase() === "buy" ? "buy" : "sell", price: Number(f.price), quantity: Number(f.size),
        fee: Number(f.fee), feeCurrency: "USD", time: f.trade_time, isMaker: f.liquidity === "MAKER", tradeId: f.trade_id,
      }));
      if (since) return out.filter((x) => x.time >= since);
      return out;
    } catch { return []; }
  }
  protected authenticatePrivateWs(): void { /* Coinbase uses channel-level auth per message; Phase 2 */ }
}
