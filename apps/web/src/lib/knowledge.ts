/**
 * Session 140 — Global Knowledge & Everyday Question Intelligence web client
 * (routes/knowledge.ts → /api/v1/knowledge).
 *
 * Typed functions for: catalog meta, the 90 master categories, content kinds,
 * teaching levels, history eras, the timeline engine, deterministic search,
 * record detail, the Question Intent Engine, Ask WINDELS, the comparison
 * engine, the knowledge graph, stats, and the org-scoped dynamic records CRUD.
 */
import { api } from "./api";
import type {
  KnowledgeRecord,
  KnowledgeKind,
  KnowledgeConfidence,
  KnowledgeTier,
  AudienceLevel,
  QuestionIntent,
  IntentClassification,
  KnowledgeAnswerMatch,
  KnowledgeComparisonResult,
  TimelineEventView,
} from "@windels/shared";

export type {
  KnowledgeRecord,
  KnowledgeKind,
  KnowledgeConfidence,
  KnowledgeTier,
  AudienceLevel,
  QuestionIntent,
  IntentClassification,
  KnowledgeAnswerMatch,
  KnowledgeComparisonResult,
  TimelineEventView,
};

export interface KnowledgeCatalogMeta {
  catalogVersion: string;
  recordCount: number;
  categoryCount: number;
  kindCount: number;
  eraCount: number;
  byTier: Record<string, number>;
  byConfidence: Record<string, number>;
  byKind: Record<string, number>;
  dynamicPolicyNote: string;
}

export interface KnowledgeKindView {
  kind: KnowledgeKind;
  label: string;
  layer: string;
  description: string;
  recordCount: number;
}

export interface HistoryEraView {
  id: string;
  name: string;
  dateLabel: string;
  startYear: number | null;
  endYear: number | null;
  summary: string;
  eventCount: number;
}

export interface KnowledgeSearchResponse {
  query: string;
  filters: Record<string, unknown>;
  scored: boolean;
  audienceLevel: AudienceLevel;
  total: number;
  results: KnowledgeAnswerMatch[];
  note?: string;
}

export interface AskResponse {
  question: string;
  intent: IntentClassification;
  routing: { intent: QuestionIntent; domain: string; note: string };
  audienceLevel: AudienceLevel;
  matches: KnowledgeAnswerMatch[];
  count: number;
  note?: string;
}

export interface KnowledgeStats {
  catalog: KnowledgeCatalogMeta;
  dynamic: {
    count: number;
    byConfidence: Record<string, number>;
    storeAvailable: boolean;
    note: string;
  };
}

export interface KnowledgeCategoryView {
  id: string;
  name: string;
  description: string;
  recordCount: number;
}

/** Catalog metadata: version, counts, tier/confidence/kind breakdowns. */
export function getKnowledgeCatalogMeta(): Promise<KnowledgeCatalogMeta> {
  return api<KnowledgeCatalogMeta>("/knowledge/catalog");
}

/** The 90 master categories with record counts. */
export function listKnowledgeCategories(): Promise<KnowledgeCategoryView[]> {
  return api<KnowledgeCategoryView[]>("/knowledge/categories");
}

/** The 24 content layers (kinds) with record counts. */
export function listKnowledgeKinds(): Promise<KnowledgeKindView[]> {
  return api<KnowledgeKindView[]>("/knowledge/kinds");
}

/** The five teaching audience levels. */
export function listKnowledgeLevels(): Promise<{ level: AudienceLevel; mode: string; includedSections: string[]; note: string }[]> {
  return api("/knowledge/levels");
}

/** The eight history eras with event counts. */
export function listHistoryEras(): Promise<HistoryEraView[]> {
  return api<HistoryEraView[]>("/knowledge/eras");
}

/** The global timeline engine (optionally filtered by era). */
export function getKnowledgeTimeline(era?: string): Promise<{ eraId: string | null; eras: HistoryEraView[]; events: TimelineEventView[] }> {
  return api(`/knowledge/timeline${era ? `?era=${encodeURIComponent(era)}` : ""}`);
}

/** Deterministic retrieval with filters. */
export function searchKnowledge(params: {
  q?: string;
  kind?: KnowledgeKind;
  intent?: QuestionIntent;
  category?: string;
  tier?: KnowledgeTier;
  confidence?: KnowledgeConfidence;
  scope?: "catalog" | "org" | "all";
  audienceLevel?: AudienceLevel;
  limit?: number;
}): Promise<KnowledgeSearchResponse> {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.kind) usp.set("kind", params.kind);
  if (params.intent) usp.set("intent", params.intent);
  if (params.category) usp.set("category", params.category);
  if (params.tier) usp.set("tier", params.tier);
  if (params.confidence) usp.set("confidence", params.confidence);
  if (params.scope) usp.set("scope", params.scope);
  if (params.audienceLevel) usp.set("audienceLevel", params.audienceLevel);
  if (params.limit) usp.set("limit", String(params.limit));
  const qs = usp.toString();
  return api<KnowledgeSearchResponse>(`/knowledge/search${qs ? `?${qs}` : ""}`);
}

/** Record detail (catalog or org-scoped dynamic). */
export function getKnowledgeRecord(id: string): Promise<KnowledgeRecord> {
  return api<KnowledgeRecord>(`/knowledge/records/${encodeURIComponent(id)}`);
}

/** Question Intent Engine: classify a question into one of the 13 intents. */
export function classifyKnowledgeIntent(text: string): Promise<IntentClassification> {
  return api<IntentClassification>("/knowledge/intent", { method: "POST", json: { text } });
}

/** Ask WINDELS: intent → route → retrieve → render at an audience level. */
export function askKnowledge(input: {
  question: string;
  audienceLevel?: AudienceLevel;
  limit?: number;
  includeDynamic?: boolean;
}): Promise<AskResponse> {
  return api<AskResponse>("/knowledge/ask", { method: "POST", json: input });
}

/** Criteria-based comparison (never a universal winner). */
export function compareKnowledgeRecords(input: {
  recordIds: string[];
  criteriaKeys?: string[];
}): Promise<KnowledgeComparisonResult & { missing: string[] }> {
  return api("/knowledge/compare", { method: "POST", json: input });
}

/** Knowledge graph stats. */
export function getKnowledgeGraphStats(): Promise<{ nodeCount: number; edgeCount: number; kindCounts: Record<string, number> }> {
  return api("/knowledge/graph");
}

/** Knowledge graph node: record + neighbors + edges. */
export function getKnowledgeGraphNode(id: string): Promise<{
  node: { id: string; title: string; kind: KnowledgeKind };
  edges: { from: string; to: string; relation: string }[];
  nodes: { id: string; title: string; kind: KnowledgeKind }[];
}> {
  return api(`/knowledge/graph/${encodeURIComponent(id)}`);
}

/** Rollup stats (catalog + org dynamic). */
export function getKnowledgeStats(): Promise<KnowledgeStats> {
  return api<KnowledgeStats>("/knowledge/stats");
}

/** List records (scope: catalog | org | all). */
export function listKnowledgeRecords(params?: {
  scope?: "catalog" | "org" | "all";
  kind?: KnowledgeKind;
  confidence?: KnowledgeConfidence;
  limit?: number;
}): Promise<KnowledgeRecord[] | { catalog: KnowledgeRecord[]; dynamic: KnowledgeRecord[] }> {
  const usp = new URLSearchParams();
  usp.set("scope", params?.scope ?? "catalog");
  if (params?.kind) usp.set("kind", params.kind);
  if (params?.confidence) usp.set("confidence", params.confidence);
  if (params?.limit) usp.set("limit", String(params.limit));
  return api(`/knowledge/records?${usp.toString()}`);
}

/** Add an org-scoped dynamic record (requires SOURCE; confidence defaults to unverified). */
export function addKnowledgeRecord(input: {
  title: string;
  question: string;
  kind?: KnowledgeKind;
  categoryIds: string[];
  summary: string;
  sections?: Record<string, string>;
  sources: { label: string; url?: string; retrievedAt?: string; note?: string }[];
  confidence?: KnowledgeConfidence;
  asOfDate?: string;
  verificationNote?: string;
}): Promise<KnowledgeRecord> {
  return api<KnowledgeRecord>("/knowledge/records", { method: "POST", json: input });
}

/** Update an org-scoped dynamic record. */
export function updateKnowledgeRecord(id: string, patch: Record<string, unknown>): Promise<KnowledgeRecord> {
  return api<KnowledgeRecord>(`/knowledge/records/${encodeURIComponent(id)}`, { method: "PATCH", json: patch });
}

/** Delete an org-scoped dynamic record (correction path). */
export function deleteKnowledgeRecord(id: string): Promise<{ deleted: boolean; id: string }> {
  return api(`/knowledge/records/${encodeURIComponent(id)}`, { method: "DELETE" });
}
