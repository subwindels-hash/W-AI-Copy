/**
 * Playwright E2E — Session 150: Life Operating Principles Engine.
 *
 * Validates against a live API that:
 *   - The catalog serves the 115 rules with versioned metadata and the
 *     "practical principles, not absolute laws" framing.
 *   - The Life Coaching Engine classifies questions into the 13 areas and
 *     answers "What are the rules of life?" with the area menu.
 *   - Daily Rules Mode is deterministic per date and carries the full
 *     TODAY'S RULE / WHY / HOW / ACTION / REFLECTION payload.
 *   - Decision Mode returns the 10-question framework and never decides.
 *   - The 12 balance pairs and the 10-step WINDELS Principle resolve.
 *   - The rules are searchable through Enterprise Search.
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

test.describe("Session 150 — Life Operating Principles Engine", () => {
  let token = "";

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

  test("GET /life-principles/catalog serves the 115 rules with versioned metadata", async () => {
    const res = await get("/life-principles/catalog");
    expect(res.status).toBe(200);
    expect(res.data.catalogVersion).toContain("150");
    expect(res.data.ruleCount).toBe(115);
    expect(res.data.partCount).toBe(10);
    expect(res.data.areaCount).toBe(13);
    expect(res.data.philosophyPairCount).toBe(12);
    expect(res.data.note).toContain("not absolute laws");
  });

  test("GET /life-principles/parts lists the 10 parts with the spec counts", async () => {
    const res = await get("/life-principles/parts");
    expect(res.status).toBe(200);
    expect(res.data.length).toBe(10);
    const byId = Object.fromEntries(res.data.map((p: any) => [p.id, p.ruleCount]));
    expect(byId.mindset_self_control).toBe(10);
    expect(byId.unstoppable).toBe(25);
    expect(byId.digital_life).toBe(8);
    expect(byId.character).toBe(12);
  });

  test("GET /life-principles/rules lists all 115 rules; /rules/:number resolves boundaries", async () => {
    const all = await get("/life-principles/rules?limit=115");
    expect(all.data.length).toBe(115);
    const first = await get("/life-principles/rules/1");
    expect(first.data.title).toBe("Stay Alert");
    const last = await get("/life-principles/rules/115");
    expect(last.data.title).toBe("Leave a Legacy");
    const missing = await get("/life-principles/rules/116");
    expect(missing.status).toBe(404);
  });

  test("POST /life-principles/ask classifies into the 13 areas", async () => {
    const cases: Array<[string, string]> = [
      ["How do I save money and pay off debt?", "money"],
      ["My marriage is going through a hard time", "relationships"],
      ["How do I stay disciplined and focused?", "discipline"],
      ["Should I start a business?", "business"],
      ["How do I protect my passwords online?", "digital_life"],
    ];
    for (const [question, area] of cases) {
      const res = await send("POST", "/life-principles/ask", { question });
      expect(res.status).toBe(200);
      expect(res.data.area.id, question).toBe(area);
      expect(res.data.rules.length).toBeGreaterThan(0);
    }
  });

  test("the general 'rules of life' question returns the area menu, not all 115 rules", async () => {
    const res = await send("POST", "/life-principles/ask", { question: "What are the rules of life?" });
    expect(res.status).toBe(200);
    expect(res.data.general).toBe(true);
    expect(res.data.areas.length).toBe(13);
    expect(res.data.rules).toBeUndefined();
    expect(res.data.note).toContain("no single universal set");
  });

  test("GET /life-principles/areas exposes the 13 coaching areas", async () => {
    const res = await get("/life-principles/areas");
    expect(res.status).toBe(200);
    expect(res.data.length).toBe(13);
    expect(res.data.some((a: any) => a.id === "decision_making" && a.ruleCount > 5)).toBe(true);
  });

  test("GET /life-principles/daily is deterministic and carries the full daily payload", async () => {
    const a = await get("/life-principles/daily?date=2026-08-08");
    const b = await get("/life-principles/daily?date=2026-08-08");
    expect(a.status).toBe(200);
    expect(a.data.ruleNumber).toBe(b.data.ruleNumber);
    expect(a.data.date).toBe("2026-08-08");
    expect(a.data.todayRule.length).toBeGreaterThan(10);
    expect(a.data.whyItMatters.length).toBeGreaterThan(20);
    expect(a.data.howToApply.length).toBeGreaterThan(20);
    expect(a.data.todayAction.length).toBeGreaterThan(10);
    expect(a.data.reflectionQuestion.length).toBeGreaterThan(10);
    const c = await get("/life-principles/daily?date=2026-08-09");
    expect(c.data.ruleNumber).not.toBe(a.data.ruleNumber);
    const override = await get("/life-principles/daily?date=2026-08-08&rule=1");
    expect(override.data.ruleNumber).toBe(1);
  });

  test("POST /life-principles/decision returns the 10-question framework, never a verdict", async () => {
    const res = await send("POST", "/life-principles/decision", { situation: "Should I leave my job to start a business?" });
    expect(res.status).toBe(200);
    expect(res.data.framework.length).toBe(10);
    expect(res.data.framework[0]).toBe("What are you trying to achieve?");
    expect(res.data.framework[9]).toBe("What is the next responsible action?");
    expect(res.data.relevantPrinciples.length).toBeGreaterThan(5);
    expect(res.data.note).toContain("does not make the decision for you");
  });

  test("GET /life-principles/philosophy and /principle resolve the balance pairs and the ten steps", async () => {
    const phil = await get("/life-principles/philosophy");
    expect(phil.status).toBe(200);
    expect(phil.data.length).toBe(12);
    const phrases = phil.data.map((p: any) => p.phrase);
    expect(phrases).toContain("Discipline without cruelty.");
    expect(phrases).toContain("Privacy without paranoia.");
    expect(phrases).toContain("Persistence without refusing to adapt.");

    const principle = await get("/life-principles/principle");
    expect(principle.status).toBe(200);
    expect(principle.data.steps.length).toBe(10);
    expect(principle.data.steps[0]).toBe("THINK BEFORE YOU ACT.");
    expect(principle.data.steps[9]).toBe("NEVER STOP LEARNING.");
  });

  test("POST /life-principles/search finds rules by title and tags", async () => {
    const password = await send("POST", "/life-principles/search", { q: "password" });
    expect(password.data.some((r: any) => r.number === 96)).toBe(true);
    const trust = await send("POST", "/life-principles/search", { q: "trust" });
    expect(trust.data.length).toBeGreaterThan(2);
  });

  test("GET /life-principles/integrity is clean at 115 rules", async () => {
    const res = await get("/life-principles/integrity");
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(res.data.issues).toEqual([]);
  });

  test("Enterprise Search indexes the life principles (type=life_principle)", async () => {
    const res = await get(`/search/query?q=${encodeURIComponent("protect your passwords")}&types=life_principle&limit=10`);
    expect(res.status).toBe(200);
    expect(res.data.hits.some((h: any) => h.type === "life_principle" && h.title.includes("Rule 96"))).toBe(true);
    const rollup = await get("/search/dashboard/rollup");
    expect(rollup.status).toBe(200);
    expect(rollup.data.indexedCounts.life_principle).toBe(115);
  });
});
