/**
 * Session 193 — architecture completion.
 *
 * Defects closed here:
 *  - Every read/write previously took no org argument; the service
 *    read/wrote global `arch:modules` / `arch:esi` keys, so every tenant
 *    saw the same architecture registry and ESI feed.
 *  - `EsiAggregationService.portfolioReport()` hardcoded
 *    `"org-windels"` for benchmarks and mediaGen dashboards (the
 *    trading section read a global catalogue, also org-windels by
 *    default). Every tenant received org-windels' numbers.
 *  - 6 of 6 read routes had no org guard (`_req` was unused); a request
 *    without a token silently read the global keys.
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

const { ArchitectureService } = await import("./architecture.service.js");
const { EsiAggregationService } = await import("./esiAggregation.service.js");

const ORG = "org-arch-comp";
const OTHER = "org-arch-other";

function resetAll() {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
}

beforeEach(() => resetAll());

describe("architecture completion — D1 require-oid", () => {
  it("every read and write rejects an empty / null oid with 403", async () => {
    await expect(ArchitectureService.status("")).rejects.toThrow();
    await expect(ArchitectureService.status(undefined as any)).rejects.toThrow();
    await expect(ArchitectureService.listModules("")).rejects.toThrow();
    await expect(ArchitectureService.readEsi("")).rejects.toThrow();
    await expect(ArchitectureService.pushEsiSignal("", { source: "x", signal: "y", confidence: 0.5 })).rejects.toThrow();
    await expect(EsiAggregationService.portfolioReport("")).rejects.toThrow();
    await expect(EsiAggregationService.portfolioReport(undefined as any)).rejects.toThrow();
  });
});

describe("architecture completion — D2 cross-tenant isolation", () => {
  it("two orgs register separate modules and never share keys", async () => {
    await ArchitectureService.registerModule(ORG, {
      name: "Org A Module",
      description: "test",
      status: "available",
      introducedInSession: 100,
      apis: ["a"],
      dependsOn: [],
    });
    await ArchitectureService.registerModule(OTHER, {
      name: "Org B Module",
      description: "test",
      status: "available",
      introducedInSession: 200,
      apis: ["b"],
      dependsOn: [],
    });
    const a = await ArchitectureService.listModules(ORG);
    const b = await ArchitectureService.listModules(OTHER);
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
    expect(a[0].name).toBe("Org A Module");
    expect(b[0].name).toBe("Org B Module");
    // The two orgs share no keys.
    const orgKeys = Array.from(kv.zsets.keys()).filter((k) => k.startsWith("arch:modules:"));
    expect(orgKeys).toContain(`arch:modules:${ORG}`);
    expect(orgKeys).toContain(`arch:modules:${OTHER}`);
  });

  it("legacy global keys are adopted into the org namespace once", async () => {
    // Seed the legacy global key with a module.
    await kv.zadd("arch:modules", 50, JSON.stringify({
      id: "50:legacy-mod", name: "LegacyMod", description: "test",
      status: "available", introducedInSession: 50, apis: ["x"], dependsOn: [],
    }));
    // First call to an org adopts the legacy entry.
    const a = await ArchitectureService.listModules(ORG);
    expect(a.length).toBe(1);
    expect(a[0].id).toBe("50:legacy-mod");
    // The marker is set.
    expect(await kv.get(`arch:imported:${ORG}`)).toBe("1");
    // The legacy global key is left in place (rollback safety).
    expect((await kv.zrange("arch:modules", 0, -1)).length).toBe(1);
  });
});

describe("architecture completion — D3 ESI signals are per-org", () => {
  it("two orgs push signals into separate streams", async () => {
    await ArchitectureService.pushEsiSignal(ORG, { source: "src-a", signal: "sig-a", confidence: 0.5 });
    await ArchitectureService.pushEsiSignal(ORG, { source: "src-a", signal: "sig-a2", confidence: 0.6 });
    await ArchitectureService.pushEsiSignal(OTHER, { source: "src-b", signal: "sig-b", confidence: 0.7 });
    const a = await ArchitectureService.readEsi(ORG);
    const b = await ArchitectureService.readEsi(OTHER);
    expect(a.signals.length).toBe(2);
    expect(b.signals.length).toBe(1);
    expect(a.signals[0].source).toMatch(/^src-a$/);
    expect(b.signals[0].source).toBe("src-b");
    // The two orgs share no ESI keys.
    const esiKeys = Array.from(kv.zsets.keys()).filter((k) => k.startsWith("arch:esi:"));
    expect(esiKeys).toContain(`arch:esi:${ORG}`);
    expect(esiKeys).toContain(`arch:esi:${OTHER}`);
  });
});

describe("architecture completion — D4 cross-portfolio report is org-scoped", () => {
  it("portfolioReport(oid) reads the calling org's sections, not org-windels", async () => {
    // Two orgs each push a signal. The report's `totalSignals` must
    // match the calling org's own ESI stream, not a shared global.
    await ArchitectureService.pushEsiSignal(ORG, { source: "a", signal: "s1", confidence: 0.5 });
    await ArchitectureService.pushEsiSignal(ORG, { source: "a", signal: "s2", confidence: 0.5 });
    await ArchitectureService.pushEsiSignal(OTHER, { source: "b", signal: "s3", confidence: 0.5 });
    const aReport = await EsiAggregationService.portfolioReport(ORG);
    const bReport = await EsiAggregationService.portfolioReport(OTHER);
    expect(aReport.overview.totalSignals).toBe(2);
    expect(bReport.overview.totalSignals).toBe(1);
  });
});
