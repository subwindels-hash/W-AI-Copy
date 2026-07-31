/**
 * Knowledge Graph service (Slices 167 + 169).
 *
 * In-memory + Redis graph store for typed entities and directed relations.
 * Supports CRUD, upsert-by-natural-key, bidirectional traversal with depth
 * limit, simple tag/full-text search, provenance tracking, and graph stats.
 *
 * Intentionally MVP: no actual graph DB or embeddings yet (those land when
 * the vector store ships in later sessions). Text search is a case-insensitive
 * substring match over name + attributes JSON; tags are exact matches.
 */
import { randomUUID } from "node:crypto";
import { redis } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import type {
  KGEntity,
  KGRelation,
  EntityKind,
  RelationKind,
  KGQuery,
  KGTriple,
} from "@windels/shared/dataPlatform";

const EKEY = "enterprise:kg:entities";
const RKEY = "enterprise:kg:relations";

const entities = new Map<string, KGEntity>();
const relations = new Map<string, KGRelation>();
// adjacency indexes
const outbound = new Map<string, Set<string>>(); // entityId -> relationIds
const inbound = new Map<string, Set<string>>();

function indexAdd(idx: Map<string, Set<string>>, k: string, v: string) {
  if (!idx.has(k)) idx.set(k, new Set());
  idx.get(k)!.add(v);
}

async function persist() {
  try {
    await redis.set(EKEY, JSON.stringify([...entities.values()]));
    await redis.set(RKEY, JSON.stringify([...relations.values()]));
  } catch { /* ignore */ }
}
async function restore() {
  try {
    const [eraw, rraw] = await Promise.all([redis.get(EKEY), redis.get(RKEY)]);
    if (eraw) for (const e of JSON.parse(eraw) as KGEntity[]) { entities.set(e.id, e); indexAdjForEntity(e); }
    if (rraw) for (const r of JSON.parse(rraw) as KGRelation[]) { relations.set(r.id, r); indexAdjForRelation(r); }
  } catch { /* ignore */ }
}
function indexAdjForEntity(_e: KGEntity) { /* no-op; adjacency built from relations */ }
function indexAdjForRelation(r: KGRelation) {
  indexAdd(outbound, r.from, r.id);
  indexAdd(inbound, r.to, r.id);
}

// ── Seed ──────────────────────────────────────────────────────────────
function seed() {
  const now = new Date().toISOString();
  const sysProv = { source: "bootstrap", capturedAt: now };
  const add = (e: Omit<KGEntity, "id"|"createdAt"|"updatedAt"|"provenance">, id?: string): KGEntity => {
    const ent: KGEntity = { ...e, id: id ?? `${e.kind}:${randomUUID().slice(0,8)}`, createdAt: now, updatedAt: now, provenance: sysProv, attributes: e.attributes ?? {}, tags: e.tags ?? [] };
    entities.set(ent.id, ent);
    return ent;
  };
  const platform = add({ kind: "concept", name: "WINDELS AI OS", tags: ["platform"], attributes: { session: 19 } }, "concept:windels-ai-os");
  const dataPlat  = add({ kind: "concept", name: "Enterprise Data Platform", tags: ["session-19"], attributes: { slices: [166,167,168,169,170] } }, "concept:data-platform");
  const kg       = add({ kind: "concept", name: "Knowledge Graph", tags: ["kg"], attributes: {} }, "concept:knowledge-graph");
  const memory   = add({ kind: "concept", name: "Enterprise Memory", tags: ["memory"], attributes: {} }, "concept:memory");
  const evbus    = add({ kind: "concept", name: "Event Bus", tags: ["event-bus"], attributes: {} }, "concept:event-bus");
  const api      = add({ kind: "service", name: "windels-api", tags: ["service"], attributes: { version: "0.18.0" } }, "service:windels-api");

  const relate = (from: string, to: string, kind: RelationKind, attributes: Record<string, unknown> = {}): KGRelation => {
    const id = `rel:${randomUUID().slice(0,10)}`;
    const r: KGRelation = { id, from, to, kind, attributes, createdAt: now, provenance: sysProv, weight: 1 };
    relations.set(id, r);
    indexAdjForRelation(r);
    return r;
  };
  relate(platform.id, dataPlat.id, "part_of");
  relate(dataPlat.id, kg.id, "owns");
  relate(dataPlat.id, memory.id, "owns");
  relate(kg.id, evbus.id, "depends_on");
  relate(memory.id, kg.id, "references");
  relate(api.id, evbus.id, "produced_by");
  relate(api.id, kg.id, "uses");
  relate(api.id, memory.id, "uses");
}

setTimeout(() => { restore().then(() => { if (!entities.size) { seed(); void persist(); } }); }, 700);

// ── Public API ─────────────────────────────────────────────────────────
export const KnowledgeGraphService = {
  query(q: KGQuery = {}): KGEntity[] {
    let out = [...entities.values()];
    if (q.kind) out = out.filter((e) => e.kind === q.kind);
    if (q.tags?.length) out = out.filter((e) => q.tags!.every(t => e.tags.includes(t)));
    if (q.search) {
      const s = q.search.toLowerCase();
      out = out.filter((e) =>
        e.name.toLowerCase().includes(s) ||
        JSON.stringify(e.attributes).toLowerCase().includes(s) ||
        e.tags.some(t => t.toLowerCase().includes(s)),
      );
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 200;
    return out.slice(offset, offset + limit);
  },

  get(id: string): KGEntity | undefined { return entities.get(id); },

  async upsertEntity(input: {
    id?: string; kind: EntityKind; name: string;
    attributes?: Record<string, unknown>; tags?: string[];
    provenance?: { source: string; sourceId?: string };
  }): Promise<KGEntity> {
    const now = new Date().toISOString();
    const prov = input.provenance ?? { source: "api", capturedAt: now };
    const id = input.id ?? `${input.kind}:${randomUUID().slice(0,8)}`;
    const existing = entities.get(id);
    const ent: KGEntity = {
      id, kind: input.kind, name: input.name,
      attributes: { ...(existing?.attributes ?? {}), ...(input.attributes ?? {}) },
      tags: Array.from(new Set([...(existing?.tags ?? []), ...(input.tags ?? [])])),
      provenance: { ...prov, capturedAt: now },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    entities.set(id, ent);
    await persist();
    return ent;
  },

  async removeEntity(id: string, cascade = true): Promise<boolean> {
    if (!entities.has(id)) return false;
    if (cascade) {
      const rels = [...(outbound.get(id) ?? []), ...(inbound.get(id) ?? [])];
      for (const rid of rels) {
        const r = relations.get(rid);
        if (r) {
          relations.delete(rid);
          outbound.get(r.from)?.delete(rid);
          inbound.get(r.to)?.delete(rid);
        }
      }
      outbound.delete(id); inbound.delete(id);
    }
    entities.delete(id);
    await persist();
    return true;
  },

  async addRelation(input: {
    from: string; to: string; kind: RelationKind;
    weight?: number; attributes?: Record<string, unknown>;
    provenance?: { source: string; sourceId?: string };
  }): Promise<KGRelation | null> {
    if (!entities.has(input.from) || !entities.has(input.to)) return null;
    const now = new Date().toISOString();
    const id = `rel:${randomUUID().slice(0,10)}`;
    const r: KGRelation = {
      id, from: input.from, to: input.to, kind: input.kind,
      weight: input.weight ?? 1,
      attributes: input.attributes ?? {},
      provenance: { ...(input.provenance ?? { source: "api" }), capturedAt: now },
      createdAt: now,
    };
    relations.set(id, r);
    indexAdjForRelation(r);
    await persist();
    return r;
  },

  async removeRelation(id: string): Promise<boolean> {
    const r = relations.get(id);
    if (!r) return false;
    relations.delete(id);
    outbound.get(r.from)?.delete(id);
    inbound.get(r.to)?.delete(id);
    await persist();
    return true;
  },

  listRelations(entityId?: string): KGRelation[] {
    if (!entityId) return [...relations.values()];
    const ids = new Set([...(outbound.get(entityId) ?? []), ...(inbound.get(entityId) ?? [])]);
    return [...ids].map(id => relations.get(id)!).filter(Boolean);
  },

  /** Breadth-first expansion around a root entity. */
  traverse(params: { rootId: string; depth?: number; relKinds?: RelationKind[]; direction?: "out"|"in"|"both" }): KGTriple[] {
    const depth = params.depth ?? 1;
    const dir = params.direction ?? "both";
    const kinds = params.relKinds ? new Set(params.relKinds) : null;
    const out: KGTriple[] = [];
    const seen = new Set<string>();
    const frontier: Array<{ id: string; d: number }> = [{ id: params.rootId, d: 0 }];
    while (frontier.length) {
      const cur = frontier.shift()!;
      if (cur.d >= depth) continue;
      const followOut = dir !== "in";
      const followIn = dir !== "out";
      if (followOut) {
        for (const rid of outbound.get(cur.id) ?? []) {
          const r = relations.get(rid); if (!r) continue;
          if (kinds && !kinds.has(r.kind)) continue;
          const obj = entities.get(r.to); if (!obj) continue;
          const subj = entities.get(r.from)!;
          const key = `${r.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ subject: subj, predicate: r.kind, object: obj, relation: r });
          frontier.push({ id: r.to, d: cur.d + 1 });
        }
      }
      if (followIn) {
        for (const rid of inbound.get(cur.id) ?? []) {
          const r = relations.get(rid); if (!r) continue;
          if (kinds && !kinds.has(r.kind)) continue;
          const subj = entities.get(r.from); if (!subj) continue;
          const obj = entities.get(r.to)!;
          const key = `${r.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ subject: subj, predicate: r.kind, object: obj, relation: r });
          frontier.push({ id: r.from, d: cur.d + 1 });
        }
      }
    }
    return out;
  },

  stats() {
    return {
      entities: entities.size,
      relations: relations.size,
      byKind: [...entities.values()].reduce<Record<string,number>>((acc,e)=>{acc[e.kind]=(acc[e.kind]??0)+1;return acc;},{}),
      byRelation: [...relations.values()].reduce<Record<string,number>>((acc,r)=>{acc[r.kind]=(acc[r.kind]??0)+1;return acc;},{}),
    };
  },
};
