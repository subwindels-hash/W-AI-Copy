/**
 * Playwright E2E — Session 152: Cyber & Cloud Academy completion.
 *
 * Validates against a live API that:
 *   - The two-track catalog (Cybersecurity / Ethical Hacking + Cloud
 *     Computing) serves with levels and prerequisites.
 *   - Progress derives from real lecturer mastery (null for never-started,
 *     never a fabricated 0).
 *   - The learning path marks exactly one next-recommended topic per track.
 *   - Starting a lesson delegates to the real Lecturer AI (with the honest
 *     structured fallback when no AI provider is configured).
 *   - Unknown topics return 404 TOPIC_NOT_FOUND.
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

test.describe("Session 152 — Cyber & Cloud Academy", () => {
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

  test("GET /cyber-cloud-academy/catalog serves both tracks with 17 topics", async () => {
    const res = await get("/cyber-cloud-academy/catalog");
    expect(res.status).toBe(200);
    expect(res.data.total).toBe(17);
    expect(res.data.tracks.cybersecurity.length).toBe(9);
    expect(res.data.tracks.cloud.length).toBe(8);
    const titles = [...res.data.tracks.cybersecurity, ...res.data.tracks.cloud].map((t: any) => t.title);
    expect(titles).toContain("Ethical Hacking Bootcamp");
    expect(titles).toContain("Cloud Computing Fundamentals");
    expect(titles).toContain("Multi-Cloud Security & FinOps");
  });

  test("GET /cyber-cloud-academy/progress reports honest null mastery for never-started topics", async () => {
    const res = await get("/cyber-cloud-academy/progress");
    expect(res.status).toBe(200);
    expect(res.data.length).toBe(17);
    const untouched = res.data.find((p: any) => p.topicId === "multi-cloud");
    expect(untouched.masteryPct).toBeNull();
    expect(untouched.started).toBe(false);
    expect(untouched.completed).toBe(false);
  });

  test("GET /cyber-cloud-academy/path marks exactly one next-recommended topic per track", async () => {
    const res = await get("/cyber-cloud-academy/path");
    expect(res.status).toBe(200);
    expect(res.data.length).toBe(17);
    const cyberNext = res.data.filter((n: any) => n.nextRecommended && n.track === "cybersecurity");
    const cloudNext = res.data.filter((n: any) => n.nextRecommended && n.track === "cloud");
    expect(cyberNext.length).toBe(1);
    expect(cloudNext.length).toBe(1);
  });

  test("POST /cyber-cloud-academy/start delegates to the Lecturer AI (honest fallback without a provider)", async () => {
    const res = await send("POST", "/cyber-cloud-academy/start", { topicId: "ethical-hacking" });
    expect(res.status).toBe(200);
    expect(res.data.topic.id).toBe("ethical-hacking");
    expect(res.data.turn.sessionId).toMatch(/^ls-/);
    expect(res.data.turn.stage).toBe("question");
    expect(res.data.turn.question.length).toBeGreaterThan(10);
    // The lecturer surfaces its model source honestly.
    expect(["real", "fallback"]).toContain(res.data.turn.modelSource);
  });

  test("POST /cyber-cloud-academy/start supports a level override", async () => {
    const res = await send("POST", "/cyber-cloud-academy/start", { topicId: "zero-trust", level: "expert" });
    expect(res.status).toBe(200);
    expect(res.data.topic.level).toBe("expert");
    expect(res.data.turn.sessionId).toMatch(/^ls-/);
  });

  test("unknown topics return 404 TOPIC_NOT_FOUND", async () => {
    const res = await send("POST", "/cyber-cloud-academy/start", { topicId: "no-such-topic" });
    expect(res.status).toBe(404);
    expect(res.error.code).toBe("TOPIC_NOT_FOUND");
    const topic = await get("/cyber-cloud-academy/topic/no-such-topic");
    expect(topic.status).toBe(404);
  });

  test("GET /cyber-cloud-academy/topic/:id returns the topic with its lecturer mastery", async () => {
    const res = await get("/cyber-cloud-academy/topic/iac");
    expect(res.status).toBe(200);
    expect(res.data.topic.title).toBe("Infrastructure as Code (Terraform)");
    expect(res.data.mastery).not.toBeNull();
    expect(res.data.mastery.masteryPct).toBeNull();
  });
});
