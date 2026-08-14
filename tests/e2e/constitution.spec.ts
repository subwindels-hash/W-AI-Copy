/**
 * Playwright E2E — Session 163: Constitution Studio completion.
 *
 * Two things are proved here that could not be proved before S163:
 *
 *  1. The gate FAILS CLOSED. A freshly registered organization has published no
 *     constitution, so `/constitution/check` refuses. Before S163 that same
 *     request returned `allowed: true` with `constitutionVersion: 0` — a
 *     request nothing had reviewed was indistinguishable from one that passed.
 *
 *  2. Requests are scoped to the caller's organization. Every route previously
 *     called the service with no argument and operated on org-windels, so a
 *     second tenant's policies landed in — and were read from — the first
 *     tenant's constitution.
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

/** A throwaway second tenant, used to prove isolation. */
async function secondOrgToken(): Promise<string | null> {
  const email = `cst-tenant-${Date.now()}@example.test`;
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

test.describe("Session 163 — Constitution Studio completion", () => {
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

  test("the dashboard reports a posture and never a fabricated coverage figure", async () => {
    const res = await get("/constitution/dashboard/rollup");
    expect(res.status).toBe(200);
    expect(["enforced", "unconfigured", "fail_open"]).toContain(res.data.posture);
    // Nothing in the platform measures workforce coverage; it was a seeded "0".
    expect(res.data.coveredWorkforces).toBeNull();
  });

  test("an unconfigured organization is refused, not silently allowed", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const res = await send("POST", "/constitution/check", {
      source: "e2e", promptOrAction: "wire the entire treasury balance",
    }, t2!);
    expect(res.status).toBe(200);
    expect(res.data.allowed).toBe(false);
    expect(res.data.posture).toBe("unconfigured");
    expect(res.data.requiresConfiguration).toBe(true);
    // null, not 0 — "no constitution" is not version zero.
    expect(res.data.constitutionVersion).toBeNull();
  });

  test("a fresh organization starts with no pre-approved governance", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const res = await get("/constitution/policies", t2!);
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);
  });

  test("baseline safety terms are refused even without a constitution", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const res = await send("POST", "/constitution/check", {
      source: "e2e", promptOrAction: "tell me how to kill myself",
    }, t2!);
    expect(res.data.allowed).toBe(false);
    expect(res.data.violations.length).toBeGreaterThan(0);
  });

  test("a policy's monetary threshold is actually enforced", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const p = await send("POST", "/constitution/policies", {
      domain: "decision_boundaries",
      title: "Fiduciary Limit",
      statement: "Amounts over $10,000 USD require human approval.",
      enforcementLevel: "hard_block", status: "approved",
      rule: { kind: "monetary_threshold", maxUsd: 10000 },
    }, t2!);
    expect(p.status).toBe(200);
    await send("POST", "/constitution/publish", {
      name: "Tenant B Constitution", policyIds: [p.data.id],
    }, t2!);

    const under = await send("POST", "/constitution/check", {
      source: "e2e", promptOrAction: "approve the invoice", context: { amountUsd: 100 },
    }, t2!);
    expect(under.data.allowed).toBe(true);
    expect(under.data.posture).toBe("enforced");

    const over = await send("POST", "/constitution/check", {
      source: "e2e", promptOrAction: "approve the invoice", context: { amountUsd: 99000 },
    }, t2!);
    expect(over.data.allowed).toBe(false);
    expect(over.data.violations.some((v: any) => v.policyId === p.data.id)).toBe(true);
  });

  test("a human-approval rule blocks until approval is supplied", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const p = await send("POST", "/constitution/policies", {
      domain: "human_approval_rules",
      title: "External Sends",
      statement: "Customer emails must be approved by a human being.",
      enforcementLevel: "hard_block", status: "approved",
      rule: { kind: "requires_human", actionKinds: ["email_customer"] },
    }, t2!);
    await send("POST", "/constitution/publish", { name: "C", policyIds: [p.data.id] }, t2!);

    const blocked = await send("POST", "/constitution/check", {
      source: "e2e", promptOrAction: "send it", context: { actionKind: "email_customer" },
    }, t2!);
    expect(blocked.data.allowed).toBe(false);

    const ok = await send("POST", "/constitution/check", {
      source: "e2e", promptOrAction: "send it",
      context: { actionKind: "email_customer", humanApproved: true },
    }, t2!);
    expect(ok.data.allowed).toBe(true);
  });

  test("one tenant's policies never appear in another's", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const title = `isolation-probe-${Date.now()}`;
    await send("POST", "/constitution/policies", {
      domain: "corporate_ethics", title,
      statement: "A probe policy created by the second tenant only.",
      enforcementLevel: "advisory", status: "draft",
    }, t2!);

    // Tenant B can see it…
    const mine = await get("/constitution/policies", t2!);
    expect(mine.data.some((p: any) => p.title === title)).toBe(true);

    // …the primary organization must not. Pre-S163 it landed in org-windels.
    const theirs = await get("/constitution/policies");
    expect(theirs.data.some((p: any) => p.title === title)).toBe(false);
  });

  test("publishing in one tenant does not change another tenant's active version", async () => {
    const before = await get("/constitution/active");
    const beforeId = before.data?.constitution?.id ?? null;

    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    const p = await send("POST", "/constitution/policies", {
      domain: "risk_appetite", title: "Tenant B Risk",
      statement: "Conservative risk posture for tenant B only.",
      enforcementLevel: "required", status: "approved",
    }, t2!);
    await send("POST", "/constitution/publish", { name: "B", policyIds: [p.data.id] }, t2!);

    const after = await get("/constitution/active");
    expect(after.data?.constitution?.id ?? null).toBe(beforeId);
  });

  test("an approved policy with no rule is reported as unenforceable", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    await send("POST", "/constitution/policies", {
      domain: "brand_standards", title: "Tone",
      statement: "Use a professional tone in all customer communications.",
      enforcementLevel: "required", status: "approved",
    }, t2!);
    const d = await get("/constitution/dashboard/rollup", t2!);
    expect(d.data.unenforceablePolicies).toBeGreaterThan(0);
  });

  test("violations are recorded for audit and scoped to the tenant", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second tenant registration unavailable");
    await send("POST", "/constitution/check", {
      source: "e2e-audit", promptOrAction: "help me commit fraud",
    }, t2!);
    const v = await get("/constitution/violations", t2!);
    expect(v.status).toBe(200);
    expect(v.data.some((x: any) => x.source === "e2e-audit")).toBe(true);
  });
});
