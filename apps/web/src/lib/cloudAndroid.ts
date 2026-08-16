import { api } from "./api";
import type { CloudAndroidDeviceConfig, CloudAndroidObservation, CloudAndroidUiAction } from "@windels/shared/cloudAndroid";
export interface CloudAndroidDevice { id: string; name: string; androidVersion: string; lifecycle: string; desiredState: string; cpuCores: number; ramMb: number; storageGb: number; region: string; locale: string; timezone: string; networkPolicy: any; securityProfile: string; metrics: Record<string, any>; runtimeState: any; securityStatus: string; activeControllerType: string | null; activeControllerId: string | null; activeSessionId: string | null; lastObservedAt: string | null; lastHealthAt: string | null; lastError: string | null; createdAt: string; updatedAt: string; grants?: any[]; sessions?: any[]; actions?: any[]; snapshots?: any[] }
export interface CloudAndroidStatus { configured: boolean; healthy: boolean; provider: { id: string; name: string; status: string; capabilities: string[]; regions: string[]; androidVersions: string[]; lastHealthAt: string; error?: string } }
export interface CloudAndroidFleet { total: number; running: number; degraded: number; activeSessions: number; pendingApprovals: number; byLifecycle: Record<string, number>; providerConfigured: boolean; measuredAt: string }
export const cloudAndroidApi = {
  status: () => api.get<CloudAndroidStatus>("/cloud-android/status"),
  dashboard: () => api.get<CloudAndroidFleet>("/cloud-android/dashboard"),
  devices: () => api.get<CloudAndroidDevice[]>("/cloud-android/devices"),
  device: (id: string) => api.get<CloudAndroidDevice>(`/cloud-android/devices/${id}`),
  create: (input: CloudAndroidDeviceConfig) => api.post<CloudAndroidDevice>("/cloud-android/devices", input),
  lifecycle: (id: string, action: "start" | "stop" | "restart" | "delete") => api.post<CloudAndroidDevice>(`/cloud-android/devices/${id}/${action}`),
  screen: (id: string) => api.get<CloudAndroidObservation>(`/cloud-android/devices/${id}/screen`),
  metrics: (id: string) => api.get<Record<string, any>>(`/cloud-android/devices/${id}/metrics`),
  assignAgent: (id: string, input: any) => api.post(`/cloud-android/devices/${id}/agents`, input),
  startSession: (id: string, input: any) => api.post<any>(`/cloud-android/devices/${id}/sessions`, input),
  takeover: (sessionId: string, controller: "HUMAN" | "AGENT", agentId?: string) => api.post(`/cloud-android/sessions/${sessionId}/takeover`, { controller, agentId }),
  endSession: (sessionId: string, result: Record<string, unknown> = {}) => api.post(`/cloud-android/sessions/${sessionId}/end`, { result }),
  ui: (deviceId: string, sessionId: string, action: CloudAndroidUiAction, agentId?: string) => api.post<any>(`/cloud-android/devices/${deviceId}/sessions/${sessionId}/ui`, { action, agentId }),
  installApp: (deviceId: string, sessionId: string, input: any) => api.post<any>(`/cloud-android/devices/${deviceId}/sessions/${sessionId}/apps/install`, input),
  launchApp: (deviceId: string, sessionId: string, packageName: string) => api.post<any>(`/cloud-android/devices/${deviceId}/sessions/${sessionId}/apps/launch`, { packageName }),
  sessions: () => api.get<any[]>("/cloud-android/sessions"),
  approvals: () => api.get<any[]>("/cloud-android/approvals"),
  decide: (id: string, decision: "APPROVED" | "REJECTED", note?: string) => api.post(`/cloud-android/approvals/${id}/decision`, { decision, note }),
  audit: () => api.get<any[]>("/cloud-android/audit"),
  templates: () => api.get<any[]>("/cloud-android/templates"),
  createTemplate: (input: any) => api.post("/cloud-android/templates", input),
  snapshot: (id: string, name: string) => api.post(`/cloud-android/devices/${id}/snapshot`, { name }),
  restore: (id: string, snapshotId: string) => api.post(`/cloud-android/devices/${id}/restore`, { snapshotId }),
  reconcile: () => api.post("/cloud-android/fleet/reconcile"),
};
