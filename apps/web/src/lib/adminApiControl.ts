/**
 * Admin API Control Center client (Super Admin).
 *
 * Platform-wide developer/API controls: enable/disable products, adjust
 * pricing & rate limits, approve/suspend applications, and view aggregated
 * usage across all organizations.
 */
import { api } from "./api";
import type { ApiProductRow } from "@windels/shared/developerPlatform";

export interface AdminAppRow {
  id: string;
  name: string;
  description: string | null;
  environment: string;
  active: boolean;
  productionApproved: boolean;
  organizationName: string;
  ownerName: string | null;
  apiKeyCount: number;
  createdAt: string;
}

export interface AdminUsageSummary {
  generatedAt: string;
  windowDays: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRatePct: number | null;
  avgDurationMs: number | null;
  totalTokensIn: number;
  totalTokensOut: number;
  estimatedCostUsd: number;
  byChannel: Array<{ channel: string; count: number }>;
  byEndpoint: Array<{ endpoint: string; count: number }>;
  byOrg: Array<{ organizationId: string; organizationName: string | null; count: number }>;
}

export const adminApiControl = {
  products: () => api<Array<ApiProductRow & { organizationSlug: string | null }>>("/admin/api-platform/products"),
  setProductEnabled: (id: string, enabled: boolean) =>
    api<ApiProductRow>(`/admin/api-platform/products/${id}/enabled`, { method: "PATCH", json: { enabled } }),
  updateProduct: (id: string, patch: Partial<{ rateLimitPerMin: number; basePriceUsd: number; requiredScopes: string[]; name: string; description: string }>) =>
    api<ApiProductRow>(`/admin/api-platform/products/${id}`, { method: "PATCH", json: patch }),

  apps: () => api<AdminAppRow[]>("/admin/api-platform/apps"),
  setAppApproved: (id: string, enabled: boolean) =>
    api<AdminAppRow>(`/admin/api-platform/apps/${id}/approve`, { method: "PATCH", json: { enabled } }),
  setAppActive: (id: string, enabled: boolean) =>
    api<AdminAppRow>(`/admin/api-platform/apps/${id}/active`, { method: "PATCH", json: { enabled } }),

  usage: (days = 7) => api<AdminUsageSummary>("/admin/api-platform/usage", { params: { days } }),
};
