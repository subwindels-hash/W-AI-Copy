/**
 * Audit Trail client — /api/v1/audit (admin-only, org-scoped).
 */
import { api } from "./api";
import type {
  AuditLog,
  AuditTimelineResponse,
  AuditStats,
  AuditQueryInput,
  AuditExportInput,
} from "@windels/shared/audit";

export interface AuditQueryResult {
  logs: AuditLog[];
  total: number;
}

export function queryAudit(params?: AuditQueryInput): Promise<AuditQueryResult> {
  const q = new URLSearchParams();
  if (params?.userId) q.set("userId", params.userId);
  if (params?.action) q.set("action", params.action as string);
  if (params?.resourceType) q.set("resourceType", params.resourceType as string);
  if (params?.resourceId) q.set("resourceId", params.resourceId);
  if (params?.startDate) q.set("startDate", params.startDate);
  if (params?.endDate) q.set("endDate", params.endDate);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  const qs = q.toString() ? `?${q.toString()}` : "";
  return api<AuditQueryResult>(`/audit${qs}`);
}

export function getRecentAudit(limit = 20): Promise<AuditLog[]> {
  return api<AuditLog[]>(`/audit/recent?limit=${limit}`);
}

export function getAuditStats(days = 30): Promise<AuditStats> {
  return api<AuditStats>(`/audit/stats?days=${days}`);
}

export function getAuditById(id: string): Promise<AuditLog> {
  return api<AuditLog>(`/audit/${encodeURIComponent(id)}`);
}

export function getAuditTimeline(days = 14): Promise<AuditTimelineResponse> {
  return api<AuditTimelineResponse>(`/audit/timeline?days=${days}`);
}

export async function exportAudit(params: AuditExportInput): Promise<Blob> {
  const q = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    format: params.format ?? "json",
  });
  const token = (() => {
    try { return localStorage.getItem("windels:accessToken") ?? ""; } catch { return ""; }
  })();
  const base = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/audit/export?${q.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.blob();
}
