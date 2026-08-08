/**
 * Session 144 — Global Politics, Government & Political History Intelligence
 * Service.
 *
 * Serves the curated political catalog (countries, leaders, parties,
 * elections, ministries, governors, constitutions, events, movements,
 * ideologies, organizations, government forms, policy records), the question
 * engine, the neutral comparison engine, timelines, the knowledge graph,
 * fact-vs-opinion classification (§23), education mode with deterministic
 * quizzes (§31), and the org-scoped update engine (§28/§29) that never
 * overwrites history.
 *
 * Keys:
 *   pol:upd:idx:<org>    (zset of update ids by updatedAt)
 *   pol:upd:i:<org>:<id> (string: JSON PoliticsUpdate)
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/result.js";
import {
  classifyPoliticalClaim,
  classifyPoliticsQuestion,
  compareCountries,
  renderCountryAtLevel,
  type CountryProfile,
  type FactOpinionClassification,
  type LeaderRecord,
  type PoliticsAskInput,
  type PoliticsEntityKind,
  type PoliticsLevel,
  type PoliticsQuestionClassification,
  type PoliticsQuiz,
  type PoliticsQuizQuestion,
  type PoliticsSearchQuery,
  type PoliticsUpdate,
  type PoliticsUpdateCreateInput,
  type PoliticsVerification,
  type VersionMeta,
} from "@windels/shared";
import { POLITICS_CATALOG_VERSION } from "./politics.catalog.js";
import { COUNTRY_PROFILES, GLOBAL_CONSTITUTIONS } from "./politics.seed.countries.js";
import { NIGERIA_LEADERS, NIGERIA_PARTIES, NIGERIA_ELECTIONS, LAGOS_GOVERNORS, NIGERIA_MINISTRIES, NIGERIA_CONSTITUTIONS, NIGERIA_EVENTS, NIGERIA_LEGISLATORS, NIGERIA_FIRST_GOVERNMENT, NIGERIA_SENATORS } from "./politics.seed.nigeria.js";
import { GLOBAL_LEADERS } from "./politics.seed.leaders.js";
import { IDEOLOGIES, MOVEMENTS, INTERNATIONAL_ORGS, GOVERNMENT_FORMS_RECORDS, POLICY_RECORDS } from "./politics.seed.ideas.js";
import { GLOBAL_DIPLOMACY, GLOBAL_CONCEPTS, KENYA_EVENTS } from "./politics.seed.completion.js";

const K = {
  updIdx: (orgId: string) => `pol:upd:idx:${orgId}`,
  updItem: (orgId: string, id: string) => `pol:upd:i:${orgId}:${id}`,
};
const MAX_UPDATES = 500;
const memoryUpdates = new Map<string, Map<string, PoliticsUpdate>>();

function getMemoryUpdates(orgId: string): Map<string, PoliticsUpdate> {
  let m = memoryUpdates.get(orgId);
  if (!m) {
    m = new Map();
    memoryUpdates.set(orgId, m);
  }
  return m;
}

/* ── Static catalog (loaded once; deterministic) ─────────────────────────── */

export interface AnyPoliticalRecord {
  id: string;
  kind: PoliticsEntityKind;
  name: string;
  altNames: string[];
  summary: string;
  simple: string;
  relatedIds: string[];
  sources: any[];
  meta: VersionMeta;
  [key: string]: any;
}

export const POLITICS_CATALOG: AnyPoliticalRecord[] = [
  ...COUNTRY_PROFILES,
  ...GLOBAL_CONSTITUTIONS,
  ...NIGERIA_LEADERS,
  ...GLOBAL_LEADERS,
  ...NIGERIA_PARTIES,
  ...NIGERIA_ELECTIONS,
  ...LAGOS_GOVERNORS,
  ...NIGERIA_MINISTRIES,
  ...NIGERIA_CONSTITUTIONS,
  ...NIGERIA_EVENTS,
  ...NIGERIA_LEGISLATORS,
  ...NIGERIA_FIRST_GOVERNMENT,
  ...NIGERIA_SENATORS,
  ...KENYA_EVENTS,
  ...GLOBAL_DIPLOMACY,
  ...GLOBAL_CONCEPTS,
  ...IDEOLOGIES,
  ...MOVEMENTS,
  ...INTERNATIONAL_ORGS,
  ...GOVERNMENT_FORMS_RECORDS,
  ...POLICY_RECORDS,
];

const CATALOG_BY_ID = new Map(POLITICS_CATALOG.map((r) => [r.id, r]));
const KIND_SET = new Set<string>(["country", "leader", "party", "election", "ministry", "governor", "legislator", "constitution", "event", "movement", "ideology", "international_organization", "government_form", "diplomacy", "concept", "policy"]);

function nameStrings(record: AnyPoliticalRecord): string[] {
  return [record.name, ...(record.altNames ?? [])].filter(Boolean);
}

function normalize(t: string): string {
  return t.toLowerCase().replace(/[^\p{L}\p{N}\s'’]/gu, " ").replace(/\s+/g, " ").trim();
}

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "or", "what", "is", "are", "was", "were", "do", "does", "did", "how", "why", "when", "where", "who", "which", "about", "me", "my", "its", "it", "in", "on", "for", "to", "i", "you", "your", "all", "list", "tell", "explain", "country", "politics", "political", "government"]);

function tokens(text: string): string[] {
  return normalize(text).split(/\s+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function scoreRecord(record: AnyPoliticalRecord, qTokens: string[]): { score: number; matchedBy: string[] } {
  const names = nameStrings(record).map(normalize);
  let score = 0;
  const matchedBy: string[] = [];
  const full = normalize(`${record.name} ${(record.altNames ?? []).join(" ")} ${record.title ?? ""} ${record.summary}`);
  for (const tok of qTokens) {
    if (names.some((n) => n === tok)) {
      score += 6; // exact name word
      matchedBy.push(`exact:${tok}`);
    } else if (names.some((n) => n.split(/\s+/).some((w) => w.startsWith(tok)))) {
      score += 3; // name word prefix ("president" in "presidential")
      matchedBy.push(`name:${tok}`);
    } else if (new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(full)) {
      score += 2; // exact word in text
      matchedBy.push(`text:${tok}`);
    } else if (full.includes(tok)) {
      score += 1;
      matchedBy.push(`frag:${tok}`);
    }
  }
  return { score, matchedBy };
}

/** A searchable view of a record for list endpoints. */
function toSummary(record: AnyPoliticalRecord) {
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    altNames: record.altNames,
    summary: record.summary,
    meta: {
      verification: record.meta.verification,
      asOfDate: record.meta.asOfDate,
      lastVerified: record.meta.lastVerified,
      lastReviewed: record.meta.lastReviewed,
    },
    relatedIds: record.relatedIds,
  };
}

export const PoliticsService = {
  catalogVersion: POLITICS_CATALOG_VERSION,

  /* ── Catalog meta ─────────────────────────────────────────────────── */

  catalogMeta() {
    const byKind = new Map<string, number>();
    const byVerification = new Map<string, number>();
    for (const r of POLITICS_CATALOG) {
      byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
      byVerification.set(r.meta.verification, (byVerification.get(r.meta.verification) ?? 0) + 1);
    }
    return {
      catalogVersion: POLITICS_CATALOG_VERSION,
      recordCount: POLITICS_CATALOG.length,
      countryCount: COUNTRY_PROFILES.length,
      byKind: Object.fromEntries(byKind),
      byVerification: Object.fromEntries(byVerification),
      neutralityNote: "WINDELS presents political information neutrally — INFORM, NOT MANIPULATE (§24).",
      currentInfoNote: "Current office-holders carry a Last Verified timestamp and are marked current_as_of (§21); the update engine preserves history (§28/§29).",
    };
  },

  /* ── Search (§30) ─────────────────────────────────────────────────── */

  async search(orgId: string | null, query: PoliticsSearchQuery) {
    const q = (query.q ?? "").trim();
    const qTokens = tokens(q);
    const limit = query.limit ?? 30;
    const level = query.level ?? "intermediate";

    const pool = [...POLITICS_CATALOG];
    if (orgId) {
      const updates = await this.listUpdates(orgId, {});
      pool.push(...updates.filter((u) => u.status === "applied").map((u) => ({
        id: `update:${u.id}`,
        kind: u.entityKind,
        name: u.title,
        altNames: [],
        summary: u.changeSummary,
        simple: u.changeSummary,
        relatedIds: [],
        sources: u.sources,
        meta: { created: u.createdAt, updated: u.updatedAt, lastReviewed: u.updatedAt, verification: u.verification, asOfDate: u.effectiveDate, lastVerified: u.effectiveDate } as VersionMeta,
      })));
    }

    const scored: Array<{ record: AnyPoliticalRecord; score: number; matchedBy: string[] }> = [];
    for (const record of pool) {
      if (query.kind && record.kind !== query.kind) continue;
      const { score, matchedBy } = scoreRecord(record, qTokens);
      if (q && score < 2) continue;
      scored.push({ record, score, matchedBy });
    }
    scored.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
    const top = scored.slice(0, limit);

    return {
      query: q,
      filters: { kind: query.kind ?? null },
      scored: q.length > 0,
      level,
      total: scored.length,
      results: top.map((h) => toSummary(h.record)),
      note: q.length === 0 ? "No query supplied — records listed by id order, not relevance." : undefined,
    };
  },

  getRecord(id: string): AnyPoliticalRecord | null {
    return CATALOG_BY_ID.get(id) ?? null;
  },

  /** §26-style helpers. */
  listByKind(kind: PoliticsEntityKind): AnyPoliticalRecord[] {
    return POLITICS_CATALOG.filter((r) => r.kind === kind);
  },

  listCountryLeaders(countryId: string): LeaderRecord[] {
    return POLITICS_CATALOG.filter((r) => r.kind === "leader" && r.countryId === countryId) as LeaderRecord[];
  },

  /* ── Ask (question engine) ────────────────────────────────────────── */

  async ask(orgId: string | null, input: PoliticsAskInput) {
    const question = input.question.trim();
    const classification = classifyPoliticsQuestion(question);
    const level = input.level ?? "intermediate";
    const limit = input.limit ?? 5;

    // Leader-list questions: "list all presidents of Nigeria"
    if (classification.intent === "leader" && /\b(list|all)\b/.test(normalize(question))) {
      const country = this.findCountry(question);
      if (country) {
        const leaders = this.listCountryLeaders(country.id).sort((a, b) => (a.ordinal ?? 999) - (b.ordinal ?? 999));
        return {
          question,
          intent: classification,
          mode: "leader_list",
          level,
          country: toSummary(country),
          leaders: leaders.map((l) => toSummary(l)),
          note: "Chronological list of the country's heads of state/government. Current office-holders are marked current_as_of.",
        };
      }
    }

    // Otherwise: retrieve by name mention, intent-boosted.
    const pool = [...POLITICS_CATALOG];
    if (orgId) {
      const updates = await this.listUpdates(orgId, {});
      pool.push(...updates.filter((u) => u.status === "applied").map((u) => ({
        id: `update:${u.id}`,
        kind: u.entityKind,
        name: u.title,
        altNames: [],
        summary: u.changeSummary,
        simple: u.changeSummary,
        relatedIds: [],
        sources: u.sources,
        meta: { created: u.createdAt, updated: u.updatedAt, lastReviewed: u.updatedAt, verification: u.verification, asOfDate: u.effectiveDate, lastVerified: u.effectiveDate } as VersionMeta,
      })));
    }
    const qTokens = tokens(question);
    const scored: Array<{ record: AnyPoliticalRecord; score: number }> = [];
    for (const record of pool) {
      const { score } = scoreRecord(record, qTokens);
      let boost = 0;
      if (classification.intent === "current_office" && record.meta.verification === "current_as_of") boost += 4;
      if (classification.intent === "leader" && record.kind === "leader") boost += 2;
      if (classification.intent === "leader" && (record.kind === "ministry" || record.kind === "governor" || record.kind === "legislator")) boost += 3;
      if (classification.intent === "country_history" && record.kind === "leader" && (record as any).titleKind === "military_ruler") boost += 3;
      if (classification.intent === "election" && record.kind === "election") boost += 2;
      if (classification.intent === "constitution" && record.kind === "constitution") boost += 2;
      if (classification.intent === "international" && record.kind === "international_organization") boost += 2;
      if (classification.intent === "ideology" && record.kind === "ideology") boost += 2;
      if (classification.intent === "country_history" && record.kind === "country") boost += 2;
      if (classification.intent === "government_how" && record.kind === "country") boost += 1;
      if (score + boost < 4) continue;
      scored.push({ record, score: score + boost });
    }
    scored.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
    const matches = scored.slice(0, limit).map((h) => this.renderForLevel(h.record, level));

    return {
      question,
      intent: classification,
      mode: "teach",
      level,
      matches,
      count: matches.length,
      note: matches.length === 0
        ? "I do not have sufficient verified political knowledge for this question. It may concern very recent events (which must be verified at query time) or a subject outside the curated catalog."
        : undefined,
    };
  },

  findCountry(question: string): CountryProfile | null {
    const q = normalize(question);
    let best: CountryProfile | null = null;
    let bestLen = 0;
    for (const c of COUNTRY_PROFILES) {
      const names = nameStrings(c).map(normalize).filter((n) => n.length >= 4);
      const m = names.find((n) => q.includes(n));
      if (m && m.length > bestLen) {
        best = c;
        bestLen = m.length;
      }
    }
    return best;
  },

  renderForLevel(record: AnyPoliticalRecord, level: PoliticsLevel) {
    const base = toSummary(record);
    if (record.kind === "country") {
      return {
        ...base,
        sections: renderCountryAtLevel(record as CountryProfile, level),
        capital: record.capital,
        governmentForm: record.governmentForm,
        federalStructure: record.federalStructure,
      };
    }
    const sections: Array<{ key: string; heading: string; body: string }> = [];
    const fields: Array<[string, string]> = [
      ["simple", "Simple explanation"],
      ["definition", "Definition"],
      ["coreIdeas", "Core ideas"],
      ["howItWorks", "How it works"],
      ["preColonial", "Pre-colonial political history"],
      ["independenceStory", "Independence & state formation"],
      ["modernHistory", "Modern political history"],
      ["historicalDevelopment", "Historical development"],
      ["currentSituation", "Current situation"],
      ["importance", "Why it mattered"],
      ["resultSummary", "Result"],
      ["disputes", "Disputes"],
      ["criticism", "Criticism & debate"],
      ["keyEvents", "Key events"],
      ["currentStatus", "Current status"],
    ];
    for (const [key, heading] of fields) {
      const body = (record as any)[key];
      if (body && String(body).trim().length > 0) {
        if (level === "beginner" && !["simple", "definition"].includes(key)) continue;
        sections.push({ key, heading, body: String(body) });
      }
    }
    return { ...base, sections };
  },

  /* ── Comparison engine (§24-neutral) ──────────────────────────────── */

  compareCountry(countryIds: string[]) {
    const found: CountryProfile[] = [];
    const missing: string[] = [];
    for (const id of countryIds) {
      const r = this.getRecord(id);
      if (r && r.kind === "country") found.push(r as CountryProfile);
      else missing.push(id);
    }
    const result = compareCountries(found);
    return { ...result, missing };
  },

  /* ── Timeline engines (§18/§19) ───────────────────────────────────── */

  countryTimeline(countryId: string) {
    const country = this.getRecord(countryId);
    if (!country || country.kind !== "country") return null;
    const periods = (country as CountryProfile).historyPeriods ?? [];
    const events = POLITICS_CATALOG.filter((r) => r.kind === "event" && (r.countryIds ?? []).includes(countryId))
      .map((e) => ({ id: e.id, title: e.name, dateLabel: e.dateLabel, year: e.year, eventType: e.eventType, summary: e.summary }))
      .sort((a, b) => (a.year ?? 999999) - (b.year ?? 999999));
    return { country: toSummary(country), periods, events };
  },

  leaderTimeline(countryId: string) {
    const leaders = this.listCountryLeaders(countryId).sort((a, b) => (a.ordinal ?? 999) - (b.ordinal ?? 999));
    return leaders.map((l) => ({
      id: l.id,
      name: l.name,
      title: l.title,
      titleKind: l.titleKind,
      role: l.role,
      party: l.party,
      officeStart: l.officeStart,
      officeEnd: l.officeEnd,
      ordinal: l.ordinal,
      cameToOffice: l.cameToOffice,
      verification: l.meta.verification,
    }));
  },

  /* ── Knowledge graph (§20) ────────────────────────────────────────── */

  graphStats() {
    let edgeCount = 0;
    for (const r of POLITICS_CATALOG) edgeCount += (r.relatedIds ?? []).length;
    return { nodeCount: POLITICS_CATALOG.length, edgeCount, byKind: this.catalogMeta().byKind };
  },

  graphNode(id: string) {
    const record = this.getRecord(id);
    if (!record) return null;
    const related = (record.relatedIds ?? []).map((rid) => CATALOG_BY_ID.get(rid)).filter(Boolean) as AnyPoliticalRecord[];
    const referencing = POLITICS_CATALOG.filter((r) => (r.relatedIds ?? []).includes(id));
    return {
      node: { id: record.id, kind: record.kind, name: record.name },
      edges: [
        ...related.map((r) => ({ from: record.id, to: r.id, relation: "related" as const })),
        ...referencing.map((r) => ({ from: r.id, to: record.id, relation: "references" as const })),
      ],
      nodes: [
        ...related.map((r) => ({ id: r.id, kind: r.kind, name: r.name })),
        ...referencing.map((r) => ({ id: r.id, kind: r.kind, name: r.name })),
      ],
    };
  },

  /** §20 complex questions: "who was president when X happened?" */
  async graphAnswer(question: string) {
    const classification = classifyPoliticsQuestion(question);
    const tokensQ = tokens(question);
    // Find the best-matching event mentioned
    let event: AnyPoliticalRecord | null = null;
    let bestEventScore = 0;
    for (const r of POLITICS_CATALOG) {
      if (r.kind !== "event") continue;
      const { score } = scoreRecord(r, tokensQ);
      if (score > bestEventScore) {
        bestEventScore = score;
        event = r;
      }
    }
    if (event && bestEventScore < 4) event = null;
    if (event) {
      const countryIds = event.countryIds ?? [];
      const leadersAtEvent: Array<{ event: string; eventYear: number | null; leaders: any[] }> = [];
      for (const cid of countryIds) {
        const year = event.year;
        const leaders = this.listCountryLeaders(cid).filter((l) => {
          if (year === null || year === undefined) return true;
          const start = parseInt(l.officeStart.replace(/[^0-9]/g, "").slice(-4) || "0", 10) || 0;
          const endRaw = (l.officeEnd ?? "").replace(/[^0-9]/g, "").slice(-4);
          const end = endRaw ? parseInt(endRaw, 10) : 9999;
          return year >= start && year <= end;
        });
        leadersAtEvent.push({ event: event.name, eventYear: event.year, leaders: leaders.map((l) => ({ name: l.name, title: l.title, officeStart: l.officeStart, officeEnd: l.officeEnd })) });
      }
      return {
        question,
        intent: classification,
        mode: "graph_answer",
        event: toSummary(event),
        leadersAtEvent,
        note: "Leaders matched by their recorded office periods; approximate dates are labelled in the records.",
      };
    }
    return {
      question,
      intent: classification,
      mode: "graph_answer",
      event: null,
      leadersAtEvent: [],
      note: "No event matched; try naming an event (e.g. 'the 1966 coup', 'the 2015 election').",
    };
  },

  /* ── Fact vs opinion (§23) ────────────────────────────────────────── */

  classifyClaim(text: string): FactOpinionClassification {
    return classifyPoliticalClaim(text);
  },

  /* ── Education mode (§25/§31) ─────────────────────────────────────── */

  async quiz(topicId: string, level: PoliticsLevel, count: number): Promise<PoliticsQuiz | null> {
    const record = this.getRecord(topicId);
    if (!record) return null;
    const questions: PoliticsQuizQuestion[] = [];

    // Deterministic MCQ generation from the record's own content.
    const add = (q: string, correct: string, wrong: string[], explanation: string) => {
      const choices = [correct, ...wrong].sort((a, b) => a.localeCompare(b));
      questions.push({
        id: `q${questions.length + 1}`,
        question: q,
        choices,
        correctIndex: choices.indexOf(correct),
        explanation,
      });
    };

    if (record.kind === "country") {
      const c = record as CountryProfile;
      add(`What is the capital of ${c.name}?`, c.capital, ["Lagos", "Accra", "Nairobi"].filter((x) => x !== c.capital).slice(0, 3), `The capital of ${c.name} is ${c.capital}.`);
      add(`When did ${c.name} gain independence or form its state?`, c.independence.split(";")[0]!.trim(), ["1945", "1990", "1885"].filter((x) => !c.independence.includes(x)).slice(0, 3), c.independence);
      add(`What form of government does ${c.name} have?`, c.governmentForm.replace(/_/g, " "), ["absolute monarchy", "one-party state", "military government"].filter((x) => !c.governmentForm.includes(x.split(" ")[0]!.replace(/ /g, "_"))).slice(0, 3), `The government form is ${c.governmentForm.replace(/_/g, " ")}.`);
      const period = c.historyPeriods[0];
      if (period) {
        add(`Which period begins the political history of ${c.name}?`, period.label, ["The colonial period", "The modern era", "The Cold War"].filter((x) => x !== period.label).slice(0, 3), `${c.name}'s earliest recorded period is "${period.label}" (${period.dateLabel}).`);
      }
      add(`What is the legislature of ${c.name} called?`, c.legislature.slice(0, 80), ["The Politburo", "The Council of Elders", "The Assembly of Chiefs"].filter((x) => !c.legislature.includes(x)).slice(0, 3), c.legislature);
    } else if (record.kind === "leader") {
      const l = record as LeaderRecord;
      add(`What office did ${l.name} hold?`, l.title.split(";")[0]!.trim(), ["Senator", "Governor", "Chief Justice"].slice(0, 3), l.title);
      add(`When did ${l.name} take office?`, l.officeStart, ["1 January 2000", "29 May 1999", "1 October 1994"].filter((x) => x !== l.officeStart).slice(0, 3), `Office period: ${l.officeStart}${l.officeEnd ? " to " + l.officeEnd : " (current)"}.`);
      add(`What is a documented major achievement of ${l.name}?`, l.achievements.slice(0, 80), ["Won the Nobel Prize for Literature", "Founded the United Nations", "Built the Great Wall"].slice(0, 3), l.achievements);
    } else {
      add(`What is the core idea of ${record.name}?`, record.summary.slice(0, 100), ["It has no core ideas", "It opposes all government", "It is a sports league"].slice(0, 3), record.summary);
    }

    return {
      topicId,
      topicName: record.name,
      level,
      questions: questions.slice(0, count),
      note: "Questions are generated deterministically from the curated record's own content. WINDELS quizzes to teach, not to score (§31).",
    };
  },

  /* ── Update engine (§28/§29) — never overwrite history ────────────── */

  async createUpdate(orgId: string, userId: string, input: PoliticsUpdateCreateInput): Promise<PoliticsUpdate> {
    const now = new Date().toISOString();
    const id = `upd_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const update: PoliticsUpdate = {
      id,
      organizationId: orgId,
      submittedBy: userId,
      kind: input.kind,
      entityId: input.entityId,
      entityKind: input.entityKind,
      title: input.title,
      changeSummary: input.changeSummary,
      field: input.field,
      previousValue: input.previousValue ?? null,
      newValue: input.newValue,
      effectiveDate: input.effectiveDate,
      sources: input.sources,
      verification: input.verification,
      status: "pending_review",
      reviewNote: null,
      createdAt: now,
      updatedAt: now,
      appliedAt: null,
      appliedBy: null,
      changeLog: null,
    };
    await this.persistUpdate(orgId, update);
    return update;
  },

  async listUpdates(orgId: string, query: { status?: string; limit?: number }): Promise<PoliticsUpdate[]> {
    const limit = query.limit ?? 50;
    let items: PoliticsUpdate[] = [];
    try {
      const ids = (await redis.zrange(K.updIdx(orgId), 0, -1)).reverse();
      for (const id of ids) {
        const raw = await redis.get(K.updItem(orgId, id));
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as PoliticsUpdate;
          if (parsed.organizationId === orgId) items.push(parsed);
        } catch { /* tolerated */ }
      }
    } catch {
      items = [...getMemoryUpdates(orgId).values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    if (query.status) items = items.filter((u) => u.status === query.status);
    return items.slice(0, limit);
  },

  async getUpdate(orgId: string, id: string): Promise<PoliticsUpdate | null> {
    try {
      const raw = await redis.get(K.updItem(orgId, id));
      if (raw) {
        const parsed = JSON.parse(raw) as PoliticsUpdate;
        if (parsed.organizationId === orgId) return parsed;
      }
    } catch { /* fall through */ }
    return getMemoryUpdates(orgId).get(id) ?? null;
  },

  async reviewUpdate(orgId: string, actor: { id: string; role: string | null }, id: string, decision: "applied" | "rejected", reviewNote?: string): Promise<PoliticsUpdate | null> {
    if (actor.role !== "SUPER_ADMIN") {
      throw AppError.forbidden("Only the Super Admin may apply or reject political knowledge updates.");
    }
    const update = await this.getUpdate(orgId, id);
    if (!update) return null;
    if (update.status !== "pending_review") {
      throw AppError.conflict(`Update is already ${update.status}.`);
    }
    const now = new Date().toISOString();
    const applied: PoliticsUpdate = {
      ...update,
      status: decision,
      reviewNote: reviewNote ?? null,
      updatedAt: now,
      appliedAt: decision === "applied" ? now : null,
      appliedBy: decision === "applied" ? actor.id : null,
      changeLog: decision === "applied" ? {
        id: `cl_${Date.now()}_${randomUUID().slice(0, 8)}`,
        updateId: update.id,
        entityId: update.entityId,
        entityKind: update.entityKind,
        field: update.field,
        previousValue: update.previousValue,
        newValue: update.newValue,
        effectiveDate: update.effectiveDate,
        source: update.sources[0]!,
        verification: update.verification,
        appliedAt: now,
        appliedBy: actor.id,
      } : null,
    };
    await this.persistUpdate(orgId, applied);
    return applied;
  },

  async persistUpdate(orgId: string, update: PoliticsUpdate): Promise<void> {
    const mem = getMemoryUpdates(orgId);
    mem.set(update.id, update);
    if (mem.size > MAX_UPDATES) {
      const oldest = [...mem.entries()].sort((a, b) => a[1].updatedAt.localeCompare(b[1].updatedAt))[0];
      if (oldest) mem.delete(oldest[0]);
    }
    try {
      await redis.set(K.updItem(orgId, update.id), JSON.stringify(update));
      await redis.zadd(K.updIdx(orgId), String(new Date(update.updatedAt).getTime()), update.id);
      const count = await redis.zcard(K.updIdx(orgId));
      if (count > MAX_UPDATES) {
        const excess = count - MAX_UPDATES;
        const oldIds = await redis.zrange(K.updIdx(orgId), 0, excess - 1);
        if (oldIds.length > 0) {
          await redis.zrem(K.updIdx(orgId), ...oldIds);
          for (const oldId of oldIds) await redis.del(K.updItem(orgId, oldId));
        }
      }
    } catch (e: any) {
      logger.debug("PoliticsService.persistUpdate: Redis unreachable, memory used", { error: e?.message });
    }
  },

  /** Versioned answers: current + historical views of a field. */
  async fieldHistory(orgId: string, entityId: string, field: string) {
    const updates = (await this.listUpdates(orgId, {})).filter((u) => u.entityId === entityId && u.field === field && u.status === "applied");
    return updates.map((u) => ({
      previousValue: u.previousValue,
      newValue: u.newValue,
      effectiveDate: u.effectiveDate,
      verification: u.verification,
      appliedAt: u.appliedAt,
      source: u.sources[0]?.label ?? null,
    }));
  },

  /** Test hook: clear the in-memory update ledger. */
  _resetForTests() {
    memoryUpdates.clear();
  },

  /* ── Stats & integrity ────────────────────────────────────────────── */

  async stats(orgId: string | null) {
    const updates = orgId ? await this.listUpdates(orgId, {}) : [];
    return {
      catalog: this.catalogMeta(),
      updates: {
        count: updates.length,
        byStatus: {
          pending_review: updates.filter((u) => u.status === "pending_review").length,
          applied: updates.filter((u) => u.status === "applied").length,
          rejected: updates.filter((u) => u.status === "rejected").length,
        },
        note: "Updates are organization-scoped change requests; applying one creates a change-log entry and never overwrites history (§28/§29).",
      },
    };
  },

  integrity(): { ok: boolean; issues: string[] } {
    const issues: string[] = [];
    const seen = new Set<string>();
    for (const r of POLITICS_CATALOG) {
      if (seen.has(r.id)) issues.push(`duplicate id: ${r.id}`);
      seen.add(r.id);
      if (!KIND_SET.has(r.kind)) issues.push(`${r.id}: unknown kind ${r.kind}`);
      if (!r.name || r.name.length < 2) issues.push(`${r.id}: missing name`);
      if (!r.summary || r.summary.length < 20) issues.push(`${r.id}: missing summary`);
      if (!r.simple || r.simple.length < 10) issues.push(`${r.id}: missing beginner explanation`);
      if ((r.sources ?? []).length === 0) issues.push(`${r.id}: no sources`);
      if (isNaN(Date.parse(r.meta.lastReviewed))) issues.push(`${r.id}: invalid lastReviewed`);
      for (const rid of r.relatedIds ?? []) {
        if (!CATALOG_BY_ID.has(rid) && !rid.startsWith("update:")) issues.push(`${r.id}: dangling relatedId ${rid}`);
      }
    }
    return { ok: issues.length === 0, issues };
  },

  /** Enterprise Search integration. */
  listSearchable(): Array<{ id: string; title: string; body: string; meta: string; updatedAt: string }> {
    return POLITICS_CATALOG.filter((r) => ["country", "leader", "party", "election", "ideology", "international_organization", "movement"].includes(r.kind)).map((r) => ({
      id: r.id,
      title: r.name,
      body: `${r.summary} ${(r.altNames ?? []).join(" ")}`,
      meta: `${r.kind} · ${r.meta.verification}`,
      updatedAt: r.meta.lastReviewed,
    }));
  },
};
