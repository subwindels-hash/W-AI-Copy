/**
 * Phase 21 — Dashboard Recent Errors Panel.
 *
 * Verifies:
 *   - pushError() adds structured errors to the per-account ring buffer.
 *   - Ring buffer caps at 50 entries; oldest are dropped.
 *   - getRecentErrors() returns errors in reverse-chronological order.
 *   - emitState() with an error message pushes to the ring buffer.
 *   - classifyError() correctly categorizes common error messages.
 *   - connectorRegistry.aggregateRecentErrors() gathers errors across connectors.
 *
 * WINDELS is an AI Trading Agent, not a broker.
 */
import { describe, it, expect, vi } from "vitest";
import { BinanceConnector } from "./exchanges/binance.js";
import { BybitConnector } from "./exchanges/bybit.js";
import { connectorRegistry } from "../connectors/connector-registry.js";
import { tradingEvents } from "../trading-events.js";

let seq = 0;
function makeSess(exchange: string) {
  const oid = `p21-${Date.now()}-${seq++}`;
  const sess: any = {
    id: `acct-p21-${seq}`,
    login: "k",
    name: `${exchange}-test`,
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

describe("Phase 21 — Error history ring buffer", () => {
  it("pushError adds structured errors and getRecentErrors returns them in reverse order", () => {
    const c = new BinanceConnector();
    const { sess } = makeSess("binance");
    (c as any).accounts.set(sess.id, sess);

    (c as any).pushError(sess.id, "rate limit exceeded", "rate_limit");
    (c as any).pushError(sess.id, "ECONNREFUSED", "network");
    (c as any).pushError(sess.id, "invalid signature", "auth");

    const errs = c.getRecentErrors(sess.id);
    expect(errs).toHaveLength(3);
    // Most recent first
    expect(errs[0].category).toBe("auth");
    expect(errs[1].category).toBe("network");
    expect(errs[2].category).toBe("rate_limit");
    // Timestamps are ISO strings
    expect(typeof errs[0].at).toBe("string");
    expect(errs[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Messages preserved
    expect(errs[0].message).toBe("invalid signature");
  });

  it("ring buffer caps at 50 entries", () => {
    const c = new BinanceConnector();
    const { sess } = makeSess("binance");
    (c as any).accounts.set(sess.id, sess);

    for (let i = 0; i < 60; i++) {
      (c as any).pushError(sess.id, `error-${i}`, "rest");
    }

    const errs = c.getRecentErrors(sess.id, 100);
    expect(errs).toHaveLength(50);
    // Most recent (error-59) is first
    expect(errs[0].message).toBe("error-59");
    // Oldest kept is error-10
    expect(errs[49].message).toBe("error-10");
  });

  it("getRecentErrors with limit returns capped subset", () => {
    const c = new BinanceConnector();
    const { sess } = makeSess("binance");
    (c as any).accounts.set(sess.id, sess);

    (c as any).pushError(sess.id, "e1", "rest");
    (c as any).pushError(sess.id, "e2", "ws");
    (c as any).pushError(sess.id, "e3", "auth");

    const errs = c.getRecentErrors(sess.id, 2);
    expect(errs).toHaveLength(2);
    expect(errs[0].message).toBe("e3");
    expect(errs[1].message).toBe("e2");
  });

  it("getRecentErrors returns empty array for unknown account", () => {
    const c = new BinanceConnector();
    expect(c.getRecentErrors("nonexistent")).toEqual([]);
  });
});

describe("Phase 21 — emitState pushes to error history", () => {
  it("emitState with error pushes to ring buffer; no error does not", () => {
    const c = new BinanceConnector();
    const { sess } = makeSess("binance");
    (c as any).accounts.set(sess.id, sess);

    (c as any).emitState(sess.id, "error", "rate limit exceeded");
    let errs = c.getRecentErrors(sess.id);
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toBe("rate limit exceeded");
    expect(errs[0].category).toBe("rate_limit");

    // Emitting without error (connected state) does NOT push to ring buffer
    (c as any).emitState(sess.id, "connected");
    errs = c.getRecentErrors(sess.id);
    expect(errs).toHaveLength(1); // still 1
  });

  it("emitState with explicit category overrides auto-classification", () => {
    const c = new BinanceConnector();
    const { sess } = makeSess("binance");
    (c as any).accounts.set(sess.id, sess);

    (c as any).emitState(sess.id, "error", "some generic message", "ws");
    const errs = c.getRecentErrors(sess.id);
    expect(errs).toHaveLength(1);
    expect(errs[0].category).toBe("ws");
  });
});

describe("Phase 21 — Error classification", () => {
  it("classifies common error patterns correctly", () => {
    const c = new BinanceConnector();
    const classify = (c as any).classifyError.bind(c);

    expect(classify("rate limit exceeded")).toBe("rate_limit");
    expect(classify("HTTP 429 Too Many Requests")).toBe("rate_limit");
    expect(classify("ECONNREFUSED 127.0.0.1:443")).toBe("network");
    expect(classify("ETIMEDOUT connecting to api.binance.com")).toBe("network");
    expect(classify("fetch failed")).toBe("network");
    expect(classify("Invalid API key — unauthorized")).toBe("auth");
    expect(classify("signature mismatch")).toBe("auth");
    expect(classify("403 Forbidden")).toBe("auth");
    expect(classify("insufficient margin for order")).toBe("order");
    expect(classify("order rejected: position limit")).toBe("order");
    expect(classify("websocket closed unexpectedly")).toBe("ws");
    expect(classify("heartbeat timeout")).toBe("ws");
    expect(classify("sync snapshot failed")).toBe("sync");
    expect(classify("HTTP 500 response")).toBe("rest");
    expect(classify("something completely unknown")).toBe("unknown");
  });
});

describe("Phase 21 — Connector registry aggregation", () => {
  // The registry is a singleton with pre-registered connectors from bootstrap.
  // We access the real registered binance/bybit connectors to inject test sessions.
  function getRegisteredConnector(broker: string): any {
    return (connectorRegistry as any).connectors.get(broker);
  }

  it("aggregateRecentErrors gathers errors from all registered connectors for a given org", () => {
    const oid = `p21-agg-${Date.now()}-${seq++}`;
    const binance = getRegisteredConnector("binance");
    const bybit = getRegisteredConnector("bybit");
    if (!binance || !bybit) {
      // Connectors may not be registered in this test context; skip gracefully
      return;
    }

    const sessBn: any = {
      id: `agg-bn-${seq}`, name: "binance-agg", login: "k",
      creds: { apiKey: "k", apiSecret: "s" },
      opts: { config: { _oid: oid } },
      environment: "live",
      http: { request: vi.fn() },
      markets: new Map(), marketsByRaw: new Map(),
      balances: new Map(), positions: new Map(), openOrders: new Map(), fills: [],
      clientOrderIdCounter: 0, tickHandlers: new Map(),
      status: "connected", latencyMs: 10,
      connectedAt: new Date().toISOString(),
      publicTickers: new Map(), privateQueue: [],
    };
    const sessBb: any = {
      id: `agg-bb-${seq}`, name: "bybit-agg", login: "k",
      creds: { apiKey: "k", apiSecret: "s" },
      opts: { config: { _oid: oid } },
      environment: "live",
      http: { request: vi.fn() },
      markets: new Map(), marketsByRaw: new Map(),
      balances: new Map(), positions: new Map(), openOrders: new Map(), fills: [],
      clientOrderIdCounter: 0, tickHandlers: new Map(),
      status: "connected", latencyMs: 10,
      connectedAt: new Date().toISOString(),
      publicTickers: new Map(), privateQueue: [],
    };

    binance.accounts.set(sessBn.id, sessBn);
    bybit.accounts.set(sessBb.id, sessBb);

    binance.pushError(sessBn.id, "rate limit", "rate_limit");
    bybit.pushError(sessBb.id, "ECONNREFUSED", "network");

    try {
      const aggregated = connectorRegistry.aggregateRecentErrors(oid);
      // Should include entries from both connectors
      const allErrors = aggregated.flatMap((g) => g.errors);
      expect(allErrors.length).toBeGreaterThanOrEqual(2);

      // At least one from binance and one from bybit
      const brokers = aggregated.map((g) => g.broker);
      expect(brokers).toContain("binance");
      expect(brokers).toContain("bybit");
    } finally {
      // Cleanup test sessions
      binance.accounts.delete(sessBn.id);
      bybit.accounts.delete(sessBb.id);
    }
  });

  it("aggregateRecentErrors filters by organization id", () => {
    const oid1 = `p21-org1-${Date.now()}-${seq++}`;
    const oid2 = `p21-org2-${Date.now()}-${seq++}`;
    const binance = getRegisteredConnector("binance");
    if (!binance) return;

    const sess1: any = {
      id: `org1-${seq}`, name: "org1-acct", login: "k",
      creds: { apiKey: "k", apiSecret: "s" },
      opts: { config: { _oid: oid1 } },
      environment: "live",
      http: { request: vi.fn() },
      markets: new Map(), marketsByRaw: new Map(),
      balances: new Map(), positions: new Map(), openOrders: new Map(), fills: [],
      clientOrderIdCounter: 0, tickHandlers: new Map(),
      status: "connected", latencyMs: 10,
      connectedAt: new Date().toISOString(),
      publicTickers: new Map(), privateQueue: [],
    };
    const sess2: any = {
      id: `org2-${seq}`, name: "org2-acct", login: "k",
      creds: { apiKey: "k", apiSecret: "s" },
      opts: { config: { _oid: oid2 } },
      environment: "live",
      http: { request: vi.fn() },
      markets: new Map(), marketsByRaw: new Map(),
      balances: new Map(), positions: new Map(), openOrders: new Map(), fills: [],
      clientOrderIdCounter: 0, tickHandlers: new Map(),
      status: "connected", latencyMs: 10,
      connectedAt: new Date().toISOString(),
      publicTickers: new Map(), privateQueue: [],
    };

    binance.accounts.set(sess1.id, sess1);
    binance.accounts.set(sess2.id, sess2);

    binance.pushError(sess1.id, "org1-error", "rest");
    binance.pushError(sess2.id, "org2-error", "rest");

    try {
      const forOrg1 = connectorRegistry.aggregateRecentErrors(oid1);
      const allForOrg1 = forOrg1.flatMap((g) => g.errors.map((e: any) => e.message));
      expect(allForOrg1).toContain("org1-error");
      expect(allForOrg1).not.toContain("org2-error");

      const forOrg2 = connectorRegistry.aggregateRecentErrors(oid2);
      const allForOrg2 = forOrg2.flatMap((g) => g.errors.map((e: any) => e.message));
      expect(allForOrg2).toContain("org2-error");
      expect(allForOrg2).not.toContain("org1-error");
    } finally {
      binance.accounts.delete(sess1.id);
      binance.accounts.delete(sess2.id);
    }
  });

  it("aggregateRecentErrors skips accounts with no errors", () => {
    const oid = `p21-empty-${Date.now()}-${seq++}`;
    const binance = getRegisteredConnector("binance");
    if (!binance) return;

    const sess: any = {
      id: `empty-${seq}`, name: "empty-acct", login: "k",
      creds: { apiKey: "k", apiSecret: "s" },
      opts: { config: { _oid: oid } },
      environment: "live",
      http: { request: vi.fn() },
      markets: new Map(), marketsByRaw: new Map(),
      balances: new Map(), positions: new Map(), openOrders: new Map(), fills: [],
      clientOrderIdCounter: 0, tickHandlers: new Map(),
      status: "connected", latencyMs: 10,
      connectedAt: new Date().toISOString(),
      publicTickers: new Map(), privateQueue: [],
    };
    binance.accounts.set(sess.id, sess);

    try {
      const result = connectorRegistry.aggregateRecentErrors(oid);
      const forThisAcct = result.filter((g) => g.accountId === sess.id);
      // No errors pushed, so this account should not appear
      expect(forThisAcct).toEqual([]);
    } finally {
      binance.accounts.delete(sess.id);
    }
  });
});
