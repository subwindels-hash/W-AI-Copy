/**
 * Schema Governance service (Slice 166).
 *
 * Maintains an in-memory + Redis-backed catalog of data assets (tables, topics,
 * API endpoints, files, documents, vector indexes, etc.), their schemas,
 * owners, classification, indexes, validation rules, and lineage edges.
 * Provides basic validation against declared rules. Seeds a small set of
 * canonical assets at boot so the catalog isn't empty.
 */
import { randomUUID } from "node:crypto";
import { redis } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import type {
  DataAsset,
  DataAssetKind,
  DataClassification,
  SchemaValidationResult,
} from "@windels/shared/dataPlatform";

const KEY = "enterprise:dataCatalog";
const assets = new Map<string, DataAsset>();

// ── Canonical seed data ────────────────────────────────────────────────
function seed() {
  const now = new Date().toISOString();
  const seeds: Array<Omit<DataAsset, "id"|"createdAt"|"updatedAt"> & { id?: string }> = [
    {
      id: "asset:db:users",
      kind: "table", namespace: "db.windels", name: "users",
      description: "Core user identity record (auth, profile, role).",
      classification: "confidential",
      owners: [{ userId: "system", role: "owner" }],
      indexes: [{ name: "users_email_key", columns: ["email"], unique: true }],
      validationRules: [
        { id: "email-format", rule: "email matches RFC 5322", severity: "error" },
      ],
      lineage: { sources: [], targets: ["auth", "profile", "org"] },
      tags: ["identity", "pii"],
      schema: { type: "object", required: ["id","email"] },
    },
    {
      id: "asset:db:conversations",
      kind: "table", namespace: "db.windels", name: "conversations",
      description: "Top-level chat conversation containers.",
      classification: "confidential",
      owners: [{ userId: "system", role: "owner" }],
      indexes: [{ name: "conv_workspace_id_idx", columns: ["workspace_id"] }],
      validationRules: [],
      lineage: { sources: ["users"], targets: ["messages", "events"] },
      tags: ["chat"],
    },
    {
      id: "asset:db:messages",
      kind: "table", namespace: "db.windels", name: "messages",
      description: "Individual messages, including AI tool calls and streaming deltas.",
      classification: "confidential",
      owners: [{ userId: "system", role: "owner" }],
      indexes: [{ name: "msg_conversation_id_idx", columns: ["conversation_id","created_at"] }],
      tags: ["chat"],
    },
    {
      id: "asset:topic:enterprise-events",
      kind: "topic", namespace: "event.bus", name: "enterprise:events:bus",
      description: "Enterprise Event Bus pub/sub topic (Session 18).",
      classification: "internal",
      owners: [{ userId: "system", role: "steward" }],
      indexes: [],
      tags: ["event-bus"],
    },
    {
      id: "asset:api:v1",
      kind: "api", namespace: "api.v1", name: "/api/v1/*",
      description: "Version 1 REST API surface (218 inventoried endpoints).",
      classification: "internal",
      owners: [{ userId: "system", role: "owner" }],
      indexes: [],
      tags: ["api", "rest"],
    },
    {
      id: "asset:kg:entities",
      kind: "graph", namespace: "kg.core", name: "kg_entities",
      description: "Enterprise Knowledge Graph node store (Session 19).",
      classification: "confidential",
      owners: [{ userId: "system", role: "owner" }],
      indexes: [
        { name: "kg_entity_kind_idx", columns: ["kind"] },
        { name: "kg_entity_tags_idx", columns: ["tags"] },
      ],
      tags: ["knowledge-graph"],
    },
    {
      id: "asset:memory:entries",
      kind: "table", namespace: "memory", name: "memory_entries",
      description: "Enterprise Memory Platform entries (Session 19).",
      classification: "confidential",
      owners: [{ userId: "system", role: "owner" }],
      indexes: [
        { name: "mem_scope_idx", columns: ["namespace","scope_id"] },
        { name: "mem_type_idx", columns: ["type"] },
      ],
      tags: ["memory"],
    },
    {
      id: "asset:bucket:attachments",
      kind: "bucket", namespace: "fs", name: "attachments",
      description: "Object store for user uploads (documents, images, audio).",
      classification: "confidential",
      owners: [{ userId: "system", role: "steward" }],
      indexes: [],
      tags: ["files"],
    },
    {
      id: "asset:index:vectors",
      kind: "vector_index", namespace: "vectors", name: "embeddings_v1",
      description: "Embedding index for RAG (future sessions wire real embeddings).",
      classification: "internal",
      owners: [{ userId: "system", role: "steward" }],
      indexes: [],
      tags: ["rag", "vectors"],
    },
    {
      id: "asset:doc:adr-catalog",
      kind: "document", namespace: "docs", name: "ADR Catalog",
      description: "Architecture Decision Records registered via GovernanceService.",
      classification: "internal",
      owners: [{ userId: "system", role: "steward" }],
      indexes: [],
      tags: ["docs", "governance"],
    },
  ];
  for (const seed of seeds) {
    const id = seed.id ?? `asset:${seed.namespace}:${seed.name}`;
    assets.set(id, {
      ...seed,
      id,
      createdAt: now, updatedAt: now,
      schema: seed.schema ?? {},
      indexes: seed.indexes ?? [],
      validationRules: seed.validationRules ?? [],
      lineage: seed.lineage ?? { sources: [], targets: [] },
      tags: seed.tags ?? [],
      owners: seed.owners ?? [],
    } as DataAsset);
  }
}

async function persist() {
  try { await redis.set(KEY, JSON.stringify([...assets.values()])); } catch { /* ignore */ }
}
async function restore() {
  try {
    const raw = await redis.get(KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as DataAsset[];
    for (const a of arr) assets.set(a.id, a);
  } catch { /* ignore */ }
}
setTimeout(() => {
  restore()
    .then(() => { if (!assets.size) seed(); })
    .catch((err) => logger.warn("schema governance restore failed (best-effort, continuing)", { err: err instanceof Error ? err.message : String(err) }));
}, 600);

// ── Public API ─────────────────────────────────────────────────────────
export const SchemaGovernanceService = {
  list(params: { kind?: DataAssetKind; classification?: DataClassification; tag?: string; namespace?: string } = {}): DataAsset[] {
    let out = [...assets.values()];
    if (params.kind) out = out.filter((a) => a.kind === params.kind);
    if (params.classification) out = out.filter((a) => a.classification === params.classification);
    if (params.namespace) out = out.filter((a) => a.namespace.startsWith(params.namespace!));
    if (params.tag) out = out.filter((a) => a.tags.includes(params.tag!));
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },

  get(id: string): DataAsset | undefined { return assets.get(id); },

  async register(input: Omit<DataAsset, "id"|"createdAt"|"updatedAt"> & { id?: string }): Promise<DataAsset> {
    const id = input.id ?? `asset:${input.namespace}:${input.name}-${randomUUID().slice(0,6)}`;
    if (assets.has(id)) {
      return this.update(id, input) as Promise<DataAsset>;
    }
    const now = new Date().toISOString();
    const asset: DataAsset = {
      ...input,
      id,
      createdAt: now, updatedAt: now,
      schema: input.schema ?? {},
      indexes: input.indexes ?? [],
      validationRules: input.validationRules ?? [],
      lineage: input.lineage ?? { sources: [], targets: [] },
      tags: input.tags ?? [],
      owners: input.owners ?? [],
    };
    assets.set(id, asset);
    await persist();
    logger.info("data asset registered", { id, kind: asset.kind, name: asset.name });
    return asset;
  },

  async update(id: string, patch: Partial<DataAsset>): Promise<DataAsset | null> {
    const a = assets.get(id);
    if (!a) return null;
    const updated: DataAsset = { ...a, ...patch, id, createdAt: a.createdAt, updatedAt: new Date().toISOString() };
    assets.set(id, updated);
    await persist();
    return updated;
  },

  async remove(id: string): Promise<boolean> {
    const out = assets.delete(id);
    if (out) {
      await persist();
      logger.info("data asset removed", { id });
    }
    return out;
  },

  validate(assetId: string, sample?: Record<string, unknown>): SchemaValidationResult {
    const a = assets.get(assetId);
    const errors: SchemaValidationResult["errors"] = [];
    if (!a) {
      return { assetId, ok: false, errors: [{ ruleId: "missing", message: "asset not found", severity: "error" }], checkedAt: new Date().toISOString() };
    }
    for (const rule of a.validationRules ?? []) {
      // MVP: rules are declarative strings — we do lightweight format checks
      // for known keywords and treat unknown rules as passing (manual review).
      if (/email/i.test(rule.rule) && sample) {
        const emailFields = Object.entries(sample).filter(([k]) => /email/i.test(k));
        for (const [, v] of emailFields) {
          if (typeof v !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
            errors.push({ ruleId: rule.id, message: `email field fails format check (rule: ${rule.rule})`, severity: rule.severity });
          }
        }
      }
    }
    return { assetId, ok: errors.filter(e => e.severity === "error").length === 0, errors, checkedAt: new Date().toISOString() };
  },

  stats() {
    const all = [...assets.values()];
    const byKind: Record<string, number> = {};
    const byClassification: Record<string, number> = {};
    for (const a of all) {
      byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
      byClassification[a.classification] = (byClassification[a.classification] ?? 0) + 1;
    }
    return { total: all.length, byKind, byClassification, owners: new Set(all.flatMap(a => a.owners.map(o => o.userId))).size };
  },
};
