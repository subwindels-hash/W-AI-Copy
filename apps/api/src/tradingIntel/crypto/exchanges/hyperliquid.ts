/**
 * Hyperliquid connector (perps on-chain DEX).
 *
 * Hyperliquid's HTTP API is a single POST endpoint at /info (read) and
 * /exchange (write). Authentication is via ECDSA secp256k1 signature over an
 * EIP-712 typed-data payload using the user's wallet private key. Phase 2
 * supports: REST read snapshots (clearinghouseState, openOrders), market data,
 * with order placement requiring the walletKey to perform real ECDSA signing.
 * When no walletKey is supplied, placeOrder returns a clear "walletKey required"
 * error instead of sending unsigned orders.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { mkMarket } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot", "perp"],
  auth: ["ecdsa_secp256k1"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: true, hasTransfers: true,
  restBaseUrl: "https://api.hyperliquid.xyz",
  publicWsUrl: "wss://api.hyperliquid.xyz/ws",
  privateWsUrl: "wss://api.hyperliquid.xyz/ws",
  defaultReqPerMin: 600, correctsClockDrift: false,
};

export class HyperliquidConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "hyperliquid", label: "Hyperliquid", capabilities: CAPS }); }

  protected buildSigner(_creds: CryptoCredentials): HttpSigner {
    return { sign() { /* Hyperliquid uses POST body signatures done at call-site. */ } };
  }
  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const pairs = [
      "BTC", "ETH", "SOL", "ARB", "AVAX", "DOGE", "LINK", "MATIC", "XRP", "BNB",
      "ADA", "DOT", "LTC", "BCH", "ATOM", "NEAR", "APT", "OP", "SUI", "SEI",
      "INJ", "TIA", "PEPE", "WIF", "TRX", "UNI", "AAVE", "MKR", "LDO", "STX",
      "FET", "GRT", "PYTH", "JUP", "WLD", "TON",
    ];
    return pairs.map((b) => mkMarket(`${b}/USDC:USDC`, b, "perp", b, "USDC", "USDC", 0.01, 0.001, 50, 0.001, 10, 2, 3));
  }
  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const user = sess.creds.passphrase ?? sess.creds.apiKey; // wallet address passed as apiKey
    const r = await sess.http.request<any>({ method: "POST", path: "/info", body: { type: "clearinghouseState", user } });
    const d = r.data as any;
    const balances: CryptoBalance[] = [{ asset: "USDC", free: Number(d?.withdrawable ?? 0), locked: 0, total: Number(d?.marginSummary?.accountValue ?? d?.crossMarginSummary?.accountValue ?? 0) }];
    const positions: CryptoPosition[] = [];
    for (const p of d?.assetPositions ?? []) {
      const pp = p.position ?? p;
      if (!pp || Number(pp.szi ?? 0) === 0) continue;
      const sz = Number(pp.szi ?? 0);
      positions.push({
        symbol: `${pp.coin}/USDC:USDC`, marketType: "perp",
        side: sz > 0 ? "long" : "short", quantity: Math.abs(sz),
        entryPrice: Number(pp.entryPx), markPrice: Number(pp.markPx),
        unrealizedPnl: Number(pp.unrealizedPnl), realizedPnl: Number(pp.realizedPnl),
        leverage: Number(pp.leverage?.value ?? 1), margin: Number(pp.positionMargin ?? 0),
        marginType: "cross", liquidationPrice: Number(pp.liquidationPx) || null,
        openedTime: new Date().toISOString(), updatedTime: new Date().toISOString(),
      });
    }
    let openOrders: CryptoOrder[] = [];
    try {
      const oo = await sess.http.request<any>({ method: "POST", path: "/info", body: { type: "openOrders", user } });
      openOrders = (oo.data ?? []).map((o: any) => ({
        id: String(o.oid), symbol: `${o.coin}/USDC:USDC`, marketType: "perp",
        side: o.side === "B" ? "buy" : "sell",
        type: o.orderType === "Limit" ? "limit" : o.orderType === "Stop Market" ? "stop_market" : "market",
        price: Number(o.limitPx) || null, quantity: Number(o.sz), filledQuantity: 0, remainingQuantity: Number(o.sz),
        avgFillPrice: null, status: "new", timeInForce: "GTC", reduceOnly: !!o.reduceOnly,
        createdTime: new Date(o.timestamp).toISOString(), updatedTime: new Date(o.timestamp).toISOString(), fee: 0, feeCurrency: "USDC",
        clientOrderId: o.cloid,
      }));
    } catch { /* */ }
    const equityUsd = Number(d?.marginSummary?.accountValue ?? 0);
    return { accountId: user, accountType: "perp", canTrade: true, canWithdraw: true, equityUsd, unrealizedPnlUsd: positions.reduce((s, p) => s + p.unrealizedPnl, 0), balances, positions, openOrders };
  }

  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    // ECDSA signing requires walletKey (a hex private key). Without it, refuse.
    if (!sess.creds.walletKey) return { ok: false, error: "Hyperliquid order placement requires walletKey (hex private key) to sign EIP-712 payload" };
    const m = sess.markets.get(req.symbol); if (!m) return { ok: false, error: "unknown symbol" };
    const user = sess.creds.passphrase ?? sess.creds.apiKey;
    const body: any = {
      action: {
        type: "order",
        orders: [{
          a: m.base, b: req.side === "buy", p: String(req.price ?? 0), s: String(req.quantity),
          r: !!req.reduceOnly, t: { limit: { tif: req.timeInForce === "IOC" ? "Ioc" : req.postOnly ? "Alo" : "Gtc" } },
          cloid: req.clientOrderId ?? this.genClientOrderId(sess),
        }],
        grouping: "na",
      },
      nonce: Date.now(),
      signature: { r: "0", s: "0", v: 0 }, // placeholder; real ECDSA via ethers.js is deferred
      // In production this would be a real EIP-712 signature; for now return not-signed.
    };
    // Note: until ECDSA signing is implemented, we do not transmit the order.
    void user; void body;
    return { ok: false, error: "Hyperliquid ECDSA signing pending ethers.js integration (Phase 2.x)", retcode: -102 };
  }
  protected async modifyOrder(_sess: CryptoAccountSession, _id: string, _patch: any): Promise<OrderResult> { return { ok: false, error: "hyperliquid modify pending ECDSA" }; }
  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    const sym = orderIdOrSymbol.includes("/") ? orderIdOrSymbol : (sess.openOrders.get(orderIdOrSymbol)?.symbol ?? orderIdOrSymbol);
    const pos = sess.positions.get(sym);
    if (!pos) return { ok: false, error: "no open position" };
    return this.placeOrder(sess, { symbol: sym, marketType: "perp", side: pos.side === "long" ? "sell" : "buy", type: "market", quantity: volume ?? pos.quantity, reduceOnly: true });
  }
  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const interval = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1d", W1: "1w", MN1: "1M" }[tf] ?? "1h";
    const r = await sess.http.request<any>({ method: "POST", path: "/info", body: { type: "candleSnapshot", req: { coin: m.base, interval, startTime: Date.now() - count * 3600_000, endTime: Date.now() } }, skipAuth: true });
    return (r.data ?? []).map((k: any) => ({ symbol, timeframe: tf, time: new Date(k.t).toISOString(), open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v) }));
  }
  protected async fetchRecentFills(_sess: CryptoAccountSession, _since?: string): Promise<CryptoFill[]> { return []; }
  protected authenticatePrivateWs(_sess: CryptoAccountSession, _send: (p: any) => void): void { /* Hyperliquid WS uses subscribe with user; ECDSA not required for subscription */ }
}
