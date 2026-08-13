/**
 * Telegram identity resolution and account linking.
 *
 * SECURITY CONTRACT: a Telegram user id NEVER grants access on its own. A
 * sender is always a channel identity until they complete the secure
 * /start <token> link initiated by the logged-in WINDELS user. Tokens are
 * single-use, cryptographically random, time-limited and stored hashed.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "../../db/client.js";
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import type { TelegramChannel } from "@prisma/client";
import { resolveConfig } from "./telegramConfig.js";
import { TelegramClient } from "./telegramClient.js";

const TOKEN_TTL_SECONDS = 600; // 10 minutes
const MAX_ATTEMPTS = 5;

const K = {
  token: (hash: string) => `tg:link:${hash}`,
  attempts: (hash: string) => `tg:link:attempts:${hash}`,
  issueGuard: (userId: string) => `tg:link:guard:${userId}`,
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ResolvedTelegramIdentity {
  connectionId: string;
  linkedUserId: string | null;
  isLinked: boolean;
  telegramUserId: bigint;
  username: string | null;
  displayName: string | null;
}

export const TelegramIdentityService = {
  /** Find or create the connection for an inbound Telegram user id. */
  async resolveConnection(channel: TelegramChannel, from: { id: number; username?: string; first_name?: string; last_name?: string }): Promise<ResolvedTelegramIdentity> {
    const telegramUserId = BigInt(from.id);
    const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ") || null;
    const existing = await prisma.telegramConnection.findUnique({
      where: { channelId_telegramUserId: { channelId: channel.id, telegramUserId } },
    });
    if (existing) {
      if (existing.telegramUsername !== (from.username ?? null) || existing.displayName !== displayName) {
        await prisma.telegramConnection.update({ where: { id: existing.id }, data: { telegramUsername: from.username ?? null, displayName, lastActivityAt: new Date() } }).catch(() => {});
      } else {
        await prisma.telegramConnection.update({ where: { id: existing.id }, data: { lastActivityAt: new Date() } }).catch(() => {});
      }
      return { connectionId: existing.id, linkedUserId: existing.linkedUserId, isLinked: Boolean(existing.linkedUserId), telegramUserId, username: existing.telegramUsername, displayName: existing.displayName };
    }
    const created = await prisma.telegramConnection.create({
      data: {
        organizationId: channel.organizationId,
        channelId: channel.id,
        telegramUserId,
        telegramUsername: from.username ?? null,
        displayName,
        linkedUserId: null, // unlinked until /start <token> verification
        status: "UNLINKED",
      },
    });
    return { connectionId: created.id, linkedUserId: null, isLinked: false, telegramUserId, username: created.telegramUsername, displayName: created.displayName };
  },

  async isBlocked(connectionId: string): Promise<boolean> {
    const c = await prisma.telegramConnection.findUnique({ where: { id: connectionId }, select: { status: true } });
    return c?.status === "BLOCKED";
  },

  /** Step 1: a logged-in WINDELS user requests a linking token. */
  async issueLinkingToken(input: { userId: string; organizationId: string; channelId?: string }): Promise<{ token: string; expiresInSeconds: number; botUsername: string | null; deepLink: string }> {
    const guard = await redis.get(K.issueGuard(input.userId));
    if (guard) throw Object.assign(new Error("A linking token was just issued. Wait a moment."), { status: 429 });

    const channel = input.channelId
      ? await prisma.telegramChannel.findFirst({ where: { id: input.channelId, organizationId: input.organizationId, deletedAt: null } })
      : await prisma.telegramChannel.findFirst({ where: { organizationId: input.organizationId, enabled: true, deletedAt: null } });
    if (!channel) throw Object.assign(new Error("No Telegram channel is configured for this organization"), { status: 400 });

    const token = randomBytes(24).toString("base64url");
    const hash = hashToken(token);
    await redis.set(K.token(hash), JSON.stringify({ userId: input.userId, organizationId: input.organizationId, channelId: channel.id }), "EX", TOKEN_TTL_SECONDS);
    await redis.set(K.issueGuard(input.userId), "1", "EX", 30);

    const deepLink = `https://t.me/${channel.botUsername ?? "your_bot"}?start=${token}`;
    logger.info("telegram linking token issued", { userId: input.userId, organizationId: input.organizationId });
    return { token, expiresInSeconds: TOKEN_TTL_SECONDS, botUsername: channel.botUsername, deepLink };
  },

  /**
   * Step 2: the user sends /start <token> to the bot. Validates the token
   * and binds the Telegram connection to the WINDELS user.
   */
  async consumeLinkingToken(input: { channelId: string; connectionId: string; telegramUserId: bigint; token: string }): Promise<{ ok: boolean; error?: string }> {
    const hash = hashToken(input.token.trim());
    const raw = await redis.get(K.token(hash));
    if (!raw) return { ok: false, error: "That link is invalid or has expired. Generate a new one in WINDELS." };

    const attemptsKey = K.attempts(hash);
    const attempts = await redis.incr(attemptsKey);
    await redis.expire(attemptsKey, TOKEN_TTL_SECONDS);
    if (attempts > MAX_ATTEMPTS) {
      await redis.del(K.token(hash));
      return { ok: false, error: "Too many invalid attempts. Request a new link." };
    }

    let payload: { userId: string; organizationId: string; channelId: string };
    try { payload = JSON.parse(raw); } catch { return { ok: false, error: "Malformed link token." }; }

    if (payload.channelId !== input.channelId) return { ok: false, error: "This token belongs to a different Telegram workspace." };

    // Refuse if this Telegram id is already bound to another WINDELS user.
    const conflicting = await prisma.telegramConnection.findFirst({
      where: { channelId: input.channelId, telegramUserId: input.telegramUserId, linkedUserId: { not: null } },
      select: { linkedUserId: true },
    });
    if (conflicting && conflicting.linkedUserId !== payload.userId) {
      return { ok: false, error: "This Telegram account is already linked to another WINDELS user." };
    }

    await redis.del(K.token(hash));
    await redis.del(attemptsKey);

    await prisma.telegramConnection.update({
      where: { id: input.connectionId },
      data: { linkedUserId: payload.userId, status: "LINKED", linkedAt: new Date() },
    });

    // Audit the binding.
    try {
      const { auditService } = await import("../../audit/audit.service.js");
      await auditService.log({
        organizationId: payload.organizationId, userId: payload.userId,
        action: "data.update", resourceType: "user", resourceId: input.connectionId,
        metadata: { channel: "telegram", channelId: input.channelId },
      });
    } catch { /* non-fatal */ }

    logger.info("telegram account linked", { userId: payload.userId, connectionId: input.connectionId });
    return { ok: true };
  },

  async unlink(input: { userId: string; connectionId: string }): Promise<boolean> {
    const c = await prisma.telegramConnection.findFirst({ where: { id: input.connectionId, linkedUserId: input.userId } });
    if (!c) return false;
    await prisma.telegramConnection.update({ where: { id: c.id }, data: { linkedUserId: null, linkedAt: null, status: "UNLINKED" } });
    return true;
  },

  /**
   * Sends the linking token to the user's Telegram chat when the web
   * (already-authenticated) flow requests "deliver via bot".
   */
  async sendTokenToChat(channel: TelegramChannel, chatId: number, token: string) {
    const cfg = resolveConfig(channel);
    if (!cfg.botToken) throw new Error("Bot token not configured");
    return TelegramClient.sendMessage({ botToken: cfg.botToken, apiBaseUrl: cfg.apiBaseUrl }, {
      chatId,
      text: `🔗 Connect this Telegram account to WINDELS\n\nYour secure link expires in 10 minutes. If you did not request this, ignore this message.`,
    });
  },
};
