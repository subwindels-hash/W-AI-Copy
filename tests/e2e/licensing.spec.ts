/**
 * Playwright E2E — Session 164: Licensing & Monetization completion.
 *
 * The critical case is financial cross-tenant contamination. Before S164 all
 * six routes called the service with no organization, so everything defaulted
 * to org-windels: a second tenant's metered usage incremented the primary
 * organization's revenue and pending-payout balance, and an asset a tenant
 * registered was filed under — and owned by — org-windels.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function login(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json().catch(() => ({}));
  return j?.data?.token ?? null;
}

async function apiLogin(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const t = await login("admin@windels.ai", "W1ndels!Admin#2026");
    if (t) return t;
    await new Promise((r) => setTimeout(r, 1200));
  }
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@windels.ai", password: "W1ndels!Admin#2026",
      displayName: "Super Admin", organizationName: "WINDELS",
    }),
  });
  return (await login("admin@windels.ai", "W1ndels!Admin#2026"))!;
}

/** A throwaway second tenant, used to prove isolation. */
async function secondOrgToken(): Promise<string | null> {
  const email = `lic-tenant-${Date.now()}@example.test`;
  const password = "W1ndels!Tenant#2026";
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email, password, displayName: "Tenant B", organizationName: `Tenant-B-${Date.now()}`,
    }),
  });
  return login(email, password);
}

test.describe("Session 164 — Licensing completion", () => {
  let token = "";
  test.beforeAll(async () => { token = await apiLogin(); });
  const auth = (t = token) => ({ "Content-Type": "application/json", Authorization: `Bearer ${t}` });

  async function get(path: string, t = token) {
    const res = await fetch(`${BASE}${path}`, { headers: auth(t) });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }
  async function send(method: string, path: string, body?: unknown, t = token) {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: auth(t),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  /** Register an asset and grant against it, for the given tenant. */
  async function assetAndGrant(t: string, over: Record<string, unknown> = {}) {
    const a = await send("POST", "/licensing/assets", {
      type: "ai_skill", externalAssetId: `skill:e2e-${Date.now()}`,
      name: `E2E Skill ${Date.now()}`, billingModel: "usage",
      priceCents: 100, currency: "USD", ...over,
    }, t);
    const g = await send("POST", "/licensing/grants", {
      assetId: a.data.id, licenseeOrgId: "lessee-e2e",
    }, t);
    return { asset: a.data, grant: g.data };
  }

  test("the dashboard declares that no money moves", async () => {
    const res = await get("/licensing/dashboard/rollup");
    expect(res.status).toBe(200);
    expect(res.data.payoutsSettleable).toBe(false);
  });

  test("a fresh organization has no assets and no revenue", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const a = await get("/licensing/assets", t2!);
    expect(a.data).toEqual([]);
    const d = await get("/licensing/dashboard/rollup", t2!);
    expect(d.data.revenueCents30d).toBe(0);
    expect(d.data.payoutsPendingCents).toBe(0);
  });

  test("metered usage credits only the caller's organization", async () => {
    const before = await get("/licensing/dashboard/rollup");
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");

    const { grant } = await assetAndGrant(t2!);
    const u = await send("POST", "/licensing/usage", { grantId: grant.id, usageCents: 5000 }, t2!);
    expect(u.status).toBe(200);

    // Tenant B is credited…
    const bDash = await get("/licensing/dashboard/rollup", t2!);
    expect(bDash.data.revenueCents30d).toBe(5000);

    // …and the primary organization is untouched. Pre-S164 it was credited.
    const after = await get("/licensing/dashboard/rollup");
    expect(after.data.revenueCents30d).toBe(before.data.revenueCents30d);
    expect(after.data.payoutsPendingCents).toBe(before.data.payoutsPendingCents);
  });

  test("an asset registered by one tenant is invisible to another", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const { asset } = await assetAndGrant(t2!);

    const mine = await get("/licensing/assets", t2!);
    expect(mine.data.some((a: any) => a.id === asset.id)).toBe(true);

    const theirs = await get("/licensing/assets");
    expect(theirs.data.some((a: any) => a.id === asset.id)).toBe(false);
  });

  test("the fee split is declared on every royalty entry", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const { grant } = await assetAndGrant(t2!);
    const u = await send("POST", "/licensing/usage", { grantId: grant.id, usageCents: 1000 }, t2!);
    expect(u.data.platformFeePct).toBe(20);
    expect(u.data.platformFeeCents).toBe(200);
    // No revenue share declared on the asset => 0, not an invented 10%.
    expect(u.data.revenueSharePct).toBe(0);
    expect(u.data.ownerPayoutCents).toBe(800);
  });

  test("the royalty ledger is retrievable", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const { grant } = await assetAndGrant(t2!);
    await send("POST", "/licensing/usage", { grantId: grant.id, usageCents: 250 }, t2!);
    const r = await get("/licensing/royalties", t2!);
    expect(r.status).toBe(200);
    expect(r.data.length).toBe(1);
    expect(r.data[0].grantId).toBe(grant.id);
  });

  test("a payout can be settled and stops being pending", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const { grant } = await assetAndGrant(t2!);
    await send("POST", "/licensing/usage", { grantId: grant.id, usageCents: 1000 }, t2!);

    const pendingBefore = (await get("/licensing/dashboard/rollup", t2!)).data.payoutsPendingCents;
    expect(pendingBefore).toBe(800);

    const s = await send("POST", "/licensing/payouts/settle", {}, t2!);
    expect(s.data.settled).toBe(1);
    expect(s.data.moneyMoved).toBe(false);

    const after = await get("/licensing/dashboard/rollup", t2!);
    expect(after.data.payoutsPendingCents).toBe(0);
    expect(after.data.payoutsPaidCents).toBe(800);
  });

  test("an expired grant is not active and cannot be billed", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const a = await send("POST", "/licensing/assets", {
      type: "plugin", externalAssetId: `plugin:exp-${Date.now()}`,
      name: "Expiring", billingModel: "usage", priceCents: 10, currency: "USD",
    }, t2!);
    const g = await send("POST", "/licensing/grants", {
      assetId: a.data.id, licenseeOrgId: "lessee",
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    }, t2!);

    const grants = await get("/licensing/grants", t2!);
    expect(grants.data.find((x: any) => x.id === g.data.id).status).toBe("expired");

    const u = await send("POST", "/licensing/usage", { grantId: g.data.id, usageCents: 100 }, t2!);
    expect(u.status).toBeGreaterThanOrEqual(400);

    const d = await get("/licensing/dashboard/rollup", t2!);
    expect(d.data.activeLicenses).toBe(0);
  });

  test("a cancelled grant cannot be billed", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const { grant } = await assetAndGrant(t2!);
    await send("POST", "/licensing/grants/cancel", { grantId: grant.id }, t2!);
    const u = await send("POST", "/licensing/usage", { grantId: grant.id, usageCents: 100 }, t2!);
    expect(u.status).toBeGreaterThanOrEqual(400);
  });

  test("usage against an unknown grant is refused", async () => {
    const res = await send("POST", "/licensing/usage", { grantId: "lg-nope", usageCents: 100 });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
