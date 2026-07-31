/**
 * Session 26 — Engineering Observability shared types (Phase 25, Slices 211–215).
 */

// ─── Slice 211: Engineering Metrics ────────────────────────────
export type SLOTier = "tier1" | "tier2" | "tier3";

export interface ServiceMetric {
  serviceId: string;
  name: string;
  tier: SLOTier;
  owner: string;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  rps: number;
  errorRatePct: number;
  availabilityPct: number;
  saturationPct: number;
  sloLatencyMs: number;
  sloAvailabilityPct: number;
  errorBudgetRemainingPct: number;
  lastIncidentAt?: string;
}

export interface MetricTimeseriesPoint {
  t: string;
  value: number;
}

export interface MetricTimeseries {
  serviceId: string;
  metric: "latency_p95" | "error_rate" | "rps" | "availability" | "saturation";
  points: MetricTimeseriesPoint[];
}

// ─── Slice 212: Deployment Analytics ──────────────────────────
export type DeploymentStatus = "success" | "failed" | "rolled_back" | "in_progress";
export type DeploymentTrend = "improving" | "stable" | "degrading";

export interface DeploymentRecord {
  id: string;
  service: string;
  version: string;
  environment: "dev" | "staging" | "canary" | "production";
  status: DeploymentStatus;
  triggeredBy: string;
  startedAt: string;
  finishedAt?: string;
  durationMs: number;
  leadTimeHours: number;
  rollbackOf?: string;
}

export interface DeploymentAnalytics {
  deploysLast7d: number;
  deploysLast30d: number;
  deployFrequencyPerWeek: number;
  changeFailRatePct: number;
  leadTimeMedianHours: number;
  mttrHours: number;
  byService: Record<string, { deploys: number; failures: number; leadTimeHours: number }>;
  trend: DeploymentTrend;
}

// ─── Slice 213: Technical Debt Dashboard ─────────────────────
export type DebtSeverity = "critical" | "high" | "medium" | "low";
export type DebtCategory = "code" | "tests" | "docs" | "security" | "performance" | "architecture" | "dependency";
export type DebtStatus = "open" | "in_progress" | "resolved" | "accepted";

export interface DebtItem {
  id: string;
  key: string;
  title: string;
  category: DebtCategory;
  severity: DebtSeverity;
  area: string;
  owner: string;
  status: DebtStatus;
  estimatedEffortHours: number;
  churnScore: number;
  createdAt: string;
  updatedAt?: string;
}

export interface DebtSummary {
  totalItems: number;
  totalEffortHours: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  hotspots: { area: string; items: number; effortHours: number; churnScore: number }[];
  trend30d: "up" | "flat" | "down";
  debtAddedLast30d: number;
  debtResolvedLast30d: number;
}

// ─── Slice 214: Pipeline Analytics ────────────────────────────
export type PipelineStatus = "passed" | "failed" | "running" | "canceled";

export interface PipelineRun {
  id: string;
  pipeline: string;
  branch: string;
  commitSha: string;
  author: string;
  status: PipelineStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs: number;
  stages: { name: string; durationMs: number; status: PipelineStatus }[];
  flaky: boolean;
}

export interface PipelineAnalytics {
  totalRuns7d: number;
  passRatePct: number;
  avgDurationMs: number;
  medianDurationMs: number;
  flakyCount: number;
  slowestPipeline: string;
  failureReasons: { reason: string; count: number }[];
}

// ─── Slice 215: Developer Productivity (SPACE) ────────────────
export interface DeveloperStats {
  id: string;
  displayName: string;
  prsOpened: number;
  prsMerged: number;
  prsReviewed: number;
  avgReviewTimeHours: number;
  avgTimeToMergeHours: number;
  codeReviewsGiven: number;
  linesChanged: number;
  focusScorePct: number;
  incidentOnCallCount: number;
}

export interface ProductivitySummary {
  activeDevelopers: number;
  prsOpened7d: number;
  prsMerged7d: number;
  avgTimeToMergeHours: number;
  avgReviewTurnaroundHours: number;
  focusScorePct: number;
  deploymentFrequencyPerWeek: number;
  changeFailRatePct: number;
  topReviewers: { name: string; reviews: number }[];
  dora: {
    deploymentFrequency: number;
    leadTimeHours: number;
    changeFailRate: number;
    mttrHours: number;
  };
}
