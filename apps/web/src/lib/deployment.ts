import { api } from "./api";
import type { DeploymentDashboard, DeploymentTarget, DeploymentValidation } from "@windels/shared";
export type { DeploymentDashboard, DeploymentTarget, DeploymentValidation, TargetEnvironment } from "@windels/shared";

export const deploymentApi = {
  dashboard: () => api<DeploymentDashboard>("/deployment/dashboard/rollup"),
  list: () => api<DeploymentTarget[]>("/deployment/targets"),
  create: (input: { name: string; environment: DeploymentTarget["environment"]; region?: string; endpoint?: string; modules?: string[] }) =>
    api<DeploymentTarget>("/deployment/targets", { method: "POST", json: input }),
  validate: (id: string) => api<DeploymentValidation>(`/deployment/targets/${encodeURIComponent(id)}/validate`, { method: "POST" }),
  getValidation: (id: string) => api<DeploymentValidation | null>(`/deployment/targets/${encodeURIComponent(id)}/validation`),
  destroy: (id: string) => api<{ ok: true }>(`/deployment/targets/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
