/**
 * Shared types for Session 19 — Enterprise Data Platform.
 *
 * Covers the Data Catalog / Schema Governance (Slice 166), Knowledge Graph
 * (Slices 167 + 169), Enterprise Memory Platform (Slice 168), and the
 * Knowledge Synchronization engine (Slice 170).
 */

// ─── Slice 166: Schema Governance ────────────────────────────────────────
export type DataClassification = "public" | "internal" | "confidential" | "restricted" | "pii";
export type DataAssetKind =
  | "table" | "view" | "topic" | "bucket" | "index"
  | "api" | "file" | "document" | "graph" | "vector_index";
export type DataOwnerRole = "owner" | "steward" | "consumer";

export interface DataAsset {
  id: string;
  name: string;
  kind: DataAssetKind;
  namespace: string;            // e.g. "db.windels" / "event.user" / "kg.core"
  description: string;
  schema?: Record<string, unknown>; // simplified JSON-Schema-like descriptor
  classification: DataClassification;
  owners: Array<{ userId: string; role: DataOwnerRole }>;
  indexes: Array<{ name: string; columns: string[]; unique?: boolean }>;
  validationRules?: Array<{ id: string; rule: string; severity: "error" | "warn" }>;
  lineage?: { sources: string[]; targets: string[] };
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SchemaValidationResult {
  assetId: string;
  ok: boolean;
  errors: Array<{ ruleId: string; message: string; severity: "error" | "warn" }>;
  checkedAt: string;
}

// ─── Slices 167 + 169: Knowledge Graph ──────────────────────────────────
export type EntityKind =
  | "user" | "agent" | "organization" | "workspace" | "project"
  | "document" | "conversation" | "message" | "task" | "workflow"
  | "service" | "event" | "topic" | "concept" | "memory" | "file" | "custom";

export interface KGEntity {
  id: string;                 // stable id (e.g. "user:<uuid>", "doc:<uuid>")
  kind: EntityKind;
  name: string;
  attributes: Record<string, unknown>;
  tags: string[];
  provenance: { source: string; sourceId?: string; capturedAt: string };
  createdAt: string;
  updatedAt: string;
}

export type RelationKind =
  | "owns" | "member_of" | "authored" | "mentions" | "references"
  | "depends_on" | "part_of" | "related_to" | "produced_by" | "triggered_by"
  | "assigned_to" | "knows_about" | "used_in" | "preceded_by" | "uses" | "custom";

export interface KGRelation {
  id: string;
  from: string;   // entity id
  to: string;     // entity id
  kind: RelationKind;
  weight?: number;
  attributes: Record<string, unknown>;
  provenance: { source: string; sourceId?: string; capturedAt: string };
  createdAt: string;
}

export interface KGTriple { subject: KGEntity; predicate: RelationKind; object: KGEntity; relation: KGRelation; }

export interface KGQuery {
  kind?: EntityKind;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface KGTraversal {
  rootId: string;
  depth: number;
  relKinds?: RelationKind[];
  direction?: "out" | "in" | "both";
}

// ─── Slice 168: Enterprise Memory Platform ──────────────────────────────
export type MemoryNamespace =
  | "user" | "agent" | "workspace" | "org" | "global" | "session";
export type MemoryType =
  | "fact" | "preference" | "episode" | "procedure" | "semantic" | "summary" | "feedback";

export interface MemoryEntry {
  id: string;
  namespace: MemoryNamespace;
  scopeId: string;           // user id / agent id / workspace id / "global"
  type: MemoryType;
  content: string;
  embedding?: number[];      // optional — MVP stores but doesn't compute
  tags: string[];
  importance: number;        // 0..1
  confidence: number;        // 0..1
  source: string;            // e.g. "conversation:xxx", "user-input", "kg-sync"
  metadata: Record<string, unknown>;
  version: number;
  supersededBy?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryQuery {
  namespace: MemoryNamespace;
  scopeId: string;
  type?: MemoryType;
  tags?: string[];
  search?: string;
  minImportance?: number;
  since?: string;
  until?: string;
  limit?: number;
}

export interface MemoryContext {
  entries: MemoryEntry[];
  assembledAt: string;
  tokens?: number;
}

// ─── Slice 170: Knowledge Synchronization ────────────────────────────────
export type SyncStatus = "idle" | "running" | "error" | "paused";
export interface SyncJob {
  id: string;
  name: string;
  source: string;            // event type, table name, or feed identifier
  target: "kg" | "memory" | "both";
  status: SyncStatus;
  lastRunAt?: string;
  lastDurationMs?: number;
  lastError?: string;
  runs: number;
  entitiesCreated: number;
  memoriesCreated: number;
  enabled: boolean;
}

export interface SyncRunResult {
  jobId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  entitiesUpserted: number;
  relationsUpserted: number;
  memoriesUpserted: number;
  processed: number;
  errors: string[];
}
