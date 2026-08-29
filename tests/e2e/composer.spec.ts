/**
 * Playwright E2E — Session 166: Composer completion.
 *
 * What is proved here that could not be proved before S166:
 *
 *  1. Workflows are tenant-private. Ten of the fourteen routes called the
 *     service with no organization, so every tenant read and — because
 *     `POST /workflows` accepts a caller-supplied id — OVERWROTE org-windels'
 *     workflow definitions.
 *  2. A fresh organization reports no success rate rather than 100%.
 *  3. A queued run stays queued. Nothing in this platform executes composer
 *     workflows, so a rising run count must not imply work was performed.
 *  4. Only a deployed workflow can be run, enforced at the endpoint and not
 *     merely by a disabled button.
 *  5. "Recent runs" returns the newest runs.
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
  const email = `cmp-tenant-${Date.now()}@example.test`;
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

const NODES = [
  { id: "n1", kind: "trigger", label: "Start", x: 0, y: 0, config: {} },
  { id: "n2", kind: "capability", type: "ocr", label: "OCR", x: 50, y: 0, config: {} },
  { id: "n3", kind: "output", label: "Done", x: 100, y: 0, config: {} },
];
const EDGES = [
  { id: "e1", source: "n1", target: "n2" },
  { id: "e2", source: "n2", target: "n3" },
];

function auth(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function createWorkflow(token: string, name: string, id?: string) {
  const res = await fetch(`${BASE}/composer/workflows`, {
    method: "POST", headers: auth(token),
    body: JSON.stringify({ ...(id ? { id } : {}), name, description: "", nodes: NODES, edges: EDGES }),
  });
  return (await res.json())?.data;
}

async function deployWorkflow(token: string, id: string) {
  const res = await fetch(`${BASE}/composer/workflows/${id}/deploy`, {
    method: "POST", headers: auth(token),
  });
  return (await res.json())?.data;
}

test.describe("Session 166 — Composer completion", () => {
  let token = "";
  test.beforeAll(async () => { token = await apiLogin(); });

  test("a fresh organization reports no success rate, not 100%", async () => {
    const b = await secondOrgToken();
    test.skip(!b, "second org registration unavailable");

    const res = await fetch(`${BASE}/composer/dashboard/rollup`, { headers: auth(b!) });
    const d = (await res.json())?.data;

    // THE REGRESSION: `totalRuns ? succ/totalRuns : 1` reported a perfect record.
    expect(d.successRate).toBeNull();
    expect(d.successRate).not.toBe(1);
    expect(d.totalWorkflows).toBe(0);
  });

  test("a fresh organization has no seeded example workflow", async () => {
    const b = await secondOrgToken();
    test.skip(!b, "second org registration unavailable");

    const res = await fetch(`${BASE}/composer/workflows`, { headers: auth(b!) });
    const list = (await res.json())?.data ?? [];
    // Unless WINDELS_DEMO_DATA=true, nothing is seeded.
    if (process.env.WINDELS_DEMO_DATA !== "true") expect(list).toHaveLength(0);
  });

  test("one tenant cannot see another tenant's workflows", async () => {
    const b = await secondOrgToken();
    test.skip(!b, "second org registration unavailable");

    const mine = await createWorkflow(b!, "Tenant B private");
    expect(mine?.id).toBeTruthy();

    const res = await fetch(`${BASE}/composer/workflows`, { headers: auth(token) });
    const adminList = (await res.json())?.data ?? [];
    expect(adminList.find((w: any) => w.id === mine.id)).toBeFalsy();
  });

  test("one tenant cannot overwrite another tenant's workflow by reusing its id", async () => {
    const b = await secondOrgToken();
    test.skip(!b, "second org registration unavailable");

    const victim = await createWorkflow(token, "Admin original");
    expect(victim?.id).toBeTruthy();

    // THE REGRESSION: upsert took the id from the body and no org, so this
    // wrote straight over the admin organization's definition.
    await createWorkflow(b!, "hijacked", victim.id);

    const res = await fetch(`${BASE}/composer/workflows/${victim.id}`, { headers: auth(token) });
    const after = (await res.json())?.data;
    expect(after.name).toBe("Admin original");
  });

  test("a triggered run stays queued — nothing executes it", async () => {
    const wf = await createWorkflow(token, `Queued check ${Date.now()}`);
    await deployWorkflow(token, wf.id);

    const res = await fetch(`${BASE}/composer/workflows/${wf.id}/run`, {
      method: "POST", headers: auth(token), body: JSON.stringify({}),
    });
    const log = (await res.json())?.data;

    expect(log.status).toBe("queued");
    expect(log.status).not.toBe("succeeded");
    expect(log.completedAt).toBeUndefined();
  });

  test("a queued run does not move the success rate", async () => {
    const wf = await createWorkflow(token, `Rate check ${Date.now()}`);
    await deployWorkflow(token, wf.id);
    await fetch(`${BASE}/composer/workflows/${wf.id}/run`, {
      method: "POST", headers: auth(token), body: JSON.stringify({}),
    });

    const res = await fetch(`${BASE}/composer/workflows/${wf.id}`, { headers: auth(token) });
    const after = (await res.json())?.data;
    expect(after.runs).toBe(0);
    expect(after.successRate).toBeNull();
    expect(after.queuedRuns).toBeGreaterThanOrEqual(1);
  });

  test("a draft workflow cannot be run over HTTP", async () => {
    const wf = await createWorkflow(token, `Draft run ${Date.now()}`);
    // Not deployed. The console disabled the button; the endpoint did not check.
    const res = await fetch(`${BASE}/composer/workflows/${wf.id}/run`, {
      method: "POST", headers: auth(token), body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });

  test("pause and resume are reachable statuses", async () => {
    const wf = await createWorkflow(token, `Pause check ${Date.now()}`);
    await deployWorkflow(token, wf.id);

    const paused = await fetch(`${BASE}/composer/workflows/${wf.id}/pause`, {
      method: "POST", headers: auth(token),
    }).then((r) => r.json());
    expect(paused?.data?.status).toBe("paused");

    // A paused workflow refuses runs.
    const runRes = await fetch(`${BASE}/composer/workflows/${wf.id}/run`, {
      method: "POST", headers: auth(token), body: JSON.stringify({}),
    });
    expect(runRes.status).toBe(409);

    const resumed = await fetch(`${BASE}/composer/workflows/${wf.id}/resume`, {
      method: "POST", headers: auth(token),
    }).then((r) => r.json());
    expect(resumed?.data?.status).toBe("deployed");
  });

  test("validation does not quote a fabricated dollar cost", async () => {
    const wf = await createWorkflow(token, `Cost check ${Date.now()}`);
    const res = await fetch(`${BASE}/composer/workflows/${wf.id}/validate`, { headers: auth(token) });
    const v = (await res.json())?.data;

    // Was `capabilityCount * 0.002`, shown as "est $0.0020/run".
    expect(v.estimatedCostPerRun).toBeNull();
    expect(v.costModelConfigured).toBe(false);
    expect(v.capabilityCount).toBe(1); // the real count is still reported
  });

  test("editing a deployed workflow returns it to draft", async () => {
    const wf = await createWorkflow(token, `Edit check ${Date.now()}`);
    await deployWorkflow(token, wf.id);

    const edited = await createWorkflow(token, `Edit check renamed ${Date.now()}`, wf.id);
    expect(edited.status).toBe("draft");
  });

  test("the run list returns the newest runs first", async () => {
    const wf = await createWorkflow(token, `Order check ${Date.now()}`);
    await deployWorkflow(token, wf.id);

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`${BASE}/composer/workflows/${wf.id}/run`, {
        method: "POST", headers: auth(token), body: JSON.stringify({}),
      }).then((x) => x.json());
      ids.push(r?.data?.id);
      await new Promise((r2) => setTimeout(r2, 15));
    }

    const runs = (await fetch(`${BASE}/composer/runs`, { headers: auth(token) })
      .then((r) => r.json()))?.data ?? [];

    // THE REGRESSION: `zrange(key, -limit, -1, "REV")` returned the OLDEST runs,
    // so a freshly triggered run never appeared at the top of "Recent Runs".
    expect(runs.length).toBeGreaterThan(0);
    const positionOfNewest = runs.findIndex((r: any) => r.id === ids[2]);
    const positionOfOldest = runs.findIndex((r: any) => r.id === ids[0]);
    expect(positionOfNewest).toBeGreaterThanOrEqual(0);
    expect(positionOfNewest).toBeLessThan(positionOfOldest === -1 ? Number.MAX_SAFE_INTEGER : positionOfOldest);
  });

  test("an executor's reported outcome is what moves the rate", async () => {
    const wf = await createWorkflow(token, `Outcome check ${Date.now()}`);
    await deployWorkflow(token, wf.id);
    const log = (await fetch(`${BASE}/composer/workflows/${wf.id}/run`, {
      method: "POST", headers: auth(token), body: JSON.stringify({}),
    }).then((r) => r.json()))?.data;

    const done = (await fetch(`${BASE}/composer/runs/${log.id}/outcome`, {
      method: "POST", headers: auth(token),
      body: JSON.stringify({ status: "succeeded", durationMs: 900, reportedBy: "e2e-executor" }),
    }).then((r) => r.json()))?.data;

    expect(done.status).toBe("succeeded");
    expect(done.reportedBy).toBe("e2e-executor");

    const after = (await fetch(`${BASE}/composer/workflows/${wf.id}`, { headers: auth(token) })
      .then((r) => r.json()))?.data;
    expect(after.runs).toBe(1);
    expect(after.successRate).toBe(1);
    expect(after.queuedRuns).toBe(0);
  });

  test("the same run cannot be resolved twice", async () => {
    const wf = await createWorkflow(token, `Double resolve ${Date.now()}`);
    await deployWorkflow(token, wf.id);
    const log = (await fetch(`${BASE}/composer/workflows/${wf.id}/run`, {
      method: "POST", headers: auth(token), body: JSON.stringify({}),
    }).then((r) => r.json()))?.data;

    const body = JSON.stringify({ status: "succeeded", reportedBy: "e2e" });
    await fetch(`${BASE}/composer/runs/${log.id}/outcome`, { method: "POST", headers: auth(token), body });
    const second = await fetch(`${BASE}/composer/runs/${log.id}/outcome`, { method: "POST", headers: auth(token), body });

    // Otherwise an executor could inflate the success rate by replaying.
    expect(second.status).toBe(409);
  });

  test("workflow routes require an organization context", async () => {
    const res = await fetch(`${BASE}/composer/workflows`);
    expect([401, 403]).toContain(res.status);
  });
});
