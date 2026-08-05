/**
 * Session 1 — Auth Foundation: registration, login, refresh-token rotation,
 * logout, and the security/audit behaviour of the identity boundary.
 *
 * Runs against the in-memory FakePrisma + FakeKv, so no Postgres or Redis is
 * required. bcrypt is exercised for real (a single precomputed hash is reused
 * to keep the suite fast). These tests exist because the core Session 1 auth
 * service previously shipped with no unit coverage at all — only the later
 * Google OAuth and mobile-auth helpers were tested.
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
// The generated Prisma client is not present in the test sandbox, so the Role
// enum import is mocked with the schema's values (auth.service converts to
// lowercase public roles itself).
vi.mock("@prisma/client", () => ({
  Role: { USER: "USER", ADMIN: "ADMIN", SUPER_ADMIN: "SUPER_ADMIN" },
}));

const {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  revokeAllRefreshTokens,
} = await import("./auth.service.js");
const { MfaService } = await import("./mfa.service.js");

const PASSWORD = "CorrectHorseBatteryStaple!9";
let HASH: string;
let adminHash: string;

beforeAll(async () => {
  // Cost 10 (lighter than prod's 12) purely to keep the test suite fast.
  HASH = await bcrypt.hash(PASSWORD, 10);
  adminHash = await bcrypt.hash("AdminPass!2026", 10);
});

beforeEach(() => {
  db.reset();
  kv.strings.clear(); kv.sets.clear(); kv.hashes.clear(); kv.lists.clear(); kv.zsets.clear();
});

/** loginUser returns a union (MFA-challenge vs. full session); the tests below
 * only exercise one branch at a time, so widen to `any` to keep the suite's
 * assertions readable. */
async function doLogin(email: string, password: string): Promise<any> {
  return loginUser({ email, password });
}

/** Convenience: seed a user + profile + membership rows directly. */
function seedUser(opts: {
  id: string;
  email: string;
  passwordHash?: string;
  role?: string;
  orgId?: string;
  suspended?: boolean;
}) {
  const uid = opts.id;
  db.seed("User", [{
    id: uid,
    email: opts.email,
    passwordHash: opts.passwordHash ?? HASH,
    role: opts.role ?? "USER",
    isActive: true,
    isSuspended: opts.suspended ?? false,
    emailVerifiedAt: new Date(),
  }]);
  if (opts.orgId) {
    db.seed("Organization", [{ id: opts.orgId, name: "Org", slug: `org-${opts.orgId}` }]);
    db.seed("Membership", [{
      id: `m-${uid}`,
      userId: uid,
      organizationId: opts.orgId,
      workspaceId: null,
      role: "MEMBER",
    }]);
  }
}

describe("registerUser", () => {
  it("creates user, profile, org, default workspace, OWNER membership and an audit log; first user becomes super_admin", async () => {
    const result = await registerUser({
      email: "alice@example.com",
      password: PASSWORD,
      displayName: "Alice",
      organizationName: "Acme Corp",
    });
    expect(result.role).toBe("super_admin");

    const user = await db.client().user.findUnique({ where: { email: "alice@example.com" } });
    expect(user).not.toBeNull();
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.passwordHash).not.toBe(PASSWORD); // hashed, not plaintext

    const profile = await db.client().userProfile.findUnique({ where: { userId: user.id } });
    expect(profile?.displayName).toBe("Alice");

    const org = await db.client().organization.findFirst({ include: { workspaces: true } });
    expect(org?.name).toBe("Acme Corp");
    expect(org?.slug).toBe("acme-corp");
    expect(org?.workspaces).toHaveLength(1);
    expect(org?.workspaces[0]?.name).toBe("Default Workspace");

    const membership = await db.client().membership.findFirst({ where: { userId: user.id } });
    expect(membership?.role).toBe("OWNER");
    expect(membership?.organizationId).toBe(org.id);

    const audit = await db.client().auditLog.findMany({ where: { userId: user.id } });
    expect(audit.some((a) => a.action === "user.register")).toBe(true);
  });

  it("promotes only the first user; a second registration is a regular USER", async () => {
    await registerUser({ email: "first@example.com", password: PASSWORD, displayName: "First", organizationName: "One" });
    const second = await registerUser({ email: "second@example.com", password: PASSWORD, displayName: "Second", organizationName: "Two" });
    expect(second.role).toBe("user");
  });

  it("rejects a duplicate email with CONFLICT", async () => {
    await registerUser({ email: "dup@example.com", password: PASSWORD, displayName: "D", organizationName: "O" });
    await expect(
      registerUser({ email: "dup@example.com", password: PASSWORD, displayName: "D2", organizationName: "O2" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("loginUser", () => {
  it("issues an access + refresh token and records login audit + lastLoginAt", async () => {
    seedUser({ id: "u1", email: "u@example.com", role: "ADMIN", orgId: "org1" });
    const session: any = await doLogin("u@example.com", PASSWORD);
    expect(session.token).toBeTruthy();
    expect(session.refreshToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(session.expiresIn).toBe(900);
    expect(session.user.role).toBe("admin");
    expect(session.user.organizationId).toBe("org1");

    const audit = await db.client().auditLog.findMany({ where: { action: "user.login" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.userId).toBe("u1");
    const user = await db.client().user.findUnique({ where: { id: "u1" } });
    expect(user.lastLoginAt).not.toBeNull();
  });

  it("returns a generic error (no account enumeration) for a wrong password", async () => {
    seedUser({ id: "u1", email: "u@example.com", orgId: "org1" });
    await expect(loginUser({ email: "u@example.com", password: "WrongPassword!1" })).rejects.toThrow("Invalid email or password");
  });

  it("returns the same generic error for an unknown email (no enumeration)", async () => {
    await expect(loginUser({ email: "nobody@example.com", password: PASSWORD })).rejects.toThrow("Invalid email or password");
  });

  it("rejects a suspended account and records a user.login.rejected audit entry", async () => {
    seedUser({ id: "u1", email: "u@example.com", orgId: "org1", suspended: true });
    await expect(loginUser({ email: "u@example.com", password: PASSWORD })).rejects.toThrow("Account is suspended");
    const audit = await db.client().auditLog.findMany({ where: { action: "user.login.rejected" } });
    expect(audit).toHaveLength(1);
  });

  it("records user.login.failed on a bad password", async () => {
    seedUser({ id: "u1", email: "u@example.com", orgId: "org1" });
    await expect(loginUser({ email: "u@example.com", password: "WrongPassword!1" })).rejects.toThrow();
    const audit = await db.client().auditLog.findMany({ where: { action: "user.login.failed" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.userId).toBe("u1");
  });

  it("requires an MFA challenge when the user has MFA enabled", async () => {
    seedUser({ id: "u1", email: "u@example.com", orgId: "org1" });
    await MfaService.enable("u1", "SECRETSECRETSECRETSECRETSECRET");
    const res: any = await doLogin("u@example.com", PASSWORD);
    expect(res.mfa_required).toBe(true);
    expect(res.mfaToken).toBeTruthy();
    // No session issued yet
    expect(res.token).toBeUndefined();
  });
});

describe("refreshAccessToken (one-time rotation)", () => {
  it("rotates the refresh token on every use and rejects a replayed token", async () => {
    seedUser({ id: "u1", email: "u@example.com", orgId: "org1" });
    const first: any = await doLogin("u@example.com", PASSWORD);
    const refresh1 = first.refreshToken;

    const rotated = await refreshAccessToken({ refreshToken: refresh1 });
    expect(rotated.token).toBeTruthy();
    expect(rotated.refreshToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(refresh1);

    // Replaying the consumed token must fail (one-time use).
    await expect(refreshAccessToken({ refreshToken: refresh1 })).rejects.toThrow("Invalid or expired refresh token");
  });

  it("rejects an unknown/expired refresh token", async () => {
    await expect(refreshAccessToken({ refreshToken: "definitely-not-a-real-token-value" })).rejects.toThrow("Invalid or expired refresh token");
  });
});

describe("logoutUser / revokeAllRefreshTokens", () => {
  it("revokes a single refresh token on logout", async () => {
    seedUser({ id: "u1", email: "u@example.com", orgId: "org1" });
    const session: any = await doLogin("u@example.com", PASSWORD);
    await logoutUser({ userId: "u1", refreshToken: session.refreshToken });
    await expect(refreshAccessToken({ refreshToken: session.refreshToken })).rejects.toThrow("Invalid or expired refresh token");
  });

  it("revokeAllRefreshTokens invalidates every active session", async () => {
    seedUser({ id: "u1", email: "u@example.com", orgId: "org1" });
    const s1: any = await doLogin("u@example.com", PASSWORD);
    const s2: any = await doLogin("u@example.com", PASSWORD);
    await revokeAllRefreshTokens("u1");
    await expect(refreshAccessToken({ refreshToken: s1.refreshToken })).rejects.toThrow("Invalid or expired refresh token");
    await expect(refreshAccessToken({ refreshToken: s2.refreshToken })).rejects.toThrow("Invalid or expired refresh token");
  });
});
