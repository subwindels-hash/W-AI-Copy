/**
 * Shared types for Session 21 — Enterprise Infrastructure.
 *
 * Covers the eight slices of Phase 20:
 *   177 Kubernetes Foundation (cluster, nodes, pods, deployments, health)
 *   178 Infrastructure as Code (stacks, applies, plans)
 *   179 Deployment Automation (releases, pipelines)
 *   180 Blue/Green Deployment
 *   181 Canary Deployment
 *   182 Multi-Region Deployment (regions, failover, replication)
 *   183 Infrastructure Monitoring (cluster/node/pod metrics)
 *   184 Resource Optimization (right-sizing recommendations, costs)
 */

// ─── Slice 177: Kubernetes Foundation ────────────────────────────────────
export type K8sWorkloadKind = "Deployment" | "StatefulSet" | "DaemonSet" | "CronJob" | "Job";
export type PodPhase = "Pending" | "Running" | "Succeeded" | "Failed" | "Unknown";
export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

export interface ClusterNode {
  id: string;
  name: string;
  zone?: string;
  region?: string;
  roles: Array<"control-plane" | "worker" | "infra" | "gpu">;
  kubeletVersion: string;
  capacity: { cpu: string; memory: string; pods: number };
  allocatable: { cpu: string; memory: string; pods: number };
  usage: { cpuCores: number; cpuPercent: number; memoryBytes: number; memoryPercent: number };
  podCount: number;
  status: HealthStatus;
  conditions: Array<{ type: string; status: "True" | "False" | "Unknown"; message?: string; lastTransition?: string }>;
  startedAt?: string;
  labels: Record<string, string>;
}

export interface K8sWorkload {
  id: string;
  name: string;
  namespace: string;
  kind: K8sWorkloadKind;
  desiredReplicas: number;
  readyReplicas: number;
  availableReplicas: number;
  currentRevision?: string;
  updatedAt?: string;
  image: string;
  status: HealthStatus;
  labels: Record<string, string>;
  strategy?: "RollingUpdate" | "Recreate" | "BlueGreen" | "Canary";
}

export interface K8sPod {
  id: string;
  name: string;
  namespace: string;
  workloadName?: string;
  nodeName?: string;
  phase: PodPhase;
  ip?: string;
  restartCount: number;
  startedAt?: string;
  status: HealthStatus;
  containers: Array<{
    name: string; image: string; ready: boolean;
    restartCount: number; cpuMs: number; memoryBytes: number;
  }>;
}

export interface ClusterStatus {
  clusterId: string;
  name: string;
  version: string;
  region: string;
  status: HealthStatus;
  nodes: number;
  pods: number;
  deployments: number;
  cpuPercent: number;
  memoryPercent: number;
  podPercent: number;
  lastProbedAt: string;
}

// ─── Slice 178: Infrastructure as Code ───────────────────────────────────
export type IaCProvider = "terraform" | "pulumi" | "helm" | "kubectl" | "ansible";
export type IaCStatus = "planned" | "applying" | "applied" | "failed" | "drifted";

export interface IaCStack {
  id: string;
  name: string;
  provider: IaCProvider;
  environment: "dev" | "staging" | "prod" | "eu" | "ap";
  path: string;
  lastPlanId?: string;
  lastApplyId?: string;
  resources: number;
  status: IaCStatus;
  driftDetected: boolean;
  updatedAt: string;
}

export interface IaCRun {
  id: string;
  stackId: string;
  kind: "plan" | "apply" | "destroy";
  triggeredBy: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  summary: { add: number; change: number; destroy: number };
  startedAt: string;
  finishedAt?: string;
  logRef?: string;
}

// ─── Slice 179: Deployment Automation ────────────────────────────────────
export type DeploymentStrategy = "rolling" | "blue-green" | "canary" | "recreate";
export type ReleaseStatus = "queued" | "building" | "deploying" | "promoting" | "deployed" | "rolled-back" | "failed";

export interface Release {
  id: string;
  version: string;
  environment: "dev" | "staging" | "prod" | "eu" | "ap";
  service: "api" | "web" | "desktop-updater" | "all";
  strategy: DeploymentStrategy;
  author: string;
  commitSha?: string;
  status: ReleaseStatus;
  previousVersion?: string;
  startedAt: string;
  deployedAt?: string;
  durationMs?: number;
  healthGatePassed?: boolean;
  changelog?: string;
}

// ─── Slices 180/181: Blue/Green + Canary ─────────────────────────────────
export type BGColor = "blue" | "green";
export type CanaryStatus = "idle" | "ramping" | "promoted" | "rolled-back";

export interface BlueGreenState {
  service: string;
  environment: string;
  activeColor: BGColor;
  stagingColor: BGColor;
  activeVersion: string;
  stagingVersion?: string;
  activeReplicas: number;
  stagingReplicas: number;
  stagingHealthy: boolean;
  lastSwappedAt?: string;
}

export interface CanaryState {
  service: string;
  environment: string;
  stableVersion: string;
  canaryVersion?: string;
  canaryWeightPercent: number;  // 0..100
  status: CanaryStatus;
  errorRate: number;
  latencyP95: number;
  startedAt?: string;
  lastPromotedAt?: string;
}

// ─── Slice 182: Multi-Region ─────────────────────────────────────────────
export type RegionTier = "primary" | "secondary" | "dr" | "edge";
export type RegionStatus = "online" | "degraded" | "read-only" | "offline" | "bootstrapping";
export type ReplicationRole = "source" | "replica" | "primary" | "standby";

export interface Region {
  id: string;              // e.g. "na-east-1"
  name: string;            // "US East (N. Virginia)"
  cloud: "aws" | "gcp" | "azure" | "on-prem";
  tier: RegionTier;
  lat: number; lng: number;
  status: RegionStatus;
  replicationRole: ReplicationRole;
  replicationLagMs?: number;
  endpoint?: string;
  capacity: { requestsPerSec: number; activeUsers: number; pods: number };
  loadPercent: number;
  lastHealthCheckAt: string;
  failoverPriority: number; // lower = fail over to this first
}

export interface FailoverStatus {
  fromRegion: string;
  toRegion: string;
  state: "idle" | "preflight" | "draining" | "switching" | "verifying" | "complete" | "failed";
  startedAt: string;
  completedAt?: string;
  reason?: string;
}

// ─── Slice 183: Infrastructure Monitoring ────────────────────────────────
export interface InfraMetric {
  ts: string;
  clusterCpuPercent: number;
  clusterMemoryPercent: number;
  clusterPodPercent: number;
  requestRps: number;
  requestP95Ms: number;
  errorRatePercent: number;
  deploymentReadyPercent: number;
  region: string;
}

export interface AlertFiring {
  id: string;
  name: string;
  severity: "info" | "warn" | "crit";
  target: string;
  message: string;
  firingSince: string;
  value?: number;
  threshold?: number;
}

// ─── Slice 184: Resource Optimization ────────────────────────────────────
export type RecommendationKind = "downsize-workload" | "upsize-workload" | "rebalance-pod" | "orphan-resource" | "storage-class" | "spot-migration" | "node-pool-rightsize";
export type RecommendationSeverity = "low" | "medium" | "high";
export type RecommendationStatus = "open" | "applied" | "dismissed";

export interface OptimizationRecommendation {
  id: string;
  kind: RecommendationKind;
  severity: RecommendationSeverity;
  target: { kind: "workload" | "node" | "storage" | "network"; name: string; namespace?: string };
  summary: string;
  details: string;
  estimatedSavingsUsdPerMonth: number;
  risk: "low" | "medium" | "high";
  status: RecommendationStatus;
  suggestedAction: Record<string, unknown>;
  createdAt: string;
}

export interface CostBreakdown {
  month: string;                    // e.g. "2026-07"
  totalUsd: number;
  byService: Record<string, number>;
  byRegion: Record<string, number>;
  byResource: { compute: number; storage: number; network: number; managed: number };
  forecastUsd: number;
}

// ─── Aggregate ───────────────────────────────────────────────────────────
export interface InfraOverview {
  clusters: ClusterStatus[];
  primaryRegion: string;
  regionsOnline: number;
  regionsTotal: number;
  deployments: number;
  deploymentsReady: number;
  activeReleases: number;
  openEscalations: number;
  openRecommendations: number;
  estimatedMonthlySavingsUsd: number;
  totalMonthlyCostUsd: number;
  updatedAt: string;
}
