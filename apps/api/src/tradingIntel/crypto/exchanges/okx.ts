/**
 * OKX connector (Unified account — spot, margin, swap, futures, options).
 * Auth: HMAC-SHA256 over `timestamp + method + path + body` with headers
 * OK-ACCESS-KEY / OK-ACCESS-SIGN / OK-ACCESS-TIMESTAMP / OK-ACCESS-PASSPHRASE.
 * Base: https://www.okx.com (simulated trading: https://www.okx.com with x-simulated-trading=1).
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Base64 } from "../signing.js";
import { notCertified, majorPairs, mapStatusStd } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "margin", "perp", "futures", "options"],
  auth: ["hmac_sha256_header"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: true, hasTransfers: false,
  restBaseUrl: "https://www.okx.com",
  testnetRestUrl: "https://www.okx.com",
  publicWsUrl: "wss://ws.okx.com:8443/ws/v5/public",
  privateWsUrl: "wss://ws.okx.com:8443/ws/v5/private",
  publicWsPingIntervalMs: 20_000,
  privateWsPingIntervalMs: 20_000,
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class OkxConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "okx", label: "OKX", capabilities: CAPS }); }
  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const ts = new Date(timestampMs).toISOString();
        const payload = ts + method.toUpperCase() + path + (body ?? "");
        headers["OK-ACCESS-KEY"] = creds.apiKey;
        headers["OK-ACCESS-SIGN"] = hmacSha256Base64(creds.apiSecret, payload);
        headers["OK-ACCESS-TIMESTAMP"] = ts;
        headers["OK-ACCESS-PASSPHRASE"] = creds.passphrase ?? "";
        if (creds.subAccount) headers["OK-ACCESS-SUBACCOUNT"] = creds.subAccount;
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { perp, spot } = majorPairs("-USDT");
    // OKX uses BTC-USDT (spot) / BTC-USDT-SWAP (perp)
    return perp.map((m) => ({ ...m, symbol: m.symbol.replace("/", "-").replace(":USDT", "") + "-SWAP", rawSymbol: m.rawSymbol.replace("USDT", "-USDT-SWAP"), settle: "USDT" }))
      .concat(spot.map((m) => ({ ...m, symbol: m.symbol.replace("/", "-"), rawSymbol: m.rawSymbol.replace("USDT", "-USDT") })));
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const balances: CryptoBalance[] = [];
    const positions: CryptoPosition[] = [];
    const openOrders: CryptoOrder[] = [];
    try {
      const bal = await sess.http.request<any>({ method: "GET", path: "/api/v5/account/balance" });
      for (const acc of bal.data?.data ?? []) {
        for (const d of acc.details ?? []) {
          const total = Number(d.cashBal) + Number(d.frozenBal);
          if (total > 0) balances.push({ asset: d.ccy, free: Number(d.availBal) ?? total - Number(d.frozenBal), locked: Number(d.frozenBal), total, usdValue: Number(d.eqUsd) || undefined });
        }
      }
    } catch { /* */ }
    try {
      const pos = await sess.http.request<any>({ method: "GET", path: "/api/v5/account/positions" });
      for (const p of pos.data?.data ?? []) {
        if (Number(p.pos) === 0) continue;
        positions.push({
          symbol: p.instId.replace("-SWAP", "").replace("-USDT", "") + "/USDT:USDT", marketType: "perp",
          side: Number(p.pos) > 0 ? "long" : "short", quantity: Math.abs(Number(p.pos)), entryPrice: Number(p.avgPx), markPrice: Number(p.markPx),
          unrealizedPnl: Number(p.upl), realizedPnl: Number(p.realizedPnl), leverage: Number(p.lever), margin: Number(p.margin) ?? 0, marginType: p.mgnMode === "cross" ? "cross" : "isolated", liquidationPrice: Number(p.liqPx) || null,
          openedTime: new Date(Number(p.cTime)).toISOString(), updatedTime: new Date(Number(p.uTime)).toISOString(),
        });
      }
      const oo = await sess.http.request<any>({ method: "GET", path: "/api/v5/trade/orders-pending" });
      for (const o of oo.data?.data ?? []) {
        openOrders.push({
          id: o.ordId, clientOrderId: o.clOrdId, symbol: o.instId.replace("-SWAP", "").replace("-USDT", "") + "/USDT:USDT", marketType: "perp",
          side: o.side.toLowerCase() === "buy" ? "buy" : "sell", type: o.ordType.toLowerCase() === "limit" ? "limit" : "market",
          price: Number(o.px) || null, quantity: Number(o.sz), filledQuantity: Number(o.accFillSz), remainingQuantity: Number(o.sz) - Number(o.accFillSz), avgFillPrice: Number(o.avgPx) || null,
          status: mapStatusStd(o.state), timeInForce: "GTC", reduceOnly: o.reduceOnly === "true",
          createdTime: new Date(Number(o.cTime)).toISOString(), updatedTime: new Date(Number(o.uTime)).toISOString(), fee: 0, feeCurrency: "USDT",
        });
      }
    } catch { /* */ }
    const equityUsd = balances.reduce((s, b) => s + (b.usdValue ?? 0), 0);
    return { accountId: sess.login, accountType: "unified", canTrade: true, canWithdraw: false, equityUsd, unrealizedPnlUsd: positions.reduce((s, p) => s + p.unrealizedPnl, 0), balances, positions, openOrders };
  }
  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const instId = m.rawSymbol;
    const tdMode = m.type === "spot" ? "cash" : "cross";
    const side = req.side === "buy" ? "buy" : "sell";
    const ordType = mapOkxOrdType(req.type);
    const body: Record<string, any> = {
      instId, tdMode, side, ordType, sz: String(req.quantity),
      clOrdId: req.clientOrderId ?? this.genClientOrderId(sess),
    };
    if (req.price && (ordType === "limit" || ordType === "post_only")) body.px = String(req.price);
    if (req.reduceOnly) body.reduceOnly = true;
    if (req.takeProfit?.price) { body.tpTriggerPx = String(req.takeProfit.price); body.tpOrdPx = "-1"; }
    if (req.stopLoss?.price) { body.slTriggerPx = String(req.stopLoss.price); body.slOrdPx = "-1"; }
    if (req.postOnly || ordType === "post_only") { body.ordType = "post_only"; }
    if (req.timeInForce === "IOC" || req.timeInForce === "FOK") body.tgtCcy = undefined;
    // Simulated trading for demo environment.
    if (sess.environment !== "live") { /* OKX simulated uses x-simulated-trading header */ }
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/api/v5/trade/order", body, headers: sess.environment !== "live" ? { "x-simulated-trading": "1" } : undefined });
      const d = r.data?.data?.[0];
      if (!d || d.sCode !== "0") return { ok: false, retcode: Number(d?.sCode) || -1, error: d?.sMsg || "order rejected" };
      return { ok: true, ticket: d.ordId, comment: d.clOrdId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async modifyOrder(sess: CryptoAccountSession, orderId: string, patch: { sl?: number; tp?: number; comment?: string }): Promise<OrderResult> {
    const o = sess.openOrders.get(orderId); if (!o) return { ok: false, error: "not found" };
    const m = sess.markets.get(o.symbol); if (!m) return { ok: false, error: "market not found" };
    const body: any = { instId: m.rawSymbol, ordId: orderId };
    if (patch.sl) { body.slTriggerPx = String(patch.sl); body.slOrdPx = "-1"; }
    if (patch.tp) { body.tpTriggerPx = String(patch.tp); body.tpOrdPx = "-1"; }
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/api/v5/trade/amend-order", body });
      const d = r.data?.data?.[0];
      if (!d || d.sCode !== "0") return { ok: false, retcode: Number(d?.sCode), error: d?.sMsg || "amend failed" };
      return { ok: true, ticket: orderId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const sym = orderIdOrSymbol.includes("/") ? orderIdOrSymbol : (sess.openOrders.get(orderIdOrSymbol)?.symbol ?? orderIdOrSymbol);
    const pos = sess.positions.get(sym); const m = sess.markets.get(sym);
    if (!m || (!pos && m.type !== "spot")) return { ok: false, error: "no position" };
    const side = pos ? (pos.side === "long" ? "sell" : "buy") : "sell";
    const sz = volume ?? pos?.quantity ?? sess.balances.get(m.base)?.free;
    if (!sz || sz <= 0) return { ok: false, error: "no size to close" };
    const body: Record<string, any> = { instId: m.rawSymbol, tdMode: m.type === "spot" ? "cash" : "cross", side, ordType: "market", sz: String(sz), reduceOnly: m.type !== "spot", clOrdId: this.genClientOrderId(sess) };
    if (m.type === "spot") delete body.reduceOnly;
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/api/v5/trade/order", body });
      const d = r.data?.data?.[0];
      if (!d || d.sCode !== "0") return { ok: false, retcode: Number(d?.sCode), error: d?.sMsg || "close failed" };
      return { ok: true, ticket: d.ordId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected async cancelOrderImpl(sess: CryptoAccountSession, orderId: string): Promise<OrderResult> {
    const o = sess.openOrders.get(orderId); if (!o) return { ok: false, error: "not found" };
    const m = sess.markets.get(o.symbol); if (!m) return { ok: false, error: "market not found" };
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/api/v5/trade/cancel-order", body: { instId: m.rawSymbol, ordId: orderId } });
      const d = r.data?.data?.[0];
      if (!d || d.sCode !== "0") return { ok: false, error: d?.sMsg };
      return { ok: true, ticket: orderId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  protected publicPingMessage(): string { return "ping"; }
  protected privatePingMessage(): string { return "ping"; }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const instId = m.rawSymbol;
    const bar = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1H", H4: "4H", D1: "1D", W1: "1W", MN1: "1M" }[tf] ?? "1H";
    const r = await sess.http.request<any>({ method: "GET", path: m.type === "spot" ? "/api/v5/market/candles" : "/api/v5/market/mark-price-candles", query: { instId, bar, limit: String(Math.min(count, 300)) }, skipAuth: true });
    return (r.data?.data ?? []).reverse().map((k: any) => ({
      symbol, timeframe: tf, time: new Date(Number(k[0])).toISOString(),
      open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]), quoteVolume: Number(k[6]),
    }));
  }
  protected async fetchRecentFills(sess: CryptoAccountSession, since?: string): Promise<CryptoFill[]> {
    try {
      const r = await sess.http.request<any>({ method: "GET", path: "/api/v5/trade/fills", query: { limit: "50" } });
      const out: CryptoFill[] = (r.data?.data ?? []).map((t: any) => ({
        id: t.tradeId, orderId: t.ordId, symbol: t.instId.replace("-SWAP", "").replace("-USDT", "") + "/USDT:USDT", marketType: "perp",
        side: t.side.toLowerCase() === "buy" ? "buy" : "sell", price: Number(t.px), quantity: Number(t.sz), fee: Number(t.fee), feeCurrency: t.feeCcy,
        realizedPnl: Number(t.fillPnlForCloseOrd || 0), time: new Date(Number(t.ts)).toISOString(), isMaker: t.execType === "M", tradeId: t.tradeId,
      }));
      if (since) return out.filter((f) => f.time >= since);
      return out;
    } catch { return []; }
  }
  protected authenticatePrivateWs(sess: CryptoAccountSession, send: (p: any) => void): void {
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = hmacSha256Base64(sess.creds.apiSecret, ts + "GET" + "/users/self/verify");
    send({ op: "login", args: [{ apiKey: sess.creds.apiKey, passphrase: sess.creds.passphrase ?? "", timestamp: ts, sign: sig }] });
  }
}

function mapOkxOrdType(t: string): string {
  const u = String(t).toLowerCase();
  if (u === "market") return "market";
  if (u === "limit") return "limit";
  if (u === "post_only") return "post_only";
  if (u === "ioc") return "ioc";
  if (u === "fok") return "fok";
  if (u.startsWith("stop")) return "market"; // OKX uses algo orders for stops
  if (u.startsWith("take_profit")) return "market";
  return "limit";
}
