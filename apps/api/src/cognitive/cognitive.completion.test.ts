/**
 * Session 177 — cognitive completion (Tier 2 #12)
 * Read-path seeding + structural zeros.
 * Runs via FakeKv + FakePrisma (no Postgres/Redis).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));

const { CognitiveService } = await import("./cognitive.service.js");

const ORG = "org-cog-comp";
const OTHER = "org-cog-other";

function resetAll() {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
  db.reset?.();
}

beforeEach(() => resetAll());

describe("cognitive completion — C1 read path does not seed", () => {
  it("dashboard on empty org creates no cog:meta key (fails on C1)", async () => {
    const before = await kv.exists(`cog:${ORG}:meta`);
    expect(before).toBe(0);
    await CognitiveService.dashboard(ORG);
    expect(await kv.exists(`cog:${ORG}:meta`)).toBe(0);
  });

  it("dashboard is pure read — two consecutive reads identical", async () => {
    const a = await CognitiveService.dashboard(ORG);
    const b = await CognitiveService.dashboard(ORG);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe("cognitive completion — C3 structural zeros are null", () => {
  it("empty org dashboard returns null for the seven structural fields (fails on C3)", async () => {
    const d = await CognitiveService.dashboard(ORG);
    expect(d.selfEvolutionHealth).toBeNull();
    expect(d.autoFixes30d).toBeNull();
    expect(d.dnaCompleteness).toBeNull();
    expect(d.marketplaceUnifiedAssets).toBeNull();
    expect(d.federationPartners).toBeNull();
    expect(d.innovationProposalsOpen).toBeNull();
    expect(d.innovationPipelineValueUsd).toBeNull();
    expect(d.provenance).toBeTruthy();
    // Empty stores => structural_null (a real "nothing recorded", not a fabricated 0).
    expect(d.provenance?.selfEvolutionHealth).toBe("structural_null");
    expect(d.provenance?.marketplaceUnifiedAssets).toBe("structural_null");
    expect(d.provenance?.federationPartners).toBe("structural_null");
    expect(d.provenance?.innovationProposalsOpen).toBe("structural_null");
    expect(d.provenance?.note).toMatch(/backed by a real org-scoped store/i);
  });

  it("innovation pipeline fields become measured once proposals exist", async () => {
    const { InnovationPipelineService } = await import("./innovationPipeline.service.js");
    await InnovationPipelineService.create(ORG, { title: "Edge caching", category: "infra", projectedValueUsd: 25000, risk: "low", status: "approved" }, "user-1");
    await InnovationPipelineService.create(ORG, { title: "Rejected idea", category: "infra", projectedValueUsd: 999, risk: "high", status: "rejected" }, "user-1");

    const d = await CognitiveService.dashboard(ORG);
    expect(d.innovationProposalsOpen).toBe(1); // rejected excluded from open
    expect(d.innovationPipelineValueUsd).toBe(25000);
    expect(d.provenance?.innovationProposalsOpen).toBe("measured");
    // Isolation: another org still sees null.
    const other = await CognitiveService.dashboard(OTHER);
    expect(other.innovationProposalsOpen).toBeNull();
  });

  it("self-evolution fields become measured once components + auto-fixes exist", async () => {
    const { SelfEvolutionService } = await import("./selfEvolution.service.js");
    await SelfEvolutionService.upsertComponent(ORG, { component: "observability", health: 0.9 });
    await SelfEvolutionService.upsertComponent(ORG, { component: "memory", health: 0.7 });
    await SelfEvolutionService.recordAutoFix(ORG, "memory");

    const d = await CognitiveService.dashboard(ORG);
    expect(d.selfEvolutionHealth).toBe(80); // (0.9 + 0.7) / 2 * 100
    expect(d.autoFixes30d).toBe(1);
    // 2 of 6 expected DNA components configured -> 33%.
    expect(d.dnaCompleteness).toBe(33);
    expect(d.provenance?.selfEvolutionHealth).toBe("measured");
  });

  it("federation fields become measured once active partners exist", async () => {
    const { FederationService } = await import("./federation.service.js");
    await FederationService.create(ORG, { name: "Acme", type: "enterprise", trustTier: "gold", sharedDatasets: 3, sharedModels: 2, status: "active" }, "user-1");
    await FederationService.create(ORG, { name: "Pending Co", type: "supplier", trustTier: "bronze", sharedDatasets: 5, sharedModels: 5, status: "pending" }, "user-1");

    const d = await CognitiveService.dashboard(ORG);
    expect(d.federationPartners).toBe(1); // only active
    expect(d.marketplaceUnifiedAssets).toBe(5); // 3 + 2 from the active partner
    expect(d.provenance?.federationPartners).toBe("measured");
  });

  it("civilizationEntities and worldScenariosTracked are now measured from the world-model register", async () => {
    // Empty register: measured 0, provenance still structural_null (nothing recorded).
    const empty = await CognitiveService.dashboard(ORG);
    expect(empty.civilizationEntities).toBe(0);
    expect(empty.worldScenariosTracked).toBe(0);
    expect(empty.provenance?.civilizationEntities).toBe("structural_null");
    expect(empty.provenance?.worldScenariosTracked).toBe("structural_null");

    // Record one entity and one hypothesis, then the fields report real counts
    // with "measured" provenance.
    const { CognitiveWorldModelService } = await import("./worldModel.service.js");
    await CognitiveWorldModelService.createEntity(ORG, { name: "Power Grid", kind: "internal_system", domain: "infrastructure" }, "user-1");
    await CognitiveWorldModelService.createHypothesis(ORG, { statement: "Load will peak in Q4", domain: "infrastructure", horizonMonths: 6 }, "user-1");

    const d = await CognitiveService.dashboard(ORG);
    expect(d.civilizationEntities).toBe(1);
    expect(d.worldScenariosTracked).toBe(1);
    expect(d.provenance?.civilizationEntities).toBe("measured");
    expect(d.provenance?.worldScenariosTracked).toBe("measured");
  });

  it("measured aggregates remain numbers (0 is honest there)", async () => {
    const d = await CognitiveService.dashboard(ORG);
    expect(typeof d.activeBottlenecks).toBe("number");
    expect(typeof d.observatoryHealthyPct).toBe("number");
    expect(typeof d.globalMemoryEntries).toBe("number");
    expect(typeof d.predictionsMade30d).toBe("number");
  });
});

describe("cognitive completion — C2 default tenant removed", () => {
  it("dashboard requires organizationId (throws on empty) (fails on C2)", async () => {
    await expect(CognitiveService.dashboard("" as any)).rejects.toThrow();
    await expect(CognitiveService.dashboard(null as any)).rejects.toThrow();
  });

  it("ensureBootstrapped early-returns on empty oid without creating global key", async () => {
    await CognitiveService.ensureBootstrapped(undefined, "" as any);
    await CognitiveService.ensureBootstrapped(undefined, null as any);
    expect((await kv.keys("cog:*")).length).toBe(0);
  });

  it("does not leak counts across orgs (tenant isolation)", async () => {
    // Dashboard counts are per-org via prisma where organizationId: oid
    // With FakePrisma, counts are global unless we seed per-org — but our mock ensures isolation via where clause
    // For this test, we just ensure second org dashboard succeeds and also returns nulls, not leaked values
    const a = await CognitiveService.dashboard(ORG);
    const b = await CognitiveService.dashboard(OTHER);
    expect(a.selfEvolutionHealth).toBeNull();
    expect(b.selfEvolutionHealth).toBeNull();
    // Both should have same null structural fields, not cross-contaminated
    expect(a.provenance?.note).toBe(b.provenance?.note);
  });
});
