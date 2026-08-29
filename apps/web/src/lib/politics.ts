/**
 * Session 144 — Global Politics, Government & Political History web client
 * (routes/politics.ts → /api/v1/politics).
 */
import { api } from "./api";
import type {
  PoliticsEntityKind,
  PoliticsLevel,
  PoliticsQuestionClassification,
  FactOpinionClassification,
} from "@windels/shared";

export type { PoliticsEntityKind, PoliticsLevel, PoliticsQuestionClassification, FactOpinionClassification };

export interface PoliticsRecordSummary {
  id: string;
  kind: PoliticsEntityKind;
  name: string;
  altNames: string[];
  summary: string;
  meta: { verification: string; asOfDate?: string; lastVerified?: string; lastReviewed: string };
  relatedIds: string[];
}

export interface PoliticsSearchResponse {
  query: string;
  filters: Record<string, unknown>;
  scored: boolean;
  level: PoliticsLevel;
  total: number;
  results: PoliticsRecordSummary[];
  note?: string;
}

export interface PoliticsAskResponse {
  question: string;
  intent: PoliticsQuestionClassification;
  mode: string;
  level: PoliticsLevel;
  matches: Array<PoliticsRecordSummary & { sections: Array<{ key: string; heading: string; body: string }>; [k: string]: any }>;
  count?: number;
  note?: string;
  leaders?: PoliticsRecordSummary[];
  country?: PoliticsRecordSummary;
}

export interface PoliticsTimeline {
  country: PoliticsRecordSummary;
  periods: Array<{ id: string; label: string; dateLabel: string; year: number | null; text: string }>;
  events: Array<{ id: string; title: string; dateLabel: string; year: number | null; eventType: string; summary: string }>;
}

export interface LeaderTimelineEntry {
  id: string;
  name: string;
  title: string;
  titleKind: string;
  role: string;
  party?: string;
  officeStart: string;
  officeEnd?: string;
  ordinal?: number;
  cameToOffice: string;
  verification: string;
}

export interface PoliticsQuiz {
  topicId: string;
  topicName: string;
  level: PoliticsLevel;
  questions: Array<{ id: string; question: string; choices: string[]; correctIndex: number; explanation: string }>;
  note: string;
}

/** Catalog metadata: version, counts, neutrality + current-info notes. */
export function getPoliticsCatalogMeta(): Promise<{
  catalogVersion: string;
  recordCount: number;
  countryCount: number;
  byKind: Record<string, number>;
  byVerification: Record<string, number>;
  neutralityNote: string;
  currentInfoNote: string;
}> {
  return api("/politics/catalog");
}

/** Natural-language search across all political entities. */
export function searchPolitics(params: {
  q?: string;
  kind?: PoliticsEntityKind;
  country?: string;
  level?: PoliticsLevel;
  limit?: number;
}): Promise<PoliticsSearchResponse> {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.kind) usp.set("kind", params.kind);
  if (params.country) usp.set("country", params.country);
  if (params.level) usp.set("level", params.level);
  if (params.limit) usp.set("limit", String(params.limit));
  const qs = usp.toString();
  return api<PoliticsSearchResponse>(`/politics/search${qs ? `?${qs}` : ""}`);
}

/** Record detail. */
export function getPoliticsRecord(id: string): Promise<any> {
  return api(`/politics/records/${encodeURIComponent(id)}`);
}

/** The question engine — the §26 examples work here. */
export function askPolitics(input: { question: string; level?: PoliticsLevel; limit?: number }): Promise<PoliticsAskResponse> {
  return api<PoliticsAskResponse>("/politics/ask", { method: "POST", json: input });
}

/** Neutral country comparison. */
export function compareCountriesByIds(countryIds: string[]): Promise<any> {
  return api("/politics/compare", { method: "POST", json: { countryIds } });
}

/** Fact-vs-opinion engine (§23). */
export function classifyPoliticalClaim(text: string): Promise<FactOpinionClassification> {
  return api<FactOpinionClassification>("/politics/claim", { method: "POST", json: { text } });
}

/** Country political timeline (§18). */
export function getCountryTimeline(countryId: string): Promise<PoliticsTimeline> {
  return api<PoliticsTimeline>(`/politics/timeline/${encodeURIComponent(countryId)}`);
}

/** Leader timeline (§19). */
export function getLeaderTimeline(countryId: string): Promise<LeaderTimelineEntry[]> {
  return api<LeaderTimelineEntry[]>(`/politics/leaders/${encodeURIComponent(countryId)}`);
}

/** Knowledge graph (§20). */
export function getPoliticsGraphNode(id: string): Promise<{
  node: { id: string; kind: string; name: string };
  edges: Array<{ from: string; to: string; relation: string }>;
  nodes: Array<{ id: string; kind: string; name: string }>;
}> {
  return api(`/politics/graph/${encodeURIComponent(id)}`);
}

/** Complex graph questions (§20). */
export function answerPoliticsGraphQuestion(question: string): Promise<any> {
  return api("/politics/graph/answer", { method: "POST", json: { question } });
}

/** Education catalog: every country as a course. */
export function getPoliticsEducationCatalog(): Promise<Array<{ courseId: string; title: string; kind: string; summary: string }>> {
  return api("/politics/education/catalog");
}

/** Deterministic quiz (§31). */
export function createPoliticsQuiz(topicId: string, level: PoliticsLevel = "intermediate", count = 5): Promise<PoliticsQuiz> {
  return api<PoliticsQuiz>("/politics/quiz", { method: "POST", json: { topicId, level, count } });
}

/** Update engine: submit a change request (§28). */
export function submitPoliticsUpdate(input: {
  kind: "leadership_change" | "appointment" | "resignation" | "cabinet_change" | "election_result" | "legislative_change" | "constitutional_change" | "major_event" | "correction";
  entityId: string;
  entityKind: PoliticsEntityKind;
  title: string;
  changeSummary: string;
  field: string;
  previousValue?: string | null;
  newValue: string;
  effectiveDate: string;
  sources: Array<{ label: string; type?: string }>;
  verification?: string;
}): Promise<any> {
  return api("/politics/updates", { method: "POST", json: input });
}

/** List org updates. */
export function listPoliticsUpdates(params?: { status?: string; limit?: number }): Promise<any[]> {
  const usp = new URLSearchParams();
  if (params?.status) usp.set("status", params.status);
  if (params?.limit) usp.set("limit", String(params.limit));
  const qs = usp.toString();
  return api<any[]>(`/politics/updates${qs ? `?${qs}` : ""}`);
}

/** Super Admin apply/reject an update. */
export function reviewPoliticsUpdate(id: string, status: "applied" | "rejected", reviewNote?: string): Promise<any> {
  return api(`/politics/updates/${encodeURIComponent(id)}`, { method: "PATCH", json: { status, reviewNote } });
}

/** Stats. */
export function getPoliticsStats(): Promise<any> {
  return api("/politics/stats");
}
