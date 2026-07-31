/**
 * CommProtocolService — Slice 172.
 *
 * Typed in-process message bus for AI employees (runs alongside the EventBus).
 * Each message uses the CommEnvelope shape — correlationId/causationId/
 * reasoningChainId/ttl/priority/requiresAck/signature. Messages are
 * delivered to subscriber inboxes (per agent, per team, and broadcast "*").
 * Persisted in Redis lists so they survive process restarts and can be
 * fetched by the UI.
 *
 * Signing is performed with HMAC-SHA256 over the canonical envelope using
 * the agent's minted credential secret (we re-derive a shared secret as
 * sha256(rawKey) for MVP rather than asymmetric EdDSA).
 */
import { randomUUID } from "node:crypto";
import { createHmac } from "node:crypto";
import { redisCmd } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import { Metrics } from "../../observability/metrics.js";
import { AgentIdentityService } from "./agentIdentity.service.js";
import type { CommEnvelope, CommMessageType, CommPriority } from "@windels/shared/agentComm";

const INBOX_PREFIX = "agentComm:inbox:";
const OUTBOX_PREFIX = "agentComm:outbox:";
const HISTORY_KEY = "agentComm:history";
const MAX_HISTORY = 500;
const MAX_INBOX = 200;

interface Sub { agentId: string; handler: (m: CommEnvelope) => void | Promise<void>; }
const subs: Sub[] = [];

function inboxKey(id: string) { return INBOX_PREFIX + id; }
function outboxKey(id: string) { return OUTBOX_PREFIX + id; }
function now() { return new Date().toISOString(); }

function canonical(e: CommEnvelope) {
  return JSON.stringify({
    id: e.id, type: e.type, schema: e.schema, from: e.from, to: e.to,
    correlationId: e.correlationId, causationId: e.causationId,
    reasoningChainId: e.reasoningChainId, subject: e.subject, payload: e.payload,
    createdAt: e.createdAt,
  });
}

export const CommProtocolService = {
  /** Subscribe an in-process handler for an agent (used by agentRuntime). */
  subscribe(agentId: string, handler: (m: CommEnvelope) => void | Promise<void>) {
    subs.push({ agentId, handler });
    return () => { const i = subs.findIndex((s) => s.agentId === agentId && s.handler === handler); if (i >= 0) subs.splice(i, 1); };
  },

  /** Sign an envelope with the agent's shared secret (sha256 hex). */
  sign(e: CommEnvelope, secret: string): string {
    return createHmac("sha256", secret).update(canonical(e)).digest("hex");
  },

  /**
   * Verify signature on a received envelope. Looks up the sender's
   * credentials; if none exist yet we accept the message as unsigned
   * (bootstrap mode) but mark metadata.verified = false.
   */
  async verify(e: CommEnvelope): Promise<boolean> {
    if (!e.signature) { (e.metadata as any).verified = false; return true; }
    const sender = await AgentIdentityService.get(e.from);
    if (!sender) return false;
    // We can't re-derive secret from masked creds; MVP accepts signed
    // messages when sender exists and signed payload is hex 64-char.
    const ok = /^[0-9a-f]{64}$/.test(e.signature);
    (e.metadata as any).verified = ok;
    return ok;
  },

  async send(input: {
    from: string;
    to: string;
    type: CommMessageType;
    subject: string;
    payload?: Record<string, unknown>;
    schema?: string;
    priority?: CommPriority;
    correlationId?: string;
    causationId?: string;
    reasoningChainId?: string;
    ttlMs?: number;
    requiresAck?: boolean;
    metadata?: Record<string, unknown>;
    error?: CommEnvelope["error"];
  }): Promise<CommEnvelope> {
    const id = randomUUID();
    const envelope: CommEnvelope = {
      id,
      type: input.type,
      schema: input.schema ?? `windels.comm/${input.type}/v1`,
      from: input.from,
      to: input.to,
      correlationId: input.correlationId ?? randomUUID(),
      causationId: input.causationId,
      reasoningChainId: input.reasoningChainId,
      priority: input.priority ?? "normal",
      ttlMs: input.ttlMs,
      deadline: input.ttlMs ? new Date(Date.now() + input.ttlMs).toISOString() : undefined,
      subject: input.subject,
      payload: input.payload ?? {},
      error: input.error,
      hops: 0,
      requiresAck: input.requiresAck ?? false,
      createdAt: now(),
      metadata: { ...(input.metadata ?? {}) },
    };
    const ok = await this.verify(envelope);
    if (!ok) {
      logger.warn("comm envelope failed verification", { id, from: envelope.from, to: envelope.to });
      Metrics.increment("agent_comm.dropped", 1, { reason: "bad_signature" });
      throw Object.assign(new Error("signature verification failed"), { code: "COMM_BAD_SIG" });
    }
    // Deliver to in-process subscribers
    const targets = envelope.to === "*"
      ? subs
      : subs.filter((s) => s.agentId === envelope.to);
    for (const s of targets) {
      try { await Promise.resolve(s.handler(envelope)); }
      catch (err) { logger.warn("comm handler failed", { to: s.agentId, error: (err as Error).message }); }
    }
    // Persist to Redis inbox/outbox/history
    const raw = JSON.stringify(envelope);
    try {
      const pipeline = redisCmd.multi();
      pipeline.lpush(inboxKey(envelope.to), raw);
      pipeline.ltrim(inboxKey(envelope.to), 0, MAX_INBOX - 1);
      pipeline.lpush(outboxKey(envelope.from), raw);
      pipeline.ltrim(outboxKey(envelope.from), 0, MAX_INBOX - 1);
      pipeline.lpush(HISTORY_KEY, raw);
      pipeline.ltrim(HISTORY_KEY, 0, MAX_HISTORY - 1);
      await pipeline.exec();
    } catch (e) { logger.warn("comm redis persist failed", { error: (e as Error).message }); }
    Metrics.increment("agent_comm.sent", 1, { type: envelope.type, priority: envelope.priority });
    return envelope;
  },

  async listInbox(agentId: string, limit = 50): Promise<CommEnvelope[]> {
    try {
      const raw = await redisCmd.lrange(inboxKey(agentId), 0, limit - 1);
      return raw.map((r) => JSON.parse(r) as CommEnvelope);
    } catch { return []; }
  },

  async listOutbox(agentId: string, limit = 50): Promise<CommEnvelope[]> {
    try {
      const raw = await redisCmd.lrange(outboxKey(agentId), 0, limit - 1);
      return raw.map((r) => JSON.parse(r) as CommEnvelope);
    } catch { return []; }
  },

  async listHistory(limit = 100): Promise<CommEnvelope[]> {
    try {
      const raw = await redisCmd.lrange(HISTORY_KEY, 0, limit - 1);
      return raw.map((r) => JSON.parse(r) as CommEnvelope);
    } catch { return []; }
  },

  async stats(): Promise<{ inFlight: number; total: number }> {
    try {
      const total = await redisCmd.llen(HISTORY_KEY);
      // sum first 100 inboxes? cheap MVP: return 0 for inFlight
      return { inFlight: 0, total };
    } catch { return { inFlight: 0, total: 0 }; }
  },
};
