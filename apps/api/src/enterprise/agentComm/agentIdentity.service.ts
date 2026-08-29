/**
 * AgentIdentityService — Slice 171.
 *
 * Maintains the canonical identity record for every AI employee beyond the
 * core `Agent` Prisma model (which owns name/role/department/capabilities).
 * We keep richer lifecycle state, credentials (masked), capability
 * attestations, and version history in Redis-backed in-memory storage so
 * the communication bus can look identities up synchronously on every hop.
 *
 * Falls back to synthesising an identity from the Agent row when no
 * explicit record has been registered yet.
 */
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { redisCmd } from "../../db/redis.js";
import { prisma } from "../../db/client.js";
import { logger } from "../../observability/logger.js";
import type {
  AgentIdentity, AgentLifecycle, AgentCapability, AgentCredential,
} from "@windels/shared/agentComm";

const KEY_PREFIX = "agentComm:identity:";
const CREDS_PREFIX = "agentComm:credentials:";
const INDEX_KEY = "agentComm:identities";

function idKey(agentId: string) { return KEY_PREFIX + agentId; }
function now() { return new Date().toISOString(); }

function maskKey(raw: string) {
  const tail = raw.slice(-8);
  return `windels-ag-${"•".repeat(4)}${tail}`;
}

/** Deterministic stub public key (base64 sha256 of the raw secret). */
function derivePublic(secret: string) {
  return createHash("sha256").update(secret).digest("base64");
}

export const AgentIdentityService = {
  /** Ensures an identity row exists for the given agent (synthesised from Agent prisma row if missing). */
  async ensure(agentId: string): Promise<AgentIdentity> {
    const existing = await this.get(agentId);
    if (existing) return existing;
    const agent = await prisma.agent.findUnique({ where: { id: agentId } }).catch(() => null);
    const identity: AgentIdentity = {
      agentId,
      displayName: agent?.name ?? `Agent ${agentId.slice(0, 8)}`,
      department: agent?.department ?? "General",
      lifecycle: "created",
      permissions: ["workspace.read", "memory.read", "memory.write"],
      capabilities: (agent?.capabilities ?? []).map((c: string) => ({ id: c, attestedAt: now(), attestedBy: "system", version: "1.0.0" })),
      credentials: [],
      version: "1.0.0",
      // These 0.5s are a deliberate EWMA prior, not invented telemetry, and
      // were checked before being left alone: `FeedbackService.applyScore`
      // updates them as `score * (1 - alpha) + signal * alpha` with
      // alpha = 0.2. Starting from 0 would make an agent's first upvote yield
      // 0.20 while its first downvote yields 0.00 — so a *praised* agent would
      // rank below the neutral midpoint and barely above a criticised one.
      // A neutral prior is the correct seed for this estimator.
      //
      // What must not happen is this prior leaking into reported *metrics* as
      // though it were measured; `FeedbackService.getMetrics` therefore reports
      // 0 for an agent with no recorded feedback rather than echoing 0.5.
      performanceScore: 0.5,
      reputationScore: 0.5,
      objectives: [],
      metadata: { synthesizedFromPrisma: true },
      updatedAt: now(),
    };
    await this.put(identity);
    return identity;
  },

  async get(agentId: string): Promise<AgentIdentity | null> {
    try {
      const raw = await redisCmd.get(idKey(agentId));
      if (raw) return JSON.parse(raw) as AgentIdentity;
    } catch { /* redis optional */ }
    return null;
  },

  async put(identity: AgentIdentity): Promise<void> {
    identity.updatedAt = now();
    try {
      await redisCmd.set(idKey(identity.agentId), JSON.stringify(identity));
      await redisCmd.sadd(INDEX_KEY, identity.agentId);
    } catch (e) { logger.warn("identity put redis failed", { error: (e as Error).message }); }
  },

  async list(): Promise<AgentIdentity[]> {
    let ids: string[] = [];
    try { ids = await redisCmd.smembers(INDEX_KEY); } catch { return []; }
    const out: AgentIdentity[] = [];
    for (const id of ids) {
      const i = await this.get(id);
      if (i) out.push(i);
    }
    return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  },

  async update(agentId: string, patch: Partial<Omit<AgentIdentity, "agentId" | "credentials" | "updatedAt">>): Promise<AgentIdentity | null> {
    const cur = await this.ensure(agentId);
    const next: AgentIdentity = {
      ...cur,
      ...patch,
      credentials: cur.credentials,
      metadata: { ...cur.metadata, ...(patch.metadata ?? {}) },
      updatedAt: now(),
    };
    await this.put(next);
    return next;
  },

  async transition(agentId: string, to: AgentLifecycle): Promise<AgentIdentity | null> {
    const cur = await this.ensure(agentId);
    const ts = now();
    const meta: Record<string, unknown> = { ...cur.metadata, lastTransition: { from: cur.lifecycle, to, at: ts } };
    const next: AgentIdentity = { ...cur, lifecycle: to, metadata: meta, updatedAt: ts };
    if (to === "trained" && !cur.trainedAt) next.trainedAt = ts;
    if (to === "active" && !cur.activatedAt) next.activatedAt = ts;
    if (to === "optimized") next.lastPromotedAt = ts;
    await this.put(next);
    return next;
  },

  async attestCapability(agentId: string, cap: Omit<AgentCapability, "attestedAt">): Promise<AgentIdentity | null> {
    const cur = await this.ensure(agentId);
    const attested: AgentCapability = { ...cap, attestedAt: now() };
    const idx = cur.capabilities.findIndex((c) => c.id === cap.id);
    if (idx >= 0) cur.capabilities[idx] = attested; else cur.capabilities.push(attested);
    await this.put(cur);
    return cur;
  },

  /** Mint an API key credential for an agent. Returns the raw key once. */
  async mintCredential(agentId: string, scopes: string[], ttlDays?: number): Promise<{ credential: AgentCredential; rawKey: string } | null> {
    const cur = await this.ensure(agentId);
    const rawKey = "windels-ag-" + randomBytes(24).toString("hex");
    const id = randomUUID();
    const cred: AgentCredential = {
      id,
      keyHint: maskKey(rawKey),
      publicKey: derivePublic(rawKey),
      scopes,
      createdAt: now(),
      expiresAt: ttlDays ? new Date(Date.now() + ttlDays * 86400_000).toISOString() : undefined,
    };
    cur.credentials = cur.credentials.filter((c) => c.id !== id).concat(cred);
    await this.put(cur);
    // Store hashed lookup for key-based auth.
    try {
      const hash = createHash("sha256").update(rawKey).digest("hex");
      await redisCmd.set(`${CREDS_PREFIX}lookup:${hash}`, JSON.stringify({ agentId, credentialId: id }));
    } catch { /* ignore */ }
    return { credential: cred, rawKey };
  },

  async revokeCredential(agentId: string, credentialId: string): Promise<AgentIdentity | null> {
    const cur = await this.get(agentId);
    if (!cur) return null;
    cur.credentials = cur.credentials.map((c) => c.id === credentialId ? { ...c, revokedAt: now() } : c);
    await this.put(cur);
    return cur;
  },

  /** Lookup an identity by a presented raw API key (internal service-auth). */
  async lookupByKey(rawKey: string): Promise<{ identity: AgentIdentity; credential: AgentCredential } | null> {
    try {
      const hash = createHash("sha256").update(rawKey).digest("hex");
      const raw = await redisCmd.get(`${CREDS_PREFIX}lookup:${hash}`);
      if (!raw) return null;
      const { agentId, credentialId } = JSON.parse(raw) as { agentId: string; credentialId: string };
      const identity = await this.ensure(agentId);
      const credential = identity.credentials.find((c) => c.id === credentialId);
      if (!credential || credential.revokedAt) return null;
      if (credential.expiresAt && new Date(credential.expiresAt).getTime() < Date.now()) return null;
      credential.lastUsedAt = now();
      await this.put(identity);
      return { identity, credential };
    } catch { return null; }
  },

  async remove(agentId: string): Promise<boolean> {
    try {
      await redisCmd.del(idKey(agentId));
      await redisCmd.srem(INDEX_KEY, agentId);
      return true;
    } catch { return false; }
  },

  async count(): Promise<number> {
    try { return await redisCmd.scard(INDEX_KEY); } catch { return 0; }
  },
};
