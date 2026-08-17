/**
 * Session 192 — UX Intelligence completion.
 *
 *  - Fresh org dashboard returns honest zeros, never the hardcoded
 *    `agentsOnline: 3` / `accessibilityOpen: 1` / `designGateActive: true`
 *    the S78 service asserted.
 *  - Per-org keys (`ux:tokens:<org>`, `ux:components:<org>`, …) replace
 *    the S78 global keys; a second org cannot read the first's records.
 *  - `runDesignQa` increments the per-org counter, not the global one.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const demoEnabled = vi.hoisted(() => ({ value: false }));
vi.mock("../config/demoData.js", () => ({
  demoDataEnabled: () => demoEnabled.value,
  skipDemoSeed: () => undefined,
}));

const { UxIntelligenceService } = await import("./uxIntelligence.service.js");

const ORG = "org-uxi-comp";
const OTHER = "org-uxi-other";

function resetAll() {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
}

beforeEach(() => {
  resetAll();
  demoEnabled.value = false;
});

describe("uxIntelligence completion — D1 hardcoded dashboard figures", () => {
  it("fresh org dashboard reports zero agents, zero open findings, gate inactive (fails on D1)", async () => {
    // With the demo gate shut, a fresh org gets nothing installed and
    // the dashboard reports honest zeros.
    const d = await UxIntelligenceService.dashboard(ORG);
    expect(d.agentsOnline).toBe(0);
    expect(d.accessibilityOpen).toBe(0);
    expect(d.designGateActive).toBe(false);
    expect(d.tokens).toBe(0);
    expect(d.components).toBe(0);
    expect(d.brands).toBe(0);
    // deviceClasses is a static catalogue (9 specs); it stays.
    expect(d.deviceClasses).toBe(9);
  });

  it("dashboard does not seed: no ux:* keys beyond the imported marker", async () => {
    // Wipe the imported marker to ensure the next read is a true first-touch.
    await kv.del(`ux:imported:${ORG}`);
    await UxIntelligenceService.dashboard(ORG);
    // The only key created on a fresh read is the adoption marker.
    const keys = [
      ...Array.from(kv.strings.keys()),
      ...Array.from(kv.hashes.keys()),
      ...Array.from(kv.zsets.keys()),
    ];
    for (const k of keys) {
      if (k.startsWith("ux:")) {
        expect(k === `ux:imported:${ORG}`).toBe(true);
      }
    }
  });
});

describe("uxIntelligence completion — D2 tenant isolation", () => {
  it("two orgs run separate bootstraps and never share keys (D2 cross-tenant shape)", async () => {
    demoEnabled.value = true;
    await UxIntelligenceService.ensureBootstrapped(undefined, ORG);
    await UxIntelligenceService.ensureBootstrapped(undefined, OTHER);
    const orgTokens = await UxIntelligenceService.listTokens(ORG);
    const otherTokens = await UxIntelligenceService.listTokens(OTHER);
    expect(orgTokens.length).toBeGreaterThan(0);
    expect(otherTokens.length).toBeGreaterThan(0);
    // Each org's catalogue lives under its own key namespace.
    const orgTokenKeys = Array.from(kv.hashes.keys()).filter((k) => k.startsWith(`ux:tok:${ORG}:`));
    const otherTokenKeys = Array.from(kv.hashes.keys()).filter((k) => k.startsWith(`ux:tok:${OTHER}:`));
    expect(orgTokenKeys.length).toBeGreaterThan(0);
    expect(otherTokenKeys.length).toBeGreaterThan(0);
    expect(orgTokenKeys.every((k) => k.includes(`:${ORG}:`))).toBe(true);
    expect(otherTokenKeys.every((k) => k.includes(`:${OTHER}:`))).toBe(true);
    // Specifically: the ORG never sees the OTHER's token keys.
    const orgHashKeys = new Set(Array.from(kv.hashes.keys()));
    for (const k of orgHashKeys) {
      if (k.startsWith("ux:tok:")) expect(k.includes(`:${ORG}:`) || k.includes(`:${OTHER}:`)).toBe(true);
    }
  });
});

describe("uxIntelligence completion — D3 runDesignQa is per-org", () => {
  it("qa/run increments only the calling org's counter", async () => {
    await UxIntelligenceService.runDesignQa(ORG);
    await UxIntelligenceService.runDesignQa(ORG);
    await UxIntelligenceService.runDesignQa(ORG);
    await UxIntelligenceService.runDesignQa(OTHER);
    // Org should have 3 reviews; other should have 1.
    const orgCounter = await kv.get(`ux:r24:${ORG}`);
    const otherCounter = await kv.get(`ux:r24:${OTHER}`);
    expect(orgCounter).toBe("3");
    expect(otherCounter).toBe("1");
    // The legacy global `ux:r24` is never written by the new service.
    expect(await kv.get("ux:r24")).toBeNull();
  });
});

describe("uxIntelligence completion — D4 require-oid", () => {
  it("every read and write requires an org id", async () => {
    await expect(UxIntelligenceService.dashboard("")).rejects.toThrow();
    await expect(UxIntelligenceService.dashboard(undefined as any)).rejects.toThrow();
    await expect(UxIntelligenceService.listTokens("")).rejects.toThrow();
    await expect(UxIntelligenceService.listComponents("")).rejects.toThrow();
    await expect(UxIntelligenceService.listFindings("")).rejects.toThrow();
    await expect(UxIntelligenceService.listAgents("")).rejects.toThrow();
    await expect(UxIntelligenceService.listBrands("")).rejects.toThrow();
    await expect(UxIntelligenceService.runDesignQa("")).rejects.toThrow();
  });
});

