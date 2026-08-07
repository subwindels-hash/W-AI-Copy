/**
 * WINDELS AI OS — Expert Advisor (Phase 2) service tests.
 *
 * Exercises register/auth/poll/enqueue/fill/heartbeat/HMAC/watermark/revoke
 * using an in-process FakeKv and the real canonical signer so the tests
 * match the wire behavior seen by the MQL5 EA.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
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
// Mt5Monitor: stub audit/start/stop to avoid pulling in the real monitor loop.
vi.mock("./mt5/mt5-monitor.js", () => ({
  Mt5Monitor: { start: vi.fn(), stop: vi.fn(), audit: vi.fn().mockResolvedValue(undefined), tick: vi.fn() },
}));
// Connector registry: return nothing so the "pure EA" path is exercised.
vi.mock("./connectors/connector-registry.js", () => ({
  connectorRegistry: {
    register: vi.fn(),
    get: () => null,
    mustGet: () => { throw new Error("no connector"); },
    list: () => [],
    probeAvailability: vi.fn().mockResolvedValue([]),
    initializeAll: vi.fn().mockResolvedValue(undefined),
    shutdownAll: vi.fn().mockResolvedValue(undefined),
  },
  registerBundledConnectors: vi.fn().mockResolvedValue(undefined),
}));

const { EaService } = await import("./ea.service.js");
const { BrokerIntegrationService } = await import("./brokerIntegration.service.js");
const { buildEaSignableString } = await import("@windels/shared/ea");
import { createHmac } from "node:crypto";

const ORG = "org-ea-test";
const USER = "user-ea";
const MT5_LOGIN = "50001";
const MT5_SERVER = "TestBroker-Demo";

let acct: Awaited<ReturnType<typeof BrokerIntegrationService.createAccount>>;

beforeEach(async () => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  acct = await BrokerIntegrationService.createAccount(ORG, USER, {
    name: "EA Test", broker: "mt5", login: MT5_LOGIN, server: MT5_SERVER, password: "pw",
    mode: "fully_autonomous", currency: "USD", leverage: 100,
  });
});

describe("ea registration + auth", () => {
  it("issues a token + session and rejects wrong tokens", async () => {
    const sess = await EaService.register(ORG, {
      brokerAccountId: acct.id, eaPublicKey: "x".repeat(32),
      mt5Login: MT5_LOGIN, mt5Server: MT5_SERVER, terminalName: "DESKTOP-1",
      terminalVersion: "4000", eaVersion: "1.0.0",
    });
    expect(sess.token).toHaveLength(64);
    expect(sess.eaId).toMatch(/^ea-/);
    expect(sess.magic).toBeGreaterThan(0);
    expect(sess.hardLimits.maxLotPerTrade).toBeGreaterThan(0);
    // Valid token authenticates.
    const authed = await EaService.authenticateToken(sess.token);
    expect(authed.eaId).toBe(sess.eaId);
    // Wrong token fails.
    await expect(EaService.authenticateToken("0".repeat(64))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects registration when mt5 login does not match broker account", async () => {
    await expect(EaService.register(ORG, {
      brokerAccountId: acct.id, eaPublicKey: "x".repeat(32),
      mt5Login: "99999", mt5Server: MT5_SERVER, terminalName: "DESKTOP-1",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("lists and revokes EAs", async () => {
    const before = await EaService.listEa(ORG);
    for (const existing of before) await EaService.revoke(ORG, existing.eaId).catch(() => {});
    const sess = await EaService.register(ORG, {
      brokerAccountId: acct.id, eaPublicKey: "x".repeat(32),
      mt5Login: MT5_LOGIN, mt5Server: MT5_SERVER, terminalName: "DESKTOP-1",
    });
    let list = await EaService.listEa(ORG);
    expect(list).toHaveLength(1);
    expect(list[0]!.eaId).toBe(sess.eaId);
    await EaService.revoke(ORG, sess.eaId);
    list = await EaService.listEa(ORG);
    expect(list).toHaveLength(0);
    await expect(EaService.authenticateToken(sess.token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("signals + HMAC", () => {
  it("canonical pipe format matches Node/MQL contract (field order)", () => {
    const sig = {
      id: "sig-1", seq: 7, brokerAccountId: "acct-1",
      type: "MARKET" as const, side: "BUY" as const, symbol: "EURUSD",
      volume: 0.1, sl: 1.08000, tp: 1.09500, slippagePts: 20,
      comment: "WINDELS:AI", expiresAt: "2030-01-01T00:00:00.000Z",
    };
    const payload = buildEaSignableString(sig, "acct-1");
    const parts = payload.split("|");
    expect(parts).toHaveLength(17);
    expect(parts[0]).toBe("sig-1");
    expect(parts[1]).toBe("7");
    expect(parts[2]).toBe("acct-1");
    expect(parts[3]).toBe("0"); // MARKET
    expect(parts[4]).toBe("0"); // BUY
    expect(parts[5]).toBe("EURUSD");
    expect(parts[6]).toBe("0.10000000");
    expect(parts[16]).toMatch(/^2030\.01\.01 00:00:00$/);
  });

  it("enqueues signed signals for poll; HMAC verifies with the session secret", async () => {
    const sess = await EaService.register(ORG, {
      brokerAccountId: acct.id, eaPublicKey: "x".repeat(32),
      mt5Login: MT5_LOGIN, mt5Server: MT5_SERVER, terminalName: "DESKTOP-1",
    });
    const authed = await EaService.authenticateToken(sess.token);

    const exec = await BrokerIntegrationService.submitSignal(ORG, USER, {
      accountId: acct.id, symbol: "EURUSD", side: "long", volume: 0.1,
      stopLoss: 1.08, takeProfit: 1.095,
    });
    expect(exec.status).toBe("submitted"); // paper/EA path

    const bundle = await EaService.poll(authed, 0);
    expect(bundle.signals.length).toBe(1);
    const sig = bundle.signals[0]!;
    expect(sig.seq).toBe(1);
    expect(sig.id).toBe(exec.id);
    expect(sig.type).toBe("MARKET");
    expect(sig.sig).toHaveLength(64);

    // Verify HMAC (replicating what the MQL5 EA does).
    const payload = buildEaSignableString({ ...sig, sig: undefined }, acct.id);
    const expected = createHmac("sha256", authed.secret).update(payload, "utf8").digest("hex");
    expect(expected).toBe(sig.sig);

    // Tampered signature would fail.
    const tampered = { ...sig, volume: 99 };
    const tamperedPayload = buildEaSignableString({ ...tampered, sig: undefined }, acct.id);
    const tamperedSig = createHmac("sha256", authed.secret).update(tamperedPayload, "utf8").digest("hex");
    expect(tamperedSig).not.toBe(sig.sig);
  });

  it("advances watermark on fill ack and marks execution filled", async () => {
    const sess = await EaService.register(ORG, {
      brokerAccountId: acct.id, eaPublicKey: "x".repeat(32),
      mt5Login: MT5_LOGIN, mt5Server: MT5_SERVER, terminalName: "DESKTOP-1",
    });
    const authed = await EaService.authenticateToken(sess.token);

    const exec = await BrokerIntegrationService.submitSignal(ORG, USER, {
      accountId: acct.id, symbol: "EURUSD", side: "long", volume: 0.1,
      stopLoss: 1.08, takeProfit: 1.095,
    });
    await EaService.poll(authed, 0);
    const ack = await EaService.ackFill(authed, {
      signalId: exec.id, eaId: authed.eaId, brokerAccountId: acct.id,
      status: "FILLED", ticket: "T-1", dealId: "D-1", fillPrice: 1.0851,
      filledVolume: 0.1, retcode: 10009, localTimestamp: new Date().toISOString(),
    });
    expect(ack.ok).toBe(true);
    const stored = await BrokerIntegrationService.mustGetExecution(ORG, exec.id);
    expect(stored.status).toBe("filled");
    expect(stored.brokerTicket).toBe("T-1");
    expect(stored.brokerDealId).toBe("D-1");
    expect(stored.fillPrice).toBe(1.0851);
    // Signal is drained from pending.
    const after = await EaService.poll(authed, 1);
    expect(after.signals.length).toBe(0);
    expect(after.watermark).toBe(1);
  });

  it("replay protection: signals at/below watermark are not re-delivered", async () => {
    const sess = await EaService.register(ORG, {
      brokerAccountId: acct.id, eaPublicKey: "x".repeat(32),
      mt5Login: MT5_LOGIN, mt5Server: MT5_SERVER, terminalName: "DESKTOP-1",
    });
    const authed = await EaService.authenticateToken(sess.token);
    await BrokerIntegrationService.submitSignal(ORG, USER, { accountId: acct.id, symbol: "EURUSD", side: "long", volume: 0.1 });
    const b1 = await EaService.poll(authed, 0);
    expect(b1.signals.length).toBe(1);
    // Ack with a higher watermark.
    await EaService.ackFill(authed, {
      signalId: b1.signals[0]!.id, eaId: authed.eaId, brokerAccountId: acct.id,
      status: "FILLED", ticket: "T1", dealId: "D1", fillPrice: 1.0, filledVolume: 0.1, retcode: 10009,
      localTimestamp: new Date().toISOString(),
    });
    const b2 = await EaService.poll(authed, 1);
    expect(b2.signals.length).toBe(0);
  });
});

describe("heartbeat (pure-EA path)", () => {
  it("applies EA positions + account snapshot when no live connector is present", async () => {
    const sess = await EaService.register(ORG, {
      brokerAccountId: acct.id, eaPublicKey: "x".repeat(32),
      mt5Login: MT5_LOGIN, mt5Server: MT5_SERVER, terminalName: "DESKTOP-1",
    });
    const authed = await EaService.authenticateToken(sess.token);
    const now = new Date().toISOString();
    await EaService.heartbeat(authed, {
      eaId: authed.eaId, brokerAccountId: acct.id,
      state: {
        balance: 10500, equity: 10600, freeMargin: 10400, marginLevel: 450,
        positions: [{ ticket: "P-99", symbol: "EURUSD", side: "BUY", volume: 0.5, openPrice: 1.08, currentPrice: 1.085, sl: 1.078, tp: 1.09, profit: 250, swap: -1.5, openTime: now }],
      },
      watermark: 0,
    });
    const positions = await BrokerIntegrationService.listPositions(ORG, acct.id);
    expect(positions).toHaveLength(1);
    expect(positions[0]!.ticket).toBe("P-99");
    expect(positions[0]!.profit).toBe(250);
    const refreshed = await BrokerIntegrationService.getAccount(ORG, acct.id);
    expect(refreshed!.status).toBe("connected");
    expect(refreshed!.transport).toBe("ea");
    expect(refreshed!.account.equity).toBe(10600);
  });
});
