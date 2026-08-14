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

export const DEPLOY_STATUS = [
  "provisioning",
  "configuring",
  "validating",
  /**
   * S165 — every executed check probed the LOCAL API host (its Redis, its
   * Postgres, its filesystem). That says nothing about a remote environment,
   * so the target is not called "healthy" on the strength of it.
   */
  "validated_locally",
  "healthy",
  "degraded",
  "failed",
  /** S165 — preferred over "destroyed": de-registration touches no infrastructure. */
  "deregistered",
  "destroyed",
] as const;
export type DeployStatus = (typeof DEPLOY_STATUS)[number];

/** S165 — how a deployment target came to be registered. */
export const DEPLOYMENT_TARGET_SOURCES = ["operator_registered", "demo_seed"] as const;
export type DeploymentTargetSource = (typeof DEPLOYMENT_TARGET_SOURCES)[number];

export interface DeploymentTarget {
  id: string;
  organizationId: string;
  name: string;
  environment: TargetEnvironment;
  region?: string;
  endpoint?: string;
  /**
   * The version this target is *intended* to run. Assigned at registration —
   * S165: this is a declaration, not an observation. Nothing here learns what
   * the environment actually runs, which is why `outdatedTargets` computed
   * from this field was always 0 by construction.
   */
  version: string;
  /**
   * S165 — the version the environment reported for itself, via
   * `POST /targets/:id/report`. Undefined until something actually reports.
   */
  reportedVersion?: string;
  /** S165 — when `reportedVersion` was last supplied. */
  versionReportedAt?: string;
  status: DeployStatus;
  /** S165 — demo-seeded targets are labelled; nobody registered them. */
  source?: DeploymentTargetSource;
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
  /**
   * S165 — what this check actually exercised.
   *
   * `local_host` checks probe the API process running the validation (its
   * Redis, its database, its disk). They are real, but they say nothing about
   * a remote target. `target` checks exercise the deployment target itself.
   */
  scope: "local_host" | "target";
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
  /**
   * S165 — how many executed checks actually exercised the target rather than
   * the local host. Zero means this run proved nothing about the remote
   * environment, and the target is marked `validated_locally`, not `healthy`.
   */
  targetScopedChecks?: number;
}

export interface DeploymentDashboard {
  totalTargets: number;
  healthyTargets: number;
  degradedTargets: number;
  failedTargets: number;
  byEnvironment: Record<TargetEnvironment, number>;
  latestVersion: string;
  /**
   * S165 — counts only targets that have REPORTED a version differing from
   * `latestVersion`. Previously derived from the assigned `version`, which is
   * set to `latestVersion` at creation, so the figure was always 0.
   */
  outdatedTargets: number;
  /** S165 — targets that have never reported a version; previously invisible. */
  unknownVersionTargets: number;
  /**
   * S165 — share (0-100) of validated targets whose last real health check
   * passed, or `null` when nothing has been validated.
   *
   * This used to average four invented per-status constants
   * (healthy=100/degraded=60/failed=20/else=50), so a target that had never
   * been checked contributed a mid-range 50 — a fabricated composite presented
   * as a measurement.
   */
  avgHealthScore: number | null;
  /** S165 — how many targets have a real validation run behind them. */
  validatedTargets: number;
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
