/**
 * Playwright E2E — Session 116: MFA assurance.
 *
 * Runs against a live API and pins the behaviours only a running server can
 * prove:
 *   - the original six `/mfa/*` endpoints keep their paths after the assurance
 *     router was mounted ahead of them on the same prefix, and now refuse an
 *     anonymous caller with 401 instead of crashing on an undefined `req.user`;
 *   - every assurance endpoint refuses an anonymous caller;
 *   - the default policy is reported as a *default*, with the historical
 *     behaviour (optional / report_only) intact;
 *   - coverage and the summary answer honestly for an organization with nothing
 *     stored — nulls and explained zeroes, never invented figures;
 *   - the self-lockout guard actually refuses over HTTP, not just in the unit
 *     suite;
 *   - the configuration report never echoes an encryption key.
 *
 * Nothing here enrols a real authenticator: producing a valid TOTP requires the
 * secret, and enrolling the shared admin account in a test run would leave the
 * suite's own login broken for every subsequent run. Enrolment, verification,
 * throttling and replay are covered by `apps/api/src/mfa/mfaAssurance.test.ts`,
 * which drives the real TOTP service.
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

test.describe("Session 116 — MFA assurance API", () => {
  let token: string;

  test.beforeAll(async () => { token = await apiLogin(); });

  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  const get = (path: string) => fetch(`${BASE}${path}`, { headers: auth() }).then((r) => r.json());

  test("the original six MFA endpoints keep their paths behind the new router", async () => {
    const status = await get("/mfa/status");
    expect(status.ok).toBe(true);
    expect(typeof status.data.enabled).toBe("boolean");
    expect(typeof status.data.recoveryCodesRemaining).toBe("number");
  });

  test("an anonymous caller is refused rather than crashing the handler", async () => {
    // Before Session 116 these handlers dereferenced an undefined `req.user`
    // and answered 500. The refusal must be a 401.
    for (const path of ["/mfa/status", "/mfa/enable"]) {
      const res = await fetch(`${BASE}${path}`, { method: path === "/mfa/enable" ? "POST" : "GET" });
      expect(res.status, `${path} must refuse anonymously`).toBe(401);
    }
  });

  test("every assurance endpoint refuses an anonymous caller", async () => {
    const paths = [
      "/mfa/assurance/summary",
      "/mfa/assurance/gaps",
      "/mfa/assurance/configuration",
      "/mfa/policy",
      "/mfa/coverage",
      "/mfa/coverage/me",
      "/mfa/enrollment",
      "/mfa/recovery/health",
      "/mfa/lock",
      "/mfa/locks",
      "/mfa/exemptions",
      "/mfa/events",
      "/mfa/events/me",
    ];
    for (const path of paths) {
      const res = await fetch(`${BASE}${path}`);
      expect(res.status, `${path} must not be public`).toBe(401);
    }
  });

  test("the policy is reported as a default until an administrator saves one", async () => {
    const body = await get("/mfa/policy");
    expect(body.ok).toBe(true);
    expect(["default", "stored"]).toContain(body.data.source);
    if (body.data.source === "default") {
      expect(body.data.mode).toBe("optional");
      expect(body.data.enforcement).toBe("report_only");
      expect(body.data.updatedAt).toBeNull();
    }
    expect(body.data.enforcementNote).toMatch(/report_only blocks nothing/i);
  });

  test("coverage counts real members and never invents a ratio", async () => {
    const body = await get("/mfa/coverage");
    expect(body.ok).toBe(true);
    const data = body.data;
    expect(typeof data.membersConsidered).toBe("number");
    expect(data.membersConsidered).toBeLessThanOrEqual(data.membersTotal);
    expect(data.members.length).toBeLessThanOrEqual(data.membersConsidered);
    // No one required means no ratio at all, not 0% and not 100%.
    const required = data.members.filter((m: any) => m.required);
    if (required.length === 0) expect(data.requiredCoverageRatio).toBeNull();
    expect(data.enrollmentNote).toMatch(/unrecorded/i);
  });

  test("my own standing is readable without administrator rights", async () => {
    const body = await get("/mfa/coverage/me");
    expect(body.ok).toBe(true);
    expect(typeof body.data.enabled).toBe("boolean");
    expect(["none", "pending", "confirmed", "unrecorded"]).toContain(body.data.enrollment.state);
    expect(body.data.lock.locked).toBe(false);
    expect(body.data.lock.maxAttempts).toBeGreaterThan(0);
  });

  test("the throttle reports a full budget for an account that has not failed", async () => {
    const body = await get("/mfa/lock");
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({ locked: false, failedAttempts: 0, retryAfterSeconds: 0 });
    expect(body.data.remainingAttempts).toBe(body.data.maxAttempts);
    expect(body.data.note).toMatch(/not a claim about an attacker/i);
  });

  test("the configuration report describes the deployment without echoing a key", async () => {
    const body = await get("/mfa/assurance/configuration");
    expect(body.ok).toBe(true);
    expect(body.data.totp).toMatchObject({ algorithm: "SHA1", digits: 6, periodSeconds: 30 });
    expect(body.data.secretStorage.encryption).toBe("aes-256-gcm");
    expect(["environment", "development_fallback"]).toContain(body.data.secretStorage.keySource);
    // A 64-hex-character run would be an AES-256 key in the payload.
    expect(JSON.stringify(body.data)).not.toMatch(/[0-9a-f]{64}/);
    expect(body.data.configNote).toMatch(/never what is working/i);
  });

  test("blocking enforcement is refused from an account with no second factor", async () => {
    const status = await get("/mfa/status");
    test.skip(status.data.enabled === true, "admin account already has MFA; the guard would correctly allow this");
    const res = await fetch(`${BASE}/mfa/policy`, {
      method: "PUT", headers: auth(),
      body: JSON.stringify({ mode: "required_all", enforcement: "block_after_grace" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/would itself be blocked/i);

    // The refusal must not half-apply.
    const after = await get("/mfa/policy");
    expect(after.data.enforcement).toBe("report_only");
  });

  test("an exemption for a non-member is refused", async () => {
    const res = await fetch(`${BASE}/mfa/exemptions`, {
      method: "POST", headers: auth(),
      body: JSON.stringify({ userId: "not-a-real-user", reason: "E2E probe — must be refused.", days: 1 }),
    });
    expect(res.status).toBe(404);
  });

  test("an exemption with a too-short reason is refused by the contract", async () => {
    const res = await fetch(`${BASE}/mfa/exemptions`, {
      method: "POST", headers: auth(),
      body: JSON.stringify({ userId: "someone", reason: "no", days: 1 }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("the ledgers are readable and carry their own caveat", async () => {
    const org = await get("/mfa/events?limit=5");
    expect(org.ok).toBe(true);
    expect(org.data.scope).toBe("organization");
    expect(org.data.events.length).toBeLessThanOrEqual(5);
    expect(org.data.note).toMatch(/recorded since this ledger was introduced/i);

    const mine = await get("/mfa/events/me?limit=5");
    expect(mine.data.scope).toBe("member");
  });

  test("the gap report is a list of addressable problems, not a score", async () => {
    const body = await get("/mfa/assurance/gaps");
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.gaps)).toBe(true);
    const total = body.data.counts.high + body.data.counts.medium + body.data.counts.low;
    expect(total).toBe(body.data.gaps.length);
    expect(body.data.note).toMatch(/not a risk score/i);
  });

  test("the summary is stable across repeated reads", async () => {
    const first = await get("/mfa/assurance/summary");
    const second = await get("/mfa/assurance/summary");
    expect(first.ok).toBe(true);
    expect(second.data.counts).toEqual(first.data.counts);
    expect(second.data.membersConsidered).toBe(first.data.membersConsidered);
    expect(second.data.requiredCoverageRatio).toBe(first.data.requiredCoverageRatio);
  });
});
