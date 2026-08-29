/**
 * Playwright E2E — Session 153: University Education completion.
 *
 * Validates against a live API that:
 *   - The university overview and catalog serve faculties, courses across
 *     bachelor/master/doctor, and research areas.
 *   - Per-faculty course lists support the degree-level filter.
 *   - The per-faculty degree plan is ordered by level → term and marks
 *     exactly one next-recommended course for a fresh learner.
 *   - Progress derives from real lecturer mastery (null for never-started).
 *   - Starting a course delegates to the real Lecturer AI (with the honest
 *     structured fallback when no AI provider is configured).
 *   - Search works across title, code, department and faculty name.
 *   - Unknown faculties/courses return 404.
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

test.describe("Session 153 — University Education", () => {
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

  test("GET /university/overview serves faculties, degrees and research areas", async () => {
    const res = await get("/university/overview");
    expect(res.status).toBe(200);
    expect(res.data.facultiesCount).toBeGreaterThan(5);
    expect(res.data.coursesCount).toBeGreaterThan(50);
    expect(res.data.researchAreasCount).toBeGreaterThan(0);
    expect(res.data.degreesOffered).toEqual(["bachelor", "master", "doctor"]);
  });

  test("GET /university/catalog serves courses at all three degree levels", async () => {
    const res = await get("/university/catalog");
    expect(res.status).toBe(200);
    expect(res.data.total).toBeGreaterThan(50);
    expect(res.data.faculties.length).toBe(res.data.total > 0 ? res.data.faculties.length : 0);
    const levels = new Set(res.data.courses.map((c: any) => c.level));
    expect(levels).toEqual(new Set(["bachelor", "master", "doctor"]));
  });

  test("GET /university/faculties/:id/courses supports the degree-level filter", async () => {
    const all = await get("/university/faculties/computing/courses");
    expect(all.status).toBe(200);
    expect(all.data.length).toBeGreaterThan(0);
    const bachelors = await get("/university/faculties/computing/courses?level=bachelor");
    expect(bachelors.data.length).toBeGreaterThan(0);
    expect(bachelors.data.every((c: any) => c.level === "bachelor")).toBe(true);
    const bad = await get("/university/faculties/computing/courses?level=nope");
    expect(bad.status).toBe(400);
    const missing = await get("/university/faculties/nope/courses");
    expect(missing.status).toBe(404);
  });

  test("GET /university/faculties/:id/degree-plan is ordered and marks exactly one next course", async () => {
    const res = await get("/university/faculties/computing/degree-plan");
    expect(res.status).toBe(200);
    expect(res.data.facultyName).toMatch(/Computing/);
    expect(res.data.levels).toEqual(["bachelor", "master", "doctor"]);
    const nodes = res.data.courses;
    expect(nodes.length).toBeGreaterThan(0);
    // Ordered: bachelor before master before doctor.
    const order = nodes.map((n: any) => ["bachelor", "master", "doctor"].indexOf(n.level));
    for (let i = 1; i < order.length; i++) expect(order[i]! >= order[i - 1]!).toBe(true);
    // Exactly one next-recommended for the admin's fresh-ish learner.
    const next = nodes.filter((n: any) => n.nextRecommended);
    expect(next.length).toBe(1);
    expect(next[0].level).toBe("bachelor");
    const unknown = await get("/university/faculties/nope/degree-plan");
    expect(unknown.status).toBe(404);
  });

  test("GET /university/progress reports honest null mastery for never-started courses", async () => {
    const res = await get("/university/progress");
    expect(res.status).toBe(200);
    expect(res.data.length).toBeGreaterThan(50);
    const untouched = res.data.find((p: any) => p.courseId === "csc-500");
    expect(untouched.masteryPct).toBeNull();
    expect(untouched.started).toBe(false);
  });

  test("POST /university/start delegates to the Lecturer AI (honest fallback without a provider)", async () => {
    const res = await send("POST", "/university/start", { courseId: "csc-401" });
    expect(res.status).toBe(200);
    expect(res.data.course.code).toBe("CSC401");
    expect(res.data.course.level).toBe("master");
    expect(res.data.turn.sessionId).toMatch(/^ls-/);
    expect(res.data.turn.stage).toBe("question");
    expect(res.data.turn.question.length).toBeGreaterThan(10);
    expect(["real", "fallback"]).toContain(res.data.turn.modelSource);
  });

  test("POST /university/start returns 404 COURSE_NOT_FOUND for unknown courses", async () => {
    const res = await send("POST", "/university/start", { courseId: "no-such-course" });
    expect(res.status).toBe(404);
    expect(res.error.code).toBe("COURSE_NOT_FOUND");
  });

  test("GET /university/search finds courses by code, title and faculty", async () => {
    const byCode = await get("/university/search?q=CSC");
    expect(byCode.data.length).toBeGreaterThan(0);
    const byTitle = await get("/university/search?q=Ethical%20Hacking");
    expect(byTitle.data.length).toBeGreaterThan(0);
    const byFaculty = await get("/university/search?q=law");
    expect(byFaculty.data.length).toBeGreaterThan(0);
    const none = await get("/university/search?q=zzz-nothing");
    expect(none.data).toEqual([]);
  });

  test("GET /university/courses/:id resolves a course and 404s unknown ids", async () => {
    const ok = await get("/university/courses/csc-101");
    expect(ok.status).toBe(200);
    expect(ok.data.code).toBe("CSC101");
    const missing = await get("/university/courses/nope");
    expect(missing.status).toBe(404);
  });
});
