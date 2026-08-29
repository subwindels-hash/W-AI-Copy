/**
 * Playwright E2E — Session 168: digitalHumans completion.
 *
 * Covers the three defects that unit tests prove in isolation but that only a
 * live server proves end to end:
 *   1. endSession does not overwrite a measured transcript length.
 *   2. The dashboard counts a session once, not twice.
 *   3. A created avatar is a draft and no timer promotes it to "ready".
 * Plus cross-tenant isolation, which mattered here because all twelve routes
 * read the org inline with no null guard and every service defaulted to the
 * house organization.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function login(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json().catch(() => ({}));
  return j?.data?.token ?? null;
}

async function apiLogin(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const t = await login("admin@windels.ai", "W1ndels!Admin#2026");
    if (t) return t;
    await new Promise((r) => setTimeout(r, 1200));
  }
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@windels.ai", password: "W1ndels!Admin#2026",
      displayName: "Super Admin", organizationName: "WINDELS",
    }),
  });
  return (await login("admin@windels.ai", "W1ndels!Admin#2026"))!;
}

async function secondOrgToken(): Promise<string | null> {
  const email = `dh-tenant-${Date.now()}@example.test`;
  const password = "W1ndels!Tenant#2026";
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email, password, displayName: "Tenant B", organizationName: `Tenant-B-${Date.now()}`,
    }),
  });
  return login(email, password);
}

test.describe("Session 168 — Digital Humans completion", () => {
  let token = "";
  test.beforeAll(async () => { token = await apiLogin(); });
  const auth = (t = token) => ({ "Content-Type": "application/json", Authorization: `Bearer ${t}` });

  async function get(path: string, t = token) {
    const res = await fetch(`${BASE}${path}`, { headers: auth(t) });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }
  async function send(method: string, path: string, body?: unknown, t = token) {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: auth(t),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  const newAvatar = () => send("POST", "/digital-humans/", {
    name: `E2E Avatar ${Date.now()}`, role: "virtual_receptionist",
    gender: "feminine", style: "corporate",
  });

  test("a created avatar is a draft with no fabricated metrics", async () => {
    const res = await newAvatar();
    expect(res.status).toBe(200);
    expect(res.data.status).toBe("draft");
    // Unmeasured is null, never 0.
    expect(res.data.satisfactionPct).toBeNull();
    expect(res.data.avgSessionSec).toBeNull();
    expect(res.data.completedSessions).toBe(0);
  });

  test("no timer promotes a draft to ready", async () => {
    const created = await newAvatar();
    // The removed setTimeout fired at 1500ms.
    await new Promise((r) => setTimeout(r, 2500));
    const after = await get(`/digital-humans/${created.data.id}`);
    expect(after.data.status).toBe("draft");
  });

  test("markReady is the explicit path to ready", async () => {
    const created = await newAvatar();
    const ready = await send("POST", `/digital-humans/${created.data.id}/ready`);
    expect(ready.status).toBe(200);
    expect(ready.data.status).toBe("ready");
  });

  test("endSession preserves the transcript length recorded by real turns", async () => {
    const created = await newAvatar();
    const started = await send("POST", `/digital-humans/${created.data.id}/sessions`, {});
    expect(started.status).toBe(200);

    await send("POST", `/digital-humans/sessions/${started.data.id}/turn`, { chars: 40 });
    await send("POST", `/digital-humans/sessions/${started.data.id}/turn`, { chars: 60 });

    const ended = await send("POST", `/digital-humans/sessions/${started.data.id}/end`, {
      resolution: "resolved", rating: 5,
    });
    expect(ended.status).toBe(200);
    // Before S168 this was randInt(20,180) — a live path fabricating data.
    expect(ended.data.transcriptLength).toBe(100);
    expect(typeof ended.data.durationSec).toBe("number");
  });

  test("a turn cannot be recorded against an ended session", async () => {
    const created = await newAvatar();
    const started = await send("POST", `/digital-humans/${created.data.id}/sessions`, {});
    await send("POST", `/digital-humans/sessions/${started.data.id}/end`, { resolution: "resolved" });
    const late = await send("POST", `/digital-humans/sessions/${started.data.id}/turn`, { chars: 10 });
    expect(late.status).toBe(409);
  });

  test("the dashboard exposes provenance and honest averages", async () => {
    const d = await get("/digital-humans/dashboard/rollup");
    expect(d.status).toBe(200);
    expect(d.data.provenance).toBeTruthy();
    // Either a real measurement or null — never a stand-in zero.
    if (d.data.avgSatisfactionPct !== null) expect(d.data.avgSatisfactionPct).toBeGreaterThan(0);
    if (d.data.avgSessionSec !== null) expect(d.data.avgSessionSec).toBeGreaterThanOrEqual(0);
  });

  test("a second organization sees none of the first org's avatars", async () => {
    const created = await newAvatar();
    const t2 = await secondOrgToken();
    test.skip(!t2, "second org registration unavailable");

    const theirs = await get("/digital-humans/", t2!);
    expect(theirs.status).toBe(200);
    const ids = (theirs.data ?? []).map((h: any) => h.id);
    expect(ids).not.toContain(created.data.id);

    const direct = await get(`/digital-humans/${created.data.id}`, t2!);
    expect(direct.status).toBe(404);

    const dash = await get("/digital-humans/dashboard/rollup", t2!);
    expect(dash.data.total).toBe(0);
    expect(dash.data.totalSessions).toBe(0);
    // An empty org reports no satisfaction, not 0%.
    expect(dash.data.avgSatisfactionPct).toBeNull();
  });

  test("the dashboard counts a session exactly once", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second org registration unavailable");

    const created = await send("POST", "/digital-humans/", {
      name: `Counting ${Date.now()}`, role: "ai_teacher", gender: "masculine", style: "realistic",
    }, t2!);
    await send("POST", `/digital-humans/${created.data.id}/sessions`, {}, t2!);

    const d = await get("/digital-humans/dashboard/rollup", t2!);
    // Before S168 this reported 2: the avatar counter plus the ledger row.
    expect(d.data.totalSessions).toBe(1);
  });
});
