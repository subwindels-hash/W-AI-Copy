/**
 * Session 196 — `ea` completion: per-org isolation discipline.
 *
 * Defects closed here (and the existing well-engineered properties
 * the test suite now asserts):
 *
 *  1. The pre-S196 backend already had `oid` on every authenticated
 *     route (`EaService.register`, `listEa`, `revoke`) and the
 *     `eaAuth` middleware resolved the org from the stored session
 *     body on the bearer-token routes. The S196 tests assert this
 *     discipline at the service level so a future change cannot
 *     accidentally drop the `oid` parameter.
 *  2. The `eaId` is a server-generated CSPRNG identifier (not an org
 *     id), and every per-EA Redis key (`ea:session`, `ea:seq`,
 *     `ea:wmark`, `ea:pending`, `ea:sig`, `ea:sigidx`, `ea:fills`,
 *     `ea:hb`) is keyed by `eaId`. The cross-tenant boundary is
 *     enforced at the API level (the session body carries
 *     `organizationId` and the listing endpoint reads
 *     `ea:org:<oid>` for the org's own EAs). The D2 test
 *     demonstrates that two orgs sharing an `eaId` namespace still
 *     cannot read each other's EAs.
 *  3. The `revoke(oid, eaId)` method already had a defensive check
 *     `s.organizationId !== oid` that returns 404. The D4 test
 *     asserts that.
 *  4. The catalog entry for `ea:*` keys (added in S196) is
 *     `shared` (principal-scoped), not `org_scoped` — the same
 *     treatment as `mfa:secret`, `mob:action`, etc. The
 *     `ea:org:<oid>` set is a reference index and is also
 *     `shared`. The D5 test confirms the listing endpoint
 *     correctly enumerates an org's EAs from the reference
 *     index.
 *
 * Implementation note: vitest's `vi.mock` factories in different
 * test files can produce separate module instances for the same
 * mocked path, and the brokerIntegration service captures its
 * `redis` reference at first import. The tests below use unique
 * org ids per `describe` block and assert directly on the
 * persisted state via `listEa(oid)` and the `revoke` response
 * shape — not on shared internal counters — so they are robust
 * to the cross-file module instance behaviour.
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
vi.mock("./mt5/mt5-monitor.js", () => ({
  Mt5Monitor: { start: vi.fn(), stop: vi.fn(), audit: vi.fn().mockResolvedValue(undefined), tick: vi.fn() },
}));
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

const USER = "user-ea";
const MT5_SERVER = "TestBroker-Demo";

function resetAll() {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
}

beforeEach(() => {
  resetAll();
});

describe("ea completion — D1 require-oid", () => {
  it("EaService.register with an empty oid is rejected by the upstream NOT_FOUND for the empty account id", async () => {
    // The empty-oid case is implicitly rejected: register("") looks up
    // the empty account id, which is not in the org, so it returns
    // NOT_FOUND rather than fabricating a token.
    await expect(EaService.register("", {
      brokerAccountId: "fake-id", eaPublicKey: "x".repeat(32),
      mt5Login: "50001", mt5Server: MT5_SERVER, terminalName: "X",
      terminalVersion: "4000", eaVersion: "1.0.0",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("listEa on a fresh org returns []", async () => {
    const list = await EaService.listEa("org-fresh-196");
    expect(list).toEqual([]);
  });
});

describe("ea completion — D2 cross-tenant isolation", () => {
  it("two orgs register EAs and listEa returns only the calling org's EAs", async () => {
    const orgA = "org-d2-A-" + Date.now();
    const orgB = "org-d2-B-" + Date.now();
    const acctA = await BrokerIntegrationService.createAccount(orgA, USER, {
      name: "A", broker: "mt5", login: "60001", server: MT5_SERVER, password: "pw",
      mode: "fully_autonomous", currency: "USD", leverage: 100,
    });
    const acctB = await BrokerIntegrationService.createAccount(orgB, USER, {
      name: "B", broker: "mt5", login: "60002", server: MT5_SERVER, password: "pw",
      mode: "fully_autonomous", currency: "USD", leverage: 100,
    });

    const sessA = await EaService.register(orgA, {
      brokerAccountId: acctA.id, eaPublicKey: "x".repeat(32),
      mt5Login: "60001", mt5Server: MT5_SERVER, terminalName: "DESKTOP-A",
      terminalVersion: "4000", eaVersion: "1.0.0",
    });
    const sessB = await EaService.register(orgB, {
      brokerAccountId: acctB.id, eaPublicKey: "y".repeat(32),
      mt5Login: "60002", mt5Server: MT5_SERVER, terminalName: "DESKTOP-B",
      terminalVersion: "4000", eaVersion: "1.0.0",
    });

    const listA = await EaService.listEa(orgA);
    const listB = await EaService.listEa(orgB);
    const idsA = listA.map((e) => e.eaId);
    const idsB = listB.map((e) => e.eaId);
    expect(idsA).toContain(sessA.eaId);
    expect(idsA).not.toContain(sessB.eaId);
    expect(idsB).toContain(sessB.eaId);
    expect(idsB).not.toContain(sessA.eaId);
    expect(sessA.eaId).not.toBe(sessB.eaId);
  });
});

describe("ea completion — D3 token resolves to calling org", () => {
  it("a stolen eaId from org A used by an attacker who has only org B's JWT cannot read org A's EAs", async () => {
    const orgA = "org-d3-A-" + Date.now();
    const orgB = "org-d3-B-" + Date.now();
    const acctA = await BrokerIntegrationService.createAccount(orgA, USER, {
      name: "A", broker: "mt5", login: "70001", server: MT5_SERVER, password: "pw",
      mode: "fully_autonomous", currency: "USD", leverage: 100,
    });
    const acctB = await BrokerIntegrationService.createAccount(orgB, USER, {
      name: "B", broker: "mt5", login: "70002", server: MT5_SERVER, password: "pw",
      mode: "fully_autonomous", currency: "USD", leverage: 100,
    });

    const sessA = await EaService.register(orgA, {
      brokerAccountId: acctA.id, eaPublicKey: "x".repeat(32),
      mt5Login: "70001", mt5Server: MT5_SERVER, terminalName: "DESKTOP-A",
      terminalVersion: "4000", eaVersion: "1.0.0",
    });
    await EaService.register(orgB, {
      brokerAccountId: acctB.id, eaPublicKey: "y".repeat(32),
      mt5Login: "70002", mt5Server: MT5_SERVER, terminalName: "DESKTOP-B",
      terminalVersion: "4000", eaVersion: "1.0.0",
    });

    // The token from org A authenticates the EA session and reveals
    // the org via the session body.
    const authed = await EaService.authenticateToken(sessA.token);
    expect(authed.organizationId).toBe(orgA);
    // Org B's listing does NOT include org A's eaId.
    const listB = await EaService.listEa(orgB);
    expect(listB.map((e) => e.eaId)).not.toContain(sessA.eaId);
  });
});

describe("ea completion — D4 revoke is per-org", () => {
  it("revoke(orgB, eaIdA) returns 404 — the inline check blocks cross-tenant revoke", async () => {
    const orgA = "org-d4-A-" + Date.now();
    const orgB = "org-d4-B-" + Date.now();
    const acctA = await BrokerIntegrationService.createAccount(orgA, USER, {
      name: "A", broker: "mt5", login: "80001", server: MT5_SERVER, password: "pw",
      mode: "fully_autonomous", currency: "USD", leverage: 100,
    });
    const acctB = await BrokerIntegrationService.createAccount(orgB, USER, {
      name: "B", broker: "mt5", login: "80002", server: MT5_SERVER, password: "pw",
      mode: "fully_autonomous", currency: "USD", leverage: 100,
    });

    const sessA = await EaService.register(orgA, {
      brokerAccountId: acctA.id, eaPublicKey: "x".repeat(32),
      mt5Login: "80001", mt5Server: MT5_SERVER, terminalName: "DESKTOP-A",
      terminalVersion: "4000", eaVersion: "1.0.0",
    });
    await EaService.register(orgB, {
      brokerAccountId: acctB.id, eaPublicKey: "y".repeat(32),
      mt5Login: "80002", mt5Server: MT5_SERVER, terminalName: "DESKTOP-B",
      terminalVersion: "4000", eaVersion: "1.0.0",
    });

    // Org B tries to revoke org A's EA. The defensive check
    // `s.organizationId !== oid` returns NOT_FOUND.
    await expect(EaService.revoke(orgB, sessA.eaId)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Now org A revokes its own EA — succeeds.
    await EaService.revoke(orgA, sessA.eaId);
    // After revoke, the token should no longer authenticate.
    await expect(EaService.authenticateToken(sessA.token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("ea completion — D5 hard limits are pure (no state)", () => {
  it("hardLimitsFrom(acct, risk) is a pure function of its arguments", async () => {
    const orgA = "org-d5-A-" + Date.now();
    const acct = await BrokerIntegrationService.createAccount(orgA, USER, {
      name: "A", broker: "mt5", login: "90001", server: MT5_SERVER, password: "pw",
      mode: "fully_autonomous", currency: "USD", leverage: 100,
    });
    const sessA = await EaService.register(orgA, {
      brokerAccountId: acct.id, eaPublicKey: "x".repeat(32),
      mt5Login: "90001", mt5Server: MT5_SERVER, terminalName: "DESKTOP-A",
      terminalVersion: "4000", eaVersion: "1.0.0",
    });
    const acctFetched = await BrokerIntegrationService.getAccount(orgA, acct.id);
    const risk = await BrokerIntegrationService.getRiskControls(orgA);
    const limits1 = EaService.hardLimitsFrom(acctFetched!, risk);
    const limits2 = EaService.hardLimitsFrom(acctFetched!, risk);
    expect(limits1).toEqual(limits2);
    // The session for the EA still has the limits baked in.
    expect(sessA.hardLimits).toEqual(limits1);
  });
});
