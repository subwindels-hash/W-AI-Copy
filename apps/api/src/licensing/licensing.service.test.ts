/**
 * Session 164 — AI Licensing & Monetization (S52 module).
 *
 * This module records revenue, computes fee splits and accrues payout
 * liabilities, and had zero tests. The cases below pin the money paths:
 * the 30-day window is a real window, an expired grant stops billing, a
 * missing asset refuses rather than inventing a revenue share, and one
 * tenant's usage never touches another tenant's balance.
 *
 * Runs fully in-memory: FakeKv replaces Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const demo = { enabled: false };
vi.mock("../config/demoData.js", () => ({
  demoDataEnabled: () => demo.enabled,
  skipDemoSeed: () => undefined,
}));

const { LicensingService } = await import("./licensing.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  demo.enabled = false;
});

async function asset(oid = ORG_A, over: Partial<Parameters<typeof LicensingService.register>[0]> = {}) {
  return LicensingService.register({
    type: "ai_skill", externalAssetId: "skill:x", name: "Skill X",
    billingModel: "usage", priceCents: 100, ownerId: "u1", organizationId: oid,
    ...over,
  } as any);
}

async function grantOn(a: { id: string }, oid = ORG_A, expiresAt?: string) {
  return LicensingService.grant({ assetId: a.id, licenseeOrgId: "lessee", organizationId: oid, expiresAt });
}

describe("revenue is a window, not a running total", () => {
  it("counts a fresh usage event in the 30-day figure", async () => {
    const a = await asset(); const g = await grantOn(a);
    await LicensingService.recordUsage({ grantId: g.id, usageCents: 1000, organizationId: ORG_A });
    const d = await LicensingService.dashboard(ORG_A);
    expect(d.revenueCents30d).toBe(1000);
    expect(d.revenueCentsAllTime).toBe(1000);
  });

  it("excludes an entry older than 30 days from the window but not from lifetime", async () => {
    const a = await asset(); const g = await grantOn(a);
    const e = await LicensingService.recordUsage({ grantId: g.id, usageCents: 500, organizationId: ORG_A });
    // Backdate the ledger entry 45 days.
    const old = { ...e, at: new Date(Date.now() - 45 * 86400_000).toISOString() };
    kv.hashes.get(`lic:r:${ORG_A}:${e.id}`)!._doc = JSON.stringify(old);

    const d = await LicensingService.dashboard(ORG_A);
    expect(d.revenueCents30d).toBe(0);
    expect(d.revenueCentsAllTime).toBe(500);
  });

  it("reports per-asset 30d revenue as a window too", async () => {
    const a = await asset(); const g = await grantOn(a);
    const e = await LicensingService.recordUsage({ grantId: g.id, usageCents: 700, organizationId: ORG_A });
    const old = { ...e, at: new Date(Date.now() - 60 * 86400_000).toISOString() };
    kv.hashes.get(`lic:r:${ORG_A}:${e.id}`)!._doc = JSON.stringify(old);

    const [row] = await LicensingService.listAssets(ORG_A);
    expect(row.revenueCents30d).toBe(0);
    expect(row.revenueCentsAllTime).toBe(700);
  });
});

describe("fee splits are declared and auditable", () => {
  it("applies the declared platform fee and echoes the rate", async () => {
    const a = await asset(); const g = await grantOn(a);
    const e = await LicensingService.recordUsage({ grantId: g.id, usageCents: 1000, organizationId: ORG_A });
    expect(e.platformFeePct).toBe(20);
    expect(e.platformFeeCents).toBe(200);
  });

  it("uses a zero revenue share when the asset declares none", async () => {
    // Previously fabricated a 10% share for assets that never set one.
    const a = await asset(); const g = await grantOn(a);
    const e = await LicensingService.recordUsage({ grantId: g.id, usageCents: 1000, organizationId: ORG_A });
    expect(e.revenueSharePct).toBe(0);
    expect(e.revenueShareCents).toBe(0);
    expect(e.ownerPayoutCents).toBe(800);
  });

  it("honours a declared revenue share", async () => {
    const a = await asset(ORG_A, { revenueSharePct: 30 }); const g = await grantOn(a);
    const e = await LicensingService.recordUsage({ grantId: g.id, usageCents: 1000, organizationId: ORG_A });
    expect(e.revenueShareCents).toBe(300);
    expect(e.ownerPayoutCents).toBe(500);
  });

  it("splits add back up to the gross", async () => {
    const a = await asset(ORG_A, { revenueSharePct: 15 }); const g = await grantOn(a);
    const e = await LicensingService.recordUsage({ grantId: g.id, usageCents: 999, organizationId: ORG_A });
    expect(e.platformFeeCents + e.revenueShareCents + e.ownerPayoutCents).toBe(e.grossCents);
  });
});

describe("billing refuses what it should", () => {
  it("refuses usage against a grant whose asset is missing", async () => {
    const a = await asset(); const g = await grantOn(a);
    kv.hashes.delete(`lic:a:${ORG_A}:${a.id}`);
    await expect(LicensingService.recordUsage({ grantId: g.id, usageCents: 100, organizationId: ORG_A }))
      .rejects.toThrow(/asset not found/);
  });

  it("refuses usage against an expired grant", async () => {
    const a = await asset();
    const g = await grantOn(a, ORG_A, new Date(Date.now() - 86400_000).toISOString());
    await expect(LicensingService.recordUsage({ grantId: g.id, organizationId: ORG_A }))
      .rejects.toThrow(/expired/);
  });

  it("refuses usage against a canceled grant", async () => {
    const a = await asset(); const g = await grantOn(a);
    await LicensingService.cancelGrant({ grantId: g.id, organizationId: ORG_A });
    await expect(LicensingService.recordUsage({ grantId: g.id, organizationId: ORG_A }))
      .rejects.toThrow(/canceled/);
  });

  it("refuses usage against an unknown grant", async () => {
    await expect(LicensingService.recordUsage({ grantId: "nope", organizationId: ORG_A }))
      .rejects.toThrow(/grant not found/);
  });

  it("records no royalty entry for a refused charge", async () => {
    const a = await asset();
    const g = await grantOn(a, ORG_A, new Date(Date.now() - 86400_000).toISOString());
    await LicensingService.recordUsage({ grantId: g.id, organizationId: ORG_A }).catch(() => {});
    expect(await LicensingService.listRoyalties(ORG_A)).toEqual([]);
  });
});

describe("grants expire", () => {
  it("reports an expired grant as expired on read", async () => {
    const a = await asset();
    await grantOn(a, ORG_A, new Date(Date.now() - 1000).toISOString());
    const [g] = await LicensingService.listGrants(ORG_A);
    expect(g.status).toBe("expired");
  });

  it("stops counting an expired grant as an active licence", async () => {
    const a = await asset();
    await grantOn(a, ORG_A, new Date(Date.now() - 1000).toISOString());
    const d = await LicensingService.dashboard(ORG_A);
    expect(d.activeLicenses).toBe(0);
  });

  it("keeps a future-dated grant active", async () => {
    const a = await asset();
    await grantOn(a, ORG_A, new Date(Date.now() + 86400_000).toISOString());
    const d = await LicensingService.dashboard(ORG_A);
    expect(d.activeLicenses).toBe(1);
  });
});

describe("payouts can be settled", () => {
  it("reports an unpaid payout as pending", async () => {
    const a = await asset(); const g = await grantOn(a);
    await LicensingService.recordUsage({ grantId: g.id, usageCents: 1000, organizationId: ORG_A });
    const d = await LicensingService.dashboard(ORG_A);
    expect(d.payoutsPendingCents).toBe(800);
    expect(d.payoutsPaidCents).toBe(0);
  });

  it("moves a settled payout from pending to paid", async () => {
    const a = await asset(); const g = await grantOn(a);
    await LicensingService.recordUsage({ grantId: g.id, usageCents: 1000, organizationId: ORG_A });
    const r = await LicensingService.settlePayouts({ organizationId: ORG_A });
    expect(r.settled).toBe(1);
    expect(r.centsSettled).toBe(800);
    const d = await LicensingService.dashboard(ORG_A);
    expect(d.payoutsPendingCents).toBe(0);
    expect(d.payoutsPaidCents).toBe(800);
  });

  it("stamps paidAt and never settles the same entry twice", async () => {
    const a = await asset(); const g = await grantOn(a);
    await LicensingService.recordUsage({ grantId: g.id, usageCents: 100, organizationId: ORG_A });
    await LicensingService.settlePayouts({ organizationId: ORG_A });
    const again = await LicensingService.settlePayouts({ organizationId: ORG_A });
    expect(again.settled).toBe(0);
    const [entry] = await LicensingService.listRoyalties(ORG_A);
    expect(entry.paid).toBe(true);
    expect(entry.paidAt).toBeTruthy();
  });

  it("never claims money moved", async () => {
    const a = await asset(); const g = await grantOn(a);
    await LicensingService.recordUsage({ grantId: g.id, organizationId: ORG_A });
    const r = await LicensingService.settlePayouts({ organizationId: ORG_A });
    expect(r.moneyMoved).toBe(false);
    const d = await LicensingService.dashboard(ORG_A);
    expect(d.payoutsSettleable).toBe(false);
  });
});

describe("the royalty ledger is readable", () => {
  it("returns an entry for each usage event", async () => {
    const a = await asset(); const g = await grantOn(a);
    await LicensingService.recordUsage({ grantId: g.id, usageCents: 10, organizationId: ORG_A });
    await LicensingService.recordUsage({ grantId: g.id, usageCents: 20, organizationId: ORG_A });
    const rows = await LicensingService.listRoyalties(ORG_A);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.grantId === g.id && r.assetId === a.id)).toBe(true);
  });
});

describe("tenant isolation", () => {
  it("does not leak assets across organizations", async () => {
    await asset(ORG_A);
    expect(await LicensingService.listAssets(ORG_B)).toEqual([]);
  });

  it("does not credit another tenant's revenue", async () => {
    // The defect this replaces: every route defaulted to org-windels, so a
    // tenant's metered usage incremented a different tenant's balance.
    const a = await asset(ORG_A); const g = await grantOn(a, ORG_A);
    await LicensingService.recordUsage({ grantId: g.id, usageCents: 5000, organizationId: ORG_A });
    const b = await LicensingService.dashboard(ORG_B);
    expect(b.revenueCents30d).toBe(0);
    expect(b.payoutsPendingCents).toBe(0);
  });

  it("keeps royalty ledgers separate", async () => {
    const a = await asset(ORG_A); const g = await grantOn(a, ORG_A);
    await LicensingService.recordUsage({ grantId: g.id, organizationId: ORG_A });
    expect(await LicensingService.listRoyalties(ORG_B)).toEqual([]);
  });

  it("cannot grant against another tenant's asset", async () => {
    const a = await asset(ORG_A);
    await expect(LicensingService.grant({ assetId: a.id, licenseeOrgId: "x", organizationId: ORG_B }))
      .rejects.toThrow(/asset not found/);
  });

  it("settling in one org leaves another org's balance untouched", async () => {
    const a = await asset(ORG_A); const g = await grantOn(a, ORG_A);
    await LicensingService.recordUsage({ grantId: g.id, usageCents: 1000, organizationId: ORG_A });
    await LicensingService.settlePayouts({ organizationId: ORG_B });
    const d = await LicensingService.dashboard(ORG_A);
    expect(d.payoutsPendingCents).toBe(800);
  });
});

describe("seeding is opt-in", () => {
  it("registers no assets by default", async () => {
    await LicensingService.ensureBootstrapped(undefined, ORG_A, "u1");
    expect(await LicensingService.listAssets(ORG_A)).toEqual([]);
  });

  it("labels seeded assets as demo, not operator-registered", async () => {
    demo.enabled = true;
    await LicensingService.ensureBootstrapped(undefined, ORG_A, "u1");
    const rows = await LicensingService.listAssets(ORG_A);
    expect(rows.length).toBe(4);
    expect(rows.every((r) => r.source === "demo_seed")).toBe(true);
  });

  it("marks an operator-registered asset as such", async () => {
    const a = await asset(ORG_A);
    expect(a.source).toBe("operator_registered");
  });

  it("seeds no revenue", async () => {
    demo.enabled = true;
    await LicensingService.ensureBootstrapped(undefined, ORG_A, "u1");
    const d = await LicensingService.dashboard(ORG_A);
    expect(d.revenueCents30d).toBe(0);
    expect(d.revenueCentsAllTime).toBe(0);
    expect(d.payoutsPendingCents).toBe(0);
  });
});
