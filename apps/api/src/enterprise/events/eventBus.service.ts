/**
 * Enterprise Event Bus (Slice 164).
 *
 * Extends the lightweight in-process EventBus (services/eventBus.ts) with:
 *  - Event schema registry (JSON Schema, versioning, producer/consumer metadata)
 *  - Correlation ID + causation ID + trace ID propagation (W3C-like)
 *  - Persistent event log (in-memory ring buffer, Redis list) for replay
 *  - Dead-letter queue for failed handlers with retry + replay
 *  - Cross-process delivery via Redis pub/sub so multiple API replicas
 *    and future worker services all receive events.
 */
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { redis } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import { Metrics } from "../../observability/metrics.js";
import type { EnterpriseEvent, EventSchema, DeadLetterEntry } from "@windels/shared/enterprise";

const RETENTION = 1000;             // events kept in ring
const DLQ_MAX_ATTEMPTS = 5;
const REDIS_CHANNEL = "windels:events";

type Handler = (e: EnterpriseEvent) => void | Promise<void>;

// ── Schema registry ───────────────────────────────────────────────────────
const schemas = new Map<string, Map<string, EventSchema>>(); // type -> version -> schema
function schemaKey(type: string, version: string) { return `${type}@${version}`; }

// ── Event log (ring buffer for replay) ────────────────────────────────────
const eventLog: EnterpriseEvent[] = [];
const dlq: DeadLetterEntry[] = [];

// ── Subscriptions ─────────────────────────────────────────────────────────
interface Subscription { id: string; eventType: string | "*"; handler: Handler; consumer: string; }
const subscriptions = new Map<string, Subscription>();

// ── Correlation context (continues through async calls in this proc) ─────
// Simple async-local substitute using a global stack for MVP.
const ctxStack: Array<{ correlationId?: string; causationId?: string; traceId?: string }> = [];
export function withEventContext<T>(ctx: { correlationId?: string; causationId?: string; traceId?: string }, fn: () => T): T {
  ctxStack.push(ctx);
  try { return fn(); } finally { ctxStack.pop(); }
}
function currentCtx() { return ctxStack[ctxStack.length - 1]; }

// ── Cross-process Redis subscriber ────────────────────────────────────────
let redisSubscribed = false;
function ensureRedisSubscribe() {
  if (redisSubscribed) return;
  redisSubscribed = true;
  try {
    redis.subscribe(REDIS_CHANNEL, (err) => { if (err) logger.warn("redis subscribe failed", { error: err.message }); });
    redis.on("message", (_ch, raw) => {
      try { const e = JSON.parse(raw) as EnterpriseEvent; deliverLocal(e, true); } catch { /* ignore malformed */ }
    });
  } catch (e) { logger.warn("event bus redis subscriber unavailable", { error: (e as Error).message }); }
}

// ── Delivery ──────────────────────────────────────────────────────────────
async function deliverLocal(e: EnterpriseEvent, fromRedis = false) {
  const matching = [...subscriptions.values()].filter(
    (s) => s.eventType === "*" || s.eventType === e.type,
  );
  for (const sub of matching) {
    try {
      await Promise.resolve(sub.handler(e));
      Metrics.increment("event_bus.delivered", 1, { event: e.type, consumer: sub.consumer });
    } catch (err) {
      const msg = (err as Error).message;
      Metrics.increment("event_bus.failed", 1, { event: e.type, consumer: sub.consumer });
      logger.warn("event handler failed", { eventType: e.type, consumer: sub.consumer, error: msg });
      // Add to DLQ
      const existing = dlq.find((d) => d.event.id === e.id && d.failedConsumer === sub.consumer && d.status === "pending");
      if (existing) {
        existing.attempts++;
        existing.lastFailedAt = new Date().toISOString();
        existing.error = msg;
      } else {
        dlq.push({
          id: randomUUID(),
          event: e,
          failedConsumer: sub.consumer,
          error: msg,
          attempts: 1,
          firstFailedAt: new Date().toISOString(),
          lastFailedAt: new Date().toISOString(),
          status: "pending",
        });
      }
    }
  }
  // Do not re-publish to Redis if we got this from Redis (prevents loops).
  if (!fromRedis) {
    try { await redis.publish(REDIS_CHANNEL, JSON.stringify(e)); } catch { /* redis down */ }
  }
}

// ── Public API ────────────────────────────────────────────────────────────
export const EventBusService = {
  // ── Schema registry ──────────────────────────────────────────────────
  registerSchema(schema: EventSchema): EventSchema {
    if (!schemas.has(schema.type)) schemas.set(schema.type, new Map());
    schemas.get(schema.type)!.set(schema.version, schema);
    return schema;
  },
  getSchema(type: string, version: string): EventSchema | undefined {
    return schemas.get(type)?.get(version);
  },
  listSchemas(): EventSchema[] {
    const out: EventSchema[] = [];
    for (const versions of schemas.values()) for (const s of versions.values()) out.push(s);
    return out;
  },

  // ── Publish ──────────────────────────────────────────────────────────
  async publish<TPayload = unknown>(
    type: string,
    payload: TPayload,
    opts: { producer: string; schemaVersion?: string; metadata?: Record<string, unknown> } = { producer: "windels-api" },
  ): Promise<EnterpriseEvent<TPayload>> {
    const parent = currentCtx();
    const event: EnterpriseEvent<TPayload> = {
      id: randomUUID(),
      type,
      schemaVersion: opts.schemaVersion ?? "1.0.0",
      timestamp: new Date().toISOString(),
      producer: opts.producer,
      correlationId: parent?.correlationId ?? randomUUID(),
      causationId: parent?.causationId,
      traceId: parent?.traceId,
      payload,
      metadata: opts.metadata ?? {},
    };
    // Retain in ring
    eventLog.push(event as EnterpriseEvent);
    if (eventLog.length > RETENTION) eventLog.shift();
    try { await redis.lpush("enterprise:events:log", JSON.stringify(event)); await redis.ltrim("enterprise:events:log", 0, RETENTION - 1); } catch { /* ignore */ }
    Metrics.increment("event_bus.published", 1, { event: type, producer: opts.producer });
    logger.debug("event published", { type, id: event.id, producer: opts.producer });
    await deliverLocal(event);
    return event;
  },

  // ── Subscribe ────────────────────────────────────────────────────────
  subscribe(eventType: string | "*", consumer: string, handler: Handler): () => void {
    ensureRedisSubscribe();
    const id = randomUUID();
    subscriptions.set(id, { id, eventType, handler, consumer });
    Metrics.increment("event_bus.subscriptions", 1, { eventType: eventType === "*" ? "_all" : eventType, consumer });
    return () => subscriptions.delete(id);
  },

  // ── Replay ───────────────────────────────────────────────────────────
  replay(filter?: { eventType?: string; since?: string; correlationId?: string }): EnterpriseEvent[] {
    let list = [...eventLog];
    if (filter?.eventType) list = list.filter((e) => e.type === filter.eventType);
    if (filter?.since) list = list.filter((e) => e.timestamp >= filter.since!);
    if (filter?.correlationId) list = list.filter((e) => e.correlationId === filter.correlationId);
    return list;
  },

  // ── DLQ ──────────────────────────────────────────────────────────────
  listDLQ(status?: DeadLetterEntry["status"]): DeadLetterEntry[] {
    let list = [...dlq].sort((a, b) => b.lastFailedAt.localeCompare(a.lastFailedAt));
    if (status) list = list.filter((d) => d.status === status);
    return list;
  },
  async replayDLQ(id: string): Promise<boolean> {
    const entry = dlq.find((d) => d.id === id);
    if (!entry || entry.status !== "pending") return false;
    if (entry.attempts >= DLQ_MAX_ATTEMPTS) return false;
    entry.attempts++;
    entry.lastFailedAt = new Date().toISOString();
    // Re-deliver to the specific failed consumer:
    const sub = [...subscriptions.values()].find(
      (s) => s.consumer === entry.failedConsumer && (s.eventType === "*" || s.eventType === entry.event.type),
    );
    if (!sub) { entry.status = "discarded"; return false; }
    try {
      await sub.handler(entry.event);
      entry.status = "replayed";
      Metrics.increment("event_bus.dlq_replayed", 1);
      return true;
    } catch (err) {
      entry.error = (err as Error).message;
      if (entry.attempts >= DLQ_MAX_ATTEMPTS) entry.status = "discarded";
      return false;
    }
  },
  discardDLQ(id: string): boolean {
    const entry = dlq.find((d) => d.id === id);
    if (!entry) return false;
    entry.status = "discarded";
    return true;
  },
};

// ── Register default event schemas ────────────────────────────────────────
EventBusService.registerSchema({
  type: "user.created", version: "1.0.0", producer: "windels-api",
  description: "Fired when a new user registers.", consumers: ["audit", "billing", "notifications"],
  schema: { type: "object", properties: { userId: { type: "string" }, email: { type: "string" } }, required: ["userId"] },
});
EventBusService.registerSchema({
  type: "workflow.run.started", version: "1.0.0", producer: "windels-api",
  description: "Fired when a workflow run begins.", consumers: ["audit", "analytics", "notifications"],
  schema: { type: "object", properties: { workflowId: { type: "string" }, runId: { type: "string" } }, required: ["workflowId", "runId"] },
});
EventBusService.registerSchema({
  type: "workflow.run.succeeded", version: "1.0.0", producer: "windels-api",
  description: "Fired when a workflow run completes successfully.", consumers: ["audit", "analytics"],
  schema: { type: "object", properties: { workflowId: { type: "string" }, runId: { type: "string" }, durationMs: { type: "number" } }, required: ["workflowId", "runId"] },
});
EventBusService.registerSchema({
  type: "workflow.run.failed", version: "1.0.0", producer: "windels-api",
  description: "Fired when a workflow run fails.", consumers: ["audit", "notifications"],
  schema: { type: "object", properties: { workflowId: { type: "string" }, runId: { type: "string" }, error: { type: "string" } }, required: ["workflowId", "runId", "error"] },
});
EventBusService.registerSchema({
  type: "service.registered", version: "1.0.0", producer: "discovery",
  description: "Fired when a new service registers with the discovery registry.", consumers: ["audit", "discovery"],
  schema: { type: "object", properties: { serviceId: { type: "string" }, instanceId: { type: "string" } }, required: ["serviceId"] },
});
EventBusService.registerSchema({
  type: "message.created", version: "1.0.0", producer: "windels-api",
  description: "Fired when a chat message is created.", consumers: ["audit", "analytics", "notifications"],
  schema: { type: "object", properties: { conversationId: { type: "string" }, messageId: { type: "string" } }, required: ["conversationId", "messageId"] },
});
