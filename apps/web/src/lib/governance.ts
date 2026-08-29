/**
 * Platform governance API client (RBAC/audit/health/alerts/retention/compliance/exports).
 *
 * Backend endpoints for these slices are shipped in later sessions; this module
 * provides stub types and functions that return empty/inert data so the
 * GovernancePage route continues to type-check and render gracefully.
 */
import { api } from "./api";

export interface HealthOverview {
  overall: "ok" | "degraded" | "down";
  services: Array<{ name: string; status: "ok" | "degraded" | "down"; latencyMs?: number }>;
}

export interface AlertRuleRecord {
  id: string;
  name: string;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
}

export interface AlertRecord {
  id: string;
  ruleId: string;
  message: string;
  severity: "info" | "warning" | "critical";
  createdAt: string;
  acknowledged: boolean;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  resource: string;
  resourceId?: string;
  at: string;
}

export interface PermissionInfo {
  id: string;
  permission: string;
  description: string;
}

export interface RetentionPolicy {
  id: string;
  resource: string;
  retentionDays: number;
  enabled: boolean;
}

export interface ComplianceReport {
  id: string;
  framework: string;
  score: number;
  generatedAt: string;
}

export interface DataExportRecord {
  id: string;
  requester: string;
  status: "pending" | "ready" | "failed";
  createdAt: string;
}

async function empty<T>(): Promise<T> {
  return [] as unknown as T;
}

export const governanceApi = {
  health: (): Promise<HealthOverview> =>
    Promise.resolve({ overall: "ok", services: [] }),
  listAlertRules: () => empty<AlertRuleRecord[]>(),
  listAlerts: () => empty<AlertRecord[]>(),
  listAudit: () => empty<AuditEntry[]>(),
  listPermissions: () => empty<PermissionInfo[]>(),
  listRetentionPolicies: () => empty<RetentionPolicy[]>(),
  setRetention: (_id: string, _days: number) => empty<RetentionPolicy>(),
  listCompliance: () => empty<ComplianceReport[]>(),
  listExports: () => empty<DataExportRecord[]>(),
  requestExport: () => empty<DataExportRecord>(),
};
