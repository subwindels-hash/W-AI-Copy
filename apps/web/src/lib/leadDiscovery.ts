/**
 * Session 85 — AI Lead Discovery API client.
 * Backend queries authorized sources (Google Places when GOOGLE_PLACES_API_KEY
 * is set); the UI surfaces configuration requirements honestly.
 */
import { api } from "./api";

export interface Lead {
  id: string;
  name: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  source: "google_places";
  sourceId: string;
  discoveredAt: string;
  verificationStatus: "source_returned";
  query: string;
}

export interface LeadCollection {
  id: string;
  name: string;
  createdById: string;
  leadIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  query: string;
  source: "google_places";
  results: Lead[];
}

/** Legacy admin-tab client shape (PlatformPage Session 85 tab). */
export type LeadRecord = Omit<Lead, "verificationStatus"> & {
  verificationStatus: Lead["verificationStatus"] | "verified";
};
export type CollectionRecord = Omit<LeadCollection, "leadIds"> & {
  leadIds: string[];
  leadsCount: number;
};
const toCollection = (c: LeadCollection): CollectionRecord => ({ ...c, leadsCount: c.leadIds.length });

export const leadDiscoveryApi = {
  search: async (query: string): Promise<LeadRecord[]> => (await api.post<SearchResult>("/lead-discovery/search", { query })).results as LeadRecord[],
  listCollections: async (): Promise<CollectionRecord[]> => (await api.get<LeadCollection[]>("/lead-discovery/collections")).map(toCollection),
  createCollection: async (name: string): Promise<CollectionRecord> => toCollection(await api.post<LeadCollection>("/lead-discovery/collections", { name })),
  addLead: async (collectionId: string, leadId: string): Promise<CollectionRecord> => toCollection(await api.post<LeadCollection>(`/lead-discovery/collections/${collectionId}/leads`, { leadId })),
};

export const leadApi = {
  search: (query: string) => api.post<SearchResult>("/lead-discovery/search", { query }),
  leads: () => api.get<Lead[]>("/lead-discovery/leads"),
  collections: () => api.get<LeadCollection[]>("/lead-discovery/collections"),
  createCollection: (name: string) => api.post<LeadCollection>("/lead-discovery/collections", { name }),
  addToCollection: (collectionId: string, leadId: string) => api.post<LeadCollection>(`/lead-discovery/collections/${collectionId}/leads`, { leadId }),
  exportJson: async (leadIds: string[]): Promise<{ exportedAt: string; leads: Lead[] }> =>
    api.post("/lead-discovery/export", { leadIds, format: "json" }),
  /** Downloads the CSV the server streams back (not the JSON envelope). */
  exportCsv: async (leadIds: string[]): Promise<void> => {
    const { useAuthStore } = await import("@/store/auth");
    const token = useAuthStore.getState().accessToken;
    const base = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");
    const res = await fetch(`${base}/lead-discovery/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ leadIds, format: "csv" }),
    });
    if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "windels-leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  },
};

/* ════════════════════════════════════════════════════════════════════════
 * Session 115 — the pipeline surface.
 *
 * Everything above is Session 85's client and is untouched: `leadApi.search`,
 * `leadApi.leads`, the collection helpers and the original CSV download all
 * still call the same six endpoints.
 *
 * Every type below comes from `@windels/shared/leadDiscovery`, which the API
 * routes also compile against, so a renamed field is a build error rather than
 * a blank cell on a screen somebody is using to decide who to call.
 * ══════════════════════════════════════════════════════════════════════ */
import type {
  LeadCollectionDetail,
  LeadCoverageReport,
  LeadDuplicateReport,
  LeadDuplicateResolution,
  LeadExportPreview,
  LeadList,
  LeadNote,
  LeadNoteList,
  LeadQuery,
  LeadSearchHistory,
  LeadStatus,
  LeadSummary,
  LeadWithPipeline,
} from "@windels/shared/leadDiscovery";

export type {
  LeadCollectionDetail,
  LeadCoverageReport,
  LeadDuplicateGroup,
  LeadDuplicateReport,
  LeadDuplicateResolution,
  LeadExportPreview,
  LeadFieldCoverage,
  LeadList,
  LeadNote,
  LeadNoteList,
  LeadPipelineRecord,
  LeadSearchHistory,
  LeadSearchHistoryEntry,
  LeadStatus,
  LeadSummary,
  LeadWithPipeline,
} from "@windels/shared/leadDiscovery";

export {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_CONTACT_COVERAGE_NOTE,
} from "@windels/shared/leadDiscovery";

export const leadPipelineApi = {
  summary: () => api.get<LeadSummary>("/lead-discovery/summary"),
  coverage: () => api.get<LeadCoverageReport>("/lead-discovery/coverage"),
  history: (limit = 50) => api.get<LeadSearchHistory>("/lead-discovery/history", { limit }),

  pipeline: (query: Partial<LeadQuery> = {}) =>
    api.get<LeadList>("/lead-discovery/pipeline", query as Record<string, unknown>),
  lead: (id: string) => api.get<LeadWithPipeline>(`/lead-discovery/leads/${id}`),
  setStatus: (id: string, status: Exclude<LeadStatus, "duplicate">, note?: string) =>
    api.patch<LeadWithPipeline>(`/lead-discovery/leads/${id}/status`, { status, ...(note ? { note } : {}) }),
  setOwner: (id: string, ownerId: string | null) =>
    api.patch<LeadWithPipeline>(`/lead-discovery/leads/${id}/owner`, { ownerId }),
  notes: (id: string) => api.get<LeadNoteList>(`/lead-discovery/leads/${id}/notes`),
  addNote: (id: string, body: string) =>
    api.post<LeadNote>(`/lead-discovery/leads/${id}/notes`, { body }),

  duplicates: () => api.get<LeadDuplicateReport>("/lead-discovery/duplicates"),
  resolveDuplicates: () =>
    api.post<LeadDuplicateResolution>("/lead-discovery/duplicates/resolve"),

  collection: (id: string) => api.get<LeadCollectionDetail>(`/lead-discovery/collections/${id}`),
  renameCollection: (id: string, name: string) =>
    api.patch<LeadCollection>(`/lead-discovery/collections/${id}`, { name }),
  deleteCollection: (id: string) =>
    api.del<{ id: string; deleted: true; leadsKept: number; deletedAt: string }>(
      `/lead-discovery/collections/${id}`,
    ),
  removeLead: (collectionId: string, leadId: string) =>
    api.del<LeadCollection>(`/lead-discovery/collections/${collectionId}/leads/${leadId}`),

  exportPreview: (leadIds: string[]) =>
    api.post<LeadExportPreview>("/lead-discovery/export/preview", { leadIds }),

  /**
   * Downloads the pipeline CSV the server streams back (not a JSON envelope),
   * so it cannot go through `api()`. Session 85's `exportCsv` above is
   * unchanged and still serves the original eleven columns.
   */
  exportCsv: async (leadIds: string[]): Promise<void> => {
    const { useAuthStore } = await import("@/store/auth");
    const token = useAuthStore.getState().accessToken;
    const base = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");
    const res = await fetch(`${base}/lead-discovery/export/csv`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ leadIds }),
    });
    if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "windels-leads-pipeline.csv";
    a.click();
    URL.revokeObjectURL(url);
  },
};
