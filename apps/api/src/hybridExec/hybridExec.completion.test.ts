/**
 * Session 194 — hybridExec completion.
 *
 * Defects closed here:
 *  - Global keys (`hx:models`, `hx:nodes`, `hx:routes`, `hx:m:req`,
 *    `hx:m:rb`) — every tenant shared the same model registry, GPU
 *    nodes, and route counter.
 *  - `dashboard()` reported `activeMode: "hybrid"`,
 *    `costOptimization: true`, `vendorNeutral: true`,
 *    `routedThroughKernel: true` — every org saw "hybrid mode active,
 *    cost optimization enabled, vendor-neutral, routed through kernel"
 *    regardless of state.
 *  - 7 of 7 read routes had no org guard.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const { HybridExecService } = await import("./hybridExec.service.js");

const ORG = "org-hx-comp";
const OTHER = "org-hx-other";

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

describe("hybridExec completion — D1 require-oid", () => {
  it("every read and write rejects an empty / null oid with 403", async () => {
    await expect(HybridExecService.dashboard("")).rejects.toThrow();
    await expect(HybridExecService.dashboard(undefined as any)).rejects.toThrow();
    await expect(HybridExecService.listModels("")).rejects.toThrow();
    await expect(HybridExecService.listNodes("")).rejects.toThrow();
    await expect(HybridExecService.registerModel("", {
      name: "x", modality: "text", size: "1B", quant: "fp16", vramMb: 100, provider: "self-hosted",
    })).rejects.toThrow();
    await expect(HybridExecService.routeRequest("", { modality: "text", requiredVramMb: 100 })).rejects.toThrow();
    await expect(HybridExecService.rollback("", "x")).rejects.toThrow();
    await expect(HybridExecService.setMode("", "self-hosted")).rejects.toThrow();
    await expect(HybridExecService.setFlag("", "costOptimization", true)).rejects.toThrow();
  });
});

describe("hybridExec completion — D2 hardcoded dashboard figures", () => {
  it("fresh org reports zero models, zero nodes, gate flags off (fails on D2)", async () => {
    const d = await HybridExecService.dashboard(ORG);
    expect(d.modelsRegistered).toBe(0);
    expect(d.modelsDeployed).toBe(0);
    expect(d.gpuNodes).toBe(0);
    expect(d.gpuUtilizationPct).toBe(0);
    expect(d.canaryActive).toBe(false);
    expect(d.rollbacks24h).toBe(0);
    // The three boolean flags are read from the per-org flags hash
    // and default to false on a fresh org.
    expect(d.costOptimization).toBe(false);
    expect(d.vendorNeutral).toBe(false);
    expect(d.routedThroughKernel).toBe(false);
  });

  it("setFlag toggles the dashboard's boolean flags; setMode controls activeMode", async () => {
    await HybridExecService.setFlag(ORG, "costOptimization", true);
    await HybridExecService.setFlag(ORG, "vendorNeutral", true);
    await HybridExecService.setMode(ORG, "connected-enterprise");
    const d = await HybridExecService.dashboard(ORG);
    expect(d.costOptimization).toBe(true);
    expect(d.vendorNeutral).toBe(true);
    expect(d.routedThroughKernel).toBe(false);
    expect(d.activeMode).toBe("connected-enterprise");
  });
});

describe("hybridExec completion — D3 cross-tenant isolation", () => {
  it("two orgs register separate models and never share keys", async () => {
    await HybridExecService.registerModel(ORG, {
      name: "Org A Model", modality: "text", size: "1B", quant: "fp16", vramMb: 100, provider: "self-hosted",
    });
    await HybridExecService.registerModel(OTHER, {
      name: "Org B Model", modality: "text", size: "1B", quant: "fp16", vramMb: 100, provider: "self-hosted",
    });
    const a = await HybridExecService.listModels(ORG);
    const b = await HybridExecService.listModels(OTHER);
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
    expect(a[0].name).toBe("Org A Model");
    expect(b[0].name).toBe("Org B Model");
    // The two orgs share no keys.
    const orgKeys = Array.from(kv.hashes.keys()).filter((k) => k.startsWith("hx:model:"));
    expect(orgKeys).toContain(`hx:model:${ORG}:${a[0].id}`);
    expect(orgKeys).toContain(`hx:model:${OTHER}:${b[0].id}`);
  });
});

describe("hybridExec completion — D4 no-seed on read", () => {
  it("dashboard on a fresh org does not write any hx:* keys beyond the imported marker", async () => {
    await HybridExecService.dashboard(ORG);
    const keys = [
      ...Array.from(kv.strings.keys()),
      ...Array.from(kv.hashes.keys()),
      ...Array.from(kv.zsets.keys()),
    ];
    for (const k of keys) {
      if (k.startsWith("hx:")) {
        expect(k === `hx:imported:${ORG}`).toBe(true);
      }
    }
  });
});

describe("hybridExec completion — D5 per-org route counter", () => {
  it("routeRequest increments the calling org's counter, not a global one", async () => {
    demoEnabled.value = true;
    // The S43 demo seed installs models and nodes per-org; call
    // bootstrapOrg explicitly so the route logic has data to work
    // with.
    await HybridExecService.bootstrapOrg(ORG);
    await HybridExecService.bootstrapOrg(OTHER);
    await HybridExecService.routeRequest(ORG, { modality: "text", requiredVramMb: 100 });
    await HybridExecService.routeRequest(ORG, { modality: "text", requiredVramMb: 100 });
    await HybridExecService.routeRequest(OTHER, { modality: "text", requiredVramMb: 100 });
    const orgCounter = await kv.get(`hx:m:req:${ORG}`);
    const otherCounter = await kv.get(`hx:m:req:${OTHER}`);
    expect(orgCounter).toBe("2");
    expect(otherCounter).toBe("1");
    // The legacy global `hx:m:req` is never written by the new service.
    expect(await kv.get("hx:m:req")).toBeNull();
  });
});
