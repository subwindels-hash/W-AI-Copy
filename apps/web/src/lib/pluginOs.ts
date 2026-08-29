/** WINDELS PLUGIN OS — web API client. */
import { api } from "./api";
import type { InstalledPlugin, IntentResolution, MarketplaceEntry, PluginConnection, PluginManifest, CapabilityRoute, PluginAuditEvent } from "@windels/shared";

export const pluginOsApi = {
  marketplace: (params?: { category?: string; q?: string; capability?: string }) =>
    api.get<MarketplaceEntry[]>("/plugins/marketplace", params as any),
  manifest: (id: string) => api.get<PluginManifest>(`/plugins/manifest/${id}`),
  publish: (manifest: PluginManifest) => api.post<PluginManifest>("/plugins/publish", manifest),

  installed: () => api.get<Array<{ plugin: InstalledPlugin; manifest: PluginManifest | null }>>("/plugins/installed"),
  install: (manifestId: string, grantedPermissions?: string[]) =>
    api.post<InstalledPlugin>("/plugins/install", { manifestId, grantedPermissions }),
  setStatus: (id: string, status: string) => api.post(`/plugins/${id}/status`, { status }),
  setPermissions: (id: string, grantedPermissions: string[]) =>
    api.post(`/plugins/${id}/permissions`, { grantedPermissions }),
  uninstall: (id: string) => api.del(`/plugins/${id}`),
  audit: (id: string) => api.get<PluginAuditEvent[]>(`/plugins/${id}/audit`),

  connections: () => api.get<PluginConnection[]>("/plugins/connections"),
  createApiKey: (body: { pluginId: string; displayName: string; apiKey: string; apiSecret?: string; endpoint?: string; scopes?: string[] }) =>
    api.post<PluginConnection>("/plugins/connections/api-key", body),
  startOAuth: (body: any) => api.post<{ url: string; state: string }>("/plugins/connections/oauth/start", body),
  completeOAuth: (code: string, state: string) =>
    api.post<PluginConnection>("/plugins/connections/oauth/complete", { code, state }),
  createMcp: (body: { pluginId: string; displayName: string; endpoint: string; headers?: Record<string, string> }) =>
    api.post<PluginConnection>("/plugins/connections/mcp", body),
  removeConnection: (id: string) => api.del(`/plugins/connections/${id}`),

  route: (capability: string, opts?: { maxCost?: number; preferredPluginId?: string }) =>
    api.post<CapabilityRoute>("/plugins/capabilities/route", { capability, ...opts }),
  execute: (capability: string, input?: unknown) =>
    api.post("/plugins/capabilities/execute", { capability, input }),
  resolveIntent: (prompt: string) => api.post<IntentResolution>("/plugins/intent/resolve", { prompt }),
};
