/**
 * PoliciesService — Slices 248 + 254:
 * Policy Management + Runtime Policy Engine.
 * Typed allow/deny/enforce/audit/throttle/block policies with condition
 * evaluation. Other services can call evaluate() at request time.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Policy, PolicyCondition, PolicyEffect, PolicyStatus, PolicyType, PolicyEvaluationResult, ConfigScope } from "@windels/shared";

const LIST   = "psvc:policies";
const DETAIL = (id: string) => `psvc:policy:${id}`;
const BY_KEY = "psvc:policy:bykey";
const STATS  = "psvc:policy:stats"; // hkey=policyId -> {evals,viol}

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

function testOp(actual: unknown, cond: PolicyCondition): boolean {
  const v = cond.value;
  switch (cond.op) {
    case "eq": return actual === v;
    case "neq": return actual !== v;
    case "gt": return typeof actual === "number" && typeof v === "number" && actual > v;
    case "gte": return typeof actual === "number" && typeof v === "number" && actual >= v;
    case "lt": return typeof actual === "number" && typeof v === "number" && actual < v;
    case "lte": return typeof actual === "number" && typeof v === "number" && actual <= v;
    case "in": return Array.isArray(v) && v.includes(actual);
    case "not_in": return Array.isArray(v) && !v.includes(actual);
    case "contains": return typeof actual === "string" && typeof v === "string" && actual.includes(v);
    case "regex": try { return typeof actual === "string" && new RegExp(String(v)).test(actual); } catch { return false; }
    case "exists": return actual !== undefined && actual !== null;
  }
  return false;
}

export const PoliciesService = {
  async list(filter?: { type?: PolicyType; status?: PolicyStatus; q?: string }): Promise<Policy[]> {
    const ids = await redis.smembers(LIST);
    const out: Policy[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (!raw) continue;
      const p = JSON.parse(raw) as Policy;
      if (filter?.type && p.type !== filter.type) continue;
      if (filter?.status && p.status !== filter.status) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!p.key.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) continue;
      }
      out.push(p);
    }
    return out.sort((a,b) => b.priority - a.priority);
  },

  async get(id: string): Promise<Policy | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as Policy) : null;
  },

  async findByKey(key: string): Promise<Policy | null> {
    const id = await redis.hget(BY_KEY, key);
    return id ? this.get(id) : null;
  },

  async create(input: Omit<Policy, "id"|"version"|"violations30d"|"evaluations30d"|"updatedAt"|"activeSince">): Promise<Policy> {
    const id = randomUUID();
    const now = iso();
    const p: Policy = {
      id, version: 1, violations30d: 0, evaluations30d: 0, updatedAt: now,
      activeSince: input.status === "active" ? now : undefined,
      ...input,
    };
    await redis.set(DETAIL(id), SER(p));
    await redis.sadd(LIST, id);
    await redis.hset(BY_KEY, p.key, id);
    return p;
  },

  async update(id: string, patch: Partial<Policy>): Promise<Policy | null> {
    const p = await this.get(id);
    if (!p) return null;
    Object.assign(p, patch);
    p.version += 1;
    if (patch.status === "active" && !p.activeSince) p.activeSince = iso();
    p.updatedAt = iso();
    await redis.set(DETAIL(id), SER(p));
    return p;
  },

  async remove(id: string): Promise<boolean> {
    const p = await this.get(id);
    if (!p) return false;
    await redis.del(DETAIL(id));
    await redis.srem(LIST, id);
    await redis.hdel(BY_KEY, p.key);
    return true;
  },

  async evaluateAll(context: Record<string, unknown>): Promise<PolicyEvaluationResult[]> {
    const all = await this.list({ status: "active" });
    const results: PolicyEvaluationResult[] = [];
    for (const p of all) {
      let matched = true;
      let reason: string | undefined;
      for (const c of p.conditions) {
        const actual = context[c.field];
        if (!testOp(actual, c)) { matched = false; break; }
      }
      if (matched && p.effect === "deny" || p.effect === "block" || p.effect === "throttle") reason = `matched policy ${p.key}`;
      p.evaluations30d += 1;
      if (matched && (p.effect === "deny" || p.effect === "block")) p.violations30d += 1;
      await redis.set(DETAIL(p.id), SER(p));
      results.push({ policyId: p.id, key: p.key, effect: p.effect, matched, reason });
    }
    return results;
  },

  async evaluateAction(context: Record<string, unknown>): Promise<{ allow: boolean; deniedBy?: PolicyEvaluationResult }> {
    const results = await this.evaluateAll(context);
    const deny = results.find(r => r.matched && (r.effect === "deny" || r.effect === "block"));
    if (deny) return { allow: false, deniedBy: deny };
    return { allow: true };
  },

  async stats(): Promise<{ active: number; evaluations24h: number; violations24h: number }> {
    const all = await this.list();
    const active = all.filter(p => p.status === "active").length;
    return {
      active,
      evaluations24h: all.reduce((a,p)=>a+p.evaluations30d,0),
      violations24h: all.reduce((a,p)=>a+p.violations30d,0),
    };
  },
};
