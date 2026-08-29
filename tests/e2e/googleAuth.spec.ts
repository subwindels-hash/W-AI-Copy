/**
 * Playwright E2E — Session 114: Google Identity governance.
 *
 * Runs against a live API and pins the behaviours that only a running server
 * can prove:
 *   - the original OAuth endpoints still answer on their own paths, and
 *     `/auth/google/status` is still reachable without a token, after the
 *     Session 114 sub-router was mounted ahead of them;
 *   - the governance endpoints refuse an anonymous caller;
 *   - the policy round-trips, normalises its allowlist and can be reset;
 *   - a dry run reports `applied: false` and writes nothing to the ledger;
 *   - the configuration report never returns the client secret;
 *   - the summary reports zeroes and nulls, never invented figures, for an
 *     organization with no recorded Google activity.
 *
 * Nothing here can complete a real Google sign-in — that needs Google — so no
 * assertion pretends to. The sign-in path itself is covered by the unit suite,
 * which signs real RS256 ID tokens with a generated keypair.
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

test.describe("Session 114 — Google identity governance API", () => {
  let token: string;

  test.beforeAll(async () => { token = await apiLogin(); });
  test.afterAll(async () => {
    // Leave the organization on the platform default.
    await fetch(`${BASE}/auth/google/policy`, { method: "DELETE", headers: auth() }).catch(() => {});
  });

  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  const get = (path: string) => fetch(`${BASE}${path}`, { headers: auth() }).then((r) => r.json());
  const post = (path: string, body?: any) =>
    fetch(`${BASE}${path}`, { method: "POST", headers: auth(), body: JSON.stringify(body ?? {}) }).then((r) => r.json());
  const put = (path: string, body: any) =>
    fetch(`${BASE}${path}`, { method: "PUT", headers: auth(), body: JSON.stringify(body) }).then((r) => r.json());

  test("the original OAuth endpoints keep their paths and their anonymous status", async () => {
    const res = await fetch(`${BASE}/auth/google/status`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.data.enabled).toBe("boolean");
  });

  test("governance endpoints refuse an anonymous caller", async () => {
    for (const path of ["/auth/google/summary", "/auth/google/policy", "/auth/google/identities", "/auth/google/config"]) {
      const res = await fetch(`${BASE}${path}`);
      expect(res.status, `${path} must not be public`).toBe(401);
    }
  });

  test("the policy round-trips and normalises its allowlist", async () => {
    const saved = await put("/auth/google/policy", {
      mode: "domain_allowlist",
      allowedDomains: ["@Windels.AI", "windels.ai", "Example.com"],
      blockRevokedIdentities: true,
      note: "E2E check",
    });
    expect(saved.ok).toBe(true);
    expect(saved.data.allowedDomains).toEqual(["example.com", "windels.ai"]);
    expect(saved.data.isDefault).toBe(false);

    const read = await get("/auth/google/policy");
    expect(read.data.mode).toBe("domain_allowlist");
    expect(read.data.policyNote).toBeTruthy();
    expect(read.data.provisioningNote).toBeTruthy();
  });

  test("an allowlist policy with no domains is rejected rather than locking everyone out", async () => {
    const res = await fetch(`${BASE}/auth/google/policy`, {
      method: "PUT", headers: auth(),
      body: JSON.stringify({ mode: "domain_allowlist", allowedDomains: [] }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("a dry run is labelled unapplied and leaves the ledger untouched", async () => {
    await put("/auth/google/policy", {
      mode: "domain_allowlist", allowedDomains: ["windels.ai"], blockRevokedIdentities: true,
    });
    const before = await get("/auth/google/events?limit=1");

    const refused = await post("/auth/google/policy/evaluate", { email: "someone@gmail.com" });
    expect(refused.data.applied).toBe(false);
    expect(refused.data.allowed).toBe(false);
    expect(refused.data.outcome).toBe("blocked_domain");
    expect(refused.data.reason).toContain("gmail.com");

    const allowed = await post("/auth/google/policy/evaluate", { email: "person@windels.ai" });
    expect(allowed.data.allowed).toBe(true);
    expect(allowed.data.matchedDomain).toBe("windels.ai");

    const after = await get("/auth/google/events?limit=1");
    expect(after.data.stored).toBe(before.data.stored);
  });

  test("the configuration report describes the environment and never returns the secret", async () => {
    const res = await get("/auth/google/config");
    expect(res.ok).toBe(true);
    const config = res.data;
    expect(config).toHaveProperty("checks");
    expect(Array.isArray(config.checks)).toBe(true);
    expect(config.scopes).toEqual(["openid", "email", "profile"]);
    expect(config.note).toMatch(/no request is made to google/i);
    expect(JSON.stringify(config)).not.toMatch(/GOOGLE_CLIENT_SECRET"\s*:\s*"[^"]/);
    expect(config).not.toHaveProperty("clientSecret");
    // Readiness is derived from the checks, never asserted independently.
    expect(config.ready).toBe(config.checks.every((c: any) => c.status === "pass"));
  });

  test("the summary reports nulls and zeroes rather than invented activity", async () => {
    const res = await get("/auth/google/summary");
    expect(res.ok).toBe(true);
    const summary = res.data;
    expect(summary.identities.total).toBeGreaterThanOrEqual(0);
    expect(summary.ledgerNote).toMatch(/not estimated/i);
    expect(summary.privacyNote).toMatch(/fingerprint/i);
    if (summary.signIns.recorded === 0) expect(summary.signIns.lastAt).toBeNull();
    if (summary.identities.total === 0) expect(summary.domains).toEqual([]);
  });

  test("an unknown identity id is a 404, not an empty object", async () => {
    const res = await fetch(`${BASE}/auth/google/identities/gid_00000000-0000-4000-8000-000000000000`, { headers: auth() });
    expect(res.status).toBe(404);
  });

  test("the policy can be reset back to the platform default", async () => {
    const reset = await fetch(`${BASE}/auth/google/policy`, { method: "DELETE", headers: auth() }).then((r) => r.json());
    expect(reset.ok).toBe(true);
    expect(reset.data.isDefault).toBe(true);
    expect(reset.data.mode).toBe("open");

    // A second reset has nothing to remove and says so.
    const again = await fetch(`${BASE}/auth/google/policy`, { method: "DELETE", headers: auth() });
    expect(again.status).toBe(404);
  });

  test("the caller can read their own Google link state", async () => {
    const res = await get("/auth/google/me");
    expect(res.ok).toBe(true);
    expect(typeof res.data.linked).toBe("boolean");
    expect(res.data.startPath).toBe("/api/v1/auth/google");
    if (!res.data.linked) expect(res.data.identity).toBeNull();
  });
});
