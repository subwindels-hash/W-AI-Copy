// Session 98 — Enterprise Search (Unified Organization Search).
//
// The platform now ships an enterprise application suite but had no way to
// search across all of it. This module adds a unified, org-scoped search
// over the REAL module records: queries are answered by scanning the module
// stores through each service and ranking matches with a deterministic
// relevance score — no separate index, no fabricated results.
//
// Types are prefixed `Es`. Single source of truth shared by the API service,
// the HTTP routes and the web client.

import { z } from "zod";

// ─── Entity types ───────────────────────────────────────────────────────

export const ES_ENTITY_TYPES = [
  "contact", "company", "deal", "product", "supplier", "purchase_order",
  "sales_order", "message", "post", "comment", "ticket", "task", "project",
  "artifact", "report", "knowledge", "religion",
] as const;
export type EsEntityType = (typeof ES_ENTITY_TYPES)[number];

// ─── Records ────────────────────────────────────────────────────────────

export interface EsSearchHit {
  id: string;
  type: EsEntityType;
  title: string;
  snippet: string;
  score: number;
  updatedAt: string;
  meta: string | null;
}

export interface EsFacet {
  type: EsEntityType;
  count: number;
}

export interface EsSearchResult {
  query: string;
  tookMs: number;
  total: number;
  hits: EsSearchHit[];
  facets: EsFacet[];
}

export interface EsRecentSearch {
  id: string;
  query: string;
  ranAt: string;
}

export interface EsRollup {
  indexedCounts: Record<EsEntityType, number>;
  recentSearches: EsRecentSearch[];
  lastUpdatedAt: string | null;
}

// ─── Input schemas (validated at the API boundary) ──────────────────────

export const EsSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  types: z.array(z.enum(ES_ENTITY_TYPES)).max(ES_ENTITY_TYPES.length).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type EsSearchQuery = z.infer<typeof EsSearchQuerySchema>;
