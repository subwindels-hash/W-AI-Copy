/** Session 98 — Enterprise Search client. */
import { api } from "./api";

export type EsEntityType =
  | "contact" | "company" | "deal" | "product" | "supplier" | "purchase_order"
  | "sales_order" | "message" | "post" | "comment" | "ticket" | "task"
  | "project" | "artifact" | "report";

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

export const searchApi = {
  rollup: () => api<EsRollup>("/search/dashboard/rollup"),
  query: (q: string, types?: EsEntityType[], limit?: number) =>
    api<EsSearchResult>("/search/query", { params: { q, types: types?.join(","), limit } }),
  history: () => api<EsRecentSearch[]>("/search/history"),
  clearHistory: () => api<{ cleared: boolean }>("/search/history", { method: "DELETE" }),
  removeHistory: (id: string) => api<{ removed: boolean; id: string }>(`/search/history/${id}`, { method: "DELETE" }),
};
