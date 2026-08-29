/** Session 99 — Software Factory Studios & Build Farm client. */
import { api } from "./api";

export type SfStudioKey = "product" | "engineering" | "quality" | "devops" | "operations";
export type SfPlanStatus = "planned" | "in_progress" | "completed";
export type SfTargetStatus = "pending" | "compiling" | "built" | "failed";

export interface SfStudio {
  key: SfStudioKey;
  name: string;
  purpose: string;
  deliverables: string[];
}

export interface SfStudioPlan {
  id: string;
  organizationId: string;
  projectId: string;
  studio: SfStudioKey;
  deliverables: string[];
  status: SfPlanStatus;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SfCompileTarget {
  id: string;
  runId: string;
  projectId: string;
  platform: string;
  format: string;
  extension: string;
  fileName: string;
  manifestJson: string;
  sha256: string;
  status: SfTargetStatus;
  binaryEmitted: false;
  requiresToolchain: string;
}

export interface SfStudioCoverageRow {
  studio: SfStudioKey;
  name: string;
  plans: number;
  completed: number;
  deliverables: string[];
}

export interface SfStudioCoverage {
  projectId: string;
  plans: number;
  completedPlans: number;
  coverage: SfStudioCoverageRow[];
  allStudiosCovered: boolean;
  totalDeliverables: number;
  completedDeliverables: number;
}

export interface SfRollup {
  counts: {
    plans: number;
    plansByStatus: Record<SfPlanStatus, number>;
    runsWithTargets: number;
    targetsByStatus: Record<SfTargetStatus, number>;
  };
  studiosCovered: number;
  recentPlans: SfStudioPlan[];
  lastUpdatedAt: string | null;
}

export interface SfStudioPlanCreateInput {
  projectId: string;
  studio: SfStudioKey;
  deliverables: string[];
  status?: SfPlanStatus;
  notes?: string | null;
}

export const softwareFactoryApi = {
  studios: () => api<SfStudio[]>("/builder/studios"),
  listPlans: (params?: { projectId?: string; studio?: SfStudioKey; status?: SfPlanStatus }) =>
    api<SfStudioPlan[]>("/builder/studios/plans", { params }),
  createPlan: (input: SfStudioPlanCreateInput) => api<SfStudioPlan>("/builder/studios/plans", { method: "POST", json: input }),
  updatePlan: (id: string, patch: Partial<SfStudioPlanCreateInput>) =>
    api<SfStudioPlan>(`/builder/studios/plans/${id}`, { method: "PATCH", json: patch }),
  deletePlan: (id: string) => api<{ deleted: boolean; id: string }>(`/builder/studios/plans/${id}`, { method: "DELETE" }),
  studioCoverage: (projectId: string) => api<SfStudioCoverage>(`/builder/projects/${projectId}/studios`),
  compileTargets: (runId: string) => api<SfCompileTarget[]>(`/builder/builds/${runId}/targets`),
};
