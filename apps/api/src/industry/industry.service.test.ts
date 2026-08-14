/**
 * Session 169 — Industry Solutions & Operations completion unit tests.
 * Covers:
 * - Read paths never seed (dashboard() on fresh org does not create adoptions or bootstrap)
 * - Unmeasured metrics (semanticSearchLatencyMs, maturity score) report null, never 0
 * - Real adoption aggregation into the 25 vertical suites
 * - Tenant isolation across adoptions
 * - Provenance telemetry block
 * - Explicit bootstrap demo gating
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

let demoOn = false;
vi.mock("../config/demoData.js", async (orig) => {
  const actual = await (orig() as Promise<typeof import("../config/demoData.js")>);
  return { ...actual, demoDataEnabled: () => demoOn, skipDemoSeed: () => undefined };
});

const { IndustryService: S } = await import("./industry.service.js");

const ORG_A = "org-ind-a";
const ORG_B = "org-ind-b";

beforeEach(() => {
  demoOn = false;
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
});

// ══════════════════════════════════════════════════════════════════════════
// 1. Read paths never seed (Defect #8 fix)
// ══════════════════════════════════════════════════════════════════════════

describe("read paths never bootstrap or seed", () => {
  it("dashboard() on a fresh organization leaves adoptions empty even when demo data is ON", async () => {
    demoOn = true;
    const d = await S.dashboard(ORG_A);
    expect(d.adoptions).toEqual([]);
    const adoptionsList = await S.listAdoptions(ORG_A);
    expect(adoptionsList).toEqual([]);
  });

  it("explicit bootstrap seeds demo adoptions only when demo data is ON", async () => {
    demoOn = true;
    await S.ensureBootstrapped(undefined, ORG_A);
    const adoptionsList = await S.listAdoptions(ORG_A);
    expect(adoptionsList.length).toBe(2);
    expect(adoptionsList.some((a) => a.industry === "healthcare")).toBe(true);
    expect(adoptionsList.some((a) => a.industry === "banking")).toBe(true);
  });

  it("explicit bootstrap does NOT seed demo adoptions when demo data is OFF", async () => {
    demoOn = false;
    await S.ensureBootstrapped(undefined, ORG_A);
    const adoptionsList = await S.listAdoptions(ORG_A);
    expect(adoptionsList).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. Unmeasured metrics report null, never 0
// ══════════════════════════════════════════════════════════════════════════

describe("honest nulls for unmeasured metrics", () => {
  it("semantic search latency reports null on fresh dashboard load", async () => {
    const d = await S.dashboard(ORG_A);
    expect(d.semanticSearchLatencyMs).toBeNull();
  });

  it("maturity assessment reports null for overall score and all dimensions", async () => {
    const d = await S.dashboard(ORG_A);
    expect(d.maturity.overall).toBeNull();
    expect(d.maturity.benchmarkPct).toBeNull();
    for (const dim of d.maturity.dimensions) {
      expect(dim.score).toBeNull();
    }
    expect(d.maturity.recommendedNext).toMatch(/assessment/i);
  });

  it("unadopted industry suites have null readinessPct, not 0%", async () => {
    const d = await S.dashboard(ORG_A);
    const gov = d.industries.find((i) => i.id === "government");
    expect(gov).toBeDefined();
    expect(gov!.employees).toBe(0);
    expect(gov!.workflows).toBe(0);
    expect(gov!.readinessPct).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. Real adoption aggregation
// ══════════════════════════════════════════════════════════════════════════

describe("industry suites aggregate real tenant adoptions", () => {
  it("aggregates employee counts and computed readiness from active adoptions", async () => {
    await S.createAdoption(ORG_A, {
      industry: "healthcare",
      packageName: "EHR AI Copilot",
      status: "adopted",
      employees: 200,
    });
    await S.createAdoption(ORG_A, {
      industry: "healthcare",
      packageName: "Radiology Assistant",
      status: "piloting",
      employees: 50,
    });

    const d = await S.dashboard(ORG_A);
    const hc = d.industries.find((i) => i.id === "healthcare");
    expect(hc).toBeDefined();
    expect(hc!.employees).toBe(250);
    expect(hc!.workflows).toBe(2);
    expect(hc!.adoptionsCount).toBe(2);
    // (100 + 50) / 2 = 75%
    expect(hc!.readinessPct).toBe(75);
  });

  it("supports multiple distinct industry verticals", async () => {
    await S.createAdoption(ORG_A, {
      industry: "banking",
      packageName: "Fraud Sentinel",
      status: "adopted",
      employees: 300,
    });
    await S.createAdoption(ORG_A, {
      industry: "retail",
      packageName: "Smart Inventory",
      status: "planned",
      employees: 80,
    });

    const d = await S.dashboard(ORG_A);
    const banking = d.industries.find((i) => i.id === "banking");
    const retail = d.industries.find((i) => i.id === "retail");

    expect(banking!.employees).toBe(300);
    expect(banking!.readinessPct).toBe(100);

    expect(retail!.employees).toBe(80);
    expect(retail!.readinessPct).toBe(25);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. Adoptions CRUD
// ══════════════════════════════════════════════════════════════════════════

describe("adoptions store CRUD", () => {
  it("creates, reads, updates, and deletes adoptions", async () => {
    const created = await S.createAdoption(ORG_A, {
      industry: "construction",
      packageName: "Site Safety Vision Pack",
      status: "piloting",
      employees: 75,
      notes: "Testing on site 4B",
    }, "user-123");

    expect(created.id).toMatch(/^ind-/);
    expect(created.packageName).toBe("Site Safety Vision Pack");

    const fetched = await S.getAdoption(ORG_A, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.employees).toBe(75);

    const updated = await S.updateAdoption(ORG_A, created.id, {
      status: "adopted",
      employees: 100,
    });
    expect(updated!.status).toBe("adopted");
    expect(updated!.employees).toBe(100);

    const deleted = await S.deleteAdoption(ORG_A, created.id);
    expect(deleted).toBe(true);

    const after = await S.getAdoption(ORG_A, created.id);
    expect(after).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. Tenant Isolation
// ══════════════════════════════════════════════════════════════════════════

describe("tenant isolation", () => {
  it("org B cannot view or modify org A's adoptions", async () => {
    const adA = await S.createAdoption(ORG_A, {
      industry: "defense_public_safety",
      packageName: "Perimeter Intel",
      status: "adopted",
      employees: 500,
    });

    const listB = await S.listAdoptions(ORG_B);
    expect(listB).toEqual([]);

    const getB = await S.getAdoption(ORG_B, adA.id);
    expect(getB).toBeNull();

    const updateB = await S.updateAdoption(ORG_B, adA.id, { employees: 999 });
    expect(updateB).toBeNull();

    const dashB = await S.dashboard(ORG_B);
    const defB = dashB.industries.find((i) => i.id === "defense_public_safety");
    expect(defB!.employees).toBe(0);
    expect(defB!.readinessPct).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 6. Provenance
// ══════════════════════════════════════════════════════════════════════════

describe("provenance telemetry", () => {
  it("provides structured metric classification", async () => {
    const d = await S.dashboard(ORG_A);
    expect(d.provenance).toBeDefined();
    expect(d.provenance.source).toBe("windels_telemetry");
    expect(d.provenance.metrics.semanticSearchLatencyMs).toBe("null_unmeasured");
    expect(d.provenance.metrics.maturityScore).toBe("null_unmeasured");
    expect(d.provenance.metrics.adoptionsCount).toBe("structural_zero");
  });

  it("marks adoptions as measured once records exist", async () => {
    await S.createAdoption(ORG_A, {
      industry: "energy_utilities",
      packageName: "Grid Flow Optimizer",
      status: "adopted",
      employees: 350,
    });
    const d = await S.dashboard(ORG_A);
    expect(d.provenance.metrics.adoptionsCount).toBe("measured");
    expect(d.provenance.metrics.employeesCovered).toBe("measured");
  });
});
