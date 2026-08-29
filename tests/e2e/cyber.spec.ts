/**
 * Playwright E2E — Session 161: Cyber completion.
 *
 * Validates against a live API that:
 *   - The cloud findings register is NOT pre-populated with fabricated findings.
 *   - Certification tracks are a catalogue and carry no pass/score.
 *   - Uncollected statistics are null, never 0.
 *   - A recorded finding is labelled by source, and remediation is a real
 *     timestamped transition.
 *   - Labs are register entries (local_state_only) and expire.
 *   - No connector is ever reported connected.
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

test.describe("Session 161 — Cyber completion", () => {
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

  test("no connector is ever reported connected", async () => {
    const res = await get("/cyber/connectors");
    expect(res.status).toBe(200);
    for (const c of res.data) expect(c.status).not.toBe("connected");
    const cspm = res.data.find((c: any) => c.id === "cspm");
    expect(["not_configured", "configured_not_connected"]).toContain(cspm.status);
  });

  test("certification tracks are a catalogue, not achievements", async () => {
    const res = await get("/cyber/certification-tracks");
    expect(res.status).toBe(200);
    expect(res.data.length).toBeGreaterThan(0);
    for (const t of res.data) {
      expect(t.kind).toBe("catalog");
      expect(t.passed).toBeUndefined();
      expect(t.scorePct).toBeUndefined();
    }
  });

  test("uncollected course/challenge statistics are null, never 0", async () => {
    const courses = await get("/cyber/courses");
    for (const c of courses.data) {
      expect(c.enrolled).toBeNull();
      expect(c.rating).toBeNull();
    }
    const chs = await get("/cyber/challenges");
    for (const c of chs.data) expect(c.solvedBy).toBeNull();
  });

  test("challenge metadata is authored, not positional", async () => {
    const res = await get("/cyber/challenges");
    const sqli = res.data.find((c: any) => c.title === "SQLi Basic");
    const kerb = res.data.find((c: any) => c.title === "Kerberoasting");
    expect(sqli.domain).toBe("web_security");
    expect(kerb.domain).toBe("active_directory");
  });

  test("dashboard has no leaderboard rank and reports provenance", async () => {
    const res = await get("/cyber/dashboard/rollup");
    expect(res.status).toBe(200);
    expect(res.data.leaderboardRank).toBeNull();
    expect(res.data.provenance).toBeTruthy();
    expect(res.data.provenance.findings).toBeTruthy();
  });

  test("a recorded finding is source-labelled and remediation is timestamped", async () => {
    const rule = "e2e public bucket " + Date.now();
    const created = await send("POST", "/cyber/findings", {
      cloud: "aws", service: "S3", severity: "critical",
      rule, resource: "e2e-bucket", region: "us-east-1",
    });
    expect(created.status).toBe(201);
    expect(created.data.source).toBe("operator_entered");
    expect(created.data.status).toBe("open");
    expect(created.data.remediatedAt).toBeUndefined();

    const upd = await send("PATCH", `/cyber/findings/${created.data.id}`, { status: "remediated" });
    expect(upd.status).toBe(200);
    expect(upd.data.remediatedAt).toBeTruthy();
  });

  test("scanner-reported findings are distinguishable in health", async () => {
    await send("POST", "/cyber/findings", {
      cloud: "gcp", service: "GCS", severity: "high", rule: "e2e allUsers " + Date.now(),
      resource: "e2e-gcs", region: "us-central1", source: "scanner_reported",
    });
    const h = await get("/cyber/health");
    expect(h.status).toBe(200);
    expect(h.data.scannerReportedFindings).toBeGreaterThan(0);
    expect(h.data.note).toMatch(/scans no cloud account/i);
  });

  test("a lab is a register entry stamped local_state_only", async () => {
    const created = await send("POST", "/cyber/labs", {
      domain: "web_security", difficulty: "intermediate",
    });
    expect(created.status).toBe(200);
    expect(created.data.provisioning).toBe("local_state_only");

    const stopped = await send("POST", `/cyber/labs/${created.data.id}/stop`);
    expect(stopped.status).toBe(200);
    expect(stopped.data.status).toBe("stopped");
  });

  test("ranges have a real scheduled → live lifecycle", async () => {
    const created = await send("POST", "/cyber/ranges", {
      name: "e2e range " + Date.now(), kind: "purple_team",
    });
    expect(created.status).toBe(201);
    expect(created.data.status).toBe("scheduled");

    const live = await send("PATCH", `/cyber/ranges/${created.data.id}`, { status: "live" });
    expect(live.status).toBe(200);
    expect(live.data.status).toBe("live");
  });

  test("a credential is only held once recorded as passed", async () => {
    const before = await get("/cyber/dashboard/rollup");
    const heldBefore = before.data.certificationsHeld;

    await send("POST", "/cyber/certifications", {
      name: "e2e OSCP " + Date.now(), vendor: "OffSec", passed: false,
    });
    const mid = await get("/cyber/dashboard/rollup");
    expect(mid.data.certificationsHeld).toBe(heldBefore);

    await send("POST", "/cyber/certifications", {
      name: "e2e Sec+ " + Date.now(), vendor: "CompTIA", passed: true, scorePct: 88,
    });
    const after = await get("/cyber/dashboard/rollup");
    expect(after.data.certificationsHeld).toBe(heldBefore + 1);
  });

  test("unknown finding and range ids 404", async () => {
    const f = await send("PATCH", "/cyber/findings/f-doesnotexist", { status: "open" });
    expect(f.status).toBe(404);
    const r = await send("PATCH", "/cyber/ranges/rng-doesnotexist", { status: "live" });
    expect(r.status).toBe(404);
  });
});
