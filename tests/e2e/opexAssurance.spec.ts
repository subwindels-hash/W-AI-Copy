/**
 * Playwright E2E — Session 118: operational-excellence assurance.
 *
 * Runs against a live API and pins the behaviours only a running server can
 * prove:
 *   - Session 73's three `/opex/*` endpoints keep their paths and their payload
 *     shape after the assurance router was mounted ahead of them on the same
 *     prefix;
 *   - **the central fix**: a finding filed through the Session 73 endpoint is a
 *     durable per-key record with a real resolution timestamp, so "closed in
 *     the last 24 hours" counts closures rather than filings. Before this
 *     session the whole register was one JSON array in one Redis string and the
 *     24-hour figure was computed from the *filing* time, so a finding filed
 *     three days ago and closed a minute ago did not count;
 *   - a resolved finding can be reopened, which was impossible before — the
 *     Session 73 handler refused every change to a resolved record — and the
 *     resolution it undoes stays in the transition history;
 *   - a dimension nobody has assessed reports `null`, never `0`, and the trust
 *     report publishes no composite score;
 *   - the success rate is floored rather than rounded;
 *   - every write endpoint refuses a non-administrator and every endpoint
 *     refuses an anonymous caller.
 *
 * Unit coverage for the arithmetic, the legacy adoption path, org isolation and
 * the policy rules lives in `apps/api/src/opex/opexAssurance.test.ts`, which
 * drives the real service against an in-memory Prisma and KV.
 *
 * Deliberately **not** asserted here: that `trust.trust` in the Session 73
 * rollup is greater than zero. That number is now the floored success rate of
 * recorded AI traffic, so on a deployment that has served no AI request it is
 * legitimately 0 — asserting otherwise would be asserting that the fixture has
 * traffic, not that the code is correct. (`tests/e2e/sessions73-75.spec.ts`
 * still makes that assertion; see the Session 118 runtime checklist.)
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

test.describe("Session 118 — operational-excellence assurance", () => {
  let token = "";
  /** A finding this run files and then drives through its whole lifecycle. */
  let alertId = "";
  const marker = `e2e-opex-${Date.now()}`;

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

  test("every assurance endpoint refuses an anonymous caller", async () => {
    for (const path of [
      "/opex/register/alerts",
      "/opex/register/summary",
      "/opex/reliability",
      "/opex/assessments",
      "/opex/trust",
      "/opex/policy",
      "/opex/assurance/summary",
      "/opex/events",
    ]) {
      const res = await fetch(`${BASE}${path}`);
      expect([401, 403]).toContain(res.status);
    }
  });

  test("the Session 73 rollup keeps its path and its shape", async () => {
    const d = await get("/opex/dashboard/rollup");
    expect(d.status).toBe(200);
    expect(d.data).toHaveProperty("safety");
    expect(d.data).toHaveProperty("trust");
    expect(d.data).toHaveProperty("continuous");
    expect(d.data.trust).toHaveProperty("reliability");
    // Added, not substituted: existing consumers see the same fields plus one.
    expect(d.data.provenance).toBeTruthy();
    expect(Array.isArray(d.data.provenance.entries)).toBe(true);
  });

  test("provenance says which rollup numbers are measurements and which are structural zeros", async () => {
    const p = await get("/opex/assurance/provenance");
    expect(p.status).toBe(200);
    expect(p.data.structuralZeroFields).toBeGreaterThan(0);
    expect(p.data.entries.some((e: any) => e.basis === "not_assessed")).toBe(true);
    expect(p.data.note).toMatch(/structural zero/i);
  });

  test("a finding filed through the Session 73 endpoint lands in the durable register", async () => {
    const filed = await send("POST", "/opex/safety-alerts", {
      category: "bias",
      severity: "warning",
      source: marker,
      message: `${marker} filed by the Session 118 e2e suite`,
    });
    expect(filed.status).toBe(201);
    // The Session 73 response shape is unchanged: no durable-only field leaks.
    expect(filed.data.id).toBeTruthy();
    expect(filed.data.status).toBe("open");
    expect(filed.data.at).toBeTruthy();
    expect(filed.data).not.toHaveProperty("transitions");
    expect(filed.data).not.toHaveProperty("filedAt");
    alertId = filed.data.id;

    const record = await get(`/opex/register/alerts/${alertId}`);
    expect(record.status).toBe(200);
    expect(record.data.filedAt).toBeTruthy();
    expect(record.data.resolvedAt).toBeNull();
    expect(record.data.importedFromLegacyRegister).toBe(false);
    expect(record.data.transitions.length).toBeGreaterThan(0);
  });

  test("acknowledging and closing record their own times, not the filing time", async () => {
    const ack = await send("POST", `/opex/safety-alerts/${alertId}/status`, {
      status: "acknowledged",
    });
    expect(ack.status).toBe(200);
    const resolved = await send("POST", `/opex/safety-alerts/${alertId}/status`, {
      status: "resolved",
      note: "closed by the Session 118 e2e suite",
    });
    expect(resolved.status).toBe(200);

    const record = await get(`/opex/register/alerts/${alertId}`);
    expect(record.data.acknowledgedAt).toBeTruthy();
    expect(record.data.resolvedAt).toBeTruthy();
    // The three times are distinct events; before this session only the first existed.
    expect(new Date(record.data.acknowledgedAt).getTime())
      .toBeGreaterThanOrEqual(new Date(record.data.filedAt).getTime());
    expect(new Date(record.data.resolvedAt).getTime())
      .toBeGreaterThanOrEqual(new Date(record.data.acknowledgedAt).getTime());
  });

  test("'closed in the last 24 hours' counts closures, not filings", async () => {
    const summary = await get("/opex/register/summary");
    expect(summary.status).toBe(200);
    expect(summary.data.resolvedLast24h).toBeGreaterThan(0);

    const rollup = await get("/opex/dashboard/rollup");
    expect(rollup.data.safety.mitigations24h).toBe(summary.data.resolvedLast24h);
  });

  test("the closure rate is labelled as closure, not as safety", async () => {
    const summary = await get("/opex/register/summary");
    expect(summary.data.closureNote).toMatch(/not a safety assessment/i);
    if (summary.data.total === 0) {
      expect(summary.data.closureRatePercent).toBeNull();
    } else {
      expect(summary.data.closureRatePercent).toBeLessThanOrEqual(100);
    }
  });

  test("a closed finding can be reopened, and the resolution it undoes is not erased", async () => {
    const reopened = await send("POST", `/opex/register/alerts/${alertId}/reopen`, {
      reason: "the Session 118 e2e suite is verifying that a mis-closure is recoverable",
    });
    expect(reopened.status).toBe(200);
    expect(reopened.data.status).toBe("open");
    expect(reopened.data.reopenCount).toBe(1);
    expect(reopened.data.reopenedAt).toBeTruthy();

    const history = await get(`/opex/register/alerts/${alertId}/history`);
    expect(history.status).toBe(200);
    expect(history.data.transitions.some((t: any) => t.to === "resolved")).toBe(true);
    expect(history.data.transitions.some((t: any) => t.to === "open" && t.from === "resolved")).toBe(true);
    expect(history.data.reopenCount).toBe(1);
  });

  test("a reopen without a stated reason is refused", async () => {
    const bad = await send("POST", `/opex/register/alerts/${alertId}/reopen`, { reason: "oops" });
    expect([400, 422]).toContain(bad.status);
  });

  test("timing statistics exclude records whose times were never recorded", async () => {
    const t = await get("/opex/register/timings");
    expect(t.status).toBe(200);
    for (const stat of [t.data.timeToAcknowledgeHours, t.data.timeToResolveHours]) {
      if (stat.sampleSize === 0) expect(stat.median).toBeNull();
      expect(typeof stat.excluded).toBe("number");
      expect(stat.excludedReason.length).toBeGreaterThan(0);
    }
    expect(t.data.note).toMatch(/invented|recorded/i);
  });

  test("reliability is floored and is null rather than zero without traffic", async () => {
    const r = await get("/opex/reliability?windowDays=30");
    expect(r.status).toBe(200);
    expect(r.data.windowDays).toBe(30);
    if (r.data.total === 0) {
      expect(r.data.successRatePercent).toBeNull();
      expect(r.data.dataFreshnessHours).toBeNull();
    } else {
      expect(r.data.successRatePercent).toBe(Math.floor((r.data.succeeded / r.data.total) * 100));
    }
    expect(r.data.note).toMatch(/floored, never rounded/i);
    expect(r.data.freshnessNote).toMatch(/perfectly fresh/i);
  });

  test("dimensions nobody assessed report null, never zero", async () => {
    const trust = await get("/opex/trust");
    expect(trust.status).toBe(200);
    for (const m of trust.data.measures) {
      if (m.basis === "not_assessed") {
        expect(m.value).toBeNull();
        expect(m.sampleSize).toBe(0);
      }
    }
    // Every measure is accounted for by exactly one basis.
    expect(trust.data.observed + trust.data.assessed + trust.data.notAssessed)
      .toBe(trust.data.measures.length);
  });

  test("there is no composite trust score, and the report says why", async () => {
    const trust = await get("/opex/trust");
    expect(trust.data.compositeScore).toBeNull();
    expect(trust.data.compositeNote).toMatch(/no single composite trust score/i);
  });

  test("an operator assessment is published as assessed, never as observed", async () => {
    const put = await send("PUT", "/opex/assessments/alignment", {
      score: 62,
      method: "Session 118 e2e review against the documented alignment checklist",
      note: "recorded by the end-to-end suite",
    });
    expect(put.status).toBe(200);
    expect(put.data.score).toBe(62);

    const trust = await get("/opex/trust");
    const alignment = trust.data.measures.find((m: any) => m.key === "alignment");
    expect(alignment.basis).toBe("operator_assessed");
    expect(alignment.value).toBe(62);
    expect(alignment.asOf).toBeTruthy();

    const cleared = await send("DELETE", "/opex/assessments/alignment");
    expect(cleared.status).toBe(200);
    const after = await get("/opex/trust");
    const gone = after.data.measures.find((m: any) => m.key === "alignment");
    expect(gone.basis).toBe("not_assessed");
    expect(gone.value).toBeNull();
  });

  test("an assessment with no stated method is refused", async () => {
    const bad = await send("PUT", "/opex/assessments/compliance", { score: 90, method: "fine" });
    expect([400, 422]).toContain(bad.status);
  });

  test("the risk dimension is a risk dimension, and absent means absent", async () => {
    const trust = await get("/opex/trust");
    const risk = trust.data.measures.find((m: any) => m.key === "hallucination_risk");
    expect(risk.direction).toBe("lower_is_better");
    if (risk.basis === "not_assessed") expect(risk.value).toBeNull();
  });

  test("the policy is advisory and says so", async () => {
    const p = await get("/opex/policy");
    expect(p.status).toBe(200);
    expect(p.data.note).toMatch(/advisory/i);
    expect(p.data.criticalAckHours).toBeGreaterThan(0);
    expect(p.data.criticalResolveHours).toBeGreaterThanOrEqual(p.data.criticalAckHours);
  });

  test("a policy that expects a finding closed before it is acknowledged is refused", async () => {
    const bad = await send("PUT", "/opex/policy", {
      criticalAckHours: 48,
      criticalResolveHours: 4,
    });
    expect([400, 422]).toContain(bad.status);
  });

  test("readiness never rounds a warning up to a pass, and names what is unimplemented", async () => {
    const cfg = await get("/opex/assurance/configuration");
    expect(cfg.status).toBe(200);
    expect(cfg.data.ready).toBe(!cfg.data.checks.some((c: any) => c.state === "fail"));
    expect(cfg.data.unimplementedSections.length).toBeGreaterThan(0);
    expect(cfg.data.unimplementedSections).toContain("playbooks");
  });

  test("the gap report is a list of absences, not a score", async () => {
    const gaps = await get("/opex/assurance/gaps");
    expect(gaps.status).toBe(200);
    expect(Array.isArray(gaps.data.gaps)).toBe(true);
    expect(gaps.data.gaps.length).toBeGreaterThan(0);
    expect(gaps.data.note).toMatch(/not be read as a measurement|not read as a measurement/i);
  });

  test("the ledger records this run's activity and carries its own caveat", async () => {
    const events = await get("/opex/events?limit=100");
    expect(events.status).toBe(200);
    expect(events.data.events.some((e: any) => e.kind === "alert_reopened")).toBe(true);
    expect(events.data.note).toMatch(/since it was introduced/i);
  });

  test("the assurance summary agrees with the reports it is built from", async () => {
    const [summary, register, reliability] = await Promise.all([
      get("/opex/assurance/summary"),
      get("/opex/register/summary"),
      get("/opex/reliability"),
    ]);
    expect(summary.status).toBe(200);
    expect(summary.data.register.total).toBe(register.data.total);
    expect(summary.data.reliability.windowDays).toBe(reliability.data.windowDays);
    expect(summary.data.trust.compositeScore).toBeNull();
  });
});
