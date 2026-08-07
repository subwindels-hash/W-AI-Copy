/**
 * Phase 15 — Bitget private WebSocket.
 *
 * Verifies:
 *   - authenticatePrivateWs sends a login op with HMAC-SHA256 signed payload.
 *   - afterPrivateAuth subscribes to orders (SPOT + USDT-FUTURES), positions,
 *     and account channels in one batch.
 *   - parsePrivateMessage routes order updates (partial/fill/cancel) into
 *     openOrders + fills, position updates into positions (zero qty deletes),
 *     and account updates into balances.
 *   - public WS ping is string "ping"; public ticker subscribe payload uses
 *     the correct instType (SPOT/USDT-FUTURES) per market type.
 *   - cancelOrderImpl builds correct REST bodies and returns success.
 *
 * WINDELS is an AI Trading Agent, not a broker. The Bitget connector is a
 * client of Bitget's public API; WINDELS never matches, fills, or custodies.
 */
import { describe, it, expect, vi } from "vitest";
import { BitgetConnector } from "./exchanges/bitget.js";

function makeSess() {
  const requests: any[] = [];
  const fakeReq = vi.fn(async (opts: any) => {
    requests.push(opts);
    return { data: { code: "00000", data: {} } };
  });
  const sess: any = {
    id: "b1",
    login: "bg-user",
    creds: { apiKey: "k", apiSecret: "s", passphrase: "p" },
    opts: { config: { _oid: "org-1" } },
    environment: "live",
    http: { request: fakeReq },
    markets: new Map<string, any>([
      ["BTC/USDT:USDT", {
        symbol: "BTC/USDT:USDT", rawSymbol: "BTCUSDT", base: "BTC", quote: "USDT", settle: "USDT",
        type: "perp", active: true, pricePrecision: 2, qtyPrecision: 3,
        minQty: 0.001, minNotional: 5, maxLeverage: 100,
        tickSize: 0.01, stepSize: 0.001, contractSize: 1,
      }],
      ["BTC/USDT", {
        symbol: "BTC/USDT", rawSymbol: "BTCUSDT", base: "BTC", quote: "USDT", settle: "",
        type: "spot", active: true, pricePrecision: 2, qtyPrecision: 5,
        minQty: 0.00001, minNotional: 10, maxLeverage: 1,
        tickSize: 0.01, stepSize: 0.00001, contractSize: 1,
      }],
    ]),
    marketsByRaw: new Map<string, any>([
      ["BTCUSDT", {
        symbol: "BTC/USDT:USDT", rawSymbol: "BTCUSDT", base: "BTC", quote: "USDT", settle: "USDT",
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

describe("Phase 15 — Bitget private WS", () => {
  it("authenticatePrivateWs issues login op with key+passphrase+timestamp+sign", () => {
    const c = new BitgetConnector();
    const { sess } = makeSess();
    const sent: any[] = [];
    const before = Date.now();
    (c as any).authenticatePrivateWs(sess, (p: any) => sent.push(p));
    const after = Date.now();
    expect(sent).toHaveLength(1);
    const op = sent[0];
    expect(op.op).toBe("login");
    expect(op.args).toHaveLength(1);
    expect(op.args[0].apiKey).toBe("k");
    expect(op.args[0].passphrase).toBe("p");
    const ts = Number(op.args[0].timestamp);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 5);
    expect(typeof op.args[0].sign).toBe("string");
    expect(op.args[0].sign.length).toBeGreaterThan(20);
  });

  it("afterPrivateAuth subscribes to orders(positions/account channels)", () => {
    const c = new BitgetConnector();
    const { sess } = makeSess();
    const sent: any[] = [];
    const send = (p: any) => sent.push(p);
    (c as any).afterPrivateAuth(sess, send);
    expect(sent).toHaveLength(1);
    const sub = sent[0];
    expect(sub.op).toBe("subscribe");
    const channels = sub.args.map((a: any) => a.channel).sort();
    expect(channels).toEqual(["account", "orders", "orders", "positions"]);
    // orders has SPOT + USDT-FUTURES, positions has USDT-FUTURES, account is coin default.
    const instTypes = sub.args.map((a: any) => a.instType).filter(Boolean).sort();
    expect(instTypes).toContain("USDT-FUTURES");
    expect(instTypes).toContain("SPOT");
  });

  it("parsePrivateMessage handles order fill, position update, account balance, and pong", () => {
    const c = new BitgetConnector();
    const { sess } = makeSess();

    // Pong should produce zero events.
    expect((c as any).parsePrivateMessage(sess, "pong")).toEqual([]);

    // Login ack ignored.
    expect((c as any).parsePrivateMessage(sess, JSON.stringify({ event: "login", code: "0" }))).toEqual([]);

    // Order partial fill.
    const orderFrame = JSON.stringify({
      action: "update",
      arg: { instType: "USDT-FUTURES", channel: "orders", instId: "BTCUSDT" },
      data: [{
        instId: "BTCUSDT", orderId: "o-100", clientOid: "cl-1",
        side: "buy", orderType: "limit", price: "60000", size: "0.1",
        fillSize: "0.05", fillPrice: "60000", priceAvg: "60000",
        status: "partially_filled", cTime: Date.now() - 1000, uTime: Date.now(),
        fee: "0.0001", feeCcy: "USDT",
      }],
    });
    const evts = (c as any).parsePrivateMessage(sess, orderFrame);
    const channels = evts.map((e: any) => e.channel);
    expect(channels).toEqual(["order"]);
    expect(sess.openOrders.get("o-100")).toBeTruthy();
    expect(sess.openOrders.get("o-100").status).toBe("partially_filled");
    expect(sess.openOrders.get("o-100").filledQuantity).toBe(0.05);
    expect(sess.fills.length).toBe(1);
    expect(sess.fills[0].orderId).toBe("o-100");
    expect(sess.fills[0].quantity).toBe(0.05);

    // Full fill evicts order and adds a fill.
    const fillFrame = JSON.stringify({
      action: "update",
      arg: { instType: "USDT-FUTURES", channel: "orders", instId: "BTCUSDT" },
      data: [{
        instId: "BTCUSDT", orderId: "o-100", clientOid: "cl-1",
        side: "buy", orderType: "limit", price: "60000", size: "0.1",
        fillSize: "0.1", fillPrice: "60000", priceAvg: "60000",
        status: "filled", cTime: Date.now() - 1000, uTime: Date.now(),
        fee: "0.0002", feeCcy: "USDT",
      }],
    });
    (c as any).parsePrivateMessage(sess, fillFrame);
    expect(sess.openOrders.has("o-100")).toBe(false);
    expect(sess.fills.length).toBe(2);
    expect(sess.fills[1].quantity).toBe(0.05);

    // Position snapshot with non-zero size inserts.
    const posFrame = JSON.stringify({
      action: "snapshot",
      arg: { instType: "USDT-FUTURES", channel: "positions", instId: "BTCUSDT" },
      data: [{
        instId: "BTCUSDT", holdSide: "long", total: "0.1", openPriceAvg: "60000",
        markPrice: "60500", unrealizedPL: "50", leverage: "10", marginMode: "cross",
        cTime: Date.now(), uTime: Date.now(),
      }],
    });
    const pe = (c as any).parsePrivateMessage(sess, posFrame);
    expect(pe.map((x: any) => x.channel)).toEqual(["position"]);
    expect(sess.positions.get("BTC/USDT:USDT")).toBeTruthy();
    expect(sess.positions.get("BTC/USDT:USDT").quantity).toBe(0.1);

    // Position zero deletes.
    const posZero = JSON.stringify({
      action: "update",
      arg: { instType: "USDT-FUTURES", channel: "positions" },
      data: [{ instId: "BTCUSDT", holdSide: "long", total: "0", uTime: Date.now() }],
    });
    (c as any).parsePrivateMessage(sess, posZero);
    expect(sess.positions.has("BTC/USDT:USDT")).toBe(false);

    // Account balance updates balances map.
    const accFrame = JSON.stringify({
      action: "update",
      arg: { channel: "account" },
      data: [{ coin: "USDT", available: "1000", frozen: "50" }],
    });
    const ae = (c as any).parsePrivateMessage(sess, accFrame);
    expect(ae.map((x: any) => x.channel)).toEqual(["balance"]);
    expect(sess.balances.get("USDT").total).toBe(1050);
    expect(sess.balances.get("USDT").free).toBe(1000);
    expect(sess.balances.get("USDT").locked).toBe(50);
  });

  it("public ticker subscribe uses correct instType per market and ping is 'ping'", () => {
    const c = new BitgetConnector();
    const { sess } = makeSess();
    const perp = sess.markets.get("BTC/USDT:USDT");
    const spot = sess.markets.get("BTC/USDT");
    const subPerp = (c as any).buildTickerSubscribePayload(perp);
    const subSpot = (c as any).buildTickerSubscribePayload(spot);
    expect(subPerp.args[0].instType).toBe("USDT-FUTURES");
    expect(subSpot.args[0].instType).toBe("SPOT");
    expect(subPerp.args[0].channel).toBe("ticker");
    expect((c as any).publicPingMessage()).toBe("ping");
    expect((c as any).privatePingMessage()).toBe("ping");

    // parseTickerMessage accepts bidPr/askPr.
    const t = (c as any).parseTickerMessage(sess, perp, { bidPr: "60000", askPr: "60001" });
    expect(t).toEqual({ bid: 60000, ask: 60001 });
  });

  it("cancelOrderImpl for perp POSTs correct path and body", async () => {
    const c = new BitgetConnector();
    const { sess, fakeReq } = makeSess();
    // Track an open perp order.
    sess.openOrders.set("o-200", { id: "o-200", symbol: "BTC/USDT:USDT", side: "buy", quantity: 0.1, filledQuantity: 0 });
    const r = await (c as any).cancelOrderImpl(sess, "o-200");
    expect(r.ok).toBe(true);
    expect(fakeReq).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST", path: "/api/v2/mix/order/cancel-order",
    }));
    const body = fakeReq.mock.calls[0][0].body;
    expect(body.orderId).toBe("o-200");
    expect(body.productType).toBe("usdt-futures");
    expect(body.symbol).toBe("BTCUSDT");
  });
});
