/**
 * FeatureFlagsService — Slices 246 + 253:
 * Feature Flags + Feature Management.
 * Rollout strategies (boolean/percentage/segment/tenant/kill-switch),
 * per-subject overrides, versioning, and evaluation.
 */
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { FeatureFlag, FlagRolloutStrategy, FlagStatus } from "@windels/shared";

const LIST   = "psvc:flags";
const DETAIL = (id: string) => `psvc:flag:${id}`;
const BY_KEY = "psvc:flag:bykey";
const EVALS  = "psvc:flag:evals";

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

function bucket(subject: string, key: string): number {
  const h = createHash("sha1").update(`${key}:${subject}`).digest("hex");
  return parseInt(h.slice(0, 8), 16) % 100;
}

export const FeatureFlagsService = {
  async list(filter?: { status?: FlagStatus; q?: string }): Promise<FeatureFlag[]> {
    const ids = await redis.smembers(LIST);
    const out: FeatureFlag[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (!raw) continue;
      const f = JSON.parse(raw) as FeatureFlag;
      if (filter?.status && f.status !== filter.status) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!f.key.toLowerCase().includes(q) && !f.name.toLowerCase().includes(q) && !f.description.toLowerCase().includes(q)) continue;
      }
      out.push(f);
    }
    return out.sort((a,b) => a.key.localeCompare(b.key));
  },

  async get(id: string): Promise<FeatureFlag | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as FeatureFlag) : null;
  },

  async findByKey(key: string): Promise<FeatureFlag | null> {
    const id = await redis.hget(BY_KEY, key);
    return id ? this.get(id) : null;
  },

  async create(input: Omit<FeatureFlag, "id"|"createdAt"|"updatedAt"|"version">): Promise<FeatureFlag> {
    const id = randomUUID();
    const now = iso();
    const f: FeatureFlag = {
      id, version: 1, createdAt: now, updatedAt: now, ...input,
    };
    await redis.set(DETAIL(id), SER(f));
    await redis.sadd(LIST, id);
    await redis.hset(BY_KEY, f.key, id);
    return f;
  },

  async update(id: string, patch: Partial<FeatureFlag>): Promise<FeatureFlag | null> {
    const f = await this.get(id);
    if (!f) return null;
    Object.assign(f, patch);
    f.version += 1;
    f.updatedAt = iso();
    await redis.set(DETAIL(id), SER(f));
    if (patch.key) await redis.hset(BY_KEY, f.key, id);
    return f;
  },

  async setEnabled(id: string, enabled: boolean): Promise<FeatureFlag | null> {
    return this.update(id, { enabled, status: enabled ? "active" : "paused" });
  },

  async remove(id: string): Promise<boolean> {
    const f = await this.get(id);
    if (!f) return false;
    await redis.del(DETAIL(id));
    await redis.srem(LIST, id);
    await redis.hdel(BY_KEY, f.key);
    return true;
  },

  async evaluate(key: string, ctx: { userId?: string; orgId?: string; tenantId?: string; segment?: string }): Promise<boolean> {
    const f = await this.findByKey(key);
    if (!f) return false;
    if (f.status !== "active") return false;

    // overrides take precedence
    for (const o of f.overrides) {
      if (o.kind === "user" && ctx.userId === o.subject) return o.enabled;
      if (o.kind === "org" && ctx.orgId === o.subject) return o.enabled;
      if (o.kind === "tenant" && ctx.tenantId === o.subject) return o.enabled;
      if (o.kind === "segment" && ctx.segment === o.subject) return o.enabled;
    }

    if (f.strategy === "boolean" || f.strategy === "kill-switch") return f.enabled;
    if (f.strategy === "tenant") return f.enabled && !!ctx.tenantId;
    if (f.strategy === "percentage") {
      const subject = ctx.userId ?? ctx.orgId ?? ctx.tenantId ?? "__anon__";
      return bucket(subject, f.key) < f.rolloutPct;
    }
    if (f.strategy === "user-segment" || f.strategy === "org-segment") {
      return f.enabled && f.segments.includes(ctx.segment ?? "");
    }
    return f.enabled;
  },

  async countByStatus(): Promise<Record<string, number>> {
    const all = await this.list();
    const out: Record<string, number> = {};
    for (const f of all) out[f.status] = (out[f.status] ?? 0) + 1;
    return out;
  },

  async bumpEval(key: string, matched: boolean) {
    await redis.hincrby(EVALS, `${key}::total`, 1);
    if (matched) await redis.hincrby(EVALS, `${key}::hit`, 1);
  },
};
