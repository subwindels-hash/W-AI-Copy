/**
 * Session 55 — Enterprise Usage Intelligence (V8.4 §10).
 * Executive-level visibility: usage, utilization, automation, savings, ROI.
 */

export interface UsageMetric {
  label: string;
  value: number;
  unit: string;
  deltaPct: number;
  trend: "up" | "down" | "flat";
}

export interface UsageByDepartment {
  department: string;
  requests: number;
  costUsd: number;
  automationRate: number; // 0..1
  productivityGainHours: number;
  savingsUsd: number;
  roiPct: number;
}

export interface UsageByModule {
  module: string;
  requests: number;
  users: number;
  costUsd: number;
  p95LatencyMs: number;
  errorRate: number;
}

export interface UsageTimeSeriesPoint {
  ts: string;
  requests: number;
  tokens: number;
  costUsd: number;
  latencyMs: number;
  automationTasks: number;
}

export interface ResourceUtilization {
  cpuPct: number;
  memPct: number;
  gpuPct: number;
  storageGb: number;
  storageQuotaGb: number;
  networkMbps: number;
  carbonKgCO2e: number;
  costPerDayUsd: number;
}

export interface UsageDashboard {
  metrics: UsageMetric[];
  departments: UsageByDepartment[];
  modules: UsageByModule[];
  series: UsageTimeSeriesPoint[]; // last 30 points
  resources: ResourceUtilization;
  totalRequests30d: number;
  totalCost30dUsd: number;
  totalSavings30dUsd: number;
  automationRate: number;
  productivityGainHours30d: number;
  roiPct: number;
  adoptionPct: number;
  carbonKgCO2e30d: number;
}
