/**
 * Session 54 — Enterprise Update & Lifecycle Management (V8.4 §9).
 * Types for controlled upgrades across platform modules, plugins, models, voices.
 */

export const UPDATE_CHANNELS = ["stable", "beta", "canary", "experimental"] as const;
export type UpdateChannel = typeof UPDATE_CHANNELS[number];

export const UPDATE_STRATEGIES = ["auto", "manual", "blue_green", "canary", "rollback_only"] as const;
export type UpdateStrategy = typeof UPDATE_STRATEGIES[number];

export const UPDATE_CATEGORIES = [
  "platform", "module", "plugin", "model", "voice_pack", "language_pack",
  "security_patch", "dataset", "connector", "template",
] as const;
export type UpdateCategory = typeof UPDATE_CATEGORIES[number];

export const UPDATE_STATUS = ["pending", "downloading", "staged", "approved", "deploying", "deployed", "rolled_back", "failed", "paused"] as const;
export type UpdateStatus = typeof UPDATE_STATUS[number];

export interface UpdatePackage {
  id: string;
  organizationId: string;
  name: string;
  version: string;
  fromVersion?: string;
  category: UpdateCategory;
  channel: UpdateChannel;
  strategy: UpdateStrategy;
  sizeBytes: number;
  changelog: string;
  dependencies: Array<{ packageId: string; version: string }>;
  releaseNotesUrl?: string;
  signed: boolean;
  signature?: string;
  sha256: string;
  approvalsRequired: number;
  approvalsGiven: string[]; // userIds
  status: UpdateStatus;
  progressPct: number;
  targetEnvironment?: string;
  canaryPct?: number;
  blueGreenActive?: "blue" | "green";
  rolledBackFrom?: string;
  createdAt: string;
  updatedAt: string;
  deployedAt?: string;
  createdBy: string;
}

export interface UpdateCheck {
  id: string;
  packageId: string;
  kind: "dependency" | "signature" | "compatibility" | "space" | "backup" | "governance" | "preflight_test";
  label: string;
  passed: boolean;
  detail?: string;
  durationMs: number;
}

export interface UpdateValidation {
  packageId: string;
  ranAt: string;
  passed: boolean;
  checks: UpdateCheck[];
  durationMs: number;
}

export interface UpdateRollout {
  id: string;
  packageId: string;
  organizationId: string;
  environment: string;
  strategy: UpdateStrategy;
  canaryPct: number;
  blueGreenSide: "blue" | "green";
  startedAt: string;
  completedAt?: string;
  status: "in_progress" | "completed" | "rolled_back" | "failed";
  errorRate: number;
  p95LatencyMs: number;
}

export interface UpdateDashboard {
  availableUpdates: number;
  pendingApproval: number;
  deploying: number;
  deployedLast7d: number;
  rollbacksLast30d: number;
  currentVersion: string;
  channel: UpdateChannel;
  lastCheckAt: string;
  recent: UpdatePackage[];
}
