/**
 * TenantsService — Slices 249 + 250:
 * Multi-Tenant Platform + Tenant Isolation.
 * Tenant lifecycle, plans, isolation levels, data residency.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Tenant, TenantPlan, TenantStatus, IsolationLevel } from "@windels/shared";

const LIST   = "psvc:tenants";
const DETAIL = (id: string) => `psvc:tenant:${id}`;
const BY_SLUG = "psvc:tenant:slug";

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

export const TenantsService = {
  async list(filter?: { status?: TenantStatus; plan?: TenantPlan; q?: string }): Promise<Tenant[]> {
    const ids = await redis.smembers(LIST);
    const out: Tenant[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (!raw) continue;
      const t = JSON.parse(raw) as Tenant;
      if (filter?.status && t.status !== filter.status) continue;
      if (filter?.plan && t.plan !== filter.plan) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !t.slug.toLowerCase().includes(q) && !t.displayName.toLowerCase().includes(q)) continue;
      }
      out.push(t);
    }
    return out.sort((a,b) => b.mrr - a.mrr);
  },

  async get(id: string): Promise<Tenant | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as Tenant) : null;
  },

  async findBySlug(slug: string): Promise<Tenant | null> {
    const id = await redis.hget(BY_SLUG, slug);
    return id ? this.get(id) : null;
  },

  async create(input: Omit<Tenant, "id"|"createdAt"|"seatsUsed"|"usersActive30d"|"mrr"|"isolated"|"flags">): Promise<Tenant> {
    const id = randomUUID();
    const t: Tenant = {
      id, createdAt: iso(), seatsUsed: 0, usersActive30d: 0, mrr: 0,
      isolated: input.isolation !== "shared", flags: {}, ...input,
    };
    await redis.set(DETAIL(id), SER(t));
    await redis.sadd(LIST, id);
    await redis.hset(BY_SLUG, t.slug, id);
    return t;
  },

  async update(id: string, patch: Partial<Tenant>): Promise<Tenant | null> {
    const t = await this.get(id);
    if (!t) return null;
    Object.assign(t, patch);
    t.isolated = t.isolation !== "shared";
    await redis.set(DETAIL(id), SER(t));
    if (patch.slug) await redis.hset(BY_SLUG, t.slug, id);
    return t;
  },

  async setIsolation(id: string, level: IsolationLevel): Promise<Tenant | null> {
    return this.update(id, { isolation: level });
  },

  async summary(): Promise<{ total: number; active: number; isolated: number; totalMrr: number; totalSeats: number }> {
    const all = await this.list();
    return {
      total: all.length,
      active: all.filter(t => t.status === "active").length,
      isolated: all.filter(t => t.isolated).length,
      totalMrr: all.reduce((a,t)=>a+t.mrr, 0),
      totalSeats: all.reduce((a,t)=>a+t.seats, 0),
    };
  },
};
