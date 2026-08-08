/**
 * Session 140 — Global Human Knowledge & Everyday Question Intelligence Service.
 *
 * Serves the curated knowledge catalog (stable knowledge) plus the
 * organization-scoped dynamic layer (`kn:rec`), and implements the Question
 * Intent Engine, personalized teaching, comparisons, the timeline engine and
 * the knowledge graph over that catalog.
 *
 * Honesty rules (Session 140):
 *   - The catalog never claims to know everything: retrieval with no match
 *     returns an explicit "insufficient knowledge" response, never a guess.
 *   - Current/fast-changing facts are dynamic knowledge: dynamic records must
 *     carry SOURCE + DATE + VERIFICATION STATUS + LAST UPDATED, and the
 *     catalog deliberately contains no memorized prices, scores or
 *     office-holders.
 *   - Comparisons present criteria; they never declare a universal winner.
 *   - Health and law records carry professional-assistance notes.
 *
 * Keys:
 *   kn:rec:idx:<org>   (Redis Sorted Set of dynamic record ids by updatedAt)
 *   kn:rec:i:<org>:<id> (Redis string: JSON of the org-scoped record)
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import {
  classifyQuestionIntent,
  compareKnowledge,
  defaultTierForKind,
  INTENT_ROUTING,
  renderRecordAtLevel,
  sortTimelineEvents,
  teachingPlanFor,
  type AudienceLevel,
  type DynamicKnowledgeCreateInput,
  type DynamicKnowledgePatchInput,
  type IntentClassification,
  type KnowledgeAnswerMatch,
  type KnowledgeConfidence,
  type KnowledgeKind,
  type KnowledgeRecord,
  type KnowledgeSearchQuery,
  type KnowledgeReference,
  type QuestionIntent,
  type TimelineEventView,
} from "@windels/shared";
import {
  HISTORY_ERAS,
  KNOWLEDGE_CATALOG_VERSION,
  KNOWLEDGE_KIND_META,
  MASTER_CATEGORIES,
} from "./knowledge.catalog.js";
import { KNOWLEDGE_SEED_CORE, KNOWLEDGE_SEED_DATE } from "./knowledge.seed.js";
import { KNOWLEDGE_SEED_PEOPLE_TIMELINE_PLACES } from "./knowledge.seed.people.js";
import { KNOWLEDGE_SEED_DOMAINS } from "./knowledge.seed.domains.js";
import { KNOWLEDGE_SEED_EXPANSION } from "./knowledge.seed.expansion.js";
import { KNOWLEDGE_SEED_AUDIT } from "./knowledge.seed.audit.js";
import { KNOWLEDGE_SEED_AUDIT2 } from "./knowledge.seed.audit2.js";

const K = {
  idx: (orgId: string) => `kn:rec:idx:${orgId}`,
  item: (orgId: string, id: string) => `kn:rec:i:${orgId}:${id}`,
};

const MAX_DYNAMIC_RECORDS = 500;
const memoryLedger = new Map<string, Map<string, KnowledgeRecord>>();

function getMemory(orgId: string): Map<string, KnowledgeRecord> {
  let m = memoryLedger.get(orgId);
  if (!m) {
    m = new Map();
    memoryLedger.set(orgId, m);
  }
  return m;
}

/* ── Static catalog (loaded once; deterministic) ─────────────────────────── */

/** History eras as first-class knowledge records (kind `history_era`). */
const ERA_RECORDS: KnowledgeRecord[] = HISTORY_ERAS.map((e) => ({
  id: e.id,
  kind: "history_era",
  categoryIds: ["cat-20", "cat-21"],
  title: e.name,
  aliases: [`${e.name} era`, `${e.name} period`],
  question: `What was the ${e.name} period?`,
  intents: ["history", "education"],
  tier: "stable",
  confidence: "well_supported",
  provenance: "catalog",
  summary: e.summary,
  sections: {
    summary: e.summary,
    definition: `The ${e.name} period of human history, approximately ${e.dateLabel}.`,
    history: e.summary,
  },
  relatedIds: [],
  sources: [{ label: "Encyclopaedia Britannica", url: "https://www.britannica.com" }],
  lastUpdated: KNOWLEDGE_SEED_DATE,
  dateLabel: e.dateLabel,
  year: null,
  eraId: e.id,
}));

const CATALOG: KnowledgeRecord[] = [
  ...KNOWLEDGE_SEED_CORE,
  ...KNOWLEDGE_SEED_PEOPLE_TIMELINE_PLACES,
  ...KNOWLEDGE_SEED_DOMAINS,
  ...KNOWLEDGE_SEED_EXPANSION,
  ...KNOWLEDGE_SEED_AUDIT,
  ...KNOWLEDGE_SEED_AUDIT2,
  ...ERA_RECORDS,
];

const CATALOG_BY_ID = new Map(CATALOG.map((r) => [r.id, r]));
const KIND_SET = new Set<string>(KNOWLEDGE_KIND_META.map((k) => k.kind));
const CATEGORY_SET = new Set(MASTER_CATEGORIES.map((c) => c.id));

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "do", "does", "did", "what",
  "why", "when", "where", "who", "which", "how", "i", "me", "my", "you",
  "your", "it", "its", "of", "to", "in", "on", "for", "and", "or", "with",
  "about", "at", "from", "by", "can", "could", "should", "would", "will",
  "be", "been", "being", "have", "has", "had", "not", "no", "so", "if",
  "than", "then", "this", "that", "these", "those", "please", "tell", "give",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'’]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export interface SearchResult {
  record: KnowledgeRecord;
  score: number;
  matchedBy: string[];
}

function scoreRecord(record: KnowledgeRecord, tokens: string[], aliases: string[]): { score: number; matchedBy: string[] } {
  let score = 0;
  const matchedBy: string[] = [];
  const haystack = `${record.title} ${record.question} ${record.summary} ${record.aliases.join(" ")}`.toLowerCase();

  for (const token of tokens) {
    if (record.title.toLowerCase().includes(token)) {
      score += 2;
      matchedBy.push(`title:${token}`);
    } else if (haystack.includes(token)) {
      score += 1;
      matchedBy.push(`text:${token}`);
    }
  }
  for (const alias of aliases) {
    const a = alias.toLowerCase();
    if (record.aliases.some((x) => x.toLowerCase() === a) || record.title.toLowerCase() === a) {
      score += 3;
      matchedBy.push(`alias:${a}`);
    }
  }
  return { score, matchedBy };
}

function filterRecord(record: KnowledgeRecord, f: {
  kind?: KnowledgeKind;
  intent?: QuestionIntent;
  category?: string;
  tier?: KnowledgeRecord["tier"];
  confidence?: KnowledgeConfidence;
}): boolean {
  if (f.kind && record.kind !== f.kind) return false;
  if (f.intent && !record.intents.includes(f.intent)) return false;
  if (f.category && !record.categoryIds.includes(f.category)) return false;
  if (f.tier && record.tier !== f.tier) return false;
  if (f.confidence && record.confidence !== f.confidence) return false;
  return true;
}

function toAnswerMatch(record: KnowledgeRecord, level: AudienceLevel, score: number, matchedBy: string[]): KnowledgeAnswerMatch {
  const rendered = renderRecordAtLevel(record, level);
  return {
    id: record.id,
    title: record.title,
    kind: record.kind,
    categoryIds: record.categoryIds,
    question: record.question,
    tier: record.tier,
    confidence: record.confidence,
    provenance: record.provenance,
    scope: record.provenance === "catalog" ? "catalog" : "organization",
    score,
    matchedBy,
    intent: record.intents[0] ?? "definition",
    summary: record.summary,
    sections: rendered.sections,
    examples: record.examples ?? [],
    misconceptions: record.misconceptions ?? [],
    steps: record.steps ?? [],
    criteria: record.criteria ?? [],
    relatedIds: record.relatedIds ?? [],
    sources: record.sources ?? [],
    lastUpdated: record.lastUpdated,
    asOfDate: record.asOfDate,
    dateLabel: record.dateLabel,
    eraId: record.eraId,
    verificationNote: record.verificationNote,
    professionalAssistanceNote: record.professionalAssistanceNote,
  };
}

export const KnowledgeService = {
  /* ── Catalog meta ─────────────────────────────────────────────────────── */

  catalogMeta() {
    const byTier = { stable: 0, dynamic: 0 };
    const byConfidence = new Map<KnowledgeConfidence, number>();
    const byKind = new Map<KnowledgeKind, number>();
    for (const r of CATALOG) {
      byTier[r.tier] += 1;
      byConfidence.set(r.confidence, (byConfidence.get(r.confidence) ?? 0) + 1);
      byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    }
    return {
      catalogVersion: KNOWLEDGE_CATALOG_VERSION,
      recordCount: CATALOG.length,
      categoryCount: MASTER_CATEGORIES.length,
      kindCount: KNOWLEDGE_KIND_META.length,
      eraCount: HISTORY_ERAS.length,
      byTier,
      byConfidence: Object.fromEntries(byConfidence),
      byKind: Object.fromEntries(byKind),
      dynamicPolicyNote: "Fast-changing facts (politics, prices, sports, weather, current events) are never memorized as permanent; dynamic records must carry SOURCE + DATE + VERIFICATION STATUS + LAST UPDATED.",
    };
  },

  categories() {
    const counts = new Map<string, number>();
    for (const r of CATALOG) {
      for (const c of r.categoryIds) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return MASTER_CATEGORIES.map((c) => ({ ...c, recordCount: counts.get(c.id) ?? 0 }));
  },

  category(id: string) {
    const cat = MASTER_CATEGORIES.find((c) => c.id === id);
    if (!cat) return null;
    const records = CATALOG.filter((r) => r.categoryIds.includes(id)).map((r) => ({
      id: r.id, title: r.title, kind: r.kind, confidence: r.confidence, tier: r.tier,
    }));
    return { ...cat, records };
  },

  kinds() {
    return KNOWLEDGE_KIND_META.map((k) => ({
      ...k,
      recordCount: CATALOG.filter((r) => r.kind === k.kind).length,
    }));
  },

  eras() {
    return HISTORY_ERAS.map((e) => ({
      ...e,
      eventCount: CATALOG.filter((r) => r.kind === "timeline_event" && r.eraId === e.id).length,
    }));
  },

  teachingLevels() {
    return (["child", "high_school", "undergraduate", "graduate", "research"] as AudienceLevel[]).map((l) => teachingPlanFor(l));
  },

  /* ── Search ───────────────────────────────────────────────────────────── */

  async search(orgId: string | null, query: KnowledgeSearchQuery) {
    const q = (query.q ?? "").trim();
    const tokens = tokenize(q);
    const aliases = q ? [q] : [];
    const limit = query.limit ?? 20;
    const level = query.audienceLevel ?? "high_school";

    const pool: KnowledgeRecord[] = [];
    if (query.scope !== "org") pool.push(...CATALOG);
    if (query.scope !== "catalog" && orgId) pool.push(...(await this.listDynamicRecords(orgId, { limit: MAX_DYNAMIC_RECORDS })));

    const scored: SearchResult[] = [];
    for (const record of pool) {
      if (!filterRecord(record, { kind: query.kind, intent: query.intent, category: query.category, tier: query.tier, confidence: query.confidence })) continue;
      const { score, matchedBy } = scoreRecord(record, tokens, aliases);
      if (q && score < 2) continue; // no alias/title-level match → not relevant
      scored.push({ record, score, matchedBy });
    }
    scored.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
    const top = scored.slice(0, limit);

    return {
      query: q,
      filters: {
        kind: query.kind ?? null,
        intent: query.intent ?? null,
        category: query.category ?? null,
        tier: query.tier ?? null,
        confidence: query.confidence ?? null,
        scope: query.scope ?? "catalog",
      },
      scored: q.length > 0,
      audienceLevel: level,
      total: scored.length,
      results: top.map((s) => toAnswerMatch(s.record, level, s.score, s.matchedBy)),
      note: q.length === 0 ? "No query supplied — records listed by id order, not relevance." : undefined,
    };
  },

  /* ── Record detail ────────────────────────────────────────────────────── */

  getRecord(id: string): KnowledgeRecord | null {
    return CATALOG_BY_ID.get(id) ?? null;
  },

  /** Catalog listing with optional filters (used by GET /records?scope=catalog). */
  catalogList(opts?: { kind?: KnowledgeKind; category?: string; limit?: number }): KnowledgeRecord[] {
    const limit = opts?.limit ?? 50;
    let items = CATALOG;
    if (opts?.kind) items = items.filter((r) => r.kind === opts.kind);
    if (opts?.category) items = items.filter((r) => r.categoryIds.includes(opts.category as string));
    return items.slice(0, limit);
  },

  /* ── Ask Anything (intent → route → retrieve → render) ────────────────── */

  async ask(orgId: string | null, input: { question: string; audienceLevel?: AudienceLevel; limit?: number; includeDynamic?: boolean }) {
    const question = input.question.trim();
    const classification = classifyQuestionIntent(question);
    const route = INTENT_ROUTING[classification.intent];
    const tokens = tokenize(question);
    const level = input.audienceLevel ?? "high_school";
    const limit = input.limit ?? 5;

    const pool: KnowledgeRecord[] = [...CATALOG];
    if (input.includeDynamic !== false && orgId) {
      pool.push(...(await this.listDynamicRecords(orgId, { limit: MAX_DYNAMIC_RECORDS })));
    }

    const scored: SearchResult[] = [];
    for (const record of pool) {
      const { score, matchedBy } = scoreRecord(record, tokens, [question]);
      if (score < 2) continue;
      const intentBoost = record.intents.includes(classification.intent) ? 2 : 0;
      scored.push({ record, score: score + intentBoost, matchedBy });
    }
    scored.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
    const matches = scored.slice(0, limit).map((s) => toAnswerMatch(s.record, level, s.score, s.matchedBy));

    return {
      question,
      intent: classification,
      routing: route,
      audienceLevel: level,
      matches,
      count: matches.length,
      note:
        matches.length === 0
          ? "I do not have sufficient knowledge in the catalog for this question. It may concern current/dynamic information (which must be verified at query time from official sources) or lie outside the curated catalog. You can contribute a verified dynamic record through the knowledge layer."
          : undefined,
    };
  },

  intent(text: string): IntentClassification {
    return classifyQuestionIntent(text);
  },

  /* ── Comparison engine ────────────────────────────────────────────────── */

  compare(recordIds: string[], criteriaKeys?: string[]) {
    const found: KnowledgeRecord[] = [];
    const missing: string[] = [];
    for (const id of recordIds) {
      const r = this.getRecord(id);
      if (r) found.push(r);
      else missing.push(id);
    }
    const result = compareKnowledge(found, criteriaKeys);
    return { ...result, missing };
  },

  /* ── Timeline engine ──────────────────────────────────────────────────── */

  timeline(eraId?: string) {
    const events: TimelineEventView[] = CATALOG.filter(
      (r) => r.kind === "timeline_event" && (!eraId || r.eraId === eraId),
    ).map((r) => ({
      id: r.id,
      title: r.title,
      dateLabel: r.dateLabel ?? "",
      year: typeof r.year === "number" ? r.year : null,
      eraId: r.eraId ?? null,
      summary: r.summary,
      confidence: r.confidence,
    }));
    return {
      eraId: eraId ?? null,
      eras: eraId ? HISTORY_ERAS.filter((e) => e.id === eraId) : HISTORY_ERAS,
      events: sortTimelineEvents(events),
    };
  },

  /* ── Knowledge graph ──────────────────────────────────────────────────── */

  graphStats() {
    let edgeCount = 0;
    for (const r of CATALOG) edgeCount += (r.relatedIds ?? []).length;
    return {
      nodeCount: CATALOG.length,
      edgeCount,
      kindCounts: this.catalogMeta().byKind,
    };
  },

  graphNode(id: string) {
    const record = this.getRecord(id);
    if (!record) return null;
    const related = (record.relatedIds ?? [])
      .map((rid) => CATALOG_BY_ID.get(rid))
      .filter((r): r is KnowledgeRecord => Boolean(r));
    // Reverse edges: records that point at this record.
    const referencing = CATALOG.filter((r) => (r.relatedIds ?? []).includes(id));
    return {
      node: { id: record.id, title: record.title, kind: record.kind, tier: record.tier, confidence: record.confidence },
      edges: [
        ...related.map((r) => ({ from: record.id, to: r.id, relation: "related" as const })),
        ...referencing.map((r) => ({ from: r.id, to: record.id, relation: "references" as const })),
      ],
      nodes: [
        ...related.map((r) => ({ id: r.id, title: r.title, kind: r.kind })),
        ...referencing.map((r) => ({ id: r.id, title: r.title, kind: r.kind })),
      ],
    };
  },

  /* ── Stats rollup (console) ───────────────────────────────────────────── */

  async stats(orgId: string | null) {
    const meta = this.catalogMeta();
    const dynamic = orgId ? await this.listDynamicRecords(orgId, { limit: MAX_DYNAMIC_RECORDS }) : [];
    const byConfidence = new Map<KnowledgeConfidence, number>();
    for (const r of dynamic) byConfidence.set(r.confidence, (byConfidence.get(r.confidence) ?? 0) + 1);
    return {
      catalog: meta,
      dynamic: {
        count: dynamic.length,
        byConfidence: Object.fromEntries(byConfidence),
        storeAvailable: true,
        note: "Dynamic records are organization-scoped and carry self-reported verification metadata; they are never presented as catalog-verified knowledge.",
      },
    };
  },

  /* ── Dynamic layer (org-scoped, Redis best-effort + memory fallback) ──── */

  async addDynamicRecord(orgId: string, userId: string, input: DynamicKnowledgeCreateInput): Promise<KnowledgeRecord> {
    const now = new Date().toISOString();
    const id = `dyn_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const categories = input.categoryIds.filter((c) => CATEGORY_SET.has(c));
    const record: KnowledgeRecord = {
      id,
      kind: input.kind ?? "concept",
      categoryIds: categories.length > 0 ? categories : ["cat-90"],
      title: input.title,
      aliases: [],
      question: input.question,
      intents: ["definition"],
      tier: defaultTierForKind(input.kind ?? "concept"),
      confidence: input.confidence ?? "unverified",
      provenance: "self_reported",
      summary: input.summary,
      sections: this.sanitizeSections(input.sections ?? {}),
      examples: input.examples,
      misconceptions: input.misconceptions,
      steps: input.steps,
      criteria: input.criteria,
      relatedIds: input.relatedIds,
      sources: input.sources,
      lastUpdated: now,
      asOfDate: input.asOfDate,
      verificationNote: input.verificationNote,
      professionalAssistanceNote: input.professionalAssistanceNote,
    };
    await this.persistDynamicRecord(orgId, record);
    return record;
  },

  async updateDynamicRecord(orgId: string, userId: string, id: string, patch: DynamicKnowledgePatchInput): Promise<KnowledgeRecord | null> {
    const existing = await this.getDynamicRecord(orgId, id);
    if (!existing || existing.provenance !== "self_reported") return null;
    const updated: KnowledgeRecord = {
      ...existing,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.question !== undefined ? { question: patch.question } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind, tier: defaultTierForKind(patch.kind) } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.sections !== undefined ? { sections: this.sanitizeSections(patch.sections) } : {}),
      ...(patch.examples !== undefined ? { examples: patch.examples } : {}),
      ...(patch.misconceptions !== undefined ? { misconceptions: patch.misconceptions } : {}),
      ...(patch.steps !== undefined ? { steps: patch.steps } : {}),
      ...(patch.criteria !== undefined ? { criteria: patch.criteria } : {}),
      ...(patch.relatedIds !== undefined ? { relatedIds: patch.relatedIds } : {}),
      ...(patch.sources !== undefined ? { sources: patch.sources } : {}),
      ...(patch.confidence !== undefined ? { confidence: patch.confidence } : {}),
      ...(patch.asOfDate !== undefined ? { asOfDate: patch.asOfDate } : {}),
      ...(patch.verificationNote !== undefined ? { verificationNote: patch.verificationNote } : {}),
      ...(patch.professionalAssistanceNote !== undefined ? { professionalAssistanceNote: patch.professionalAssistanceNote } : {}),
      lastUpdated: new Date().toISOString(),
    };
    await this.persistDynamicRecord(orgId, updated);
    return updated;
  },

  async deleteDynamicRecord(orgId: string, id: string): Promise<boolean> {
    const existing = await this.getDynamicRecord(orgId, id);
    if (!existing || existing.provenance !== "self_reported") return false;
    getMemory(orgId).delete(id);
    try {
      await redis.del(K.item(orgId, id));
      await redis.zrem(K.idx(orgId), id);
    } catch (e: any) {
      logger.debug("KnowledgeService.deleteDynamicRecord: Redis unreachable, memory ledger updated", { error: e?.message });
    }
    return true;
  },

  async listDynamicRecords(orgId: string, query?: { kind?: KnowledgeKind; confidence?: KnowledgeConfidence; limit?: number }): Promise<KnowledgeRecord[]> {
    const limit = query?.limit ?? 50;
    let items: KnowledgeRecord[] = [];
    try {
      const ids = (await redis.zrange(K.idx(orgId), 0, -1)).reverse();
      for (const id of ids) {
        const raw = await redis.get(K.item(orgId, id));
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as KnowledgeRecord;
          if (parsed.provenance === "self_reported") items.push(parsed);
        } catch { /* corrupt entry tolerated */ }
      }
    } catch {
      items = [...getMemory(orgId).values()].sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
    }
    if (query?.kind) items = items.filter((r) => r.kind === query.kind);
    if (query?.confidence) items = items.filter((r) => r.confidence === query.confidence);
    return items.slice(0, limit);
  },

  async getDynamicRecord(orgId: string, id: string): Promise<KnowledgeRecord | null> {
    try {
      const raw = await redis.get(K.item(orgId, id));
      if (raw) {
        const parsed = JSON.parse(raw) as KnowledgeRecord;
        if (parsed.provenance === "self_reported") return parsed;
      }
    } catch {
      return getMemory(orgId).get(id) ?? null;
    }
    return getMemory(orgId).get(id) ?? null;
  },

  sanitizeSections(sections: Record<string, string>): Partial<Record<string, string>> {
    const allowed = new Set([
      "summary", "definition", "simple", "detailed", "history", "how_it_works",
      "examples", "misconceptions", "causes", "criteria", "steps", "geography",
      "economy", "culture", "biography", "achievements", "historical_context",
      "learning_path", "levels", "guidance", "warning", "policy", "sources",
    ]);
    const out: Partial<Record<string, string>> = {};
    for (const [k, v] of Object.entries(sections)) {
      if (allowed.has(k) && typeof v === "string" && v.trim().length > 0) out[k] = v.slice(0, 4000);
    }
    return out;
  },

  async persistDynamicRecord(orgId: string, record: KnowledgeRecord): Promise<void> {
    const mem = getMemory(orgId);
    mem.set(record.id, record);
    if (mem.size > MAX_DYNAMIC_RECORDS) {
      const oldest = [...mem.entries()].sort((a, b) => a[1].lastUpdated.localeCompare(b[1].lastUpdated))[0];
      if (oldest) mem.delete(oldest[0]);
    }
    try {
      const idxKey = K.idx(orgId);
      const itemKey = K.item(orgId, record.id);
      await redis.set(itemKey, JSON.stringify(record));
      await redis.zadd(idxKey, String(new Date(record.lastUpdated).getTime()), record.id);
      const count = await redis.zcard(idxKey);
      if (count > MAX_DYNAMIC_RECORDS) {
        const excess = count - MAX_DYNAMIC_RECORDS;
        const oldIds = await redis.zrange(idxKey, 0, excess - 1);
        if (oldIds.length > 0) {
          await redis.zrem(idxKey, ...oldIds);
          for (const oldId of oldIds) await redis.del(K.item(orgId, oldId));
        }
      }
    } catch (e: any) {
      logger.debug("KnowledgeService.persistDynamicRecord: Redis unreachable, relying on memory ledger", { error: e?.message });
    }
  },

  /** Catalog integrity check (used by tests and exposed via /catalog). */
  integrity(): { ok: boolean; issues: string[] } {
    const issues: string[] = [];
    const seen = new Set<string>();
    for (const r of CATALOG) {
      if (seen.has(r.id)) issues.push(`duplicate id: ${r.id}`);
      seen.add(r.id);
      if (!KIND_SET.has(r.kind)) issues.push(`${r.id}: unknown kind ${r.kind}`);
      if (r.categoryIds.length === 0) issues.push(`${r.id}: no categories`);
      for (const c of r.categoryIds) if (!CATEGORY_SET.has(c)) issues.push(`${r.id}: unknown category ${c}`);
      if (!r.summary || r.summary.length < 10) issues.push(`${r.id}: missing summary`);
      if (r.kind === "instruction" && !r.sections.steps && !r.steps?.length) issues.push(`${r.id}: instruction without steps`);
      if (r.kind === "person" && !r.sections.biography) issues.push(`${r.id}: person without biography`);
      if (r.kind === "timeline_event" && !r.dateLabel) issues.push(`${r.id}: timeline event without dateLabel`);
      for (const rid of r.relatedIds ?? []) {
        if (!CATALOG_BY_ID.has(rid)) issues.push(`${r.id}: dangling relatedId ${rid}`);
      }
      if (isNaN(Date.parse(r.lastUpdated))) issues.push(`${r.id}: invalid lastUpdated`);
    }
    return { ok: issues.length === 0, issues };
  },
};
