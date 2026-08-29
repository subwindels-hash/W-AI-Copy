/**
 * Enterprise Memory Platform service (Slice 168).
 *
 * Stores versioned, scoped memory entries across namespaces (user, agent,
 * workspace, org, global, session). Memories can be recalled by namespace +
 * scope with type/tag/importance/time/search filters, superseded by newer
 * versions, assembled into a bounded context window for AI, and expired.
 *
 * MVP keeps entries in memory + Redis; real embedding/vector search comes
 * when the vector index ships. Search is a case-insensitive substring match
 * over content + metadata JSON.
 */
import { randomUUID } from "node:crypto";
import { redis } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import type {
  MemoryEntry,
  MemoryNamespace,
  MemoryType,
  MemoryQuery,
  MemoryContext,
} from "@windels/shared/dataPlatform";

const KEY = "enterprise:memory";
const entries = new Map<string, MemoryEntry>();
// scope index: `${namespace}:${scopeId}` -> Set<entryId>
const byScope = new Map<string, Set<string>>();

function scopeKey(ns: MemoryNamespace, scope: string) { return `${ns}:${scope}`; }
function indexEntry(e: MemoryEntry) {
  const k = scopeKey(e.namespace, e.scopeId);
  if (!byScope.has(k)) byScope.set(k, new Set());
  byScope.get(k)!.add(e.id);
}
function deindexEntry(e: MemoryEntry) { byScope.get(scopeKey(e.namespace, e.scopeId))?.delete(e.id); }

async function persist() {
  try { await redis.set(KEY, JSON.stringify([...entries.values()])); } catch { /* ignore */ }
}
async function restore() {
  try {
    const raw = await redis.get(KEY);
    if (!raw) return;
    for (const e of JSON.parse(raw) as MemoryEntry[]) { entries.set(e.id, e); indexEntry(e); }
  } catch { /* ignore */ }
}

setTimeout(() => { void restore(); }, 750);

// ── Public API ─────────────────────────────────────────────────────────
export const MemoryService = {
  recall(q: MemoryQuery): MemoryEntry[] {
    const k = scopeKey(q.namespace, q.scopeId);
    const ids = byScope.get(k) ?? new Set<string>();
    let out = [...ids].map(id => entries.get(id)!).filter(Boolean);
    if (q.type) out = out.filter(e => e.type === q.type);
    if (q.tags?.length) out = out.filter(e => q.tags!.every(t => e.tags.includes(t)));
    if (q.minImportance != null) out = out.filter(e => e.importance >= q.minImportance!);
    if (q.since) out = out.filter(e => e.createdAt >= q.since!);
    if (q.until) out = out.filter(e => e.createdAt <= q.until!);
    if (q.search) {
      const s = q.search.toLowerCase();
      out = out.filter(e => e.content.toLowerCase().includes(s) || JSON.stringify(e.metadata).toLowerCase().includes(s));
    }
    // drop superseded
    out = out.filter(e => !e.supersededBy || !entries.has(e.supersededBy));
    // drop expired
    const now = new Date().toISOString();
    out = out.filter(e => !e.expiresAt || e.expiresAt > now);
    out.sort((a, b) => (b.importance - a.importance) || (b.createdAt.localeCompare(a.createdAt)));
    return out.slice(0, q.limit ?? 100);
  },

  get(id: string): MemoryEntry | undefined { return entries.get(id); },

  async remember(input: {
    namespace: MemoryNamespace; scopeId: string;
    type: MemoryType; content: string;
    tags?: string[]; importance?: number; confidence?: number;
    source?: string; metadata?: Record<string, unknown>;
    expiresAt?: string;
  }): Promise<MemoryEntry> {
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: `mem:${randomUUID().slice(0,10)}`,
      namespace: input.namespace,
      scopeId: input.scopeId,
      type: input.type,
      content: input.content,
      tags: input.tags ?? [],
      importance: Math.max(0, Math.min(1, input.importance ?? 0.5)),
      confidence: Math.max(0, Math.min(1, input.confidence ?? 1)),
      source: input.source ?? "api",
      metadata: input.metadata ?? {},
      version: 1,
      expiresAt: input.expiresAt,
      createdAt: now, updatedAt: now,
    };
    entries.set(entry.id, entry);
    indexEntry(entry);
    await persist();
    return entry;
  },

  async revise(id: string, patch: { content?: string; tags?: string[]; importance?: number; metadata?: Record<string, unknown> }): Promise<MemoryEntry | null> {
    const existing = entries.get(id);
    if (!existing) return null;
    // Create a new version that supersedes the old entry (immutable history).
    const now = new Date().toISOString();
    const revised: MemoryEntry = {
      ...existing,
      id: `mem:${randomUUID().slice(0,10)}`,
      content: patch.content ?? existing.content,
      tags: patch.tags ?? existing.tags,
      importance: patch.importance ?? existing.importance,
      metadata: { ...existing.metadata, ...(patch.metadata ?? {}) },
      version: existing.version + 1,
      supersededBy: undefined,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
    existing.supersededBy = revised.id;
    entries.set(revised.id, revised);
    indexEntry(revised);
    await persist();
    return revised;
  },

  async forget(id: string): Promise<boolean> {
    const e = entries.get(id);
    if (!e) return false;
    deindexEntry(e);
    entries.delete(id);
    await persist();
    return true;
  },

  /** Build a bounded context window for an LLM from the most-important matching memories. */
  buildContext(q: MemoryQuery, opts: { maxChars?: number } = {}): MemoryContext {
    const maxChars = opts.maxChars ?? 12_000;
    const pool = this.recall({ ...q, limit: 200 });
    const chosen: MemoryEntry[] = [];
    let size = 0;
    for (const m of pool) {
      const add = `[${m.type}${m.tags.length? ":"+m.tags.join(","):""}] ${m.content}`.length + 2;
      if (size + add > maxChars && chosen.length) break;
      chosen.push(m); size += add;
    }
    return { entries: chosen, assembledAt: new Date().toISOString(), tokens: Math.ceil(size / 4) };
  },

  /** Simple summary stats across a namespace/scope. */
  stats(namespace?: MemoryNamespace, scopeId?: string) {
    let all = [...entries.values()];
    if (namespace) all = all.filter(e => e.namespace === namespace);
    if (scopeId) all = all.filter(e => e.scopeId === scopeId);
    return {
      total: all.length,
      byType: all.reduce<Record<string,number>>((acc,m)=>{acc[m.type]=(acc[m.type]??0)+1;return acc;},{}),
      avgImportance: all.length ? +(all.reduce((s,m)=>s+m.importance,0)/all.length).toFixed(3) : 0,
    };
  },
};
