/**
 * Session 28 — Extension Platform API client.
 */
import { api } from "./api";
import type { Extension, ExtensionKind, ExtensionStatus, BusinessModule, IndustryModule, AISkill, CustomAgentDef, WorkflowExt, DashboardExt, UIComponentExt, ExtensionsDashboard } from "@windels/shared";
export type { Extension, ExtensionKind, ExtensionStatus, BusinessModule, IndustryModule, AISkill, CustomAgentDef, WorkflowExt, DashboardExt, UIComponentExt, ExtensionsDashboard } from "@windels/shared";


export const extApi = {
  dashboard: () => api<ExtensionsDashboard>("/extensions/dashboard/rollup"),

  // registry (236+244)
  list: (filter?: { kind?: ExtensionKind; status?: ExtensionStatus; category?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (filter?.kind) p.set("kind", filter.kind);
    if (filter?.status) p.set("status", filter.status);
    if (filter?.category) p.set("category", filter.category);
    if (filter?.q) p.set("q", filter.q);
    const qs = p.toString();
    return api<Extension[]>(`/extensions${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => api<Extension>(`/extensions/${id}`),
  transition: (id: string, to: string, note?: string) =>
    api<Extension>(`/extensions/${id}/transition`, { method: "POST", json: { to, note } }),
  install: (id: string, version?: string) =>
    api<Extension>(`/extensions/${id}/install`, { method: "POST", json: { version } }),
  uninstall: (id: string) => api<Extension>(`/extensions/${id}/uninstall`, { method: "POST" }),
  enable: (id: string) => api<Extension>(`/extensions/${id}/enable`, { method: "POST" }),
  disable: (id: string) => api<Extension>(`/extensions/${id}/disable`, { method: "POST" }),
  review: (id: string, rating: number, comment: string, author = "admin") =>
    api<Extension>(`/extensions/${id}/review`, { method: "POST", json: { rating, comment, author } }),
  releaseVersion: (id: string, version: string, changelog: string) =>
    api<Extension>(`/extensions/${id}/version`, { method: "POST", json: { version, changelog } }),

  // business (237)
  listBusiness: (category?: string) =>
    api<BusinessModule[]>(`/extensions/business/list${category ? `?category=${category}` : ""}`),
  getBusiness: (id: string) => api<BusinessModule>(`/extensions/business/${id}`),

  // industry (238)
  listIndustry: (vertical?: string) =>
    api<IndustryModule[]>(`/extensions/industry/list${vertical ? `?vertical=${vertical}` : ""}`),
  getIndustry: (id: string) => api<IndustryModule>(`/extensions/industry/${id}`),

  // skills (239)
  listSkills: (category?: string) =>
    api<AISkill[]>(`/extensions/skills/list${category ? `?category=${category}` : ""}`),
  getSkill: (id: string) => api<AISkill>(`/extensions/skills/${id}`),
  invokeSkill: (id: string) => api<AISkill>(`/extensions/skills/${id}/invoke`, { method: "POST" }),

  // agents (240)
  listAgents: (department?: string) =>
    api<CustomAgentDef[]>(`/extensions/agents/list${department ? `?department=${department}` : ""}`),
  getAgent: (id: string) => api<CustomAgentDef>(`/extensions/agents/${id}`),

  // workflow extensions (241)
  listWorkflows: (category?: string) =>
    api<WorkflowExt[]>(`/extensions/workflows/list${category ? `?category=${category}` : ""}`),
  getWorkflow: (id: string) => api<WorkflowExt>(`/extensions/workflows/${id}`),

  // dashboard extensions (242)
  listDashboards: () => api<DashboardExt[]>("/extensions/dashboards/list"),
  getDashboard: (id: string) => api<DashboardExt>(`/extensions/dashboards/${id}`),

  // ui components (243)
  listUi: (category?: string) =>
    api<UIComponentExt[]>(`/extensions/ui/list${category ? `?category=${category}` : ""}`),
  getUi: (id: string) => api<UIComponentExt>(`/extensions/ui/${id}`),
};
