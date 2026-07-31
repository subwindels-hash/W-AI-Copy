/**
 * Session 24 — Release Management shared types (Phase 23, Slices 199–204).
 */

// ─── Slice 199: Enterprise Release Pipeline ─────────────────────
// Session 21's infrastructure module already declares a narrower
// `Release`/`ReleaseStatus`/`DeploymentStrategy` for per-workload rollouts.
// Session 24 ships the full enterprise pipeline record (R-0001 etc.), so
// types here use a Pipeline prefix to avoid barrel collisions.
export type PipelineReleaseStatus =
  | "draft"
  | "validating"
  | "awaiting_approval"
  | "approved"
  | "staging"
  | "staging_validated"
  | "canary"
  | "rolling"
  | "deployed"
  | "rolled_back"
  | "rejected";

export type ReleaseEnvironment = "dev" | "staging" | "canary" | "production";

export type PipelineDeploymentStrategy = "rolling" | "blue-green" | "canary" | "recreate";

export interface PipelineRelease {
  id: string;
  number: number;
  title: string;
  version: string;
  service: string;
  environment: ReleaseEnvironment;
  strategy: PipelineDeploymentStrategy;
  status: PipelineReleaseStatus;
  author: string;
  description: string;
  changelog: string[];
  ticketRefs: string[];
  risk: "low" | "medium" | "high" | "critical";
  createdAt: string;
  updatedAt: string;
  deployedAt?: string;
  rollbackOf?: string;
}

// ─── Slice 200: Governance Approval ──────────────────────────────
export type ApprovalGate =
  | "engineering_lead"
  | "security_review"
  | "qa_signoff"
  | "product_owner"
  | "change_advisory_board"
  | "sre_oncall";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "waived";

export interface ApprovalRecord {
  id: string;
  releaseId: string;
  gate: ApprovalGate;
  approver: string;
  status: ApprovalStatus;
  comment?: string;
  at?: string;
}

export interface ApprovalSummary {
  required: ApprovalGate[];
  approved: ApprovalGate[];
  rejected: ApprovalGate[];
  pending: ApprovalGate[];
  quorumMet: boolean;
}

// ─── Slice 201: AI Validation Pipeline ──────────────────────────
export type ValidationSeverity = "info" | "warning" | "error" | "blocker";

export interface ValidationCheck {
  id: string;
  name: string;
  category: "security" | "tests" | "dependencies" | "performance" | "schema" | "compliance";
  passed: boolean;
  severity: ValidationSeverity;
  message: string;
  durationMs: number;
}

export interface AiValidationResult {
  id: string;
  releaseId: string;
  checks: ValidationCheck[];
  overallPassed: boolean;
  score: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

// ─── Slice 202: Staging Pipeline ────────────────────────────────
export type StagingStatus = "idle" | "deploying" | "smoke_testing" | "regression" | "healthy" | "unhealthy";

export interface StagingDeployment {
  releaseId: string;
  status: StagingStatus;
  url: string;
  smokeTestsPassed: number;
  smokeTestsFailed: number;
  regressionPassRate: number;
  healthChecksPassed: boolean;
  deployedAt?: string;
  validatedAt?: string;
}

// ─── Slice 203: Production Release ──────────────────────────────
export type ProductionStatus =
  | "idle"
  | "canary_ramping"
  | "canary_paused"
  | "rolling_out"
  | "deployed"
  | "rolling_back"
  | "rolled_back";

export interface ProductionDeployment {
  releaseId: string;
  status: ProductionStatus;
  canaryPercent: number;
  /** Only true once real post-rollout health has been observed at 100%. */
  healthyAt100: boolean;
  /** Observed canary telemetry. Undefined until a metrics source reports it. */
  errorRate?: number;
  p95LatencyMs?: number;
  startedAt?: string;
  promotedAt?: string;
  rolledBackAt?: string;
}

// ─── Slice 204: Continuous Improvement ──────────────────────────
export interface DoraMetrics {
  deploymentFrequency: number;
  leadTimeHours: number;
  changeFailRate: number;
  mttrHours: number;
  periodDays: number;
}

export interface ReleaseMetrics {
  total: number;
  byStatus: Record<string, number>;
  successRate: number;
  avgLeadTimeHours: number;
  dora: DoraMetrics;
  recent: PipelineRelease[];
}

export interface RetroItem {
  id: string;
  releaseId: string;
  category: "went_well" | "improve" | "action";
  text: string;
  author: string;
  at: string;
}
