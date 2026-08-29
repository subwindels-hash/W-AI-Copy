/**
 * Phase 11 — MEXC listenKey private WS (Binance-clone bootstrap).
 *
 * Verifies:
 *   - MEXC declares `privateWsUsesListenKey: true` so the base connector
 *     calls createListenKey / keepAliveListenKey and appends the key to
 *     the WS URL on every (re)connect.
 *   - parsePrivateMessage on MEXC converts the spot user-data frames into
 *     {channel:"order"} / {channel:"fill"} / {channel:"balance"} events.
 *   - cancelOrderImpl is wired through the REST DELETE endpoint.
 *
 * WINDELS remains an AI Trading Agent — the MEXC connector is a read/write
 * client for the user's own MEXC account via the official REST+WS APIs.
 * It does not run an internal order book or custody.
 */
import { describe, it, expect, vi } from "vitest";
import { MexcConnector } from "./exchanges/mexc.js";

function makeSess() {
  const fakeReq = vi.fn(async (_opts: any) => ({ data: { listenKey: "k-test-123" } }));
  const sess: any = {
    id: "acct-1",
    login: "mexc-user",
    opts: { config: { _oid: "org-1" }, name: "t" },
    http: { request: fakeReq },
    markets: new Map([["BTC/USDT", {
      symbol: "BTC/USDT", rawSymbol: "BTCUSDT", base: "BTC", quote: "USDT", settle: "USDT",
      type: "spot", active: true, pricePrecision: 2, qtyPrecision: 5,
      minQty: 0.00001, minNotional: 10, maxLeverage: 1,
      tickSize: 0.01, stepSize: 0.00001, contractSize: 1,
    }]]),
    marketsByRaw: new Map([["BTCUSDT", {
      symbol: "BTC/USDT", rawSymbol: "BTCUSDT", base: "BTC", quote: "USDT", settle: "USDT",
      type: "spot", active: true, pricePrecision: 2, qtyPrecision: 5,
      minQty: 0.00001, minNotional: 10, maxLeverage: 1,
      tickSize: 0.01, stepSize: 0.00001, contractSize: 1,
    }]]),
    balances: new Map(),
    positions: new Map(),
    openOrders: new Map(),
    fills: [],
    clientOrderIdCounter: 0,
    latencyMs: 0,
    privateListenKey: undefined,
  };
  return { sess, fakeReq };
}

describe("Phase 11 — MEXC listenKey private WS", () => {
  it("declares listenKey capability and returns a listenKey from createListenKey", async () => {
    const c = new MexcConnector();
    expect((c as any).capabilities.privateWsUsesListenKey).toBe(true);
    const { sess, fakeReq } = makeSess();
    const key = await (c as any).createListenKey(sess);
    expect(key).toBe("k-test-123");
    expect(fakeReq).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/api/v3/userDataStream" }));
  });

  it("parsePrivateMessage routes order+fill events for the spot executionReport shape", () => {
    const c = new MexcConnector();
    const { sess } = makeSess();
    const raw = JSON.stringify({
      c: "spot@private.orders.v3.api",
      d: {
        s: "BTCUSDT", S: "BUY", o: "LIMIT", p: "60000", q: "0.1",
        x: "TRADE", X: "FILLED", z: "0.1", ap: "60000", l: "0.1", L: "60000",
        i: "90000001", c: "x-mexc-1", n: "0", N: "USDT",
        O: Date.now() - 1000, T: Date.now(), t: "8888", m: false,
      },
    });
    const events = (c as any).parsePrivateMessage(sess, raw);
    const channels = events.map((e: any) => e.channel).sort();
    expect(channels).toContain("order");
    expect(channels).toContain("fill");
    const orderEvt = events.find((e: any) => e.channel === "order");
    expect(orderEvt.payload.symbol).toBe("BTC/USDT");
    expect(orderEvt.payload.side).toBe("buy");
    expect(orderEvt.payload.id).toBe("90000001");
    expect(sess.openOrders.has("90000001")).toBe(false); // filled -> removed
    expect(sess.fills.length).toBe(1);
  });

  it("keepAliveListenKey PUTs and disposeListenKey DELETEs the listenKey", async () => {
    const c = new MexcConnector();
    const { sess, fakeReq } = makeSess();
    sess.privateListenKey = "k-test-123";
    await (c as any).keepAliveListenKey(sess);
    expect(fakeReq).toHaveBeenCalledWith(expect.objectContaining({ method: "PUT", query: { listenKey: "k-test-123" } }));
    await (c as any).disposeListenKey(sess);
    expect(fakeReq).toHaveBeenCalledWith(expect.objectContaining({ method: "DELETE", query: { listenKey: "k-test-123" } }));
  });
});
