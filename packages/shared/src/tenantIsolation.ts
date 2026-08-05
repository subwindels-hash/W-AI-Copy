// Session 89 — Tenant Isolation & Cross-Tenant Data Governance.
//
// An "AI-native enterprise OS" hosts many organizations on one cluster, so
// cross-tenant data leakage is the single highest-severity failure mode. This
// module is the enforcement + observability slice for that guarantee:
//
//   - per-org isolation policies (real, Redis-backed, org-scoped keys)
//   - a live namespace audit that scans Redis key namespaces and flags any
//     org-scoped namespace whose keys are missing the org segment
//   - a real cross-tenant self-test that proves org A's data is not readable
//     from org B (and vice-versa), never a fabricated verdict
//   - an export gate the rest of the platform can call before moving data
//     outside the tenant boundary
//
// Types are prefixed `Ti`. All of these are the single source of truth shared
// by the API service, the HTTP routes, and the web client.

import { z } from "zod";

/** PII handling level an org can mandate. */
export const TI_PII_REDACTION_LEVELS = ["none", "basic", "strict"] as const;
export type TiPiiRedactionLevel = (typeof TI_PII_REDACTION_LEVELS)[number];

/** How a Redis namespace is classified for the isolation audit. */
export const TI_NAMESPACE_SCOPES = ["org_scoped", "shared", "infra"] as const;
export type TiNamespaceScope = (typeof TI_NAMESPACE_SCOPES)[number];

export const TI_COMPLIANCE_STATUSES = ["compliant", "review_required", "failed"] as const;
export type TiComplianceStatus = (typeof TI_COMPLIANCE_STATUSES)[number];

/** An org's isolation policy. `orgId` namespaces the stored key. */
export interface TiIsolationPolicy {
  orgId: string;
  allowCrossTenantExport: boolean;
  allowExternalSharing: boolean;
  piiRedactionLevel: TiPiiRedactionLevel;
  retentionDays: number;
  regionPin?: string;
  updatedAt: string;
  updatedBy: string;
}

export const TiUpsertPolicySchema = z.object({
  allowCrossTenantExport: z.boolean(),
  allowExternalSharing: z.boolean(),
  piiRedactionLevel: z.enum(TI_PII_REDACTION_LEVELS),
  retentionDays: z.number().int().min(1).max(3650),
  regionPin: z.string().trim().max(64).optional(),
});
export type TiUpsertPolicyInput = z.infer<typeof TiUpsertPolicySchema>;

/** Result of auditing one Redis namespace against its expected scope. */
export interface TiNamespaceAudit {
  prefix: string;
  scope: TiNamespaceScope;
  keyCount: number;
  /** Keys that conform to the namespace's scope (org segment present when org_scoped). */
  conformingKeys: number;
  /** Keys of an org_scoped namespace that are missing the org segment — a leak risk. */
  leakedKeys: string[];
  note?: string;
}

export type TiFindingSeverity = "high" | "medium" | "low";

export interface TiFinding {
  severity: TiFindingSeverity;
  scope: "redis" | "probe" | "policy";
  message: string;
  detail?: string;
}

/** A real self-test result with a measured duration and an honest pass/fail. */
export interface TiProbeResult {
  name: string;
  passed: boolean;
  detail?: string;
  durationMs: number;
}

export interface TiComplianceRun {
  id: string;
  orgId: string;
  ranAt: string;
  status: TiComplianceStatus;
  /** 0..100 derived from real findings, never fabricated. */
  score: number;
  namespaces: TiNamespaceAudit[];
  probes: TiProbeResult[];
  findings: TiFinding[];
  summary: string;
}

/** Schema for the export gate request. */
export const TiExportCheckSchema = z.object({
  dataset: z.string().min(1).max(200),
});
export type TiExportCheckInput = z.infer<typeof TiExportCheckSchema>;

export interface TiExportCheckResult {
  allowed: boolean;
  dataset: string;
  reason: string;
  policy: Pick<TiIsolationPolicy, "allowCrossTenantExport" | "piiRedactionLevel" | "regionPin">;
}
