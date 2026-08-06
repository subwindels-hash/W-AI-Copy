/**
 * Real-Time SSE Channel (Events) Service — Session 126
 *
 * Implements organization-scoped event stream management, historical ring-buffer
 * persistence (`evt:hist`), reconnection replay, custom event publishing, and
 * active client session controls.
 *
 * Keys:
 *   evt:hist:idx:<org>  (Redis Sorted Set of event IDs ordered by timestamp)
 *   evt:hist:i:<org>:<id> (Redis string/hash storing the serialized event payload)
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { EventBus } from "../services/eventBus.js";
import {
  MAX_EVENT_HISTORY_LIMIT,
  DEFAULT_EVENT_HISTORY_LIMIT,
  BROADCAST_EVENTS,
  type SSEEventPayload,
  type SSEClientInfo,
  type EventHistoryQueryInput,
  type PublishEventInput,
  type EventsHealthResponse,
} from "@windels/shared";

const K = {
  idx: (oid: string) => `evt:hist:idx:${oid}`,
  item: (oid: string, id: string) => `evt:hist:i:${oid}:${id}`,
};

// In-memory fallback buffer for environments where Redis is unreachable
const memoryBuffers = new Map<string, SSEEventPayload[]>();

function getMemoryBuffer(orgId: string): SSEEventPayload[] {
  let buf = memoryBuffers.get(orgId);
  if (!buf) {
    buf = [];
    memoryBuffers.set(orgId, buf);
  }
  return buf;
}

export const EventsService = {
  /**
   * Record an organization-scoped event in the historical ring buffer.
   * Capped at MAX_EVENT_HISTORY_LIMIT (200) events per organization.
   */
  async recordEvent(payload: SSEEventPayload): Promise<void> {
    if (!payload.organizationId) return; // Only store org-scoped events
    const oid = payload.organizationId;
    const ts = new Date(payload.timestamp).getTime();

    // In-memory fallback update
    const mem = getMemoryBuffer(oid);
    mem.push(payload);
    if (mem.length > MAX_EVENT_HISTORY_LIMIT) {
      mem.splice(0, mem.length - MAX_EVENT_HISTORY_LIMIT);
    }

    // Redis ring buffer update
    try {
      const idxKey = K.idx(oid);
      const itemKey = K.item(oid, payload.id);
      await redis.set(itemKey, JSON.stringify(payload));
      await redis.zadd(idxKey, String(ts), payload.id);

      // Prune oldest if over limit
      const count = await redis.zcard(idxKey);
      if (count > MAX_EVENT_HISTORY_LIMIT) {
        const excess = count - MAX_EVENT_HISTORY_LIMIT;
        const oldIds = await redis.zrange(idxKey, 0, excess - 1);
        if (oldIds.length > 0) {
          await redis.zrem(idxKey, ...oldIds);
          for (const oldId of oldIds) {
            await redis.del(K.item(oid, oldId));
          }
        }
      }
    } catch (e: any) {
      logger.debug("EventsService.recordEvent: Redis unreachable, relying on memory buffer", { error: e?.message });
    }
  },

  /**
   * Query historical events for an organization with optional filtering
   * by timestamp/ID ('since') and eventType.
   */
  async getEventHistory(organizationId: string, query?: Partial<EventHistoryQueryInput>): Promise<SSEEventPayload[]> {
    const limit = query?.limit ?? DEFAULT_EVENT_HISTORY_LIMIT;
    const eventType = query?.eventType;
    const since = query?.since;

    let items: SSEEventPayload[] = [];
    try {
      const idxKey = K.idx(organizationId);
      const allIds = await redis.zrange(idxKey, 0, -1);
      for (const id of allIds) {
        const raw = await redis.get(K.item(organizationId, id));
        if (raw) {
          try {
            items.push(JSON.parse(raw));
          } catch {}
        }
      }
    } catch {
      items = [...getMemoryBuffer(organizationId)];
    }

    // Sort ascending by timestamp for stream replay/history
    items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (since) {
      const sinceTs = !isNaN(Date.parse(since)) ? new Date(since).getTime() : null;
      if (sinceTs !== null) {
        items = items.filter((ev) => new Date(ev.timestamp).getTime() > sinceTs);
      } else {
        // Assume since is an event ID
        const idx = items.findIndex((ev) => ev.id === since);
        if (idx !== -1) {
          items = items.slice(idx + 1);
        }
      }
    }

    if (eventType) {
      items = items.filter((ev) => ev.event === eventType);
    }

    if (items.length > limit) {
      items = items.slice(items.length - limit);
    }

    return items;
  },

  /**
   * Publish an event to the organization's SSE stream and historical ring buffer.
   */
  async publishEvent(
    user: { id: string; organizationId: string | null },
    input: PublishEventInput
  ): Promise<SSEEventPayload> {
    const organizationId = input.organizationId ?? user.organizationId;
    if (!organizationId) {
      throw new Error("Organization scope required to publish event");
    }

    const payload: SSEEventPayload = {
      id: `evt_${Date.now()}_${randomUUID().slice(0, 8)}`,
      event: input.event,
      data: input.data ?? {},
      timestamp: new Date().toISOString(),
      organizationId,
    };

    await this.recordEvent(payload);

    // Emit to central EventBus so SSE stream routes pick it up
    try {
      await EventBus.emit(payload.event, payload);
    } catch (e: any) {
      logger.warn("EventsService.publishEvent: EventBus emit failed", { error: e?.message });
    }

    return payload;
  },

  /**
   * Filter active SSE clients by organization.
   */
  listClients(
    organizationId: string,
    clientsMap: Map<string, { id: string; userId: string; organizationId: string | null; lastEventId: string | null; subscribedAt: number }>
  ): SSEClientInfo[] {
    const out: SSEClientInfo[] = [];
    for (const client of clientsMap.values()) {
      if (client.organizationId === organizationId) {
        out.push({
          id: client.id,
          userId: client.userId,
          organizationId: client.organizationId,
          lastEventId: client.lastEventId,
          subscribedAt: client.subscribedAt,
        });
      }
    }
    return out;
  },

  /**
   * Disconnect a specific active SSE client belonging to the organization.
   */
  disconnectClient(
    organizationId: string,
    clientId: string,
    clientsMap: Map<string, { id: string; organizationId: string | null; res: { end: () => void } }>
  ): boolean {
    const client = clientsMap.get(clientId);
    if (!client || client.organizationId !== organizationId) {
      return false;
    }
    try {
      client.res.end();
    } catch {}
    clientsMap.delete(clientId);
    return true;
  },

  /**
   * Get health metrics for the SSE channel.
   */
  getHealth(
    totalClients: number,
    organizationId?: string | null,
    clientsMap?: Map<string, { organizationId: string | null }>
  ): EventsHealthResponse {
    let orgConnectedClients: number | undefined = undefined;
    if (organizationId && clientsMap) {
      let count = 0;
      for (const client of clientsMap.values()) {
        if (client.organizationId === organizationId) count++;
      }
      orgConnectedClients = count;
    }

    return {
      connectedClients: totalClients,
      subscribedEvents: Array.from(BROADCAST_EVENTS),
      uptime: Math.floor(process.uptime()),
      orgConnectedClients,
    };
  },
};
