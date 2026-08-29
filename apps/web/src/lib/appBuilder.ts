/** Session 96 — AI Software Factory / Application Builder client. */
import { api } from "./api";

export type AbTargetType = "WEB" | "DESKTOP" | "MOBILE" | "API" | "MICROSERVICE" | "BROWSER_EXTENSION" | "CLI";
export type AbBuildStatus = "QUEUED" | "GENERATING_CODE" | "TESTING" | "COMPILING" | "SIGNING" | "SUCCEEDED" | "FAILED";
export type AbApprovalStatus = "pending" | "approved" | "denied";
export type AbGenerationSource = "manual" | "real" | "echo-demo";

export interface AbProject {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  targetType: AbTargetType;
  techStack: Record<string, string>;
  systemPrompt: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AbTask {
  id: string;
  organizationId: string;
  projectId: string;
  assignedAgent: string;
  group: string;
  title: string;
  description: string | null;
  isCompleted: boolean;
  outputCode: string | null;
  generationSource: AbGenerationSource;
  completedAt: string | null;
  createdAt: string;
}

export interface AbLogEntry {
  at: string;
  step: string;
  actor: string;
  detail: string;
}

export interface AbBuildRun {
  id: string;
  organizationId: string;
  projectId: string;
  version: string;
  status: AbBuildStatus;
  logs: AbLogEntry[];
  errorLog: string[];
  artifactId: string | null;
  requestedBy: string | null;
  startedAt: string | null;
  finalizedAt: string | null;
  createdAt: string;
}

export interface AbSbomEntry {
  name: string;
  version: string;
  declared: boolean;
}

export interface AbArtifact {
  id: string;
  organizationId: string;
  projectId: string;
  runId: string;
  version: string;
  name: string;
  targetType: AbTargetType;
  manifestJson: string;
  sbom: AbSbomEntry[];
  sha256: string;
  sizeBytes: number;
  published: boolean;
  releasedAt: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface AbApproval {
  id: string;
  organizationId: string;
  artifactId: string;
  projectId: string;
  runId: string;
  status: AbApprovalStatus;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface AbRollup {
  counts: {
    projects: number;
    tasks: number;
    tasksCompleted: number;
    runs: number;
    runsByStatus: Record<AbBuildStatus, number>;
    artifacts: number;
    releasedArtifacts: number;
    pendingApprovals: number;
  };
  avgBuildTimeMs: number | null;
  recentProjects: AbProject[];
  recentRuns: AbBuildRun[];
  latestArtifacts: AbArtifact[];
  lastUpdatedAt: string | null;
}

export interface AbAgentGroup {
  group: string;
  agents: string[];
}

export interface AbProjectCreateInput {
  name: string;
  description?: string | null;
  targetType?: AbTargetType;
  techStack?: Record<string, string>;
  systemPrompt: string;
}

export interface AbTaskCreateInput {
  assignedAgent: string;
  title: string;
  description?: string | null;
  isCompleted?: boolean;
  outputCode?: string | null;
}

export const appBuilderApi = {
  rollup: () => api<AbRollup>("/builder/dashboard/rollup"),
  agents: () => api<AbAgentGroup[]>("/builder/agents"),

  listProjects: (params?: { q?: string; targetType?: AbTargetType }) => api<AbProject[]>("/builder/projects", { params }),
  createProject: (input: AbProjectCreateInput) => api<AbProject>("/builder/projects", { method: "POST", json: input }),
  updateProject: (id: string, patch: Partial<AbProjectCreateInput>) => api<AbProject>(`/builder/projects/${id}`, { method: "PATCH", json: patch }),
  deleteProject: (id: string) => api<{ deleted: boolean; id: string }>(`/builder/projects/${id}`, { method: "DELETE" }),

  listTasks: (projectId: string, params?: { completed?: boolean }) => api<AbTask[]>(`/builder/projects/${projectId}/tasks`, { params }),
  createTask: (projectId: string, input: AbTaskCreateInput) => api<AbTask>(`/builder/projects/${projectId}/tasks`, { method: "POST", json: input }),
  updateTask: (id: string, patch: Partial<AbTaskCreateInput>) => api<AbTask>(`/builder/tasks/${id}`, { method: "PATCH", json: patch }),
  generateTaskCode: (id: string) => api<{ task: AbTask; modelSource: "real" | "echo-demo" }>(`/builder/tasks/${id}/generate`, { method: "POST" }),
  deleteTask: (id: string) => api<{ deleted: boolean; id: string }>(`/builder/tasks/${id}`, { method: "DELETE" }),

  listBuilds: (projectId: string, params?: { status?: AbBuildStatus }) => api<AbBuildRun[]>(`/builder/projects/${projectId}/builds`, { params }),
  createBuild: (projectId: string, version: string) => api<AbBuildRun>(`/builder/projects/${projectId}/builds`, { method: "POST", json: { version } }),
  advanceBuild: (id: string) => api<AbBuildRun>(`/builder/builds/${id}/advance`, { method: "POST" }),
  retryBuild: (id: string) => api<AbBuildRun>(`/builder/builds/${id}/retry`, { method: "POST" }),

  listArtifacts: (params?: { projectId?: string; published?: boolean }) => api<AbArtifact[]>("/builder/artifacts", { params }),
  requestRelease: (artifactId: string) => api<AbApproval>(`/builder/artifacts/${artifactId}/request-release`, { method: "POST" }),
  releaseArtifact: (artifactId: string) => api<AbArtifact>(`/builder/artifacts/${artifactId}/release`, { method: "POST" }),

  listApprovals: (params?: { status?: AbApprovalStatus }) => api<AbApproval[]>("/builder/approvals", { params }),
  decideApproval: (id: string, input: { approved: boolean; decidedBy: string; note?: string }) =>
    api<AbApproval>(`/builder/approvals/${id}/decide`, { method: "POST", json: input }),
};
