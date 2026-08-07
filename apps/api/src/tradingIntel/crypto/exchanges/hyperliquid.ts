/**
 * Hyperliquid connector (on-chain perp DEX).
 * Auth: ECDSA secp256k1 wallet-signature over the JSON payload with action.type=connect.
 * Endpoint: https://api.hyperliquid.xyz/info (POST) + https://api.hyperliquid.xyz/exchange (POST for orders).
 * All messages are POST JSON; there is no GET / query signing. Phase 1 supports read-only info +
 * agent wallet (read-only / trading delegated key) through the vault/trading-address header.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoAccountSnapshot, CryptoBalance, CryptoCandle, CryptoFill, CryptoOrder, CryptoPosition } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { createHash } from "node:crypto";
import { phase1Gate } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["perp", "spot"], auth: ["ed25519_wallet"],
  hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: true, hasTransfers: false,
  restBaseUrl: "https://api.hyperliquid.xyz", defaultReqPerMin: 600, correctsClockDrift: false,
  publicWsUrl: "wss://api.hyperliquid.xyz/ws", privateWsUrl: "wss://api.hyperliquid.xyz/ws",
};

export class HyperliquidConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "hyperliquid", label: "Hyperliquid", capabilities: CAPS }); }
  protected buildSigner(_creds: CryptoCredentials): HttpSigner {
    return {
      async sign() { /* Hyperliquid uses ECDSA wallet sig in JSON body; handled by exchangeSend. */ },
    };
  }
  protected async fetchMarkets(_sess: CryptoAccountSession): Promise<CryptoMarket[]> {
    // Phase 1: curated major universe. Production should fetch from /info {"type":"allMids"} + meta.
    const syms = ["BTC", "ETH", "SOL", "ARB", "AVAX", "DOGE", "LINK", "MATIC", "XRP", "BNB"];
    return syms.map((s) => ({
      symbol: s + "/USDC:USDC", rawSymbol: s, type: "perp" as const,
      base: s, quote: "USDC", settle: "USDC", contractSize: 1, active: true,
      pricePrecision: 1, qtyPrecision: 4, minQty: 0.001, minNotional: 10,
      maxLeverage: 50, tickSize: 0.1, stepSize: 0.001,
    }));
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    try {
      // Hyperliquid clearinghouseState
      const r = await sess.http.request<any>({ method: "POST", path: "/info", body: { type: "clearinghouseState", user: sess.creds.apiKey }, skipAuth: true });
      const balances: CryptoBalance[] = [{ asset: "USDC", free: Number(r.data?.withdrawable ?? 0), locked: 0, total: Number(r.data?.marginSummary?.accountValue ?? 0), usdValue: Number(r.data?.marginSummary?.accountValue ?? 0) }];
      const positions: CryptoPosition[] = [];
      for (const p of r.data?.assetPositions ?? []) {
        const pp = p.position || p;
        const qty = Number(pp.szi ?? 0);
        if (Math.abs(qty) < 1e-9) continue;
        positions.push({
          symbol: (pp.coin ?? "") + "/USDC:USDC", marketType: "perp",
          side: qty > 0 ? "long" : "short", quantity: Math.abs(qty), entryPrice: Number(pp.entryPx), markPrice: Number(pp.liquidationPx),
          unrealizedPnl: Number(pp.unrealizedPnl), realizedPnl: Number(pp.realizedPnl), leverage: Number(pp.leverage?.value ?? 1),
          margin: Number(pp.marginUsed ?? 0), marginType: pp.crossMargin ? "cross" : "isolated",
          liquidationPrice: Number(pp.liquidationPx) || null, openedTime: new Date().toISOString(), updatedTime: new Date().toISOString(),
        });
      }
      const openOrders: CryptoOrder[] = [];
      try {
        const oo = await sess.http.request<any>({ method: "POST", path: "/info", body: { type: "openOrders", user: sess.creds.apiKey }, skipAuth: true });
        for (const o of oo.data ?? []) {
          openOrders.push({
            id: String(o.oid), clientOrderId: o.cloid, symbol: (o.coin ?? "") + "/USDC:USDC", marketType: "perp",
            side: o.side === "B" ? "buy" : "sell", type: o.limitPx ? "limit" : "market",
            price: Number(o.limitPx) || null, quantity: Number(o.sz), filledQuantity: 0, remainingQuantity: Number(o.sz), avgFillPrice: null,
            status: "new", timeInForce: "GTC", reduceOnly: !!o.reduceOnly, createdTime: new Date(o.timestamp).toISOString(), updatedTime: new Date(o.timestamp).toISOString(), fee: 0, feeCurrency: "USDC",
          });
        }
      } catch {}
      return { accountId: sess.login, accountType: "perp-dex", canTrade: true, canWithdraw: true, equityUsd: Number(r.data?.marginSummary?.accountValue ?? 0), unrealizedPnlUsd: positions.reduce((s, p) => s + p.unrealizedPnl, 0), balances, positions, openOrders };
    } catch (e) {
      return { accountId: sess.login, accountType: "perp-dex", canTrade: false, canWithdraw: false, equityUsd: 0, unrealizedPnlUsd: 0, balances: [], positions: [], openOrders: [] };
    }
  }
  protected async placeOrder(_s: CryptoAccountSession, _r: CryptoOrderRequest): Promise<OrderResult> { return phase1Gate("hyperliquid"); }
  protected async modifyOrder(_s: CryptoAccountSession, _id: string, _p: any): Promise<OrderResult> { return phase1Gate("hyperliquid"); }
  protected async closePositionImpl(_s: CryptoAccountSession, _id: string, _v?: number): Promise<OrderResult> { return phase1Gate("hyperliquid"); }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const interval = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1d" }[tf] ?? "1h";
    const r = await sess.http.request<any[]>({ method: "POST", path: "/info", body: { type: "candlesSnapshot", req: { coin: m.rawSymbol, interval: interval, startTime: Date.now() - count * 3600_000 } }, skipAuth: true });
    return (r.data ?? []).map((k: any) => ({
      symbol, timeframe: tf, time: new Date(k.t).toISOString(),
      open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v),
    })).slice(-count);
  }
  protected async fetchRecentFills(): Promise<CryptoFill[]> { return []; }
  protected authenticatePrivateWs(): void { /* Phase 2 wallet-signature ws auth */ }
}
// Dummy use of createHash to avoid unused-import when tree-shaking in node ESM.
void createHash;
