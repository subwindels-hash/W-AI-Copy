/** Session 85 — AI Lead Discovery & Business Intelligence client */
import { api } from "./api";

export interface LeadRecord {
  id: string;
  name: string;
  category: string;
  address: string;
  phone?: string;
  website?: string;
  source: string;
  discoveredAt: string;
  verificationStatus: string;
}

export interface CollectionRecord {
  id: string;
  name: string;
  leadsCount: number;
}

export const leadDiscoveryApi = {
  search: (query: string) => api<LeadRecord[]>("/search", { method: "POST", json: { query } }),
  listLeads: () => api<LeadRecord[]>("/leads"),
  listCollections: () => api<CollectionRecord[]>("/collections"),
  createCollection: (name: string) => api<CollectionRecord>("/collections", { method: "POST", json: { name } }),
  addLead: (collectionId: string, leadId: string) => api<any>(`/collections/${collectionId}/leads`, { method: "POST", json: { leadId } }),
};
