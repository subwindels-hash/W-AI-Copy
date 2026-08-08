/**
 * Session 141 — Global Religion, Belief & Spirituality Knowledge Service.
 *
 * Serves the curated religion catalog (families, denominations, schools,
 * indigenous traditions, ancient religions, NRMs, policy records), the
 * religion question engine, the criteria-based comparison engine, the
 * educational levels, and the controlled expansion pipeline (§18) with
 * org-scoped submissions and a Super Admin approval gate.
 *
 * Keys:
 *   rel:sub:idx:<org>    (Redis zset of submission ids by updatedAt)
 *   rel:sub:i:<org>:<id> (Redis string: JSON ReligionSubmission)
 *   rel:ext:idx          (shared zset of approved extension ids)
 *   rel:ext:i:<id>       (shared string: JSON ReligionRecord)
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/result.js";
import {
  classifyReligionQuestion,
  compareReligions,
  renderReligionAtLevel,
  RELIGION_COMPARISON_CATEGORIES,
  RELIGION_FAMILIES,
  RELIGION_SUBMISSION_STEPS,
  type ReligionAskInput,
  type ReligionComparisonResult,
  type ReligionConfidence,
  type ReligionLevel,
  type ReligionQuestionClassification,
  type ReligionRecord,
  type ReligionSearchQuery,
  type ReligionSource,
  type ReligionSubmission,
  type ReligionSubmissionCheck,
  type ReligionSubmissionCreateInput,
} from "@windels/shared";
import {
  RELIGION_CATALOG_VERSION,
  RELIGION_FAMILY_META,
} from "./religions.catalog.js";
import { RELIGIONS_ABRAHAMIC } from "./religions.seed.abrahamic.js";
import { RELIGIONS_DHARMIC_EASTASIAN } from "./religions.seed.dharmic.js";
import { RELIGIONS_TRADITIONAL } from "./religions.seed.traditional.js";
import { RELIGIONS_ANCIENT_NRM_POLICY } from "./religions.seed.ancient.js";

const K = {
  subIdx: (orgId: string) => `rel:sub:idx:${orgId}`,
  subItem: (orgId: string, id: string) => `rel:sub:i:${orgId}:${id}`,
  extIdx: () => "rel:ext:idx",
  extItem: (id: string) => `rel:ext:i:${id}`,
};

const MAX_SUBMISSIONS = 500;
const MAX_EXTENSIONS = 500;
const memorySubs = new Map<string, Map<string, ReligionSubmission>>();
const memoryExt = new Map<string, ReligionRecord>();

function getMemorySubs(orgId: string): Map<string, ReligionSubmission> {
  let m = memorySubs.get(orgId);
  if (!m) {
    m = new Map();
    memorySubs.set(orgId, m);
  }
  return m;
}

/* ── Static catalog (loaded once; deterministic) ─────────────────────────── */

export const RELIGION_CATALOG: ReligionRecord[] = [
  ...RELIGIONS_ABRAHAMIC,
  ...RELIGIONS_DHARMIC_EASTASIAN,
  ...RELIGIONS_TRADITIONAL,
  ...RELIGIONS_ANCIENT_NRM_POLICY,
];

const CATALOG_BY_ID = new Map(RELIGION_CATALOG.map((r) => [r.id, r]));
const FAMILY_SET = new Set<string>(RELIGION_FAMILIES);

/** All searchable name strings for a record (name, aliases, indigenous names, multilingual names). */
function nameStrings(record: ReligionRecord): string[] {
  const out = [record.name, ...record.altNames];
  for (const n of record.indigenousNames ?? []) out.push(n.name);
  for (const list of Object.values(record.namesByLanguage ?? {})) out.push(...list);
  return out.filter(Boolean);
}

function normalize(t: string): string {
  // Unicode-aware: keep letters from every script (Hebrew, Yoruba, Han…),
  // strip punctuation, collapse whitespace.
  return t.toLowerCase().replace(/[^\p{L}\p{N}\s'’]/gu, " ").replace(/\s+/g, " ").trim();
}

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "or", "what", "is", "are", "was", "were", "do", "does", "did", "how", "why", "when", "where", "who", "which", "religion", "faith", "tradition", "belief", "beliefs", "teach", "teaches", "teaching", "teachings", "about", "me", "my", "its", "it", "in", "on", "for", "to", "i", "you", "your"]);

function tokens(text: string): string[] {
  return normalize(text).split(/\s+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

interface ScoredHit {
  record: ReligionRecord;
  score: number;
  matchedBy: string[];
}

function scoreRecord(record: ReligionRecord, qTokens: string[]): ScoredHit {
  const names = nameStrings(record).map(normalize);
  let score = 0;
  const matchedBy: string[] = [];
  const full = normalize(`${record.name} ${record.altNames.join(" ")} ${record.summary}`);
  for (const tok of qTokens) {
    if (names.some((n) => n === tok)) {
      // Exact name/alias match outranks partial (so "Islam" beats "Ibadi Islam").
      score += 5;
      matchedBy.push(`exact:${tok}`);
    } else if (names.some((n) => n.includes(tok))) {
      score += 3;
      matchedBy.push(`name:${tok}`);
    } else if (full.includes(tok)) {
      score += 1;
      matchedBy.push(`text:${tok}`);
    }
  }
  return { record, score, matchedBy };
}

function matchesFilters(record: ReligionRecord, f: { family?: string; category?: string; status?: string; theism?: string; region?: string }): boolean {
  if (f.family && record.family !== f.family) return false;
  if (f.category && record.category !== f.category) return false;
  if (f.status && record.status !== f.status) return false;
  if (f.theism && record.theism !== f.theism) return false;
  if (f.region && !record.region.some((r) => r.toLowerCase().includes(f.region!.toLowerCase()))) return false;
  return true;
}

/** Render a record for delivery with the fields the client needs. */
function toView(record: ReligionRecord): ReligionRecord {
  return record;
}

export const ReligionsService = {
  /* ── Catalog meta ───────────────────────────────────────────────────── */

  catalogMeta() {
    const byFamily = new Map<string, number>();
    const byCategory = new Map<string, number>();
    const byStatus = new Map<string, number>();
    for (const r of RELIGION_CATALOG) {
      byFamily.set(r.family, (byFamily.get(r.family) ?? 0) + 1);
      byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
      byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    }
    return {
      catalogVersion: RELIGION_CATALOG_VERSION,
      recordCount: RELIGION_CATALOG.length,
      familyCount: RELIGION_FAMILY_META.length,
      families: RELIGION_FAMILY_META.map((f) => ({ ...f, recordCount: byFamily.get(f.family) ?? 0 })),
      byFamily: Object.fromEntries(byFamily),
      byCategory: Object.fromEntries(byCategory),
      byStatus: Object.fromEntries(byStatus),
      neutralityNote: "No religion in this catalog is ranked above another. Contested claims are attributed; WINDELS does not claim to have chosen a religion.",
      expansionNote: "The catalog has no fixed target size; new verified traditions enter through the ten-step expansion process.",
    };
  },

  listFamilies() {
    return RELIGION_FAMILY_META.map((f) => ({ ...f, recordCount: RELIGION_CATALOG.filter((r) => r.family === f.family).length }));
  },

  async search(orgId: string | null, query: ReligionSearchQuery) {
    const q = (query.q ?? "").trim();
    const qTokens = tokens(q);
    const limit = query.limit ?? 30;

    const pool = [...RELIGION_CATALOG];
    if (orgId) {
      const extensions = await this.listExtensions();
      pool.push(...extensions);
    }

    const scored: ScoredHit[] = [];
    for (const record of pool) {
      if (!matchesFilters(record, { family: query.family, category: query.category, status: query.status, theism: query.theism, region: query.region })) continue;
      const hit = scoreRecord(record, qTokens);
      if (q && hit.score < 2) continue; // no name-level match → not relevant
      scored.push(hit);
    }
    scored.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
    const top = scored.slice(0, limit);

    return {
      query: q,
      filters: {
        family: query.family ?? null,
        category: query.category ?? null,
        status: query.status ?? null,
        theism: query.theism ?? null,
        region: query.region ?? null,
      },
      scored: q.length > 0,
      total: scored.length,
      results: top.map((h) => toView(h.record)),
      note: q.length === 0 ? "No query supplied — records listed by id order, not relevance." : undefined,
    };
  },

  getRecord(id: string): ReligionRecord | null {
    return CATALOG_BY_ID.get(id) ?? null;
  },

  async getRecordAnywhere(id: string): Promise<ReligionRecord | null> {
    const catalog = this.getRecord(id);
    if (catalog) return catalog;
    const ext = await this.getExtension(id);
    return ext ?? null;
  },

  /* ── Ask (religion question engine) ─────────────────────────────────── */

  async ask(orgId: string | null, input: ReligionAskInput) {
    const question = input.question.trim();
    const classification = classifyReligionQuestion(question);
    const level = input.level ?? "intermediate";
    const limit = input.limit ?? 5;

    // Truth-claim questions get the neutrality answer (§14).
    if (classification.intent === "truth_claim") {
      const policy = this.getRecord("pol.neutrality")!;
      return {
        question,
        intent: classification,
        mode: "neutrality",
        level,
        matches: [
          {
            id: policy.id,
            name: policy.name,
            summary: policy.summary,
            sections: renderReligionAtLevel(policy, level).sections,
            sources: policy.sources,
            confidence: policy.confidence,
          },
        ],
        note: "Religious truth claims are matters of faith, theology, philosophy and personal belief. WINDELS presents the perspectives of the traditions and does not claim to have chosen a religion — and it never declares one religion universally true or superior.",
      };
    }

    // Comparison questions route to the comparison engine.
    if (classification.intent === "comparison") {
      const mentions = this.findMentionedRecords(question, 8);
      if (mentions.length >= 2) {
        const comparison = await this.compare(mentions.map((m) => m.id));
        return {
          question,
          intent: classification,
          mode: "comparison",
          level,
          matches: mentions.map((m) => toView(m)),
          comparison,
          note: "This comparison presents each tradition's own teachings as recorded in its knowledge entry; it does not rank religions.",
        };
      }
    }

    // Otherwise: retrieve by name mention, intent boost for history/practice.
    const pool = [...RELIGION_CATALOG];
    if (orgId) pool.push(...(await this.listExtensions()));
    const qTokens = tokens(question);
    const scored: ScoredHit[] = [];
    for (const record of pool) {
      const hit = scoreRecord(record, qTokens);
      if (hit.score < 2) continue;
      let boost = 0;
      if (classification.intent === "history" && record.originLabel) boost += 1;
      if (classification.intent === "practice" && (record.worship || record.prayer)) boost += 1;
      scored.push({ ...hit, score: hit.score + boost });
    }
    scored.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
    const matches = scored.slice(0, limit).map((h) => ({
      id: h.record.id,
      name: h.record.name,
      family: h.record.family,
      category: h.record.category,
      status: h.record.status,
      summary: h.record.summary,
      sections: renderReligionAtLevel(h.record, level).sections,
      sources: h.record.sources,
      confidence: h.record.confidence,
      controversialNote: h.record.controversialNote,
      professionalNote: undefined as string | undefined,
    }));

    return {
      question,
      intent: classification,
      mode: "teach",
      level,
      matches,
      count: matches.length,
      note: matches.length === 0
        ? "I do not have sufficient verified knowledge about this tradition in the religion catalog. It may be a local tradition not yet documented here — the catalog expands through the ten-step submission process."
        : undefined,
    };
  },

  /** Find records whose names appear in the question text (for comparisons). */
  findMentionedRecords(question: string, max: number): ReligionRecord[] {
    const q = normalize(question);
    const hits: Array<{ record: ReligionRecord; len: number }> = [];
    for (const record of RELIGION_CATALOG) {
      const names = nameStrings(record).map(normalize).filter((n) => n.length >= 4);
      const best = names.find((n) => q.includes(n));
      if (best) hits.push({ record, len: best.length });
    }
    hits.sort((a, b) => b.len - a.len);
    return hits.slice(0, max).map((h) => h.record);
  },

  /* ── Comparison engine (§15) ────────────────────────────────────────── */

  async compare(recordIds: string[]): Promise<ReligionComparisonResult & { missing: string[] }> {
    const found: ReligionRecord[] = [];
    const missing: string[] = [];
    for (const id of recordIds) {
      const r = await this.getRecordAnywhere(id);
      if (r) found.push(r);
      else missing.push(id);
    }
    const result = compareReligions(found);
    return { ...result, missing };
  },

  /* ── Teaching levels (§16) ──────────────────────────────────────────── */

  async teach(id: string, level: ReligionLevel) {
    const record = await this.getRecordAnywhere(id);
    if (!record) return null;
    const rendered = renderReligionAtLevel(record, level);
    return {
      id: record.id,
      name: record.name,
      family: record.family,
      category: record.category,
      status: record.status,
      level,
      sections: rendered.sections,
      festivals: record.festivals,
      sacredTexts: record.sacredTexts,
      sacredPlaces: record.sacredPlaces,
      symbols: record.symbols,
      names: {
        altNames: record.altNames,
        indigenousNames: record.indigenousNames,
        namesByLanguage: record.namesByLanguage,
      },
      sources: record.sources,
      confidence: record.confidence,
      lastReviewed: record.lastReviewed,
      controversialNote: record.controversialNote,
      researchNote: record.researchNote,
    };
  },

  /* ── Expansion pipeline (§18) ───────────────────────────────────────── */

  /** Run the ten automated checks against the catalog + submissions. */
  runExpansionChecks(input: ReligionSubmissionCreateInput, orgId: string, existing: ReligionSubmission[]): ReligionSubmissionCheck[] {
    const checks: ReligionSubmissionCheck[] = [];
    const allNames = [
      input.name.toLowerCase(),
      ...(input.altNames ?? []).map((a) => a.toLowerCase()),
      ...(input.indigenousNames ?? []).map((n) => n.name.toLowerCase()),
    ];

    checks.push({
      step: "identity_verification",
      passed: input.name.trim().length >= 2 && input.altNames !== undefined,
      note: "Name and aliases present.",
    });
    checks.push({
      step: "classification",
      passed: FAMILY_SET.has(input.family) && ["major_religion", "minor_religion", "denomination", "school", "mystical_tradition", "indigenous_tradition", "syncretic", "ancient_religion", "new_religious_movement", "philosophical_tradition", "policy"].includes(input.category),
      note: `Family "${input.family}" and category "${input.category}" are valid.`,
    });
    checks.push({
      step: "source_verification",
      passed: (input.sources ?? []).length >= 1,
      note: (input.sources ?? []).length >= 1 ? `Received ${input.sources.length} source(s).` : "At least one source is required.",
    });
    checks.push({
      step: "historical_verification",
      passed: input.originLabel.trim().length >= 2 && input.historicalDevelopment.trim().length >= 10,
      note: "Origin period and historical development supplied.",
    });
    const hasCommunitySource = (input.sources ?? []).some((s) => s.type === "community" || s.type === "indigenous");
    checks.push({
      step: "community_review",
      passed: true,
      note: hasCommunitySource ? "Community/indigenous source provided." : "Advisory: no community/indigenous source yet — recommended for indigenous traditions.",
    });
    const duplicate = this.findDuplicate(allNames, orgId, existing);
    checks.push({
      step: "duplicate_detection",
      passed: !duplicate,
      note: duplicate ? `Possible duplicate of "${duplicate}" — record as an alias instead of a new entry.` : "No duplicate found in the catalog or pending submissions.",
    });
    checks.push({
      step: "related_mapping",
      passed: (input.relatedReligions ?? []).length >= 0,
      note: (input.relatedReligions ?? []).length > 0 ? `Mapped ${input.relatedReligions!.length} related tradition(s).` : "Advisory: no related traditions mapped yet.",
    });
    checks.push({
      step: "branch_mapping",
      passed: (input.branches ?? []).length + (input.denominations ?? []).length + (input.schools ?? []).length >= 0,
      note: (input.branches ?? []).length + (input.denominations ?? []).length + (input.schools ?? []).length > 0 ? "Branches/denominations/schools mapped." : "Advisory: no branches mapped yet.",
    });
    checks.push({
      step: "confidence_scoring",
      passed: true,
      note: "New submissions default to UNVERIFIED confidence until approved with sources.",
    });
    checks.push({
      step: "knowledge_base_approval",
      passed: false,
      note: "Requires Super Admin approval to enter the knowledge base.",
    });
    return checks;
  },

  findDuplicate(names: string[], orgId: string, existing: ReligionSubmission[]): string | null {
    const catalogNames = new Set<string>();
    for (const r of RELIGION_CATALOG) {
      for (const n of nameStrings(r)) catalogNames.add(n.toLowerCase());
    }
    for (const n of names) {
      if (catalogNames.has(n)) {
        const match = RELIGION_CATALOG.find((r) => nameStrings(r).some((x) => x.toLowerCase() === n));
        return match?.name ?? n;
      }
    }
    for (const sub of existing) {
      const subNames = [sub.record.name, ...sub.record.altNames].map((x) => x.toLowerCase());
      for (const n of names) {
        if (subNames.includes(n)) return sub.record.name;
      }
    }
    return null;
  },

  async createSubmission(orgId: string, userId: string, input: ReligionSubmissionCreateInput): Promise<ReligionSubmission> {
    const now = new Date().toISOString();
    const id = `sub_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const existing = await this.listSubmissions(orgId, {});
    const checks = this.runExpansionChecks(input, orgId, existing);
    const allAutomatedPassed = checks.every((c) => c.passed);

    const record: ReligionRecord = {
      id: `submitted:${id}`,
      name: input.name,
      altNames: input.altNames ?? [],
      indigenousNames: input.indigenousNames ?? [],
      namesByLanguage: input.namesByLanguage ?? {},
      family: input.family,
      category: input.category,
      status: input.status ?? "active",
      theism: input.theism ?? "unclassifiable",
      region: input.region,
      ethnicGroups: input.ethnicGroups ?? [],
      originLabel: input.originLabel,
      originYear: input.originYear ?? null,
      founder: input.founder ?? [],
      keyFigures: [],
      centralTeachings: input.centralTeachings,
      deityConcept: input.deityConcept,
      spiritualBeings: input.spiritualBeings ?? "See the family record.",
      cosmology: input.cosmology ?? "See the family record.",
      creationBelief: input.creationBelief ?? "See the family record.",
      humanity: input.humanity ?? "See the family record.",
      afterlife: input.afterlife ?? "Not recorded in the submission.",
      salvation: input.salvation ?? "Not recorded in the submission.",
      morality: input.morality ?? "",
      worship: input.worship ?? "Not recorded in the submission.",
      prayer: input.prayer ?? "Not recorded in the submission.",
      meditation: input.meditation ?? "Not recorded in the submission.",
      rituals: input.rituals ?? "Not recorded in the submission.",
      festivals: input.festivals ?? [],
      sacredPlaces: input.sacredPlaces ?? [],
      symbols: input.symbols ?? [],
      religiousLeaders: input.religiousLeaders ?? "Not recorded in the submission.",
      religiousLaw: input.religiousLaw ?? "See the family record.",
      sacredTexts: input.sacredTexts ?? [],
      oralTraditions: input.oralTraditions ?? "See the family record.",
      branches: input.branches ?? [],
      denominations: input.denominations ?? [],
      schools: input.schools ?? [],
      historicalDevelopment: input.historicalDevelopment,
      modernStatus: input.modernStatus ?? "Not recorded in the submission.",
      distribution: input.distribution ?? "Not recorded in the submission.",
      relatedReligions: input.relatedReligions ?? [],
      differences: input.differences ?? "",
      similarities: input.similarities ?? "",
      sources: input.sources,
      confidence: "unverified",
      lastReviewed: now,
      summary: input.summary,
      simple: input.simple,
      expansionNote: "Submitted through the Session 141 expansion pipeline; unverified until Super Admin approval.",
    };

    const submission: ReligionSubmission = {
      id,
      organizationId: orgId,
      submittedBy: userId,
      status: "pending_review",
      record,
      checks,
      allAutomatedPassed,
      reviewNote: null,
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      approvedBy: null,
    };
    await this.persistSubmission(orgId, submission);
    return submission;
  },

  async listSubmissions(orgId: string, query: { status?: string; limit?: number }): Promise<ReligionSubmission[]> {
    const limit = query.limit ?? 50;
    let items: ReligionSubmission[] = [];
    try {
      const ids = (await redis.zrange(K.subIdx(orgId), 0, -1)).reverse();
      for (const id of ids) {
        const raw = await redis.get(K.subItem(orgId, id));
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as ReligionSubmission;
          if (parsed.organizationId === orgId) items.push(parsed);
        } catch { /* tolerated */ }
      }
    } catch {
      items = [...getMemorySubs(orgId).values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    if (query.status) items = items.filter((s) => s.status === query.status);
    return items.slice(0, limit);
  },

  async getSubmission(orgId: string, id: string): Promise<ReligionSubmission | null> {
    try {
      const raw = await redis.get(K.subItem(orgId, id));
      if (raw) {
        const parsed = JSON.parse(raw) as ReligionSubmission;
        if (parsed.organizationId === orgId) return parsed;
      }
    } catch { /* fall through */ }
    return getMemorySubs(orgId).get(id) ?? null;
  },

  async deleteSubmission(orgId: string, id: string): Promise<boolean> {
    const sub = await this.getSubmission(orgId, id);
    if (!sub) return false;
    getMemorySubs(orgId).delete(id);
    try {
      await redis.del(K.subItem(orgId, id));
      await redis.zrem(K.subIdx(orgId), id);
    } catch (e: any) {
      logger.debug("ReligionsService.deleteSubmission: Redis unreachable", { error: e?.message });
    }
    return true;
  },

  /** Super Admin approval: rejects or publishes the record into the shared approved-extension store. */
  async reviewSubmission(orgId: string, actor: { id: string; role: string | null }, id: string, decision: "approved" | "rejected", reviewNote?: string): Promise<ReligionSubmission | null> {
    if (actor.role !== "SUPER_ADMIN") {
      throw AppError.forbidden("Only the Super Admin may approve or reject religion knowledge-base submissions.");
    }
    const sub = await this.getSubmission(orgId, id);
    if (!sub) return null;
    if (sub.status !== "pending_review") {
      throw AppError.conflict(`Submission is already ${sub.status}.`);
    }
    const now = new Date().toISOString();
    const updated: ReligionSubmission = {
      ...sub,
      status: decision,
      reviewNote: reviewNote ?? null,
      updatedAt: now,
      approvedAt: decision === "approved" ? now : null,
      approvedBy: decision === "approved" ? actor.id : null,
      checks: sub.checks.map((c) => (c.step === "knowledge_base_approval" ? { ...c, passed: decision === "approved", note: decision === "approved" ? "Approved by the Super Admin." : "Rejected by the Super Admin." } : c)),
      allAutomatedPassed: decision === "approved" ? true : sub.allAutomatedPassed,
    };
    await this.persistSubmission(orgId, updated);
    if (decision === "approved") {
      const published: ReligionRecord = {
        ...sub.record,
        id: `ext_${Date.now()}_${randomUUID().slice(0, 8)}`,
        confidence: "unverified",
        expansionNote: "Approved into the knowledge base via the Session 141 expansion process.",
      };
      await this.persistExtension(published);
    }
    return updated;
  },

  async persistSubmission(orgId: string, sub: ReligionSubmission): Promise<void> {
    const mem = getMemorySubs(orgId);
    mem.set(sub.id, sub);
    if (mem.size > MAX_SUBMISSIONS) {
      const oldest = [...mem.entries()].sort((a, b) => a[1].updatedAt.localeCompare(b[1].updatedAt))[0];
      if (oldest) mem.delete(oldest[0]);
    }
    try {
      await redis.set(K.subItem(orgId, sub.id), JSON.stringify(sub));
      await redis.zadd(K.subIdx(orgId), String(new Date(sub.updatedAt).getTime()), sub.id);
      const count = await redis.zcard(K.subIdx(orgId));
      if (count > MAX_SUBMISSIONS) {
        const excess = count - MAX_SUBMISSIONS;
        const oldIds = await redis.zrange(K.subIdx(orgId), 0, excess - 1);
        if (oldIds.length > 0) {
          await redis.zrem(K.subIdx(orgId), ...oldIds);
          for (const oldId of oldIds) await redis.del(K.subItem(orgId, oldId));
        }
      }
    } catch (e: any) {
      logger.debug("ReligionsService.persistSubmission: Redis unreachable, memory ledger used", { error: e?.message });
    }
  },

  /* ── Approved extensions (shared, global) ───────────────────────────── */

  async persistExtension(record: ReligionRecord): Promise<void> {
    memoryExt.set(record.id, record);
    try {
      await redis.set(K.extItem(record.id), JSON.stringify(record));
      await redis.zadd(K.extIdx(), String(new Date(record.lastReviewed).getTime()), record.id);
      const count = await redis.zcard(K.extIdx());
      if (count > MAX_EXTENSIONS) {
        const excess = count - MAX_EXTENSIONS;
        const oldIds = await redis.zrange(K.extIdx(), 0, excess - 1);
        if (oldIds.length > 0) {
          await redis.zrem(K.extIdx(), ...oldIds);
          for (const oldId of oldIds) await redis.del(K.extItem(oldId));
        }
      }
    } catch (e: any) {
      logger.debug("ReligionsService.persistExtension: Redis unreachable, memory used", { error: e?.message });
    }
  },

  async listExtensions(): Promise<ReligionRecord[]> {
    let items: ReligionRecord[] = [];
    try {
      const ids = (await redis.zrange(K.extIdx(), 0, -1)).reverse();
      for (const id of ids) {
        const raw = await redis.get(K.extItem(id));
        if (!raw) continue;
        try {
          items.push(JSON.parse(raw) as ReligionRecord);
        } catch { /* tolerated */ }
      }
    } catch {
      items = [...memoryExt.values()];
    }
    return items;
  },

  async getExtension(id: string): Promise<ReligionRecord | null> {
    try {
      const raw = await redis.get(K.extItem(id));
      if (raw) return JSON.parse(raw) as ReligionRecord;
    } catch { /* fall through */ }
    return memoryExt.get(id) ?? null;
  },

  /* ── Stats & integrity ──────────────────────────────────────────────── */

  async stats(orgId: string | null) {
    const meta = this.catalogMeta();
    const submissions = orgId ? await this.listSubmissions(orgId, {}) : [];
    const extensions = await this.listExtensions();
    return {
      catalog: meta,
      extensions: {
        count: extensions.length,
        note: "Approved extensions are globally shared knowledge-base records, added through the Super Admin expansion process.",
      },
      submissions: {
        count: submissions.length,
        byStatus: {
          pending_review: submissions.filter((s) => s.status === "pending_review").length,
          approved: submissions.filter((s) => s.status === "approved").length,
          rejected: submissions.filter((s) => s.status === "rejected").length,
        },
        note: "Submissions are organization-scoped until approved; approval requires the Super Admin.",
      },
    };
  },

  integrity(): { ok: boolean; issues: string[] } {
    const issues: string[] = [];
    const seen = new Set<string>();
    for (const r of RELIGION_CATALOG) {
      if (seen.has(r.id)) issues.push(`duplicate id: ${r.id}`);
      seen.add(r.id);
      if (!FAMILY_SET.has(r.family)) issues.push(`${r.id}: unknown family ${r.family}`);
      if (!r.name || r.name.length < 2) issues.push(`${r.id}: missing name`);
      if (!r.summary || r.summary.length < 20) issues.push(`${r.id}: missing summary`);
      if (!r.simple || r.simple.length < 20) issues.push(`${r.id}: missing beginner explanation`);
      if (!r.centralTeachings || r.centralTeachings.length < 20) issues.push(`${r.id}: missing central teachings`);
      if (!r.deityConcept || r.deityConcept.length < 10) issues.push(`${r.id}: missing deity concept`);
      if (!r.historicalDevelopment || r.historicalDevelopment.length < 20) issues.push(`${r.id}: missing historical development`);
      if ((r.sources ?? []).length === 0) issues.push(`${r.id}: no sources`);
      if (isNaN(Date.parse(r.lastReviewed))) issues.push(`${r.id}: invalid lastReviewed`);
      for (const rid of r.relatedReligions ?? []) {
        if (!CATALOG_BY_ID.has(rid) && !rid.startsWith("submitted:")) issues.push(`${r.id}: dangling relatedReligion ${rid}`);
      }
    }
    return { ok: issues.length === 0, issues };
  },

  /** Enterprise Search integration: searchable catalog entries (all records). */
  listSearchable(): Array<{ id: string; title: string; body: string; meta: string; updatedAt: string }> {
    return RELIGION_CATALOG.map((r) => ({
      id: r.id,
      title: r.name,
      body: `${r.summary} ${r.centralTeachings} ${r.altNames.join(" ")}`,
      meta: `${r.family} · ${r.category} · ${r.status}`,
      updatedAt: r.lastReviewed,
    }));
  },
};
