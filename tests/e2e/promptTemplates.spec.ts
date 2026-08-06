/**
 * Playwright E2E — Session 119: prompt-templates completion.
 *
 * Runs against a live API and pins the behaviours only a running server can
 * prove:
 *   - the five Session 23 endpoints keep their paths, status codes and
 *     payload shapes after the route file was restructured to declare paths
 *     directly (the absolute paths are unchanged);
 *   - the renderer fixes: `{{name | default}}` resolves (it used to leak the
 *     raw placeholder), and a variable with neither value nor default is
 *     reported in `unresolved` while still rendering empty;
 *   - built-ins are read-only: PATCH/DELETE answer 403, and Duplicate is the
 *     correction path (the copy is a normal editable user template);
 *   - the new endpoints: GET /prompt-templates/:id, GET /prompt-templates/stats
 *     (null-aware, windowed) and POST /prompt-templates/:id/duplicate;
 *   - every endpoint refuses an anonymous caller.
 *
 * Unit coverage for the ledger arithmetic, org isolation, the P2025 race and
 * the Zod schemas lives in `apps/api/src/promptTemplates/*.test.ts`, which
 * drive the real services against in-memory Prisma and KV fakes.
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

test.describe("Session 119 — prompt templates completion", () => {
  let token = "";
  const marker = `e2e-pt-${Date.now()}`;

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

  test("every prompt-template endpoint refuses an anonymous caller", async () => {
    for (const path of [
      "/prompt-templates",
      "/prompt-templates/stats",
      "/prompt-templates/some-id/use",
      "/prompt-templates/some-id/duplicate",
      "/prompt-templates/some-id",
    ]) {
      const res = await fetch(`${BASE}${path}`);
      expect([401, 403]).toContain(res.status);
    }
  });

  test("the Session 23 list keeps its path and shape and ships the built-in library", async () => {
    const d = await get("/prompt-templates");
    expect(d.status).toBe(200);
    expect(Array.isArray(d.data)).toBe(true);
    expect(d.data.length).toBeGreaterThanOrEqual(6);
    const builtIn = d.data.find((t: any) => t.isBuiltIn);
    expect(builtIn).toBeTruthy();
    expect(typeof builtIn.title).toBe("string");
    expect(typeof builtIn.content).toBe("string");
    expect(typeof builtIn.usageCount).toBe("number");
  });

  test("create → fetch by id → update → delete round-trip", async () => {
    const created = await send("POST", "/prompt-templates", {
      title: `${marker} round-trip`,
      content: "Hello {{name}} — tone {{tone|friendly}}",
      category: "general",
      icon: "🧪",
    });
    expect(created.status).toBe(201);
    expect(created.data.isBuiltIn).toBe(false);
    const id = created.data.id;

    const single = await get(`/prompt-templates/${id}`);
    expect(single.status).toBe(200);
    expect(single.data.id).toBe(id);
    expect(single.data.title).toBe(`${marker} round-trip`);

    const renamed = await send("PATCH", `/prompt-templates/${id}`, { title: `${marker} renamed` });
    expect(renamed.status).toBe(200);
    expect(renamed.data.title).toBe(`${marker} renamed`);

    const removed = await send("DELETE", `/prompt-templates/${id}`);
    expect(removed.status).toBe(200);
    const after = await get(`/prompt-templates/${id}`);
    expect(after.status).toBe(404);
  });

  test("use renders variables, defaults and the unresolved list", async () => {
    const created = await send("POST", "/prompt-templates", {
      title: `${marker} render`,
      content: "{{name}} | {{tone | friendly}} | [{{missing}}]",
    });
    const id = created.data.id;
    const used = await send("POST", `/prompt-templates/${id}/use`, { name: "Ada" });
    expect(used.status).toBe(200);
    // `{{tone | friendly}}` — whitespace around the pipe — now resolves.
    expect(used.data.rendered).toBe("Ada | friendly | []");
    expect(used.data.unresolved).toEqual(["missing"]);
    expect(used.data.template.id).toBe(id);
    // usageCount on the row and in the stats both move.
    const single = await get(`/prompt-templates/${id}`);
    expect(single.data.usageCount).toBe(1);
  });

  test("stats report the ledger and database sides without inventing zeros", async () => {
    const s = await get("/prompt-templates/stats?days=7");
    expect(s.status).toBe(200);
    expect(s.data.windowDays).toBe(7);
    expect(s.data.totalTemplates).toBeGreaterThanOrEqual(6);
    expect(s.data.totalUses).toBeGreaterThanOrEqual(0);
    expect(s.data).toHaveProperty("ledgerAvailable");
    expect(s.data).toHaveProperty("ledgerStart");
    expect(s.data).toHaveProperty("usesInWindow");
    expect(s.data).toHaveProperty("avgUsesPerDay");
    expect(s.data).toHaveProperty("daily");
    expect(Array.isArray(s.data.topTemplates)).toBe(true);
    expect(typeof s.data.note).toBe("string");
    // A missing average is null, never 0.
    if (s.data.ledgerCoveredDays === 0) expect(s.data.avgUsesPerDay).toBeNull();
  });

  test("a recorded use shows up in the window statistics", async () => {
    const created = await send("POST", "/prompt-templates", {
      title: `${marker} stats`,
      content: "x",
    });
    const id = created.data.id;
    await send("POST", `/prompt-templates/${id}/use`, {});
    const s = await get("/prompt-templates/stats?days=7");
    expect(s.data.usesInWindow).toBeGreaterThanOrEqual(1);
    expect(s.data.ledgerStart).toBeTruthy();
    const top = s.data.topTemplates.find((t: any) => t.templateId === id);
    expect(top).toBeTruthy();
    expect(top.uses).toBeGreaterThanOrEqual(1);
  });

  test("built-ins are read-only and duplicate is the correction path", async () => {
    const list = await get("/prompt-templates");
    const builtIn = list.data.find((t: any) => t.isBuiltIn);
    const patched = await send("PATCH", `/prompt-templates/${builtIn.id}`, { title: "hijack" });
    expect(patched.status).toBe(403);
    const deleted = await send("DELETE", `/prompt-templates/${builtIn.id}`);
    expect(deleted.status).toBe(403);

    const dup = await send("POST", `/prompt-templates/${builtIn.id}/duplicate`, {});
    expect(dup.status).toBe(201);
    expect(dup.data.isBuiltIn).toBe(false);
    expect(dup.data.id).not.toBe(builtIn.id);
    expect(dup.data.content).toBe(builtIn.content);

    // The copy is editable.
    const renamed = await send("PATCH", `/prompt-templates/${dup.data.id}`, { title: `${marker} copy` });
    expect(renamed.status).toBe(200);
    expect(renamed.data.title).toBe(`${marker} copy`);
  });

  test("category filter and substring search narrow the list", async () => {
    const all = await get("/prompt-templates");
    const coding = await get("/prompt-templates?category=coding");
    expect(coding.status).toBe(200);
    expect(coding.data.length).toBeGreaterThan(0);
    expect(coding.data.every((t: any) => t.category === "coding")).toBe(true);
    // Substring search on title.
    const title = all.data[0]!.title;
    const needle = title.slice(0, Math.max(3, Math.floor(title.length / 2)));
    const searched = await get(`/prompt-templates?q=${encodeURIComponent(needle)}`);
    expect(searched.status).toBe(200);
    expect(searched.data.some((t: any) => t.title === title)).toBe(true);
  });

  test("an invalid template id answers 400, not 500", async () => {
    const bad = await get("/prompt-templates/not-a-cuid");
    expect(bad.status).toBe(400);
  });
});
