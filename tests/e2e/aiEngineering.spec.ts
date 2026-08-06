/**
 * Playwright E2E — Session 124: AI Software Engineering Workforce.
 *
 * Runs against a live API and pins the behaviours only a running server can
 * prove:
 *   - the department surface answers: roles, repos, tasks, memory,
 *     connections, command center;
 *   - the orchestrator pipeline walks a task to done with advisory steps
 *     (no GitHub token, no localPath in this environment — the honest mode);
 *   - engineering memory entries round-trip;
 *   - a GitHub connection with a bogus token is recorded as `failed` (the
 *     token is verified against the API at connect time) and the token never
 *     appears in any response;
 *   - every endpoint refuses an anonymous caller.
 *
 * Unit coverage for the pipeline, the GitHub client (mocked transport), the
 * repository scanner (real fixture directory) and memory lives in
 * `apps/api/src/aiEngineering/*.test.ts`.
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

test.describe("Session 124 — AI software engineering workforce", () => {
  let token = "";
  const marker = `e2e-aew-${Date.now()}`;

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

  test("the department surface answers: roles, repos, tasks, memory, command center", async () => {
    const roles = await get("/ai-engineering/roles");
    expect(roles.status).toBe(200);
    expect(roles.data.length).toBe(19);
    expect(roles.data.map((r: any) => r.id)).toContain("orchestrator");

    const repos = await get("/ai-engineering/repos");
    expect(repos.status).toBe(200);
    expect(Array.isArray(repos.data)).toBe(true);

    const tasks = await get("/ai-engineering/tasks");
    expect(tasks.status).toBe(200);

    const memory = await get("/ai-engineering/memory");
    expect(memory.status).toBe(200);

    const cc = await get("/ai-engineering/command-center");
    expect(cc.status).toBe(200);
    expect(cc.data.repositories).toBeTruthy();
    expect(cc.data.engineers).toBeTruthy();
    expect(cc.data.memory).toBeTruthy();
    expect(cc.data.note.length).toBeGreaterThan(10);
  });

  test("a repository can be added and the orchestrator pipeline runs a task to done", async () => {
    const repo = await send("POST", "/ai-engineering/repos", { name: `${marker}/app` });
    expect(repo.status).toBe(201);
    expect(repo.data.status).toBe("not_connected");
    expect(repo.data.id.startsWith("aewr-")).toBe(true);

    const task = await send("POST", "/ai-engineering/tasks", {
      repoId: repo.data.id,
      title: `${marker} add health endpoint`,
      description: "Implement GET /healthz with a status payload.",
    });
    expect(task.status).toBe(201);
    expect(task.data.status).toBe("queued");

    const run = await send("POST", `/ai-engineering/tasks/${task.data.id}/run`, {});
    expect(run.status).toBe(200);
    expect(run.data.status).toBe("done");
    expect(run.data.plan).toBeTruthy();
    // No localPath → the test phase is advisory, and the steps say so.
    expect(run.data.testResult.executed).toBe(false);
    expect(run.data.steps.length).toBeGreaterThanOrEqual(5);
    expect(run.data.steps.some((s: any) => s.role === "orchestrator")).toBe(true);

    const detail = await get(`/ai-engineering/tasks/${task.data.id}`);
    expect(detail.status).toBe(200);
    expect(detail.data.status).toBe("done");
  });

  test("engineering memory entries round-trip with their source label", async () => {
    const created = await send("POST", "/ai-engineering/memory", {
      kind: "standard",
      scope: "org",
      title: `${marker} convention`,
      body: "All API bodies are validated with shared Zod schemas.",
      tags: ["api", "zod"],
    });
    expect(created.status).toBe(201);
    expect(created.data.source).toBe("user");
    expect(created.data.id.startsWith("aewm-")).toBe(true);

    const list = await get(`/ai-engineering/memory?q=${encodeURIComponent(marker)}`);
    expect(list.data.some((m: any) => m.id === created.data.id)).toBe(true);

    const removed = await send("DELETE", `/ai-engineering/memory/${created.data.id}`);
    expect(removed.status).toBe(200);
    expect(removed.data.deleted).toBe(true);
  });

  test("a GitHub connection with a bad token is recorded as failed and never leaks the token", async () => {
    const tokenValue = `ghp_e2e_${marker}_0123456789`;
    const conn = await send("POST", "/ai-engineering/connections", {
      provider: "github",
      accountLabel: `${marker} account`,
      token: tokenValue,
    });
    expect(conn.status).toBe(201);
    // api.github.com is unreachable/unauthorized from this environment — the
    // connection must be recorded as failed/unverified, never as connected.
    expect(["failed", "unverified"]).toContain(conn.data.status);
    expect(JSON.stringify(conn)).not.toContain(tokenValue);
    expect(conn.data.tokenMasked).toBeTruthy();
    expect(conn.data.tokenMasked).not.toContain(tokenValue.slice(8));

    const list = await get("/ai-engineering/connections");
    const found = list.data.find((c: any) => c.id === conn.data.id);
    expect(found).toBeTruthy();
    expect(JSON.stringify(list)).not.toContain(tokenValue);
  });

  test("every ai-engineering endpoint refuses an anonymous caller", async () => {
    for (const path of [
      "/ai-engineering/roles",
      "/ai-engineering/repos",
      "/ai-engineering/tasks",
      "/ai-engineering/memory",
      "/ai-engineering/connections",
      "/ai-engineering/command-center",
    ]) {
      const res = await fetch(`${BASE}${path}`);
      expect([401, 403]).toContain(res.status);
    }
  });
});
