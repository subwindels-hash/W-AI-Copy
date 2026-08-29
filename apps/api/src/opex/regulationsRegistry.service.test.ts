/**
 * Regulatory register — org-scoped store + opex rollup.
 *
 * Backs the opex `regulations` field, which used to be a structural zero. Tests
 * pin real behaviour with FakeKv: tenant-scoped CRUD and a rollup whose figures
 * (tracked / changed30d / openGaps / upcoming) are computed from stored records.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { RegulationsRegistryService } = await import("./regulationsRegistry.service.js");

const ORG = "org-reg";
const OTHER = "org-other";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("regulation CRUD (tenant-scoped)", () => {
  it("creates and lists within the org only", async () => {
    await RegulationsRegistryService.create(ORG, { name: "GDPR", jurisdiction: "EU", category: "privacy", status: "enforcing", summary: "", impactAreas: [], gapCount: 0, gapResolved: 0 }, "admin-1");
    expect(await RegulationsRegistryService.list(ORG)).toHaveLength(1);
    expect(await RegulationsRegistryService.list(OTHER)).toHaveLength(0);
  });

  it("updates a record and refuses cross-org update", async () => {
    const reg = await RegulationsRegistryService.create(ORG, { name: "CCPA", jurisdiction: "US-CA", category: "privacy", status: "enacted", summary: "", impactAreas: [], gapCount: 5, gapResolved: 1 });
    const updated = await RegulationsRegistryService.update(ORG, reg.id, { status: "enforcing", gapResolved: 3 });
    expect(updated.status).toBe("enforcing");
    expect(updated.gapResolved).toBe(3);
    await expect(RegulationsRegistryService.update(OTHER, reg.id, { status: "updated" })).rejects.toMatchObject({ status: 404 });
  });

  it("deletes a record", async () => {
    const reg = await RegulationsRegistryService.create(ORG, { name: "X", jurisdiction: "US", category: "finance", status: "proposed", summary: "", impactAreas: [], gapCount: 0, gapResolved: 0 });
    expect(await RegulationsRegistryService.delete(ORG, reg.id)).toBe(true);
    expect(await RegulationsRegistryService.list(ORG)).toHaveLength(0);
  });
});

describe("rollup", () => {
  it("counts tracked, open gaps (floored per record), and upcoming", async () => {
    const future = new Date(Date.now() + 40 * 86_400_000).toISOString();
    await RegulationsRegistryService.create(ORG, { name: "A", jurisdiction: "EU", category: "ai_act", status: "proposed", summary: "", impactAreas: [], gapCount: 10, gapResolved: 4, effectiveDate: future });
    await RegulationsRegistryService.create(ORG, { name: "B", jurisdiction: "US", category: "tax", status: "enforcing", summary: "", impactAreas: [], gapCount: 2, gapResolved: 5 }); // negative -> floored 0

    const { summary } = await RegulationsRegistryService.rollup(ORG);
    expect(summary.tracked).toBe(2);
    expect(summary.openGaps).toBe(6); // (10-4) + max(0, 2-5)
    expect(summary.upcoming).toBe(1); // proposed with future date
  });

  it("changed30d counts records updated within 30 days but not older ones", async () => {
    await RegulationsRegistryService.create(ORG, { name: "Fresh", jurisdiction: "EU", category: "privacy", status: "enacted", summary: "", impactAreas: [], gapCount: 0, gapResolved: 0 });
    // Evaluate 60 days in the future: the record's updatedAt is now >30d old.
    const future = Date.now() + 60 * 86_400_000;
    const { summary } = await RegulationsRegistryService.rollup(ORG, future);
    expect(summary.tracked).toBe(1);
    expect(summary.changed30d).toBe(0);
  });

  it("returns an empty rollup for an org with no regulations", async () => {
    const { summary, recent } = await RegulationsRegistryService.rollup(ORG);
    expect(summary).toEqual({ tracked: 0, changed30d: 0, openGaps: 0, upcoming: 0 });
    expect(recent).toEqual([]);
  });
});
