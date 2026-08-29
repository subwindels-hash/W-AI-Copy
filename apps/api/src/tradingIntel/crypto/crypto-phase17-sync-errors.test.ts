/**
 * Phase 17 — Manual Sync button + Consecutive Error counter.
 *
 * Verifies:
 *   - emitState increments consecutiveErrors on each error and includes
 *     lastErrorAt / consecutiveErrors in the SSE account_state payload.
 *   - A successful sync (resetErrorCounter) clears the counter.
 *
 * WINDELS is an AI Trading Agent, not a broker.
 */
import { describe, it, expect, vi } from "vitest";
import { BinanceConnector } from "./exchanges/binance.js";
import { tradingEvents } from "../trading-events.js";

let seq = 0;
function makeSess() {
  const oid = `p17-${Date.now()}-${seq++}`;
  const sess: any = {
    id: `acct-${seq}`,
    login: "k",
    creds: { apiKey: "k", apiSecret: "s" },
    opts: { config: { _oid: oid } },
    environment: "live",
    http: { request: vi.fn() },
    publicWs: undefined, privateWs: undefined,
    markets: new Map(), marketsByRaw: new Map(),
    balances: new Map(), positions: new Map(), openOrders: new Map(), fills: [],
    clientOrderIdCounter: 0,
    tickHandlers: new Map(),
    status: "connected",
    lastSyncAt: new Date().toISOString(),
    latencyMs: 42,
    connectedAt: new Date().toISOString(),
    lastError: undefined,
    publicTickers: new Map(),
    privateQueue: [],
  };
  return { sess, oid };
}

describe("Phase 17 — Consecutive error counter", () => {
  it("emitState increments consecutiveErrors on error; resetErrorCounter clears it", () => {
    const c = new BinanceConnector();
    const { sess } = makeSess();
    (c as any).accounts.set(sess.id, sess);

    (c as any).emitState(sess.id, "error", "boom");
    expect((c as any).sessionErrors.get(sess.id).count).toBe(1);
    expect(typeof (c as any).sessionErrors.get(sess.id).lastAt).toBe("string");

    (c as any).emitState(sess.id, "error", "boom2");
    expect((c as any).sessionErrors.get(sess.id).count).toBe(2);

    (c as any).resetErrorCounter(sess.id);
    expect((c as any).sessionErrors.has(sess.id)).toBe(false);
  });

  it("emitState SSE payload includes consecutiveErrors and lastErrorAt; clears on success", () => {
    const c = new BinanceConnector();
    const { sess, oid } = makeSess();
    (c as any).accounts.set(sess.id, sess);
    const events: any[] = [];
    const off = tradingEvents.on(oid, (evt: any) => events.push(evt));
    try {
      (c as any).emitState(sess.id, "error", "first");
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("account_state");
      expect(events[0].data.status).toBe("error");
      expect(events[0].data.error).toBe("first");
      expect(events[0].data.consecutiveErrors).toBe(1);
      expect(typeof events[0].data.lastErrorAt).toBe("string");

      (c as any).emitState(sess.id, "error", "second");
      expect(events).toHaveLength(2);
      expect(events[1].data.consecutiveErrors).toBe(2);

      (c as any).emitState(sess.id, "connected");
      expect(events).toHaveLength(3);
      expect(events[2].data.status).toBe("connected");
      expect(events[2].data.error).toBeUndefined();
      expect(events[2].data.consecutiveErrors).toBe(0);
    } finally {
      off();
    }
  });
});
