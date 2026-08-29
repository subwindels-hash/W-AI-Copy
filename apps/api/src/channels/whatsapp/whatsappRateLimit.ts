/**
 * WhatsApp channel rate limiting (Phase 1 §11).
 *
 * These are CHANNEL-level abuse controls layered on top of — never instead of —
 * the existing limiters:
 *   - `webhookIngest` (src/security/rateLimit.ts) guards the HTTP webhook edge.
 *   - `aiRegistry.rateLimit()` guards per-user AI spend.
 * This module adds the per-contact / per-phone / per-org quotas that the
 * channel settings expose to admins.
 */
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import type { WhatsAppChannelSettings } from "@windels/shared";

const HOUR_SECONDS = 3600;

export type RateLimitScope = "contact" | "phone" | "organization" | "media";

export interface RateLimitVerdict {
  allowed: boolean;
  scope?: RateLimitScope;
  limit?: number;
  used?: number;
  retryAfterSeconds?: number;
}

/** Fixed hourly window key — cheap, and precise enough for abuse control. */
function windowKey(prefix: string, id: string): string {
  const hour = Math.floor(Date.now() / (HOUR_SECONDS * 1000));
  return `wa:rl:${prefix}:${id}:${hour}`;
}

function secondsToWindowEnd(): number {
  const nowMs = Date.now();
  const windowMs = HOUR_SECONDS * 1000;
  return Math.ceil((windowMs - (nowMs % windowMs)) / 1000);
}

/**
 * Increments a counter and reports whether it exceeded `limit`.
 * A limit of 0 means "unlimited" and short-circuits without touching Redis.
 */
async function consume(prefix: string, id: string, limit: number): Promise<{ ok: boolean; used: number }> {
  if (!limit || limit <= 0) return { ok: true, used: 0 };
  const key = windowKey(prefix, id);
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, HOUR_SECONDS + 60);
  return { ok: used <= limit, used };
}

/**
 * Checks every inbound quota in order of narrowest scope first.
 *
 * Fails OPEN on Redis errors: rate limiting is an abuse control, and losing
 * Redis must not take the whole channel down. The event is logged so the
 * outage is visible in monitoring.
 */
export async function checkWhatsAppRateLimits(input: {
  organizationId: string;
  contactId: string;
  phoneNumber: string;
  settings: WhatsAppChannelSettings;
}): Promise<RateLimitVerdict> {
  try {
    const perContact = input.settings.perContactHourlyLimit ?? 0;
    const perOrg = input.settings.orgHourlyLimit ?? 0;

    const contact = await consume("contact", input.contactId, perContact);
    if (!contact.ok) {
      return {
        allowed: false, scope: "contact", limit: perContact,
        used: contact.used, retryAfterSeconds: secondsToWindowEnd(),
      };
    }

    // A second counter on the raw number catches a sender who somehow lands on
    // multiple contact rows (e.g. across channels in the same org).
    const phone = await consume("phone", `${input.organizationId}:${input.phoneNumber}`, perContact * 2);
    if (!phone.ok) {
      return {
        allowed: false, scope: "phone", limit: perContact * 2,
        used: phone.used, retryAfterSeconds: secondsToWindowEnd(),
      };
    }

    const org = await consume("org", input.organizationId, perOrg);
    if (!org.ok) {
      return {
        allowed: false, scope: "organization", limit: perOrg,
        used: org.used, retryAfterSeconds: secondsToWindowEnd(),
      };
    }

    return { allowed: true };
  } catch (e: any) {
    logger.error("whatsapp rate limiter unavailable; failing open", { err: e?.message });
    return { allowed: true };
  }
}

/** Separate, tighter budget for media handling (downloads are expensive). */
export async function checkMediaRateLimit(input: {
  organizationId: string;
  contactId: string;
  hourlyLimit?: number;
}): Promise<RateLimitVerdict> {
  const limit = input.hourlyLimit ?? 20;
  try {
    const r = await consume("media", `${input.organizationId}:${input.contactId}`, limit);
    return r.ok
      ? { allowed: true }
      : { allowed: false, scope: "media", limit, used: r.used, retryAfterSeconds: secondsToWindowEnd() };
  } catch (e: any) {
    logger.error("whatsapp media rate limiter unavailable; failing open", { err: e?.message });
    return { allowed: true };
  }
}

/** Current usage counters, for the admin dashboard. */
export async function currentUsage(organizationId: string): Promise<{ orgHourly: number }> {
  try {
    const v = await redis.get(windowKey("org", organizationId));
    return { orgHourly: v ? Number(v) || 0 : 0 };
  } catch {
    return { orgHourly: 0 };
  }
}
