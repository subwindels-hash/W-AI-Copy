import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID, randomBytes } from "node:crypto";
import { Prisma, Role as PrismaRole } from "@prisma/client";
import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/result.js";
import { Role } from "@windels/shared/permissions";
import { MfaService } from "./mfa.service.js";
import { logger } from "../config/logger.js";

// ─── Refresh Token Infrastructure ──────────────────────────────
// Refresh tokens are opaque random strings stored in Redis with TTL.
// They are rotated on every use (one-time-use pattern) to prevent replay.
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
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

function signRefreshJwt(payload: TokenPayload) {
  // This is a signed JWT used only for refresh — it carries the same claims
  // but with a longer TTL. The opaque random token stored in Redis is the
  // primary mechanism; this signed JWT is an additional layer for stateless
  // verification when needed (e.g. offline/mobile).
  return jwt.sign(payload, env.JWT_SECRET as jwt.Secret, {
    issuer: env.JWT_ISSUER,
    expiresIn: env.JWT_REFRESH_TTL as unknown as number,
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
  if (user.isSuspended || !user.isActive) throw AppError.forbidden("Account is suspended");

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordOk) throw AppError.unauthorized("Invalid email or password");

  const primaryMembership = user.memberships[0];
  const publicRole = toPublicRole(user.role);

  // MFA challenge if enabled
  const mfaStatus = await MfaService.status(user.id);
  if (mfaStatus.enabled) {
    const challengeId = randomUUID();
    const code = randomBytes(18).toString("base64url");
    await redis.set(
      `mfa:challenge:${code}`,
      JSON.stringify({ challengeId, userId: user.id, ip: metadata?.ip, ua: metadata?.ua, createdAt: Date.now() }),
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
  const challenge = JSON.parse(raw) as { userId: string };
  const v = await MfaService.verify(challenge.userId, input.totp);
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
