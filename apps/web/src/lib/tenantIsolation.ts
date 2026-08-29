/** Session 89 — Tenant Isolation & Cross-Tenant Data Governance client. */
import { api } from "./api";

export type TiPiiRedactionLevel = "none" | "basic" | "strict";

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

export interface TiNamespaceAudit {
  prefix: string;
  scope: "org_scoped" | "shared" | "infra";
  keyCount: number;
  conformingKeys: number;
  leakedKeys: string[];
}

export interface TiFinding {
  severity: "high" | "medium" | "low";
  scope: "redis" | "probe" | "policy";
  message: string;
  detail?: string;
}

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
  status: "compliant" | "review_required" | "failed";
  score: number;
  namespaces: TiNamespaceAudit[];
  probes: TiProbeResult[];
  findings: TiFinding[];
  summary: string;
}

export interface TiExportCheckResult {
  allowed: boolean;
  dataset: string;
  reason: string;
}

export const tenantIsolationApi = {
  getPolicy: () => api<TiIsolationPolicy>("/tenant-isolation/policy"),
  updatePolicy: (input: Partial<TiIsolationPolicy>) =>
    api<TiIsolationPolicy>("/tenant-isolation/policy", { method: "PUT", json: input }),
  runCompliance: () => api<TiComplianceRun>("/tenant-isolation/compliance/run", { method: "POST" }),
  listRuns: () => api<TiComplianceRun[]>("/tenant-isolation/compliance/runs"),
  exportCheck: (dataset: string) =>
    api<TiExportCheckResult>("/tenant-isolation/export-check", { method: "POST", json: { dataset } }),
};
