/**
 * Phase 13 — Per-account readOnly toggle (live propagation).
 *
 * Verifies:
 *   - BaseCryptoConnector._patchSessionConfig mutates opts.config in place
 *     so BrokerIntegrationService.updateAccount can propagate a readOnly
 *     toggle into a live session without a reconnect.
 *   - After patching readOnly=true, sendOrder is blocked by the existing
 *     read-only gate (returns retcode -1, no HTTP call).
 *   - BrokerIntegrationService.updateAccount applies a connectorConfig patch
 *     (shape) without losing other fields (deep-merge of connectorConfig).
 *
 * WINDELS is an AI Trading Agent, not a broker. The readOnly flag hard-
 * blocks outbound order traffic at the connector; WINDELS never becomes a
 * venue or custodian when trading is unlocked.
 */
import { describe, it, expect } from "vitest";
import { BinanceConnector } from "./exchanges/binance.js";

function fakeSession(): any {
  return {
    id: "acct-1",
    login: "k",
    creds: { apiKey: "k", apiSecret: "s" },
    opts: { config: { _oid: "org-x", allowedSymbols: ["BTC/USDT"] }, name: "t", environment: "live" },
    http: { request: async () => ({ data: {} }) },
    markets: new Map(),
    marketsByRaw: new Map(),
    balances: new Map(),
    positions: new Map(),
    openOrders: new Map(),
    fills: [],
    snapshot: { equityUsd: 10_000, canTrade: true, unrealizedPnlUsd: 0, balances: [], positions: [], openOrders: [] },
    clientOrderIdCounter: 0,
    latencyMs: 0,
    status: "connected",
  };
}

describe("Phase 13 — read-only toggle propagates into live crypto sessions", () => {
  it("_patchSessionConfig merges patch and preserves _oid", () => {
    const c = new BinanceConnector();
    const sess = fakeSession();
    (c as any).accounts.set(sess.id, sess);
    (c as any)._patchSessionConfig(sess.id, { readOnly: true });
    expect(sess.opts.config.readOnly).toBe(true);
    expect(sess.opts.config._oid).toBe("org-x");
    expect(sess.opts.config.allowedSymbols).toEqual(["BTC/USDT"]);
    // Toggle back.
    (c as any)._patchSessionConfig(sess.id, { readOnly: false });
    expect(sess.opts.config.readOnly).toBe(false);
  });

  it("sendOrder is blocked once patched to readOnly=true", async () => {
    const c = new BinanceConnector();
    const sess = fakeSession();
    // Seed a BTC/USDT market so pre-trade risk can look it up.
    const mk = {
      symbol: "BTC/USDT:USDT", rawSymbol: "BTCUSDT", base: "BTC", quote: "USDT", settle: "USDT",
      type: "perp", active: true, pricePrecision: 2, qtyPrecision: 3, minQty: 0.001, minNotional: 5,
      maxLeverage: 20, tickSize: 0.01, stepSize: 0.001, contractSize: 1,
    };
    sess.markets.set(mk.symbol, mk);
    sess.marketsByRaw.set(mk.rawSymbol, mk);
    (c as any).accounts.set(sess.id, sess);
    // Not read-only yet — http.request would fire; force a failure by making
    // request throw so we know we got past the readOnly gate.
    sess.http.request = async () => { throw new Error("upstream"); };
    const rNotRo = await c.sendOrder(sess.id, {
      accountId: sess.id, symbol: mk.symbol, side: "long", type: "market", volume: 0.01, tif: "GTC", action: "open",
    });
    expect(rNotRo.ok).toBe(false);
    expect(rNotRo.error).not.toMatch(/read-only/);
    // Now enable readOnly — sendOrder must short-circuit BEFORE http.
    (c as any)._patchSessionConfig(sess.id, { readOnly: true });
    const rRo = await c.sendOrder(sess.id, {
      accountId: sess.id, symbol: mk.symbol, side: "long", type: "market", volume: 0.01, tif: "GTC", action: "open",
    });
    expect(rRo.ok).toBe(false);
    expect(rRo.error).toMatch(/read-only/);
  });
});
