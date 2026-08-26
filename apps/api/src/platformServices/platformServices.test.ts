/**
 * Session 200 — Platform Services decision-engine tests (first dedicated suite).
 *
 * platformServices (910 svc SLOC) shipped with no tests. This suite locks in its
 * two correctness/security-critical decision engines:
 *   - FeatureFlagsService.evaluate — override precedence, boolean/kill-switch,
 *     tenant, percentage bucketing, and segment strategies
 *   - LicensingService — issue/verify signed keys, tamper detection, revoke,
 *     expiry, and entitlement counts
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { FeatureFlagsService: FF } = await import("./featureFlags.service.js");
const { LicensingService: LS } = await import("./licensing.service.js");

beforeEach(() => { kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear(); });

function flag(over: Record<string, any> = {}) {
  return FF.create({
    key: over.key ?? "feat", name: "Feat", description: "d",
    status: over.status ?? "active", enabled: over.enabled ?? true,
    rolloutPct: over.rolloutPct ?? 0, strategy: over.strategy ?? "boolean",
    overrides: over.overrides ?? [], segments: over.segments ?? [], tags: [], owner: "o",
    ...over,
  } as any);
}

describe("FeatureFlagsService.evaluate", () => {
  it("returns false for an unknown or inactive flag", async () => {
    expect(await FF.evaluate("missing", {})).toBe(false);
    await flag({ key: "paused", status: "paused", enabled: true });
    expect(await FF.evaluate("paused", {})).toBe(false);
  });

  it("boolean / kill-switch strategy honors the enabled flag", async () => {
    await flag({ key: "b-on", strategy: "boolean", enabled: true });
    await flag({ key: "b-off", strategy: "boolean", enabled: false });
    await flag({ key: "kill", strategy: "kill-switch", enabled: false });
    expect(await FF.evaluate("b-on", {})).toBe(true);
    expect(await FF.evaluate("b-off", {})).toBe(false);
    expect(await FF.evaluate("kill", {})).toBe(false);
  });

  it("overrides take precedence over the strategy", async () => {
    await flag({ key: "ov", strategy: "boolean", enabled: false, overrides: [
      { subject: "user-1", kind: "user", enabled: true },
      { subject: "org-2", kind: "org", enabled: true },
    ] });
    expect(await FF.evaluate("ov", { userId: "user-1" })).toBe(true);   // override wins over enabled:false
    expect(await FF.evaluate("ov", { orgId: "org-2" })).toBe(true);
    expect(await FF.evaluate("ov", { userId: "nobody" })).toBe(false);  // falls through to strategy
  });

  it("tenant strategy requires a tenant context", async () => {
    await flag({ key: "t", strategy: "tenant", enabled: true });
    expect(await FF.evaluate("t", { tenantId: "t-1" })).toBe(true);
    expect(await FF.evaluate("t", {})).toBe(false);
  });

  it("percentage strategy is deterministic per subject and respects the rollout boundary", async () => {
    await flag({ key: "p0", strategy: "percentage", rolloutPct: 0 });
    await flag({ key: "p100", strategy: "percentage", rolloutPct: 100 });
    // 0% → nobody; 100% → everybody
    expect(await FF.evaluate("p0", { userId: "anyone" })).toBe(false);
    expect(await FF.evaluate("p100", { userId: "anyone" })).toBe(true);
    // deterministic: same subject → same answer twice
    await flag({ key: "p50", strategy: "percentage", rolloutPct: 50 });
    const first = await FF.evaluate("p50", { userId: "stable-subject" });
    const second = await FF.evaluate("p50", { userId: "stable-subject" });
    expect(first).toBe(second);
  });

  it("segment strategy matches the caller's segment", async () => {
    await flag({ key: "seg", strategy: "user-segment", enabled: true, segments: ["beta", "internal"] });
    expect(await FF.evaluate("seg", { segment: "beta" })).toBe(true);
    expect(await FF.evaluate("seg", { segment: "public" })).toBe(false);
  });

  it("setEnabled flips status and evaluation", async () => {
    const f = await flag({ key: "toggle", strategy: "boolean", enabled: true });
    await FF.setEnabled(f.id, false);
    expect(await FF.evaluate("toggle", {})).toBe(false);
  });
});

describe("LicensingService", () => {
  it("issues a signed license that verifies valid", async () => {
    const l = await LS.issue({ holder: "Acme", tenantId: "t-1", tier: "enterprise", seats: 50 });
    expect(l.key).toMatch(/^WLNS-/);
    expect(l.signature.length).toBeGreaterThan(0);
    const res = await LS.verify(l.key);
    expect(res.valid).toBe(true);
    expect(res.license?.id).toBe(l.id);
  });

  it("detects a tampered license (bad signature)", async () => {
    const l = await LS.issue({ holder: "Acme", tenantId: "t-1", tier: "pro", seats: 10 });
    // Tamper with the stored record's seats, leaving the old signature in place.
    const raw = await kv.get(`psvc:license:${l.id}`);
    const doc = JSON.parse(raw!);
    doc.seats = 9999;
    await kv.set(`psvc:license:${l.id}`, JSON.stringify(doc));
    const res = await LS.verify(l.key);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("bad_signature");
  });

  it("rejects a revoked license", async () => {
    const l = await LS.issue({ holder: "Acme", tenantId: "t-1", tier: "pro", seats: 10 });
    await LS.revoke(l.id);
    const res = await LS.verify(l.key);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("revoked");
  });

  it("rejects an expired license", async () => {
    const l = await LS.issue({ holder: "Acme", tenantId: "t-1", tier: "pro", seats: 10, daysValid: -1 });
    const res = await LS.verify(l.key);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("expired");
  });

  it("returns not_found for an unknown key", async () => {
    expect((await LS.verify("WLNS-NOPE")).reason).toBe("not_found");
  });

  it("counts active / expiring licenses", async () => {
    await LS.issue({ holder: "A", tenantId: "t1", tier: "pro", seats: 5, daysValid: 365 });
    await LS.issue({ holder: "B", tenantId: "t2", tier: "pro", seats: 5, daysValid: 10 }); // expiring within 30d
    const c = await LS.counts();
    expect(c.total).toBe(2);
    expect(c.active).toBe(2);
    expect(c.expiring30d).toBeGreaterThanOrEqual(1);
  });
});
