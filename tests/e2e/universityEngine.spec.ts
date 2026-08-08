/**
 * Playwright E2E — Session 154: WINDELS Universal University & Higher
 * Education Engine completion.
 *
 * Validates against a live API that:
 *   - The global academic catalog (domains/fields), education levels and
 *     search resolve.
 *   - Deterministic program + course generation works per field/level.
 *   - The global university directory and country profiles resolve.
 *   - The AI University Advisor maps a career goal to a pathway (and is
 *     honest when nothing matches).
 *   - Study plans generate semester-by-semester.
 *   - Teaching delegates to the real Lecturer AI (honest fallback).
 *   - Research guidance and academic intelligence answers resolve.
 *   - Unknown fields/universities return 404.
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

test.describe("Session 154 — Universal University & Higher Education Engine", () => {
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

  test("GET /education-engine/domains serves the global academic catalog", async () => {
    const res = await get("/education-engine/domains");
    expect(res.status).toBe(200);
    expect(res.data.length).toBeGreaterThan(10);
    const names = res.data.map((d: any) => d.name);
    expect(names).toContain("Engineering & Technology");
    expect(names).toContain("Medicine & Health Sciences");
    const fieldCount = res.data.reduce((n: number, d: any) => n + d.fields.length, 0);
    expect(fieldCount).toBeGreaterThan(100);
  });

  test("GET /education-engine/education-levels covers the full ladder", async () => {
    const res = await get("/education-engine/education-levels");
    expect(res.status).toBe(200);
    const all = res.data.flatMap((g: any) => g.levels.map((l: any) => l.id));
    expect(all).toContain("bachelor");
    expect(all).toContain("master");
    expect(all).toContain("phd");
    expect(all).toContain("postdoctoral");
    expect(all).toContain("executive_education");
  });

  test("GET /education-engine/search finds fields and domains", async () => {
    const robotics = await get("/education-engine/search?q=robotics");
    expect(robotics.data.length).toBeGreaterThan(0);
    const career = await get("/education-engine/search?q=data%20scientist");
    expect(career.data.length).toBeGreaterThan(0);
    const none = await get("/education-engine/search?q=zzz-nothing");
    expect(none.data).toEqual([]);
  });

  test("GET /education-engine/program generates a deterministic program with courses", async () => {
    const prog = await get("/education-engine/program?field=robotics&level=bachelor");
    expect(prog.status).toBe(200);
    expect(prog.data.award).toBe("B.Sc");
    expect(prog.data.totalCredits).toBe(120);
    expect(prog.data.coreModules.length).toBeGreaterThan(0);
    const courses = await get("/education-engine/program/courses?field=robotics&level=bachelor");
    expect(courses.data.length).toBe(prog.data.coreModules.length);
    expect(courses.data[0].code).toMatch(/^ENG\d{3}$/);
    const missing = await get("/education-engine/program?field=nope");
    expect(missing.status).toBe(404);
    expect(missing.error.code).toBe("FIELD_NOT_FOUND");
  });

  test("GET /education-engine/universities and /countries resolve globally", async () => {
    const unis = await get("/education-engine/universities");
    expect(unis.status).toBe(200);
    expect(unis.data.length).toBeGreaterThan(30);
    const ng = await get("/education-engine/universities?country=NG");
    expect(ng.data.length).toBeGreaterThan(0);
    const countries = await get("/education-engine/countries");
    expect(countries.data.length).toBeGreaterThan(10);
    const profile = await get("/education-engine/countries/NG");
    expect(profile.status).toBe(200);
    expect(profile.data.bachelorDurationYears).toBe(4);
    const missing = await get("/education-engine/universities/nope");
    expect(missing.status).toBe(404);
  });

  test("POST /education-engine/advise maps a career goal to a pathway", async () => {
    const res = await send("POST", "/education-engine/advise", { goal: "I want to become an AI engineer and build machine learning systems" });
    expect(res.status).toBe(200);
    expect(res.data.matchedFields.length).toBeGreaterThan(0);
    expect(res.data.recommendedPathway.length).toBeGreaterThan(0);
    expect(res.data.careerOutcomes.length).toBeGreaterThan(0);
    expect(res.data.rationale.length).toBeGreaterThan(20);
  });

  test("POST /education-engine/advise is honest when nothing matches", async () => {
    const res = await send("POST", "/education-engine/advise", { goal: "zxqvbn flurb" });
    expect(res.status).toBe(200);
    expect(res.data.matchedFields).toEqual([]);
    expect(res.data.recommendedPathway).toEqual([]);
    expect(res.data.rationale).toContain("could not strongly match");
  });

  test("POST /education-engine/study-plan generates semester-by-semester", async () => {
    const res = await send("POST", "/education-engine/study-plan", { field: "computer-science", level: "bachelor", years: 4 });
    expect(res.status).toBe(200);
    expect(res.data.semesters.length).toBe(8);
    expect(res.data.semesters[0].label).toContain("Year 1");
    expect(res.data.totalCredits).toBeGreaterThan(0);
    const missing = await send("POST", "/education-engine/study-plan", { field: "nope", years: 2 });
    expect(missing.status).toBe(404);
  });

  test("POST /education-engine/teach delegates to the real Lecturer AI", async () => {
    const res = await send("POST", "/education-engine/teach", { field: "cybersecurity", level: "master" });
    expect(res.status).toBe(200);
    expect(res.data.topic).toContain("Cybersecurity");
    expect(res.data.turn.sessionId).toMatch(/^ls-/);
    expect(res.data.turn.question.length).toBeGreaterThan(10);
    const byTitle = await send("POST", "/education-engine/teach", { title: "Advanced Quantum Mechanics", level: "phd" });
    expect(byTitle.data.topic).toContain("Advanced Quantum Mechanics");
    const neither = await send("POST", "/education-engine/teach", {});
    expect(neither.status).toBe(400);
  });

  test("GET /education-engine/research/:id and /insight resolve", async () => {
    const g = await get("/education-engine/research/biology");
    expect(g.status).toBe(200);
    expect(g.data.methodologies.length).toBeGreaterThan(0);
    expect(g.data.thesisStages).toContain("Defence & submission");
    const missing = await get("/education-engine/research/nope");
    expect(missing.status).toBe(404);
    const insight = await get("/education-engine/insight?q=what%20courses%20do%20I%20need%20to%20study%20computer%20science");
    expect(insight.status).toBe(200);
    expect(insight.data.category).toBe("pathway");
    expect(insight.data.answer.length).toBeGreaterThan(10);
  });
});
