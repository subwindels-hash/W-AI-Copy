/**
 * Federation register — org-scoped store + cognitive rollup.
 *
 * Backs federationPartners / marketplaceUnifiedAssets (previously structural
 * null). FakeKv, no real infra.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { FederationService } = await import("./federation.service.js");
const ORG = "org-fed";
const OTHER = "org-other";

beforeEach(() => { kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear(); });

describe("federation CRUD + rollup", () => {
  it("creates and lists per-org only", async () => {
    await FederationService.create(ORG, { name: "Acme", type: "enterprise", trustTier: "gold", sharedDatasets: 1, sharedModels: 1, status: "active" });
    expect(await FederationService.list(ORG)).toHaveLength(1);
    expect(await FederationService.list(OTHER)).toHaveLength(0);
  });

  it("rollup counts only active partners and sums their shared assets", async () => {
    await FederationService.create(ORG, { name: "Active", type: "enterprise", trustTier: "gold", sharedDatasets: 4, sharedModels: 3, status: "active" });
    await FederationService.create(ORG, { name: "Pending", type: "supplier", trustTier: "bronze", sharedDatasets: 9, sharedModels: 9, status: "pending" });

    const r = await FederationService.rollup(ORG);
    expect(r.activePartners).toBe(1);
    expect(r.unifiedAssets).toBe(7); // 4 + 3 from the active partner
    expect(r.hasData).toBe(true);
  });

  it("update can activate a pending partner (then it counts)", async () => {
    const p = await FederationService.create(ORG, { name: "P", type: "academic", trustTier: "silver", sharedDatasets: 2, sharedModels: 0, status: "pending" });
    expect((await FederationService.rollup(ORG)).activePartners).toBe(0);
    await FederationService.update(ORG, p.id, { status: "active" });
    const r = await FederationService.rollup(ORG);
    expect(r.activePartners).toBe(1);
    expect(r.unifiedAssets).toBe(2);
  });

  it("empty org rollup has hasData=false", async () => {
    expect(await FederationService.rollup(ORG)).toMatchObject({ activePartners: 0, unifiedAssets: 0, hasData: false });
  });

  it("refuses update on unknown/cross-org partner", async () => {
    const p = await FederationService.create(ORG, { name: "P", type: "partner", trustTier: "bronze", sharedDatasets: 0, sharedModels: 0, status: "pending" });
    await expect(FederationService.update(OTHER, p.id, { status: "active" })).rejects.toMatchObject({ status: 404 });
  });
});
