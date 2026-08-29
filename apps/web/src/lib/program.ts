/**
 * Session 25 — AI Program Management API client.
 */
import { api } from "./api";
import type { Roadmap, Initiative, Sprint, Story, SprintBurndown, Requirement, RequirementIntel, ArchReview, ArchHotspot, Risk, RiskMatrix, ExecReport } from "@windels/shared";
export type { Roadmap, Initiative, Sprint, Story, SprintBurndown, Requirement, RequirementIntel, ArchReview, ArchHotspot, Risk, RiskMatrix, ExecReport } from "@windels/shared";


export const programApi = {
  // Roadmap
  listRoadmaps: () => api<Roadmap[]>("/program/roadmaps"),
  createRoadmap: (b: Partial<Roadmap>) => api<Roadmap>("/program/roadmaps", { method: "POST", json: b }),
  getRoadmap: (id: string) => api<Roadmap>(`/program/roadmaps/${id}`),
  listInitiatives: (rid: string) => api<Initiative[]>(`/program/roadmaps/${rid}/initiatives`),

  // Sprints / backlog
  listSprints: () => api<Sprint[]>("/program/sprints"),
  getSprint: (id: string) => api<Sprint>(`/program/sprints/${id}`),
  burndown: (id: string) => api<SprintBurndown>(`/program/sprints/${id}/burndown`),
  listBacklog: () => api<Story[]>("/program/backlog"),
  createStory: (b: Partial<Story>) => api<Story>("/program/stories", { method: "POST", json: b }),
  assignStory: (id: string, sprintId: string | null) =>
    api<Story>(`/program/stories/${id}/assign`, { method: "POST", json: { sprintId } }),
  setStoryStatus: (id: string, status: Story["status"]) =>
    api<Story>(`/program/stories/${id}/status`, { method: "POST", json: { status } }),

  // Requirements
  listRequirements: () => api<Requirement[]>("/program/requirements"),
  intel: () => api<RequirementIntel>("/program/requirements/intel"),

  // Architecture reviews
  listReviews: () => api<ArchReview[]>("/program/arch-reviews"),
  runReview: (id: string) => api<ArchReview>(`/program/arch-reviews/${id}/run`, { method: "POST" }),
  hotspots: () => api<ArchHotspot[]>("/program/arch-hotspots"),

  // Risks
  listRisks: () => api<Risk[]>("/program/risks"),
  createRisk: (b: Partial<Risk>) => api<Risk>("/program/risks", { method: "POST", json: b }),
  matrix: () => api<RiskMatrix>("/program/risks/matrix"),
  addMitigation: (id: string, action: string, owner: string) =>
    api<Risk>(`/program/risks/${id}/mitigations`, { method: "POST", json: { action, owner } }),

  // Executive report
  latestReport: () => api<ExecReport | null>("/program/exec/latest"),
  generateReport: () => api<ExecReport>("/program/exec/generate", { method: "POST" }),
};
