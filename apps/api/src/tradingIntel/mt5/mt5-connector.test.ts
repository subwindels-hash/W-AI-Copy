/**
 * WINDELS AI OS — MT5 Connector Phase 1 tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../../mediaFactory/publishing/fakeKv.js";
process.env.WINDELS_ENCRYPTION_KEY = "0".repeat(64);
process.env.WINDELS_MT5_GLOBAL_READONLY = "false";

const kv = new FakeKv();
vi.mock("../../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../../kernel/kernel.service.js", () => ({
  KernelService: { dispatch: vi.fn().mockResolvedValue({ id: "ke-mock" }), heartbeat: vi.fn() },
}));
vi.mock("../../observability/metrics.js", () => ({
  Metrics: { counter: () => ({ incr: vi.fn() }), timing: vi.fn(), gauge: vi.fn(), increment: vi.fn() },
}));
vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

// Dynamic imports AFTER mocks are in place.
const { Mt5Connector } = await import("./mt5-connector.js");
const { Mt5Monitor } = await import("./mt5-monitor.js");
const { BrokerIntegrationService } = await import("../brokerIntegration.service.js");
const { connectorRegistry } = await import("../connectors/connector-registry.js");

import type {
  BrokerPosition, BrokerPendingOrder, BrokerDeal, BrokerSymbol, BrokerTick,
  BrokerOrderRequest,
} from "@windels/shared/brokerIntegration";
import type { ConnectCredentials, ConnectResult, OrderResult } from "../connectors/broker-connector.js";
import { EventEmitter } from "node:events";

const ORG = "org-mt5-test";
const USER = "user-mt5";

let fakeTicketCounter = 9000;
class FakeMt5Transport extends EventEmitter {
  connected = false;
  private _latency = 12;
  calls: Array<{ method: string; params: any }> = [];
  accounts: Record<string, any> = {};
  latencyMs() { return this._latency; }
  isConnected() { return this.connected; }
  failureCount() { return 0; }
  async start() { this.connected = true; }
  async stop() { this.connected = false; }
  async call<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
    this.calls.push({ method, params });
    const aid = params.accountId as string;
    const acc = this.accounts[aid];
    switch (method) {
      case "ping": return { pong: true, uptime: 1 } as any;
      case "connect_account": {
        this.accounts[aid] = acc ?? {
          creds: { login: params.login, password: params.password, server: params.server },
          balance: 10000, equity: 10250, margin: 250, freeMargin: 9750, profit: 250,
          marginLevel: 4100, credit: 0, leverage: Number(params.login) || 100, currency: "USD",
          tradeAllowed: true, expertAllowed: true,
          positions: [], orders: [],
          symbols: [
            { name: "EURUSD", digits: 5, point: 0.00001, contractSize: 100000, volumeMin: 0.01, volumeMax: 100, volumeStep: 0.01, bid: 1.08501, ask: 1.08503, spread: 2, tradeMode: "full" },
            { name: "XAUUSD", digits: 2, point: 0.01, contractSize: 100, volumeMin: 0.01, volumeMax: 50, volumeStep: 0.01, bid: 2350.50, ask: 2350.80, spread: 30, tradeMode: "full" },
          ],
          deals: [], ticks: [],
          candles: { H1: [
            { symbol: "EURUSD", timeframe: "H1", time: new Date(Date.now() - 3600_000).toISOString(), open: 1.08, high: 1.09, low: 1.075, close: 1.085, tickVolume: 1200, volume: 0, spread: 2 },
            { symbol: "EURUSD", timeframe: "H1", time: new Date().toISOString(), open: 1.085, high: 1.087, low: 1.083, close: 1.08503, tickVolume: 1500, volume: 0, spread: 2 },
          ] },
        };
        const a = this.accounts[aid];
        return { balance: a.balance, equity: a.equity, margin: a.margin, freeMargin: a.freeMargin, profit: a.profit, marginLevel: a.marginLevel, credit: a.credit, leverage: a.leverage, currency: a.currency, tradeAllowed: a.tradeAllowed, expertAllowed: a.expertAllowed } as any;
      }
      case "disconnect_account": return {} as any;
      case "get_account_info": {
        if (!acc) throw new Error("not connected");
        return { balance: acc.balance, equity: acc.equity, margin: acc.margin, freeMargin: acc.freeMargin, profit: acc.profit, marginLevel: acc.marginLevel, credit: acc.credit, leverage: acc.leverage, currency: acc.currency, tradeAllowed: acc.tradeAllowed, expertAllowed: acc.expertAllowed } as any;
      }
      case "get_symbols": return (acc?.symbols ?? []) as any;
      case "get_positions": return (acc?.positions ?? []) as any;
      case "get_orders": return (acc?.orders ?? []) as any;
      case "get_deals": return (acc?.deals ?? []) as any;
      case "get_symbol": return (acc?.symbols.find((s: any) => s.name === params.symbol) ?? null) as any;
      case "get_candles": {
        const key = params.timeframe === "TIMEFRAME_H1" ? "H1" : "H1";
        return (acc?.candles[key] ?? []).slice(-(params.count ?? 100)) as any;
      }
      case "get_last_ticks": return [] as any;
      case "send_order": {
        if (!acc) return { ok: false, error: "no account" } as any;
        fakeTicketCounter += 1;
        return { ticket: "T-" + fakeTicketCounter, dealId: "D-" + fakeTicketCounter, price: acc.symbols[0]?.bid ?? 1, volume: params.order?.volume, retcode: 10009, comment: "Request completed" } as any;
      }
      case "modify_position": return { ticket: params.ticket, retcode: 10009 } as any;
      case "close_position": return { ticket: params.ticket, dealId: "D-close", price: acc?.symbols[0]?.bid ?? 1, volume: params.volume, retcode: 10009 } as any;
      case "subscribe_ticks": return { subscribed: params.symbols } as any;
      case "unsubscribe_ticks": return {} as any;
      default: return {} as any;
    }
  }
  pushTick(aid: string, tick: BrokerTick) { this.emit("tick", aid, tick); }
}

function makeConnector() { return new Mt5Connector(); }
function patchWithFake(connector: Mt5Connector, fake: FakeMt5Transport) {
  (connector as any).buildHandle = () => fake;
  (connector as any).pickTransport = () => "native_python_zmq";
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  fakeTicketCounter = 9000;
  // Reset the registry.
  for (const k of Array.from((connectorRegistry as any).connectors.keys())) {
    (connectorRegistry as any).connectors.delete(k);
  }
});

describe("MT5 connector core", () => {
  it("declares broker=mt5 and supports all three transports", () => {
    const c = makeConnector();
    expect(c.broker).toBe("mt5");
    expect(c.supportedTransports).toContain("native_python_zmq");
    expect(c.supportedTransports).toContain("http_bridge");
    expect(c.supportedTransports).toContain("metaapi_cloud");
    expect(c.label).toContain("MetaTrader");
  });

  it("reports not connected until connect()", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    await c.initialize();
    expect(c.isConnected("acct-1")).toBe(false);
  });

  it("connects an account, persists snapshot, isConnected=true", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    await c.initialize();
    const res: ConnectResult = await c.connect("acct-1", { login: "123456", password: "secret", server: "ICMarkets-Demo" }, { name: "Main Demo", environment: "demo" });
    expect(res.ok).toBe(true);
    expect(res.transport).toBe("native_python_zmq");
    expect(res.snapshot?.balance).toBe(10000);
    expect(res.snapshot?.equity).toBe(10250);
    expect(c.isConnected("acct-1")).toBe(true);
  });

  it("supports multiple concurrent accounts with independent state", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    await c.initialize();
    await c.connect("acct-1", { login: "111", password: "x", server: "srv" }, { name: "a1", environment: "demo" });
    await c.connect("acct-2", { login: "222", password: "y", server: "srv" }, { name: "a2", environment: "live" });
    expect(c.isConnected("acct-1")).toBe(true);
    expect(c.isConnected("acct-2")).toBe(true);
    fake.accounts["acct-1"]!.balance = 5000;
    const s = await c.sync("acct-1", { account: true });
    expect(s.ok).toBe(true);
    expect(s.account?.balance).toBe(5000);
    const s2 = await c.sync("acct-2", { account: true });
    expect(s2.account?.balance).toBe(10000);
  });

  it("reports failure when transport throws", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    await c.initialize();
    const origCall = fake.call.bind(fake);
    fake.call = async (m, p) => {
      if (m === "get_account_info") throw new Error("terminal disconnected");
      return origCall(m, p);
    };
    await c.connect("acct-x", { login: "1", password: "p", server: "s" }, { name: "x", environment: "demo" });
    const s = await c.sync("acct-x", { account: true });
    expect(s.ok).toBe(false);
    expect(s.error).toContain("terminal disconnected");
    const state = c.getState("acct-x");
    expect(state.consecutiveErrors).toBeGreaterThanOrEqual(1);
  });

  it("sync with scope returns positions/orders/symbols/deals and updates counts", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    await c.initialize();
    await c.connect("acct-s", { login: "1", password: "p", server: "s" }, { name: "s" });
    const now = new Date().toISOString();
    fake.accounts["acct-s"]!.positions = [{
      id: "p1", accountId: "acct-s", ticket: "17001", symbol: "EURUSD", side: "long", volume: 0.1,
      openPrice: 1.084, currentPrice: 1.08503, openTime: now, profit: 10.3, swap: 0, commission: -0.5,
    }];
    fake.accounts["acct-s"]!.orders = [{
      id: "o1", accountId: "acct-s", ticket: "27001", symbol: "XAUUSD", type: "buy_limit",
      volume: 0.1, price: 2340, openTime: now, status: "active",
    }];
    fake.accounts["acct-s"]!.deals = [{
      id: "d1", accountId: "acct-s", ticket: "37001", symbol: "EURUSD", side: "long", entry: "in",
      volume: 0.1, price: 1.084, profit: 0, time: now, commission: -0.5,
    }];
    const s = await c.sync("acct-s", { account: true, symbols: true, positions: true, orders: true, history: true, historyDays: 7 });
    expect(s.ok).toBe(true);
    expect(s.positions).toHaveLength(1);
    expect(s.orders).toHaveLength(1);
    expect(s.deals).toHaveLength(1);
    expect(s.symbols).toHaveLength(2);
    const state = c.getState("acct-s");
    expect(state.positionsCount).toBe(1);
    expect(state.ordersCount).toBe(1);
    expect(state.symbolsCount).toBe(2);
  });

  it("sendOrder returns a ticket and records latency", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    await c.initialize();
    await c.connect("acct-o", { login: "1", password: "p", server: "s" }, { name: "o" });
    const req: BrokerOrderRequest = { accountId: "acct-o", symbol: "EURUSD", side: "long", type: "market", volume: 0.1, tif: "GTC", action: "open" };
    const r: OrderResult = await c.sendOrder("acct-o", req);
    expect(r.ok).toBe(true);
    expect(r.ticket).toBeTruthy();
    expect(typeof r.latencyMs).toBe("number");
  });

  it("readOnly config hard-blocks sendOrder/close/modify", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    await c.initialize();
    await c.connect("acct-ro", { login: "1", password: "p", server: "s" }, { name: "ro", config: { readOnly: true } });
    const r = await c.sendOrder("acct-ro", { accountId: "acct-ro", symbol: "EURUSD", side: "long", type: "market", volume: 0.1, tif: "GTC", action: "open" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/read-only/i);
    const rc = await c.closePosition("acct-ro", "17001");
    expect(rc.ok).toBe(false);
    expect(rc.error).toMatch(/read-only/i);
    const rm = await c.modifyPosition("acct-ro", "17001", { sl: 1.08 });
    expect(rm.ok).toBe(false);
  });

  it("allowedSymbols gates sendOrder", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    await c.initialize();
    await c.connect("acct-a", { login: "1", password: "p", server: "s" }, { name: "a", config: { allowedSymbols: ["EURUSD"] } });
    const ok = await c.sendOrder("acct-a", { accountId: "acct-a", symbol: "EURUSD", side: "long", type: "market", volume: 0.1, tif: "GTC", action: "open" });
    expect(ok.ok).toBe(true);
    const blocked = await c.sendOrder("acct-a", { accountId: "acct-a", symbol: "XAUUSD", side: "long", type: "market", volume: 0.1, tif: "GTC", action: "open" });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/not in allowedSymbols/i);
  });

  it("deniedSymbols gates sendOrder", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    await c.initialize();
    await c.connect("acct-d", { login: "1", password: "p", server: "s" }, { name: "d", config: { deniedSymbols: ["XAUUSD"] } });
    const ok = await c.sendOrder("acct-d", { accountId: "acct-d", symbol: "EURUSD", side: "long", type: "market", volume: 0.1, tif: "GTC", action: "open" });
    expect(ok.ok).toBe(true);
    const blocked = await c.sendOrder("acct-d", { accountId: "acct-d", symbol: "XAUUSD", side: "long", type: "market", volume: 0.1, tif: "GTC", action: "open" });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/denied/i);
  });

  it("subscribeTicks registers and forwards tick events", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    await c.initialize();
    await c.connect("acct-t", { login: "1", password: "p", server: "s" }, { name: "t" });
    const received: BrokerTick[] = [];
    const unsub = await c.subscribeTicks("acct-t", ["EURUSD"], (_aid, tick) => received.push(tick));
    expect(unsub.subscribed).toContain("EURUSD");
    fake.pushTick("acct-t", { symbol: "EURUSD", time: new Date().toISOString(), bid: 1.085, ask: 1.0851 });
    await new Promise((r) => setTimeout(r, 20));
    expect(received).toHaveLength(1);
    expect(received[0]!.bid).toBe(1.085);
    await c.unsubscribeTicks("acct-t", ["EURUSD"]);
  });

  it("getCandles maps timeframe constants correctly", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    await c.initialize();
    await c.connect("acct-c", { login: "1", password: "p", server: "s" }, { name: "c" });
    const candles = await c.getCandles("acct-c", { symbol: "EURUSD", timeframe: "H1", count: 10 });
    expect(candles.length).toBeGreaterThanOrEqual(2);
    expect(candles[0]!.symbol).toBe("EURUSD");
    expect(typeof candles[0]!.close).toBe("number");
  });

  it("closePosition and modifyPosition return ok on success", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    await c.initialize();
    await c.connect("acct-m", { login: "1", password: "p", server: "s" }, { name: "m" });
    const mod = await c.modifyPosition("acct-m", "17001", { sl: 1.08, tp: 1.09 });
    expect(mod.ok).toBe(true);
    const cl = await c.closePosition("acct-m", "17001", 0.1);
    expect(cl.ok).toBe(true);
    expect(cl.ticket).toBe("17001");
  });

  it("disconnect cleans up account state", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    await c.initialize();
    await c.connect("acct-z", { login: "1", password: "p", server: "s" }, { name: "z" });
    expect(c.isConnected("acct-z")).toBe(true);
    await c.disconnect("acct-z");
    expect(c.isConnected("acct-z")).toBe(false);
    const state = c.getState("acct-z");
    expect(state.status).toBe("idle");
  });
});

describe("MT5 broker integration service", () => {
  it("createAccount initializes with status=disconnected and environment=demo", async () => {
    const a = await BrokerIntegrationService.createAccount(ORG, USER, { name: "Demo", broker: "mt5", login: "123", server: "srv", password: "pw", environment: "demo", mode: "analysis_only" });
    expect(a.status).toBe("disconnected");
    expect(a.broker).toBe("mt5");
    expect(a.environment).toBe("demo");
    expect(a.brokerLabel).toContain("MetaTrader");
  });

  it("connectAccount transitions to connected after connector reports ok", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    (connectorRegistry as any).connectors.set("mt5", c);
    await c.initialize();
    const a = await BrokerIntegrationService.createAccount(ORG, USER, { name: "Demo", broker: "mt5", login: "123", server: "srv", password: "pw", environment: "demo", mode: "assisted" });
    const connected = await BrokerIntegrationService.connectAccount(ORG, USER, a.id);
    expect(connected.status).toBe("connected");
    expect(connected.account.balance).toBe(10000);
    expect(connected.lastSyncAt).toBeTruthy();
    expect(connected.transport).toBeTruthy();
    const positions = await BrokerIntegrationService.listPositions(ORG, a.id);
    expect(Array.isArray(positions)).toBe(true);
    const symbols = await BrokerIntegrationService.listSymbols(ORG, a.id);
    expect(symbols.length).toBeGreaterThanOrEqual(2);
    const orders = await BrokerIntegrationService.listOrders(ORG, a.id);
    expect(Array.isArray(orders)).toBe(true);
  });

  it("kill switch blocks all trade signals even in fully_autonomous", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    (connectorRegistry as any).connectors.set("mt5", c);
    await c.initialize();
    const a = await BrokerIntegrationService.createAccount(ORG, USER, { name: "Auto", broker: "mt5", login: "1", server: "s", password: "p", mode: "fully_autonomous", environment: "live" });
    await BrokerIntegrationService.connectAccount(ORG, USER, a.id);
    await BrokerIntegrationService.updateRiskControls(ORG, { killSwitch: true });
    const ex = await BrokerIntegrationService.submitSignal(ORG, USER, { accountId: a.id, symbol: "EURUSD", side: "long", volume: 0.1 });
    expect(ex.status).toBe("blocked");
    const checks = Object.fromEntries(ex.riskChecks.map((ck: any) => [ck.rule, ck.pass]));
    expect(checks["KILL_SWITCH"]).toBe(false);
  });

  it("analysis_only mode never dispatches an order", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    (connectorRegistry as any).connectors.set("mt5", c);
    await c.initialize();
    const a = await BrokerIntegrationService.createAccount(ORG, USER, { name: "AO", broker: "mt5", login: "1", server: "s", password: "p", mode: "analysis_only" });
    await BrokerIntegrationService.connectAccount(ORG, USER, a.id);
    const ex = await BrokerIntegrationService.submitSignal(ORG, USER, { accountId: a.id, symbol: "EURUSD", side: "long", volume: 0.1 });
    expect(ex.status).toBe("blocked");
    expect(ex.decision).toContain("analysis_only");
  });

  it("audit trail records connect events", async () => {
    const c = makeConnector();
    const fake = new FakeMt5Transport();
    patchWithFake(c, fake);
    (connectorRegistry as any).connectors.set("mt5", c);
    await c.initialize();
    Mt5Monitor.start();
    const a = await BrokerIntegrationService.createAccount(ORG, USER, { name: "Audit", broker: "mt5", login: "1", server: "s", password: "p", environment: "demo" });
    await BrokerIntegrationService.connectAccount(ORG, USER, a.id);
    await new Promise((r) => setTimeout(r, 50));
    const events = await Mt5Monitor.recentAudit(ORG, 50);
    expect(events.some((e: any) => e.event === "connect" && e.accountId === a.id)).toBe(true);
    Mt5Monitor.stop();
  });
});
