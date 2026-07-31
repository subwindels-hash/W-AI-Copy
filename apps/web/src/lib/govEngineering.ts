/**
 * Session 23 — Engineering Governance API client.
 */
import { api } from "./api";
import type {
  CodingStandard, RepoStandard, ADR, CodeReview, ReviewMetrics,
  Dependency, DependencySummary, SecurityStandard, SecurityPosture,
  GovEngineeringDashboard, ReviewStatus, ADRStatus, SecurityControlStatus,
} from "@windels/shared/governance";

export type {
  CodingStandard, RepoStandard, ADR, CodeReview, ReviewMetrics,
  Dependency, DependencySummary, SecurityStandard, SecurityPosture,
  GovEngineeringDashboard, ReviewStatus, ADRStatus, SecurityControlStatus,
} from "@windels/shared/governance";

export const govApi = {
  // dashboard
  dashboard: () => api<GovEngineeringDashboard>("/governance/engineering/dashboard"),

  // coding standards
  listCodingStandards: () => api<CodingStandard[]>("/governance/engineering/coding-standards"),
  createCodingStandard: (b: Partial<CodingStandard>) =>
    api<CodingStandard>("/governance/engineering/coding-standards", { method: "POST", json: b }),
  updateCodingStandard: (id: string, b: Partial<CodingStandard>) =>
    api<CodingStandard>(`/governance/engineering/coding-standards/${id}`, { method: "PATCH", json: b }),

  // repo standards
  listRepoStandards: () => api<RepoStandard[]>("/governance/engineering/repo-standards"),
  createRepoStandard: (b: Partial<RepoStandard>) =>
    api<RepoStandard>("/governance/engineering/repo-standards", { method: "POST", json: b }),

  // adrs
  listADRs: () => api<ADR[]>("/governance/engineering/adrs"),
  createADR: (b: { title: string; context: string; decision: string; consequences: string; authors?: string[]; tags?: string[]; status?: ADRStatus }) =>
    api<ADR>("/governance/engineering/adrs", { method: "POST", json: b }),
  updateADRStatus: (id: string, status: ADRStatus, supersededBy?: string) =>
    api<ADR>(`/governance/engineering/adrs/${id}`, { method: "PATCH", json: { status, supersededBy } }),

  // reviews
  listReviews: (status?: ReviewStatus) =>
    api<CodeReview[]>("/governance/engineering/reviews", { params: status ? { status } : {} }),
  reviewChecklist: () => api<Array<{id:string; text:string; category:string; required:boolean}>>("/governance/engineering/reviews/checklist"),
  reviewMetrics: () => api<ReviewMetrics>("/governance/engineering/reviews/metrics"),
  setReviewStatus: (id: string, status: ReviewStatus, reviewer?: string) =>
    api<CodeReview>(`/governance/engineering/reviews/${id}/status`, { method: "PATCH", json: { status, reviewer } }),

  // dependencies
  listDependencies: (rescan = false) =>
    api<Dependency[]>("/governance/engineering/dependencies", { params: rescan ? { rescan: "true" } : {} }),
  dependencySummary: () => api<DependencySummary>("/governance/engineering/dependencies/summary"),
  rescanDependencies: () => api<Dependency[]>("/governance/engineering/dependencies/rescan", { method: "POST" }),

  // security standards
  listSecurity: () => api<SecurityStandard[]>("/governance/engineering/security"),
  updateSecurityStatus: (id: string, status: SecurityControlStatus, implementation?: string) =>
    api<SecurityStandard>(`/governance/engineering/security/${id}`, { method: "PATCH", json: { status, implementation } }),
  securityPosture: () => api<SecurityPosture>("/governance/engineering/security/posture"),
};
