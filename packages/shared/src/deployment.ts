// Session 53 — Enterprise Deployment Platform (V8.4 §8)
// Deploy WINDELS AI OS anywhere; automated validation, config, health checks.

import { z } from "zod";

export const TARGET_ENVIRONMENTS = [
  "windows",
  "linux",
  "macos",
  "docker",
  "kubernetes",
  "aws",
  "azure",
  "gcp",
  "oracle",
  "alibaba",
  "private_cloud",
  "on_prem",
  "air_gapped",
  "edge",
] as const;
export type TargetEnvironment = (typeof TARGET_ENVIRONMENTS)[number];

export const DEPLOY_STATUS = ["provisioning", "configuring", "validating", "healthy", "degraded", "failed", "destroyed"] as const;
export type DeployStatus = (typeof DEPLOY_STATUS)[number];

export interface DeploymentTarget {
  id: string;
  organizationId: string;
  name: string;
  environment: TargetEnvironment;
  region?: string;
  endpoint?: string;
  version: string;
  status: DeployStatus;
  modules: string[]; // enabled modules
  validationPassed: boolean;
  lastHealthCheckAt?: string;
  /** Undefined until a health check has actually run. */
  lastHealthOk?: boolean;
  /** Resource telemetry is optional: absent means "not sampled" rather than
   *  zero or a plausible-looking placeholder. */
  cpuPct?: number;
  memPct?: number;
  gpuPct?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentValidationCheck {
  id: string;
  category: "connectivity" | "database" | "redis" | "kernel" | "models" | "security" | "storage";
  label: string;
  passed: boolean;
  /** True when the check could not be executed (no probe available for this
   *  target, dependency not configured). A skipped check is NOT a pass — it is
   *  excluded from the verdict and surfaced so the gap is visible. */
  skipped?: boolean;
  detail?: string;
  durationMs: number;
}

export interface DeploymentValidation {
  targetId: string;
  ranAt: string;
  /** True only when at least one check ran and every executed check passed.
   *  A run in which everything was skipped is not a pass. */
  passed: boolean;
  checks: DeploymentValidationCheck[];
  durationMs: number;
  /** Count of checks that could not be executed. */
  skippedCount?: number;
}

export interface DeploymentDashboard {
  totalTargets: number;
  healthyTargets: number;
  degradedTargets: number;
  failedTargets: number;
  byEnvironment: Record<TargetEnvironment, number>;
  latestVersion: string;
  outdatedTargets: number;
  avgHealthScore: number; // 0-100
  recent: DeploymentTarget[];
}

export const createTargetSchema = z.object({
  name: z.string().min(2).max(120),
  environment: z.enum(TARGET_ENVIRONMENTS),
  region: z.string().max(32).optional(),
  endpoint: z.string().url().optional(),
  modules: z.array(z.string()).default([]),
});

export const validateTargetSchema = z.object({
  targetId: z.string(),
});
