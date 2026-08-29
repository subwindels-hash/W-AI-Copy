/**
 * Playwright E2E — Session 125: Super Admin Biography, Identity Memory &
 * AI Knowledge System.
 *
 * Runs against a live API and pins the behaviours only a running server can
 * prove:
 *   - **Super Admin authority over HTTP**: a non-super-admin (org admin)
 *     cannot create records (403); the super admin can run the full
 *     lifecycle;
 *   - the AI response engine answers from approved knowledge with source
 *     traceability, and honestly says it lacks approved knowledge otherwise;
 *   - the knowledge agents run and report;
 *   - a document upload (multipart) lands as a governed record;
 *   - every endpoint refuses an anonymous caller.
 *
 * Unit coverage for classification access, versions, audit, memory-fabric
 * sync and the ask engine lives in
 * `apps/api/src/identityKnowledge/identityKnowledge.test.ts`.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function apiLogin(email = "admin@windels.ai", password = "W1ndels!Admin#2026"): Promise<string> {
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
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
      email, password,
      displayName: email.split("@")[0], organizationName: "WINDELS",
    }),
  });
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json();
  return j.data.token;
}

test.describe("Session 125 — identity knowledge system", () => {
  let token = "";
  const marker = `e2e-ik-${Date.now()}`;

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

  test("a non-super-admin cannot create biography records (403)", async () => {
    const memberToken = await apiLogin(`member-${marker}@windels.ai`);
    const res = await fetch(`${BASE}/identity-knowledge/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ kind: "biography_official", title: "Hijack", body: "x", classification: "public" }),
    });
    expect(res.status).toBe(403);
    // The member can still read public records and ask.
    const list = await fetch(`${BASE}/identity-knowledge/records`, { headers: { Authorization: `Bearer ${memberToken}` } });
    expect(list.status).toBe(200);
  });

  test("the super admin lifecycle: create → approve → publish → verified → ask with sources", async () => {
    const created = await send("POST", "/identity-knowledge/records", {
      kind: "biography_official",
      title: `${marker} Founder Bio`,
      body: "The founder of WINDELS builds AI operating systems and enterprise knowledge platforms.",
      classification: "public",
      category: "biography",
      tags: ["founder"],
    });
    expect(created.status).toBe(201);
    expect(created.data.status).toBe("draft");
    expect(created.data.verified).toBe(false);
    const id = created.data.id;

    const approved = await send("POST", `/identity-knowledge/records/${id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.data.status).toBe("approved");
    expect(approved.data.verified).toBe(false);

    const published = await send("POST", `/identity-knowledge/records/${id}/publish`);
    expect(published.status).toBe(200);
    expect(published.data.verified).toBe(true);
    expect(published.data.publishedAt).toBeTruthy();

    // Versions: created + approved + published.
    const versions = await get(`/identity-knowledge/records/${id}/versions`);
    expect(versions.data.map((v: any) => v.action)).toEqual(["created", "status:approved", "status:published"]);

    // Ask answers from the verified record with source traceability.
    const answer = await send("POST", "/identity-knowledge/ask", { question: "Who is the founder?" });
    expect(answer.status).toBe(200);
    expect(answer.data.outcome).toBe("answered");
    expect(answer.data.sources.some((s: any) => s.recordId === id && s.verified === true)).toBe(true);
    expect(answer.data.sections.some((s: any) => s.section === "verified_facts")).toBe(true);

    // Unknown questions are answered honestly.
    const unknown = await send("POST", "/identity-knowledge/ask", { question: "What is the secret launch code?" });
    expect(unknown.data.outcome).toBe("insufficient_knowledge");
    expect(unknown.data.answer).toContain("do not have sufficient approved knowledge");

    // Cleanup.
    const removed = await send("DELETE", `/identity-knowledge/records/${id}`);
    expect(removed.status).toBe(200);
  });

  test("knowledge agents run and report deterministically", async () => {
    const agents = await get("/identity-knowledge/agents");
    expect(agents.data.length).toBe(8);
    const run = await send("POST", "/identity-knowledge/agents/public_information_agent/run", {});
    expect(run.status).toBe(200);
    expect(run.data.agentId).toBe("public_information_agent");
    expect(run.data.aiGenerated).toBe(false);
    expect(typeof run.data.summary).toBe("string");
  });

  test("a document upload lands as a governed record", async () => {
    const form = new FormData();
    form.append("file", new Blob(["approved company profile content"], { type: "text/plain" }), "profile.txt");
    form.append("title", `${marker} uploaded profile`);
    form.append("classification", "organization");
    const res = await fetch(`${BASE}/identity-knowledge/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.kind).toBe("document");
    expect(body.data.documents[0].filename).toBe("profile.txt");
    // Cleanup.
    await send("DELETE", `/identity-knowledge/records/${body.data.id}`);
  });

  test("dashboard, graph and activity answer; every endpoint refuses anonymous callers", async () => {
    const dash = await get("/identity-knowledge/dashboard");
    expect(dash.status).toBe(200);
    expect(dash.data.total).toBeGreaterThanOrEqual(0);
    const graph = await get("/identity-knowledge/graph");
    expect(graph.status).toBe(200);
    expect(Array.isArray(graph.data.nodes)).toBe(true);
    const activity = await get("/identity-knowledge/activity");
    expect(activity.status).toBe(200);

    for (const path of [
      "/identity-knowledge/records",
      "/identity-knowledge/ask",
      "/identity-knowledge/agents",
      "/identity-knowledge/dashboard",
      "/identity-knowledge/graph",
    ]) {
      const res = await fetch(`${BASE}${path}`);
      expect([401, 403]).toContain(res.status);
    }
  });
});
