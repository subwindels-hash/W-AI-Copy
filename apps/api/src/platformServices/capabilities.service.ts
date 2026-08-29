/**
 * CapabilitiesService — Slice 255: Capability Registry.
 * Auto-discovered service/module/API/skill/agent capabilities with
 * health, SLA, throughput tracking.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { CapabilityRecord, CapabilityKind, CapabilityHealth } from "@windels/shared";

const LIST   = "psvc:caps";
const DETAIL = (id: string) => `psvc:cap:${id}`;
const BY_NAME = "psvc:cap:name";

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

export const CapabilitiesService = {
  async list(filter?: { kind?: CapabilityKind; health?: CapabilityHealth; producer?: string }): Promise<CapabilityRecord[]> {
    const ids = await redis.smembers(LIST);
    const out: CapabilityRecord[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (!raw) continue;
      const c = JSON.parse(raw) as CapabilityRecord;
      if (filter?.kind && c.kind !== filter.kind) continue;
      if (filter?.health && c.health !== filter.health) continue;
      if (filter?.producer && c.producer !== filter.producer) continue;
      out.push(c);
    }
    return out.sort((a,b)=>a.name.localeCompare(b.name));
  },

  async get(id: string): Promise<CapabilityRecord | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as CapabilityRecord) : null;
  },

  async findByName(name: string): Promise<CapabilityRecord | null> {
    const id = await redis.hget(BY_NAME, name);
    return id ? this.get(id) : null;
  },

  async register(input: Omit<CapabilityRecord, "id"|"updatedAt">): Promise<CapabilityRecord> {
    const existing = await this.findByName(input.name);
    if (existing) {
      Object.assign(existing, input, { updatedAt: iso() });
      await redis.set(DETAIL(existing.id), SER(existing));
      return existing;
    }
    const id = randomUUID();
    const c: CapabilityRecord = { id, updatedAt: iso(), ...input };
    await redis.set(DETAIL(id), SER(c));
    await redis.sadd(LIST, id);
    await redis.hset(BY_NAME, c.name, id);
    return c;
  },

  async reportHealth(name: string, health: CapabilityHealth, p95Ms?: number, errPct?: number, rpm?: number): Promise<CapabilityRecord | null> {
    const c = await this.findByName(name);
    if (!c) return null;
    c.health = health;
    if (p95Ms !== undefined) c.p95Ms = p95Ms;
    if (errPct !== undefined) c.errorRatePct = errPct;
    if (rpm !== undefined) c.requestsPerMin = rpm;
    c.updatedAt = iso();
    await redis.set(DETAIL(c.id), SER(c));
    return c;
  },

  async healthyCount(): Promise<{ total: number; healthy: number; degraded: number; down: number }> {
    const all = await this.list();
    return {
      total: all.length,
      healthy: all.filter(c=>c.health==="healthy").length,
      degraded: all.filter(c=>c.health==="degraded").length,
      down: all.filter(c=>c.health==="down").length,
    };
  },
};
