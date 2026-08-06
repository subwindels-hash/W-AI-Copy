/**
 * Session 124 — AI Software Engineering Workforce client.
 *
 * Typed access to the department: role catalog, multi-repo workspace,
 * per-repo teams, autonomous tasks, GitHub engineering module, repository
 * intelligence, engineering memory and the command center.
 */
import { api } from "./api";
import type {
  AiEngineeringCommandCenter,
  AiEngineeringConnection,
  AiEngineeringIntelNode,
  AiEngineeringMemoryEntry,
  AiEngineeringMemoryKind,
  AiEngineeringRepo,
  AiEngineeringRole,
  AiEngineeringTask,
  AewConnectInput,
  AewMemoryCreateInput,
  AewTaskCreateInput,
} from "@windels/shared/aiEngineering";

export type {
  AiEngineeringCommandCenter,
  AiEngineeringConnection,
  AiEngineeringIntelNode,
  AiEngineeringMemoryEntry,
  AiEngineeringMemoryKind,
  AiEngineeringRepo,
  AiEngineeringRole,
  AiEngineeringTask,
  AewConnectInput,
  AewMemoryCreateInput,
  AewTaskCreateInput,
} from "@windels/shared/aiEngineering";

export const aiEngineeringApi = {
  /* Workforce */
  roles: () => api<AiEngineeringRole[]>("/ai-engineering/roles"),
  repos: (limit = 100) => api<AiEngineeringRepo[]>("/ai-engineering/repos", { params: { limit } }),
  addRepo: (input: { connectionId?: string; name: string; localPath?: string; defaultBranch?: string }) =>
    api<AiEngineeringRepo>("/ai-engineering/repos", { method: "POST", json: input }),
  repo: (id: string) => api<AiEngineeringRepo>(`/ai-engineering/repos/${id}`),
  removeRepo: (id: string) => api<{ id: string; deleted: true }>(`/ai-engineering/repos/${id}`, { method: "DELETE" }),
  scan: (id: string, path: string) =>
    api<{ nodes: AiEngineeringIntelNode[]; summary: Record<string, number> }>(`/ai-engineering/repos/${id}/scan`, { method: "POST", json: { path } }),
  intel: (id: string, params: { kind?: string; basis?: string; limit?: number } = {}) =>
    api<AiEngineeringIntelNode[]>(`/ai-engineering/repos/${id}/intel`, { params }),

  /* Tasks */
  tasks: (params: { status?: string; limit?: number } = {}) =>
    api<AiEngineeringTask[]>("/ai-engineering/tasks", { params }),
  createTask: (input: AewTaskCreateInput) =>
    api<AiEngineeringTask>("/ai-engineering/tasks", { method: "POST", json: input }),
  task: (id: string) => api<AiEngineeringTask>(`/ai-engineering/tasks/${id}`),
  runTask: (id: string, execute = false) =>
    api<AiEngineeringTask>(`/ai-engineering/tasks/${id}/run`, { method: "POST", json: { execute } }),
  openTaskPr: (id: string) => api<AiEngineeringTask>(`/ai-engineering/tasks/${id}/pr`, { method: "POST" }),

  /* Memory */
  memory: (params: { kind?: string; repoId?: string; tag?: string; q?: string; limit?: number } = {}) =>
    api<AiEngineeringMemoryEntry[]>("/ai-engineering/memory", { params }),
  addMemory: (input: AewMemoryCreateInput) =>
    api<AiEngineeringMemoryEntry>("/ai-engineering/memory", { method: "POST", json: input }),
  removeMemory: (id: string) => api<{ id: string; deleted: true }>(`/ai-engineering/memory/${id}`, { method: "DELETE" }),

  /* GitHub */
  connections: () => api<AiEngineeringConnection[]>("/ai-engineering/connections"),
  connect: (input: AewConnectInput) =>
    api<AiEngineeringConnection>("/ai-engineering/connections", { method: "POST", json: input }),
  removeConnection: (id: string) =>
    api<{ id: string; deleted: true }>(`/ai-engineering/connections/${id}`, { method: "DELETE" }),

  /* Command center */
  commandCenter: () => api<AiEngineeringCommandCenter>("/ai-engineering/command-center"),
};
