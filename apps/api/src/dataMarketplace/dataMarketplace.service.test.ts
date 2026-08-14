/**
 * Session 168 — dataMarketplace. The module shipped with no tests at all,
 * which is how a rating average divided by the install count survived.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
let demoOn = false;
vi.mock("../config/demoData.js", async (orig) => {
  const actual = await (orig() as Promise<typeof import("../config/demoData.js")>);
  return { ...actual, demoDataEnabled: () => demoOn, skipDemoSeed: () => undefined };
});

const { DataMarketplaceService: S } = await import("./dataMarketplace.service.js");

const ORG_A = "org-dmp-a";
const ORG_B = "org-dmp-b";

const publish = (over: Partial<Parameters<typeof S.publish>[0]> = {}) =>
  S.publish({
    name: "Test Asset", kind: "dataset", description: "a test asset",
    licenseModel: "one_time", priceUsd: 100, organizationId: ORG_A,
    createdBy: "user-1", ...over,
  } as Parameters<typeof S.publish>[0]);

beforeEach(() => {
  demoOn = false;
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

// ══════════════════════════════════════════════════════════════════════════
// The rating average — the defect this file exists for
// ══════════════════════════════════════════════════════════════════════════

describe("review() — rating is a mean over reviews, not over installs", () => {
  it("three five-star reviews on a much-installed asset give a rating of 5", async () => {
    const a = await publish();
    // 100 installs, nobody reviewed yet.
    for (let i = 0; i < 100; i++) await S.install(a.id, `user-${i}`, ORG_A);

    await S.review(a.id, "reviewer-1", 5, "great", ORG_A);
    await S.review(a.id, "reviewer-2", 5, undefined, ORG_A);
    const after = await S.review(a.id, "reviewer-3", 5, "excellent", ORG_A);

    // Before S168 this was 0.15 — (0*100 + 5)/101, three times over. The old
    // formula used the INSTALL count as the denominator of a rating average,
    // so genuine five-star reviews could not move the number off the floor.
    expect(after.rating).toBe(5);
    expect(after.reviewCount).toBe(3);
  });

  it("computes a true arithmetic mean of mixed ratings", async () => {
    const a = await publish();
    await S.install(a.id, "installer", ORG_A);
    await S.review(a.id, "r1", 5, undefined, ORG_A);
    await S.review(a.id, "r2", 4, undefined, ORG_A);
    const out = await S.review(a.id, "r3", 3, undefined, ORG_A);
    expect(out.rating).toBe(4);        // (5+4+3)/3
    expect(out.reviewCount).toBe(3);
  });

  it("a re-review by the same user replaces, never stuffs the ballot", async () => {
    const a = await publish();
    await S.review(a.id, "same-user", 1, "bad first impression", ORG_A);
    const out = await S.review(a.id, "same-user", 5, "changed my mind", ORG_A);
    expect(out.reviewCount).toBe(1);
    expect(out.rating).toBe(5);
  });

  it("persists the comment instead of discarding it", async () => {
    const a = await publish();
    await S.review(a.id, "r1", 4, "genuinely useful", ORG_A);
    const reviews = await S.listReviews(a.id, ORG_A);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].comment).toBe("genuinely useful");
    expect(reviews[0].userId).toBe("r1");
  });

  it("clamps out-of-range ratings rather than letting them skew the mean", async () => {
    const a = await publish();
    await S.review(a.id, "r1", 99, undefined, ORG_A);
    const out = await S.review(a.id, "r2", -4, undefined, ORG_A);
    expect(out.rating).toBe(3);  // (5+1)/2
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Unmeasured values are null
// ══════════════════════════════════════════════════════════════════════════

describe("unmeasured values are null, never 0", () => {
  it("a freshly published asset has no rating and no quality score", async () => {
    const a = await publish();
    // rating 0 would render as a zero-star review; qualityScore was 0.75, an
    // unearned number nothing in the platform computes.
    expect(a.rating).toBeNull();
    expect(a.qualityScore).toBeNull();
    expect(a.reviewCount).toBe(0);
    expect(a.installs).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Reads do not seed
// ══════════════════════════════════════════════════════════════════════════

describe("reads never bootstrap", () => {
  it("dashboard/list/get leave an empty org empty with demo data ON", async () => {
    demoOn = true;
    expect(await S.list(ORG_A)).toEqual([]);
    expect(await S.get("ma-nope", ORG_A)).toBeNull();
    const d = await S.dashboard(ORG_A);
    expect(d.totalAssets).toBe(0);
    expect(d.installsTotal).toBe(0);
    expect(d.revenue30dUsd).toBe(0);
    // Still empty after all three reads.
    expect(await S.list(ORG_A)).toEqual([]);
  });

  it("explicit bootstrap still seeds when demo data is on", async () => {
    demoOn = true;
    await S.ensureBootstrapped(undefined, ORG_A);
    expect((await S.list(ORG_A)).length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Revenue window
// ══════════════════════════════════════════════════════════════════════════

describe("revenue30dUsd is genuinely a 30-day figure", () => {
  it("excludes a one-time purchase installed more than 30 days ago", async () => {
    const a = await publish({ licenseModel: "one_time", priceUsd: 500 });
    const inst = await S.install(a.id, "buyer", ORG_A);

    // Backdate the install to 90 days ago. Before S168 one_time revenue was
    // added regardless of date, so a two-year-old purchase still counted
    // toward a figure the UI labels "Revenue (30d)".
    const old = { ...inst, installedAt: new Date(Date.now() - 90 * 86400000).toISOString() };
    await kv.hset(`dmp:i:${ORG_A}:${inst.id}`, "_doc", JSON.stringify(old));

    const d = await S.dashboard(ORG_A);
    expect(d.revenue30dUsd).toBe(0);
  });

  it("includes a one-time purchase inside the window", async () => {
    const a = await publish({ licenseModel: "one_time", priceUsd: 500 });
    await S.install(a.id, "buyer", ORG_A);
    const d = await S.dashboard(ORG_A);
    expect(d.revenue30dUsd).toBe(500);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Tenant isolation
// ══════════════════════════════════════════════════════════════════════════

describe("tenant isolation", () => {
  it("assets and reviews do not leak across organizations", async () => {
    const a = await publish();
    await S.review(a.id, "r1", 5, "org A only", ORG_A);

    expect(await S.list(ORG_B)).toEqual([]);
    expect(await S.get(a.id, ORG_B)).toBeNull();
    expect(await S.listReviews(a.id, ORG_B)).toEqual([]);
    expect((await S.dashboard(ORG_B)).totalAssets).toBe(0);
  });
});
