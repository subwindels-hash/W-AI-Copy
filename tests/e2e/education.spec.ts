/**
 * Playwright E2E — Session 159: Education completion.
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

test.describe("Session 159 — Education completion", () => {
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

  test("empty dashboard does not claim 0% mastery", async () => {
    const d = await get("/education/dashboard/rollup");
    expect(d.status).toBe(200);
    expect(d.data.provenance.avgMasteryPct).toMatch(/not 0%/);
    if (d.data.totalContent === 0) {
      expect(d.data.avgMasteryPct).toBeNull();
      expect(d.data.activeLearners).toBe(0);
    }
  });

  test("POST /education/content then list", async () => {
    const created = await send("POST", "/education/content", {
      title: "e2e-lesson-" + Date.now(), kind: "lesson", durationMin: 20, difficulty: "beginner",
    });
    expect(created.status).toBe(201);
    expect(created.data.rating).toBeNull();
    const list = await get("/education/content");
    expect(list.data.some((c: any) => c.id === created.data.id)).toBe(true);
  });

  test("POST /education/skills then mastery is a number", async () => {
    const s = await send("POST", "/education/skills", {
      name: "e2e-skill-" + Date.now(), category: "Data", level: 3,
    });
    expect(s.status).toBe(201);
    const d = await get("/education/dashboard/rollup");
    expect(d.data.avgMasteryPct).not.toBeNull();
  });

  test("POST /education/assessments and tutor/start keep existing shapes", async () => {
    const c = await send("POST", "/education/content", {
      title: "e2e-quiz-" + Date.now(), kind: "quiz", durationMin: 10, difficulty: "beginner",
    });
    const a = await send("POST", "/education/assessments", {
      contentId: c.data.id, scorePct: 80, correct: 8, questions: 10, timeSpentSec: 120,
    });
    expect(a.status).toBe(200);
    expect(a.data.passed).toBe(true);
    const t = await send("POST", "/education/tutor/start", { topic: "e2e-topic" });
    expect(t.status).toBe(200);
    expect(t.data.messages).toBe(0);
  });
});
