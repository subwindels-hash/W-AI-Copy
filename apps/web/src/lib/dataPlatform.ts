import { api } from "./api";

// ── Slice 166: Data Catalog ────────────────────────────────────────────
export type DataClassification = "public"|"internal"|"confidential"|"restricted"|"pii";
export type DataAssetKind = "table"|"view"|"topic"|"bucket"|"index"|"api"|"file"|"document"|"graph"|"vector_index";

export interface DataAsset {
  id: string; name: string; kind: DataAssetKind; namespace: string; description: string;
  classification: DataClassification;
  schema?: Record<string, any>;
  owners: Array<{userId:string; role:"owner"|"steward"|"consumer"}>;
  indexes: Array<{name:string; columns:string[]; unique?:boolean}>;
  validationRules?: Array<{id:string; rule:string; severity:"error"|"warn"}>;
  lineage?: { sources: string[]; targets: string[] };
  tags: string[];
  createdAt: string; updatedAt: string;
}
export interface DataAssetStats { total: number; byKind: Record<string,number>; byClassification: Record<string,number>; owners: number; }

export const catalogApi = {
  list: (params: {kind?:DataAssetKind;classification?:DataClassification;namespace?:string;tag?:string} = {}) =>
    api<{assets:DataAsset[]; stats:DataAssetStats}>("/data/catalog", { params }),
  get: (id: string) => api<DataAsset>(`/data/catalog/${encodeURIComponent(id)}`),
  create: (input: Partial<DataAsset> & {name:string;kind:DataAssetKind;namespace:string;classification:DataClassification}) =>
    api<DataAsset>("/data/catalog", { method: "POST", json: input }),
  update: (id: string, input: Partial<DataAsset>) =>
    api<DataAsset>(`/data/catalog/${encodeURIComponent(id)}`, { method: "PATCH", json: input }),
  remove: (id: string) => api<{removed:boolean}>(`/data/catalog/${encodeURIComponent(id)}`, { method: "DELETE" }),
  validate: (id: string, sample?: Record<string,any>) =>
    api<{assetId:string;ok:boolean;errors:Array<{ruleId:string;message:string;severity:string}>;checkedAt:string}>(
      `/data/catalog/${encodeURIComponent(id)}/validate`, { method: "POST", json: { sample } }),
};

// ── Slices 167 + 169: Knowledge Graph ──────────────────────────────────
export type EntityKind = "user"|"agent"|"organization"|"workspace"|"project"|"document"|"conversation"|"message"|"task"|"workflow"|"service"|"event"|"topic"|"concept"|"memory"|"file"|"custom";
export type RelationKind = "owns"|"member_of"|"authored"|"mentions"|"references"|"depends_on"|"part_of"|"related_to"|"produced_by"|"triggered_by"|"assigned_to"|"knows_about"|"used_in"|"preceded_by"|"custom";

export interface KGEntity {
  id: string; kind: EntityKind; name: string;
  attributes: Record<string, any>; tags: string[];
  provenance: { source: string; sourceId?: string; capturedAt: string };
  createdAt: string; updatedAt: string;
}
export interface KGRelation {
  id: string; from: string; to: string; kind: RelationKind; weight?: number;
  attributes: Record<string,any>;
  provenance: { source: string; sourceId?: string; capturedAt: string };
  createdAt: string;
}
export interface KGTriple {
  subject: KGEntity; predicate: RelationKind; object: KGEntity; relation: KGRelation;
}
export interface KGStats { entities: number; relations: number; byKind: Record<string,number>; byRelation: Record<string,number>; }

export const kgApi = {
  list: (params: {kind?:EntityKind;tag?:string;search?:string;limit?:number;offset?:number} = {}) =>
    api<KGEntity[]>("/data/kg/entities", { params }),
  get: (id: string) => api<{entity:KGEntity; relations: KGRelation[]}>(`/data/kg/entities/${encodeURIComponent(id)}`),
  upsert: (input: Partial<KGEntity> & {kind:EntityKind;name:string}) =>
    api<KGEntity>("/data/kg/entities", { method: "POST", json: input }),
  remove: (id: string, cascade = true) =>
    api<{removed:boolean}>(`/data/kg/entities/${encodeURIComponent(id)}?cascade=${cascade}`, { method: "DELETE" }),
  traverse: (id: string, params:{depth?:number;kind?:RelationKind|RelationKind[];direction?:"out"|"in"|"both"}={}) => {
    const q = new URLSearchParams();
    if (params.depth) q.set("depth", String(params.depth));
    if (params.direction) q.set("direction", params.direction);
    if (params.kind) {
      const kinds = Array.isArray(params.kind) ? params.kind : [params.kind];
      kinds.forEach(k => q.append("kind", k));
    }
    const qs = q.toString();
    return api<KGTriple[]>(`/data/kg/entities/${encodeURIComponent(id)}/traverse${qs?`?${qs}`:""}`);
  },
  listRelations: (entityId?: string) =>
    api<KGRelation[]>(`/data/kg/relations${entityId?`?entity=${encodeURIComponent(entityId)}`:""}`),
  addRelation: (input: {from:string;to:string;kind:RelationKind;weight?:number;attributes?:Record<string,any>}) =>
    api<KGRelation>("/data/kg/relations", { method: "POST", json: input }),
  removeRelation: (id: string) => api<{removed:boolean}>(`/data/kg/relations/${encodeURIComponent(id)}`, { method: "DELETE" }),
  stats: () => api<KGStats>("/data/kg/stats"),
};

// ── Slice 168: Memory Platform ─────────────────────────────────────────
export type MemoryNamespace = "user"|"agent"|"workspace"|"org"|"global"|"session";
export type MemoryType = "fact"|"preference"|"episode"|"procedure"|"semantic"|"summary"|"feedback";

export interface MemoryEntry {
  id: string; namespace: MemoryNamespace; scopeId: string; type: MemoryType; content: string;
  tags: string[]; importance: number; confidence: number; source: string;
  metadata: Record<string,any>; version: number; supersededBy?: string; expiresAt?: string;
  createdAt: string; updatedAt: string;
}

export const memoryApi = {
  recall: (params: {namespace:MemoryNamespace;scopeId:string;type?:MemoryType;tag?:string;search?:string;minImportance?:number;since?:string;until?:string;limit?:number}) =>
    api<MemoryEntry[]>("/data/memory", { params }),
  stats: (namespace?: MemoryNamespace, scopeId?: string) => {
    const q = new URLSearchParams();
    if (namespace) q.set("namespace", namespace);
    if (scopeId) q.set("scopeId", scopeId);
    const qs = q.toString();
    return api<{total:number;byType:Record<string,number>;avgImportance:number}>(`/data/memory/stats${qs?`?${qs}`:""}`);
  },
  context: (params: {namespace:MemoryNamespace;scopeId:string;type?:MemoryType;tag?:string;maxChars?:number}) =>
    api<{entries:MemoryEntry[]; assembledAt: string; tokens?: number}>("/data/memory/context", { params }),
  get: (id: string) => api<MemoryEntry>(`/data/memory/${encodeURIComponent(id)}`),
  remember: (input: Partial<MemoryEntry> & {namespace:MemoryNamespace;scopeId:string;type:MemoryType;content:string}) =>
    api<MemoryEntry>("/data/memory", { method: "POST", json: input }),
  revise: (id: string, input: {content?:string;tags?:string[];importance?:number;metadata?:Record<string,any>}) =>
    api<MemoryEntry>(`/data/memory/${encodeURIComponent(id)}/revise`, { method: "POST", json: input }),
  forget: (id: string) => api<{forgotten:boolean}>(`/data/memory/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

// ── Slice 170: Sync ───────────────────────────────────────────────────
export type SyncStatus = "idle"|"running"|"error"|"paused";
export interface SyncJob {
  id: string; name: string; source: string; target: "kg"|"memory"|"both";
  status: SyncStatus; lastRunAt?: string; lastDurationMs?: number; lastError?: string;
  runs: number; entitiesCreated: number; memoriesCreated: number; enabled: boolean;
}
export interface SyncRun {
  jobId: string; startedAt: string; finishedAt: string; durationMs: number;
  entitiesUpserted: number; relationsUpserted: number; memoriesUpserted: number;
  processed: number; errors: string[];
}
export const syncApi = {
  listJobs: () => api<SyncJob[]>("/data/sync/jobs"),
  toggle: (id: string, enabled: boolean) =>
    api<SyncJob>(`/data/sync/jobs/${encodeURIComponent(id)}/toggle`, { method: "POST", json: { enabled } }),
  run: (id: string) => api<SyncRun>(`/data/sync/jobs/${encodeURIComponent(id)}/run`, { method: "POST" }),
  recentRuns: (limit = 20) => api<SyncRun[]>(`/data/sync/runs?limit=${limit}`),
};
