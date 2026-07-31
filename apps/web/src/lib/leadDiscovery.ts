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
