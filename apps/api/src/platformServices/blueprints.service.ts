/**
 * BlueprintsService — Slice 257: Blueprint Library.
 * Pre-composed solution templates combining modules/agents/skills/workflows/dashboards,
 * deployable to new tenants in minutes.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Blueprint, BlueprintCategory, BlueprintCompatibility } from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('platformServices:blueprints');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const LIST   = "psvc:bps";
const DETAIL = (id: string) => `psvc:bp:${id}`;
const BY_SLUG = "psvc:bp:slug";

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

export const BlueprintsService = {
  async list(filter?: { category?: BlueprintCategory; q?: string; industry?: string }): Promise<Blueprint[]> {
    const ids = await redis.smembers(LIST);
    const out: Blueprint[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (!raw) continue;
      const b = JSON.parse(raw) as Blueprint;
      if (filter?.category && b.category !== filter.category) continue;
      if (filter?.industry && b.industry !== filter.industry) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!b.name.toLowerCase().includes(q) && !b.tagline.toLowerCase().includes(q) && !b.description.toLowerCase().includes(q)) continue;
      }
      out.push(b);
    }
    return out.sort((a,b)=>b.installs - a.installs);
  },

  async get(id: string): Promise<Blueprint | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as Blueprint) : null;
  },

  async findBySlug(slug: string): Promise<Blueprint | null> {
    const id = await redis.hget(BY_SLUG, slug);
    return id ? this.get(id) : null;
  },

  async publish(input: Omit<Blueprint, "id"|"installs"|"stars"|"updatedAt">): Promise<Blueprint> {
    _rng.reseed(`publish:${input}`);
    const existing = await this.findBySlug(input.slug);
    if (existing) {
      Object.assign(existing, input, { updatedAt: iso() });
      await redis.set(DETAIL(existing.id), SER(existing));
      return existing;
    }
    const id = randomUUID();
    const b: Blueprint = { id, installs: 0, stars: 8 + Math.floor(_rng.next()*40), updatedAt: iso(), ...input };
    await redis.set(DETAIL(id), SER(b));
    await redis.sadd(LIST, id);
    await redis.hset(BY_SLUG, b.slug, id);
    return b;
  },

  async install(id: string): Promise<Blueprint | null> {
    const b = await this.get(id);
    if (!b) return null;
    b.installs += 1;
    b.updatedAt = iso();
    await redis.set(DETAIL(id), SER(b));
    return b;
  },

  async counts(): Promise<{ total: number; certified: number }> {
    const all = await this.list();
    return { total: all.length, certified: all.filter(b=>b.certified!=="community").length };
  },
};
