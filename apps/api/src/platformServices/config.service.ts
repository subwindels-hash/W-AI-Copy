/**
 * ConfigService — Slices 245 + 247:
 * Configuration Platform + Runtime Configuration.
 * Scoped (global/org/user/tenant/environment), typed, encrypted-aware,
 * with hot-reloadable runtime overrides that apply without process restart.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { ConfigEntry, ConfigScope, ConfigValueType, ConfigSource } from "@windels/shared";

const LIST     = "psvc:config";
const DETAIL   = (id: string) => `psvc:config:${id}`;
const BY_KEY   = "psvc:config:bykey"; // scope + "::" + key -> id
const RUNTIME  = "psvc:config:runtime";

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

export const ConfigService = {
  async list(filter?: { scope?: ConfigScope; hotReload?: boolean; q?: string }): Promise<ConfigEntry[]> {
    const ids = await redis.smembers(LIST);
    const out: ConfigEntry[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (!raw) continue;
      const c = JSON.parse(raw) as ConfigEntry;
      if (filter?.scope && c.scope !== filter.scope) continue;
      if (filter?.hotReload !== undefined && c.hotReload !== filter.hotReload) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!c.key.toLowerCase().includes(q) && !c.description.toLowerCase().includes(q)) continue;
      }
      out.push(c);
    }
    return out.sort((a,b) => a.key.localeCompare(b.key));
  },

  async get(id: string): Promise<ConfigEntry | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as ConfigEntry) : null;
  },

  async resolve(scope: ConfigScope, key: string): Promise<ConfigEntry | null> {
    const id = await redis.hget(BY_KEY, `${scope}::${key}`);
    return id ? this.get(id) : null;
  },

  async upsert(input: {
    key: string; scope: ConfigScope; valueType: ConfigValueType;
    value: unknown; defaultValue?: unknown; description: string;
    source?: ConfigSource; encrypted?: boolean; hotReload?: boolean;
    tags?: string[]; updatedBy?: string;
  }): Promise<ConfigEntry> {
    const existing = await this.resolve(input.scope, input.key);
    const now = iso();
    if (existing) {
      existing.value = input.value;
      if (input.defaultValue !== undefined) existing.defaultValue = input.defaultValue;
      existing.description = input.description;
      if (input.source) existing.source = input.source;
      if (input.encrypted !== undefined) existing.encrypted = input.encrypted;
      if (input.hotReload !== undefined) existing.hotReload = input.hotReload;
      if (input.tags) existing.tags = input.tags;
      existing.updatedAt = now;
      existing.updatedBy = input.updatedBy ?? "system";
      await redis.set(DETAIL(existing.id), SER(existing));
      if (existing.hotReload) await redis.hset(RUNTIME, existing.key, SER(existing.value));
      return existing;
    }
    const id = randomUUID();
    const c: ConfigEntry = {
      id, key: input.key, scope: input.scope, valueType: input.valueType,
      value: input.value, defaultValue: input.defaultValue,
      description: input.description, source: input.source ?? "db",
      encrypted: !!input.encrypted, hotReload: !!input.hotReload,
      updatedAt: now, updatedBy: input.updatedBy ?? "system",
      tags: input.tags ?? [],
    };
    await redis.set(DETAIL(id), SER(c));
    await redis.sadd(LIST, id);
    await redis.hset(BY_KEY, `${c.scope}::${c.key}`, id);
    if (c.hotReload) await redis.hset(RUNTIME, c.key, SER(c.value));
    return c;
  },

  async setRuntimeOverride(key: string, value: unknown, actor = "admin"): Promise<ConfigEntry | null> {
    const c = await this.resolve("global", key);
    if (!c) return null;
    c.value = value; c.source = "runtime"; c.hotReload = true;
    c.updatedAt = iso(); c.updatedBy = actor;
    await redis.set(DETAIL(c.id), SER(c));
    await redis.hset(RUNTIME, key, SER(value));
    return c;
  },

  async runtimeOverrides(): Promise<Record<string, unknown>> {
    const raw = await redis.hgetall(RUNTIME);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      try { out[k] = JSON.parse(v); } catch { out[k] = v; }
    }
    return out;
  },

  async hotReloadableCount(): Promise<number> {
    return (await this.list({ hotReload: true })).length;
  },
};
