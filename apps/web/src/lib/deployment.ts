import { api } from "./api";
import type { DeploymentDashboard, DeploymentTarget, DeploymentValidation } from "@windels/shared";
export type { DeploymentDashboard, DeploymentTarget, DeploymentValidation, DeploymentValidationCheck, TargetEnvironment, DeployStatus, DeploymentTargetSource } from "@windels/shared";

export const deploymentApi = {
  dashboard: () => api<DeploymentDashboard>("/deployment/dashboard/rollup"),
  list: () => api<DeploymentTarget[]>("/deployment/targets"),
  create: (input: { name: string; environment: DeploymentTarget["environment"]; region?: string; endpoint?: string; modules?: string[] }) =>
    api<DeploymentTarget>("/deployment/targets", { method: "POST", json: input }),
  validate: (id: string) => api<DeploymentValidation>(`/deployment/targets/${encodeURIComponent(id)}/validate`, { method: "POST" }),
  getValidation: (id: string) => api<DeploymentValidation | null>(`/deployment/targets/${encodeURIComponent(id)}/validation`),
  /** S165 — an environment reports the version it is actually running. */
  reportVersion: (id: string, version: string) =>
    api<DeploymentTarget>(`/deployment/targets/${encodeURIComponent(id)}/report`, { method: "POST", json: { version } }),
  /** S165 — removes the registry record; destroys no infrastructure. */
  deregister: (id: string) =>
    api<{ deregistered: boolean; infrastructureModified: false }>(`/deployment/targets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** @deprecated S165 — use `deregister`; the name overstated what happens. */
  destroy: (id: string) =>
    api<{ deregistered: boolean; infrastructureModified: false }>(`/deployment/targets/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
