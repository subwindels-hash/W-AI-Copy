/**
 * Session 125 — Super Admin Biography, Identity Memory & AI Knowledge client.
 *
 * Typed access to the governed knowledge system: records (biographies,
 * profiles, brand/mission/vision, FAQs, statements, documents…), the
 * super-admin lifecycle (approve/publish/archive), version history, grants,
 * knowledge graph, synchronization, the AI response engine and the knowledge
 * agents.
 */
import { api } from "./api";
import type {
  IkAgentId,
  IkAgentRun,
  IkAnswer,
  IkDashboard,
  IkGraph,
  IkKnowledgeRecord,
  IkRecordCreateInput,
  IkRecordUpdateInput,
  IkRecordVersion,
} from "@windels/shared/identityKnowledge";

export type {
  IkAgentId,
  IkAgentRun,
  IkAnswer,
  IkDashboard,
  IkGraph,
  IkKnowledgeRecord,
  IkRecordCreateInput,
  IkRecordUpdateInput,
  IkRecordVersion,
} from "@windels/shared/identityKnowledge";

export const identityKnowledgeApi = {
  /* Records */
  records: (params: { kind?: string; classification?: string; status?: string; tag?: string; q?: string; limit?: number } = {}) =>
    api<IkKnowledgeRecord[]>("/identity-knowledge/records", { params }),
  record: (id: string) => api<IkKnowledgeRecord>(`/identity-knowledge/records/${id}`),
  createRecord: (input: IkRecordCreateInput) =>
    api<IkKnowledgeRecord>("/identity-knowledge/records", { method: "POST", json: input }),
  updateRecord: (id: string, patch: IkRecordUpdateInput) =>
    api<IkKnowledgeRecord>(`/identity-knowledge/records/${id}`, { method: "PATCH", json: patch }),
  removeRecord: (id: string) => api<{ id: string; deleted: true }>(`/identity-knowledge/records/${id}`, { method: "DELETE" }),
  approve: (id: string) => api<IkKnowledgeRecord>(`/identity-knowledge/records/${id}/approve`, { method: "POST" }),
  publish: (id: string) => api<IkKnowledgeRecord>(`/identity-knowledge/records/${id}/publish`, { method: "POST" }),
  archive: (id: string) => api<IkKnowledgeRecord>(`/identity-knowledge/records/${id}/archive`, { method: "POST" }),
  versions: (id: string) => api<IkRecordVersion[]>(`/identity-knowledge/records/${id}/versions`),
  grant: (id: string, userId: string) =>
    api<IkKnowledgeRecord>(`/identity-knowledge/records/${id}/grants`, { method: "POST", json: { userId } }),
  revokeGrant: (id: string, userId: string) =>
    api<IkKnowledgeRecord>(`/identity-knowledge/records/${id}/grants/${userId}`, { method: "DELETE" }),
  addRelation: (id: string, targetId: string, relation: string) =>
    api<IkKnowledgeRecord>(`/identity-knowledge/records/${id}/relations`, { method: "POST", json: { targetId, relation } }),

  /* Sync, ask, agents, dashboard, graph, activity */
  sync: () => api<{ synced: number; failed: number; skipped: number }>("/identity-knowledge/sync", { method: "POST" }),
  ask: (question: string) =>
    api<IkAnswer>("/identity-knowledge/ask", { method: "POST", json: { question } }),
  agents: () => api<Array<{ id: string; title: string; role: string; permission: string }>>("/identity-knowledge/agents"),
  runAgent: (agentId: IkAgentId) =>
    api<IkAgentRun>(`/identity-knowledge/agents/${agentId}/run`, { method: "POST", json: {} }),
  dashboard: () => api<IkDashboard>("/identity-knowledge/dashboard"),
  graph: () => api<IkGraph>("/identity-knowledge/graph"),
  activity: () => api<Array<{ at: string; action: string; label: string }>>("/identity-knowledge/activity"),

  /* Documents + bulk */
  uploadDocument: async (file: File, input: { title: string; classification?: "private" | "organization" | "public"; category?: string; tags?: string[] }) => {
    const form = new FormData();
    form.append("file", file);
    form.append("title", input.title);
    form.append("classification", input.classification ?? "organization");
    if (input.category) form.append("category", input.category);
    for (const t of input.tags ?? []) form.append("tags", t);
    const store = await import("@/store/auth");
    const t = store.useAuthStore.getState().accessToken;
    const headers: Record<string, string> = {};
    if (t) headers.Authorization = `Bearer ${t}`;
    const base = import.meta.env.VITE_API_URL ?? "/api/v1";
    const res = await fetch(`${base}/identity-knowledge/documents`, { method: "POST", headers, body: form });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data?.error?.message ?? "Upload failed");
    return data.data as IkKnowledgeRecord;
  },
  importRecords: (records: IkRecordCreateInput[]) =>
    api<{ imported: number; ids: string[] }>("/identity-knowledge/import", { method: "POST", json: records }),
  exportRecords: () => api<{ records: IkKnowledgeRecord[]; exportedAt: string }>("/identity-knowledge/export"),
};
