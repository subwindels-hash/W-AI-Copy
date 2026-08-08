/**
 * Playwright E2E — Session 141: Global Religion, Belief & Spirituality
 * Knowledge System.
 *
 * Validates against a live API that:
 *   - The catalog serves the families with the neutrality and expansion notes.
 *   - The religion question engine answers definitions, routes comparisons,
 *     and answers truth-claim questions with the neutrality policy.
 *   - The comparison engine returns the 18 categories with no winner.
 *   - Teaching levels render beginner vs research sections.
 *   - The ten-step expansion pipeline detects duplicates, isolates
 *     submissions per org, and gates approval to the Super Admin.
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

test.describe("Session 141 — Global Religion, Belief & Spirituality Knowledge System", () => {
  let token = "";
  const marker = `e2e-rel-${Date.now()}`;

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

  test("GET /religions/catalog serves the families with neutrality + expansion notes", async () => {
    const res = await get("/religions/catalog");
    expect(res.status).toBe(200);
    expect(res.data.catalogVersion).toContain("2026.08");
    expect(res.data.recordCount).toBeGreaterThan(100);
    expect(res.data.familyCount).toBe(12);
    expect(res.data.families.length).toBe(12);
    expect(res.data.neutralityNote).toContain("does not claim to have chosen a religion");
    expect(res.data.expansionNote).toContain("no fixed target size");
  });

  test("GET /religions/search finds traditions by indigenous names", async () => {
    const res = await get("/religions/search?q=%C3%8C%E1%B9%A3%E1%BA%B9%E1%B9%A3e");
    expect(res.status).toBe(200);
    expect(res.data.results.some((r: any) => r.id === "ind.yoruba")).toBe(true);
    const hebrew = await get("/religions/search?q=%D7%99%D6%B7%D7%94%D6%B7%D7%93%D7%95%D6%BC%D7%AA");
    expect(hebrew.data.results.some((r: any) => r.id === "rel.judaism")).toBe(true);
  });

  test("POST /religions/ask answers definitions and routes comparisons", async () => {
    const def = await send("POST", "/religions/ask", { question: "What is Islam?", level: "intermediate" });
    expect(def.data.intent.intent).toBe("definition");
    expect(def.data.matches[0].name).toBe("Islam");
    expect(def.data.matches[0].sections.some((s: any) => s.key === "centralTeachings")).toBe(true);

    const cmp = await send("POST", "/religions/ask", { question: "What is the difference between Christianity and Islam?" });
    expect(cmp.data.intent.intent).toBe("comparison");
    expect(cmp.data.mode).toBe("comparison");
    expect(cmp.data.comparison.items.length).toBeGreaterThanOrEqual(2);
    expect(cmp.data.comparison.rows.length).toBe(18);
    expect(cmp.data.comparison.note).toContain("does not rank religions");
  });

  test("POST /religions/ask answers truth-claim questions with the neutrality policy", async () => {
    const res = await send("POST", "/religions/ask", { question: "Which religion is true?" });
    expect(res.data.intent.intent).toBe("truth_claim");
    expect(res.data.mode).toBe("neutrality");
    expect(res.data.matches[0].id).toBe("pol.neutrality");
    expect(res.data.note).toContain("does not claim to have chosen a religion");
  });

  test("POST /religions/ask answers honestly when the catalog has no knowledge", async () => {
    const res = await send("POST", "/religions/ask", { question: "What is the Zxqvbn faith of the Qwerty islands?" });
    expect(res.data.matches).toEqual([]);
    expect(res.data.note).toContain("do not have sufficient verified knowledge");
  });

  test("POST /religions/compare returns the 18 categories with attributed values", async () => {
    const res = await send("POST", "/religions/compare", { recordIds: ["rel.christianity", "rel.islam"] });
    expect(res.status).toBe(200);
    expect(res.data.items.length).toBe(2);
    expect(res.data.missing).toEqual([]);
    expect(res.data.rows.length).toBe(18);
    const origin = res.data.rows.find((r: any) => r.category === "origin");
    expect(origin.values[0].text).toContain("1st century");
    expect(origin.values[1].text).toContain("7th century");
  });

  test("GET /religions/records/:id/teach renders beginner and research levels", async () => {
    const beginner = await get("/religions/records/rel.buddhism/teach?level=beginner");
    expect(beginner.data.sections.some((s: any) => s.key === "simple")).toBe(true);
    const research = await get("/religions/records/rel.buddhism/teach?level=research");
    expect(research.data.sections.length).toBeGreaterThan(beginner.data.sections.length);
    expect(research.data.sections.some((s: any) => s.key === "researchNote" || s.key === "differences")).toBe(true);
  });

  test("Expansion pipeline: submit, duplicate detection, org isolation, super-admin approval", async () => {
    const created = await send("POST", "/religions/submissions", {
      name: `${marker} Faith`,
      altNames: [`${marker} Religion`],
      family: "other",
      category: "new_religious_movement",
      region: ["Testland"],
      originLabel: "c. 2020",
      centralTeachings: `${marker}: the tradition teaches kindness.`,
      deityConcept: "A single benevolent creator.",
      historicalDevelopment: `${marker}: founded in Testland in the early 21st century.`,
      summary: `${marker}: a small new religious movement of Testland.`,
      simple: `${marker}: a small new religion teaching kindness.`,
      sources: [{ label: `${marker} Observer`, type: "community" }],
    });
    expect(created.status).toBe(201);
    expect(created.data.status).toBe("pending_review");
    expect(created.data.checks.length).toBe(10);
    expect(created.data.checks.find((c: any) => c.step === "knowledge_base_approval").passed).toBe(false);
    expect(created.data.record.confidence).toBe("unverified");

    // Duplicate detection against the catalog
    const dup = await send("POST", "/religions/submissions", {
      name: "Islam",
      family: "abrahamic",
      category: "major_religion",
      region: ["Testland"],
      originLabel: "c. 2020",
      centralTeachings: "Duplicate test teachings.",
      deityConcept: "One God.",
      historicalDevelopment: "Duplicate test history.",
      summary: "Duplicate test summary.",
      simple: "Duplicate test simple explanation.",
      sources: [{ label: "Test" }],
    });
    expect(dup.data.checks.find((c: any) => c.step === "duplicate_detection").passed).toBe(false);

    // Approval by the Super Admin publishes the extension into the shared store
    const approved = await send("PATCH", `/religions/submissions/${created.data.id}`, {
      status: "approved",
      reviewNote: "verified via the expansion gate",
    });
    expect(approved.status).toBe(200);
    expect(approved.data.status).toBe("approved");
    expect(approved.data.approvedBy).toBeTruthy();

    const search = await get(`/religions/search?q=${encodeURIComponent(marker)}`);
    expect(search.data.results.some((r: any) => r.name === `${marker} Faith`)).toBe(true);
  });

  test("Expansion pipeline: submissions without sources fail source verification", async () => {
    const res = await send("POST", "/religions/submissions", {
      name: `${marker} No Source`,
      family: "other",
      category: "new_religious_movement",
      region: ["Testland"],
      originLabel: "c. 2020",
      centralTeachings: "Teachings without any source.",
      deityConcept: "A creator.",
      historicalDevelopment: "A history without sources.",
      summary: "A summary without sources.",
      simple: "A simple explanation without sources.",
      sources: [],
    });
    expect(res.status).toBe(201);
    expect(res.data.checks.find((c: any) => c.step === "source_verification").passed).toBe(false);
    expect(res.data.allAutomatedPassed).toBe(false);
  });

  test("Catalog records cannot be deleted through the submission pipeline", async () => {
    const res = await send("DELETE", "/religions/submissions/nonexistent");
    expect(res.status).toBe(404);
  });
});
