/**
 * RagService — Slices 267-270:
 * RAG Governance, Vector Registry, Embedding Registry, Knowledge Governance.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  RagPolicy, VectorIndex, EmbeddingModel, KnowledgeSource,
  IndexStatus, VectorMetric, EmbeddingProvider, KnowledgeSourceKind, KnowledgeStatus,
} from "@windels/shared";
// Deterministic demo RNG — stable within a running process.



const POL_KEY    = "mlops:rag:policy";
const POLICIES   = "mlops:rag:policies";
const POLICY     = (id: string) => `mlops:rag:pol:${id}`;
const INDEXES    = "mlops:vectors";
const IDX        = (id: string) => `mlops:vec:${id}`;
const IDX_NAME   = "mlops:vec:name";
const EMBS       = "mlops:embs";
const EMB        = (id: string) => `mlops:emb:${id}`;
const EMB_SLUG   = "mlops:emb:slug";
const KS         = "mlops:ks";
const KS_ID      = (id: string) => `mlops:ks:${id}`;

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

// ── RAG policy ──────────────────────────────────────────────────
export const RagService = {
  async getPolicy(): Promise<RagPolicy> {
    const raw = await redis.get(POL_KEY);
    if (raw) return JSON.parse(raw) as RagPolicy;
    const def: RagPolicy = {
      id: "default", key: "default-rag", name: "Default RAG Policy",
      description: "Hybrid retrieval defaults (bootstrap).",
      enforced: true, mode: "hybrid", chunkSize: 1024, chunkOverlap: 128,
      topK: 6, minScore: 0.72, citationRequired: true, piiRedact: true,
      maxDocsPerQuery: 10, sourcesAllowed: ["*"], updatedAt: iso(),
    };
    await redis.set(POL_KEY, SER(def));
    return def;
  },

  async updatePolicy(patch: Partial<RagPolicy>): Promise<RagPolicy> {
    const cur = await this.getPolicy();
    const next: RagPolicy = { ...cur, ...patch, id: cur.id, updatedAt: iso() };
    await redis.set(POL_KEY, SER(next));
    return next;
  },

  // ── Vector indices ──────────────────────────────────────────
  async listIndexes(filter?: { status?: IndexStatus }): Promise<VectorIndex[]> {
    const ids = await redis.smembers(INDEXES);
    const out: VectorIndex[] = [];
    for (const id of ids) {
      const raw = await redis.get(IDX(id));
      if (!raw) continue;
      const v = JSON.parse(raw) as VectorIndex;
      if (filter?.status && v.status !== filter.status) continue;
      out.push(v);
    }
    return out.sort((a,b)=>b.vectors - a.vectors);
  },

  async getIndex(id: string): Promise<VectorIndex | null> {
    const raw = await redis.get(IDX(id));
    return raw ? (JSON.parse(raw) as VectorIndex) : null;
  },

  async createIndex(input: {
    name: string; dimensions: number; metric?: VectorMetric;
    embeddingModelId: string; namespace?: string; shards?: number; replicas?: number; region?: string;
  }): Promise<VectorIndex> {
    const id = randomUUID();
    const now = iso();
    const v: VectorIndex = {
      id, name: input.name, dimensions: input.dimensions, metric: input.metric ?? "cosine",
      embeddingModelId: input.embeddingModelId, namespace: input.namespace ?? "default",
      status: "ready", documents: 0, vectors: 0, sizeMb: 0,
      shards: input.shards ?? 1, replicas: input.replicas ?? 1, region: input.region ?? "na-east",
      // An index with 0 documents and 0 vectors cannot have served 50-1550 qps
      // at a 12-42 ms latency. Measured once the index actually serves.
      avgLatencyMs: 0, qps: 0,
      lastIndexedAt: now, createdAt: now, updatedAt: now,
    };
    await redis.set(IDX(id), SER(v));
    await redis.sadd(INDEXES, id);
    await redis.hset(IDX_NAME, v.name, id);
    return v;
  },

  async reindex(id: string): Promise<VectorIndex | null> {
    const v = await this.getIndex(id);
    if (!v) return null;
    v.status = "reindexing"; v.updatedAt = iso();
    await redis.set(IDX(id), SER(v));
    // simulate completion
    v.status = "ready"; v.lastIndexedAt = iso(); v.updatedAt = iso();
    await redis.set(IDX(id), SER(v));
    return v;
  },

  // ── Embedding models ────────────────────────────────────────
  async listEmbeddings(filter?: { provider?: EmbeddingProvider; status?: string }): Promise<EmbeddingModel[]> {
    const ids = await redis.smembers(EMBS);
    const out: EmbeddingModel[] = [];
    for (const id of ids) {
      const raw = await redis.get(EMB(id));
      if (!raw) continue;
      const e = JSON.parse(raw) as EmbeddingModel;
      if (filter?.provider && e.provider !== filter.provider) continue;
      if (filter?.status && e.status !== filter.status) continue;
      out.push(e);
    }
    return out.sort((a,b) => a.name.localeCompare(b.name));
  },

  async getEmbedding(id: string): Promise<EmbeddingModel | null> {
    const raw = await redis.get(EMB(id));
    return raw ? (JSON.parse(raw) as EmbeddingModel) : null;
  },

  async registerEmbedding(input: Omit<EmbeddingModel, "id"|"updatedAt">): Promise<EmbeddingModel> {
    const existing = await redis.hget(EMB_SLUG, input.slug);
    if (existing) {
      const cur = await this.getEmbedding(existing);
      if (cur) { Object.assign(cur, input, { updatedAt: iso() }); await redis.set(EMB(cur.id), SER(cur)); return cur; }
    }
    const id = randomUUID();
    const e: EmbeddingModel = { id, updatedAt: iso(), ...input };
    await redis.set(EMB(id), SER(e));
    await redis.sadd(EMBS, id);
    await redis.hset(EMB_SLUG, e.slug, id);
    return e;
  },

  // ── Knowledge sources ───────────────────────────────────────
  async listKnowledge(filter?: { kind?: KnowledgeSourceKind; status?: KnowledgeStatus }): Promise<KnowledgeSource[]> {
    const ids = await redis.smembers(KS);
    const out: KnowledgeSource[] = [];
    for (const id of ids) {
      const raw = await redis.get(KS_ID(id));
      if (!raw) continue;
      const k = JSON.parse(raw) as KnowledgeSource;
      if (filter?.kind && k.kind !== filter.kind) continue;
      if (filter?.status && k.status !== filter.status) continue;
      out.push(k);
    }
    return out.sort((a,b) => b.chunks - a.chunks);
  },

  async getKnowledge(id: string): Promise<KnowledgeSource | null> {
    const raw = await redis.get(KS_ID(id));
    return raw ? (JSON.parse(raw) as KnowledgeSource) : null;
  },

  async addSource(input: Omit<KnowledgeSource, "id"|"status"|"documents"|"chunks"|"vectors"|"sizeMb"|"lastIndexedAt"|"piiScanned"|"approved"|"updatedAt">): Promise<KnowledgeSource> {
    const id = randomUUID();
    const now = iso();
    const k: KnowledgeSource = {
      id, status: "indexing", documents: 0, chunks: 0, vectors: 0, sizeMb: 0,
      piiScanned: false, approved: true, updatedAt: now, ...input,
    };
    await redis.set(KS_ID(id), SER(k));
    await redis.sadd(KS, id);
    // The block that stood here marked the source `indexed` immediately, with
    // 20-520 invented documents, chunk/vector counts derived from them, and
    // — most seriously — `piiScanned = true`. Nothing was indexed and no PII
    // scan ran, so a source could be approved for retrieval on the strength of
    // a scan that never happened. The source stays `indexing` until a real
    // indexer reports via recordIndexResult().
    return k;
  },

  /**
   * Record the outcome of a real indexing pass.
   *
   * `piiScanned` can only be set here, by whatever actually performed the scan.
   */
  async recordIndexResult(
    id: string,
    result: { documents: number; chunks: number; vectors: number; sizeMb?: number; piiScanned?: boolean; error?: string },
  ): Promise<KnowledgeSource | null> {
    const k = await this.getKnowledge(id);
    if (!k) return null;
    if (result.error) {
      k.status = "failed"; k.lastError = result.error;
    } else {
      k.status = "indexed";
      k.documents = result.documents;
      k.chunks = result.chunks;
      k.vectors = result.vectors;
      k.sizeMb = result.sizeMb ?? 0;
      k.piiScanned = result.piiScanned === true;
      k.lastIndexedAt = iso();
    }
    k.updatedAt = iso();
    await redis.set(KS_ID(id), SER(k));
    return k;
  },

  async quarantineSource(id: string, reason?: string): Promise<KnowledgeSource | null> {
    const k = await this.getKnowledge(id);
    if (!k) return null;
    k.status = "quarantined"; k.lastError = reason ?? "manual quarantine"; k.approved = false;
    k.updatedAt = iso();
    await redis.set(KS_ID(id), SER(k));
    return k;
  },

  async approveSource(id: string): Promise<KnowledgeSource | null> {
    const k = await this.getKnowledge(id);
    if (!k) return null;
    k.approved = true;
    if (k.status === "quarantined" || k.status === "failed") k.status = "indexed";
    k.updatedAt = iso();
    await redis.set(KS_ID(id), SER(k));
    return k;
  },

  // ── Summary ─────────────────────────────────────────────────
  async summary(): Promise<{ ragIndices: number; vectorsIndexed: number; embeddingsModels: number; knowledgeSources: number; knowledgeDocuments: number }> {
    const [idx, embs, ks] = await Promise.all([this.listIndexes(), this.listEmbeddings(), this.listKnowledge()]);
    return {
      ragIndices: idx.length,
      vectorsIndexed: idx.reduce((a,v)=>a+v.vectors,0),
      embeddingsModels: embs.length,
      knowledgeSources: ks.length,
      knowledgeDocuments: ks.reduce((a,k)=>a+k.documents,0),
    };
  },
};
