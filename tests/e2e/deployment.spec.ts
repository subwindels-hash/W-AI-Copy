/**
 * Playwright E2E — Session 165: Deployment completion.
 *
 * Two things are proved here that could not be proved before S165:
 *
 *  1. The core-integration health report no longer seeds its own evidence.
 *     Its `deployments` probe used to call `ensureBootstrapped()` and then
 *     count the three targets the seeder had just written, so the checkpoint
 *     said `wired` on an installation where nobody had deployed anything.
 *
 *  2. Deployment targets are tenant-scoped. All six routes previously operated
 *     on org-windels, which made `DELETE /targets/:id` a cross-tenant
 *     destructive operation.
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
  const email = `dep-tenant-${Date.now()}@example.test`;
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

test.describe("Session 165 — Deployment completion", () => {
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

  async function newTarget(t: string, name = `e2e-${Date.now()}`) {
    const res = await send("POST", "/deployment/targets", {
      name, environment: "docker", modules: [],
    }, t);
    return res.data;
  }

  test("a fresh organization has no declared production environments", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const res = await get("/deployment/targets", t2!);
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);
  });

  test("health score is null until something has been validated", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    await newTarget(t2!);
    const d = await get("/deployment/dashboard/rollup", t2!);
    // Previously an unvalidated target scored 50 and the average rendered as a
    // real health figure.
    expect(d.data.avgHealthScore).toBeNull();
    expect(d.data.validatedTargets).toBe(0);
  });

  test("a target is not born healthy", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const t = await newTarget(t2!);
    expect(t.validationPassed).toBe(false);
    expect(t.status).not.toBe("healthy");
    expect(t.source).toBe("operator_registered");
  });

  test("validation labels local-host checks and does not claim target health", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const t = await newTarget(t2!);
    const v = await send("POST", `/deployment/targets/${t.id}/validate`, undefined, t2!);
    expect(v.status).toBe(200);

    const redisCheck = v.data.checks.find((c: any) => c.category === "redis");
    expect(redisCheck.scope).toBe("local_host");
    const conn = v.data.checks.find((c: any) => c.category === "connectivity");
    expect(conn.scope).toBe("target");
    expect(conn.skipped).toBe(true);
    expect(v.data.targetScopedChecks).toBe(0);

    const list = await get("/deployment/targets", t2!);
    const after = list.data.find((x: any) => x.id === t.id);
    expect(after.status).not.toBe("healthy");
  });

  test("version is unknown until an environment reports one", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const t = await newTarget(t2!);

    let d = await get("/deployment/dashboard/rollup", t2!);
    expect(d.data.unknownVersionTargets).toBe(1);
    expect(d.data.outdatedTargets).toBe(0);

    await send("POST", `/deployment/targets/${t.id}/report`, { version: "0.1.0" }, t2!);
    d = await get("/deployment/dashboard/rollup", t2!);
    expect(d.data.outdatedTargets).toBe(1);
    expect(d.data.unknownVersionTargets).toBe(0);
  });

  test("de-registering reports that no infrastructure was modified", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const t = await newTarget(t2!);
    const res = await send("DELETE", `/deployment/targets/${t.id}`, undefined, t2!);
    expect(res.status).toBe(200);
    expect(res.data.infrastructureModified).toBe(false);
    expect(res.data.deregistered).toBe(true);
  });

  test("one tenant's targets are invisible to another", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const name = `isolation-${Date.now()}`;
    const t = await newTarget(t2!, name);

    const mine = await get("/deployment/targets", t2!);
    expect(mine.data.some((x: any) => x.id === t.id)).toBe(true);

    const theirs = await get("/deployment/targets");
    expect(theirs.data.some((x: any) => x.id === t.id)).toBe(false);
  });

  test("one tenant cannot de-register another tenant's target", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const t = await newTarget(t2!);

    // The primary org attempts the delete. Pre-S165 both hit org-windels.
    await send("DELETE", `/deployment/targets/${t.id}`);

    const mine = await get("/deployment/targets", t2!);
    expect(mine.data.some((x: any) => x.id === t.id)).toBe(true);
  });

  test("the integration checkpoint does not create deployment targets", async () => {
    // Read the checkpoint, then confirm the platform org gained nothing from it.
    const before = await get("/deployment/targets");
    await get("/core-integration/checkpoint").catch(() => ({}));
    const after = await get("/deployment/targets");
    expect(after.data.length).toBe(before.data.length);
  });

  test("registration alone does not report the deployments link as wired", async () => {
    const res = await get("/core-integration/checkpoint");
    test.skip(res.status !== 200, "core-integration checkpoint route unavailable");
    const dep = (res.data.links || []).find((l: any) => l.id === "deployments");
    test.skip(!dep, "deployments link not present");
    if (dep.status === "wired") {
      // Only acceptable when something has genuinely passed validation.
      expect(dep.evidence).toMatch(/[1-9]\d* validated/);
    } else {
      expect(["stub", "missing"]).toContain(dep.status);
    }
  });
});
