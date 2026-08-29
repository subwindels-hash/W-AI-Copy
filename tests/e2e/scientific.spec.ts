/**
 * Playwright E2E — Session 160: Scientific completion.
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

test.describe("Session 160 — Scientific completion", () => {
  let token = "";
  test.beforeAll(async () => { token = await apiLogin(); });
  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  async function get(path: string) {
    const res = await fetch(`${BASE}${path}`, { headers: auth() });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }
  async function send(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: auth(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  test("empty dashboard does not claim a knowledge graph", async () => {
    const d = await get("/scientific/dashboard/rollup");
    expect(d.status).toBe(200);
    expect(d.data.provenance.knowledgeGraph).toMatch(/no research knowledge graph/i);
    if (d.data.papersIndexed === 0) {
      expect(d.data.knowledgeGraphNodes).toBeNull();
      expect(d.data.collaborators).toBeNull();
      expect(d.data.simulationsRun30d).toBeNull();
      expect(d.data.publicationsInProgress).toBe(0);
    }
  });

  test("POST /scientific/experiments then list", async () => {
    const created = await send("POST", "/scientific/experiments", {
      title: "e2e-exp-" + Date.now(),
      hypothesis: "The e2e probe records a planned experiment",
      domain: "biology",
    });
    expect(created.status).toBe(201);
    expect(created.data.status).toBe("planned");
    expect(created.data.progressPct).toBe(0);
    const list = await get("/scientific/experiments");
    expect(list.data.some((e: any) => e.id === created.data.id)).toBe(true);
  });

  test("POST /scientific/papers starts citations null", async () => {
    const p = await send("POST", "/scientific/papers", {
      title: "e2e-paper-" + Date.now(),
      authors: ["E2E"],
      year: 2026,
      venue: "lab-notes",
      domain: "computer_science",
    });
    expect(p.status).toBe(201);
    expect(p.data.citations).toBeNull();
    expect(p.data.relevanceScore).toBeNull();
    const list = await get("/scientific/papers");
    expect(list.data.some((x: any) => x.id === p.data.id)).toBe(true);
  });

  test("POST /scientific/hypotheses confidence is null", async () => {
    const h = await send("POST", "/scientific/hypotheses", {
      statement: "e2e-hyp-" + Date.now() + " ensembles beat singles",
      domain: "mathematics",
    });
    expect(h.status).toBe(201);
    expect(h.data.confidence).toBeNull();
    expect(h.data.status).toBe("proposed");
    const list = await get("/scientific/hypotheses");
    expect(list.data.some((x: any) => x.id === h.data.id)).toBe(true);
  });
});
