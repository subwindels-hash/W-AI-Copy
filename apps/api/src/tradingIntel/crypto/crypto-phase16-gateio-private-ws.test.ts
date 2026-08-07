/**
 * Phase 16 — Gate.io v4 private WebSocket.
 *
 * Verifies:
 *   - authenticatePrivateWs is a no-op (Gate.io signs every subscribe frame
 *     individually via the auth block rather than a single login op).
 *   - afterPrivateAuth sends 4 subscribe frames (spot.orders, spot.balances,
 *     futures.orders, futures.positions), each carrying a per-channel signed
 *     auth block: method api_key + KEY + SIGN (HMAC-SHA512 hex over
 *     "channel\\nevent\\ntime\\n") + Timestamp.
 *   - parsePrivateMessage routes spot orders (with incremental fill
 *     accounting), futures orders, futures positions (zero-size deletes),
 *     and spot balance updates; ignores subscribe/error/pong acks.
 *   - public WS ticker subscribe uses correct channel (spot.tickers vs
 *     futures.tickers) and parseTickerMessage reads highest_bid/lowest_ask.
 *   - cancelOrderImpl builds the correct DELETE paths for perp and spot.
 *
 * WINDELS is an AI Trading Agent, not a broker. The Gate.io connector is a
 * client of Gate.io's public API; WINDELS never matches, fills, or custodies.
 */
import { describe, it, expect, vi } from "vitest";
import { GateioConnector } from "./exchanges/gateio.js";

function makeSess() {
  const requests: any[] = [];
  const fakeReq = vi.fn(async (opts: any) => {
    requests.push(opts);
    return { data: [] };
  });
  const sess: any = {
    id: "g1",
    login: "gt-user",
    creds: { apiKey: "k", apiSecret: "s" },
    opts: { config: { _oid: "org-1" } },
    environment: "live",
    http: { request: fakeReq },
    markets: new Map<string, any>([
      ["BTC/USDT:USDT", {
        symbol: "BTC/USDT:USDT", rawSymbol: "BTC_USDT", base: "BTC", quote: "USDT", settle: "USDT",
        type: "perp", active: true, pricePrecision: 2, qtyPrecision: 3,
        minQty: 0.001, minNotional: 5, maxLeverage: 100,
        tickSize: 0.01, stepSize: 0.001, contractSize: 1,
      }],
      ["BTC/USDT", {
        symbol: "BTC/USDT", rawSymbol: "BTC_USDT", base: "BTC", quote: "USDT", settle: "",
        type: "spot", active: true, pricePrecision: 2, qtyPrecision: 5,
        minQty: 0.00001, minNotional: 10, maxLeverage: 1,
        tickSize: 0.01, stepSize: 0.00001, contractSize: 1,
      }],
    ]),
    marketsByRaw: new Map<string, any>([
      ["BTC_USDT", {
        symbol: "BTC/USDT:USDT", rawSymbol: "BTC_USDT", base: "BTC", quote: "USDT", settle: "USDT",
        type: "perp", active: true, pricePrecision: 2, qtyPrecision: 3,
        minQty: 0.001, minNotional: 5, maxLeverage: 100,
        tickSize: 0.01, stepSize: 0.001, contractSize: 1,
      }],
    ]),
    balances: new Map(),
    positions: new Map(),
    openOrders: new Map(),
    fills: [],
    clientOrderIdCounter: 0,
    latencyMs: 0,
  };
  return { sess, fakeReq, requests };
}

describe("Phase 16 — Gate.io v4 private WS", () => {
  it("authenticatePrivateWs is a no-op (per-subscription auth)", () => {
    const c = new GateioConnector();
    const { sess } = makeSess();
    const sent: any[] = [];
    const send = (p: any) => sent.push(p);
    (c as any).authenticatePrivateWs(sess, send);
    expect(sent).toHaveLength(0);
  });

  it("afterPrivateAuth subscribes to 4 channels with per-channel HMAC-SHA512 auth", async () => {
    const c = new GateioConnector();
    const { sess } = makeSess();
    const sent: any[] = [];
    const send = (p: any) => sent.push(p);
    const before = Math.floor(Date.now() / 1000);
    await (c as any).afterPrivateAuth(sess, send);
    const after = Math.floor(Date.now() / 1000) + 1;
    expect(sent).toHaveLength(4);
    const channels = sent.map((s) => s.channel).sort();
    expect(channels).toEqual(["futures.orders", "futures.positions", "spot.balances", "spot.orders"]);
    for (const s of sent) {
      expect(s.event).toBe("subscribe");
      expect(s.auth).toBeTruthy();
      expect(s.auth.method).toBe("api_key");
      expect(s.auth.KEY).toBe("k");
      expect(typeof s.auth.SIGN).toBe("string");
      expect(s.auth.SIGN.length).toBeGreaterThan(20);
      const ts = Number(s.auth.Timestamp);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
      expect(s.time).toBe(ts);
      expect(Array.isArray(s.payload)).toBe(true);
    }
  });

  it("parsePrivateMessage routes spot orders, futures orders/positions, balances, ignores pong/ack", () => {
    const c = new GateioConnector();
    const { sess } = makeSess();

    // Subscribe ack ignored.
    expect((c as any).parsePrivateMessage(sess, JSON.stringify({ event: "subscribe", channel: "spot.orders", result: { status: "success" } }))).toEqual([]);
    // Pong ignored.
    expect((c as any).parsePrivateMessage(sess, JSON.stringify({ channel: "spot.pong" }))).toEqual([]);
    // Error ignored.
    expect((c as any).parsePrivateMessage(sess, JSON.stringify({ error: { code: 1, message: "bad" } }))).toEqual([]);

    // Spot partial fill.
    const spotPartial = JSON.stringify({
      time: Date.now(),
      channel: "spot.orders",
      event: "update",
      result: [{
        id: "s-1", currency_pair: "BTC_USDT", side: "buy", type: "limit",
        amount: "0.1", price: "60000", filled_amount: "0.03",
        avg_deal_price: "60000", status: "open", fee: "0",
        create_time_ms: Date.now() - 1000, update_time_ms: Date.now(),
      }],
    });
    let evts = (c as any).parsePrivateMessage(sess, spotPartial);
    expect(evts.map((e: any) => e.channel)).toEqual(["order"]);
    expect(sess.openOrders.get("s-1")).toBeTruthy();
    expect(sess.fills.length).toBe(1);
    expect(sess.fills[0].quantity).toBe(0.03);
    expect(sess.fills[0].marketType).toBe("spot");

    // Spot full fill evicts.
    const spotFill = JSON.stringify({
      time: Date.now(),
      channel: "spot.orders",
      event: "update",
      result: [{
        id: "s-1", currency_pair: "BTC_USDT", side: "buy", type: "limit",
        amount: "0.1", price: "60000", filled_amount: "0.1",
        avg_deal_price: "60000", status: "filled", fee: "0.0001", fee_currency: "USDT",
        update_time_ms: Date.now(),
      }],
    });
    (c as any).parsePrivateMessage(sess, spotFill);
    expect(sess.openOrders.has("s-1")).toBe(false);
    expect(sess.fills.length).toBe(2);
    expect(sess.fills[1].quantity).toBeCloseTo(0.07, 6);

    // Futures order partial fill.
    const futPartial = JSON.stringify({
      time: Date.now(),
      channel: "futures.orders",
      event: "update",
      result: [{
        id: "f-1", contract: "BTC_USDT", size: "1", price: "60000",
        fill_size: "0.5", fill_price: "60000", status: "open",
        create_time_ms: Date.now() - 1000, update_time_ms: Date.now(),
      }],
    });
    evts = (c as any).parsePrivateMessage(sess, futPartial);
    expect(evts.map((e: any) => e.channel)).toEqual(["order"]);
    expect(sess.openOrders.get("f-1")).toBeTruthy();
    expect(sess.openOrders.get("f-1").marketType).toBe("perp");
    expect(sess.fills.length).toBe(3);

    // Futures position snapshot inserts.
    const posSnap = JSON.stringify({
      time: Date.now(),
      channel: "futures.positions",
      event: "update",
      result: [{
        contract: "BTC_USDT", size: "1", entry_price: "60000", mark_price: "60500",
        unrealised_pnl: "500", leverage: "10", mode: "cross",
        update_time_ms: Date.now(),
      }],
    });
    evts = (c as any).parsePrivateMessage(sess, posSnap);
    expect(evts.map((e: any) => e.channel)).toEqual(["position"]);
    expect(sess.positions.get("BTC/USDT:USDT")).toBeTruthy();
    expect(sess.positions.get("BTC/USDT:USDT").quantity).toBe(1);
    expect(sess.positions.get("BTC/USDT:USDT").side).toBe("long");

    // Zero-size position deletes.
    const posZero = JSON.stringify({
      time: Date.now(), channel: "futures.positions", event: "update",
      result: [{ contract: "BTC_USDT", size: "0", update_time_ms: Date.now() }],
    });
    (c as any).parsePrivateMessage(sess, posZero);
    expect(sess.positions.has("BTC/USDT:USDT")).toBe(false);

    // Spot balance update.
    const bal = JSON.stringify({
      time: Date.now(), channel: "spot.balances", event: "update",
      result: [{ currency: "USDT", available: "1000", locked: "50" }],
    });
    evts = (c as any).parsePrivateMessage(sess, bal);
    expect(evts.map((e: any) => e.channel)).toEqual(["balance"]);
    expect(sess.balances.get("USDT").total).toBe(1050);
    expect(sess.balances.get("USDT").usdValue).toBe(1050);
  });

  it("public WS ticker subscribe sends correct channel per market and ping is an object", () => {
    const c = new GateioConnector();
    const { sess } = makeSess();
    const perp = sess.markets.get("BTC/USDT:USDT");
    const spot = sess.markets.get("BTC/USDT");
    const subPerp = (c as any).buildTickerSubscribePayload(perp);
    const subSpot = (c as any).buildTickerSubscribePayload(spot);
    expect(subPerp.channel).toBe("futures.tickers");
    expect(subSpot.channel).toBe("spot.tickers");
    expect(subPerp.payload).toEqual(["BTC_USDT"]);
    expect(subSpot.payload).toEqual(["BTC_USDT"]);
    expect((c as any).publicPingMessage()).toBeTruthy();
    // parseTickerMessage reads highest_bid/lowest_ask.
    const t = (c as any).parseTickerMessage(sess, perp, { highest_bid: "60000", lowest_ask: "60001" });
    expect(t).toEqual({ bid: 60000, ask: 60001 });
  });

  it("cancelOrderImpl DELETEs the correct path for perp and spot", async () => {
    const c = new GateioConnector();
    const { sess, fakeReq } = makeSess();
    // Perp order.
    sess.openOrders.set("f-200", { id: "f-200", symbol: "BTC/USDT:USDT", side: "buy", quantity: 1, filledQuantity: 0 });
    let r = await (c as any).cancelOrderImpl(sess, "f-200");
    expect(r.ok).toBe(true);
    expect(fakeReq).toHaveBeenCalledWith(expect.objectContaining({ method: "DELETE", path: "/futures/usdt/orders/f-200" }));
    // Spot order.
    sess.openOrders.set("s-200", { id: "s-200", symbol: "BTC/USDT", side: "buy", quantity: 0.01, filledQuantity: 0 });
    r = await (c as any).cancelOrderImpl(sess, "s-200");
    expect(r.ok).toBe(true);
    expect(fakeReq).toHaveBeenCalledWith(expect.objectContaining({ method: "DELETE", path: "/spot/orders/s-200" }));
  });
});
