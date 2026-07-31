/**
 * Session 34 — Enterprise Marketplace, Digital Twin & Simulation API client.
 */
import { api } from "./api";
import type { MarketplaceDashboard, MarketplaceSkill, SkillInstallation, SkillAssignment, DigitalTwin, TwinEntity, TwinTelemetry, Scenario, SimulationRun, AiApplication, AppInstall, AppVersion } from "@windels/shared";
export type { MarketplaceDashboard, MarketplaceSkill, SkillInstallation, SkillAssignment, DigitalTwin, TwinEntity, TwinTelemetry, Scenario, SimulationRun, AiApplication, AppInstall, AppVersion } from "@windels/shared";

export const marketplaceApi = {
  dashboard: () => api<MarketplaceDashboard>("/marketplace/dashboard/rollup"),

  // Skills
  listSkills: (filter?: { category?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (filter?.category) p.set("category", filter.category);
    if (filter?.q) p.set("q", filter.q);
    const qs = p.toString();
    return api<MarketplaceSkill[]>(`/marketplace/skills${qs ? `?${qs}` : ""}`);
  },
  publishSkill: (input: any) => api<MarketplaceSkill>("/marketplace/skills", { method: "POST", json: input }),
  listInstallations: () => api<SkillInstallation[]>("/marketplace/skills/installations"),
  installSkill: (skillId: string, configuration?: Record<string, any>) =>
    api<SkillInstallation>("/marketplace/skills/installations", { method: "POST", json: { skillId, configuration } }),
  uninstallSkill: (id: string) => api<void>(`/marketplace/skills/installations/${id}`, { method: "DELETE" }),
  listAssignments: () => api<SkillAssignment[]>("/marketplace/skills/assignments"),
  assignSkill: (input: any) => api<SkillAssignment>("/marketplace/skills/assignments", { method: "POST", json: input }),

  // Twins
  listTwins: (filter?: { kind?: string }) => {
    const p = new URLSearchParams();
    if (filter?.kind) p.set("kind", filter.kind);
    const qs = p.toString();
    return api<DigitalTwin[]>(`/marketplace/twins${qs ? `?${qs}` : ""}`);
  },
  createTwin: (input: any) => api<DigitalTwin>("/marketplace/twins", { method: "POST", json: input }),
  getTwin: (id: string) => api<DigitalTwin>(`/marketplace/twins/${id}`),
  listEntities: (id: string) => api<TwinEntity[]>(`/marketplace/twins/${id}/entities`),
  addEntity: (id: string, input: any) => api<TwinEntity>(`/marketplace/twins/${id}/entities`, { method: "POST", json: input }),
  listTelemetry: (id: string, limit = 100) => api<TwinTelemetry[]>(`/marketplace/twins/${id}/telemetry?limit=${limit}`),
  recordTelemetry: (id: string, input: any) => api<TwinTelemetry>(`/marketplace/twins/${id}/telemetry`, { method: "POST", json: input }),

  // Simulation
  listScenarios: (filter?: { kind?: string }) => {
    const p = new URLSearchParams();
    if (filter?.kind) p.set("kind", filter.kind);
    const qs = p.toString();
    return api<Scenario[]>(`/marketplace/scenarios${qs ? `?${qs}` : ""}`);
  },
  createScenario: (input: any) => api<Scenario>("/marketplace/scenarios", { method: "POST", json: input }),
  getScenario: (id: string) => api<Scenario>(`/marketplace/scenarios/${id}`),
  runScenario: (id: string, input?: any) => api<SimulationRun>(`/marketplace/scenarios/${id}/run`, { method: "POST", json: input ?? {} }),
  listScenarioRuns: (id: string) => api<SimulationRun[]>(`/marketplace/scenarios/${id}/runs`),
  listSimulations: () => api<SimulationRun[]>("/marketplace/simulations"),

  // App Store
  listApps: (filter?: { kind?: string; category?: string; approved?: boolean }) => {
    const p = new URLSearchParams();
    if (filter?.kind) p.set("kind", filter.kind);
    if (filter?.category) p.set("category", filter.category);
    if (filter?.approved) p.set("approved", "true");
    const qs = p.toString();
    return api<AiApplication[]>(`/marketplace/apps${qs ? `?${qs}` : ""}`);
  },
  publishApp: (input: any) => api<AiApplication>("/marketplace/apps", { method: "POST", json: input }),
  getApp: (id: string) => api<AiApplication>(`/marketplace/apps/${id}`),
  approveApp: (id: string) => api<AiApplication>(`/marketplace/apps/${id}/approve`, { method: "POST" }),
  listVersions: (id: string) => api<AppVersion[]>(`/marketplace/apps/${id}/versions`),
  addVersion: (id: string, input: any) => api<AppVersion>(`/marketplace/apps/${id}/versions`, { method: "POST", json: input }),
  listAppInstalls: () => api<AppInstall[]>("/marketplace/apps/installs"),
  installApp: (appId: string, autoUpdate = true) => api<AppInstall>("/marketplace/apps/installs", { method: "POST", json: { appId, autoUpdate } }),
  uninstallApp: (id: string) => api<void>(`/marketplace/apps/installs/${id}`, { method: "DELETE" }),
};
