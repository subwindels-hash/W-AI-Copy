/**
 * Phase 12 — KuCoin bullet-private WebSocket.
 *
 * Verifies:
 *   - preparePrivateWsUrl builds a valid WSS URL from /api/v1/bullet-private
 *     (endpoint + ?token=...&connectId=...) for every (re)connect.
 *   - afterPrivateAuth subscribes to /spotMarket/tradeOrders and /account/balance.
 *   - parsePrivateMessage routes order/match/balance frames into the right
 *     channels and mutates the local book (filled orders evicted, fills
 *     appended, balances updated).
 *
 * WINDELS is an AI Trading Agent, not a broker. The KuCoin connector is a
 * client of KuCoin's public API; it does not match, fill, or custody.
 */
import { describe, it, expect, vi } from "vitest";
import { KucoinConnector } from "./exchanges/kucoin.js";

function makeSess() {
  const requests: any[] = [];
  const fakeReq = vi.fn(async (opts: any) => {
    requests.push(opts);
    if (opts.path === "/api/v1/bullet-private") {
      return {
        data: {
          code: "200000",
          data: {
            token: "tok-abc",
            instanceServers: [{ endpoint: "wss://ws-example.kucoin.com", pingInterval: 18000, encrypt: true }],
          },
        },
      };
    }
    return { data: {} };
  });
  const sess: any = {
    id: "k1",
    login: "kc-user",
    creds: { apiKey: "k", apiSecret: "s", passphrase: "p" },
    opts: { config: { _oid: "org-1" } },
    environment: "live",
    http: { request: fakeReq },
    markets: new Map([["BTC/USDT", {
      symbol: "BTC/USDT", rawSymbol: "BTC-USDT", base: "BTC", quote: "USDT", settle: "",
      type: "spot", active: true, pricePrecision: 2, qtyPrecision: 5,
      minQty: 0.00001, minNotional: 5, maxLeverage: 1,
      tickSize: 0.01, stepSize: 0.00001, contractSize: 1,
    }]]),
    marketsByRaw: new Map([["BTC-USDT", {
      symbol: "BTC/USDT", rawSymbol: "BTC-USDT", base: "BTC", quote: "USDT", settle: "",
      type: "spot", active: true, pricePrecision: 2, qtyPrecision: 5,
      minQty: 0.00001, minNotional: 5, maxLeverage: 1,
      tickSize: 0.01, stepSize: 0.00001, contractSize: 1,
    }]]),
    balances: new Map(),
    positions: new Map(),
    openOrders: new Map(),
    fills: [],
    clientOrderIdCounter: 0,
    latencyMs: 0,
  };
  return { sess, fakeReq, requests };
}

describe("Phase 12 — KuCoin bullet-private WS", () => {
  it("preparePrivateWsUrl hits bullet-private and returns endpoint with token+connectId", async () => {
    const c = new KucoinConnector();
    const { sess, fakeReq } = makeSess();
    const url = await (c as any).preparePrivateWsUrl(sess);
    expect(fakeReq).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/api/v1/bullet-private" }));
    expect(url).toMatch(/^wss:\/\/ws-example\.kucoin\.com\?token=tok-abc&connectId=wkc-k1-/);
  });

  it("afterPrivateAuth sends subscribe frames for orders and balances", () => {
    const c = new KucoinConnector();
    const { sess } = makeSess();
    const sent: any[] = [];
    const send = (p: any) => sent.push(p);
    (c as any).afterPrivateAuth(sess, send);
    expect(sent).toHaveLength(2);
    const topics = sent.map((s) => s.topic).sort();
    expect(topics).toContain("/spotMarket/tradeOrders");
    expect(topics).toContain("/account/balance");
    for (const s of sent) expect(s.privateChannel).toBe(true);
  });

  it("parsePrivateMessage routes tradeOrders match frames into order+fill and balance updates", () => {
    const c = new KucoinConnector();
    const { sess } = makeSess();
    const matchFrame = JSON.stringify({
      type: "message", topic: "/spotMarket/tradeOrders", subject: "match",
      data: {
        orderId: "ord-1", clientOid: "cl-1", symbol: "BTC-USDT", side: "buy",
        orderType: "limit", price: "60000", size: "0.1", filledSize: "0.1",
        matchPrice: "60000", matchSize: "0.1", liquidity: "maker",
        status: "done", ts: (Date.now() * 1_000_000).toString(), orderTime: Date.now(),
      },
    });
    const evts = (c as any).parsePrivateMessage(sess, matchFrame);
    const channels = evts.map((e: any) => e.channel).sort();
    expect(channels).toContain("order");
    expect(channels).toContain("fill");
    expect(sess.openOrders.has("ord-1")).toBe(false); // done -> removed
    expect(sess.fills.length).toBe(1);
    expect(sess.fills[0].orderId).toBe("ord-1");

    const balFrame = JSON.stringify({
      type: "message", topic: "/account/balance", subject: "balance",
      data: { currency: "USDT", available: "1000", hold: "0", total: "1000" },
    });
    const be = (c as any).parsePrivateMessage(sess, balFrame);
    expect(be.map((x: any) => x.channel)).toEqual(["balance"]);
    expect(sess.balances.get("USDT").total).toBe(1000);
  });

  it("parsePrivateMessage ignores ack/welcome/pong", () => {
    const c = new KucoinConnector();
    const { sess } = makeSess();
    for (const t of ["pong", "ack", "welcome"]) {
      expect((c as any).parsePrivateMessage(sess, JSON.stringify({ type: t }))).toEqual([]);
    }
  });
});
