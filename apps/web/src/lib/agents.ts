import { api } from "./api";

export interface Agent {
  id: string;
  name: string;
  role: string;
  color: string;
  emoji: string;
  description?: string | null;
  systemPrompt?: string | null;
  department?: string | null;
  capabilities: string[];
  modelId?: string | null;
  temperature: number;
  maxTokens: number;
  avatarStyle?: string | null;
  isBuiltIn: boolean;
  status: "idle" | "online" | "working" | "error" | "paused" | "offline";
  lastActivityAt: string;
  activeTaskId?: string | null;
  activeTask?: { id: string; title: string; status: string } | null;
  stats?: { tasks: number; messages: number; memories: number; knowledge: number; events: number };
  createdAt: string;
  updatedAt: string;
}

export interface AgentEvent {
  id: string;
  type: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AgentMemory {
  id: string;
  type: string;
  content: string;
  source?: string | null;
  sourceRef?: string | null;
  importance: number;
  tags: string[];
  createdAt: string;
}

export interface AgentKnowledge {
  id: string;
  type: string;
  title: string;
  contentPreview: string;
  source?: string | null;
  mimeType?: string | null;
  tokens: number;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

export const agentsApi = {
  list: (params: { page?: number; perPage?: number; q?: string; status?: string } = {}) =>
    api.get<Paginated<Agent>>("/agents", { page: 1, perPage: 50, ...params }),
  get: (id: string) => api.get<Agent>(`/agents/${id}`),
  create: (data: Partial<Agent>) => api.post<Agent>("/agents", data),
  update: (id: string, data: Partial<Agent>) => api.patch<Agent>(`/agents/${id}`, data),
  delete: (id: string) => api.del<{}>(`/agents/${id}`),
  events: (id: string, params: { page?: number; perPage?: number } = {}) =>
    api.get<Paginated<AgentEvent>>(`/agents/${id}/events`, { page: 1, perPage: 20, ...params }),
  memories: {
    list: (agentId: string, params: { page?: number; perPage?: number; q?: string; type?: string } = {}) =>
      api.get<Paginated<AgentMemory>>(`/agents/${agentId}/memories`, { page: 1, perPage: 20, ...params }),
    create: (agentId: string, data: { content: string; type?: string; importance?: number; tags?: string[] }) =>
      api.post<AgentMemory>(`/agents/${agentId}/memories`, { type: "FACT", importance: 0.5, tags: [], ...data }),
    delete: (agentId: string, memId: string) => api.del<{}>(`/agents/${agentId}/memories/${memId}`),
  },
  knowledge: {
    list: (agentId: string, params: { page?: number; perPage?: number; q?: string } = {}) =>
      api.get<Paginated<AgentKnowledge>>(`/agents/${agentId}/knowledge`, { page: 1, perPage: 20, ...params }),
    create: (agentId: string, data: { title: string; content: string; type?: string; source?: string }) =>
      api.post<AgentKnowledge>(`/agents/${agentId}/knowledge`, { type: "SNIPPET", ...data }),
    delete: (agentId: string, kid: string) => api.del<{}>(`/agents/${agentId}/knowledge/${kid}`),
  },
  models: () => api.get<{ id: string; displayName: string; provider: string }[]>("/agents/meta/models"),
};
