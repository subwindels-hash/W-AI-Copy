// Session 51 — Enterprise Disaster Recovery & AI Continuity (V8.4 §6)

import { z } from "zod";

export const DR_COMPONENTS = [
  "ai_cluster",
  "multi_region",
  "memory_replication",
  "knowledge_graph",
  "ai_model_replication",
  "backup_inference",
  "offline_emergency",
  "bcp",
  "dr_automation",
  "recovery_testing",
  "auto_failback",
  "infra_health",
] as const;
export type DrComponent = (typeof DR_COMPONENTS)[number];

export const DR_RTO = {
  ai_cluster: 30_000,
  multi_region: 60_000,
  memory_replication: 5_000,
  knowledge_graph: 15_000,
  ai_model_replication: 60_000,
  backup_inference: 10_000,
  offline_emergency: 0,
  bcp: 0,
  dr_automation: 0,
  recovery_testing: 0,
  auto_failback: 0,
  infra_health: 0,
} as const satisfies Record<DrComponent, number>;

export const DR_RPO = {
  ai_cluster: 60_000,
  multi_region: 30_000,
  memory_replication: 1_000,
  knowledge_graph: 10_000,
  ai_model_replication: 3_600_000,
  backup_inference: 60_000,
  offline_emergency: 0,
  bcp: 0,
  dr_automation: 0,
  recovery_testing: 0,
  auto_failback: 0,
  infra_health: 0,
} as const satisfies Record<DrComponent, number>;

export interface DrStatus {
  component: DrComponent;
  healthy: boolean;
  activeRegion?: string;
  standbyRegions: string[];
  lastReplicationAt?: string;
  /** Undefined until replication telemetry has actually been sampled. */
  replicationLagMs?: number;
  lastFailoverAt?: string;
  lastTestAt?: string;
}

export interface DrFailoverEvent {
  id: string;
  organizationId: string;
  component: DrComponent;
  fromRegion: string;
  toRegion: string;
  reason: string;
  triggeredBy: "automatic" | "manual";
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: "in_progress" | "completed" | "failed";
  rtoMs?: number;
  rpoMs?: number;
  dataLossMs?: number;
}

export interface DrDrill {
  id: string;
  organizationId: string;
  component: DrComponent;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  /** `running` until an operator records the outcome. A drill is never
   *  auto-graded: the verdict and the achieved RTO/RPO must be measured. */
  status: "scheduled" | "running" | "passed" | "failed";
  results?: { rtoAchievedMs: number; rpoAchievedMs: number; issues: string[] };
  /** Who recorded the outcome, for auditability. */
  recordedBy?: string;
}

export interface DrDashboard {
  overallHealthy: boolean;
  components: DrStatus[];
  activeRegion: string;
  standbyRegions: string[];
  replicationLagMs: number;
  failovers30d: number;
  lastDrillStatus?: "passed" | "failed" | "running";
  lastDrillAt?: string;
  offlineModeAvailable: boolean;
  emergencyModeActive: boolean;
  upcomingDrills: DrDrill[];
}

export const triggerFailoverSchema = z.object({
  component: z.enum(DR_COMPONENTS),
  toRegion: z.string().min(2).max(32),
  reason: z.string().min(2).max(500),
});

export const scheduleDrillSchema = z.object({
  component: z.enum(DR_COMPONENTS),
  scheduledAt: z.string(),
});

export const setEmergencyModeSchema = z.object({
  enabled: z.boolean(),
});
