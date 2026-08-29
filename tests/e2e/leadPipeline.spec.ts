/**
 * Playwright E2E — Session 115: Lead Discovery pipeline.
 *
 * Runs against a live API and pins the behaviours only a running server can
 * prove:
 *   - Session 85's six endpoints keep their paths and their behaviour after the
 *     Session 115 router was mounted ahead of them on the same prefix;
 *   - every pipeline endpoint refuses an anonymous caller;
 *   - the summary and coverage reports answer honestly for an organization with
 *     nothing stored — nulls and explained zeroes, never invented figures;
 *   - a bad lead id is rejected by the shared schema rather than reaching the
 *     store;
 *   - the export preview refuses an empty selection and reports unresolved ids.
 *
 * Nothing here performs a real Google Places search — that needs a paid key and
 * a network call — so no assertion pretends to have discovered anything. The
 * discovery path is covered by the Session 85 unit suite, and the pipeline
 * behaviour over real leads by the Session 115 unit suite, which seeds through
 * the real discovery service.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function apiLogin(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.data?.token) return j.data.token;
      await new Promise((r) => setTimeout(r, 1200));
    } catch {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@windels.ai", password: "W1ndels!Admin#2026",
      displayName: "Super Admin", organizationName: "WINDELS",
    }),
  });
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
  });
  const j = await res.json();
  return j.data.token;
}

test.describe("Session 115 — lead pipeline API", () => {
  let token: string;
  let createdCollectionId: string | null = null;

  test.beforeAll(async () => { token = await apiLogin(); });

  test.afterAll(async () => {
    // Leave nothing behind: the collection this suite created is removed.
    if (createdCollectionId) {
      await fetch(`${BASE}/lead-discovery/collections/${createdCollectionId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  });

  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  const get = (path: string) => fetch(`${BASE}${path}`, { headers: auth() }).then((r) => r.json());
  const post = (path: string, body?: any) =>
    fetch(`${BASE}${path}`, { method: "POST", headers: auth(), body: JSON.stringify(body ?? {}) })
      .then((r) => r.json());

  test("Session 85's endpoints keep their paths behind the new router", async () => {
    const leads = await get("/lead-discovery/leads");
    expect(leads.ok).toBe(true);
    expect(Array.isArray(leads.data)).toBe(true);

    const collections = await get("/lead-discovery/collections");
    expect(collections.ok).toBe(true);
    expect(Array.isArray(collections.data)).toBe(true);
  });

  test("every pipeline endpoint refuses an anonymous caller", async () => {
    const paths = [
      "/lead-discovery/summary",
      "/lead-discovery/pipeline",
      "/lead-discovery/duplicates",
      "/lead-discovery/coverage",
      "/lead-discovery/history",
    ];
    for (const path of paths) {
      const res = await fetch(`${BASE}${path}`);
      expect(res.status, `${path} must not be public`).toBe(401);
    }
  });

  test("the summary reports nulls rather than invented activity", async () => {
    const body = await get("/lead-discovery/summary");
    expect(body.ok).toBe(true);
    const data = body.data;

    expect(typeof data.totalLeads).toBe("number");
    expect(typeof data.distinctListings).toBe("number");
    // Never more businesses than records.
    expect(data.distinctListings).toBeLessThanOrEqual(data.totalLeads);
    expect(typeof data.searchConfigured).toBe("boolean");
    if (data.searchesRecorded === 0) {
      expect(data.lastSearchAt).toBeNull();
      expect(data.lastSearchQuery).toBeNull();
    }
    expect(data.providerNote).toMatch(/Google Places/i);
    expect(data.historyNote).toBeTruthy();
  });

  test("coverage explains the empty contact columns instead of implying a finding", async () => {
    const body = await get("/lead-discovery/coverage");
    expect(body.ok).toBe(true);

    const phone = body.data.fields.find((f: any) => f.field === "phone");
    expect(phone.suppliedByProvider).toBe(false);
    expect(phone.detail).toMatch(/does not return phone numbers/i);

    if (body.data.totalLeads === 0) {
      // Nothing to measure is reported as nothing, not as 0%.
      for (const field of body.data.fields) expect(field.percentPresent).toBeNull();
    }
    expect(body.data.coverageNote).toMatch(/does not return phone numbers/i);
  });

  test("the duplicate report is read-only and carries its own caveat", async () => {
    const before = await get("/lead-discovery/duplicates");
    expect(before.ok).toBe(true);
    expect(before.data.dedupeNote).toMatch(/nothing is deleted/i);

    const after = await get("/lead-discovery/duplicates");
    expect(after.data.scanned).toBe(before.data.scanned);
    expect(after.data.affectedLeads).toBe(before.data.affectedLeads);
  });

  test("the pipeline list reports every status key and a stable total", async () => {
    const body = await get("/lead-discovery/pipeline?limit=5");
    expect(body.ok).toBe(true);
    for (const key of ["new", "contacted", "qualified", "disqualified", "duplicate"]) {
      expect(typeof body.data.statusCounts[key]).toBe("number");
    }
    expect(body.data.returned).toBeLessThanOrEqual(5);
    expect(body.data.returned).toBeLessThanOrEqual(body.data.total);
    expect(body.data.statusNote).toMatch(/not what was verified/i);
  });

  test("a malformed lead id is rejected by the contract, not by the store", async () => {
    const res = await fetch(`${BASE}/lead-discovery/leads/not-a-lead-id`, { headers: auth() });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("an unknown but well-formed lead id is a 404", async () => {
    const res = await fetch(
      `${BASE}/lead-discovery/leads/lead-00000000-0000-4000-8000-000000000000`,
      { headers: auth() },
    );
    expect(res.status).toBe(404);
  });

  test("the export preview refuses an empty selection and names unresolved ids", async () => {
    const empty = await fetch(`${BASE}/lead-discovery/export/preview`, {
      method: "POST", headers: auth(), body: JSON.stringify({ leadIds: [] }),
    });
    expect(empty.status).toBeGreaterThanOrEqual(400);
    expect(empty.status).toBeLessThan(500);

    const preview = await post("/lead-discovery/export/preview", {
      leadIds: ["lead-00000000-0000-4000-8000-000000000000"],
    });
    expect(preview.ok).toBe(true);
    expect(preview.data.resolved).toBe(0);
    expect(preview.data.missingIds).toHaveLength(1);
    // Nothing resolved, so no column may be called "always empty".
    for (const column of preview.data.columns) expect(column.alwaysEmpty).toBe(false);
    expect(preview.data.csvInjectionNote).toMatch(/apostrophe/i);
  });

  test("a collection can be created, renamed and deleted without touching leads", async () => {
    const created = await post("/lead-discovery/collections", { name: "S115 e2e" });
    expect(created.ok).toBe(true);
    createdCollectionId = created.data.id;

    const renamed = await fetch(`${BASE}/lead-discovery/collections/${createdCollectionId}`, {
      method: "PATCH", headers: auth(), body: JSON.stringify({ name: "S115 e2e renamed" }),
    }).then((r) => r.json());
    expect(renamed.data.name).toBe("S115 e2e renamed");

    const leadsBefore = (await get("/lead-discovery/leads")).data.length;

    const deleted = await fetch(`${BASE}/lead-discovery/collections/${createdCollectionId}`, {
      method: "DELETE", headers: auth(),
    }).then((r) => r.json());
    expect(deleted.data.deleted).toBe(true);
    createdCollectionId = null;

    // Deleting a grouping is not a reason to lose the records it grouped.
    expect((await get("/lead-discovery/leads")).data.length).toBe(leadsBefore);
    const remaining = (await get("/lead-discovery/collections")).data;
    expect(remaining.some((c: any) => c.name === "S115 e2e renamed")).toBe(false);
  });

  test("the search log describes only what it recorded", async () => {
    const body = await get("/lead-discovery/history?limit=5");
    expect(body.ok).toBe(true);
    expect(body.data.retentionLimit).toBeGreaterThan(0);
    expect(body.data.returned).toBeLessThanOrEqual(5);
    expect(body.data.historyNote).toMatch(/not reconstructed/i);
    if (body.data.stored === 0) expect(body.data.oldestAt).toBeNull();
  });
});
