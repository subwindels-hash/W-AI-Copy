/**
 * WhatsApp identity resolution and account linking.
 *
 * SECURITY CONTRACT (Phase 1 §8): a matching phone number NEVER grants access
 * to a WINDELS account. An unlinked WhatsApp contact is a *channel identity*
 * with no WINDELS user behind it and no access to private data. Linking only
 * happens when a logged-in WINDELS user initiates it and then proves control
 * of the number by returning a one-time code delivered over WhatsApp.
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "../../db/client.js";
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import { normalizePhoneNumber } from "./whatsappClient.js";
import { WhatsAppMessageService } from "./whatsappMessage.service.js";
import { WhatsAppChannelService } from "./whatsappChannel.service.js";

/** Verification codes are short-lived and single-use. */
const CODE_TTL_SECONDS = 600;
const MAX_ATTEMPTS = 5;

const K = {
  challenge: (userId: string, phone: string) => `wa:link:${userId}:${phone}`,
  attempts: (userId: string, phone: string) => `wa:link:attempts:${userId}:${phone}`,
  sendGuard: (userId: string) => `wa:link:guard:${userId}`,
};

/** Codes are stored hashed, never in clear text. */
function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export interface ResolvedIdentity {
  contactId: string;
  /** Set only when the contact completed verification. Null = channel identity. */
  linkedUserId: string | null;
  isLinked: boolean;
  phoneNumber: string;
  displayName: string | null;
}

export const WhatsAppIdentityService = {
  /**
   * Finds or creates the contact for an inbound sender.
   *
   * A newly seen number is ALWAYS created unlinked, regardless of whether a
   * WINDELS user happens to have that phone number on their profile.
   */
  async resolveContact(input: {
    channelId: string;
    organizationId: string;
    whatsappUserId: string;
    phoneNumber: string;
    profileName: string | null;
  }): Promise<ResolvedIdentity> {
    const phone = normalizePhoneNumber(input.phoneNumber);
    const existing = await prisma.whatsAppContact.findUnique({
      where: {
        whatsappChannelId_whatsappUserId: {
          whatsappChannelId: input.channelId,
          whatsappUserId: input.whatsappUserId,
        },
      },
    });

    if (existing) {
      const updated = await prisma.whatsAppContact.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          ...(input.profileName && input.profileName !== existing.displayName
            ? { displayName: input.profileName }
            : {}),
        },
      });
      return {
        contactId: updated.id,
        linkedUserId: updated.linkedWindelsUserId,
        isLinked: Boolean(updated.linkedWindelsUserId),
        phoneNumber: updated.phoneNumber,
        displayName: updated.displayName,
      };
    }

    const created = await prisma.whatsAppContact.create({
      data: {
        organizationId: input.organizationId,
        whatsappChannelId: input.channelId,
        whatsappUserId: input.whatsappUserId,
        phoneNumber: phone,
        displayName: input.profileName,
        // Deliberately NOT linked: verification is the only path to a link.
        linkedWindelsUserId: null,
      },
    });

    return {
      contactId: created.id,
      linkedUserId: null,
      isLinked: false,
      phoneNumber: created.phoneNumber,
      displayName: created.displayName,
    };
  },

  /** True when the contact is blocked or has opted out of the channel. */
  async isBlocked(contactId: string): Promise<boolean> {
    const c = await prisma.whatsAppContact.findUnique({ where: { id: contactId }, select: { status: true } });
    return c?.status === "BLOCKED" || c?.status === "OPTED_OUT";
  },

  /**
   * Step 1 of linking: an authenticated WINDELS user asks to bind a number.
   * A code is generated, hashed into Redis, and delivered over WhatsApp — so
   * only whoever actually controls the handset can complete the link.
   */
  async startLink(input: {
    userId: string;
    organizationId: string;
    phoneNumber: string;
  }): Promise<{ ok: boolean; error?: string; expiresInSeconds?: number }> {
    const phone = normalizePhoneNumber(input.phoneNumber);
    if (phone.length < 6) return { ok: false, error: "Invalid phone number" };

    // Throttle challenge issuance per user.
    const guard = await redis.get(K.sendGuard(input.userId));
    if (guard) return { ok: false, error: "A verification code was just sent. Please wait before requesting another." };

    const channel = await WhatsAppChannelService.primary(input.organizationId);
    if (!channel) return { ok: false, error: "No WhatsApp channel is configured for this organization" };
    if (!channel.enabled) return { ok: false, error: "The WhatsApp channel is disabled" };

    // If this number is already linked to someone else, refuse without
    // disclosing who holds it.
    const conflicting = await prisma.whatsAppContact.findFirst({
      where: { organizationId: input.organizationId, phoneNumber: phone, linkedWindelsUserId: { not: null } },
      select: { linkedWindelsUserId: true },
    });
    if (conflicting && conflicting.linkedWindelsUserId !== input.userId) {
      return { ok: false, error: "This number cannot be linked" };
    }

    const code = String(randomInt(100000, 1000000));
    await redis.set(K.challenge(input.userId, phone), hashCode(code, input.userId), "EX", CODE_TTL_SECONDS);
    await redis.del(K.attempts(input.userId, phone));
    await redis.set(K.sendGuard(input.userId), "1", "EX", 60);

    const sent = await WhatsAppMessageService.sendText(
      channel,
      phone,
      `Your WINDELS verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this message.`,
    );

    if (!sent.ok) {
      await redis.del(K.challenge(input.userId, phone));
      await redis.del(K.sendGuard(input.userId));
      return { ok: false, error: sent.error?.message ?? "Could not deliver the verification code" };
    }

    logger.info("whatsapp link challenge issued", { userId: input.userId, organizationId: input.organizationId });
    return { ok: true, expiresInSeconds: CODE_TTL_SECONDS };
  },

  /**
   * Step 2: the user returns the code. Only on success is the contact bound to
   * the WINDELS user id.
   */
  async confirmLink(input: {
    userId: string;
    organizationId: string;
    phoneNumber: string;
    code: string;
  }): Promise<{ ok: boolean; error?: string; contactId?: string }> {
    const phone = normalizePhoneNumber(input.phoneNumber);
    const key = K.challenge(input.userId, phone);
    const stored = await redis.get(key);
    if (!stored) return { ok: false, error: "No pending verification for this number, or it expired" };

    const attemptsKey = K.attempts(input.userId, phone);
    const attempts = await redis.incr(attemptsKey);
    await redis.expire(attemptsKey, CODE_TTL_SECONDS);
    if (attempts > MAX_ATTEMPTS) {
      await redis.del(key);
      logger.warn("whatsapp link verification locked out", { userId: input.userId });
      return { ok: false, error: "Too many incorrect attempts. Request a new code." };
    }

    if (!safeEqualHex(stored, hashCode(input.code.trim(), input.userId))) {
      return { ok: false, error: "Incorrect verification code" };
    }

    await redis.del(key);
    await redis.del(attemptsKey);

    const channel = await WhatsAppChannelService.primary(input.organizationId);
    if (!channel) return { ok: false, error: "No WhatsApp channel is configured" };

    // Bind whichever contact rows on this org/channel carry that number.
    const contact = await prisma.whatsAppContact.findFirst({
      where: { organizationId: input.organizationId, whatsappChannelId: channel.id, phoneNumber: phone },
    });

    if (!contact) {
      // The user verified before ever messaging the channel; create the link
      // eagerly so their first message is already attributed.
      const created = await prisma.whatsAppContact.create({
        data: {
          organizationId: input.organizationId,
          whatsappChannelId: channel.id,
          whatsappUserId: phone,
          phoneNumber: phone,
          linkedWindelsUserId: input.userId,
          linkedAt: new Date(),
        },
      });
      logger.info("whatsapp contact linked", { userId: input.userId, contactId: created.id });
      return { ok: true, contactId: created.id };
    }

    const updated = await prisma.whatsAppContact.update({
      where: { id: contact.id },
      data: { linkedWindelsUserId: input.userId, linkedAt: new Date() },
    });
    logger.info("whatsapp contact linked", { userId: input.userId, contactId: updated.id });
    return { ok: true, contactId: updated.id };
  },

  /** Removes the binding. The contact keeps existing as a channel identity. */
  async unlink(input: { userId: string; organizationId: string; contactId: string }): Promise<boolean> {
    const contact = await prisma.whatsAppContact.findFirst({
      where: { id: input.contactId, organizationId: input.organizationId },
    });
    // A user may only unlink their own binding.
    if (!contact || contact.linkedWindelsUserId !== input.userId) return false;
    await prisma.whatsAppContact.update({
      where: { id: contact.id },
      data: { linkedWindelsUserId: null, linkedAt: null },
    });
    return true;
  },
};
