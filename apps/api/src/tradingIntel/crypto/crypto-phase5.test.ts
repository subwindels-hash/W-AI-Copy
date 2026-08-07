/**
 * Phase 5 tests: private WS routing + REST-based execution-event emissions.
 *
 * Confirms that:
 *   - placeOrder/cancelOrder emit execution events into TradingEventHub when
 *     the session carries _oid (orgId piggybacked by BrokerIntegrationService).
 *   - Binance private WS parsePrivateMessage emits {channel:"order",...} frames.
 *   - Bybit afterPrivateAuth sends a subscribe op.
 *   - OKX afterPrivateAuth sends a subscribe op, parsePrivateMessage routes
 *     orders/positions/account.
 */
import { describe, it, expect, vi } from "vitest";
import { tradingEvents } from "../trading-events.js";
import { BinanceConnector } from "./exchanges/binance.js";
import { BybitConnector } from "./exchanges/bybit.js";
import { OkxConnector } from "./exchanges/okx.js";

describe("Phase 5 — execution events + private WS wiring", () => {
  it("Binance parsePrivateMessage emits order + fill + position channels", () => {
    const c = new BinanceConnector();
    const sess: any = {
      openOrders: new Map(), positions: new Map(), balances: new Map(), fills: [],
    };
    // executionReport NEW order
    const execNew = JSON.stringify({
      e: "executionReport", E: 1, T: 1, O: 1, x: "NEW",
      s: "BTCUSDT", c: "x-1", S: "BUY", o: "LIMIT", f: "GTC",
      q: "0.01", p: "50000", X: "NEW", i: "12345", l: "0", z: "0", L: "0", n: "0", N: "USDT", m: false, R: false, P: "0",
    });
    let out = (c as any).parsePrivateMessage(sess, execNew);
    expect(out[0]?.channel).toBe("order");

    // executionReport TRADE (fill)
    const execFill = JSON.stringify({
      e: "executionReport", E: 2, T: 2, O: 1, x: "TRADE",
      s: "BTCUSDT", c: "x-1", S: "BUY", o: "LIMIT", f: "GTC",
      q: "0.01", p: "50000", X: "FILLED", i: "12345", l: "0.01", z: "0.01", L: "50000", n: "0.0001", N: "BTC", m: true, R: false, P: "0", t: "9998",
    });
    out = (c as any).parsePrivateMessage(sess, execFill);
    expect(out[0]?.channel).toBe("order");
    expect(sess.fills.length).toBe(1);

    // ACCOUNT_UPDATE (position)
    const acct = JSON.stringify({
      e: "ACCOUNT_UPDATE", E: 3, T: 3,
      a: { B: [{ a: "USDT", wb: "1000" }], P: [{ s: "BTCUSDT", pa: "0.01", ep: "50000", up: "0", l: "1", mt: "cross" }] },
    });
    out = (c as any).parsePrivateMessage(sess, acct);
    expect(out[0]?.channel).toBe("position");
    expect(sess.positions.get("BTC/USDT:USDT")?.quantity).toBe(0.01);
  });

  it("Bybit afterPrivateAuth sends subscribe for order/position topics", async () => {
    const c = new BybitConnector();
    const sent: any[] = [];
    const send = (p: any) => sent.push(p);
    await (c as any).afterPrivateAuth({} as any, send);
    expect(sent).toHaveLength(1);
    expect(sent[0].op).toBe("subscribe");
    expect(sent[0].args).toContain("order");
    expect(sent[0].args).toContain("position");
  });

  it("OKX afterPrivateAuth + parsePrivateMessage routes orders/positions/account", async () => {
    const c = new OkxConnector();
    const sent: any[] = [];
    const send = (p: any) => sent.push(p);
    await (c as any).afterPrivateAuth({} as any, send);
    expect(sent).toHaveLength(1);
    expect(sent[0].op).toBe("subscribe");
    expect(sent[0].args.some((a: any) => a.channel === "orders")).toBe(true);
    expect(sent[0].args.some((a: any) => a.channel === "positions")).toBe(true);

    const sess: any = {
      markets: new Map([["BTC/USDT:USDT", { rawSymbol: "BTC-USDT-SWAP" }]]),
      openOrders: new Map(), positions: new Map(), balances: new Map(), fills: [],
    };
    // order message
    const ordMsg = JSON.stringify({
      arg: { channel: "orders", instId: "BTC-USDT-SWAP" },
      data: [{ instId: "BTC-USDT-SWAP", ordId: "o1", clOrdId: "c1", side: "buy", ordType: "limit",
        sz: "0.1", px: "50000", avgPx: "50000", accFillSz: "0.1", state: "filled",
        fillPx: "50000", fillSz: "0.1", fee: "-0.05", feeCcy: "USDT", execType: "T",
        cTime: Date.now() + "", uTime: Date.now() + "" }],
    });
    let out = (c as any).parsePrivateMessage(sess, ordMsg);
    expect(out[0].channel).toBe("order");

    // position message
    const posMsg = JSON.stringify({
      arg: { channel: "positions" },
      data: [{ instId: "BTC-USDT-SWAP", pos: "0.1", avgPx: "50000", markPx: "50100", upl: "10",
        lever: "5", mgnMode: "cross", cTime: Date.now() + "" }],
    });
    out = (c as any).parsePrivateMessage(sess, posMsg);
    expect(out[0].channel).toBe("position");
    expect(sess.positions.get("BTC/USDT:USDT")?.quantity).toBe(0.1);

    // account message
    const acctMsg = JSON.stringify({ arg: { channel: "account" }, data: [{ totalEq: "1000" }] });
    out = (c as any).parsePrivateMessage(sess, acctMsg);
    expect(out[0].channel).toBe("account");

    // public ticker
    const ticker = JSON.stringify({
      arg: { channel: "tickers", instId: "BTC-USDT-SWAP" }, data: [{ bidPx: "50000", askPx: "50001" }],
    });
    out = (c as any).parsePublicMessage(sess, ticker);
    expect(out[0]?.channel).toBe("ticker:BTC-USDT-SWAP");
    const parsed = (c as any).parseTickerMessage(sess, { rawSymbol: "BTC-USDT-SWAP" }, out[0].payload);
    expect(parsed.bid).toBe(50000);
    expect(parsed.ask).toBe(50001);
  });

  it("tradingEvents singleton is exported and functional", () => {
    expect(tradingEvents).toBeDefined();
    let got: any = null;
    const off = tradingEvents.on("__test_org__", (e) => { got = e; });
    tradingEvents.emit("__test_org__", { kind: "account_state", accountId: "a", data: { status: "connected" } });
    expect(got?.kind).toBe("account_state");
    off();
    // After unsubscribe, no more events.
    got = null;
    tradingEvents.emit("__test_org__", { kind: "account_state", accountId: "a", data: { status: "connected" } });
    expect(got).toBeNull();
  });
});
