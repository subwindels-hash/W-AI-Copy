/**
 * Session 141 — Global Religion, Belief & Spirituality Knowledge web client
 * (routes/religions.ts → /api/v1/religions).
 *
 * Typed functions for: catalog meta, the 12 families, deterministic search,
 * record detail, educational levels (beginner → research), the religion
 * question engine (with the neutrality answer for truth-claim questions),
 * the criteria-based comparison engine, and the ten-step expansion pipeline.
 */
import { api } from "./api";
import type {
  ReligionRecord,
  ReligionFamily,
  ReligionCategory,
  ReligionStatus,
  ReligionLevel,
  ReligionQuestionClassification,
  ReligionComparisonResult,
  ReligionSubmission,
} from "@windels/shared";

export type {
  ReligionRecord,
  ReligionFamily,
  ReligionCategory,
  ReligionStatus,
  ReligionLevel,
  ReligionQuestionClassification,
  ReligionComparisonResult,
  ReligionSubmission,
};

export interface ReligionCatalogMeta {
  catalogVersion: string;
  recordCount: number;
  familyCount: number;
  families: Array<{ family: ReligionFamily; label: string; description: string; recordCount: number }>;
  byFamily: Record<string, number>;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  neutralityNote: string;
  expansionNote: string;
}

export interface ReligionAnswerMatch {
  id: string;
  name: string;
  family: ReligionFamily;
  category: ReligionCategory;
  status: ReligionStatus;
  summary: string;
  sections: Array<{ key: string; heading: string; body: string }>;
  sources: ReligionRecord["sources"];
  confidence: ReligionRecord["confidence"];
  controversialNote?: string;
}

export interface ReligionAskResponse {
  question: string;
  intent: ReligionQuestionClassification;
  mode: "teach" | "comparison" | "neutrality";
  level: ReligionLevel;
  matches: ReligionAnswerMatch[];
  comparison?: ReligionComparisonResult & { missing: string[] };
  count?: number;
  note?: string;
}

export interface ReligionTeachResponse {
  id: string;
  name: string;
  family: ReligionFamily;
  category: ReligionCategory;
  status: ReligionStatus;
  level: ReligionLevel;
  sections: Array<{ key: string; heading: string; body: string }>;
  festivals: string[];
  sacredTexts: string[];
  sacredPlaces: string[];
  symbols: string[];
  names: {
    altNames: string[];
    indigenousNames: ReligionRecord["indigenousNames"];
    namesByLanguage: Record<string, string[]>;
  };
  sources: ReligionRecord["sources"];
  confidence: ReligionRecord["confidence"];
  lastReviewed: string;
  controversialNote?: string;
  researchNote?: string;
}

export interface ReligionStats {
  catalog: ReligionCatalogMeta;
  extensions: { count: number; note: string };
  submissions: {
    count: number;
    byStatus: Record<string, number>;
    note: string;
  };
}

/** Catalog metadata: version, counts, neutrality note. */
export function getReligionCatalogMeta(): Promise<ReligionCatalogMeta> {
  return api<ReligionCatalogMeta>("/religions/catalog");
}

/** The 12 religious families with record counts. */
export function listReligionFamilies(): Promise<ReligionCatalogMeta["families"]> {
  return api<ReligionCatalogMeta["families"]>("/religions/families");
}

/** Deterministic retrieval with filters. */
export function searchReligions(params: {
  q?: string;
  family?: ReligionFamily;
  category?: ReligionCategory;
  status?: ReligionStatus;
  theism?: string;
  region?: string;
  limit?: number;
}): Promise<{ query: string; filters: Record<string, unknown>; scored: boolean; total: number; results: ReligionRecord[]; note?: string }> {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.family) usp.set("family", params.family);
  if (params.category) usp.set("category", params.category);
  if (params.status) usp.set("status", params.status);
  if (params.theism) usp.set("theism", params.theism);
  if (params.region) usp.set("region", params.region);
  if (params.limit) usp.set("limit", String(params.limit));
  const qs = usp.toString();
  return api(`/religions/search${qs ? `?${qs}` : ""}`);
}

/** Record detail (catalog or approved extension). */
export function getReligionRecord(id: string): Promise<ReligionRecord> {
  return api<ReligionRecord>(`/religions/records/${encodeURIComponent(id)}`);
}

/** Educational levels: beginner → research. */
export function teachReligion(id: string, level: ReligionLevel = "intermediate"): Promise<ReligionTeachResponse> {
  return api<ReligionTeachResponse>(`/religions/records/${encodeURIComponent(id)}/teach?level=${level}`);
}

/** Religion question engine — including the neutrality answer for truth claims. */
export function askReligion(input: { question: string; level?: ReligionLevel; limit?: number }): Promise<ReligionAskResponse> {
  return api<ReligionAskResponse>("/religions/ask", { method: "POST", json: input });
}

/** Criteria-based comparison across the 18 spec categories (no winner). */
export function compareReligionsByIds(recordIds: string[]): Promise<ReligionComparisonResult & { missing: string[] }> {
  return api("/religions/compare", { method: "POST", json: { recordIds } });
}

/** Ten-step expansion pipeline: submit a new tradition (org-scoped). */
export function submitReligion(input: {
  name: string;
  altNames?: string[];
  indigenousNames?: ReligionRecord["indigenousNames"];
  family: ReligionFamily;
  category: ReligionCategory;
  status?: ReligionStatus;
  region: string[];
  originLabel: string;
  centralTeachings: string;
  deityConcept: string;
  historicalDevelopment: string;
  summary: string;
  simple: string;
  sources: ReligionRecord["sources"];
  afterlife?: string;
  salvation?: string;
  worship?: string;
  prayer?: string;
  festivals?: string[];
  sacredTexts?: string[];
  relatedReligions?: string[];
}): Promise<ReligionSubmission> {
  return api<ReligionSubmission>("/religions/submissions", { method: "POST", json: input });
}

/** List org submissions (optionally by status). */
export function listReligionSubmissions(params?: { status?: string; limit?: number }): Promise<ReligionSubmission[]> {
  const usp = new URLSearchParams();
  if (params?.status) usp.set("status", params.status);
  if (params?.limit) usp.set("limit", String(params.limit));
  const qs = usp.toString();
  return api<ReligionSubmission[]>(`/religions/submissions${qs ? `?${qs}` : ""}`);
}

/** Delete an org submission (correction path). */
export function deleteReligionSubmission(id: string): Promise<{ deleted: boolean; id: string }> {
  return api(`/religions/submissions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Super Admin approve/reject a submission. */
export function reviewReligionSubmission(id: string, status: "approved" | "rejected", reviewNote?: string): Promise<ReligionSubmission> {
  return api<ReligionSubmission>(`/religions/submissions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    json: { status, reviewNote },
  });
}

/** Rollup stats. */
export function getReligionStats(): Promise<ReligionStats> {
  return api<ReligionStats>("/religions/stats");
}

/* ── Session 142 — §20 integration channels ─────────────────────────────── */

export interface ReligionMemorySyncResult {
  channel: "memory";
  attempted: number;
  succeeded: number;
  failed: number;
  skippedDuplicateNote: string;
  lastSyncedAt: string;
  catalogVersion: string;
}

export interface ReligionAgentAttachResult {
  channel: "agents";
  agentId: string;
  attached: number;
  alreadyPresent: number;
  totalInCatalog: number;
  catalogVersion: string;
  note: string;
}

export interface ReligionTrainingDatasetResult {
  channel: "training";
  dataset: { id: string; name: string; rows: number; syntheticPct: number };
  rows: number;
  sizeBytes: number;
  syntheticPct: 0;
  cleaned: true;
  ragbuilderIncluded: true;
  exportNote: string;
}

export interface ReligionChatTurn {
  channel: "chat";
  role: "assistant";
  question: string;
  intent: ReligionQuestionClassification;
  mode: string;
  level: ReligionLevel;
  answer: string;
  sections: Array<{ key: string; heading: string; body: string }>;
  sources: ReligionRecord["sources"];
  confidence: string | null;
  controversialNote?: string;
  followUp: string[];
  note?: string;
}

/** Integration overview: status of all five channels. */
export function getReligionsIntegrationsOverview(): Promise<{
  channel: "overview";
  catalogVersion: string;
  recordCount: number;
  extensionCount: number;
  memory: { synced: boolean; lastSyncAt: string | null };
  trainingDataset: { created: boolean; datasetId: string | null; rows: number | null };
  educationCourseCount: number;
  chatSurface: "available";
}> {
  return api("/religions/integrations");
}

/** Sync the curated catalog into the Enterprise Memory Fabric (idempotent). */
export function syncReligionsMemory(opts?: { family?: string; force?: boolean }): Promise<ReligionMemorySyncResult> {
  return api<ReligionMemorySyncResult>("/religions/integrations/memory/sync", { method: "POST", json: opts ?? {} });
}

/** Last memory-fabric sync status. */
export function getReligionsMemoryStatus(): Promise<{ channel: "memory"; lastSync: { at: string; count: number; version: string } | null }> {
  return api("/religions/integrations/memory");
}

/** Attach religion knowledge to an AI workforce agent (deduplicated by title). */
export function attachReligionKnowledgeToAgent(agentId: string, opts?: { family?: string; limit?: number }): Promise<ReligionAgentAttachResult> {
  const usp = new URLSearchParams();
  if (opts?.family) usp.set("family", opts.family);
  if (opts?.limit) usp.set("limit", String(opts.limit));
  const qs = usp.toString();
  return api<ReligionAgentAttachResult>(`/religions/integrations/agents/${encodeURIComponent(agentId)}/attach${qs ? `?${qs}` : ""}`, { method: "POST" });
}

/** Which catalog records are already attached to an agent. */
export function getAgentReligionStatus(agentId: string): Promise<{ channel: "agents"; agentId: string; attachedCount: number; attachedTitles: string[] }> {
  return api(`/religions/integrations/agents/${encodeURIComponent(agentId)}`);
}

/** Create the zero-synthetic curated RAG dataset in the AI Training Center. */
export function createReligionTrainingDataset(opts?: { family?: string }): Promise<ReligionTrainingDatasetResult> {
  const usp = new URLSearchParams();
  if (opts?.family) usp.set("family", opts.family);
  const qs = usp.toString();
  return api<ReligionTrainingDatasetResult>(`/religions/integrations/training/dataset${qs ? `?${qs}` : ""}`, { method: "POST" });
}

/** JSONL export URL of the curated training corpus. */
export function religionTrainingExportUrl(opts?: { family?: string }): string {
  const usp = new URLSearchParams();
  if (opts?.family) usp.set("family", opts.family);
  const qs = usp.toString();
  return `/api/v1/religions/integrations/training/export${qs ? `?${qs}` : ""}`;
}

/** Every record as a teachable course. */
export function getReligionEducationCatalog(): Promise<Array<{ courseId: string; title: string; family: string; category: string; status: string; level: string; topics: string[]; summary: string }>> {
  return api("/religions/integrations/education/catalog");
}

/** Curated lesson + real Lecturer AI session for a record. */
export function startReligionLesson(recordId: string, level: ReligionLevel): Promise<{ channel: "education"; course: ReligionTeachResponse; lecturer: any; note: string }> {
  return api("/religions/integrations/education/lesson", { method: "POST", json: { recordId, level } });
}

/** Conversational teaching turn. */
export function chatReligion(input: { question: string; level?: ReligionLevel }): Promise<ReligionChatTurn> {
  return api<ReligionChatTurn>("/religions/integrations/chat", { method: "POST", json: input });
}
