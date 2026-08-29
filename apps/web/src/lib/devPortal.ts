/**
 * Session 27 — Developer Portal API client.
 */
import { api } from "./api";
import type { CLICommand, DevEnvironment, SDKPackage, TestSuiteRun, DeploymentKitRun, DevPortalDashboard } from "@windels/shared";
export type { CLICommand, DevEnvironment, SDKPackage, TestSuiteRun, DeploymentKitRun, DevPortalDashboard } from "@windels/shared";


export const devApi = {
  dashboard: () => api<DevPortalDashboard>("/dev-portal/dashboard"),

  // SDK registry
  listSdks: (category?: string) => api<SDKPackage[]>(`/dev-portal/sdk${category ? `?category=${category}` : ""}`),
  getSdk: (id: string) => api<SDKPackage>(`/dev-portal/sdk/${id}`),
  downloadSdk: (id: string) => api<{ ok: true }>(`/dev-portal/sdk/${id}/download`, { method: "POST" }),

  // CLI
  listCli: (group?: string) => api<CLICommand[]>(`/dev-portal/cli${group ? `?group=${group}` : ""}`),

  // Environments
  listEnvs: () => api<DevEnvironment[]>("/dev-portal/envs"),
  getEnv: (id: string) => api<DevEnvironment>(`/dev-portal/envs/${id}`),
  startEnv: (id: string) => api<DevEnvironment>(`/dev-portal/envs/${id}/start`, { method: "POST" }),
  stopEnv: (id: string) => api<DevEnvironment>(`/dev-portal/envs/${id}/stop`, { method: "POST" }),

  // Toolkit
  runTests: (suite = "platform-smoke", target = "local") =>
    api<TestSuiteRun>("/dev-portal/toolkit/test", { method: "POST", json: { suite, target } }),
  testRuns: () => api<TestSuiteRun[]>("/dev-portal/toolkit/test/runs"),
  deploy: (target: "dev"|"staging"|"canary"|"production", service: string, version: string) =>
    api<DeploymentKitRun>("/dev-portal/toolkit/deploy", { method: "POST", json: { target, service, version } }),
  deployRuns: () => api<DeploymentKitRun[]>("/dev-portal/toolkit/deploy/runs"),
};
