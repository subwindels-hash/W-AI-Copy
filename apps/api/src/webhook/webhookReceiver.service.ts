/**
 * Inbound Webhook Receiver Service — Session 126
 *
 * Provides timing-safe HMAC / secret verification (`crypto.timingSafeEqual`),
 * incoming webhook inbox logging (`whk:inbox`), event dispatching via EventBus,
 * replay support, and correction (deletion) paths for inbound webhooks.
 *
 * Keys:
 *   whk:inbox:idx:<org>   (Redis Sorted Set of inbox entry IDs ordered by timestamp)
 *   whk:inbox:i:<org>:<id>  (Redis string storing JSON serialized InboundWebhookEntry)
 */
import { randomUUID, timingSafeEqual, createHmac } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";
import { EventBus } from "../services/eventBus.js";
import {
  type InboundWebhookEntry,
  type InboundWebhookQueryInput,
  type ReplayWebhookResponse,
  type InboundWebhookSource,
} from "@windels/shared";

const K = {
  idx: (oid: string) => `whk:inbox:idx:${oid}`,
  item: (oid: string, id: string) => `whk:inbox:i:${oid}:${id}`,
};

const MAX_INBOX_LIMIT = 500;
const memoryInbox = new Map<string, InboundWebhookEntry[]>();

function getMemoryInbox(orgId: string): InboundWebhookEntry[] {
  let list = memoryInbox.get(orgId);
  if (!list) {
    list = [];
    memoryInbox.set(orgId, list);
  }
  return list;
}

/**
 * Perform constant-time string comparison to prevent timing attacks.
 */
export function safeCompare(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export const WebhookReceiverService = {
  /**
   * Verify an incoming webhook's secret or HMAC signature in constant time.
   * Never falls back to JWT_SECRET.
   */
  verifySignature(
    source: string,
    headerValue: string | undefined,
    rawBody: string,
    secretOverride?: string
  ): boolean {
    const expectedSecret = secretOverride || env.WEBHOOK_SECRET || "";
    if (!expectedSecret) return false;

    if (source === "billing" || source === "custom" || source === "etl") {
      // Check direct token equality or sha256= token equality in constant time
      return safeCompare(headerValue, expectedSecret) || safeCompare(headerValue, `sha256=${expectedSecret}`);
    }

    if (source === "github") {
      // GitHub uses X-Hub-Signature-256: sha256=HMAC_HEX
      if (!headerValue || !headerValue.startsWith("sha256=")) return false;
      const computed = "sha256=" + createHmac("sha256", expectedSecret).update(rawBody, "utf8").digest("hex");
      return safeCompare(headerValue, computed);
    }

    if (source === "stripe") {
      // Simplified Stripe signature validation (HMAC against payload)
      if (!headerValue) return false;
      const computed = createHmac("sha256", expectedSecret).update(rawBody, "utf8").digest("hex");
      return safeCompare(headerValue, computed) || headerValue.includes(computed);
    }

    return false;
  },

  /**
   * Receive an inbound webhook, log to organization inbox (`whk:inbox`),
   * and emit to central EventBus.
   */
  async receiveWebhook(
    organizationId: string,
    source: InboundWebhookSource | string,
    payload: Record<string, unknown>,
    signatureVerified: boolean,
    eventType?: string
  ): Promise<InboundWebhookEntry> {
    const now = new Date();
    const eventName = eventType || (typeof payload.event === "string" ? payload.event : null) || (typeof payload.eventType === "string" ? payload.eventType : null) || "webhook.received";

    const entry: InboundWebhookEntry = {
      id: `whk_in_${now.getTime()}_${randomUUID().slice(0, 8)}`,
      organizationId,
      source,
      event: eventName,
      payload,
      signatureVerified,
      status: "received",
      receivedAt: now.toISOString(),
      replayedAt: null,
    };

    // Store in memory fallback
    const mem = getMemoryInbox(organizationId);
    mem.unshift(entry);
    if (mem.length > MAX_INBOX_LIMIT) {
      mem.splice(MAX_INBOX_LIMIT);
    }

    // Store in Redis inbox sorted set
    try {
      const idxKey = K.idx(organizationId);
      const itemKey = K.item(organizationId, entry.id);
      await redis.set(itemKey, JSON.stringify(entry));
      await redis.zadd(idxKey, String(now.getTime()), entry.id);

      // Prune oldest if over limit
      const count = await redis.zcard(idxKey);
      if (count > MAX_INBOX_LIMIT) {
        const excess = count - MAX_INBOX_LIMIT;
        const oldIds = await redis.zrange(idxKey, 0, excess - 1);
        if (oldIds.length > 0) {
          await redis.zrem(idxKey, ...oldIds);
          for (const oldId of oldIds) {
            await redis.del(K.item(organizationId, oldId));
          }
        }
      }
    } catch (e: any) {
      logger.debug("WebhookReceiverService.receiveWebhook: Redis unreachable, relying on memory inbox", { error: e?.message });
    }

    // Dispatch to central EventBus
    try {
      await EventBus.emit("webhook.inbound_received", {
        inboxId: entry.id,
        organizationId,
        source: entry.source,
        event: entry.event,
        payload: entry.payload,
        signatureVerified: entry.signatureVerified,
      });

      // Also emit under specific event name if present
      if (entry.event && entry.event !== "webhook.inbound_received") {
        await EventBus.emit(entry.event, {
          organizationId,
          source: entry.source,
          payload: entry.payload,
        });
      }
    } catch (err: any) {
      logger.warn("WebhookReceiverService.receiveWebhook: EventBus emit failed", { error: err?.message });
    }

    return entry;
  },

  /**
   * List inbox entries for an organization, newest first.
   */
  async listInboundWebhooks(
    organizationId: string,
    query?: Partial<InboundWebhookQueryInput>
  ): Promise<InboundWebhookEntry[]> {
    const limit = query?.limit ?? 50;
    const sourceFilter = query?.source;
    const statusFilter = query?.status;

    let items: InboundWebhookEntry[] = [];
    try {
      const idxKey = K.idx(organizationId);
      // zrange reversed (newest first)
      const allIds = (await redis.zrange(idxKey, 0, -1)).reverse();
      for (const id of allIds) {
        const raw = await redis.get(K.item(organizationId, id));
        if (raw) {
          try {
            items.push(JSON.parse(raw));
          } catch {}
        }
      }
    } catch {
      items = [...getMemoryInbox(organizationId)];
    }

    if (sourceFilter) {
      items = items.filter((e) => e.source === sourceFilter);
    }
    if (statusFilter) {
      items = items.filter((e) => e.status === statusFilter);
    }

    if (items.length > limit) {
      items = items.slice(0, limit);
    }

    return items;
  },

  /**
   * Get a single inbox entry by ID, asserting organization scope.
   */
  async getInboundWebhook(organizationId: string, id: string): Promise<InboundWebhookEntry | null> {
    try {
      const raw = await redis.get(K.item(organizationId, id));
      if (raw) {
        const parsed = JSON.parse(raw) as InboundWebhookEntry;
        if (parsed.organizationId === organizationId) return parsed;
      }
    } catch {
      const mem = getMemoryInbox(organizationId);
      const found = mem.find((e) => e.id === id);
      if (found && found.organizationId === organizationId) return found;
    }
    return null;
  },

  /**
   * Replay a stored inbound webhook: re-emits to EventBus and updates status to "replayed".
   */
  async replayWebhook(organizationId: string, id: string): Promise<ReplayWebhookResponse | null> {
    const entry = await this.getInboundWebhook(organizationId, id);
    if (!entry) return null;

    const replayedAt = new Date().toISOString();
    entry.status = "replayed";
    entry.replayedAt = replayedAt;

    // Update memory
    const mem = getMemoryInbox(organizationId);
    const idx = mem.findIndex((e) => e.id === id);
    if (idx !== -1) mem[idx] = entry;

    // Update Redis
    try {
      await redis.set(K.item(organizationId, id), JSON.stringify(entry));
    } catch {}

    // Emit again to EventBus
    try {
      await EventBus.emit("webhook.inbound_received", {
        inboxId: entry.id,
        organizationId,
        source: entry.source,
        event: entry.event,
        payload: entry.payload,
        signatureVerified: entry.signatureVerified,
        replayed: true,
      });
      if (entry.event && entry.event !== "webhook.inbound_received") {
        await EventBus.emit(entry.event, {
          organizationId,
          source: entry.source,
          payload: entry.payload,
          replayed: true,
        });
      }
    } catch (err: any) {
      logger.warn("WebhookReceiverService.replayWebhook: EventBus emit failed", { error: err?.message });
    }

    return {
      id: entry.id,
      replayedAt,
      event: entry.event,
      status: "replayed",
    };
  },

  /**
   * Delete an inbox entry from storage (admin correction path).
   */
  async deleteWebhookEntry(organizationId: string, id: string): Promise<boolean> {
    const entry = await this.getInboundWebhook(organizationId, id);
    if (!entry) return false;

    // Remove from memory
    const mem = getMemoryInbox(organizationId);
    const idx = mem.findIndex((e) => e.id === id);
    if (idx !== -1) mem.splice(idx, 1);

    // Remove from Redis
    try {
      await redis.zrem(K.idx(organizationId), id);
      await redis.del(K.item(organizationId, id));
    } catch {}

    return true;
  },
};
