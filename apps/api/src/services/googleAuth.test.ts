/**
 * Google OAuth / OpenID Connect consumer — security coverage.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `googleAuth.service.ts` accepts an ID token from an external party and, on
 * the strength of it, mints a platform session JWT and can provision a brand
 * new user, organization, and membership. The module inventory reported
 * `tests=0`: the entire trust boundary between "Google says this is
 * person@example.com" and "you are now logged in" was unverified.
 *
 * The checks that matter are the *rejections* — signature, issuer, audience,
 * nonce, expiry, email-verified, and single-use state. A test that only walks
 * the happy path would pass just as happily against an implementation that
 * skipped every one of them.
 *
 * To make the signature assertions real rather than theatrical, the suite
 * generates an actual RSA keypair, serves it as a JWKS from a stubbed
 * `fetch`, and signs tokens with it. A token signed by the *wrong* key is
 * therefore rejected by genuine RSASSA-PKCS1-v1_5 verification, not by a mock
 * that was told to return false.
 *
 * Prisma and Redis are substituted (FakePrisma / FakeKv) so no infrastructure
 * is required.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPairSync, createSign, randomUUID } from "node:crypto";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));

const { GoogleAuthService } = await import("./googleAuth.service.js");

/* ------------------------------------------------------------------ *
 * A real RSA keypair, exposed as a JWKS.
 * ------------------------------------------------------------------ */
const KID = "test-key-1";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }) as Record<string, unknown>, kid: KID, alg: "RS256", use: "sig" };

/** A second keypair used to forge tokens Google never signed. */
const attacker = generateKeyPairSync("rsa", { modulusLength: 2048 });

const CLIENT_ID = "windels-test.apps.googleusercontent.com";
const REDIRECT = "https://app.windels.ai/api/v1/auth/google/callback";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Sign a JWT with the given private key (RS256), as Google would. */
function makeIdToken(
  payload: Record<string, unknown>,
  opts: { key?: import("node:crypto").KeyObject; kid?: string } = {},
): string {
  const header = { alg: "RS256", typ: "JWT", kid: opts.kid ?? KID };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const sig = signer.sign(opts.key ?? privateKey);
  return `${signingInput}.${sig.toString("base64url")}`;
}

const now = () => Math.floor(Date.now() / 1000);

function goodClaims(over: Record<string, unknown> = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "google-sub-12345",
    email: "Person@Example.com",
    email_verified: true,
    name: "Test Person",
    exp: now() + 3600,
    iat: now(),
    ...over,
  };
}

/**
 * Stub global fetch: serve the JWKS, and return a token response carrying
 * whichever id_token the current case wants to present.
 */
let pendingIdToken: string | null = null;
let tokenEndpointStatus = 200;

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  db.reset();
  pendingIdToken = null;
  tokenEndpointStatus = 200;

  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_REDIRECT_URI = REDIRECT;

  vi.stubGlobal("fetch", vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes("googleapis.com/oauth2/v3/certs")) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("oauth2.googleapis.com/token")) {
      if (tokenEndpointStatus !== 200) {
        return new Response("upstream rejected", { status: tokenEndpointStatus });
      }
      return new Response(JSON.stringify({ id_token: pendingIdToken, access_token: "at" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch to ${u}`);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REDIRECT_URI;
});

/** Run startAuth, then drive the callback with a token built from `claims`. */
async function callbackWith(
  claims: Record<string, unknown>,
  opts: { key?: import("node:crypto").KeyObject; kid?: string; useNonce?: boolean } = {},
) {
  const { state } = await GoogleAuthService.startAuth("/app");
  const stored = JSON.parse((await kv.get(`google:state:${state}`))!) as { nonce: string };
  const payload = opts.useNonce === false ? claims : { nonce: stored.nonce, ...claims };
  pendingIdToken = makeIdToken(payload, opts);
  return GoogleAuthService.handleCallback({ code: "auth-code", state });
}

describe("configuration gate", () => {
  it("reports disabled and refuses to start when credentials are absent", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect(GoogleAuthService.enabled()).toBe(false);
    await expect(GoogleAuthService.startAuth()).rejects.toMatchObject({
      code: "GOOGLE_NOT_CONFIGURED",
    });
  });

  it("is enabled once all three variables are present", () => {
    expect(GoogleAuthService.enabled()).toBe(true);
  });
});

describe("startAuth", () => {
  it("builds a Google consent URL with the OIDC parameters", async () => {
    const { url, state } = await GoogleAuthService.startAuth("/app/dashboard");
    const u = new URL(url);

    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("state")).toBe(state);
    expect(u.searchParams.get("nonce")).toBeTruthy();
  });

  it("persists state with the nonce and the post-login redirect", async () => {
    const { state } = await GoogleAuthService.startAuth("/app/reports");
    const raw = await kv.get(`google:state:${state}`);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.redirectAfter).toBe("/app/reports");
    expect(parsed.nonce).toBeTruthy();
  });

  it("issues a distinct state and nonce per attempt (no replay across sessions)", async () => {
    const a = await GoogleAuthService.startAuth();
    const b = await GoogleAuthService.startAuth();
    expect(a.state).not.toBe(b.state);

    const na = JSON.parse((await kv.get(`google:state:${a.state}`))!).nonce;
    const nb = JSON.parse((await kv.get(`google:state:${b.state}`))!).nonce;
    expect(na).not.toBe(nb);
  });
});

describe("handleCallback — CSRF state", () => {
  it("rejects a state value that was never issued", async () => {
    await expect(
      GoogleAuthService.handleCallback({ code: "c", state: "not-a-real-state" }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("consumes state so the same callback cannot be replayed", async () => {
    const { state } = await GoogleAuthService.startAuth();
    const stored = JSON.parse((await kv.get(`google:state:${state}`))!);
    pendingIdToken = makeIdToken(goodClaims({ nonce: stored.nonce }));

    await GoogleAuthService.handleCallback({ code: "c", state });
    // Second use of the same state must fail.
    await expect(
      GoogleAuthService.handleCallback({ code: "c", state }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});

describe("handleCallback — ID token verification", () => {
  it("accepts a correctly signed token and returns a session JWT", async () => {
    const res = await callbackWith(goodClaims());
    expect(res.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(res.redirectAfter).toBe("/app");
    expect(res.isNewUser).toBe(true);
  });

  it("rejects a token signed by a key that is not Google's", async () => {
    // The forged token is structurally perfect — only the signature is wrong.
    await expect(
      callbackWith(goodClaims(), { key: attacker.privateKey }),
    ).rejects.toMatchObject({ code: "ID_TOKEN_BAD_SIG" });
  });

  it("rejects a token whose kid matches no published JWK", async () => {
    await expect(
      callbackWith(goodClaims(), { kid: "unknown-kid" }),
    ).rejects.toMatchObject({ code: "ID_TOKEN_NO_KEY" });
  });

  it("rejects a token from the wrong issuer", async () => {
    await expect(
      callbackWith(goodClaims({ iss: "https://evil.example.com" })),
    ).rejects.toMatchObject({ code: "ID_TOKEN_BAD_ISS" });
  });

  it("rejects a token minted for a different client (aud)", async () => {
    await expect(
      callbackWith(goodClaims({ aud: "someone-else.apps.googleusercontent.com" })),
    ).rejects.toMatchObject({ code: "ID_TOKEN_BAD_AUD" });
  });

  it("rejects an expired token", async () => {
    await expect(
      callbackWith(goodClaims({ exp: now() - 60 })),
    ).rejects.toMatchObject({ code: "ID_TOKEN_EXPIRED" });
  });

  it("rejects a nonce that does not match the one issued with the state", async () => {
    await expect(
      callbackWith(goodClaims({ nonce: "attacker-supplied-nonce" }), { useNonce: false }),
    ).rejects.toMatchObject({ code: "ID_TOKEN_BAD_NONCE" });
  });

  it("rejects a malformed token", async () => {
    const { state } = await GoogleAuthService.startAuth();
    pendingIdToken = "not.a-jwt";
    await expect(
      GoogleAuthService.handleCallback({ code: "c", state }),
    ).rejects.toMatchObject({ code: "BAD_ID_TOKEN" });
  });

  it("refuses an unverified Google email", async () => {
    await expect(
      callbackWith(goodClaims({ email_verified: false })),
    ).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
  });

  it("accepts an aud array that contains this client", async () => {
    const res = await callbackWith(goodClaims({ aud: ["other", CLIENT_ID] }));
    expect(res.token).toBeTruthy();
  });
});

describe("handleCallback — upstream failures", () => {
  it("surfaces a failed token exchange rather than proceeding", async () => {
    const { state } = await GoogleAuthService.startAuth();
    tokenEndpointStatus = 400;
    await expect(
      GoogleAuthService.handleCallback({ code: "bad", state }),
    ).rejects.toMatchObject({ code: "GOOGLE_TOKEN_FAILED" });
  });

  it("fails when Google returns no id_token", async () => {
    const { state } = await GoogleAuthService.startAuth();
    pendingIdToken = null;
    await expect(
      GoogleAuthService.handleCallback({ code: "c", state }),
    ).rejects.toMatchObject({ code: "GOOGLE_TOKEN_MISSING" });
  });
});

describe("account provisioning and linking", () => {
  it("normalises the email to lower case when provisioning", async () => {
    // goodClaims() deliberately uses "Person@Example.com".
    await callbackWith(goodClaims());
    const users = db.tables.get("User") ?? [];
    expect(users).toHaveLength(1);
    expect(users[0]!.email).toBe("person@example.com");
  });

  it("links a second sign-in to the existing user instead of duplicating", async () => {
    const first = await callbackWith(goodClaims());
    expect(first.isNewUser).toBe(true);

    const second = await callbackWith(goodClaims());
    expect(second.isNewUser).toBe(false);

    // Still exactly one user for that address.
    expect((db.tables.get("User") ?? []).filter((u: any) => u.email === "person@example.com")).toHaveLength(1);
  });

  it("issues a session JWT bound to the resolved user", async () => {
    const res = await callbackWith(goodClaims());
    const [, payloadB64] = res.token.split(".");
    const claims = JSON.parse(Buffer.from(payloadB64!, "base64url").toString("utf8"));
    const user = (db.tables.get("User") ?? [])[0]!;

    expect(claims.id).toBe(user.id);
    expect(claims.email).toBe("person@example.com");
    // The returned user object must agree with the token it was issued beside.
    expect(res.user.id).toBe(user.id);
    expect(res.user.organizationId).toBe(claims.organizationId);
  });

  it("signs the session JWT with the platform secret and issuer", async () => {
    const res = await callbackWith(goodClaims());
    const jwt = (await import("jsonwebtoken")).default;
    const { env } = await import("../config/env.js");

    // Verifies signature + issuer. A token signed with any other key throws.
    const verified = jwt.verify(res.token, env.JWT_SECRET, { issuer: env.JWT_ISSUER }) as Record<string, unknown>;
    expect(verified.email).toBe("person@example.com");

    expect(() => jwt.verify(res.token, "a-different-secret")).toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * Session 114 — the governance layer, exercised through the real
 * callback rather than against the service in isolation.
 *
 * These cases exist because the interesting failure is at the seam: a
 * policy that is enforced only when something remembers to call it, or a
 * ledger that is written only in a unit test, protects nobody.
 * ------------------------------------------------------------------ */
const { GoogleIdentityService } = await import("../googleAuth/googleIdentity.service.js");
const { GoogleAuthPolicyUpdateSchema, GoogleIdentityQuerySchema, GoogleEventQuerySchema } =
  await import("@windels/shared/googleAuth");

describe("Session 114 — organization policy gate", () => {
  it("records the provisioning sign-in in the new workspace's register and ledger", async () => {
    const res = await callbackWith(goodClaims());
    const org = res.user.organizationId as string;
    expect(org).toBeTruthy();

    const list = await GoogleIdentityService.listIdentities(org, GoogleIdentityQuerySchema.parse({}));
    expect(list.total).toBe(1);
    expect(list.identities[0]!.email).toBe("person@example.com");
    expect(list.identities[0]!.provisionedByGoogle).toBe(true);
    expect(list.identities[0]!.recordedSignIns).toBe(1);
    // Google's subject is fingerprinted, never stored in the clear.
    expect(list.identities[0]!.subjectFingerprint).not.toContain("google-sub-12345");

    const ledger = await GoogleIdentityService.listEvents(org, GoogleEventQuerySchema.parse({}));
    expect(ledger.events.map((e) => e.kind)).toContain("provision");
  });

  it("counts the second sign-in against the same identity instead of creating another", async () => {
    const first = await callbackWith(goodClaims());
    const org = first.user.organizationId as string;
    await callbackWith(goodClaims());

    const list = await GoogleIdentityService.listIdentities(org, GoogleIdentityQuerySchema.parse({}));
    expect(list.total).toBe(1);
    expect(list.identities[0]!.recordedSignIns).toBe(2);
  });

  it("refuses a returning user once the organization disables Google sign-in", async () => {
    const first = await callbackWith(goodClaims());
    const org = first.user.organizationId as string;
    await GoogleIdentityService.updatePolicy(
      org,
      GoogleAuthPolicyUpdateSchema.parse({ mode: "disabled" }),
      "admin-1",
    );

    await expect(callbackWith(goodClaims())).rejects.toMatchObject({
      code: "GOOGLE_SIGNIN_BLOCKED",
      outcome: "blocked_disabled",
    });

    // The refusal is visible to an administrator afterwards.
    const blocked = await GoogleIdentityService.listEvents(org, GoogleEventQuerySchema.parse({ kind: "blocked" }));
    expect(blocked.returned).toBe(1);
    expect(blocked.events[0]!.outcome).toBe("blocked_disabled");
  });

  it("refuses a returning user whose domain is not on the allowlist", async () => {
    const first = await callbackWith(goodClaims());
    const org = first.user.organizationId as string;
    await GoogleIdentityService.updatePolicy(
      org,
      GoogleAuthPolicyUpdateSchema.parse({ mode: "domain_allowlist", allowedDomains: ["windels.ai"] }),
      "admin-1",
    );

    await expect(callbackWith(goodClaims())).rejects.toMatchObject({
      code: "GOOGLE_SIGNIN_BLOCKED",
      outcome: "blocked_domain",
    });
  });

  it("refuses a returning user whose identity has been revoked", async () => {
    const first = await callbackWith(goodClaims());
    const org = first.user.organizationId as string;
    const list = await GoogleIdentityService.listIdentities(org, GoogleIdentityQuerySchema.parse({}));
    await GoogleIdentityService.revokeIdentity(org, list.identities[0]!.id, "admin-1", "Offboarded");

    await expect(callbackWith(goodClaims())).rejects.toMatchObject({
      code: "GOOGLE_SIGNIN_BLOCKED",
      outcome: "blocked_revoked",
    });
  });

  it("still admits the user after the identity is restored", async () => {
    const first = await callbackWith(goodClaims());
    const org = first.user.organizationId as string;
    const list = await GoogleIdentityService.listIdentities(org, GoogleIdentityQuerySchema.parse({}));
    await GoogleIdentityService.revokeIdentity(org, list.identities[0]!.id, "admin-1");
    await GoogleIdentityService.restoreIdentity(org, list.identities[0]!.id, "admin-1");

    const again = await callbackWith(goodClaims());
    expect(again.token).toBeTruthy();
    expect(again.isNewUser).toBe(false);
  });

  it("leaves an unconfigured deployment behaving exactly as before (default policy allows)", async () => {
    // No policy is written at any point in this case.
    const first = await callbackWith(goodClaims());
    const org = first.user.organizationId as string;
    expect((await GoogleIdentityService.getPolicy(org)).isDefault).toBe(true);
    const second = await callbackWith(goodClaims());
    expect(second.isNewUser).toBe(false);
    expect(second.token).toBeTruthy();
  });
});
