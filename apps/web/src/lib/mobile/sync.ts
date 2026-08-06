/**
 * Session 117 — typed client for the mobile device, offline-queue, push-health
 * and policy endpoints.
 *
 * `biometrics.ts` and `push.ts` in this folder are untouched; this file adds
 * the surface that had no client at all, and `offlineQueue.ts` now calls the
 * durable submission below instead of the fire-and-forget one.
 */
import { api } from "../api";
import type {
  MobileActionDetail,
  MobileActionInput,
  MobileActionStatus,
  MobileActionSummary,
  MobileConfigurationReport,
  MobileDeviceInventory,
  MobileDeviceView,
  MobileEventKind,
  MobileEventPage,
  MobileGapReport,
  MobileOfflineSummary,
  MobilePinLockState,
  MobilePolicy,
  MobilePolicyUpdateInput,
  MobilePushHealth,
  MobileReplayPlan,
  MobileSelfAssurance,
  MobileSyncSubmission,
} from "@windels/shared/mobile";

export type {
  MobileActionDetail,
  MobileActionInput,
  MobileActionStatus,
  MobileActionSummary,
  MobileConfigurationReport,
  MobileDeviceInventory,
  MobileDeviceView,
  MobileEventPage,
  MobileGapReport,
  MobileOfflineSummary,
  MobilePinLockState,
  MobilePolicy,
  MobilePushHealth,
  MobileReplayPlan,
  MobileSelfAssurance,
  MobileSyncSubmission,
};

export {
  MOBILE_ACTION_MAX_BATCH,
  MOBILE_ACTION_MAX_BODY_BYTES,
  MOBILE_DEVICE_STALE_DAYS,
  MOBILE_PIN_MAX_ATTEMPTS,
  MOBILE_PUSH_FAILURE_RETIREMENT,
  MOBILE_REPLAY_NOTE,
  MOBILE_STORAGE_NOTE,
} from "@windels/shared/mobile";

/** Labels for the five states a queued action can be in. */
export const MOBILE_ACTION_STATUS_LABELS: Record<MobileActionStatus, string> = {
  stored: "Waiting to be replayed",
  applied: "Applied by this device",
  failed: "Replay failed",
  discarded: "Discarded without applying",
  expired: "Expired without applying",
};

export const MOBILE_UPDATE_STANDING_LABELS: Record<string, string> = {
  unknown: "Not comparable",
  current: "Up to date",
  outdated_advisory: "Update available",
  outdated_required: "Update required by policy",
};

export const mobileSyncApi = {
  /* ── Offline queue ─────────────────────────────────────────────────── */

  /** Durable submission. Only the ids this returns as stored/duplicate may be deleted on-device. */
  submitActions: (deviceId: string, actions: MobileActionInput[], lastSyncAt?: string) =>
    api.post<MobileSyncSubmission>("/mobile/offline/actions", { deviceId, actions, lastSyncAt }),

  listActions: (params: { deviceId?: string; status?: MobileActionStatus; limit?: number } = {}) =>
    api.get<{ actions: MobileActionSummary[]; total: number; truncated: boolean; note: string }>(
      "/mobile/offline/actions",
      params,
    ),

  summary: () => api.get<MobileOfflineSummary>("/mobile/offline/summary"),

  replayPlan: (deviceId: string, limit?: number) =>
    api.get<MobileReplayPlan>("/mobile/offline/replay-plan", { deviceId, limit }),

  action: (actionId: string) =>
    api.get<MobileActionDetail>(`/mobile/offline/actions/${encodeURIComponent(actionId)}`),

  resolve: (actionId: string, outcome: "applied" | "failed", detail: { statusCode?: number; error?: string } = {}) =>
    api.post<MobileActionSummary>(
      `/mobile/offline/actions/${encodeURIComponent(actionId)}/resolve`,
      { outcome, ...detail },
    ),

  discard: (actionId: string, reason?: string) =>
    api.post<MobileActionSummary>(
      `/mobile/offline/actions/${encodeURIComponent(actionId)}/discard`,
      { reason },
    ),

  /* ── Device trust ──────────────────────────────────────────────────── */

  devices: () => api.get<MobileDeviceInventory>("/mobile/devices/trust"),

  device: (deviceId: string) =>
    api.get<MobileDeviceView>(`/mobile/devices/${encodeURIComponent(deviceId)}/trust`),

  pinLock: (deviceId: string) =>
    api.get<MobilePinLockState>(`/mobile/devices/${encodeURIComponent(deviceId)}/pin/lock`),

  clearPin: (deviceId: string) =>
    api.del<{ deviceId: string; pinConfigured: false; note: string }>(
      `/mobile/devices/${encodeURIComponent(deviceId)}/pin`,
    ),

  /* ── Push, policy, assurance, ledger ───────────────────────────────── */

  pushHealth: () => api.get<MobilePushHealth>("/mobile/push/health"),

  policy: () => api.get<MobilePolicy>("/mobile/policy"),

  updatePolicy: (input: MobilePolicyUpdateInput) => api.put<MobilePolicy>("/mobile/policy", input),

  self: () => api.get<MobileSelfAssurance>("/mobile/assurance/self"),

  configuration: () => api.get<MobileConfigurationReport>("/mobile/assurance/configuration"),

  gaps: () => api.get<MobileGapReport>("/mobile/assurance/gaps"),

  events: (params: { kind?: MobileEventKind; deviceId?: string; limit?: number } = {}) =>
    api.get<MobileEventPage>("/mobile/events", params),
};

/* ── The Session 21 endpoints, which had no typed client ───────────────── */

export const mobileApi = {
  config: () =>
    api.get<{ vapidPublicKey: string; minAppVersion: string; forceUpdate: boolean; apiBase: string }>(
      "/mobile/config",
    ),

  registerDevice: (input: {
    deviceId?: string;
    platform: "ios" | "android" | "web-pwa";
    deviceName?: string;
    osVersion?: string;
    appVersion?: string;
    deviceModel?: string;
  }) => api.post<MobileDeviceView>("/mobile/devices/register", input),

  listDevices: () =>
    api.get<
      Array<{
        id: string;
        platform: string;
        deviceName: string | null;
        osVersion: string | null;
        appVersion: string | null;
        biometricEnabled: boolean;
        lastSeenAt: string;
        createdAt: string;
      }>
    >("/mobile/devices"),

  revokeDevice: (deviceId: string) =>
    api.del<{ ok: true }>(`/mobile/devices/${encodeURIComponent(deviceId)}`),

  setPin: (deviceId: string, pin: string) =>
    api.post<{ ok: true }>("/mobile/pin/set", { deviceId, pin }),

  verifyPin: (deviceId: string, pin: string) =>
    api.post<{ ok: true }>("/mobile/pin/verify", { deviceId, pin }),

  notifications: (params: { limit?: number; unread?: "1"; before?: string } = {}) =>
    api.get<
      Array<{
        id: string;
        type: string;
        title: string;
        body: string;
        url: string | null;
        readAt: string | null;
        createdAt: string;
      }>
    >("/mobile/notifications", params),

  markRead: (id: string) => api.post(`/mobile/notifications/${encodeURIComponent(id)}/read`),

  markAllRead: () => api.post("/mobile/notifications/read-all"),
};
