/**
 * Developer / API Platform client.
 *
 * Wraps the authenticated developer-platform endpoints (applications,
 * products, subscriptions, usage dashboard) and the api-key gateway. Types
 * come from `@windels/shared/developerPlatform` so the UI cannot drift from
 * the API.
 */
import { api } from "./api";
import type { NativePublicModel } from "@windels/shared/nativeAiApi";
import type {
  ApiDashboardMetrics,
  ApiProductRow,
  ApiSubscriptionRow,
  ApiUsageRecordRow,
  DeveloperAppCreateInput,
  DeveloperAppRow,
  DeveloperAppUpdateInput,
  ApiScope,
} from "@windels/shared/developerPlatform";

export type {
  ApiDashboardMetrics,
  ApiProductRow,
  ApiSubscriptionRow,
  ApiUsageRecordRow,
  DeveloperAppRow,
  ApiScope,
} from "@windels/shared/developerPlatform";

export const developerApi = {
  nativeModels: () => api<NativePublicModel[]>("/developer/native-ai/models"),
  nativeOpenApi: () => api<Record<string, unknown>>("/developer/native-ai/openapi"),
  /* Applications */
  apps: () => api<DeveloperAppRow[]>("/developer/apps"),
  createApp: (input: DeveloperAppCreateInput) => api<DeveloperAppRow>("/developer/apps", { method: "POST", json: input }),
  updateApp: (id: string, patch: DeveloperAppUpdateInput) => api<DeveloperAppRow>(`/developer/apps/${id}`, { method: "PATCH", json: patch }),
  deleteApp: (id: string) => api<{ deleted: true; id: string }>(`/developer/apps/${id}`, { method: "DELETE" }),

  /* Products & subscriptions */
  products: () => api<ApiProductRow[]>("/developer/products"),
  subscribe: (productId: string, appId?: string) =>
    api<ApiSubscriptionRow>("/developer/subscriptions", { method: "POST", json: { productId, ...(appId ? { appId } : {}) } }),
  subscriptions: () => api<ApiSubscriptionRow[]>("/developer/subscriptions"),
  cancelSubscription: (id: string) =>
    api<{ id: string; status: string }>(`/developer/subscriptions/${id}/cancel`, { method: "POST" }),

  /* Usage */
  dashboard: (days = 7, opts: { appId?: string; apiKeyId?: string; model?: string; endpoint?: string; environment?: string; status?: number } = {}) =>
    api<ApiDashboardMetrics>("/developer/usage/dashboard", { params: { days, ...opts } }),
  usageRecords: (params: { days?: number; page?: number; perPage?: number; appId?: string; apiKeyId?: string } = {}) =>
    api<{ items: ApiUsageRecordRow[]; total: number; page: number; perPage: number }>("/developer/usage/records", { params }),
};

/** Interactive console — executes a real gateway request with an API key.
 *  The console targets the public gateway (`/api/rest/v1`), so it uses a raw
 *  fetch rather than the auth-injecting `/api/v1` client. */
export async function consoleRequest(
  method: string,
  path: string,
  apiKey: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<{ status: number; data: unknown; headers: Record<string, string>; tookMs: number }> {
  const base = import.meta.env.VITE_API_URL ?? "/api/v1";
  const gatewayBase = base.replace(/\/api\/v1\/?$/, "/api/rest/v1");
  const pathOnly = path.startsWith("/api/rest/v1") ? path.slice("/api/rest/v1".length) : path;
  const url = path.startsWith("/v1/")
    ? new URL(path, window.location.origin)
    : new URL(pathOnly, `${window.location.origin}${gatewayBase}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const started = performance.now();
  const res = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const tookMs = Math.round(performance.now() - started);
  let data: unknown = null;
  try { data = await res.json(); } catch { data = null; }
  const headers: Record<string, string> = {};
  ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "x-request-id", "retry-after"]
    .forEach((h) => { const v = res.headers.get(h); if (v) headers[h] = v; });
  return { status: res.status, data, headers, tookMs };
}

export { API_SCOPE_CATALOG, API_SCOPE_GROUPS } from "@windels/shared/developerPlatform";
export type { ApiScope as Scope };
