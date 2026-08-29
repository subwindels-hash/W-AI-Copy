/**
 * Session 89 — Tenant Isolation & Cross-Tenant Data Governance.
 *
 * Exercises the real service against a fake KV (same pattern as the other
 * Redis-backed suites): default policies, policy round-trips, the namespace
 * audit (flagging an org-scoped namespace whose key is missing the org
 * segment), the cross-tenant self-tests, and the export gate. No verdict is
 * fabricated — the probes read/write real keys and assert on the outcome.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
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
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({
  redisCmd: fake,
}));

import { TenantIsolationService } from "./tenantIsolation.service.js";

const OID = "org-ti";

describe("TenantIsolationService policies", () => {
  beforeEach(() => { fake.store.clear(); });

  it("returns a strict-by-default policy for an unknown org (isolated by default)", async () => {
    const p = await TenantIsolationService.getPolicy(OID);
    expect(p.orgId).toBe(OID);
    expect(p.allowCrossTenantExport).toBe(false);
    expect(p.piiRedactionLevel).toBe("basic");
  });

  it("round-trips an upserted policy", async () => {
    const saved = await TenantIsolationService.upsertPolicy(OID, {
      allowCrossTenantExport: true,
      allowExternalSharing: false,
      piiRedactionLevel: "strict",
      retentionDays: 180,
      regionPin: "eu-central-1",
    }, "u1");
    const read = await TenantIsolationService.getPolicy(OID);
    expect(read).toMatchObject({
      orgId: OID, allowCrossTenantExport: true, allowExternalSharing: false,
      piiRedactionLevel: "strict", retentionDays: 180, regionPin: "eu-central-1",
    });
    expect(read.updatedBy).toBe("u1");
    expect(saved.updatedAt).toBe(read.updatedAt);
  });
});

describe("TenantIsolationService cross-tenant self-tests", () => {
  beforeEach(() => { fake.store.clear(); });

  it("proves org A's policy is not visible to org B", async () => {
    // Set a distinctive policy for a probe org, then read a different org.
    await TenantIsolationService.upsertPolicy("org-A", {
      allowCrossTenantExport: true, allowExternalSharing: true, piiRedactionLevel: "strict", retentionDays: 999,
    }, "probe");
    const b = await TenantIsolationService.getPolicy("org-B");
    expect(b.orgId).toBe("org-B");
    expect(b.allowCrossTenantExport).toBe(false);
    expect(b.piiRedactionLevel).toBe("basic");
  });

  it("runCompliance passes a clean isolation audit with a compliant verdict", async () => {
    const run = await TenantIsolationService.runCompliance(OID);
    expect(run.orgId).toBe(OID);
    expect(run.probes.length).toBe(2);
    expect(run.probes.every((p) => p.passed)).toBe(true);
    expect(run.status).toBe("compliant");
    expect(run.score).toBe(100);
    expect(run.findings.some((f) => f.scope === "probe")).toBe(false);
  });

  it("runCompliance records history and the last run is readable", async () => {
    await TenantIsolationService.runCompliance(OID);
    await TenantIsolationService.runCompliance(OID);
    const runs = await TenantIsolationService.listRuns(OID);
    expect(runs.length).toBe(2);
    const detail = await TenantIsolationService.getRun(OID, runs[0]!.id);
    expect(detail?.id).toBe(runs[0]!.id);
  });
});

describe("TenantIsolationService namespace audit", () => {
  beforeEach(() => { fake.store.clear(); });

  it("flags an org-scoped namespace key that is missing the org segment", async () => {
    // Realistic leak: a camera feed key with an empty org segment.
    await fake.hset("cam:feed::orphan", "_doc", JSON.stringify({ id: "orphan" }));
    const run = await TenantIsolationService.runCompliance(OID);
    const cam = run.namespaces.find((n) => n.prefix === "cam:feed");
    expect(cam?.leakedKeys).toContain("cam:feed::orphan");
    expect(run.status).toBe("failed");
    expect(run.findings.some((f) => f.scope === "redis" && f.severity === "high")).toBe(true);
  });

  it("treats a properly org-scoped key as conforming", async () => {
    await fake.hset(`cam:feed:${OID}:c1`, "_doc", JSON.stringify({ id: "c1", organizationId: OID }));
    const run = await TenantIsolationService.runCompliance(OID);
    const cam = run.namespaces.find((n) => n.prefix === "cam:feed");
    expect(cam?.keyCount).toBe(1);
    expect(cam?.conformingKeys).toBe(1);
    expect(cam?.leakedKeys.length).toBe(0);
  });
});

describe("TenantIsolationService export gate", () => {
  beforeEach(() => { fake.store.clear(); });

  it("blocks exports by default and returns a reason", async () => {
    const res = await TenantIsolationService.checkExport(OID, "patient-records", "u1");
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/blocked/i);
    expect(res.policy.allowCrossTenantExport).toBe(false);
  });

  it("allows exports once the org policy opts in", async () => {
    await TenantIsolationService.upsertPolicy(OID, {
      allowCrossTenantExport: true, allowExternalSharing: false, piiRedactionLevel: "strict", retentionDays: 365,
    }, "u1");
    const res = await TenantIsolationService.checkExport(OID, "analytics", "u1");
    expect(res.allowed).toBe(true);
  });

  it("scores degrade when the org enables permissive policy options", async () => {
    await TenantIsolationService.upsertPolicy(OID, {
      allowCrossTenantExport: true, allowExternalSharing: true, piiRedactionLevel: "none", retentionDays: 7,
    }, "u1");
    const run = await TenantIsolationService.runCompliance(OID);
    expect(run.score).toBeLessThan(100);
    expect(run.findings.some((f) => f.scope === "policy" && f.severity === "high")).toBe(true);
  });
});
