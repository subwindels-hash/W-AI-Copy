/**
 * Phase 18 — Kraken v1 private WebSocket user-data stream.
 *
 * Verifies:
 *   - preparePrivateWsUrl fetches a fresh WS token via GetWebSocketsToken
 *     and returns wss://ws-auth.kraken.com (URL unchanged; token cached on
 *     session for use in subscribe frames).
 *   - authenticatePrivateWs is a no-op (Kraken v1 has no login frame;
 *     tokens are carried per-subscription).
 *   - afterPrivateAuth sends exactly two subscribe frames (openOrders,
 *     ownTrades), each carrying the fetched token in subscription.token.
 *   - parsePrivateMessage routes v1 array-form messages:
 *       • openOrders updates (full + delta), evicting closed/canceled
 *       • ownTrades fills applied via applyFill with priorFilled safety
 *       • object-form event messages (pong/heartbeat/subscriptionStatus)
 *         are silently ignored.
 *   - public WS ticker subscribe builds correct {event:"subscribe",
 *     pair:["XBT/USD"], subscription:{name:"ticker"}} payload with Kraken
 *     XBT alias for BTC; parseTickerMessage reads a[0] / b[0] best prices;
 *     parsePublicMessage routes array-form ticker frames through the
 *     ticker:<rawSymbol> channel and ignores pong/heartbeat events.
 *   - cancelOrderImpl POSTs to /0/private/CancelOrder with {txid}.
 *   - ping/pong are object-form {event:"ping", reqid} frames on both
 *     public and private WS.
 *
 * WINDELS is an AI Trading Agent, not a broker. The Kraken connector is a
 * client of Kraken's public API; WINDELS never matches, fills, or custodies
 * customer assets.
 */
import { describe, it, expect, vi } from "vitest";
import { KrakenConnector } from "./exchanges/kraken.js";

function makeSess() {
  const requests: any[] = [];
  const fakeReq = vi.fn(async (opts: any) => {
    requests.push(opts);
    // GetWebSocketsToken returns a token; other endpoints default empty.
    if (opts.path === "/0/private/GetWebSocketsToken") {
      return { data: { result: { token: "KRAKEN-WS-TOKEN-xyz", expires: 900 } } };
    }
    if (opts.path === "/0/private/Balance") {
      return { data: { result: { XXBT: "0.5", ZUSD: "10000", USDT: "500" } } };
    }
    if (opts.path === "/0/private/OpenOrders") {
      return { data: { result: { open: {} } } };
    }
    return { data: { result: {} } };
  });
  const sess: any = {
    id: "k1",
    login: "kr-user",
    creds: { apiKey: "kk", apiSecret: "secret-base64" },
    opts: { config: { _oid: "org-1" } },
    environment: "live",
    http: { request: fakeReq },
    markets: new Map<string, any>([
      ["BTC/USD", {
        symbol: "BTC/USD", rawSymbol: "XBTUSD", base: "BTC", quote: "USD", settle: "",
        type: "spot", active: true, pricePrecision: 1, qtyPrecision: 8,
        minQty: 0.00001, minNotional: 5, maxLeverage: 1,
        tickSize: 0.1, stepSize: 0.00001, contractSize: 1,
      }],
      ["BTC/USDT", {
        symbol: "BTC/USDT", rawSymbol: "XBTUSDT", base: "BTC", quote: "USDT", settle: "",
        type: "spot", active: true, pricePrecision: 2, qtyPrecision: 8,
        minQty: 0.00001, minNotional: 10, maxLeverage: 1,
        tickSize: 0.01, stepSize: 0.00001, contractSize: 1,
      }],
      ["ETH/USDT", {
        symbol: "ETH/USDT", rawSymbol: "ETHUSDT", base: "ETH", quote: "USDT", settle: "",
        type: "spot", active: true, pricePrecision: 2, qtyPrecision: 6,
        minQty: 0.0001, minNotional: 10, maxLeverage: 1,
        tickSize: 0.01, stepSize: 0.000001, contractSize: 1,
      }],
    ]),
    marketsByRaw: new Map<string, any>(),
    balances: new Map(),
    positions: new Map(),
    openOrders: new Map(),
    fills: [],
    clientOrderIdCounter: 0,
    latencyMs: 0,
  };
  for (const m of sess.markets.values()) sess.marketsByRaw.set(m.rawSymbol, m);
  return { sess, fakeReq, requests };
}

describe("Phase 18 — Kraken v1 private WS", () => {
  it("preparePrivateWsUrl fetches token via GetWebSocketsToken and returns private ws url", async () => {
    const c = new KrakenConnector();
    const { sess, fakeReq } = makeSess();
    const url = await (c as any).preparePrivateWsUrl(sess);
    expect(url).toBe("wss://ws-auth.kraken.com");
    expect(fakeReq).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST", path: "/0/private/GetWebSocketsToken",
    }));
    expect((sess as any)._krakenToken).toBe("KRAKEN-WS-TOKEN-xyz");
  });

  it("authenticatePrivateWs is a no-op (no login frame on Kraken v1)", () => {
    const c = new KrakenConnector();
    const { sess } = makeSess();
    (sess as any)._krakenToken = "T";
    const sent: any[] = [];
    const send = (p: any) => sent.push(p);
    (c as any).authenticatePrivateWs(sess, send);
    expect(sent).toHaveLength(0);
  });

  it("afterPrivateAuth subscribes to openOrders and ownTrades with token", async () => {
    const c = new KrakenConnector();
    const { sess } = makeSess();
    (sess as any)._krakenToken = "T-123";
    const sent: any[] = [];
    const send = (p: any) => sent.push(p);
    await (c as any).afterPrivateAuth(sess, send);
    expect(sent).toHaveLength(2);
    const names = sent.map((s) => s.subscription.name).sort();
    expect(names).toEqual(["openOrders", "ownTrades"]);
    for (const s of sent) {
      expect(s.event).toBe("subscribe");
      expect(s.subscription.token).toBe("T-123");
      expect(typeof s.reqid).toBe("number");
    }
    // openOrders asks for ratecounter; ownTrades disables snapshot (we already fetched via REST).
    expect(sent.find((s) => s.subscription.name === "openOrders").subscription.ratecounter).toBe(true);
    expect(sent.find((s) => s.subscription.name === "ownTrades").subscription.snapshot).toBe(false);
  });

  it("afterPrivateAuth fetches a token on-the-fly if session has none", async () => {
    const c = new KrakenConnector();
    const { sess, fakeReq } = makeSess();
    // Note: _krakenToken not pre-set.
    const sent: any[] = [];
    const send = (p: any) => sent.push(p);
    await (c as any).afterPrivateAuth(sess, send);
    expect(fakeReq).toHaveBeenCalledWith(expect.objectContaining({ path: "/0/private/GetWebSocketsToken" }));
    expect(sent).toHaveLength(2);
    expect(sent[0].subscription.token).toBe("KRAKEN-WS-TOKEN-xyz");
  });

  it("parsePrivateMessage handles openOrders snapshot + delta fill, evicts closed/canceled", () => {
    const c = new KrakenConnector();
    const { sess } = makeSess();

    // Object-frame events are ignored (pong/heartbeat/subscriptionStatus).
    expect((c as any).parsePrivateMessage(sess, JSON.stringify({ event: "pong" }))).toEqual([]);
    expect((c as any).parsePrivateMessage(sess, JSON.stringify({ event: "heartbeat" }))).toEqual([]);
    expect((c as any).parsePrivateMessage(sess, JSON.stringify({ event: "subscriptionStatus", status: "subscribed", subscription: { name: "openOrders" } }))).toEqual([]);

    // openOrders initial snapshot: one open limit buy 0.1 BTC @ 60000.
    const openSnip = [
      [{
        "O-AAA": {
          avg_price: "0.00000", cost: "0.00000", descr: { pair: "XBT/USD", type: "buy", ordertype: "limit", price: "60000.0" },
          fee: "0.00000", opentm: "1700000000.0", status: "open", vol: "0.10000000", vol_exec: "0.00000000",
          oflags: "fciq", userref: 0,
        },
      }],
      "openOrders",
      { sequence: 1 },
    ];
    let evts = (c as any).parsePrivateMessage(sess, JSON.stringify(openSnip));
    expect(evts.map((e: any) => e.channel)).toEqual(["order"]);
    expect(sess.openOrders.get("O-AAA")).toBeTruthy();
    expect(sess.openOrders.get("O-AAA").symbol).toBe("BTC/USD");
    expect(sess.openOrders.get("O-AAA").side).toBe("buy");
    expect(sess.openOrders.get("O-AAA").price).toBe(60000);
    expect(sess.openOrders.get("O-AAA").quantity).toBe(0.1);
    expect(sess.openOrders.get("O-AAA").filledQuantity).toBe(0);
    expect(sess.fills.length).toBe(0);

    // Partial fill delta: vol_exec becomes 0.04, avg_price set.
    const partial = [
      [{ "O-AAA": { status: "open", vol_exec: "0.04000000", avg_price: "60000.0", fee: "0.10", lastupdated: "1700000010.0" } }],
      "openOrders",
      { sequence: 2 },
    ];
    (c as any).parsePrivateMessage(sess, JSON.stringify(partial));
    expect(sess.fills.length).toBe(1);
    expect(sess.fills[0].quantity).toBeCloseTo(0.04, 6);
    expect(sess.fills[0].price).toBe(60000);
    expect(sess.fills[0].orderId).toBe("O-AAA");

    // Final fill: vol_exec 0.10, status closed.
    const finalFill = [
      [{ "O-AAA": { status: "closed", vol_exec: "0.10000000", avg_price: "60000.0", fee: "0.25", lastupdated: "1700000020.0" } }],
      "openOrders",
      { sequence: 3 },
    ];
    evts = (c as any).parsePrivateMessage(sess, JSON.stringify(finalFill));
    expect(evts.map((e: any) => e.channel)).toEqual(["order"]);
    expect(sess.openOrders.has("O-AAA")).toBe(false);
    expect(sess.fills.length).toBe(2);
    expect(sess.fills[1].quantity).toBeCloseTo(0.06, 6);

    // Canceled order is evicted without a fill.
    const cancelPush = [
      [{ "O-BBB": { status: "canceled", descr: { pair: "ETH/USDT", type: "sell", ordertype: "limit", price: "3000.0" }, vol: "1.0", vol_exec: "0.0", opentm: "1700000000.0" } }],
      "openOrders",
      { sequence: 4 },
    ];
    (c as any).parsePrivateMessage(sess, JSON.stringify(cancelPush));
    expect(sess.openOrders.has("O-BBB")).toBe(false);
  });

  it("parsePrivateMessage routes ownTrades fills to applyFill", () => {
    const c = new KrakenConnector();
    const { sess } = makeSess();
    const fillMsg = [
      [{
        "T-1": {
          cost: "6000.00", fee: "1.20", margin: "0.0", ordertxid: "O-CCC", ordertype: "limit",
          pair: "XBT/USDT", postxid: "T-1", price: "60000.0", time: "1700000100.0",
          type: "buy", vol: "0.10000000",
        },
      }],
      "ownTrades",
      [{ sequence: 99 }],
    ];
    const evts = (c as any).parsePrivateMessage(sess, JSON.stringify(fillMsg));
    expect(evts.map((e: any) => e.channel)).toEqual(["fill"]);
    expect(sess.fills.length).toBe(1);
    expect(sess.fills[0].id).toBe("T-1");
    expect(sess.fills[0].orderId).toBe("O-CCC");
    expect(sess.fills[0].symbol).toBe("BTC/USDT");
    expect(sess.fills[0].side).toBe("buy");
    expect(sess.fills[0].price).toBe(60000);
    expect(sess.fills[0].quantity).toBe(0.1);
  });

  it("public WS ticker subscribe uses XBT alias for BTC and parseTickerMessage reads a[0]/b[0]", () => {
    const c = new KrakenConnector();
    const { sess } = makeSess();
    const btc = sess.markets.get("BTC/USD");
    const eth = sess.markets.get("ETH/USDT");
    const subBtc = (c as any).buildTickerSubscribePayload(btc);
    const subEth = (c as any).buildTickerSubscribePayload(eth);
    expect(subBtc).toEqual({ event: "subscribe", reqid: expect.any(Number), pair: ["XBT/USD"], subscription: { name: "ticker" } });
    expect(subEth.pair).toEqual(["ETH/USDT"]);
    const unsubBtc = (c as any).buildTickerUnsubscribePayload(btc);
    expect(unsubBtc.event).toBe("unsubscribe");
    expect(unsubBtc.pair).toEqual(["XBT/USD"]);

    // parseTickerMessage reads a[0] ask, b[0] bid (v1 ticker format).
    const tick = (c as any).parseTickerMessage(sess, btc, {
      a: ["60001.0", 1, "1.000"], b: ["59999.5", 1, "1.000"], c: ["60000.0", "0.1"],
    });
    expect(tick).toEqual({ bid: 59999.5, ask: 60001.0 });
    // Malformed ticker returns null.
    expect((c as any).parseTickerMessage(sess, btc, { a: ["oops"] })).toBeNull();
  });

  it("parsePublicMessage routes array-form ticker frames, ignores object-frame events", () => {
    const c = new KrakenConnector();
    const { sess } = makeSess();
    expect((c as any).parsePublicMessage(sess, JSON.stringify({ event: "pong" }))).toEqual([]);
    expect((c as any).parsePublicMessage(sess, JSON.stringify({ event: "heartbeat" }))).toEqual([]);
    expect((c as any).parsePublicMessage(sess, JSON.stringify({ event: "subscriptionStatus", status: "subscribed" }))).toEqual([]);
    // Ticker data: [chanId, tickerObj, "ticker", "XBT/USD"]
    const frame = [42, { a: ["60001.0", 1, "1"], b: ["59999.5", 1, "1"] }, "ticker", "XBT/USD"];
    const evts = (c as any).parsePublicMessage(sess, JSON.stringify(frame));
    expect(evts).toHaveLength(1);
    expect(evts[0].channel).toBe("ticker:XBTUSD");
    expect(evts[0].payload.a[0]).toBe("60001.0");
  });

  it("ping frames use object-form {event:'ping', reqid} on both public and private", () => {
    const c = new KrakenConnector();
    const pub = (c as any).publicPingMessage();
    const priv = (c as any).privatePingMessage();
    expect(pub.event).toBe("ping");
    expect(priv.event).toBe("ping");
    expect(typeof pub.reqid).toBe("number");
    expect(typeof priv.reqid).toBe("number");
    // reqid increments so they differ.
    expect(priv.reqid).not.toBe(pub.reqid);
  });

  it("cancelOrderImpl POSTs to /0/private/CancelOrder with txid", async () => {
    const c = new KrakenConnector();
    const { sess, fakeReq } = makeSess();
    sess.openOrders.set("O-100", { id: "O-100", symbol: "BTC/USD", side: "buy", quantity: 0.1, filledQuantity: 0 });
    const r = await (c as any).cancelOrderImpl(sess, "O-100");
    expect(r.ok).toBe(true);
    expect(fakeReq).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/0/private/CancelOrder" }));
    // Caller passes body as object (exchange-http serializes to JSON before
    // signer form-encodes); verify the txid field.
    const last = fakeReq.mock.calls[fakeReq.mock.calls.length - 1][0];
    expect(last.body).toEqual({ txid: "O-100" });
  });

  it("pairToUnified normalizes XBT/USDT pairs and asset aliases via normalizeAsset", async () => {
    // Import the module indirectly through the connector by sending WS messages.
    const c = new KrakenConnector();
    const { sess } = makeSess();
    // Add a DOGE/USDT market so parsePublicMessage can resolve it.
    sess.markets.set("DOGE/USDT", { symbol: "DOGE/USDT", rawSymbol: "XDGUSDT", base: "DOGE", quote: "USDT", type: "spot" });
    sess.marketsByRaw.set("XDGUSDT", sess.markets.get("DOGE/USDT"));
    const frame = [99, { a: ["0.1001", 1, "1"], b: ["0.1000", 1, "1"] }, "ticker", "XDG/USDT"];
    const evts = (c as any).parsePublicMessage(sess, JSON.stringify(frame));
    expect(evts).toHaveLength(1);
    expect(evts[0].channel).toBe("ticker:XDGUSDT");
  });
});
