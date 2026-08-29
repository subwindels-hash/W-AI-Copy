/**
 * Session 150 — Life Operating Principles Engine web client
 * (routes/lifePrinciples.ts → /api/v1/life-principles).
 *
 * Typed functions for: catalog metadata, the 10 rule parts, the 115-rule
 * catalog, rule detail, deterministic search, the Life Coaching Engine
 * (13 areas; "rules of life" → area menu), Daily Rules Mode, Decision Mode,
 * the 12 balance pairs and the WINDELS Principle.
 */
import { api } from "./api";
import type { LifeRule } from "@windels/shared";

export type { LifeRule, LifeRulePart } from "@windels/shared";

export interface LifePrinciplesCatalogMeta {
  catalogVersion: string;
  ruleCount: number;
  partCount: number;
  areaCount: number;
  philosophyPairCount: number;
  byPart: Record<string, number>;
  note: string;
}

export interface LifeRulePartView {
  id: string;
  label: string;
  start: number;
  end: number;
  description: string;
  ruleCount: number;
}

export interface LifeRuleView {
  id: string;
  number: number;
  part: string;
  title: string;
  principle: string;
  whyItMatters: string;
  howToApply: string;
  action: string;
  reflectionQuestion: string;
  considerations?: string;
  tags: string[];
}

export interface LifeCoachingAreaView {
  id: string;
  label: string;
  description: string;
  ruleNumbers: number[];
  ruleCount: number;
}

export interface LifeAskResponse {
  question: string;
  general: boolean;
  note: string;
  areas?: LifeCoachingAreaView[];
  sample?: Array<{ number: number; title: string; principle: string; part: string }>;
  area?: { id: string; label: string; description: string };
  classification?: {
    area: string;
    score: number;
    matchedKeywords: string[];
    explanation: string;
  } | null;
  rules?: LifeRuleView[];
}

export interface LifeDailyRuleView {
  date: string;
  ruleNumber: number;
  todayRule: string;
  whyItMatters: string;
  howToApply: string;
  todayAction: string;
  reflectionQuestion: string;
  note: string;
  rule: LifeRuleView;
}

export interface LifeDecisionView {
  situation: string;
  framework: string[];
  relevantPrinciples: Array<{ number: number; title: string; principle: string }>;
  note: string;
}

export interface LifePhilosophyPair {
  id: string;
  phrase: string;
  meaning: string;
  guidance: string;
}

/** Catalog metadata: version, counts, framing note. */
export function getLifePrinciplesCatalogMeta(): Promise<LifePrinciplesCatalogMeta> {
  return api<LifePrinciplesCatalogMeta>("/life-principles/catalog");
}

/** The 10 rule parts with counts. */
export function listLifeRuleParts(): Promise<LifeRulePartView[]> {
  return api<LifeRulePartView[]>("/life-principles/parts");
}

/** List rules, optionally filtered by part. */
export function listLifeRules(params?: { part?: string; limit?: number; offset?: number }): Promise<LifeRuleView[]> {
  const qs = new URLSearchParams();
  if (params?.part) qs.set("part", params.part);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<LifeRuleView[]>(`/life-principles/rules${suffix}`);
}

/** A single rule by number (1–115). */
export function getLifeRule(number: number): Promise<LifeRuleView> {
  return api<LifeRuleView>(`/life-principles/rules/${number}`);
}

/** Deterministic text search over titles, principles and tags. */
export function searchLifeRules(q: string, params?: { part?: string; limit?: number }): Promise<LifeRuleView[]> {
  return api<LifeRuleView[]>("/life-principles/search", { method: "POST", body: JSON.stringify({ q, part: params?.part, limit: params?.limit }) });
}

/** The 13 Life Coaching areas. */
export function listLifeAreas(): Promise<LifeCoachingAreaView[]> {
  return api<LifeCoachingAreaView[]>("/life-principles/areas");
}

/** Life Coaching Engine: classify a question into an area and return its principles. */
export function askLifePrinciples(question: string, opts?: { area?: string; limit?: number }): Promise<LifeAskResponse> {
  return api<LifeAskResponse>("/life-principles/ask", { method: "POST", body: JSON.stringify({ question, area: opts?.area, limit: opts?.limit }) });
}

/** Daily Rules Mode — deterministic per date (YYYY-MM-DD) or ?rule= override. */
export function getLifeDailyRule(params?: { date?: string; rule?: number }): Promise<LifeDailyRuleView> {
  const qs = new URLSearchParams();
  if (params?.date) qs.set("date", params.date);
  if (params?.rule) qs.set("rule", String(params.rule));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<LifeDailyRuleView>(`/life-principles/daily${suffix}`);
}

/** Decision Mode — the 10-question framework (never decides for the user). */
export function runLifeDecision(situation: string, context?: string): Promise<LifeDecisionView> {
  return api<LifeDecisionView>("/life-principles/decision", { method: "POST", body: JSON.stringify({ situation, context }) });
}

/** The 12 "X without Y" balance pairs. */
export function getLifePhilosophy(): Promise<LifePhilosophyPair[]> {
  return api<LifePhilosophyPair[]>("/life-principles/philosophy");
}

/** Part X — the WINDELS Principle steps. */
export function getLifePrinciple(): Promise<{ steps: string[]; note: string }> {
  return api<{ steps: string[]; note: string }>("/life-principles/principle");
}

/** Catalog integrity report. */
export function getLifePrinciplesIntegrity(): Promise<{ ok: boolean; issues: string[] }> {
  return api<{ ok: boolean; issues: string[] }>("/life-principles/integrity");
}
