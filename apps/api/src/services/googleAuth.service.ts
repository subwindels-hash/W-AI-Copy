/**
 * Google OAuth login service (OpenID Connect consumer).
 *
 * Implements consumer Gmail/Google-account sign-in (not enterprise SSO).
 * - OAuth state + nonce for CSRF protection (stored in Redis, 10-min TTL).
 * - ID-token verification via Google's public JWKS (no client secret exposed in browser).
 * - Account linking: if Google email matches an existing user, link accounts;
 *   otherwise provision a new user/organization/membership.
 * - Returns the platform JWT (same schema as email/password login) so the
 *   frontend treats it identically after callback.
 *
 * Configuration:
 *   GOOGLE_CLIENT_ID     (required)
 *   GOOGLE_CLIENT_SECRET (required for token exchange)
 *   GOOGLE_REDIRECT_URI  (required — must be whitelisted in Google Cloud Console)
 *
 * When GOOGLE_CLIENT_ID is missing, init() returns `enabled=false` and the
 * authorization endpoint responds 503 "PLATFORM CREDENTIALS REQUIRED" instead
 * of pretending OAuth works.
 */
import { randomBytes, createHash } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { GoogleIdentityService } from "../googleAuth/googleIdentity.service.js";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import type { Role } from "@prisma/client";
import jwt from "jsonwebtoken";

const STATE_TTL = 600; // 10 min
const K = { state: (s: string) => `google:state:${s}` };

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function cfg(): GoogleAuthConfig | null {
  const cid = process.env.GOOGLE_CLIENT_ID;
  const cs = process.env.GOOGLE_CLIENT_SECRET;
  const ru = process.env.GOOGLE_REDIRECT_URI;
  if (!cid || !cs || !ru) return null;
  return { clientId: cid, clientSecret: cs, redirectUri: ru };
}

export const GoogleAuthService = {
  enabled(): boolean { return cfg() !== null; },

  /** Build the authorization URL and persist an opaque state token. */
  async startAuth(redirectAfter?: string): Promise<{ url: string; state: string }> {
    const c = cfg();
    if (!c) throw Object.assign(new Error("Google OAuth not configured"), { code: "GOOGLE_NOT_CONFIGURED" });
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  await redis.set(
    K.state(state),
    JSON.stringify({ nonce, redirectAfter: redirectAfter ?? "/", createdAt: Date.now() }),
    "EX", STATE_TTL,
  );
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    access_type: "online",
    prompt: "select_account",
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, state };
},

  /** Exchange code for tokens, verify ID token, create/link account, return session JWT. */
  async handleCallback(input: { code: string; state: string }): Promise<{ token: string; user: any; redirectAfter: string; isNewUser: boolean }> {
    const c = cfg();
    if (!c) throw Object.assign(new Error("Google OAuth not configured"), { code: "GOOGLE_NOT_CONFIGURED" });

    const stateRaw = await redis.get(K.state(input.state));
    if (!stateRaw) throw Object.assign(new Error("Invalid or expired OAuth state"), { code: "INVALID_STATE" });
    await redis.del(K.state(input.state));
    const state = JSON.parse(stateRaw) as { nonce: string; redirectAfter: string };

    // Exchange authorization code for tokens
    const tokRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: c.clientId,
        client_secret: c.clientSecret,
        redirect_uri: c.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!tokRes.ok) {
      const t = await tokRes.text().catch(() => "");
      throw Object.assign(new Error(`Google token exchange failed: HTTP ${tokRes.status} ${t.slice(0, 200)}`), { code: "GOOGLE_TOKEN_FAILED" });
    }
    const tokens = await tokRes.json() as { id_token?: string; access_token?: string };
    if (!tokens.id_token) throw Object.assign(new Error("No id_token in Google response"), { code: "GOOGLE_TOKEN_MISSING" });

    // Decode + verify ID token against Google's JWKS (lite; validates signature, iss, aud, exp, nonce).
    const claims = await verifyGoogleIdToken(tokens.id_token, c.clientId, state.nonce);
    if (!claims.email_verified) throw Object.assign(new Error("Google account email not verified"), { code: "EMAIL_NOT_VERIFIED" });
    const email = claims.email.toLowerCase();
    const displayName = claims.name || email.split("@")[0];
    const picture = claims.picture || null;

    // Link or create
    let existing = await prisma.user.findUnique({ where: { email }, include: { memberships: { take: 1, orderBy: { joinedAt: "asc" } }, profile: true } });

    // Session 114 — organization policy gate.
    //
    // Only applicable once the account resolves to a member of an organization:
    // a brand-new Google account belongs to no organization at this point and
    // provisions its own workspace below, which is why no policy can gate it.
    // With no stored policy the default is `open`, so a deployment that never
    // configures one behaves exactly as it did before this gate existed.
    // A refusal is written to that organization's ledger by `authorizeSignIn`.
    const gatedOrgId = existing?.memberships?.[0]?.organizationId ?? null;
    if (gatedOrgId) {
      const decision = await GoogleIdentityService.authorizeSignIn({
        organizationId: gatedOrgId,
        userId: existing!.id,
        email,
        emailVerified: true,
      });
      if (!decision.allowed) {
        throw Object.assign(new Error(decision.reason), {
          code: "GOOGLE_SIGNIN_BLOCKED",
          outcome: decision.outcome,
        });
      }
    }

    let isNewUser = false;
    let userId = existing?.id;
    let primaryMembership = existing?.memberships?.[0];
    let profile = existing?.profile;
    if (!existing) {
      isNewUser = true;
      const userCount = await prisma.user.count();
      const role: Role = userCount === 0 ? "SUPER_ADMIN" : "USER";
      const orgName = `${displayName}'s Workspace`;
      const result = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            email,
            passwordHash: "__google_oauth__",
            role,
            emailVerifiedAt: new Date(),
            profile: { create: { displayName, avatarUrl: picture, theme: "dark" } },
          },
        });
        const orgSlug = `org-${randomBytes(4).toString("hex")}`;
        const org = await tx.organization.create({
          data: { name: orgName, slug: orgSlug, workspaces: { create: { name: "Default Workspace", slug: "default" } } },
          include: { workspaces: true },
        });
        const membership = await tx.membership.create({
          data: { userId: u.id, organizationId: org.id, workspaceId: org.workspaces[0]!.id, role: "OWNER" },
        });
        await tx.auditLog.create({
          data: { userId: u.id, action: "user.register.google", resourceType: "User", resourceId: u.id, metadata: { provider: "google", sub: claims.sub } },
        });
        return { user: u, membership };
      });
      userId = result.user.id;
      primaryMembership = result.membership;
      profile = null;
    } else {
      await prisma.auditLog.create({
        data: { userId: existing.id, action: "user.login.google", resourceType: "User", resourceId: existing.id, metadata: { provider: "google", sub: claims.sub } },
      }).catch(() => {});
    }
    if (!userId) throw Object.assign(new Error("Failed to resolve user after Google auth"), { code: "USER_RESOLVE_FAILED" });
    const publicRole = (existing?.role ?? (isNewUser ? (await prisma.user.findUnique({ where: { id: userId } }))?.role : "USER") as string).toLowerCase() as "user"|"admin"|"super_admin";
    const token = jwt.sign(
      { id: userId, email, role: publicRole, organizationId: primaryMembership?.organizationId ?? null },
      env.JWT_SECRET as jwt.Secret,
      { issuer: env.JWT_ISSUER, expiresIn: env.JWT_ACCESS_TTL as unknown as number } as jwt.SignOptions,
    );
    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }).catch(() => {});

    // Session 114 — record the completed sign-in in the organization's Google
    // identity register and ledger. Best effort on purpose: the session has
    // already been authorized above, and losing an audit row must not lock a
    // legitimate user out. A failure here leaves the previous register entry
    // untouched rather than writing a partial one.
    const ledgerOrgId = primaryMembership?.organizationId ?? null;
    if (ledgerOrgId) {
      await GoogleIdentityService.recordSignIn({
        organizationId: ledgerOrgId,
        userId,
        email,
        subject: claims.sub,
        displayName,
        provisioned: isNewUser,
      }).catch(() => { /* ledger write failure must not fail an authorized login */ });
    }

    return {
      token,
      user: { id: userId, email, role: publicRole, displayName: profile?.displayName ?? displayName, organizationId: primaryMembership?.organizationId ?? null },
      redirectAfter: state.redirectAfter,
      isNewUser,
    };
  },
};

// ── ID-token verification (Google JWKS) ─────────────────────────────────
let _certsCache: { keys: any[]; fetchedAt: number } | null = null;
async function fetchGoogleCerts(): Promise<any[]> {
  if (_certsCache && Date.now() - _certsCache.fetchedAt < 3600_000) return _certsCache.keys;
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Failed to fetch Google JWKS: ${res.status}`);
  const j = await res.json() as { keys: any[] };
  _certsCache = { keys: j.keys, fetchedAt: Date.now() };
  return j.keys;
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

async function verifyGoogleIdToken(idToken: string, expectedAud: string, expectedNonce?: string): Promise<{ sub: string; email: string; email_verified: boolean; name?: string; picture?: string; iss: string; aud: string; exp: number; nonce?: string }> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw Object.assign(new Error("Malformed ID token"), { code: "BAD_ID_TOKEN" });
  const header = JSON.parse(b64urlDecode(parts[0]).toString("utf8"));
  const payload = JSON.parse(b64urlDecode(parts[1]).toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw Object.assign(new Error("ID token expired"), { code: "ID_TOKEN_EXPIRED" });
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") throw Object.assign(new Error("Bad iss"), { code: "ID_TOKEN_BAD_ISS" });
  if (payload.aud !== expectedAud && !(Array.isArray(payload.aud) && payload.aud.includes(expectedAud))) throw Object.assign(new Error("Bad aud"), { code: "ID_TOKEN_BAD_AUD" });
  if (expectedNonce && payload.nonce !== expectedNonce) throw Object.assign(new Error("Nonce mismatch"), { code: "ID_TOKEN_BAD_NONCE" });
  // Cryptographic signature verification using node's crypto (RS256 with Google JWKS)
  const keys = await fetchGoogleCerts();
  const key = keys.find((k) => k.kid === header.kid && k.alg === "RS256");
  if (!key) throw Object.assign(new Error("No matching Google JWK"), { code: "ID_TOKEN_NO_KEY" });
  // We import via crypto.webcrypto.subtle (available in node 20)
  const cryptoKey = await (globalThis as any).crypto.subtle.importKey(
    "jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
  );
  const signingInput = Buffer.from(parts[0] + "." + parts[1]);
  const sigBuf = b64urlDecode(parts[2]);
  const ok = await (globalThis as any).crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sigBuf, signingInput);
  if (!ok) throw Object.assign(new Error("ID token signature verification failed"), { code: "ID_TOKEN_BAD_SIG" });
  return payload;
}
