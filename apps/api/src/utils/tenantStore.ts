/**
 * Tenant-scoped Redis-backed store used by DEMO modules that need a real
 * writeable endpoint on top of their existing seed data.
 *
 * Each store is keyed by  `<prefix>:<orgId>:*` — writes stay inside the
 * organization, reads never leak across tenants.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";

export interface TenantStoreOptions {
  /** Redis key prefix, e.g. "quantum:jobs" */
  prefix: string;
  /** id prefix, e.g. "qj-" — collisions checked via randomUUID */
  idPrefix?: string;
}

export interface Stored<T> {
  id: string;
  organizationId: string;
  createdAt: string;
  createdBy?: string;
  data: T;
}

export function tenantStore<T extends Record<string, unknown>>(opts: TenantStoreOptions) {
  const P = opts.prefix;
  const setKey = (org: string) => `${P}:idx:${org}`;
  const itemKey = (org: string, id: string) => `${P}:i:${org}:${id}`;
  const uid = () => (opts.idPrefix ?? "") + randomUUID().slice(0, 8);

  return {
    async create(organizationId: string, data: T, createdBy?: string): Promise<Stored<T>> {
      const rec: Stored<T> = {
        id: uid(), organizationId, createdAt: new Date().toISOString(),
        createdBy, data,
      };
      await redis.hset(itemKey(organizationId, rec.id), "_doc", JSON.stringify(rec));
      await redis.zadd(setKey(organizationId), Date.now(), rec.id);
      return rec;
    },

    async get(organizationId: string, id: string): Promise<Stored<T> | null> {
      const raw = await redis.hget(itemKey(organizationId, id), "_doc");
      if (!raw) return null;
      const rec = JSON.parse(raw) as Stored<T>;
      return rec.organizationId === organizationId ? rec : null;
    },

    async update(organizationId: string, id: string, patch: Partial<T>): Promise<Stored<T> | null> {
      const cur = await this.get(organizationId, id);
      if (!cur) return null;
      cur.data = { ...cur.data, ...patch };
      await redis.hset(itemKey(organizationId, id), "_doc", JSON.stringify(cur));
      return cur;
    },

    async delete(organizationId: string, id: string): Promise<boolean> {
      const cur = await this.get(organizationId, id);
      if (!cur) return false;
      await redis.del(itemKey(organizationId, id));
      await redis.zrem(setKey(organizationId), id);
      return true;
    },

    async list(organizationId: string, limit = 100): Promise<Stored<T>[]> {
      const ids = await redis.zrange(setKey(organizationId), 0, -1, "REV");
      const out: Stored<T>[] = [];
      for (const id of ids.slice(0, limit)) {
        const r = await redis.hget(itemKey(organizationId, id), "_doc");
        if (r) {
          const rec = JSON.parse(r) as Stored<T>;
          if (rec.organizationId === organizationId) out.push(rec);
        }
      }
      return out;
    },

    async count(organizationId: string): Promise<number> {
      return redis.zcard(setKey(organizationId));
    },
  };
}
