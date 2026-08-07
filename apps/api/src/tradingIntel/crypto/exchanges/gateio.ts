/** Gate.io connector (Spot + USDT Perp). Auth: KEY/SIGN/Timestamp in headers; SIGN=HMAC-SHA512 of body with secret. Base: https://api.gateio.ws */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle, CryptoFill, CryptoPosition } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { createHmac } from "node:crypto";
import { phase1Gate, majorPairs, mapStatusStd } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp", "futures", "margin", "options"], auth: ["hmac_sha512_header"],
  hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: false, hasTransfers: true,
  restBaseUrl: "https://api.gateio.ws", publicWsUrl: "wss://api.gateio.ws/ws/v4/", privateWsUrl: "wss://api.gateio.ws/ws/v4/",
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class GateioConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "gateio", label: "Gate.io", capabilities: CAPS }); }
  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        const ts = String(timestampMs / 1000);
        const hashed = body ?? "";
        const sig = createHmac("sha512", creds.apiSecret).update(hashed).digest("hex");
        headers["KEY"] = creds.apiKey;
        headers["SIGN"] = sig;
        headers["Timestamp"] = ts;
        headers["Content-Type"] = "application/json";
      },
    };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const { perp, spot } = majorPairs("_USDT");
    return [...perp.map((m) => ({ ...m, rawSymbol: m.rawSymbol.replace("_USDT", "_USDT") })), ...spot];
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const balances: CryptoBalance[] = [];
    let positions: CryptoPosition[] = [];
    const openOrders: CryptoOrder[] = [];
    try {
      const r = await sess.http.request<any[]>({ method: "GET", path: "/api/v4/spot/accounts" });
      for (const a of r.data ?? []) { const t = Number(a.available) + Number(a.locked); if (t > 0) balances.push({ asset: a.currency, free: Number(a.available), locked: Number(a.locked), total: t }); }
    } catch {}
    try {
      const p = await sess.http.request<any[]>({ method: "GET", path: "/api/v4/futures/usdt/positions" });
      positions = (p.data ?? []).filter((x: any) => Number(x.size) !== 0).map((x: any) => ({
        symbol: x.contract.replace("_USDT", "") + "/USDT:USDT", marketType: "perp",
        side: Number(x.size) > 0 ? "long" : "short", quantity: Math.abs(Number(x.size)), entryPrice: Number(x.entry_price), markPrice: Number(x.mark_price),
        unrealizedPnl: Number(x.unrealised_pnl), realizedPnl: Number(x.realised_pnl), leverage: Number(x.leverage), margin: Number(x.margin) ?? 0,
        marginType: x.mode === "cross" ? "cross" : "isolated", liquidationPrice: Number(x.liq_price) || null, openedTime: new Date(Number(x.open_time) * 1000).toISOString(), updatedTime: new Date().toISOString(),
      }));
      const oo = await sess.http.request<any[]>({ method: "GET", path: "/api/v4/futures/usdt/orders", query: { status: "open", limit: "50" } });
      for (const o of oo.data ?? []) {
        openOrders.push({
          id: String(o.id), symbol: o.contract.replace("_USDT", "") + "/USDT:USDT", marketType: "perp",
          side: o.side === "ask" ? "sell" : "buy", type: "limit", price: Number(o.price), quantity: Number(o.size), filledQuantity: Number(o.size) - Number(o.left), remainingQuantity: Number(o.left), avgFillPrice: Number(o.fill_price) || null,
          status: o.status === "open" ? "new" : mapStatusStd(o.status), timeInForce: "GTC", reduceOnly: !!o.is_reduce_only, createdTime: new Date(Number(o.create_time) * 1000).toISOString(), updatedTime: new Date(Number(o.update_time) * 1000).toISOString(), fee: 0, feeCurrency: "USDT", clientOrderId: o.text,
        });
      }
    } catch {}
    return { accountId: sess.login, accountType: "spot+futures", canTrade: true, canWithdraw: false, equityUsd: balances.reduce((s, b) => s + (b.asset === "USDT" || b.asset === "USDC" ? b.total : 0), 0), unrealizedPnlUsd: positions.reduce((s, p) => s + p.unrealizedPnl, 0), balances, positions, openOrders };
  }
  protected async placeOrder(_s: CryptoAccountSession, _r: CryptoOrderRequest): Promise<OrderResult> { return phase1Gate("gateio"); }
  protected async modifyOrder(_s: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return phase1Gate("gateio"); }
  protected async closePositionImpl(_s: CryptoAccountSession, _id: string, _v?: number): Promise<OrderResult> { return phase1Gate("gateio"); }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const interval = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1d" }[tf] ?? "1h";
    const path = m.type === "spot" ? "/api/v4/spot/candlesticks" : "/api/v4/futures/usdt/candlesticks";
    const q: any = m.type === "spot" ? { currency_pair: m.rawSymbol, interval } : { contract: m.rawSymbol, interval };
    const r = await sess.http.request<any[]>({ method: "GET", path, query: { ...q, limit: String(Math.min(count, 500)) }, skipAuth: true });
    const raw = r.data ?? [];
    return raw.map((k: any) => ({ symbol, timeframe: tf, time: new Date(Number(k[0]) * 1000).toISOString(), open: Number(k[3] ?? k[1]), high: Number(k[5] ?? k[3]), low: Number(k[4] ?? k[4]), close: Number(k[2]), volume: Number(k[6] ?? k[5]) }));
  }
  protected async fetchRecentFills(): Promise<CryptoFill[]> { return []; }
  protected authenticatePrivateWs(): void {}
}
