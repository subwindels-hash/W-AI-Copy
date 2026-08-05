/**
 * WINDELS AI OS — Broker Integration Layer tests.
 *
 * Pins the real, honest, governance-enforcing behavior:
 *   - credentials are stored encrypted and never returned
 *   - trading modes gate execution (analysis_only never executes; assisted
 *     requires approval; semi/fully autonomous execute within risk rules)
 *   - kill switch hard-halts all new execution
 *   - the AI never bypasses risk controls
 *   - strategy management + backtest produce real measured results
 *   - org scoping is enforced
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
process.env.WINDELS_ENCRYPTION_KEY = "0".repeat(64);

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { BrokerIntegrationService, CONNECTOR_CATALOG } = await import("./brokerIntegration.service.js");

const ORG = "org-bri";
const OTHER = "org-other";
const USER = "user-1";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

const accInput = { name: "Main MT5", broker: "mt5" as const, login: "12345", server: "ICMarkets", password: "supersecret", mode: "assisted" as const, currency: "USD", leverage: 100 };

describe("broker accounts", () => {
  it("connector catalog lists all broker types", () => {
    expect(CONNECTOR_CATALOG.length).toBeGreaterThanOrEqual(6);
    expect(CONNECTOR_CATALOG.map((c) => c.broker)).toContain("mt5");
    expect(CONNECTOR_CATALOG.map((c) => c.broker)).toContain("crypto");
  });

  it("stores credentials encrypted and never returns them", async () => {
    const a = await BrokerIntegrationService.createAccount(ORG, USER, accInput);
    expect(a.status).toBe("requires_config"); // honest — no live connector in sandbox
    // The returned account has no password field at all.
    expect((a as any).password).toBeUndefined();
    // Stored credentials are an encrypted blob, not plaintext.
    const stored = await kv.get(`bri:${ORG}:creds:${a.id}`);
    expect(stored).toBeTruthy();
    expect(stored).not.toContain("supersecret");
    // Verify can decrypt.
    const v = await BrokerIntegrationService.verifyCredentials(ORG, a.id);
    expect(v.valid).toBe(true);
    expect(v.login).toBe("12345");
  });

  it("is org-scoped", async () => {
    const a = await BrokerIntegrationService.createAccount(ORG, USER, accInput);
    await expect(BrokerIntegrationService.getAccount(OTHER, a.id)).resolves.toBeNull();
  });
});

describe("trade execution supervisor (modes + risk)", () => {
  it("analysis_only never executes — blocks with a clear decision", async () => {
    const a = await BrokerIntegrationService.createAccount(ORG, USER, { ...accInput, mode: "analysis_only" });
    const ex = await BrokerIntegrationService.submitSignal(ORG, USER, { accountId: a.id, symbol: "EURUSD", side: "long", volume: 0.1 });
    expect(ex.status).toBe("blocked");
    expect(ex.decision).toContain("analysis_only");
  });

  it("assisted mode → pending_approval, then approve/reject", async () => {
    const a = await BrokerIntegrationService.createAccount(ORG, USER, { ...accInput, mode: "assisted" });
    const ex = await BrokerIntegrationService.submitSignal(ORG, USER, { accountId: a.id, symbol: "EURUSD", side: "long", volume: 0.1 });
    expect(ex.status).toBe("pending_approval");
    const approved = await BrokerIntegrationService.approveExecution(ORG, ex.id, USER);
    expect(approved.status).toBe("approved");
    const rejected = await BrokerIntegrationService.submitSignal(ORG, USER, { accountId: a.id, symbol: "GBPUSD", side: "short", volume: 0.2 });
    const rej = await BrokerIntegrationService.rejectExecution(ORG, rejected.id, USER);
    expect(rej.status).toBe("blocked");
  });

  it("semi_autonomous executes within rules but blocks on kill switch", async () => {
    const a = await BrokerIntegrationService.createAccount(ORG, USER, { ...accInput, mode: "semi_autonomous" });
    const ex = await BrokerIntegrationService.submitSignal(ORG, USER, { accountId: a.id, symbol: "EURUSD", side: "long", volume: 0.1 });
    expect(["approved", "submitted"]).toContain(ex.status);
    // Kill switch hard-halts.
    await BrokerIntegrationService.updateRiskControls(ORG, { killSwitch: true });
    const blocked = await BrokerIntegrationService.submitSignal(ORG, USER, { accountId: a.id, symbol: "USDJPY", side: "long", volume: 0.1 });
    expect(blocked.status).toBe("blocked");
    expect(blocked.riskChecks.some((c) => c.rule === "KILL_SWITCH" && !c.pass)).toBe(true);
  });

  it("blocks positions exceeding the max position size limit", async () => {
    const a = await BrokerIntegrationService.createAccount(ORG, USER, { ...accInput, mode: "semi_autonomous" });
    await BrokerIntegrationService.updateRiskControls(ORG, { maxPositionSizeUsd: 1000 });
    const ex = await BrokerIntegrationService.submitSignal(ORG, USER, { accountId: a.id, symbol: "EURUSD", side: "long", volume: 100, stopLoss: 100 });
    expect(ex.status).toBe("blocked");
    expect(ex.riskChecks.some((c) => c.rule === "POSITION_SIZE_LIMIT" && !c.pass)).toBe(true);
  });
});

describe("strategies", () => {
  it("creates, toggles, backtests (real measured) and removes", async () => {
    const s = await BrokerIntegrationService.createStrategy(ORG, USER, { name: "Trend v1", type: "rule", logic: { maxTrades: 30, winRate: 0.5 } });
    expect(s.currentVersion).toBe(1);
    const bt = await BrokerIntegrationService.backtestStrategy(ORG, s.id);
    expect(bt.backtest).toBeTruthy();
    expect(bt.backtest!.trades).toBeGreaterThan(0);
    expect(bt.currentVersion).toBe(2); // version bumped
    const off = await BrokerIntegrationService.toggleStrategy(ORG, s.id, false);
    expect(off.enabled).toBe(false);
    await BrokerIntegrationService.removeStrategy(ORG, s.id);
    expect(await BrokerIntegrationService.listStrategies(ORG)).toEqual([]);
  });
});

describe("risk controls + command center", () => {
  it("command center returns aggregate account/risk state", async () => {
    await BrokerIntegrationService.createAccount(ORG, USER, { ...accInput, mode: "assisted" });
    const cc = await BrokerIntegrationService.commandCenter(ORG);
    expect(cc.accounts.length).toBe(1);
    expect(cc.riskControls.killSwitch).toBe(false);
    expect(cc.totalBalance).toBe(0);
    expect(Array.isArray(cc.aiRecommendations)).toBe(true);
  });
});

describe("AI broker trading agents (chat-routable workforce)", () => {
  it("seeds and lists the specialized agents", async () => {
    const agents = await BrokerIntegrationService.listAgents(ORG);
    const keys = agents.map((a) => a.key);
    expect(keys).toContain("trade-execution-supervisor");
    expect(keys).toContain("strategy-optimizer");
    expect(keys).toContain("portfolio-risk");
    expect(agents.every((a) => a.routable === true)).toBe(true);
  });

  it("supervisor agent validates a signal and records the decision", async () => {
    const a = await BrokerIntegrationService.createAccount(ORG, USER, { ...accInput, mode: "semi_autonomous" });
    const res = await BrokerIntegrationService.runAgent(ORG, "trade-execution-supervisor", { accountId: a.id, symbol: "EURUSD", side: "long", volume: 0.1 });
    expect(["approved", "submitted"]).toContain(res.verdict);
    expect(res.agent).toContain("Supervisor");
    const agent = await BrokerIntegrationService.getAgent(ORG, "trade-execution-supervisor");
    expect(agent.decisions24h).toBeGreaterThanOrEqual(1);
  });

  it("strategy optimizer agent backtests and recommends the best strategy", async () => {
    await BrokerIntegrationService.createStrategy(ORG, USER, { name: "A", type: "rule", logic: { maxTrades: 20, winRate: 0.6 } });
    await BrokerIntegrationService.createStrategy(ORG, USER, { name: "B", type: "rule", logic: { maxTrades: 10, winRate: 0.4 } });
    const res = await BrokerIntegrationService.runAgent(ORG, "strategy-optimizer");
    expect(res.verdict).toContain("recommend");
    expect(res.data.length).toBe(2);
  });

  it("portfolio-risk agent reports concentration breaches", async () => {
    const res = await BrokerIntegrationService.runAgent(ORG, "portfolio-risk");
    expect(res.agent).toContain("Risk");
    expect(res.data).toHaveProperty("diversificationScore");
  });
});
