/**
 * Crypto Phase 2 tests — risk-gate enforcement, global read-only, client
 * order id generation, order parameter builder.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BinanceConnector } from "./exchanges/binance.js";
import { BybitConnector } from "./exchanges/bybit.js";
import { buildOrderParams, roundQty, roundPrice, stdType, sideUpper } from "./order-utils.js";
import { env } from "../../config/env.js";

// Helper to create a connector with a fake session already wired up so we
// can test sendOrder paths without doing a real HTTP connect.
async function makeConnectedSession<C extends BinanceConnector | BybitConnector>(
  c: C,
  opts: { equityUsd: number; readOnly?: boolean } = { equityUsd: 100_000 },
) {
  await c.initialize();
  // Build a real markets list by calling fetchMarkets on a stub http.
  const stubHttp = {
    request: vi.fn(async () => ({ data: {}, latencyMs: 1 })),
  } as any;
  const fakeSigner = { sign: async () => {} };
  // Construct a session object directly.
  const accountId = "a1";
  const sess = {
    id: accountId, login: "k",
    creds: { apiKey: "k", apiSecret: "s" },
    opts: { name: "t", config: { readOnly: opts.readOnly ?? false, tickStream: false } },
    http: stubHttp, name: "t", environment: "live", status: "connected", connectedAt: new Date().toISOString(),
    latencyMs: 0,
    markets: new Map(), marketsByRaw: new Map(),
    balances: new Map(), positions: new Map(), openOrders: new Map(), fills: [],
    clientOrderIdCounter: 0, publicTickers: new Map(), tickHandlers: new Map(), privateQueue: [],
    snapshot: { accountId: "k", accountType: "spot", canTrade: true, canWithdraw: false, equityUsd: opts.equityUsd, unrealizedPnlUsd: 0, balances: [], positions: [], openOrders: [] },
  } as any;
  // Populate markets using the real fetchMarkets — pass a temporary stub that returns empty arrays.
  stubHttp.request = vi.fn(async () => ({ data: [] }));
  // We can't easily call protected methods without casting. Instead:
  // Inject just the BTC/USDT and BTC/USDT:USDT markets directly so we have something to route against.
  const btcSpot: any = { symbol: "BTC/USDT", rawSymbol: "BTCUSDT", type: "spot", base: "BTC", quote: "USDT", settle: "", contractSize: 1, active: true, pricePrecision: 2, qtyPrecision: 5, minQty: 0.00001, minNotional: 10, maxLeverage: 1, tickSize: 0.01, stepSize: 0.00001 };
  const btcPerp: any = { symbol: "BTC/USDT:USDT", rawSymbol: "BTCUSDT", type: "perp", base: "BTC", quote: "USDT", settle: "USDT", contractSize: 1, active: true, pricePrecision: 2, qtyPrecision: 3, minQty: 0.001, minNotional: 5, maxLeverage: 20, tickSize: 0.01, stepSize: 0.001 };
  sess.markets.set("BTC/USDT", btcSpot); sess.marketsByRaw.set("BTCUSDT", btcSpot);
  sess.markets.set("BTC/USDT:USDT", btcPerp); sess.marketsByRaw.set("BTCUSDT", btcPerp);
  sess.balances.set("USDT", { asset: "USDT", free: opts.equityUsd, locked: 0, total: opts.equityUsd });
  (c as any).accounts.set(accountId, sess);
  (c as any).initialized = true;
  return { c, sess, accountId, stubHttp };
}

describe("Crypto Phase 2 — pre-trade risk gate", () => {
  let savedReadonly: boolean;
  beforeEach(() => { savedReadonly = env.WINDELS_CRYPTO_GLOBAL_READONLY; (env as any).WINDELS_CRYPTO_GLOBAL_READONLY = false; });
  afterEach(() => { (env as any).WINDELS_CRYPTO_GLOBAL_READONLY = savedReadonly; });

  it("sendOrder returns retcode -10 when WINDELS_CRYPTO_GLOBAL_READONLY is active", async () => {
    (env as any).WINDELS_CRYPTO_GLOBAL_READONLY = true;
    const c = new BinanceConnector();
    const { accountId } = await makeConnectedSession(c);
    const order = await c.sendOrder(accountId, { accountId, symbol: "BTC/USDT:USDT", side: "long", type: "market", volume: 0.001, action: "open", tif: "GTC" });
    expect(order.ok).toBe(false);
    expect(order.retcode).toBe(-10);
    expect(order.error).toMatch(/READONLY/i);
    await c.disconnect(accountId); await c.shutdown();
  });

  it("sendOrder returns retcode -1 for connectorConfig.readOnly", async () => {
    const c = new BybitConnector();
    const { accountId } = await makeConnectedSession(c, { equityUsd: 100_000, readOnly: true });
    const order = await c.sendOrder(accountId, { accountId, symbol: "BTC/USDT:USDT", side: "long", type: "market", volume: 0.001, action: "open", tif: "GTC" });
    expect(order.ok).toBe(false);
    expect(order.retcode).toBe(-1);
    expect(order.error).toMatch(/read-only/i);
    await c.disconnect(accountId); await c.shutdown();
  });

  it("sendOrder returns retcode -2 for unknown symbols", async () => {
    const c = new BinanceConnector();
    const { accountId } = await makeConnectedSession(c);
    const order = await c.sendOrder(accountId, { accountId, symbol: "BOGUS/USDT", side: "long", type: "market", volume: 1 });
    expect(order.ok).toBe(false);
    expect(order.retcode).toBe(-2);
    expect(order.error).toMatch(/unknown symbol/i);
    await c.disconnect(accountId); await c.shutdown();
  });

  it("risk engine blocks oversized positions (exceeds exposure limit)", async () => {
    const c = new BybitConnector();
    const { accountId } = await makeConnectedSession(c, { equityUsd: 1_000 });
    // Without a stop loss on a market order, risk can't price per-trade $ risk,
    // but 100 BTC × mark price 0 (no ref price) is un-catchable here. Use with
    // a small size and price to trigger exposure check via leverage cap — pass
    // leverage 100 which exceeds the risk cap of 5.
    const order = await c.sendOrder(accountId, { accountId, symbol: "BTC/USDT:USDT", side: "long", type: "market", volume: 0.001, price: 50000, action: "open", tif: "GTC" });
    // The 0.001 × 50000 = $50 position on $1000 account is 5% exposure which is
    // within 200% cap but lacks stop-loss — will pass unless other rules trip.
    // For a deterministic negative test, use leverage. We cannot pass leverage
    // via BrokerOrderRequest directly; the connector uses market.maxLeverage.
    // Instead use a too-large size that exceeds exposure.
    const big = await c.sendOrder(accountId, { accountId, symbol: "BTC/USDT:USDT", side: "long", type: "market", volume: 100, price: 50000, action: "open", tif: "GTC" });
    expect(big.ok).toBe(false);
    expect(big.retcode).toBe(-20);
    expect(big.error).toMatch(/risk/i);
    await c.disconnect(accountId); await c.shutdown();
  });
});

describe("Crypto Phase 2 — order-utils", () => {
  it("roundQty floors to precision", () => {
    expect(roundQty(0.123456, 3)).toBe(0.123);
    expect(roundQty(1.0, 2)).toBe(1.0);
  });
  it("roundPrice uses precision when no tickSize (fp safe)", () => {
    expect(roundPrice(123.456, 1)).toBeCloseTo(123.5, 5);
    expect(roundPrice(123.456, 0, 0.5)).toBe(123.5);
  });
  it("sideUpper and stdType produce canonical strings", () => {
    expect(sideUpper("buy")).toBe("BUY");
    expect(sideUpper("sell")).toBe("SELL");
    expect(stdType("market")).toBe("MARKET");
    expect(stdType("limit")).toBe("LIMIT");
    expect(stdType("post_only")).toBe("LIMIT_MAKER");
    expect(stdType("stop_market")).toBe("STOP_MARKET");
  });
  it("buildOrderParams maps fields correctly", () => {
    const params = buildOrderParams(
      { symbol: "BTC/USDT", marketType: "spot", side: "buy", type: "limit", quantity: 0.1, price: 50000, timeInForce: "GTC", clientOrderId: "abc123", reduceOnly: false },
      { rawSymbol: "BTCUSDT", pricePrecision: 2, qtyPrecision: 5, tickSize: 0.01, stepSize: 0.00001 },
    );
    expect(params.symbol).toBe("BTCUSDT");
    expect(params.side).toBe("BUY");
    expect(params.type).toBe("LIMIT");
    expect(params.quantity).toBe(0.1);
    expect(params.price).toBe(50000);
    expect(params.newClientOrderId).toBe("abc123");
  });
});

describe("Crypto Phase 2 — client order id generation", () => {
  it("produces unique, bounded ids", async () => {
    const c = new BinanceConnector();
    const { sess, accountId } = await makeConnectedSession(c);
    const gen = (c as any).genClientOrderId.bind(c);
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = gen(sess, 42);
      expect(id).toMatch(/^x-bin/);
      expect(id.length).toBeLessThan(60);
      ids.add(id);
    }
    expect(ids.size).toBe(100);
    await c.disconnect(accountId); await c.shutdown();
  });
});
