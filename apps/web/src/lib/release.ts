/**
 * Session 24 — Release Management API client.
 *
 * Note: Session 24 types use the Pipeline* prefix in @windels/shared to
 * avoid collisions with Session 21 infrastructure's narrower Release types.
 * We re-export them here under the friendly names used by the UI.
 */
import { api } from "./api";
import type { PipelineRelease, ApprovalRecord, ApprovalSummary, AiValidationResult, StagingDeployment, ProductionDeployment, ReleaseMetrics, DoraMetrics, RetroItem, ApprovalGate, ApprovalStatus } from "@windels/shared";
export type { PipelineRelease, ApprovalRecord, ApprovalSummary, AiValidationResult, StagingDeployment, ProductionDeployment, ReleaseMetrics, DoraMetrics, RetroItem, ApprovalGate, ApprovalStatus } from "@windels/shared";

// Friendly aliases for UI use
export type Release = PipelineRelease;


export const releaseApi = {
  list: (limit = 50) => api<PipelineRelease[]>(`/releases?limit=${limit}`),
  get: (id: string) => api<PipelineRelease>(`/releases/${id}`),
  create: (b: Partial<PipelineRelease>) =>
    api<PipelineRelease>("/releases", { method: "POST", json: b }),
  metrics: () => api<ReleaseMetrics>("/releases/metrics"),
  dora: () => api<DoraMetrics>("/releases/dora"),

  // Validation
  runValidation: (id: string) =>
    api<AiValidationResult>(`/releases/${id}/validate`, { method: "POST" }),
  getValidation: (id: string) =>
    api<AiValidationResult | null>(`/releases/${id}/validation`),

  // Approvals
  approvals: (id: string) =>
    api<{ records: ApprovalRecord[]; summary: ApprovalSummary }>(`/releases/${id}/approvals`),
  vote: (id: string, gate: ApprovalGate, status: ApprovalStatus, comment?: string) =>
    api<{ record: ApprovalRecord; summary: ApprovalSummary }>(`/releases/${id}/approve`, {
      method: "POST",
      json: { gate, status, comment },
    }),

  // Staging
  deployStaging: (id: string) =>
    api<StagingDeployment>(`/releases/${id}/deploy-staging`, { method: "POST" }),
  getStaging: (id: string) =>
    api<StagingDeployment | null>(`/releases/${id}/staging`),

  // Production
  promote: (id: string, canary = 5) =>
    api<ProductionDeployment>(`/releases/${id}/promote?canary=${canary}`, { method: "POST" }),
  rollout: (id: string) =>
    api<ProductionDeployment>(`/releases/${id}/rollout`, { method: "POST" }),
  rollback: (id: string) =>
    api<ProductionDeployment>(`/releases/${id}/rollback`, { method: "POST" }),
  getProduction: (id: string) =>
    api<ProductionDeployment | null>(`/releases/${id}/production`),

  // Retro / improvement
  listRetro: (id: string) => api<RetroItem[]>(`/releases/${id}/retro`),
  addRetro: (id: string, category: RetroItem["category"], text: string) =>
    api<RetroItem>(`/releases/${id}/retro`, { method: "POST", json: { category, text } }),
};
