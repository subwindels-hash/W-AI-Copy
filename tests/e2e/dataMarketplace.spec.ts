/**
 * Playwright E2E — Session 168: dataMarketplace completion.
 *
 * The headline case is the rating average. Before S168 `review()` divided by
 * the INSTALL count, so an asset with many installs could not be moved off
 * ~0 stars by genuine five-star reviews. Reviews were also never persisted:
 * the comment was validated and discarded.
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

async function secondOrgToken(): Promise<string | null> {
  const email = `dmp-tenant-${Date.now()}@example.test`;
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

test.describe("Session 168 — Data Marketplace completion", () => {
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

  const publish = (t = token) => send("POST", "/data-marketplace/assets", {
    name: `E2E Asset ${Date.now()}`, kind: "dataset",
    description: "an end-to-end test asset", licenseModel: "one_time", priceUsd: 100,
  }, t);

  test("a newly published asset has no rating and no quality score", async () => {
    const res = await publish();
    expect(res.status).toBe(200);
    // rating 0 read as a zero-star review; qualityScore was a hard-coded 0.75.
    expect(res.data.rating).toBeNull();
    expect(res.data.qualityScore).toBeNull();
    expect(res.data.reviewCount).toBe(0);
  });

  test("five-star reviews on a much-installed asset produce a five-star rating", async () => {
    const asset = (await publish()).data;
    for (let i = 0; i < 10; i++) {
      await send("POST", `/data-marketplace/assets/${asset.id}/install`);
    }
    await send("POST", `/data-marketplace/assets/${asset.id}/review`, { rating: 5, comment: "excellent" });

    const after = await get(`/data-marketplace/assets/${asset.id}`);
    // Before S168: (0 * installs + 5) / (installs + 1) — roughly 0.45 here.
    expect(after.data.rating).toBe(5);
    expect(after.data.reviewCount).toBe(1);
  });

  test("the review comment is persisted, not discarded", async () => {
    const asset = (await publish()).data;
    await send("POST", `/data-marketplace/assets/${asset.id}/review`, {
      rating: 4, comment: "genuinely useful dataset",
    });
    const reviews = await get(`/data-marketplace/assets/${asset.id}/reviews`);
    expect(reviews.status).toBe(200);
    expect(reviews.data).toHaveLength(1);
    expect(reviews.data[0].comment).toBe("genuinely useful dataset");
  });

  test("a second review by the same user replaces rather than stacks", async () => {
    const asset = (await publish()).data;
    await send("POST", `/data-marketplace/assets/${asset.id}/review`, { rating: 1 });
    const after = await send("POST", `/data-marketplace/assets/${asset.id}/review`, { rating: 5 });
    expect(after.data.reviewCount).toBe(1);
    expect(after.data.rating).toBe(5);
  });

  test("the dashboard ships provenance", async () => {
    const d = await get("/data-marketplace/dashboard/rollup");
    expect(d.status).toBe(200);
    expect(d.data.provenance).toBeTruthy();
    expect(Array.isArray(d.data.provenance.entries)).toBe(true);
  });

  test("a second organization sees none of the first org's assets", async () => {
    const asset = (await publish()).data;
    const t2 = await secondOrgToken();
    test.skip(!t2, "second org registration unavailable");

    const theirs = await get("/data-marketplace/assets", t2!);
    expect(theirs.status).toBe(200);
    expect((theirs.data ?? []).map((a: any) => a.id)).not.toContain(asset.id);

    const direct = await get(`/data-marketplace/assets/${asset.id}`, t2!);
    expect(direct.status).toBe(404);

    const dash = await get("/data-marketplace/dashboard/rollup", t2!);
    expect(dash.data.totalAssets).toBe(0);
    expect(dash.data.revenue30dUsd).toBe(0);
  });
});
