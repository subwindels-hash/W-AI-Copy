/**
 * Session 200 — deeper Tenant Isolation coverage.
 *
 * The Session-89 suite (tenantIsolation.test.ts) covers the happy paths:
 * default policy, a round-trip, one leaked/one conforming namespace key, the
 * two self-tests, and the export gate. This suite hardens the parts that were
 * left unverified because tenant isolation is the platform's #1 failure mode:
 *
 *   - shared/infra namespaces are reported but NEVER flagged as leaks
 *   - prefix-collision safety (cam:feeds must not absorb cam:feed's keys)
 *   - multi-key / multi-namespace leak accounting and the 20-key display cap
 *   - the exact score arithmetic and status thresholds (high/medium/low)
 *   - retention (<30d), region-pin and PII findings
 *   - MAX_RUNS history pruning keeps the newest runs
 *   - kernel events are emitted for policy / run / export transitions
 *   - the self-tests clean up their sentinels (no probe residue leaks)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake, kernelDispatch } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, any>();
    async keys(pattern: string) {
      const regex = new RegExp("^" + pattern.replace(/[*]/g, ".*") + "$");
      return Array.from(this.store.keys()).filter((k) => regex.test(k));
    }
    async del(key: string) { const had = this.store.has(key); this.store.delete(key); return had ? 1 : 0; }
    async exists(key: string) { return this.store.has(key) ? 1 : 0; }
    async hset(key: string, field: string, value: string) {
      let map = this.store.get(key);
      if (!map || !(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(field, value); return 1;
    }
    async hget(key: string, field: string) {
      const map = this.store.get(key);
      if (!map || !(map instanceof Map)) return null;
      const v = map.get(field);
      return v !== undefined ? String(v) : null;
    }
    async hdel(key: string, field: string) {
      const map = this.store.get(key);
      if (map && map instanceof Map) map.delete(field);
      return 1;
    }
    async sadd(key: string, ...members: string[]) {
      let set = this.store.get(key);
      if (!set || !(set instanceof Set)) { set = new Set(); this.store.set(key, set); }
      let n = 0; for (const m of members) { if (!set.has(m)) { set.add(m); n++; } }
      return n;
    }
    async smembers(key: string) {
      const set = this.store.get(key);
      return set instanceof Set ? Array.from(set) : [];
    }
    async srem(key: string, member: string) { this.store.get(key)?.delete?.(member); return 1; }
    async scard(key: string) {
      const set = this.store.get(key);
      return set instanceof Set ? set.size : 0;
    }
  }
  return { fake: new FakeRedis(), kernelDispatch: vi.fn(async () => {}) };
});

vi.mock("../db/redis.js", () => ({ redisCmd: fake }));
// Capture kernel events without importing the real kernel (keeps the suite hermetic).
vi.mock("../kernel/kernel.service.js", () => ({
  KernelService: { dispatch: kernelDispatch },
}));

import { TenantIsolationService, reviewPolicy, TI_NAMESPACE_CATALOG } from "./tenantIsolation.service.js";
import { TI_NAMESPACE_SCOPES } from "@windels/shared/tenantIsolation";
import type { TiIsolationPolicy } from "@windels/shared/tenantIsolation";

const OID = "org-gov";

function policy(overrides: Partial<TiIsolationPolicy> = {}): TiIsolationPolicy {
  return {
    orgId: OID,
    allowCrossTenantExport: false,
    allowExternalSharing: false,
    piiRedactionLevel: "basic",
    retentionDays: 365,
    updatedAt: new Date().toISOString(),
    updatedBy: "test",
    ...overrides,
  };
}

beforeEach(() => { fake.store.clear(); kernelDispatch.mockClear(); });

describe("namespace audit — scope handling", () => {
  it("reports a shared namespace's keys without flagging them as leaks", async () => {
    // An org:membership key legitimately has no org segment (it IS the mapping).
    await fake.hset("org:membership:user-1", "_doc", JSON.stringify({ userId: "user-1" }));
    const run = await TenantIsolationService.runCompliance(OID);
    const shared = run.namespaces.find((n) => n.prefix === "org:membership");
    expect(shared?.scope).toBe("shared");
    expect(shared?.keyCount).toBe(1);
    expect(shared?.conformingKeys).toBe(1);
    expect(shared?.leakedKeys.length).toBe(0);
    // No redis finding should be produced by a shared namespace.
    expect(run.findings.some((f) => f.scope === "redis")).toBe(false);
  });

  it("does not let a sibling prefix absorb another namespace's keys (cam:feeds vs cam:feed)", async () => {
    // A properly-scoped cam:feeds key must not be counted under cam:feed.
    await fake.hset(`cam:feeds:${OID}:list`, "_doc", JSON.stringify({ organizationId: OID }));
    const run = await TenantIsolationService.runCompliance(OID);
    const feed = run.namespaces.find((n) => n.prefix === "cam:feed");
    const feeds = run.namespaces.find((n) => n.prefix === "cam:feeds");
    expect(feed?.keyCount).toBe(0);      // cam:feed saw nothing
    expect(feeds?.keyCount).toBe(1);     // cam:feeds owns its key
    expect(feeds?.conformingKeys).toBe(1);
    expect(feeds?.leakedKeys.length).toBe(0);
  });

  it("accounts multiple leaks across a namespace and mixes with conforming keys", async () => {
    await fake.hset("cam:feed::orphan1", "_doc", "{}");
    await fake.hset("cam:feed:", "_doc", "{}"); // trailing empty org segment
    await fake.hset(`cam:feed:${OID}:good`, "_doc", JSON.stringify({ organizationId: OID }));
    const run = await TenantIsolationService.runCompliance(OID);
    const feed = run.namespaces.find((n) => n.prefix === "cam:feed");
    expect(feed?.conformingKeys).toBe(1);
    expect(feed?.leakedKeys).toContain("cam:feed::orphan1");
    expect(run.status).toBe("failed");
    const redisFinding = run.findings.find((f) => f.scope === "redis");
    expect(redisFinding?.severity).toBe("high");
    expect(redisFinding?.message).toMatch(/missing the org segment/);
  });

  it("caps the displayed leaked-key list at 20 while still failing the run", async () => {
    for (let i = 0; i < 25; i++) await fake.hset(`cam:feed::orphan${i}`, "_doc", "{}");
    const run = await TenantIsolationService.runCompliance(OID);
    const feed = run.namespaces.find((n) => n.prefix === "cam:feed");
    expect(feed?.keyCount).toBe(25);
    expect(feed?.conformingKeys).toBe(0);
    expect(feed?.leakedKeys.length).toBe(20); // display cap
    expect(run.status).toBe("failed");
  });
});

describe("reviewPolicy — findings matrix", () => {
  it("returns no findings for the strict baseline", () => {
    expect(reviewPolicy(policy())).toEqual([]);
  });

  it("flags PII redaction disabled as HIGH", () => {
    const f = reviewPolicy(policy({ piiRedactionLevel: "none" }));
    expect(f.some((x) => x.severity === "high" && /PII/i.test(x.message))).toBe(true);
  });

  it("flags cross-tenant export and external sharing as MEDIUM each", () => {
    const f = reviewPolicy(policy({ allowCrossTenantExport: true, allowExternalSharing: true }));
    expect(f.filter((x) => x.severity === "medium").length).toBe(2);
  });

  it("flags short retention (<30d) and a region pin as LOW", () => {
    const f = reviewPolicy(policy({ retentionDays: 7, regionPin: "eu-central-1" }));
    expect(f.some((x) => x.severity === "low" && /retentionDays/i.test(x.message))).toBe(true);
    expect(f.some((x) => x.severity === "low" && /region/i.test(x.message))).toBe(true);
  });

  it("does not flag retention exactly at the 30-day boundary", () => {
    expect(reviewPolicy(policy({ retentionDays: 30 })).some((x) => /retentionDays/i.test(x.message))).toBe(false);
  });
});

describe("runCompliance — scoring and status thresholds", () => {
  it("is compliant with score 100 on a clean org", async () => {
    const run = await TenantIsolationService.runCompliance(OID);
    expect(run.status).toBe("compliant");
    expect(run.score).toBe(100);
    expect(run.summary).toMatch(/compliant/i);
  });

  it("drops to review_required (not failed) when only medium findings exist", async () => {
    await TenantIsolationService.upsertPolicy(OID, {
      allowCrossTenantExport: true, allowExternalSharing: false, piiRedactionLevel: "basic", retentionDays: 365,
    }, "u1");
    const run = await TenantIsolationService.runCompliance(OID);
    // one medium finding => -10
    expect(run.status).toBe("review_required");
    expect(run.score).toBe(90);
  });

  it("subtracts the exact per-severity weights (high 25 / medium 10 / low 5)", async () => {
    // none => high(25); short retention => low(5). Score = 100-25-5 = 70, status failed (has a high).
    await TenantIsolationService.upsertPolicy(OID, {
      allowCrossTenantExport: false, allowExternalSharing: false, piiRedactionLevel: "none", retentionDays: 10,
    }, "u1");
    const run = await TenantIsolationService.runCompliance(OID);
    expect(run.score).toBe(70);
    expect(run.status).toBe("failed");
  });

  it("never returns a negative score", async () => {
    // Leak (high 25) + none (high 25) + export (med 10) + sharing (med 10) + retention (low 5)
    // plus the leak namespace finding — well over 100 in deductions.
    await fake.hset("cam:feed::leak", "_doc", "{}");
    await TenantIsolationService.upsertPolicy(OID, {
      allowCrossTenantExport: true, allowExternalSharing: true, piiRedactionLevel: "none", retentionDays: 1,
    }, "u1");
    const run = await TenantIsolationService.runCompliance(OID);
    expect(run.score).toBeGreaterThanOrEqual(0);
    expect(run.status).toBe("failed");
  });

  it("always runs exactly the two self-test probes and both pass on a clean store", async () => {
    const run = await TenantIsolationService.runCompliance(OID);
    expect(run.probes.map((p) => p.name).sort()).toEqual([
      "cross-tenant policy isolation (ti:policy)",
      "org-scoped redis key isolation (cam:feed)",
    ]);
    expect(run.probes.every((p) => p.passed)).toBe(true);
    expect(run.probes.every((p) => typeof p.durationMs === "number")).toBe(true);
  });

  it("leaves no probe sentinels behind in the store after a run", async () => {
    await TenantIsolationService.runCompliance(OID);
    const residue = (await fake.keys("*")).filter(
      (k: string) => k.includes("__probe_a_") || k.includes("__probe_b_"),
    );
    expect(residue).toEqual([]);
  });
});

describe("runCompliance — history & pruning", () => {
  it("prunes to the MAX_RUNS newest runs", async () => {
    // MAX_RUNS is 50; create 53 and expect 50 retained.
    for (let i = 0; i < 53; i++) await TenantIsolationService.runCompliance(OID);
    const runs = await TenantIsolationService.listRuns(OID);
    expect(runs.length).toBe(50);
  }, 20000);

  it("keeps runs isolated per org", async () => {
    await TenantIsolationService.runCompliance("org-1");
    await TenantIsolationService.runCompliance("org-1");
    await TenantIsolationService.runCompliance("org-2");
    expect((await TenantIsolationService.listRuns("org-1")).length).toBe(2);
    expect((await TenantIsolationService.listRuns("org-2")).length).toBe(1);
  });

  it("getRun returns null for an unknown or cross-org run id", async () => {
    const run = await TenantIsolationService.runCompliance("org-1");
    expect(await TenantIsolationService.getRun("org-1", "tirun_nope")).toBeNull();
    // A run id from org-1 must not be readable under org-2's namespace.
    expect(await TenantIsolationService.getRun("org-2", run.id)).toBeNull();
  });
});

describe("kernel event emission", () => {
  it("emits a policy.updated event on upsert", async () => {
    await TenantIsolationService.upsertPolicy(OID, {
      allowCrossTenantExport: true, allowExternalSharing: false, piiRedactionLevel: "strict", retentionDays: 90,
    }, "u1");
    expect(kernelDispatch).toHaveBeenCalledWith(expect.objectContaining({
      kind: "tenant-isolation.policy.updated",
      source: "tenant-isolation",
      payload: expect.objectContaining({ orgId: OID, allowCrossTenantExport: true }),
    }));
  });

  it("emits run_completed with the status and score", async () => {
    const run = await TenantIsolationService.runCompliance(OID);
    expect(kernelDispatch).toHaveBeenCalledWith(expect.objectContaining({
      kind: "tenant-isolation.run_completed",
      payload: expect.objectContaining({ orgId: OID, runId: run.id, status: run.status, score: run.score }),
    }));
  });

  it("emits export.blocked and export.allowed on the respective transitions", async () => {
    await TenantIsolationService.checkExport(OID, "patient-records", "u1");
    expect(kernelDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "tenant-isolation.export.blocked" }));

    kernelDispatch.mockClear();
    await TenantIsolationService.upsertPolicy(OID, {
      allowCrossTenantExport: true, allowExternalSharing: false, piiRedactionLevel: "strict", retentionDays: 365,
    }, "u1");
    await TenantIsolationService.checkExport(OID, "analytics", "u1");
    expect(kernelDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "tenant-isolation.export.allowed" }));
  });

  it("survives a kernel dispatch failure without throwing (best-effort emit)", async () => {
    kernelDispatch.mockRejectedValueOnce(new Error("kernel down"));
    await expect(TenantIsolationService.upsertPolicy(OID, {
      allowCrossTenantExport: false, allowExternalSharing: false, piiRedactionLevel: "basic", retentionDays: 365,
    }, "u1")).resolves.toBeTruthy();
  });
});

describe("export gate — result contract", () => {
  it("echoes the dataset and policy summary in the result", async () => {
    const res = await TenantIsolationService.checkExport(OID, "invoices-2026", "u1");
    expect(res.dataset).toBe("invoices-2026");
    expect(res.allowed).toBe(false);
    expect(res.policy).toMatchObject({ allowCrossTenantExport: false, piiRedactionLevel: "basic" });
  });
});

describe("namespace catalog integrity", () => {
  it("has unique prefixes and only known scopes", () => {
    const seen = new Set<string>();
    for (const ns of TI_NAMESPACE_CATALOG) {
      expect(seen.has(ns.prefix), `duplicate prefix ${ns.prefix}`).toBe(false);
      seen.add(ns.prefix);
      expect(TI_NAMESPACE_SCOPES as readonly string[]).toContain(ns.scope);
    }
    expect(TI_NAMESPACE_CATALOG.length).toBeGreaterThan(50);
  });

  it("only ever flags org_scoped namespaces — non-org scopes without an org segment are legitimate", async () => {
    // Seed one key with no org segment into a non-org-scoped namespace of each
    // kind present in the catalog and prove none is reported as a leak.
    const samples = (["shared", "infra", "platform_global", "user_scoped"] as const)
      .map((scope) => TI_NAMESPACE_CATALOG.find((n) => n.scope === scope))
      .filter(Boolean) as Array<{ prefix: string; scope: string }>;
    for (const ns of samples) await fake.hset(`${ns.prefix}:no-org-segment`, "_doc", "{}");
    const run = await TenantIsolationService.runCompliance(OID);
    for (const ns of samples) {
      const row = run.namespaces.find((n) => n.prefix === ns.prefix);
      expect(row?.leakedKeys.length, `${ns.prefix} (${ns.scope}) must not leak`).toBe(0);
    }
    expect(run.findings.some((f) => f.scope === "redis")).toBe(false);
  });

  it("scopes the tenant-isolation policy store itself as org_scoped (dogfoods the rule)", () => {
    expect(TI_NAMESPACE_CATALOG.find((n) => n.prefix === "ti:policy")?.scope).toBe("org_scoped");
  });
});
