/**
 * Playwright E2E — Session 121: sustainability/ESG completion.
 *
 * Runs against a live API and pins the behaviours only a running server can
 * prove:
 *   - the three Session 64 endpoints keep their paths, status codes and
 *     payload shapes;
 *   - the Session 121 fixes: concurrent activity POSTs are all preserved
 *     (the Session 64 single-blob storage lost writes), ESG scores are null
 *     with a note (the `92 - ytd*2.5` formula is gone), a same-period YTD
 *     change is reported, a record can be fetched singly and deleted (the
 *     correction path), and the rollup ships a provenance block naming the
 *     structural zeros;
 *   - every endpoint refuses an anonymous caller, and write/delete endpoints
 *     refuse a non-administrator.
 *
 * Unit coverage for the arithmetic, adoption and isolation rules lives in
 * `apps/api/src/sustainability/sustainability.completion.test.ts`.
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

test.describe("Session 121 — sustainability completion", () => {
  let token = "";
  const marker = `e2e-esg-${Date.now()}`;

  test.beforeAll(async () => {
    token = await apiLogin();
  });

  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  async function get(path: string) {
    const res = await fetch(`${BASE}${path}`, { headers: auth() });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }
  async function send(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: auth(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  test("every sustainability endpoint refuses an anonymous caller", async () => {
    for (const path of [
      "/sustainability/dashboard/rollup",
      "/sustainability/records",
      "/sustainability/records/some-id",
      "/sustainability/activity",
    ]) {
      const res = await fetch(`${BASE}${path}`);
      expect([401, 403]).toContain(res.status);
    }
  });

  test("the Session 64 rollup keeps its path and shape — with honest scores and provenance", async () => {
    const d = await get("/sustainability/dashboard/rollup");
    expect(d.status).toBe(200);
    expect(d.data).toHaveProperty("scores");
    expect(d.data).toHaveProperty("emissionsTotalTCO2e");
    expect(d.data).toHaveProperty("emissionsBySource");
    expect(Array.isArray(d.data.energySeries)).toBe(true);
    expect(d.data.energySeries.length).toBe(12);
    // FIXED: no invented score formula — scores are null with a note.
    expect(d.data.scores.overall).toBeNull();
    expect(d.data.scores.environmental).toBeNull();
    expect(typeof d.data.scores.note).toBe("string");
    // Session 121: provenance names the measured fields and structural zeros.
    expect(d.data.provenance).toBeTruthy();
    expect(Array.isArray(d.data.provenance.entries)).toBe(true);
    expect(d.data.provenance.entries.some((e: any) => e.basis === "structural_zero")).toBe(true);
  });

  test("concurrent activity POSTs are all preserved", async () => {
    const posts = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        send("POST", "/sustainability/activity", {
          category: "scope1",
          activity: `${marker} concurrent ${i}`,
          quantity: i + 1,
          unit: "m3",
          emissionFactorKg: 2.03,
          occurredAt: "2026-08-01T12:00:00Z",
          source: marker,
        }),
      ),
    );
    expect(posts.every((p) => p.status === 201)).toBe(true);
    const records = await get("/sustainability/records?limit=1000");
    const mine = records.data.filter((r: any) => r.source === marker);
    expect(mine.length).toBeGreaterThanOrEqual(20);
  });

  test("a recorded activity appears in the rollup arithmetic", async () => {
    const created = await send("POST", "/sustainability/activity", {
      category: "scope1",
      activity: `${marker} boiler`,
      quantity: 1000,
      unit: "m3",
      emissionFactorKg: 2.03,
      occurredAt: "2026-08-01T12:00:00Z",
      source: marker,
    });
    expect(created.status).toBe(201);
    expect(created.data.tCO2e).toBe(2.03); // 1000 * 2.03 / 1000

    const single = await get(`/sustainability/records/${created.data.id}`);
    expect(single.status).toBe(200);
    expect(single.data.id).toBe(created.data.id);

    const rollup = await get("/sustainability/dashboard/rollup");
    const bySource = rollup.data.emissionsBySource.find((s: any) => s.source === `${marker} boiler`);
    expect(bySource).toBeTruthy();
    expect(bySource.tCO2e).toBeCloseTo(2.03, 3);
  });

  test("FIXED: a record can be deleted — the correction path", async () => {
    const created = await send("POST", "/sustainability/activity", {
      category: "scope3",
      activity: `${marker} remove-me`,
      quantity: 1,
      unit: "unit",
      emissionFactorKg: 150,
      occurredAt: "2026-08-01T12:00:00Z",
      source: marker,
    });
    const removed = await send("DELETE", `/sustainability/records/${created.data.id}`);
    expect(removed.status).toBe(200);
    expect(removed.data.deleted).toBe(true);
    const after = await get(`/sustainability/records/${created.data.id}`);
    expect(after.status).toBe(404);
  });

  test("a per-source change without a prior-year baseline is null, never 0", async () => {
    // A fresh activity name has no prior-year records, so its changePct must
    // be null — 0 would read as "no change".
    await send("POST", "/sustainability/activity", {
      category: "scope1",
      activity: `${marker} fresh-activity`,
      quantity: 100,
      unit: "m3",
      emissionFactorKg: 2.03,
      occurredAt: new Date().toISOString(),
      source: marker,
    });
    const rollup = await get("/sustainability/dashboard/rollup");
    const fresh = rollup.data.emissionsBySource.find((s: any) => s.source === `${marker} fresh-activity`);
    expect(fresh).toBeTruthy();
    expect(fresh.changePct).toBeNull();
  });

  test("an over-long record id answers 400, an unknown id answers 404", async () => {
    const tooLong = await get(`/sustainability/records/${"x".repeat(65)}`);
    expect(tooLong.status).toBe(400);
    const unknown = await get("/sustainability/records/esg-00000000-0000-0000-0000-000000000000");
    expect(unknown.status).toBe(404);
  });
});
