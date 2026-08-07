/**
 * Crypto.com Exchange connector (v2).
 * Auth: api-key header, api-signature in body/params = HMAC-SHA256(secret, id+method+apiKey+paramsHash+nonce).
 * Base: https://api.crypto.com.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Hex } from "../signing.js";
import { majorPairs } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp", "margin", "options"],
  auth: ["hmac_sha256_body"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: false, hasTransfers: true,
  restBaseUrl: "https://api.crypto.com",
  publicWsUrl: "wss://stream.crypto.com/exchange/v1/market",
  privateWsUrl: "wss://stream.crypto.com/exchange/v1/user",
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class CryptocomConnector extends BaseCryptoConnector {
  private nextId = 1;
  constructor() { super({ exchange: "cryptocom", label: "Crypto.com Exchange", capabilities: CAPS }); }

  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const id = this.nextId++;
        // Crypto.com uses JSON-RPC-style payloads for POST; for GET we sign query.
        headers["api-key"] = creds.apiKey;
        if (method === "GET") {
          const nonce = String(timestampMs);
          const params = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
          const sig = hmacSha256Hex(creds.apiSecret, String(id) + method.toUpperCase() + path + params + nonce);
          const url = path + (path.includes("?") ? "&" : "?") + `api_key=${encodeURIComponent(creds.apiKey)}&sig=${sig}&nonce=${nonce}`;
          return { path: url };
        } else {
          const nonce = String(timestampMs);
          let paramsStr = "";
          try {
            if (body) {
              const parsed = JSON.parse(body);
              paramsStr = JSON.stringify(parsed.params ?? {});
              parsed.api_key = creds.apiKey;
              parsed.sig = hmacSha256Hex(creds.apiSecret, String(id) + parsed.method + creds.apiKey + paramsStr + nonce);
              parsed.nonce = Number(nonce);
              headers["content-type"] = "application/json";
              return { body: JSON.stringify(parsed) };
            }
          } catch { /* not JSON */ }
          return {};
        }
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { perp, spot } = majorPairs("_USDT");
    // Crypto.com uses BTC_USDT; adjust.
    return perp.map((m) => ({ ...m, rawSymbol: m.rawSymbol.replace("USDT", "_USDT") }))
      .concat(spot.map((m) => ({ ...m, rawSymbol: m.rawSymbol.replace("USDT", "_USDT") })));
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const r = await sess.http.request<any>({ method: "POST", path: "/v2/private/get-account-summary", body: { id: this.nextId++, method: "private/get-account-summary", params: {}, nonce: Date.now() } });
    const coins = r.data?.result?.accounts ?? [];
    const balances: CryptoBalance[] = coins.map((c: any) => ({ asset: c.currency, free: Number(c.available), locked: Number(c.order), total: Number(c.balance) })).filter((b: CryptoBalance) => b.total > 0);
    return { accountId: sess.login, accountType: "spot", canTrade: true, canWithdraw: true, equityUsd: balances.reduce((s, b) => s + (b.asset === "USDT" || b.asset === "USDC" ? b.total : 0), 0), unrealizedPnlUsd: 0, balances, positions: [], openOrders: [] };
  }
  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const id = this.nextId++;
    const body: any = { id, method: "private/create-order", params: { instrument_name: m.rawSymbol, side: req.side.toUpperCase(), type: req.type === "limit" ? "LIMIT" : "MARKET", quantity: String(req.quantity), client_oid: req.clientOrderId ?? this.genClientOrderId(sess) } };
    if (req.type === "limit") body.params.price = String(req.price);
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/v2/private/create-order", body });
      const d = r.data?.result;
      if (r.data?.code !== 0) return { ok: false, error: r.data?.message ?? "rejected", retcode: r.data?.code };
      return { ok: true, ticket: d?.order_id, comment: body.params.client_oid };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async modifyOrder(_sess: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return { ok: false, error: "cryptocom modify not certified" }; }
  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const sym = orderIdOrSymbol.includes("/") ? orderIdOrSymbol : (sess.openOrders.get(orderIdOrSymbol)?.symbol ?? orderIdOrSymbol);
    const m = sess.markets.get(sym); if (!m) return { ok: false, error: "not found" };
    const bal = sess.balances.get(m.base);
    const qty = volume ?? bal?.free ?? 0;
    if (qty <= 0) return { ok: false, error: "no balance" };
    return this.placeOrder(sess, { symbol: sym, marketType: "spot", side: "sell", type: "market", quantity: qty });
  }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const timeframe = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1D", W1: "1W", MN1: "1M" }[tf] ?? "1h";
    const r = await sess.http.request<any>({ method: "GET", path: "/v2/public/get-candlestick", query: { instrument_name: m.rawSymbol, timeframe }, skipAuth: true });
    return (r.data?.result?.data ?? []).slice(-count).map((k: any) => ({ symbol, timeframe: tf, time: new Date(k.t).toISOString(), open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v) }));
  }
  protected async fetchRecentFills(_sess: CryptoAccountSession, _since?: string): Promise<CryptoFill[]> { return []; }
  protected authenticatePrivateWs(sess: CryptoAccountSession, send: (p: any) => void): void {
    const id = this.nextId++; const nonce = Date.now();
    const sig = hmacSha256Hex(sess.creds.apiSecret, String(id) + "public/auth" + sess.creds.apiKey + "" + nonce);
    send({ id, method: "public/auth", params: { api_key: sess.creds.apiKey, sig, nonce } });
  }
}
