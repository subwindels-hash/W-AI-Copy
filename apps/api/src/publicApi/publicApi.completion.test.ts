/**
 * Session 120 — Public API Gateway completion tests.
 *
 * The Session 104/120 predecessor suite (`publicApi.test.ts`) pins the key
 * lifecycle. This suite pins everything Session 120 added or fixed, driving
 * the real services and middleware against FakePrisma (Postgres stand-in) and
 * FakeKv (Redis stand-in):
 *
 *   - **the cross-tenant workflow hole**: the public run route resolved the
 *     workflow through the key creator's *membership* organization instead of
 *     the key's organization, so a key issued to org A whose creator also
 *     belonged to org B could trigger org B's workflows. `runWorkflow` now
 *     accepts an explicit organization and the gateway pins it;
 *   - **DELETE /apikeys/:id revoke-vs-delete**: the HTTP DELETE verb silently
 *     *revoked* — there was no way to permanently remove a key row. It now
 *     hard-deletes (audited), and PATCH { revoked: true } remains the soft
 *     path;
 *   - **the missing renewal path**: an expiring (even expired) key can be
 *     extended via `expiresInDays` on PATCH; revoked keys stay immutable;
 *   - **the missing call ledger**: best-effort org-scoped `pub:*` keys
 *     written from `apiKeyAuth`, and a usage report whose numbers never mix
 *     ledger counts with database identifiers and never invent zeros;
 *   - **middleware behaviour**: Bearer-only auth, scope enforcement, and a
 *     ledger failure that never fails the request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const service = await import("./publicApi.service.js");
const usage = await import("./publicApiUsage.service.js");
const wf = await import("../services/workflow.service.js");
const { apiKeyAuth, requireScope } = await import("../http/middleware/apiKeyAuth.js");
const shared = await import("@windels/shared/publicApi");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const USER_A = "user-alpha";
const USER_B = "user-beta";

function seedMemberships() {
  db.seed("Membership", [
    { id: cuid(), userId: USER_A, organizationId: ORG_A, workspaceId: "ws-a", joinedAt: new Date(1) },
    // USER_A also belongs to ORG_B (joined later) — the multi-org trap the
    // cross-tenant fix exists for.
    { id: cuid(), userId: USER_A, organizationId: ORG_B, workspaceId: "ws-b", joinedAt: new Date(2) },
    { id: cuid(), userId: USER_B, organizationId: ORG_B, workspaceId: "ws-b", joinedAt: new Date(1) },
  ]);
  db.seed("Organization", [{ id: ORG_A, name: "Alpha" }, { id: ORG_B, name: "Beta" }]);
  db.seed("Workspace", [{ id: "ws-a", organizationId: ORG_A }, { id: "ws-b", organizationId: ORG_B }]);
  db.seed("User", [
    { id: USER_A, email: "alpha@example.com", role: "USER", isActive: true, isSuspended: false, createdAt: new Date() },
    { id: USER_B, email: "beta@example.com", role: "USER", isActive: true, isSuspended: false, createdAt: new Date() },
  ]);
  db.seed("UserProfile", [
    { id: cuid(), userId: USER_A, displayName: "Alpha User" },
    { id: cuid(), userId: USER_B, displayName: "Beta User" },
  ]);
}

beforeEach(() => {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
  db.reset();
  seedMemberships();
});

async function createKey(userId: string, orgId: string, overrides: Record<string, unknown> = {}) {
  const created: any = await service.createApiKey(userId, {
    name: "test-key",
    scopes: ["READ"],
    ...overrides,
  } as any);
  // Pin the row to the intended org (createApiKey uses the user's first
  // membership, so multi-org users need an explicit override).
  const row = db.tables.get("ApiKey")!.find((r: any) => r.id === created.id);
  row!.organizationId = orgId;
  return { ...created, token: created.key as string };
}

function seedWorkflow(overrides: Record<string, unknown> = {}) {
  const row = {
    id: cuid(),
    organizationId: ORG_A,
    name: "Flow",
    description: null,
    status: "ACTIVE",
    nodes: [] as unknown[],
    edges: [] as unknown[],
    settings: {} as Record<string, unknown>,
    triggers: [] as unknown[],
    runsCount: 0,
    successCount: 0,
    failureCount: 0,
    lastRunAt: null,
    deletedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
  db.seed("Workflow", [row]);
  return row;
}

// ══════════════════════════════════════════════════════════════════════════
// The cross-tenant workflow hole (Session 120 fix)
// ══════════════════════════════════════════════════════════════════════════

describe("runWorkflow with a pinned organization (Session 120 fix)", () => {
  it("runs a workflow of the pinned organization", async () => {
    const w = seedWorkflow({ organizationId: ORG_A });
    const out = await wf.runWorkflow(USER_A, w.id, { input: {}, triggerType: "api", triggerData: {} }, ORG_A);
    expect(out.runId).toBeTruthy();
    const run = db.tables.get("WorkflowRun")!.find((r: any) => r.workflowId === w.id);
    expect(run!.createdById).toBe(USER_A);
    expect((db.tables.get("Workflow")!.find((r: any) => r.id === w.id) as any)!.runsCount).toBe(1);
  });

  it("FIXED: refuses to run another organization's workflow even when the creator belongs to it", async () => {
    // USER_A holds membership in ORG_B too. A key issued to ORG_A must not be
    // able to trigger ORG_B's workflows through the creator's membership.
    const wB = seedWorkflow({ organizationId: ORG_B });
    await expect(
      wf.runWorkflow(USER_A, wB.id, { input: {}, triggerType: "api", triggerData: {} }, ORG_A),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.tables.get("WorkflowRun") ?? []).toHaveLength(0);
  });

  it("runs the workflow when the pinned organization is the creator's second membership", async () => {
    // USER_A's first membership is ORG_A; the key's org is ORG_B. The pinned
    // lookup must use ORG_B and still run.
    const wB = seedWorkflow({ organizationId: ORG_B });
    const out = await wf.runWorkflow(USER_A, wB.id, { input: {}, triggerType: "api", triggerData: {} }, ORG_B);
    expect(out.runId).toBeTruthy();
  });

  it("regression: without the pin, runWorkflow still resolves through the membership (historical behaviour)", async () => {
    const wA = seedWorkflow({ organizationId: ORG_A });
    const out = await wf.runWorkflow(USER_A, wA.id, { input: {}, triggerType: "api", triggerData: {} });
    expect(out.runId).toBeTruthy();
  });

  it("refuses a workflow in a status that cannot run", async () => {
    const w = seedWorkflow({ organizationId: ORG_A, status: "ARCHIVED" });
    await expect(
      wf.runWorkflow(USER_A, w.id, { input: {}, triggerType: "api", triggerData: {} }, ORG_A),
    ).rejects.toMatchObject({ status: 400 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// DELETE /apikeys/:id — revoke-vs-delete correction (Session 120)
// ══════════════════════════════════════════════════════════════════════════

describe("deleteApiKey (the correction path Session 120 adds)", () => {
  it("hard-deletes the row and returns { id, deleted: true }", async () => {
    const { id } = await createKey(USER_A, ORG_A);
    const out = await service.deleteApiKey(USER_A, id);
    expect(out).toEqual({ id, deleted: true });
    expect(db.tables.get("ApiKey")!.some((r: any) => r.id === id)).toBe(false);
  });

  it("the deleted token immediately stops verifying", async () => {
    const { token, id } = await createKey(USER_A, ORG_A);
    expect(await service.verifyApiKey(token)).toBeTruthy();
    await service.deleteApiKey(USER_A, id);
    expect(await service.verifyApiKey(token)).toBeNull();
  });

  it("deletes revoked keys too (cleanup path — previously impossible)", async () => {
    const { id } = await createKey(USER_A, ORG_A);
    await service.revokeApiKey(USER_A, id);
    await service.deleteApiKey(USER_A, id);
    expect(db.tables.get("ApiKey")!.some((r: any) => r.id === id)).toBe(false);
  });

  it("audits admin.apikey.deleted with the prefix and prior revocation state", async () => {
    const { id } = await createKey(USER_A, ORG_A);
    const row = db.tables.get("ApiKey")!.find((r: any) => r.id === id);
    await service.deleteApiKey(USER_A, id);
    const entry = db.tables.get("AuditLog")!.find((r: any) => r.action === "admin.apikey.deleted");
    expect(entry).toBeTruthy();
    expect(entry!.resourceId).toBe(id);
    expect(entry!.metadata.wasRevoked).toBe(false);
    expect(entry!.metadata.keyPrefix).toBe(row!.keyPrefix);
    expect(entry!.organizationId).toBe(ORG_A);
  });

  it("refuses to delete another organization's key", async () => {
    const { id } = await createKey(USER_A, ORG_A);
    await expect(service.deleteApiKey(USER_B, id)).rejects.toMatchObject({ status: 404 });
    expect(db.tables.get("ApiKey")!.some((r: any) => r.id === id)).toBe(true);
  });

  it("404s on an unknown id", async () => {
    await expect(service.deleteApiKey(USER_A, cuid())).rejects.toMatchObject({ status: 404 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Renewal path (Session 120)
// ══════════════════════════════════════════════════════════════════════════

describe("API key renewal (expiresInDays on PATCH)", () => {
  it("extends an expiring key and reports the new expiry in the mutation response", async () => {
    const { id } = await createKey(USER_A, ORG_A, { expiresInDays: 10 });
    // Snapshot the value, not the row: FakePrisma mutates rows in place, so a
    // later reference would read the renewed value.
    const beforeMs = (db.tables.get("ApiKey")!.find((r: any) => r.id === id) as any).expiresAt.getTime();
    const future = new Date(Date.now() + 3 * 86_400_000);
    const updated = await service.updateApiKey(USER_A, id, { expiresInDays: 30 });
    const afterMs = (db.tables.get("ApiKey")!.find((r: any) => r.id === id) as any).expiresAt.getTime();
    expect(afterMs).toBeGreaterThan(beforeMs);
    expect(new Date(updated.expiresAt!).getTime()).toBeGreaterThan(future.getTime());
  });

  it("FIXED: renews an *expired* key so it verifies again", async () => {
    const { token, id } = await createKey(USER_A, ORG_A);
    db.tables.get("ApiKey")!.find((r: any) => r.id === id)!.expiresAt = new Date(Date.now() - 1000);
    expect(await service.verifyApiKey(token)).toBeNull();
    await service.updateApiKey(USER_A, id, { expiresInDays: 30 });
    expect(await service.verifyApiKey(token)).toBeTruthy();
  });

  it("refuses to renew a revoked key", async () => {
    const { id } = await createKey(USER_A, ORG_A);
    await service.revokeApiKey(USER_A, id);
    await expect(service.updateApiKey(USER_A, id, { expiresInDays: 30 })).rejects.toMatchObject({ status: 409 });
  });

  it("audits the renewal with the new expiry", async () => {
    const { id } = await createKey(USER_A, ORG_A);
    await service.updateApiKey(USER_A, id, { expiresInDays: 30 });
    const entry = db.tables.get("AuditLog")!.find((r: any) => r.action === "admin.apikey.updated");
    expect(entry!.metadata.expiresInDays).toBe(30);
    expect(entry!.metadata.expiresAt).toBeTruthy();
  });

  it("schema rejects 0 and 366 days", async () => {
    const { AkApiKeyUpdateSchema } = await import("@windels/shared/apiKeys");
    expect(AkApiKeyUpdateSchema.safeParse({ expiresInDays: 0 }).success).toBe(false);
    expect(AkApiKeyUpdateSchema.safeParse({ expiresInDays: 366 }).success).toBe(false);
    expect(AkApiKeyUpdateSchema.safeParse({ expiresInDays: 365 }).success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// The call ledger
// ══════════════════════════════════════════════════════════════════════════

describe("recordPublicApiCall", () => {
  it("writes the NX since-marker, totals, day bucket, TTL and event", async () => {
    const key = { id: "key-1", organizationId: ORG_A };
    const at = new Date("2026-08-06T10:00:00Z");
    const expireSpy = vi.spyOn(kv, "expire");
    await usage.recordPublicApiCall(key, "GET", "/api/rest/v1/workflows", at);
    expect(kv.strings.get("pub:since:org-alpha")!.value).toBe(at.toISOString());
    expect(kv.hashes.get("pub:req:org-alpha")!["key-1"]).toBe("1");
    expect(kv.hashes.get("pub:day:org-alpha:2026-08-06")!["key-1"]).toBe("1");
    expect(expireSpy).toHaveBeenCalledWith("pub:day:org-alpha:2026-08-06", shared.PUBLIC_API_DAY_BUCKET_TTL_DAYS * 86400);
    const evt = JSON.parse(kv.lists.get("pub:evt:org-alpha")![0]!);
    expect(evt).toMatchObject({ keyId: "key-1", method: "GET", path: "/api/rest/v1/workflows" });
    expireSpy.mockRestore();
  });

  it("keeps the first-call marker across later calls (NX)", async () => {
    const key = { id: "key-1", organizationId: ORG_A };
    await usage.recordPublicApiCall(key, "GET", "/", new Date("2026-08-01T00:00:00Z"));
    await usage.recordPublicApiCall(key, "GET", "/", new Date("2026-08-06T00:00:00Z"));
    expect(kv.strings.get("pub:since:org-alpha")!.value).toBe("2026-08-01T00:00:00.000Z");
  });

  it("caps the event list at PUBLIC_API_EVENT_CAP", async () => {
    const key = { id: "key-1", organizationId: ORG_A };
    for (let i = 0; i < shared.PUBLIC_API_EVENT_CAP + 25; i++) {
      await usage.recordPublicApiCall(key, "GET", "/", new Date(Date.UTC(2026, 7, 6) + i * 1000));
    }
    expect(kv.lists.get("pub:evt:org-alpha")!.length).toBe(shared.PUBLIC_API_EVENT_CAP);
  });

  it("counts per-key totals and day buckets", async () => {
    const a = { id: "key-a", organizationId: ORG_A };
    const b = { id: "key-b", organizationId: ORG_A };
    await usage.recordPublicApiCall(a, "GET", "/", new Date("2026-08-05T00:00:00Z"));
    await usage.recordPublicApiCall(a, "GET", "/", new Date("2026-08-06T00:00:00Z"));
    await usage.recordPublicApiCall(b, "GET", "/", new Date("2026-08-06T00:00:00Z"));
    expect(kv.hashes.get("pub:req:org-alpha")).toEqual({ "key-a": "2", "key-b": "1" });
    expect(kv.hashes.get("pub:day:org-alpha:2026-08-06")).toEqual({ "key-a": "1", "key-b": "1" });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// The usage report
// ══════════════════════════════════════════════════════════════════════════

describe("publicApiUsage report", () => {
  it("reports an honest empty shape for an org with keys but no calls", async () => {
    await createKey(USER_A, ORG_A);
    const r = await usage.publicApiUsage(ORG_A, 7, new Date("2026-08-06T12:00:00Z"));
    expect(r.ledgerAvailable).toBe(true);
    expect(r.ledgerStart).toBeNull();
    expect(r.totalCalls).toBe(0);
    expect(r.callsInWindow).toBe(0);
    expect(r.callsToday).toBe(0);
    expect(r.distinctUseDays).toBe(0);
    expect(r.ledgerCoveredDays).toBe(0);
    expect(r.avgCallsPerDay).toBeNull();
    expect(r.recentCalls).toEqual([]);
    expect(r.perKey).toHaveLength(1);
    expect(r.perKey[0]!.name).toBe("test-key");
    expect(r.perKey[0]!.calls).toBe(0);
    expect(r.note.length).toBeGreaterThan(10);
  });

  it("counts window calls, today's calls and covered days from the ledger", async () => {
    const { id } = await createKey(USER_A, ORG_A);
    await usage.recordPublicApiCall({ id, organizationId: ORG_A }, "GET", "/workflows", new Date("2026-08-05T09:00:00Z"));
    await usage.recordPublicApiCall({ id, organizationId: ORG_A }, "GET", "/agents", new Date("2026-08-06T09:00:00Z"));
    await usage.recordPublicApiCall({ id, organizationId: ORG_A }, "POST", "/workflows/x/run", new Date("2026-08-06T10:00:00Z"));
    const r = await usage.publicApiUsage(ORG_A, 7, new Date("2026-08-06T12:00:00Z"));
    expect(r.ledgerStart).toBe("2026-08-05T09:00:00.000Z");
    expect(r.totalCalls).toBe(3);
    expect(r.callsInWindow).toBe(3);
    expect(r.callsToday).toBe(2);
    expect(r.distinctUseDays).toBe(2);
    expect(r.ledgerCoveredDays).toBe(2);
    expect(r.avgCallsPerDay).toBe(1.5);
    expect(r.perKey[0]!.calls).toBe(3);
    expect(r.perKey[0]!.callsInWindow).toBe(3);
    expect(r.perKey[0]!.callsToday).toBe(2);
    expect(r.recentCalls).toHaveLength(3);
    expect(r.recentCalls[0]!.path).toBe("/workflows/x/run");
  });

  it("excludes pre-window calls from window numbers but keeps the ledger start", async () => {
    const { id } = await createKey(USER_A, ORG_A);
    await usage.recordPublicApiCall({ id, organizationId: ORG_A }, "GET", "/", new Date("2026-06-01T00:00:00Z"));
    await usage.recordPublicApiCall({ id, organizationId: ORG_A }, "GET", "/", new Date("2026-08-06T00:00:00Z"));
    const r = await usage.publicApiUsage(ORG_A, 7, new Date("2026-08-06T12:00:00Z"));
    expect(r.ledgerStart).toBe("2026-06-01T00:00:00.000Z");
    expect(r.totalCalls).toBe(2);
    expect(r.callsInWindow).toBe(1);
    expect(r.ledgerCoveredDays).toBe(7); // bounded by the window, not the ledger
    expect(r.avgCallsPerDay).toBe(0.14); // floored, never rounded
  });

  it("keeps a deleted key's counts with null identifiers", async () => {
    const { id } = await createKey(USER_A, ORG_A);
    await usage.recordPublicApiCall({ id, organizationId: ORG_A }, "GET", "/", new Date("2026-08-06T00:00:00Z"));
    await service.deleteApiKey(USER_A, id);
    const r = await usage.publicApiUsage(ORG_A, 7, new Date("2026-08-06T12:00:00Z"));
    const row = r.perKey.find((k) => k.keyId === id);
    expect(row).toBeTruthy();
    expect(row!.calls).toBe(1);
    expect(row!.name).toBeNull();
    expect(row!.keyPrefix).toBeNull();
    expect(row!.revoked).toBe(false);
  });

  it("keeps organizations isolated", async () => {
    const { id } = await createKey(USER_A, ORG_A);
    await usage.recordPublicApiCall({ id, organizationId: ORG_A }, "GET", "/", new Date("2026-08-06T00:00:00Z"));
    const r = await usage.publicApiUsage(ORG_B, 7, new Date("2026-08-06T12:00:00Z"));
    expect(r.totalCalls).toBe(0);
    expect(r.perKey).toHaveLength(0);
    expect(r.ledgerStart).toBeNull();
  });

  it("reports ledgerAvailable=false on a Redis failure while keeping DB identifiers", async () => {
    const { id } = await createKey(USER_A, ORG_A);
    await usage.recordPublicApiCall({ id, organizationId: ORG_A }, "GET", "/", new Date());
    const hgetallSpy = vi.spyOn(kv, "hgetall").mockRejectedValueOnce(new Error("redis down"));
    const r = await usage.publicApiUsage(ORG_A, 7);
    hgetallSpy.mockRestore();
    expect(r.ledgerAvailable).toBe(false);
    expect(r.totalCalls).toBe(0);
    expect(r.callsInWindow).toBe(0);
    expect(r.avgCallsPerDay).toBeNull();
    expect(r.ledgerStart).toBeNull();
    expect(r.recentCalls).toEqual([]);
    expect(r.perKey).toHaveLength(1); // DB identifiers still reported
    expect(r.perKey[0]!.name).toBe("test-key");
  });

  it("marks revoked keys revoked in the report", async () => {
    const { id } = await createKey(USER_A, ORG_A);
    await service.revokeApiKey(USER_A, id);
    const r = await usage.publicApiUsage(ORG_A, 7);
    expect(r.perKey[0]!.revoked).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Middleware — auth, scopes, and ledger resilience
// ══════════════════════════════════════════════════════════════════════════

function fakeRes() {
  const out: any = { statusCode: 0, body: null };
  out.status = (code: number) => { out.statusCode = code; return out; };
  out.json = (body: unknown) => { out.body = body; return out; };
  return out;
}

describe("apiKeyAuth middleware", () => {
  it("accepts a valid Bearer key, attaches the org and writes the ledger", async () => {
    const { token } = await createKey(USER_A, ORG_A);
    const req: any = { header: () => `Bearer ${token}`, method: "GET", path: "/api/rest/v1/workflows" };
    const res = fakeRes();
    let nexted = false;
    await apiKeyAuth(req, res, () => { nexted = true; });
    expect(nexted).toBe(true);
    expect(req.apiOrganization.id).toBe(ORG_A);
    expect(req.apiUser.id).toBe(USER_A);
    expect(req.apiKeyScopes).toEqual(["READ"]);
    expect(kv.hashes.get("pub:req:org-alpha")![req.apiKey.id]).toBe("1");
  });

  it("refuses a missing or non-Bearer token with 401", async () => {
    const res = fakeRes();
    let nexted = false;
    await apiKeyAuth({ header: () => "", method: "GET", path: "/" } as any, res, () => { nexted = true; });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
    // Query-string keys are not accepted — only the Authorization header.
    const res2 = fakeRes();
    await apiKeyAuth({ header: () => "", query: { key: "wnd_x" }, method: "GET", path: "/" } as any, res2, () => { nexted = true; });
    expect(res2.statusCode).toBe(401);
  });

  it("refuses a revoked or bogus key with 401", async () => {
    const { token, id } = await createKey(USER_A, ORG_A);
    db.tables.get("ApiKey")!.find((r: any) => r.id === id)!.revokedAt = new Date();
    const res = fakeRes();
    let nexted = false;
    await apiKeyAuth({ header: () => `Bearer ${token}`, method: "GET", path: "/" } as any, res, () => { nexted = true; });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("a failing ledger never fails the request", async () => {
    const { token } = await createKey(USER_A, ORG_A);
    const lpushSpy = vi.spyOn(kv, "lpush").mockRejectedValueOnce(new Error("redis down"));
    const req: any = { header: () => `Bearer ${token}`, method: "GET", path: "/" };
    const res = fakeRes();
    let nexted = false;
    await apiKeyAuth(req, res, () => { nexted = true; });
    lpushSpy.mockRestore();
    expect(nexted).toBe(true);
  });
});

describe("requireScope middleware", () => {
  it("admits a key whose scope matches, and ADMIN satisfies everything", () => {
    const ok = (scopes: string[]) => {
      let passed = false;
      const mw = requireScope("WRITE");
      mw({ apiKeyScopes: scopes } as any, fakeRes(), () => { passed = true; });
      return passed;
    };
    expect(ok(["READ"])).toBe(false);
    expect(ok(["WRITE"])).toBe(true);
    expect(ok(["ADMIN"])).toBe(true);
    expect(ok([])).toBe(false);
  });

  it("answers 403 with the required scopes named", () => {
    const res = fakeRes();
    const mw = requireScope("WRITE", "ADMIN");
    mw({ apiKeyScopes: ["READ"] } as any, res, () => {});
    expect(res.statusCode).toBe(403);
    expect(res.body.error.message).toMatch(/WRITE/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Shared contract — Zod
// ══════════════════════════════════════════════════════════════════════════

describe("shared publicApi schemas", () => {
  it("list query: limit is optional, 1..200, coerced", () => {
    expect(shared.PubListQuerySchema.parse({}).limit).toBeUndefined();
    expect(shared.PubListQuerySchema.parse({ limit: "25" }).limit).toBe(25);
    expect(shared.PubListQuerySchema.parse({ limit: 200 }).limit).toBe(200);
    expect(() => shared.PubListQuerySchema.parse({ limit: 0 })).toThrow();
    expect(() => shared.PubListQuerySchema.parse({ limit: 201 })).toThrow();
  });

  it("run-workflow body defaults input to {} when the body is empty", () => {
    // Express JSON bodies arrive as `{}` (or undefined on empty); the schema
    // requires an object and defaults the input field.
    expect(shared.PubRunWorkflowBodySchema.parse({}).input).toEqual({});
    expect(shared.PubRunWorkflowBodySchema.parse({ input: { a: 1 } }).input).toEqual({ a: 1 });
    expect(shared.PubRunWorkflowBodySchema.safeParse(undefined).success).toBe(false);
  });

  it("talk message body: trimmed, 1..20000", () => {
    expect(shared.PubTalkMessageBodySchema.parse({ content: "  hi  " }).content).toBe("hi");
    expect(() => shared.PubTalkMessageBodySchema.parse({ content: "" })).toThrow();
    expect(() => shared.PubTalkMessageBodySchema.parse({ content: "x".repeat(20001) })).toThrow();
    expect(shared.PubTalkMessageBodySchema.parse({ content: "x".repeat(20000) }).content.length).toBe(20000);
  });

  it("usage query: days default 7, 1..90", () => {
    expect(shared.PubUsageQuerySchema.parse({}).days).toBe(7);
    expect(shared.PubUsageQuerySchema.parse({ days: "30" }).days).toBe(30);
    expect(() => shared.PubUsageQuerySchema.parse({ days: 0 })).toThrow();
    expect(() => shared.PubUsageQuerySchema.parse({ days: 91 })).toThrow();
  });

  it("id params require cuids", () => {
    expect(() => shared.PubWorkflowIdSchema.parse({ id: "nope" })).toThrow();
    expect(shared.PubWorkflowIdSchema.parse({ id: "clx1234567890abcdefghijklm" }).id).toBeTruthy();
    expect(() => shared.PubTalkChannelIdSchema.parse({ id: "nope" })).toThrow();
  });
});
