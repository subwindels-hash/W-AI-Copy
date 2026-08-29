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
import { createHmac, timingSafeEqual } from "node:crypto";
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
   * Verify the signature on a received envelope.
   *
   * ── WHAT THIS DOES AND DOES NOT PROVE ────────────────────────────────
   * The shared type documents `signature` as "proves sender owns the key".
   * The previous implementation did not check that: it tested the string
   * against `/^[0-9a-f]{64}$/`, so **any** 64-character hex string passed. An
   * attacker forging a message needed only to attach 64 arbitrary hex
   * characters, and the envelope came out the far side stamped
   * `metadata.verified = true` — a stronger claim than an unsigned message,
   * on no evidence at all.
   *
   * The root cause is real and not fixable here: credentials are stored
   * masked (`keyHint`) with only a derived `publicKey`, so the shared secret
   * cannot be re-derived to recompute the HMAC. Rather than keep a check that
   * launders a format test into an authenticity claim, verification is now
   * explicit about what it knows:
   *
   *   - no signature            → accepted, `verified: false` (bootstrap mode,
   *                               unchanged behaviour)
   *   - signature, unknown sender → rejected
   *   - signature, secret available via `resolveSecret` → really verified
   *   - signature, no secret available → accepted for delivery but
   *                               `verified: false` and `signatureChecked:
   *                               false`, so nothing downstream may treat it
   *                               as authenticated
   *
   * Wire `resolveSecret` to a secret store to turn on genuine verification;
   * `sign()` above already computes the matching HMAC.
   */
  async verify(e: CommEnvelope): Promise<boolean> {
    const meta = e.metadata as Record<string, unknown>;
    if (!e.signature) { meta.verified = false; meta.signatureChecked = false; return true; }

    const sender = await AgentIdentityService.get(e.from);
    if (!sender) { meta.verified = false; meta.signatureChecked = true; return false; }

    const secret = await this.resolveSecret?.(e.from);
    if (!secret) {
      // Cannot check it. Say so, instead of asserting the signature is good.
      meta.verified = false;
      meta.signatureChecked = false;
      return true;
    }

    const expected = this.sign(e, secret);
    // Constant-time compare — a length-safe equality check on two hex digests.
    const ok = expected.length === e.signature.length
      && timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(e.signature, "utf8"));
    meta.verified = ok;
    meta.signatureChecked = true;
    return ok;
  },

  /**
   * Resolve an agent's shared signing secret. Undefined by default: no secret
   * store is wired up, and returning a guess here is what produced the
   * fake-verification behaviour above. Assign this to enable real checking.
   */
  resolveSecret: undefined as undefined | ((agentId: string) => Promise<string | null>),

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
