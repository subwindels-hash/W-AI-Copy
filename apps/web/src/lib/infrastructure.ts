/**
 * Session 21 — Enterprise Infrastructure API client.
 *
 * Wraps /api/v1/platform/infra*, /iac*, /releases*, /regions*, /optimization*.
 */
import { api } from "./api";
import type {
  ClusterStatus, ClusterNode, K8sWorkload, K8sPod, InfraMetric, AlertFiring,
  IaCStack, IaCRun, Release, BlueGreenState, CanaryState, Region, FailoverStatus,
  OptimizationRecommendation, CostBreakdown, InfraOverview,
  DeploymentStrategy, ReleaseStatus,
} from "@windels/shared/infrastructure";


export const infraApi = {
  // ── Overview / cluster ───────────────────────────────────────────
  overview: () => api<InfraOverview>("/platform/infra/overview"),
  cluster: () => api<ClusterStatus>("/platform/infra/cluster"),
  nodes: () => api<{ nodes: ClusterNode[] }>("/platform/infra/nodes").then((r) => r.nodes),
  workloads: () => api<{ workloads: K8sWorkload[] }>("/platform/infra/workloads").then((r) => r.workloads),
  pods: (filter?: { ns?: string; workload?: string }) => api<{ pods: K8sPod[] }>("/platform/infra/pods", { params: filter }).then((r) => r.pods),
  series: (limit = 60) => api<{ points: InfraMetric[] }>("/platform/infra/metrics/series", { params: { limit } }).then((r) => r.points),
  alerts: () => api<{ alerts: AlertFiring[] }>("/platform/infra/alerts").then((r) => r.alerts),

  // ── IaC ──────────────────────────────────────────────────────────
  stacks: () => api<{ stacks: IaCStack[] }>("/platform/iac/stacks").then((r) => r.stacks),
  runStack: (id: string, kind: "plan" | "apply", triggeredBy = "web") =>
    api<IaCRun>(`/platform/iac/stacks/${id}/run`, { method: "POST", json: { kind, triggeredBy } }),
  markDrift: (id: string, drifted: boolean) =>
    api<IaCStack>(`/platform/iac/stacks/${id}/drift`, { method: "POST", json: { drifted } }),
  runs: (stackId?: string) => api<{ runs: IaCRun[] }>("/platform/iac/runs", { params: stackId ? { stackId } : {} }).then((r) => r.runs),

  // ── Releases / B/G / Canary ──────────────────────────────────────
  releases: (filter?: { env?: string; svc?: string; status?: ReleaseStatus }) =>
    api<{ releases: Release[] }>("/platform/releases", { params: filter as any }).then((r) => r.releases),
  deploy: (b: { environment: Release["environment"]; service: Release["service"]; version: string; strategy: DeploymentStrategy; commitSha?: string; changelog?: string }) =>
    api<Release>("/platform/releases/deploy", { method: "POST", json: { ...b, author: "web" } }),
  bgGet: (env: string, svc: string) => api<BlueGreenState | null>(`/platform/releases/bg/${env}/${svc}`),
  bgStage: (env: string, svc: string, version: string) =>
    api<BlueGreenState>(`/platform/releases/bg/${env}/${svc}/stage`, { method: "POST", json: { version } }),
  bgSwap: (env: string, svc: string) =>
    api<BlueGreenState>(`/platform/releases/bg/${env}/${svc}/swap`, { method: "POST" }),
  canaryGet: (env: string, svc: string) => api<CanaryState | null>(`/platform/releases/canary/${env}/${svc}`),
  canaryStart: (env: string, svc: string, version: string) =>
    api<CanaryState>(`/platform/releases/canary/${env}/${svc}/start`, { method: "POST", json: { version } }),
  canaryWeight: (env: string, svc: string, weight: number) =>
    api<CanaryState>(`/platform/releases/canary/${env}/${svc}/weight`, { method: "POST", json: { weight } }),

  // ── Regions (multi-region cluster regions, separate from Session-15 edge regions) ──
  regions: () => api<{ regions: Region[] }>("/platform/regions-mgmt").then((r) => r.regions),
  region: (id: string) => api<Region>(`/platform/regions-mgmt/${id}`),
  refreshRegions: () => api<{ refreshed: boolean }>("/platform/regions-mgmt/refresh", { method: "POST" }),
  failover: (fromRegion: string, toRegion: string, reason: string) =>
    api<FailoverStatus>("/platform/regions-mgmt/failover", { method: "POST", json: { fromRegion, toRegion, reason, triggeredBy: "web" } }),
  activeFailover: () => api<FailoverStatus | null>("/platform/regions-mgmt/failover"),

  // ── Optimization ─────────────────────────────────────────────────
  recommendations: (filter?: { status?: "open"|"applied"|"dismissed"; severity?: "low"|"medium"|"high"; kind?: string }) =>
    api<{ recommendations: OptimizationRecommendation[] }>("/platform/optimization/recommendations", { params: filter as any }).then((r) => r.recommendations),
  generateRecs: () => api<{ added: OptimizationRecommendation[] }>("/platform/optimization/generate", { method: "POST" }).then((r) => r.added),
  setRecStatus: (id: string, status: "open" | "applied" | "dismissed") =>
    api<OptimizationRecommendation>(`/platform/optimization/${id}/${status}`, { method: "POST" }),
  cost: () => api<CostBreakdown>("/platform/optimization/cost"),
};
