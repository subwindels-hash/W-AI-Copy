/**
 * OntologyService — Slice 256: Semantic Ontology.
 * Shared vocabulary of classes with typed properties, parent hierarchy,
 * used across AI agents, skills, and search.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { OntologyClass, OntologyProperty } from "@windels/shared";

const LIST   = "psvc:onto";
const DETAIL = (id: string) => `psvc:onto:${id}`;
const BY_URI = "psvc:onto:uri";

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

export const OntologyService = {
  async list(filter?: { parentUri?: string; q?: string }): Promise<OntologyClass[]> {
    const ids = await redis.smembers(LIST);
    const out: OntologyClass[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (!raw) continue;
      const o = JSON.parse(raw) as OntologyClass;
      if (filter?.parentUri && o.parentUri !== filter.parentUri) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!o.label.toLowerCase().includes(q) && !o.uri.toLowerCase().includes(q) && !o.description.toLowerCase().includes(q)) continue;
      }
      out.push(o);
    }
    return out.sort((a,b) => a.label.localeCompare(b.label));
  },

  async get(id: string): Promise<OntologyClass | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as OntologyClass) : null;
  },

  async findByUri(uri: string): Promise<OntologyClass | null> {
    const id = await redis.hget(BY_URI, uri);
    return id ? this.get(id) : null;
  },

  async define(input: Omit<OntologyClass, "id"|"instances"|"updatedAt">): Promise<OntologyClass> {
    const existing = await this.findByUri(input.uri);
    if (existing) {
      existing.label = input.label;
      existing.parentUri = input.parentUri;
      existing.description = input.description;
      existing.color = input.color; existing.icon = input.icon;
      existing.properties = input.properties;
      existing.aliases = input.aliases;
      existing.updatedAt = iso();
      await redis.set(DETAIL(existing.id), SER(existing));
      return existing;
    }
    const id = randomUUID();
    const o: OntologyClass = { id, instances: 0, updatedAt: iso(), ...input };
    await redis.set(DETAIL(id), SER(o));
    await redis.sadd(LIST, id);
    await redis.hset(BY_URI, o.uri, id);
    return o;
  },

  async incrementInstances(uri: string, by = 1): Promise<OntologyClass | null> {
    const o = await this.findByUri(uri);
    if (!o) return null;
    o.instances += by;
    o.updatedAt = iso();
    await redis.set(DETAIL(o.id), SER(o));
    return o;
  },

  async summary(): Promise<{ classes: number; properties: number }> {
    const all = await this.list();
    return { classes: all.length, properties: all.reduce((a,o)=>a+o.properties.length,0) };
  },
};
