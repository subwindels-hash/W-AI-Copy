import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID, randomBytes } from "node:crypto";
import { Role as PrismaRole } from "@prisma/client";
import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/result.js";
import { Role } from "@windels/shared/permissions";
import { MfaService } from "./mfa.service.js";
import { MfaAssuranceService } from "../mfa/mfaAssurance.service.js";
import { logger } from "../config/logger.js";

// ─── Refresh Token Infrastructure ──────────────────────────────
// Refresh tokens are opaque random strings stored in Redis with TTL.
// They are rotated on every use (one-time-use pattern) to prevent replay.
//
// The TTL is read from JWT_REFRESH_TTL (default "7d") so operators can tune it
// without redeploying. Previously the env var was defined but ignored here.
function parseDurationToSeconds(value: string | undefined, fallbackDays: number): number {
  const s = (value ?? "").trim().toLowerCase();
  const m = s.match(/^(\d+)(d|h|m|s)$/);
  if (!m) return fallbackDays * 24 * 60 * 60;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === "d") return n * 24 * 60 * 60;
  if (unit === "h") return n * 60 * 60;
  if (unit === "m") return n * 60;
  return n; // seconds
}
const REFRESH_TOKEN_TTL_SECONDS = parseDurationToSeconds(env.JWT_REFRESH_TTL, 7);
const REFRESH_KEY = (tokenId: string) => `refresh:${tokenId}`;
const USER_REFRESH_KEY = (userId: string) => `refresh:user:${userId}`;

function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

async function storeRefreshToken(
  userId: string,
  organizationId: string | null,
  metadata?: { ip?: string; ua?: string },
): Promise<string> {
  const token = generateRefreshToken();
  const payload = JSON.stringify({
    userId,
    organizationId,
    ip: metadata?.ip,
    ua: metadata?.ua,
    createdAt: Date.now(),
  });
  // Store the token → payload mapping
  await redis.set(REFRESH_KEY(token), payload, "EX", REFRESH_TOKEN_TTL_SECONDS);
  // Track active refresh tokens per user (for logout-all)
  await redis.sadd(USER_REFRESH_KEY(userId), token);
  // Set expiry on the set itself (refreshed on each login)
  await redis.expire(USER_REFRESH_KEY(userId), REFRESH_TOKEN_TTL_SECONDS);
  return token;
}

async function consumeRefreshToken(
  token: string,
): Promise<{ userId: string; organizationId: string | null } | null> {
  const raw = await redis.get(REFRESH_KEY(token));
  if (!raw) return null;
  // Delete the used token (one-time use rotation)
  await redis.del(REFRESH_KEY(token));
  const payload = JSON.parse(raw) as { userId: string; organizationId: string | null };
  // Remove from user's set
  await redis.srem(USER_REFRESH_KEY(payload.userId), token);
  return payload;
}

export async function revokeAllRefreshTokens(userId: string) {
  const tokens = await redis.smembers(USER_REFRESH_KEY(userId));
  if (tokens.length) {
    const pipe = redis.multi();
    for (const t of tokens) pipe.del(REFRESH_KEY(t));
    pipe.del(USER_REFRESH_KEY(userId));
    await pipe.exec();
  }
  logger.info("revoked all refresh tokens", { userId, count: tokens.length });
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Public JWT payload always uses lowercase role strings ("user"|"admin"|"super_admin")
 * so the API boundary doesn't leak Prisma enum casing.
 */
export type PublicRole = "user" | "admin" | "super_admin";
function toPublicRole(r: PrismaRole): PublicRole {
  return r.toLowerCase() as PublicRole;
}

interface TokenPayload {
  id: string;
  email: string;
  role: PublicRole;
  organizationId: string | null;
}

function signToken(payload: TokenPayload) {
  return jwt.sign(payload, env.JWT_SECRET as jwt.Secret, {
    issuer: env.JWT_ISSUER,
    expiresIn: env.JWT_ACCESS_TTL as unknown as number,
  } as jwt.SignOptions);
}

export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw AppError.conflict("An account with this email already exists");

  // First user ever becomes super admin; subsequent users become regular users.
  const userCount = await prisma.user.count();
  const prismaRole: PrismaRole =
    userCount === 0 ? PrismaRole.SUPER_ADMIN : PrismaRole.USER;

  const passwordHash = await bcrypt.hash(input.password, 12);

  // Generate a unique org slug.
  let orgSlug = slugify(input.organizationName) || "org";
  while (await prisma.organization.findUnique({ where: { slug: orgSlug } })) {
    orgSlug = `${slugify(input.organizationName).slice(0, 40)}-${randomUUID().slice(0, 6)}`;
  }

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: prismaRole,
        emailVerifiedAt: new Date(),
        profile: { create: { displayName: input.displayName, theme: "dark" } },
      },
    });
    const org = await tx.organization.create({
      data: {
        name: input.organizationName,
        slug: orgSlug,
        workspaces: { create: { name: "Default Workspace", slug: "default" } },
      },
      include: { workspaces: true },
    });
    await tx.membership.create({
      data: {
        userId: u.id,
        organizationId: org.id,
        workspaceId: org.workspaces[0]!.id,
        role: "OWNER",
      },
    });
    await tx.auditLog.create({
      data: {
        userId: u.id,
        action: "user.register",
        resourceType: "User",
        resourceId: u.id,
        metadata: { organizationId: org.id },
      },
    });
    return u;
  });

  return { userId: user.id, role: toPublicRole(prismaRole) };
}

export async function loginUser(
  input: { email: string; password: string },
  metadata?: { ip?: string; ua?: string }
) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: {
      memberships: { take: 1, orderBy: { joinedAt: "asc" } },
      profile: true,
    },
  });
  if (!user) throw AppError.unauthorized("Invalid email or password");
  if (user.isSuspended || !user.isActive) {
    // Security audit trail — record the rejected attempt on a suspended account.
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "user.login.rejected",
        resourceType: "User",
        resourceId: user.id,
        ipAddress: metadata?.ip,
        metadata: { userAgent: metadata?.ua, reason: "suspended_or_inactive" },
      },
    }).catch(() => {});
    throw AppError.forbidden("Account is suspended");
  }

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordOk) {
    // Security audit trail — record the failed login (no account-existence leak;
    // the same generic message is returned for unknown email and wrong password).
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "user.login.failed",
        resourceType: "User",
        resourceId: user.id,
        ipAddress: metadata?.ip,
        metadata: { userAgent: metadata?.ua, reason: "invalid_password" },
      },
    }).catch(() => {});
    throw AppError.unauthorized("Invalid email or password");
  }

  const primaryMembership = user.memberships[0];
  const publicRole = toPublicRole(user.role);

  // Session 116 — organization MFA policy.
  //
  // The default policy (`optional` / `report_only`) is exactly the platform's
  // historical behaviour and always allows, so this is a no-op until an
  // administrator saves something stricter. Only `block_after_grace` refuses,
  // only once the member's grace deadline has passed, and never for an account
  // with an active exemption. An internal failure here must not take logins
  // down, so anything other than an explicit `block` lets the sign-in continue.
  try {
    const decision = await MfaAssuranceService.evaluateLogin({
      userId: user.id,
      organizationId: primaryMembership?.organizationId ?? null,
      membershipRole: primaryMembership ? String((primaryMembership as any).role ?? "MEMBER") : null,
      joinedAt: (primaryMembership as any)?.joinedAt
        ? new Date((primaryMembership as any).joinedAt).toISOString()
        : null,
    });
    if (decision.decision === "block") {
      await MfaAssuranceService.recordLoginBlocked(
        user.id,
        decision.organizationId,
        decision.reason,
      ).catch(() => {});
      throw AppError.forbidden(
        "This organization requires multi-factor authentication and the enrolment deadline has passed. Ask an administrator to grant an exemption or to lift the requirement so you can enrol.",
      );
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    logger.warn("mfa policy evaluation failed; allowing login", { err: String(e) });
  }

  // MFA challenge if enabled
  const mfaStatus = await MfaService.status(user.id);
  if (mfaStatus.enabled) {
    const challengeId = randomUUID();
    const code = randomBytes(18).toString("base64url");
    await redis.set(
      `mfa:challenge:${code}`,
      // Session 116 adds `organizationId` so the second-factor step can record
      // its outcome against the right organization ledger. Challenges issued
      // before this field existed simply carry null and land in the member's
      // own ledger only.
      JSON.stringify({
        challengeId,
        userId: user.id,
        organizationId: primaryMembership?.organizationId ?? null,
        ip: metadata?.ip,
        ua: metadata?.ua,
        createdAt: Date.now(),
      }),
      "EX", 300,
    );
    return {
      mfa_required: true,
      challengeId,
      mfaToken: code,
      user: { id: user.id, email: user.email },
    };
  }

  return issueSession(user, publicRole, primaryMembership, metadata);
}

export async function completeMfaLogin(input: { mfaToken: string; totp: string }, metadata?: { ip?: string; ua?: string }) {
  const raw = await redis.get(`mfa:challenge:${input.mfaToken}`);
  if (!raw) throw AppError.unauthorized("MFA challenge expired or invalid");
  await redis.del(`mfa:challenge:${input.mfaToken}`);
  const challenge = JSON.parse(raw) as { userId: string; organizationId?: string | null };
  const challengeOrg = challenge.organizationId ?? null;

  // Session 116 — throttle and replay guard on the login second factor.
  //
  // This path had no per-account limit at all: `rateLimit("login")` on the route
  // is per IP, which a distributed caller walks past, and a 6-digit code with a
  // ±1 drift window is three live codes in a million. The gate also refuses a
  // TOTP that already verified inside its live window (RFC 6238 §5.2).
  const gate = await MfaAssuranceService.gate({
    userId: challenge.userId,
    organizationId: challengeOrg,
    token: input.totp,
  });
  if (!gate.allowed) {
    await MfaAssuranceService.recordBlocked({
      userId: challenge.userId,
      organizationId: challengeOrg,
      reason: gate.reason,
    }).catch(() => {});
    if (gate.reason === "locked") {
      throw AppError.tooManyRequests(
        `Too many failed verification attempts. Try again in ${gate.lock.retryAfterSeconds}s.`,
      );
    }
    throw AppError.unauthorized(gate.message ?? "Verification refused");
  }

  const v = await MfaService.verify(challenge.userId, input.totp);
  await MfaAssuranceService.recordVerification({
    userId: challenge.userId,
    organizationId: challengeOrg,
    token: input.totp,
    ok: v.ok,
    method: v.method ?? null,
    reason: v.reason ?? null,
  }).catch(() => {});
  if (!v.ok) throw AppError.unauthorized("Invalid MFA code: " + (v.reason || "unknown"));
  const user = await prisma.user.findUnique({
    where: { id: challenge.userId },
    include: { memberships: { take: 1, orderBy: { joinedAt: "asc" } }, profile: true },
  });
  if (!user) throw AppError.unauthorized("User no longer exists");
  if (user.isSuspended || !user.isActive) throw AppError.forbidden("Account is suspended");
  const primaryMembership = user.memberships[0];
  const publicRole = toPublicRole(user.role);
  return issueSession(user, publicRole, primaryMembership, metadata);
}

async function issueSession(
  user: any,
  publicRole: PublicRole,
  primaryMembership: any,
  metadata?: { ip?: string; ua?: string },
) {
  const tokenPayload: TokenPayload = {
    id: user.id,
    email: user.email,
    role: publicRole,
    organizationId: primaryMembership?.organizationId ?? null,
  };
  const token = signToken(tokenPayload);
  // Generate and store a refresh token (opaque, one-time-use, Redis-backed)
  const refreshToken = await storeRefreshToken(
    user.id,
    primaryMembership?.organizationId ?? null,
    metadata,
  );
  prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "user.login",
        resourceType: "User",
        resourceId: user.id,
        ipAddress: metadata?.ip,
        metadata: { userAgent: metadata?.ua },
      },
    }),
  ]).catch(() => {});
  return {
    token,
    refreshToken,
    expiresIn: 900, // 15 minutes in seconds — client should refresh before this
    user: {
      id: user.id,
      email: user.email,
      role: publicRole,
      displayName: user.profile?.displayName ?? null,
      organizationId: primaryMembership?.organizationId ?? null,
    },
  };
}

/**
 * Refresh an access token using a valid refresh token.
 * Rotates the refresh token (one-time-use) and issues a new access token.
 */
export async function refreshAccessToken(
  input: { refreshToken: string },
  metadata?: { ip?: string; ua?: string },
) {
  const consumed = await consumeRefreshToken(input.refreshToken);
  if (!consumed) throw AppError.unauthorized("Invalid or expired refresh token");

  // Verify user still exists and is active
  const user = await prisma.user.findUnique({
    where: { id: consumed.userId },
    include: { memberships: { take: 1, orderBy: { joinedAt: "asc" } }, profile: true },
  });
  if (!user) throw AppError.unauthorized("User no longer exists");
  if (user.isSuspended || !user.isActive) throw AppError.forbidden("Account is suspended");

  const publicRole = toPublicRole(user.role);
  const primaryMembership = user.memberships[0];
  return issueSession(user, publicRole, primaryMembership, metadata);
}

/**
 * Logout — revoke a specific refresh token (or all tokens for the user).
 */
export async function logoutUser(input: { refreshToken?: string; userId: string }) {
  if (input.refreshToken) {
    // Revoke just this token
    await redis.del(REFRESH_KEY(input.refreshToken));
    await redis.srem(USER_REFRESH_KEY(input.userId), input.refreshToken);
  } else {
    // Revoke all tokens for this user (logout everywhere)
    await revokeAllRefreshTokens(input.userId);
  }
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: "user.logout",
      resourceType: "User",
      resourceId: input.userId,
      metadata: { allSessions: !input.refreshToken },
    },
  }).catch(() => {});
}

// ─── Password Reset Infrastructure ───────────────────────────────
// Reset tokens are opaque random strings stored in Redis with a short TTL
// (default 1 hour). They are single-use and revoked on use. A generic email
// body is sent regardless of whether the email exists (no account enumeration).

const PASSWORD_RESET_TTL_SECONDS = Number(process.env.PASSWORD_RESET_TTL_SECONDS ?? 3600);
const PASSWORD_RESET_KEY = (token: string) => `pwdreset:${token}`;
const USER_PASSWORD_RESET_KEY = (userId: string) => `pwdreset:user:${userId}`;

export interface PasswordResetRequestResult {
  ok: boolean;
  /** Always present (true even when no account) to avoid account enumeration. */
  email: string;
  /** True only when an account was found and an email was (attempted to be) sent. */
  sent: boolean;
  /** When true, delivery was skipped because SMTP is not configured. */
  smtpConfigured: boolean;
}

export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    // Fail-open: identical response whether or not the account exists.
    return { ok: true, email: normalized, sent: false, smtpConfigured: Boolean(process.env.WINDELS_SMTP_HOST) };
  }

  const token = randomBytes(32).toString("base64url");
  const payload = JSON.stringify({ userId: user.id, createdAt: Date.now() });
  await redis.set(PASSWORD_RESET_KEY(token), payload, "EX", PASSWORD_RESET_TTL_SECONDS);
  await redis.sadd(USER_PASSWORD_RESET_KEY(user.id), token);
  await redis.expire(USER_PASSWORD_RESET_KEY(user.id), PASSWORD_RESET_TTL_SECONDS);

  // Audit the request (do not log the token).
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "user.password_reset_requested",
      resourceType: "User",
      resourceId: user.id,
      metadata: { via: "web" },
    },
  }).catch(() => {});

  try {
    const { EmailService } = await import("../sitePlatform/sitePlatform.service.js");
    const creds = await EmailService.getActiveProvider();
    if (!creds) {
      logger.warn("[auth] SMTP not configured — password reset email skipped", { userId: user.id });
      return { ok: true, email: normalized, sent: false, smtpConfigured: false };
    }
    const resetUrl = `${process.env.WINDELS_WEB_ORIGIN ?? "http://localhost:5173"}/auth/reset?token=${token}`;
    const sent = await EmailService.sendTemplate("password_reset", normalized, { resetUrl });
    logger.info("[auth] password reset email attempted", { userId: user.id, sent: sent.sent });
    return { ok: true, email: normalized, sent: sent.sent, smtpConfigured: true };
  } catch (err) {
    logger.warn("[auth] password reset email send failed", { userId: user.id, err: (err as Error)?.message });
    return { ok: true, email: normalized, sent: false, smtpConfigured: true };
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
  const raw = await redis.get(PASSWORD_RESET_KEY(token));
  if (!raw) throw AppError.badRequest("Invalid or expired password reset token");
  let payload: { userId: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    throw AppError.badRequest("Invalid or expired password reset token");
  }
  const { userId } = payload;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.badRequest("Invalid or expired password reset token");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  // Single-use: consume the token and revoke all active sessions.
  await redis.del(PASSWORD_RESET_KEY(token));
  await redis.srem(USER_PASSWORD_RESET_KEY(user.id), token);
  await revokeAllRefreshTokens(user.id);

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "user.password_reset",
      resourceType: "User",
      resourceId: user.id,
      metadata: { via: "web" },
    },
  }).catch(() => {});

  return { ok: true };
}
