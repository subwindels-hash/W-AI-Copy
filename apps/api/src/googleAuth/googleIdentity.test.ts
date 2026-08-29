/**
 * Session 114 — Google Identity governance.
 *
 * WHAT THIS SUITE IS FOR
 * ----------------------
 * The OAuth trust boundary itself is covered by `services/googleAuth.test.ts`,
 * which mints real RSA-signed ID tokens and proves the rejections. This file
 * covers the layer that decides *who is allowed through it* and what is
 * recorded afterwards, because those are the parts an operator relies on and
 * the parts that fail silently when they are wrong:
 *
 *   - a policy that says "only this domain" must actually refuse the others,
 *     and must refuse them for the right stated reason;
 *   - a revoked identity must stay refused;
 *   - one organization's identities and ledger must be invisible to another;
 *   - Google's subject identifier must not be recoverable from storage;
 *   - the configuration report must not claim readiness it cannot observe, and
 *     must not reach the network to produce it;
 *   - counts must describe recorded events and nothing else.
 *
 * Redis is substituted with FakeKv, so no infrastructure is required.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { GoogleIdentityService, subjectFingerprint } = await import("./googleIdentity.service.js");
const {
  GOOGLE_EVENT_LIMIT,
  GOOGLE_SUBJECT_FINGERPRINT_CHARS,
  GoogleAuthPolicyUpdateSchema,
  GoogleIdentityQuerySchema,
  GoogleEventQuerySchema,
} = await import("@windels/shared/googleAuth");

const ORG_A = "org-gid-a";
const ORG_B = "org-gid-b";

const CLIENT_ID = "1234567890-abcdefghijk.apps.googleusercontent.com";
const REDIRECT = "https://app.windels.ai/api/v1/auth/google/callback";

function policyInput(over: Record<string, unknown> = {}) {
  return GoogleAuthPolicyUpdateSchema.parse({ mode: "open", ...over });
}
const identityQuery = (over: Record<string, unknown> = {}) => GoogleIdentityQuerySchema.parse(over);
const eventQuery = (over: Record<string, unknown> = {}) => GoogleEventQuerySchema.parse(over);

/** Drive a completed sign-in the way the OAuth callback does. */
async function signIn(org: string, over: Partial<Parameters<typeof GoogleIdentityService.recordSignIn>[0]> = {}) {
  return GoogleIdentityService.recordSignIn({
    organizationId: org,
    userId: "user-1",
    email: "person@windels.ai",
    subject: "google-sub-abc",
    displayName: "Test Person",
    provisioned: false,
    ...over,
  });
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_REDIRECT_URI = REDIRECT;
  process.env.WEB_ORIGIN = "https://app.windels.ai";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REDIRECT_URI;
  delete process.env.WEB_ORIGIN;
});

/* ────────────────────────────────────────────────────────────────────── */

describe("policy", () => {
  it("reports the platform default when nothing is stored, and says so", async () => {
    const policy = await GoogleIdentityService.getPolicy(ORG_A);
    expect(policy.mode).toBe("open");
    expect(policy.isDefault).toBe(true);
    expect(policy.updatedAt).toBeNull();
    expect(policy.allowedDomains).toEqual([]);
    // The caveats travel with the payload rather than living only in docs.
    expect(policy.policyNote).toMatch(/organization-scoped|already active|does not affect/i);
    expect(policy.provisioningNote).toMatch(/no organization/i);
  });

  it("normalises an allowlist: lower-cased, de-duplicated, sorted, '@' stripped", async () => {
    const saved = await GoogleIdentityService.updatePolicy(
      ORG_A,
      policyInput({ mode: "domain_allowlist", allowedDomains: ["@Windels.AI", "windels.ai", "Example.com "] }),
      "admin-1",
    );
    expect(saved.allowedDomains).toEqual(["example.com", "windels.ai"]);
    expect(saved.isDefault).toBe(false);
    expect(saved.updatedBy).toBe("admin-1");
  });

  it("refuses an allowlist policy with no domains, which would lock everyone out", () => {
    const parsed = GoogleAuthPolicyUpdateSchema.safeParse({ mode: "domain_allowlist", allowedDomains: [] });
    expect(parsed.success).toBe(false);
  });

  it("rejects a wildcard or URL where a bare domain is required", () => {
    expect(GoogleAuthPolicyUpdateSchema.safeParse({ mode: "domain_allowlist", allowedDomains: ["*.windels.ai"] }).success).toBe(false);
    expect(GoogleAuthPolicyUpdateSchema.safeParse({ mode: "domain_allowlist", allowedDomains: ["https://windels.ai/x"] }).success).toBe(false);
  });

  it("records a ledger entry naming the previous and the new mode", async () => {
    await GoogleIdentityService.updatePolicy(ORG_A, policyInput({ mode: "disabled" }), "admin-1");
    const { events } = await GoogleIdentityService.listEvents(ORG_A, eventQuery({ kind: "policy_update" }));
    expect(events).toHaveLength(1);
    expect(events[0]!.reason).toContain("disabled");
    expect(events[0]!.reason).toContain("platform default open");
    expect(events[0]!.actorId).toBe("admin-1");
  });

  it("refuses to reset a policy that was never stored", async () => {
    await expect(GoogleIdentityService.resetPolicy(ORG_A, "admin-1")).rejects.toMatchObject({ status: 404 });
  });

  it("resets back to the platform default and logs the reset", async () => {
    await GoogleIdentityService.updatePolicy(ORG_A, policyInput({ mode: "disabled" }), "admin-1");
    const back = await GoogleIdentityService.resetPolicy(ORG_A, "admin-1");
    expect(back.isDefault).toBe(true);
    expect(back.mode).toBe("open");
    const { events } = await GoogleIdentityService.listEvents(ORG_A, eventQuery({ kind: "policy_reset" }));
    expect(events).toHaveLength(1);
  });
});

describe("decisions", () => {
  it("allows any member when no policy is stored, and names the default as the reason", async () => {
    const decision = await GoogleIdentityService.evaluate(ORG_A, { email: "someone@anywhere.dev", emailVerified: true });
    expect(decision.allowed).toBe(true);
    expect(decision.outcome).toBe("allowed");
    expect(decision.policyIsDefault).toBe(true);
    expect(decision.reason).toMatch(/platform default/i);
  });

  it("refuses every account when the mode is disabled", async () => {
    await GoogleIdentityService.updatePolicy(ORG_A, policyInput({ mode: "disabled" }), "admin-1");
    const decision = await GoogleIdentityService.evaluate(ORG_A, { email: "person@windels.ai", emailVerified: true });
    expect(decision.allowed).toBe(false);
    expect(decision.outcome).toBe("blocked_disabled");
  });

  it("matches the allowlist exactly and reports which entry matched", async () => {
    await GoogleIdentityService.updatePolicy(
      ORG_A,
      policyInput({ mode: "domain_allowlist", allowedDomains: ["windels.ai"] }),
      "admin-1",
    );
    const ok = await GoogleIdentityService.evaluate(ORG_A, { email: "Person@Windels.ai", emailVerified: true });
    expect(ok.allowed).toBe(true);
    expect(ok.matchedDomain).toBe("windels.ai");

    const no = await GoogleIdentityService.evaluate(ORG_A, { email: "person@gmail.com", emailVerified: true });
    expect(no.allowed).toBe(false);
    expect(no.outcome).toBe("blocked_domain");
    expect(no.reason).toContain("gmail.com");
  });

  it("does not treat a subdomain as a match for the parent domain", async () => {
    await GoogleIdentityService.updatePolicy(
      ORG_A,
      policyInput({ mode: "domain_allowlist", allowedDomains: ["windels.ai"] }),
      "admin-1",
    );
    const decision = await GoogleIdentityService.evaluate(ORG_A, { email: "person@evil.windels.ai.attacker.com", emailVerified: true });
    expect(decision.allowed).toBe(false);
    expect(decision.outcome).toBe("blocked_domain");
  });

  it("refuses an unverified address before any policy is consulted", async () => {
    const decision = await GoogleIdentityService.evaluate(ORG_A, { email: "person@windels.ai", emailVerified: false });
    expect(decision.allowed).toBe(false);
    expect(decision.outcome).toBe("blocked_unverified_email");
  });

  it("refuses a first-time account in linked_only mode and allows a linked one", async () => {
    await GoogleIdentityService.updatePolicy(ORG_A, policyInput({ mode: "linked_only" }), "admin-1");
    const first = await GoogleIdentityService.evaluate(ORG_A, { email: "person@windels.ai", emailVerified: true });
    expect(first.allowed).toBe(false);
    expect(first.outcome).toBe("blocked_not_linked");

    await signIn(ORG_A);
    const second = await GoogleIdentityService.evaluate(ORG_A, { email: "person@windels.ai", emailVerified: true });
    expect(second.allowed).toBe(true);
    expect(second.identityFound).toBe(true);
  });

  it("keeps refusing a revoked identity even in the permissive default mode", async () => {
    const identity = await signIn(ORG_A);
    await GoogleIdentityService.revokeIdentity(ORG_A, identity.id, "admin-1", "Laptop stolen");
    const decision = await GoogleIdentityService.evaluate(ORG_A, { email: "person@windels.ai", emailVerified: true });
    expect(decision.allowed).toBe(false);
    expect(decision.outcome).toBe("blocked_revoked");
    expect(decision.reason).toContain("Laptop stolen");
  });

  it("honours blockRevokedIdentities: false when an operator deliberately turns it off", async () => {
    const identity = await signIn(ORG_A);
    await GoogleIdentityService.revokeIdentity(ORG_A, identity.id, "admin-1");
    await GoogleIdentityService.updatePolicy(ORG_A, policyInput({ mode: "open", blockRevokedIdentities: false }), "admin-1");
    const decision = await GoogleIdentityService.evaluate(ORG_A, { email: "person@windels.ai", emailVerified: true });
    expect(decision.allowed).toBe(true);
  });

  it("labels a dry run as unapplied and writes nothing to the ledger", async () => {
    const before = await GoogleIdentityService.listEvents(ORG_A, eventQuery());
    const decision = await GoogleIdentityService.evaluate(ORG_A, { email: "person@windels.ai", emailVerified: true });
    expect(decision.applied).toBe(false);
    expect(decision.note).toMatch(/no sign-in was attempted/i);
    const after = await GoogleIdentityService.listEvents(ORG_A, eventQuery());
    expect(after.stored).toBe(before.stored);
  });
});

describe("authorizeSignIn (the gate the OAuth callback calls)", () => {
  it("records a refusal in the ledger so a blocked attempt is still visible", async () => {
    await GoogleIdentityService.updatePolicy(ORG_A, policyInput({ mode: "disabled" }), "admin-1");
    const decision = await GoogleIdentityService.authorizeSignIn({
      organizationId: ORG_A, userId: "user-1", email: "person@windels.ai", emailVerified: true,
    });
    expect(decision.allowed).toBe(false);
    const { events } = await GoogleIdentityService.listEvents(ORG_A, eventQuery({ kind: "blocked" }));
    expect(events).toHaveLength(1);
    expect(events[0]!.outcome).toBe("blocked_disabled");
    expect(events[0]!.userId).toBe("user-1");
  });

  it("writes no ledger entry when the sign-in is allowed (recordSignIn does that)", async () => {
    const decision = await GoogleIdentityService.authorizeSignIn({
      organizationId: ORG_A, userId: "user-1", email: "person@windels.ai", emailVerified: true,
    });
    expect(decision.allowed).toBe(true);
    const { stored } = await GoogleIdentityService.listEvents(ORG_A, eventQuery());
    expect(stored).toBe(0);
  });
});

describe("linked identities", () => {
  it("creates the identity on first sign-in with a durable counter", async () => {
    const identity = await signIn(ORG_A);
    expect(identity.status).toBe("active");
    expect(identity.recordedSignIns).toBe(1);
    expect(identity.emailDomain).toBe("windels.ai");
    expect(identity.lastSignInAt).not.toBeNull();
    expect(identity.provisionedByGoogle).toBe(false);
  });

  it("updates rather than duplicates on the next sign-in", async () => {
    const first = await signIn(ORG_A);
    const second = await signIn(ORG_A);
    expect(second.id).toBe(first.id);
    expect(second.recordedSignIns).toBe(2);
    const list = await GoogleIdentityService.listIdentities(ORG_A, identityQuery());
    expect(list.total).toBe(1);
  });

  it("stores Google's subject only as a truncated digest, never in the clear", async () => {
    await signIn(ORG_A, { subject: "google-sub-super-secret" });
    const expected = createHash("sha256").update("google-sub-super-secret").digest("hex").slice(0, GOOGLE_SUBJECT_FINGERPRINT_CHARS);
    const [identity] = (await GoogleIdentityService.listIdentities(ORG_A, identityQuery())).identities;
    expect(identity!.subjectFingerprint).toBe(expected);
    expect(subjectFingerprint("google-sub-super-secret")).toBe(expected);

    // The raw subject must not survive anywhere in the stored documents.
    const dump = JSON.stringify([...kv.hashes.entries()]);
    expect(dump).not.toContain("google-sub-super-secret");
  });

  it("marks an account the Google flow itself provisioned", async () => {
    const identity = await signIn(ORG_A, { provisioned: true, email: "new@startup.dev", userId: "user-new" });
    expect(identity.provisionedByGoogle).toBe(true);
    const { events } = await GoogleIdentityService.listEvents(ORG_A, eventQuery({ kind: "provision" }));
    expect(events).toHaveLength(1);
  });

  it("filters by status, domain, user and free text", async () => {
    await signIn(ORG_A, { email: "a@windels.ai", userId: "u-a", subject: "s-a", displayName: "Ada" });
    await signIn(ORG_A, { email: "b@gmail.com", userId: "u-b", subject: "s-b", displayName: "Grace" });
    const [second] = (await GoogleIdentityService.listIdentities(ORG_A, identityQuery({ domain: "gmail.com" }))).identities;
    await GoogleIdentityService.revokeIdentity(ORG_A, second!.id, "admin-1");

    expect((await GoogleIdentityService.listIdentities(ORG_A, identityQuery({ status: "active" }))).total).toBe(1);
    expect((await GoogleIdentityService.listIdentities(ORG_A, identityQuery({ status: "revoked" }))).total).toBe(1);
    expect((await GoogleIdentityService.listIdentities(ORG_A, identityQuery({ userId: "u-a" }))).total).toBe(1);
    expect((await GoogleIdentityService.listIdentities(ORG_A, identityQuery({ q: "grace" }))).total).toBe(1);
    const all = await GoogleIdentityService.listIdentities(ORG_A, identityQuery());
    expect(all.activeCount).toBe(1);
    expect(all.revokedCount).toBe(1);
    expect(all.privacyNote).toMatch(/fingerprint/i);
  });

  it("revokes, refuses a double revoke, restores, and refuses a double restore", async () => {
    const identity = await signIn(ORG_A);
    const revoked = await GoogleIdentityService.revokeIdentity(ORG_A, identity.id, "admin-1", "Left the company");
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokeReason).toBe("Left the company");
    await expect(GoogleIdentityService.revokeIdentity(ORG_A, identity.id, "admin-1")).rejects.toMatchObject({ status: 409 });

    const restored = await GoogleIdentityService.restoreIdentity(ORG_A, identity.id, "admin-1");
    expect(restored.status).toBe("active");
    expect(restored.revokedAt).toBeNull();
    await expect(GoogleIdentityService.restoreIdentity(ORG_A, identity.id, "admin-1")).rejects.toMatchObject({ status: 409 });
  });

  it("unlinks the register entry and says plainly that the user is untouched", async () => {
    const identity = await signIn(ORG_A);
    const result = await GoogleIdentityService.unlinkIdentity(ORG_A, identity.id, "admin-1");
    expect(result.unlinked).toBe(true);
    expect(result.note).toMatch(/platform user.*unchanged/i);
    await expect(GoogleIdentityService.getIdentity(ORG_A, identity.id)).rejects.toMatchObject({ status: 404 });
    const { events } = await GoogleIdentityService.listEvents(ORG_A, eventQuery({ kind: "unlink" }));
    expect(events).toHaveLength(1);
  });
});

describe("tenant isolation", () => {
  it("keeps identities invisible to another organization", async () => {
    const identity = await signIn(ORG_A);
    expect((await GoogleIdentityService.listIdentities(ORG_B, identityQuery())).total).toBe(0);
    await expect(GoogleIdentityService.getIdentity(ORG_B, identity.id)).rejects.toMatchObject({ status: 404 });
    await expect(GoogleIdentityService.revokeIdentity(ORG_B, identity.id, "admin-b")).rejects.toMatchObject({ status: 404 });
    await expect(GoogleIdentityService.unlinkIdentity(ORG_B, identity.id, "admin-b")).rejects.toMatchObject({ status: 404 });
  });

  it("keeps one organization's policy and ledger out of another's", async () => {
    await GoogleIdentityService.updatePolicy(ORG_A, policyInput({ mode: "disabled" }), "admin-a");
    await signIn(ORG_A);

    const policyB = await GoogleIdentityService.getPolicy(ORG_B);
    expect(policyB.isDefault).toBe(true);
    expect(policyB.mode).toBe("open");
    expect((await GoogleIdentityService.listEvents(ORG_B, eventQuery())).stored).toBe(0);

    // The same address in org B is a separate identity with its own history.
    const bIdentity = await signIn(ORG_B);
    expect(bIdentity.recordedSignIns).toBe(1);
  });

  it("refuses a record whose stored organization no longer matches the key", async () => {
    const identity = await signIn(ORG_A);
    // Forge a cross-tenant document under org B's key space.
    await kv.hset(
      `gid:link:i:${ORG_B}:${identity.id}`,
      "_doc",
      JSON.stringify({ ...identity, organizationId: ORG_A }),
    );
    await kv.zadd(`gid:link:idx:${ORG_B}`, Date.now(), identity.id);
    await expect(GoogleIdentityService.getIdentity(ORG_B, identity.id)).rejects.toMatchObject({ status: 404 });
    expect((await GoogleIdentityService.listIdentities(ORG_B, identityQuery())).total).toBe(0);
  });
});

describe("ledger", () => {
  it("returns newest first and filters by kind, outcome and time", async () => {
    await GoogleIdentityService.updatePolicy(ORG_A, policyInput({ mode: "open" }), "admin-1");
    await signIn(ORG_A);
    const list = await GoogleIdentityService.listEvents(ORG_A, eventQuery());
    expect(list.events[0]!.kind).toBe("sign_in");
    expect(list.stored).toBe(2);
    expect(list.ledgerNote).toMatch(/recorded/i);

    expect((await GoogleIdentityService.listEvents(ORG_A, eventQuery({ kind: "sign_in" }))).returned).toBe(1);
    expect((await GoogleIdentityService.listEvents(ORG_A, eventQuery({ outcome: "allowed" }))).returned).toBe(1);
    const future = new Date(Date.now() + 60_000).toISOString();
    expect((await GoogleIdentityService.listEvents(ORG_A, eventQuery({ since: future }))).returned).toBe(0);
  });

  it("trims to the retention limit while the per-identity counter keeps counting", async () => {
    const overflow = GOOGLE_EVENT_LIMIT + 5;
    let last = await signIn(ORG_A);
    for (let i = 1; i < overflow; i++) last = await signIn(ORG_A);

    const list = await GoogleIdentityService.listEvents(ORG_A, eventQuery({ limit: 1 }));
    expect(list.stored).toBe(GOOGLE_EVENT_LIMIT);
    expect(list.retentionLimit).toBe(GOOGLE_EVENT_LIMIT);
    // The durable counter is not truncated by ledger retention, and the two
    // numbers are reported separately rather than reconciled.
    expect(last.recordedSignIns).toBe(overflow);
  });
});

describe("configuration report", () => {
  it("passes every check for a fully configured HTTPS deployment", () => {
    const config = GoogleIdentityService.config();
    expect(config.enabled).toBe(true);
    expect(config.ready).toBe(true);
    expect(config.clientIdMasked).toBe("123456….com");
    expect(config.redirectUriIsHttps).toBe(true);
    expect(config.redirectUriPathMatches).toBe(true);
    expect(config.scopes).toEqual(["openid", "email", "profile"]);
  });

  it("never returns the client secret, only whether it is present", () => {
    const config = GoogleIdentityService.config();
    expect(config.clientSecretPresent).toBe(true);
    expect(JSON.stringify(config)).not.toContain("test-secret");
  });

  it("fails, rather than warns, when credentials are missing", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const config = GoogleIdentityService.config();
    expect(config.enabled).toBe(false);
    expect(config.ready).toBe(false);
    expect(config.checks.find((c) => c.id === "client_id")!.status).toBe("fail");
    expect(config.checks.find((c) => c.id === "client_secret")!.status).toBe("fail");
  });

  it("distinguishes loopback HTTP (a warning) from public HTTP (a failure)", () => {
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:4000/api/v1/auth/google/callback";
    expect(GoogleIdentityService.config().checks.find((c) => c.id === "redirect_uri")!.status).toBe("warn");

    process.env.GOOGLE_REDIRECT_URI = "http://oauth.example.com/api/v1/auth/google/callback";
    expect(GoogleIdentityService.config().checks.find((c) => c.id === "redirect_uri")!.status).toBe("fail");
  });

  it("flags a redirect path this API does not serve without pretending to know it is wrong", () => {
    process.env.GOOGLE_REDIRECT_URI = "https://app.windels.ai/oauth2/callback";
    const check = GoogleIdentityService.config().checks.find((c) => c.id === "redirect_path")!;
    expect(check.status).toBe("warn");
    expect(check.detail).toMatch(/proxy/i);
    expect(GoogleIdentityService.config().ready).toBe(false);
  });

  it("makes no network call to produce the report", () => {
    const fetchSpy = vi.fn(async () => { throw new Error("the configuration report must not reach the network"); });
    vi.stubGlobal("fetch", fetchSpy);
    const config = GoogleIdentityService.config();
    expect(fetchSpy).not.toHaveBeenCalled();
    // ...and it says as much in its own payload.
    expect(config.note).toMatch(/no request is made to google/i);
  });
});

describe("summary and self-service", () => {
  it("counts identities, sign-ins and domains from recorded data only", async () => {
    await signIn(ORG_A, { email: "a@windels.ai", userId: "u-a", subject: "s-a" });
    await signIn(ORG_A, { email: "b@windels.ai", userId: "u-b", subject: "s-b", provisioned: true });
    await signIn(ORG_A, { email: "c@gmail.com", userId: "u-c", subject: "s-c" });
    await GoogleIdentityService.updatePolicy(ORG_A, policyInput({ mode: "disabled" }), "admin-1");
    await GoogleIdentityService.authorizeSignIn({ organizationId: ORG_A, userId: "u-a", email: "a@windels.ai", emailVerified: true });

    const summary = await GoogleIdentityService.summary(ORG_A);
    expect(summary.identities.total).toBe(3);
    expect(summary.identities.provisionedByGoogle).toBe(1);
    expect(summary.identities.neverSignedIn).toBe(0);
    expect(summary.signIns.recorded).toBe(3);
    expect(summary.signIns.last7d).toBe(3);
    expect(summary.signIns.blocked30d).toBe(1);
    expect(summary.domains[0]).toMatchObject({ domain: "windels.ai", identities: 2, activeIdentities: 2 });
    expect(summary.policy.mode).toBe("disabled");
    expect(summary.config.enabled).toBe(true);
    expect(summary.ledgerNote).toMatch(/not estimated/i);
  });

  it("reports zeroes and nulls, not invented figures, for an untouched organization", async () => {
    const summary = await GoogleIdentityService.summary(ORG_B);
    expect(summary.identities.total).toBe(0);
    expect(summary.signIns.recorded).toBe(0);
    expect(summary.signIns.lastAt).toBeNull();
    expect(summary.ledger.oldestAt).toBeNull();
    expect(summary.domains).toEqual([]);
  });

  it("tells an unlinked user they are unlinked without inventing a decision", async () => {
    const self = await GoogleIdentityService.self(ORG_A, "user-1", "person@windels.ai");
    expect(self.linked).toBe(false);
    expect(self.identity).toBeNull();
    expect(self.decision).toBeNull();
    expect(self.signInConfigured).toBe(true);
    expect(self.startPath).toBe("/api/v1/auth/google");
  });

  it("shows a linked user their own identity and the decision that applies to it", async () => {
    await signIn(ORG_A);
    const self = await GoogleIdentityService.self(ORG_A, "user-1", "person@windels.ai");
    expect(self.linked).toBe(true);
    expect(self.identity!.email).toBe("person@windels.ai");
    expect(self.decision!.allowed).toBe(true);
    expect(self.revokeNote).toMatch(/does not delete the platform user/i);
  });

  it("lets a user revoke their own link, and refuses when they have none", async () => {
    await expect(GoogleIdentityService.revokeOwn(ORG_A, "user-1", "person@windels.ai")).rejects.toMatchObject({ status: 404 });
    await signIn(ORG_A);
    const revoked = await GoogleIdentityService.revokeOwn(ORG_A, "user-1", "person@windels.ai");
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedBy).toBe("user-1");
    expect(revoked.revokeReason).toMatch(/account holder/i);
  });
});
