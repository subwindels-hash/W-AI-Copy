/** Session 102 — typed AI Workforce / Agent Framework client. */
import { api } from "./api";
import type {
  AgAgent,
  AgAgentCreateInput,
  AgAgentEvent,
  AgAgentKnowledge,
  AgAgentMemory,
  AgAgentStatus,
  AgAgentUpdateInput,
  AgModelInfo,
  AgPaginated,
} from "@windels/shared/agents";

export type {
  AgAgentCreateInput,
  AgAgentStatus,
  AgAgentUpdateInput,
  AgModelInfo,
} from "@windels/shared/agents";

// Compatibility aliases retain the public names used by existing workforce UI.
export type Agent = AgAgent;
export type AgentEvent = AgAgentEvent;
export type AgentMemory = AgAgentMemory;
export type AgentKnowledge = AgAgentKnowledge;
export type Paginated<T> = AgPaginated<T>;

export const agentsApi = {
  list: (params: { page?: number; perPage?: number; q?: string; status?: AgAgentStatus } = {}) =>
    api.get<AgPaginated<AgAgent>>("/agents", { page: 1, perPage: 50, ...params }),
  get: (id: string) => api.get<AgAgent>(`/agents/${id}`),
  create: (data: AgAgentCreateInput) => api.post<AgAgent>("/agents", data),
  update: (id: string, data: AgAgentUpdateInput) => api.patch<AgAgent>(`/agents/${id}`, data),
  delete: (id: string) => api.del<{}>(`/agents/${id}`),
  events: (id: string, params: { page?: number; perPage?: number } = {}) =>
    api.get<AgPaginated<AgAgentEvent>>(`/agents/${id}/events`, { page: 1, perPage: 20, ...params }),
  memories: {
    list: (agentId: string, params: { page?: number; perPage?: number; q?: string; type?: string } = {}) =>
      api.get<AgPaginated<AgAgentMemory>>(`/agents/${agentId}/memories`, { page: 1, perPage: 20, ...params }),
    create: (agentId: string, data: { content: string; type?: string; importance?: number; tags?: string[] }) =>
      api.post<AgAgentMemory>(`/agents/${agentId}/memories`, { type: "FACT", importance: 0.5, tags: [], ...data }),
    delete: (agentId: string, memId: string) => api.del<{}>(`/agents/${agentId}/memories/${memId}`),
  },
  knowledge: {
    list: (agentId: string, params: { page?: number; perPage?: number; q?: string } = {}) =>
      api.get<AgPaginated<AgAgentKnowledge>>(`/agents/${agentId}/knowledge`, { page: 1, perPage: 20, ...params }),
    create: (agentId: string, data: { title: string; content: string; type?: string; source?: string }) =>
      api.post<AgAgentKnowledge>(`/agents/${agentId}/knowledge`, { type: "SNIPPET", ...data }),
    delete: (agentId: string, kid: string) => api.del<{}>(`/agents/${agentId}/knowledge/${kid}`),
  },
  models: () => api.get<AgModelInfo[]>("/agents/meta/models"),
};
