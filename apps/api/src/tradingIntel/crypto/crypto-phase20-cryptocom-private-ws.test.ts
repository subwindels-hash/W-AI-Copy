/**
 * Phase 20 — Crypto.com Exchange v1 private WebSocket user-data stream.
 *
 * Verifies:
 *   - Public WS subscribe/unsubscribe payloads use {method:"subscribe",
 *     params:{channels:["ticker.<raw>"]}} and ticker parsing reads b (bid)
 *     and k (ask) per Crypto.com docs.
 *   - public/respond-heartbeat is replied on public & private WS when the
 *     server sends public/heartbeat.
 *   - authenticatePrivateWs sends public/auth with sig = HMAC-SHA256(secret,
 *     "public/auth"+id+apiKey+""+nonce) and api_key/nonce set.
 *   - afterPrivateAuth subscribes to user.order, user.trade, user.balance,
 *     and user.positions (no instrument filter — wildcard for the agent).
 *   - parsePrivateMessage:
 *       • responds to public/heartbeat with public/respond-heartbeat
 *       • ignores auth/subscribe ack frames
 *       • routes user.order pushes with priorFilled-safe delta fill
 *         accounting and evicts terminal statuses (filled/canceled/rejected)
 *       • routes user.trade pushes as fill events (applyFill called)
 *       • routes user.balance pushes to sess.balances (free=available,
 *         locked=order, total=balance; zero balances deleted; USDT/USDC
 *         tagged with usdValue for equity calcs)
 *       • routes user.positions pushes to sess.positions (zero qty deletes)
 *   - parseTickerMessage reads bid from .b and ask from .k.
 *   - cancelOrderImpl POSTs /exchange/v1/private/cancel-order with order_id
 *     (and instrument_name when known).
 *   - REST signer uses canonical method+id+api_key+paramsStr+nonce ordering
 *     with alphabetically-sorted params key+value concat.
 *   - fetchMarkets returns both spot (BASE/USDT) and perp (BASE/USDT:USDT)
 *     markets using Crypto.com-style BASE_USDT raw symbols.
 *
 * WINDELS is an AI Trading Agent, not a broker. The Crypto.com connector is
 * a client of Crypto.com's public API; WINDELS never matches, fills, or
 * custodies assets.
 */
import { describe, it, expect, vi } from "vitest";
import { CryptocomConnector } from "./exchanges/cryptocom.js";
import { hmacSha256Hex } from "./signing.js";

function makeSess() {
  const requests: any[] = [];
  const fakeReq = vi.fn(async (opts: any) => {
    requests.push(opts);
    if (opts.path === "/exchange/v1/private/get-account-summary") {
      return { data: { id: 1, method: "private/get-account-summary", code: 0, result: { accounts: [] } } };
    }
    if (opts.path === "/exchange/v1/private/get-positions") {
      return { data: { id: 2, method: "private/get-positions", code: 0, result: { data: [] } } };
    }
    if (opts.path === "/exchange/v1/private/get-open-orders") {
      return { data: { id: 3, method: "private/get-open-orders", code: 0, result: { data: [] } } };
    }
    return { data: { code: 0, result: {} } };
  });
  const publicSent: any[] = [];
  const privateSent: any[] = [];
  const sess: any = {
    id: "c1",
    login: "cdc-user",
    creds: { apiKey: "ak", apiSecret: "sk" },
    opts: { config: { _oid: "org-1" } },
    environment: "live",
    http: { request: fakeReq },
    markets: new Map<string, any>([
      ["BTC/USDT", {
        symbol: "BTC/USDT", rawSymbol: "BTC_USDT", base: "BTC", quote: "USDT", settle: "",
        type: "spot", active: true, pricePrecision: 2, qtyPrecision: 5,
        minQty: 0.00001, minNotional: 10, maxLeverage: 1,
        tickSize: 0.01, stepSize: 0.00001, contractSize: 1,
      }],
      ["BTC/USDT:USDT", {
        symbol: "BTC/USDT:USDT", rawSymbol: "BTC_USDT", base: "BTC", quote: "USDT", settle: "USDT",
        type: "perp", active: true, pricePrecision: 2, qtyPrecision: 3,
        minQty: 0.001, minNotional: 5, maxLeverage: 50,
        tickSize: 0.01, stepSize: 0.001, contractSize: 1,
      }],
      ["ETH/USDT", {
        symbol: "ETH/USDT", rawSymbol: "ETH_USDT", base: "ETH", quote: "USDT", settle: "",
        type: "spot", active: true, pricePrecision: 2, qtyPrecision: 5,
        minQty: 0.0001, minNotional: 10, maxLeverage: 1,
        tickSize: 0.01, stepSize: 0.00001, contractSize: 1,
      }],
    ]),
    marketsByRaw: new Map<string, any>([
      ["BTC_USDT", {
        symbol: "BTC/USDT", rawSymbol: "BTC_USDT", base: "BTC", quote: "USDT", settle: "",
        type: "spot", active: true,
      }],
      ["ETH_USDT", {
        symbol: "ETH/USDT", rawSymbol: "ETH_USDT", base: "ETH", quote: "USDT", settle: "",
        type: "spot", active: true,
      }],
    ]),
    balances: new Map(),
    positions: new Map(),
    openOrders: new Map(),
    fills: [],
    clientOrderIdCounter: 0,
    latencyMs: 0,
    snapshot: { accountId: "c1", balances: [], positions: [], openOrders: [] },
    publicWs: { send: (p: any) => publicSent.push(typeof p === "string" ? JSON.parse(p) : p) },
    privateWs: { send: (p: any) => privateSent.push(typeof p === "string" ? JSON.parse(p) : p) },
  };
  return { sess, fakeReq, requests, publicSent, privateSent };
}

describe("Phase 20 — Crypto.com Exchange v1 private WS", () => {
  it("public subscribe sends channels array; ticker parses b=bid, k=ask", () => {
    const c = new CryptocomConnector();
    const btc = (c as any).fetchMarkets; // markets exist; checked in separate test
    const sub = (c as any).buildTickerSubscribePayload({ rawSymbol: "BTC_USDT" });
    expect(sub.method).toBe("subscribe");
    expect(sub.params.channels).toEqual(["ticker.BTC_USDT"]);
    expect(typeof sub.nonce).toBe("number");
    const unsub = (c as any).buildTickerUnsubscribePayload({ rawSymbol: "BTC_USDT" });
    expect(unsub.method).toBe("unsubscribe");
    const { sess } = makeSess();
    const t = (c as any).parseTickerMessage(sess, sess.markets.get("BTC/USDT"), { b: 59999, k: 60001, a: 60000, h: 61000, l: 59000 });
    expect(t).toEqual({ bid: 59999, ask: 60001 });
    expect((c as any).parseTickerMessage(sess, sess.markets.get("BTC/USDT"), {})).toBeNull();
  });

  it("parsePublicMessage responds to public/heartbeat and routes ticker to channel", () => {
    const c = new CryptocomConnector();
    const { sess, publicSent } = makeSess();
    // Server heartbeat → respond.
    const hb = (c as any).parsePublicMessage(sess, JSON.stringify({ id: 42, method: "public/heartbeat", code: 0 }));
    expect(hb).toEqual([]);
    expect(publicSent).toHaveLength(1);
    expect(publicSent[0]).toEqual({ id: 42, method: "public/respond-heartbeat" });
    // Subscribe ack ignored.
    expect((c as any).parsePublicMessage(sess, JSON.stringify({ id: 1, method: "subscribe", code: 0 }))).toEqual([]);
    // Ticker frame routes.
    const tick = {
      id: -1, method: "subscribe", code: 0,
      result: {
        instrument_name: "BTC_USDT", subscription: "ticker.BTC_USDT", channel: "ticker",
        data: [{ b: "59999", k: "60001", a: "60000", h: "61000", l: "59000", i: "BTC_USDT", v: "100", t: Date.now() }],
      },
    };
    const evts = (c as any).parsePublicMessage(sess, JSON.stringify(tick));
    expect(evts).toHaveLength(1);
    expect(evts[0].channel).toBe("ticker:BTC_USDT");
  });

  it("publicPingMessage sends public/respond-heartbeat", () => {
    const c = new CryptocomConnector();
    const p = (c as any).publicPingMessage();
    expect(p.method).toBe("public/respond-heartbeat");
    const q = (c as any).privatePingMessage();
    expect(q.method).toBe("public/respond-heartbeat");
  });

  it("authenticatePrivateWs sends public/auth with HMAC-SHA256 signature over method+id+apiKey+params+nonce", () => {
    const c = new CryptocomConnector();
    const { sess, privateSent } = makeSess();
    (c as any).authenticatePrivateWs(sess, (p: any) => privateSent.push(p));
    expect(privateSent).toHaveLength(1);
    const auth = privateSent[0];
    expect(auth.method).toBe("public/auth");
    expect(auth.api_key).toBe("ak");
    expect(typeof auth.nonce).toBe("number");
    expect(typeof auth.sig).toBe("string");
    expect(auth.sig.length).toBeGreaterThan(20);
    const expected = hmacSha256Hex("sk", `public/auth${auth.id}ak${auth.nonce}`);
    expect(auth.sig).toBe(expected);
  });

  it("afterPrivateAuth subscribes user.order, user.trade, user.balance, user.positions", async () => {
    const c = new CryptocomConnector();
    const { sess, privateSent } = makeSess();
    await (c as any).afterPrivateAuth(sess, (p: any) => privateSent.push(p));
    const channels: string[] = [];
    for (const m of privateSent) {
      expect(m.method).toBe("subscribe");
      channels.push(...m.params.channels);
    }
    expect(channels.sort()).toEqual(["user.balance", "user.order", "user.positions", "user.trade"]);
  });

  it("parsePrivateMessage handles user.order pushes with delta fill accounting and evicts terminal", () => {
    const c = new CryptocomConnector();
    const { sess, privateSent } = makeSess();
    // Heartbeat is replied on private WS too.
    expect((c as any).parsePrivateMessage(sess, JSON.stringify({ id: 7, method: "public/heartbeat" }))).toEqual([]);
    expect(privateSent[0]).toEqual({ id: 7, method: "public/respond-heartbeat" });
    // Auth ack and subscription acks ignored.
    expect((c as any).parsePrivateMessage(sess, JSON.stringify({ id: 1, method: "public/auth", code: 0 }))).toEqual([]);
    expect((c as any).parsePrivateMessage(sess, JSON.stringify({ id: 2, method: "subscribe", code: 0, result: { channel: "user.order" } }))).toEqual([]);

    // Creation push (ACTIVE, 0 filled).
    const created = {
      id: -1, method: "subscribe", code: 0,
      result: {
        subscription: "user.order", channel: "user.order", instrument_name: "BTC_USDT",
        data: [{
          status: "ACTIVE", side: "BUY", price: 0, quantity: "0.10", order_id: "18342311",
          client_oid: "c5f682ed", create_time: Date.now(), update_time: Date.now(),
          type: "LIMIT", instrument_name: "BTC_USDT",
          cumulative_quantity: "0", cumulative_value: "0", avg_price: "0",
          fee_currency: "USDT", time_in_force: "GOOD_TILL_CANCEL",
        }],
      },
    };
    let evts = (c as any).parsePrivateMessage(sess, JSON.stringify(created));
    expect(evts.map((e: any) => e.channel)).toContain("order");
    expect(sess.openOrders.get("18342311")).toBeTruthy();
    expect(sess.openOrders.get("18342311").symbol).toBe("BTC/USDT");
    expect(sess.openOrders.get("18342311").side).toBe("buy");
    expect(sess.openOrders.get("18342311").type).toBe("limit");

    // Partial fill (cumulative_quantity=0.04).
    const partial = {
      id: -1, method: "subscribe", code: 0,
      result: {
        subscription: "user.order", channel: "user.order",
        data: [{
          status: "ACTIVE", order_id: "18342311", client_oid: "c5f682ed",
          instrument_name: "BTC_USDT", side: "BUY", type: "LIMIT",
          price: "60000", quantity: "0.10",
          cumulative_quantity: "0.04", cumulative_value: "2400", avg_price: "60000",
          update_time: Date.now(), create_time: Date.now(),
          fee_currency: "USDT", time_in_force: "GOOD_TILL_CANCEL",
        }],
      },
    };
    evts = (c as any).parsePrivateMessage(sess, JSON.stringify(partial));
    expect(evts.map((e: any) => e.channel)).toContain("order");
    expect(sess.fills.length).toBe(1);
    expect(sess.fills[0].quantity).toBeCloseTo(0.04, 6);
    expect(sess.fills[0].price).toBe(60000);

    // Full fill → FILLED → evicted.
    const full = {
      id: -1, method: "subscribe", code: 0,
      result: {
        subscription: "user.order", channel: "user.order",
        data: [{
          status: "FILLED", order_id: "18342311", instrument_name: "BTC_USDT", side: "BUY", type: "LIMIT",
          price: "60000", quantity: "0.10",
          cumulative_quantity: "0.10", cumulative_value: "6000", avg_price: "60000",
          update_time: Date.now(), create_time: Date.now(),
          fee_currency: "USDT", time_in_force: "GOOD_TILL_CANCEL",
        }],
      },
    };
    (c as any).parsePrivateMessage(sess, JSON.stringify(full));
    expect(sess.openOrders.has("18342311")).toBe(false);
    expect(sess.fills.length).toBe(2);
    expect(sess.fills[1].quantity).toBeCloseTo(0.06, 6);

    // Canceled order → evicted immediately.
    const cancel = {
      id: -1, method: "subscribe", code: 0,
      result: {
        subscription: "user.order", channel: "user.order",
        data: [{
          status: "CANCELED", order_id: "999", client_oid: "c999", side: "SELL", type: "LIMIT",
          instrument_name: "ETH_USDT", quantity: "1.0", price: "3000",
          cumulative_quantity: "0", cumulative_value: "0", avg_price: "0",
          update_time: Date.now(), create_time: Date.now(),
          fee_currency: "USDT", time_in_force: "GOOD_TILL_CANCEL",
        }],
      },
    };
    (c as any).parsePrivateMessage(sess, JSON.stringify(cancel));
    expect(sess.openOrders.has("999")).toBe(false);
  });

  it("parsePrivateMessage routes user.trade pushes as fills and user.balance to balances", () => {
    const c = new CryptocomConnector();
    const { sess } = makeSess();
    // user.trade push.
    const tr = {
      id: -1, method: "subscribe", code: 0,
      result: {
        channel: "user.trade", subscription: "user.trade",
        data: [{
          side: "SELL", instrument_name: "BTC_USDT", fee: "0.50", fee_currency: "USDT",
          trade_id: "9001", create_time: Date.now(), traded_price: "61000", traded_quantity: "0.02", order_id: "777",
        }],
      },
    };
    let evts = (c as any).parsePrivateMessage(sess, JSON.stringify(tr));
    expect(evts.map((e: any) => e.channel)).toContain("fill");
    expect(sess.fills.length).toBe(1);
    expect(sess.fills[0].symbol).toBe("BTC/USDT");
    expect(sess.fills[0].side).toBe("sell");
    expect(sess.fills[0].fee).toBe(0.5);

    // user.balance push (USDT with free/locked split).
    const bal = {
      id: -1, method: "subscribe", code: 0,
      result: {
        channel: "user.balance", subscription: "user.balance",
        data: [{ currency: "USDT", balance: "1050.0", available: "1000.0", order: "50.0", stake: "0" }],
      },
    };
    evts = (c as any).parsePrivateMessage(sess, JSON.stringify(bal));
    expect(evts.map((e: any) => e.channel)).toContain("balance");
    expect(sess.balances.get("USDT")).toBeTruthy();
    expect(sess.balances.get("USDT").free).toBe(1000);
    expect(sess.balances.get("USDT").locked).toBe(50);
    expect(sess.balances.get("USDT").total).toBe(1050);
    expect(sess.balances.get("USDT").usdValue).toBe(1050);

    // Zero balance deletes.
    const zero = {
      id: -1, method: "subscribe", code: 0,
      result: {
        channel: "user.balance", subscription: "user.balance",
        data: [{ currency: "XRP", balance: "0", available: "0", order: "0" }],
      },
    };
    sess.balances.set("XRP", { asset: "XRP", free: 5, locked: 0, total: 5 });
    (c as any).parsePrivateMessage(sess, JSON.stringify(zero));
    expect(sess.balances.has("XRP")).toBe(false);
  });

  it("parsePrivateMessage routes user.positions and deletes zero-quantity positions", () => {
    const c = new CryptocomConnector();
    const { sess } = makeSess();
    // Position push.
    const pos = {
      id: -1, method: "subscribe", code: 0,
      result: {
        channel: "user.positions", subscription: "user.positions",
        data: [{
          account_id: "abc", quantity: "0.0500", liquidation_price: "47665", session_unrealized_pnl: "-14.88",
          cost: "2561.52", open_position_pnl: "-7.30", open_pos_cost: "2561.33", session_pnl: "0",
          pos_initial_margin: "64.68", pos_maintenance_margin: "44.31", market_value: "2546.63",
          mark_price: "50932.6", target_leverage: "50", update_timestamp_ms: Date.now(),
          instrument_name: "BTC_USDT", type: "PERPETUAL_SWAP",
        }],
      },
    };
    let evts = (c as any).parsePrivateMessage(sess, JSON.stringify(pos));
    expect(evts.map((e: any) => e.channel)).toContain("position");
    // Perp positions for BTC_USDT resolve to BTC/USDT:USDT.
    const keys = [...sess.positions.keys()];
    const btcKey = keys.find((k) => k.startsWith("BTC/"));
    expect(btcKey).toBeTruthy();
    expect(sess.positions.get(btcKey!).quantity).toBeCloseTo(0.05, 6);
    expect(sess.positions.get(btcKey!).marketType).toBe("perp");
    // Zero quantity deletes.
    const zeroPos = {
      id: -1, method: "subscribe", code: 0,
      result: {
        channel: "user.positions", subscription: "user.positions",
        data: [{ ...pos.result.data[0], quantity: "0" }],
      },
    };
    (c as any).parsePrivateMessage(sess, JSON.stringify(zeroPos));
    expect(sess.positions.size).toBe(0);
  });

  it("cancelOrderImpl POSTs /exchange/v1/private/cancel-order with order_id and instrument_name", async () => {
    const c = new CryptocomConnector();
    const { sess, fakeReq } = makeSess();
    fakeReq.mockResolvedValueOnce({ data: { id: 1, method: "private/cancel-order", code: 0, result: { order_id: "OZZZ", client_oid: "c" } } } as any);
    sess.openOrders.set("OZZZ", { id: "OZZZ", symbol: "BTC/USDT", side: "buy" as const, quantity: 0.01, filledQuantity: 0 } as any);
    const r = await (c as any).cancelOrderImpl(sess, "OZZZ");
    expect(r.ok).toBe(true);
    expect(fakeReq).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/exchange/v1/private/cancel-order" }));
    // Body must contain params.order_id and params.instrument_name.
    const bodyArg = fakeReq.mock.calls[0][0].body;
    // Body is a plain object (signer stringifies it); signer may have already
    // serialized to string. Handle both.
    const parsedBody = typeof bodyArg === "string" ? JSON.parse(bodyArg) : bodyArg;
    expect(parsedBody.method).toBe("private/cancel-order");
    expect(parsedBody.params.order_id).toBe("OZZZ");
    expect(parsedBody.params.instrument_name).toBe("BTC_USDT");
  });

  it("REST signer uses canonical method+id+api_key+paramsStr+nonce (sorted keys)", async () => {
    const c = new CryptocomConnector();
    const { sess, fakeReq } = makeSess();
    // Build signer manually to test signature determinism.
    const signer = (c as any).buildSigner({ apiKey: "ak", apiSecret: "sk" });
    const body = { id: 11, method: "private/get-order-detail", params: { order_id: "3378" }, nonce: 1587846358253 };
    const headers: any = {};
    const res = await signer.sign({ method: "POST", path: "/exchange/v1/private/get-order-detail", body: JSON.stringify(body), headers, timestampMs: 1587846358253 });
    const signedBody = JSON.parse(res.body);
    expect(signedBody.api_key).toBe("ak");
    expect(signedBody.id).toBe(11);
    expect(signedBody.nonce).toBe(1587846358253);
    // ParamsStr: keys sorted asc → "order_id3378".
    const expectedSig = hmacSha256Hex("sk", "private/get-order-detail11akorder_id33781587846358253");
    expect(signedBody.sig).toBe(expectedSig);
  });

  it("fetchMarkets returns spot and perp entries for 42 bases = 84 markets, all using _USDT raw", async () => {
    const c = new CryptocomConnector();
    const markets = await (c as any).fetchMarkets();
    expect(markets.length).toBe(84);
    const perps = markets.filter((m: any) => m.type === "perp");
    const spots = markets.filter((m: any) => m.type === "spot");
    expect(perps.length).toBe(42);
    expect(spots.length).toBe(42);
    for (const m of markets) {
      expect(m.rawSymbol.endsWith("_USDT")).toBe(true);
    }
    expect(markets.find((m: any) => m.symbol === "BTC/USDT")?.type).toBe("spot");
    expect(markets.find((m: any) => m.symbol === "BTC/USDT:USDT")?.type).toBe("perp");
  });
});
