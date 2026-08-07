/**
 * Gate.io v4 connector.
 * Auth: KEY / SIGN (HMAC-SHA512 hex of method + "\n" + path + "\n" + queryHash + "\n" + timestamp),
 * signed headers KEY, SIGN, Timestamp. Body is hashed as SHA512 hex for POST.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha512Hex, sha512Hex } from "../signing.js";
import { majorPairs } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp", "options"],
  auth: ["hmac_sha512_header"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: true, hasTransfers: true,
  restBaseUrl: "https://api.gateio.ws/api/v4",
  publicWsUrl: "wss://api.gateio.ws/ws/v4/",
  privateWsUrl: "wss://api.gateio.ws/ws/v4/",
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class GateioConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "gateio", label: "Gate.io", capabilities: CAPS }); }
  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const ts = String(Math.floor(timestampMs / 1000));
        const bodyHash = body ? sha512Hex(body) : "";
        const sig = hmacSha512Hex(creds.apiSecret, `${method.toUpperCase()}\n${path}\n\n${bodyHash}\n${ts}`);
        headers["KEY"] = creds.apiKey;
        headers["SIGN"] = sig;
        headers["Timestamp"] = ts;
        headers["content-type"] = "application/json";
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { perp, spot } = majorPairs("USDT"); return [...perp, ...spot];
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const r = await sess.http.request<any>({ method: "GET", path: "/spot/accounts" }).catch(() => null);
    const balances: CryptoBalance[] = (r?.data ?? []).map((a: any) => ({ asset: a.currency, free: Number(a.available), locked: Number(a.locked), total: Number(a.available) + Number(a.locked) })).filter((x: CryptoBalance) => x.total > 0);
    return { accountId: sess.login, accountType: "spot", canTrade: true, canWithdraw: true, equityUsd: balances.reduce((s, b) => s + (b.asset === "USDT" || b.asset === "USDC" ? b.total : 0), 0), unrealizedPnlUsd: 0, balances, positions: [], openOrders: [] };
  }
  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const body: Record<string, any> = { currency_pair: m.rawSymbol, side: req.side, amount: String(req.quantity) };
    if (m.type === "spot") {
      if (req.type === "limit") { body.type = "limit"; body.price = String(req.price); body.time_in_force = "gtc"; }
      else body.type = "market";
      if (req.reduceOnly) Object.assign(body, { auto_borrow: false });
    } else {
      if (req.type === "limit") { body.type = "limit"; body.price = String(req.price); } else body.type = "market";
      body.contract = m.rawSymbol;
      if (req.reduceOnly) body.reduce_only = true;
    }
    try {
      const path = m.type === "perp" ? "/futures/usdt/orders" : "/spot/orders";
      if (m.type === "perp") { delete body.currency_pair; }
      const r = await sess.http.request<any>({ method: "POST", path, body });
      if (r.data?.status === "open" || r.data?.id || r.data?.order_id) return { ok: true, ticket: String(r.data.id ?? r.data.order_id), comment: r.data.text };
      return { ok: false, error: r.data?.message ?? "rejected" };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async modifyOrder(_sess: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return { ok: false, error: "gateio modify not yet certified" }; }
  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const sym = orderIdOrSymbol.includes("/") ? orderIdOrSymbol : (sess.openOrders.get(orderIdOrSymbol)?.symbol ?? orderIdOrSymbol);
    const m = sess.markets.get(sym); if (!m) return { ok: false, error: "market not found" };
    const pos = sess.positions.get(sym); const bal = sess.balances.get(m.base);
    if (m.type === "perp" && pos) {
      return this.placeOrder(sess, { symbol: sym, marketType: "perp", side: pos.side === "long" ? "sell" : "buy", type: "market", quantity: volume ?? pos.quantity, reduceOnly: true });
    }
    return this.placeOrder(sess, { symbol: sym, marketType: "spot", side: "sell", type: "market", quantity: volume ?? bal?.free ?? 0 });
  }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const interval = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1d", W1: "1w", MN1: "30d" }[tf] ?? "1h";
    const path = m.type === "perp" ? "/futures/usdt/candlesticks" : "/spot/candlesticks";
    const q: any = { limit: String(Math.min(count, 1000)), interval };
    if (m.type === "perp") q.contract = m.rawSymbol; else q.currency_pair = m.rawSymbol;
    const r = await sess.http.request<any[]>({ method: "GET", path, query: q, skipAuth: true });
    return (r.data ?? []).map((k: any) => ({ symbol, timeframe: tf, time: new Date(Number(k.t) * 1000).toISOString(), open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v) }));
  }
  protected async fetchRecentFills(_sess: CryptoAccountSession, _since?: string): Promise<CryptoFill[]> { return []; }
  protected authenticatePrivateWs(_sess: CryptoAccountSession, _send: (p: any) => void): void { /* Gate WS auth is per-channel subscription via signed "auth" channel; deferred */ }
}
