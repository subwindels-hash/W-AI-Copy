/**
 * Account identity: public 6-digit User ID, unique username, hashed 4-digit PIN.
 * PINs expire after 24 hours (server clock). Hashes and PINs never leave this module.
 */
import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { assessPassword } from "../security/passwords.js";
import { logger } from "../config/logger.js";
import { PIN_REVEAL_TTL_SECONDS, PIN_TTL_MS } from "@windels/shared/account";
import type { AccountSnapshot, IssuedPinResult } from "@windels/shared/account";
import type { PublicRole } from "./auth.service.js";

const EMAIL_CHANGE_TTL = 3600;
const EMAIL_CHANGE_KEY = (token: string) => `emailchange:${token}`;
const PIN_REVEAL_KEY = (userId: string) => `pinreveal:${userId}`;

export function pinStatusOf(user: { pinHash?: string | null; pinExpiresAt?: Date | string | null }): {
  pinSet: boolean;
  pinExpired: boolean;
  pinExpiresAt: string | null;
} {
  const expires = user.pinExpiresAt ? new Date(user.pinExpiresAt).toISOString() : null;
  if (!user.pinHash) return { pinSet: false, pinExpired: true, pinExpiresAt: null };
  const expired = !user.pinExpiresAt || Date.parse(String(user.pinExpiresAt)) <= Date.now();
  return { pinSet: true, pinExpired: expired, pinExpiresAt: expires };
}

export function normalizeUsername(raw: string): string {
  return raw.toLowerCase().trim().replace(/[^a-z0-9._-]+/g, "").slice(0, 30);
}

export function validateUsername(raw: string): string {
  const n = normalizeUsername(raw);
  if (n.length < 3 || n.length > 30) throw AppError.validation("Username must be 3–30 characters");
  if (!/^[a-z0-9._-]+$/.test(n)) throw AppError.validation("Username may contain letters, numbers, dots, underscores and hyphens");
  return n;
}

export function validatePin(pin: string): string {
  if (!/^\d{4}$/.test(pin)) throw AppError.validation("PIN must be exactly 4 digits");
  return pin;
}

/** Cryptographically random 4-digit PIN. Never user-selected. */
export function generateSystemPin(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

async function storePinReveal(userId: string, pin: string): Promise<void> {
  await redis.set(PIN_REVEAL_KEY(userId), pin, "EX", PIN_REVEAL_TTL_SECONDS);
}

/** Called from register after the hashed PIN is already written. */
export async function storeIssuedPinAfterRegister(userId: string, pin: string, expiresAt: Date): Promise<void> {
  await storePinReveal(userId, pin);
  const delivery = await deliverPinEmail(userId, pin, expiresAt);
  await prisma.auditLog.create({
    data: {
      userId,
      action: "user.account.pin_issued",
      resourceType: "User",
      resourceId: userId,
      metadata: { reason: "register", expiresAt: expiresAt.toISOString(), deliveredByEmail: delivery.sent },
    },
  }).catch(() => {});
}

export async function peekPinIssuedPending(userId: string): Promise<boolean> {
  const raw = await redis.get(PIN_REVEAL_KEY(userId));
  return Boolean(raw);
}

export async function consumeIssuedPin(userId: string): Promise<string | null> {
  const pin = await redis.get(PIN_REVEAL_KEY(userId));
  if (!pin) return null;
  await redis.del(PIN_REVEAL_KEY(userId));
  return pin;
}

async function deliverPinEmail(userId: string, pin: string, expiresAt: Date): Promise<{ smtpConfigured: boolean; sent: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { smtpConfigured: false, sent: false };
  try {
    const { EmailService } = await import("../sitePlatform/sitePlatform.service.js");
    const creds = await EmailService.getActiveProvider();
    if (!creds) return { smtpConfigured: false, sent: false };
    const sent = await EmailService.sendEmail({
      to: user.email,
      subject: "Your WINDELS security PIN",
      text: [
        "WINDELS generated a new 4-digit security PIN for your account.",
        "",
        `PIN: ${pin}`,
        `Expires: ${expiresAt.toISOString()} (24 hours from issue, server clock).`,
        "",
        "Do not share this PIN. It will not be shown again after you view it once in My Account.",
        "If you did not expect this message, contact an administrator.",
      ].join("\n"),
    });
    return { smtpConfigured: true, sent: Boolean((sent as any)?.sent ?? sent) };
  } catch (e) {
    logger.warn("[account] PIN email delivery failed", { userId, err: (e as Error)?.message });
    return { smtpConfigured: true, sent: false };
  }
}

/**
 * System-issued PIN: generate, bcrypt-hash, 24h expiry, one-time Redis reveal.
 * The plaintext PIN never lands in the User row, logs, or later API reads.
 */
export async function applySystemPin(
  userId: string,
  reason: "register" | "rotate" | "missing",
): Promise<IssuedPinResult> {
  const pin = generateSystemPin();
  const pinHash = await bcrypt.hash(pin, 12);
  const pinSetAt = new Date();
  const pinExpiresAt = new Date(pinSetAt.getTime() + PIN_TTL_MS);
  await prisma.user.update({
    where: { id: userId },
    data: { pinHash, pinSetAt, pinExpiresAt } as any,
  });
  await storePinReveal(userId, pin);
  const delivery = await deliverPinEmail(userId, pin, pinExpiresAt);
  await prisma.auditLog.create({
    data: {
      userId,
      action: reason === "register" ? "user.account.pin_issued" : "user.account.pin_rotated",
      resourceType: "User",
      resourceId: userId,
      metadata: { reason, expiresAt: pinExpiresAt.toISOString(), deliveredByEmail: delivery.sent },
    },
  }).catch(() => {});
  logger.info("[account] system PIN issued", { userId, reason, expiresAt: pinExpiresAt.toISOString(), deliveredByEmail: delivery.sent });
  const account = await getAccount(userId);
  return {
    account,
    issuedPin: pin,
    deliveredByEmail: delivery.sent,
    smtpConfigured: delivery.smtpConfigured,
    expiresAt: pinExpiresAt.toISOString(),
  };
}

/** Assign or rotate the PIN when it is missing or past server-clock expiry. */
export async function ensureCurrentPin(userId: string): Promise<{ rotated: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound("User not found");
  const status = pinStatusOf(user as any);
  if (!status.pinSet) {
    await applySystemPin(userId, "missing");
    return { rotated: true };
  }
  if (status.pinExpired) {
    await applySystemPin(userId, "rotate");
    return { rotated: true };
  }
  return { rotated: false };
}

export async function rotateSystemPin(userId: string): Promise<IssuedPinResult> {
  return applySystemPin(userId, "rotate");
}

/** Scheduled job: rotate every PIN that has expired (or was never set). */
export async function rotateExpiredPins(limit = 200): Promise<{ scanned: number; rotated: number }> {
  const now = new Date();
  const candidates = await prisma.user.findMany({
    where: {
      OR: [
        { pinHash: null } as any,
        { pinExpiresAt: null } as any,
        { pinExpiresAt: { lte: now } } as any,
      ],
    } as any,
    take: limit,
    select: { id: true, pinHash: true, pinExpiresAt: true } as any,
  });
  let rotated = 0;
  for (const row of candidates as Array<{ id: string; pinHash?: string | null; pinExpiresAt?: Date | string | null }>) {
    const status = pinStatusOf(row);
    if (status.pinSet && !status.pinExpired) continue;
    try {
      await applySystemPin(row.id, status.pinSet ? "rotate" : "missing");
      rotated += 1;
    } catch (e) {
      logger.warn("[account] PIN rotation failed", { userId: row.id, err: (e as Error)?.message });
    }
  }
  return { scanned: candidates.length, rotated };
}

export async function allocatePublicUserId(): Promise<string> {
  for (let i = 0; i < 48; i++) {
    const id = String(randomInt(100000, 1000000));
    const hit = await prisma.user.findUnique({ where: { publicUserId: id } as any });
    if (!hit) return id;
  }
  throw AppError.internal("Could not allocate a unique six-digit User ID");
}

export async function allocateUsername(desired: string, excludeUserId?: string): Promise<string> {
  let base = normalizeUsername(desired);
  if (base.length < 3) base = `user${randomInt(100, 999)}`;
  let candidate = base;
  for (let i = 0; i < 40; i++) {
    const hit = await prisma.user.findFirst({ where: { username: candidate } as any });
    if (!hit || hit.id === excludeUserId) return candidate;
    candidate = `${base.slice(0, 24)}${i + 1}`;
  }
  return `${base.slice(0, 20)}${randomInt(1000, 9999)}`;
}

export async function ensureAccountIdentity(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  if (!user) throw AppError.notFound("User not found");
  const data: Record<string, string> = {};
  if (!(user as any).publicUserId) data.publicUserId = await allocatePublicUserId();
  if (!(user as any).username) {
    data.username = await allocateUsername(user.profile?.displayName || user.email.split("@")[0] || "user", user.id);
  }
  if (!Object.keys(data).length) return user;
  return prisma.user.update({ where: { id: user.id }, data: data as any, include: { profile: true } });
}

export function toAccountSnapshot(user: any): AccountSnapshot {
  const pin = pinStatusOf(user);
  return {
    id: user.id,
    publicUserId: user.publicUserId ?? "",
    username: user.username ?? "",
    email: user.email,
    emailPending: user.emailPending ?? null,
    displayName: user.profile?.displayName ?? null,
    avatarUrl: user.profile?.avatarUrl ?? null,
    role: String(user.role).toLowerCase() as PublicRole,
    isActive: user.isActive !== false,
    isSuspended: Boolean(user.isSuspended),
    pinSet: pin.pinSet,
    pinExpired: pin.pinExpired,
    pinExpiresAt: pin.pinExpiresAt,
    pinIssuedPending: false,
  };
}

export async function getAccount(userId: string): Promise<AccountSnapshot> {
  await ensureAccountIdentity(userId);
  await ensureCurrentPin(userId);
  const full = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  if (!full) throw AppError.notFound("User not found");
  const snap = toAccountSnapshot(full);
  snap.pinIssuedPending = await peekPinIssuedPending(userId);
  return snap;
}

export async function changeUsername(userId: string, nextRaw: string): Promise<AccountSnapshot> {
  const username = validateUsername(nextRaw);
  const taken = await prisma.user.findFirst({ where: { username } as any });
  if (taken && taken.id !== userId) throw AppError.conflict("That username is already taken");
  await prisma.user.update({ where: { id: userId }, data: { username } as any });
  await prisma.auditLog.create({
    data: { userId, action: "user.account.username_changed", resourceType: "User", resourceId: userId, metadata: { username } },
  }).catch(() => {});
  return getAccount(userId);
}

export async function changeEmail(userId: string, nextEmail: string): Promise<AccountSnapshot & { verificationSent: boolean }> {
  const email = nextEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw AppError.validation("Enter a valid email address");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== userId) throw AppError.conflict("That email is already in use");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound("User not found");
  if (user.email === email) return { ...(await getAccount(userId)), verificationSent: false };

  let verificationSent = false;
  try {
    const { EmailService } = await import("../sitePlatform/sitePlatform.service.js");
    const creds = await EmailService.getActiveProvider();
    if (creds) {
      const token = randomBytes(24).toString("base64url");
      await redis.set(EMAIL_CHANGE_KEY(token), JSON.stringify({ userId, email }), "EX", EMAIL_CHANGE_TTL);
      await prisma.user.update({ where: { id: userId }, data: { emailPending: email } as any });
      const url = `${process.env.WINDELS_WEB_ORIGIN ?? "http://localhost:5173"}/app/account?verifyEmail=${token}`;
      await EmailService.sendEmail({
        to: email,
        subject: "Confirm your WINDELS email",
        text: `Confirm this address for your WINDELS account:\n${url}\n\nThis link expires in one hour.\n`,
      });
      verificationSent = true;
    } else {
      await prisma.user.update({ where: { id: userId }, data: { email, emailVerifiedAt: null, emailPending: null } as any });
    }
  } catch (e) {
    logger.warn("[account] email change delivery failed; applying immediately", { userId, err: (e as Error)?.message });
    await prisma.user.update({ where: { id: userId }, data: { email, emailVerifiedAt: null, emailPending: null } as any });
  }
  await prisma.auditLog.create({
    data: { userId, action: "user.account.email_changed", resourceType: "User", resourceId: userId, metadata: { verificationSent } },
  }).catch(() => {});
  return { ...(await getAccount(userId)), verificationSent };
}

export async function confirmEmailChange(token: string, userId: string): Promise<AccountSnapshot> {
  const raw = await redis.get(EMAIL_CHANGE_KEY(token));
  if (!raw) throw AppError.badRequest("Invalid or expired email confirmation");
  const payload = JSON.parse(raw) as { userId: string; email: string };
  if (payload.userId !== userId) throw AppError.forbidden();
  const taken = await prisma.user.findUnique({ where: { email: payload.email } });
  if (taken && taken.id !== userId) throw AppError.conflict("That email is already in use");
  await prisma.user.update({
    where: { id: userId },
    data: { email: payload.email, emailVerifiedAt: new Date(), emailPending: null } as any,
  });
  await redis.del(EMAIL_CHANGE_KEY(token));
  return getAccount(userId);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, confirmPassword: string) {
  if (newPassword !== confirmPassword) throw AppError.validation("New password and confirmation do not match");
  const policy = assessPassword(newPassword);
  if (!policy.meetsPolicy) throw AppError.validation("Password does not meet policy: " + policy.issues.join(", "));
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound("User not found");
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw AppError.unauthorized("Current password is incorrect");
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await prisma.auditLog.create({
    data: { userId, action: "user.account.password_changed", resourceType: "User", resourceId: userId, metadata: {} },
  }).catch(() => {});
  return { ok: true as const };
}

export async function setPin(userId: string, input: { currentPin?: string; newPin: string; confirmPin: string }) {
  const newPin = validatePin(input.newPin);
  if (newPin !== input.confirmPin) throw AppError.validation("New PIN and confirmation do not match");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound("User not found");
  const status = pinStatusOf(user as any);
  if (status.pinSet && !status.pinExpired) {
    if (!input.currentPin) throw AppError.validation("Enter your current PIN");
    validatePin(input.currentPin);
    const match = await bcrypt.compare(input.currentPin, (user as any).pinHash);
    if (!match) throw AppError.unauthorized("Current PIN is incorrect");
  }
  const pinHash = await bcrypt.hash(newPin, 12);
  const pinSetAt = new Date();
  const pinExpiresAt = new Date(pinSetAt.getTime() + PIN_TTL_MS);
  await prisma.user.update({
    where: { id: userId },
    data: { pinHash, pinSetAt, pinExpiresAt } as any,
  });
  await prisma.auditLog.create({
    data: {
      userId,
      action: status.pinSet ? "user.account.pin_changed" : "user.account.pin_set",
      resourceType: "User",
      resourceId: userId,
      metadata: { expiresAt: pinExpiresAt.toISOString() },
    },
  }).catch(() => {});
  return getAccount(userId);
}

export async function updateProfile(userId: string, patch: { displayName?: string; avatarUrl?: string | null; bio?: string }) {
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, displayName: patch.displayName, avatarUrl: patch.avatarUrl ?? undefined, bio: patch.bio, theme: "dark" },
    update: {
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
    },
  });
  return getAccount(userId);
}

export async function uploadAvatar(userId: string, mime: string, dataBase64: string) {
  const raw = dataBase64.includes(",") ? dataBase64.split(",").pop()! : dataBase64;
  let buf: Buffer;
  try { buf = Buffer.from(raw, "base64"); } catch { throw AppError.validation("Image payload is not valid base64"); }
  if (buf.length < 32) throw AppError.validation("Image is empty");
  if (buf.length > 800_000) throw AppError.validation("Profile image must be 800KB or smaller");
  const avatarUrl = `data:${mime};base64,${raw}`;
  return updateProfile(userId, { avatarUrl });
}

export async function adminResetPin(actorId: string, targetId: string) {
  await prisma.user.update({
    where: { id: targetId },
    data: { pinHash: null, pinSetAt: null, pinExpiresAt: null } as any,
  });
  await prisma.auditLog.create({
    data: { userId: actorId, action: "admin.user.pin_reset", resourceType: "User", resourceId: targetId, metadata: {} },
  }).catch(() => {});
  return { ok: true as const, pinCleared: true };
}

export async function adminResetPassword(actorId: string, targetId: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%";
  let temporaryPassword = "";
  for (let i = 0; i < 14; i++) temporaryPassword += alphabet[randomInt(0, alphabet.length)];
  temporaryPassword += "Aa1!";
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  await prisma.user.update({ where: { id: targetId }, data: { passwordHash } });
  const { revokeAllRefreshTokens } = await import("./auth.service.js");
  await revokeAllRefreshTokens(targetId).catch(() => {});
  await prisma.auditLog.create({
    data: { userId: actorId, action: "admin.user.password_reset", resourceType: "User", resourceId: targetId, metadata: {} },
  }).catch(() => {});
  return { ok: true as const, temporaryPassword };
}

export async function findUserByIdentifier(identifier: string) {
  const raw = identifier.trim();
  const include = { memberships: { take: 1, orderBy: { joinedAt: "asc" as const } }, profile: true };
  if (/^\d{6}$/.test(raw)) {
    return prisma.user.findUnique({ where: { publicUserId: raw } as any, include });
  }
  if (raw.includes("@")) {
    return prisma.user.findUnique({ where: { email: raw.toLowerCase() }, include });
  }
  return prisma.user.findFirst({ where: { username: normalizeUsername(raw) } as any, include });
}
