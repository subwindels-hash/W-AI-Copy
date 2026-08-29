/**
 * Session 77B — Autonomous AI Media/Content Factory API client.
 */
import { api, ApiError } from "./api";
import type { MfDashboard, MfCharacter, MfContentJob, MfCourse, MfContentType, MfChannel } from "@windels/shared";
export type { MfDashboard, MfCharacter, MfContentJob, MfCourse, MfContentType, MfChannel } from "@windels/shared";

export const mfApi = {
  dashboard: () => api<MfDashboard>("/media-factory/dashboard/rollup"),
  generate: (input: { type: MfContentType; channel: MfChannel; prompt: string }) =>
    api<MfContentJob>("/media-factory/generate", { method: "POST", json: input }),
  jobs: (limit = 50) => api<MfContentJob[]>("/media-factory/jobs", { params: { limit } }),
  characters: () => api<MfCharacter[]>("/media-factory/characters"),
  courses: () => api<MfCourse[]>("/media-factory/courses"),
};

/* ── Publishing pipeline (Session 77B) ────────────────────────────── */

import { useAuthStore } from "@/store/auth";
import type {
  PubPlatformId, PubPlatformInfo, PubPublishInput, PubJob, PubJobStatus,
  PubConnectionStatus, PubOAuthStart, PubAuditEvent, PubTokenScope,
  PubUploadRecord, PubUploadResult, PubWebhookConfig, PubWebhookRegistration,
} from "@windels/shared";
export type {
  PubPlatformId, PubPlatformInfo, PubPublishInput, PubJob, PubJobStatus,
  PubConnectionStatus, PubOAuthStart, PubAuditEvent, PubTokenScope,
  PubUploadRecord, PubUploadResult, PubWebhookConfig, PubWebhookRegistration,
} from "@windels/shared";

export const publishingApi = {
  platforms: () => api.get<PubPlatformInfo[]>("/media-factory/publishing/platforms"),
  orgConnections: () =>
    api.get<Record<PubPlatformId, PubConnectionStatus>>("/media-factory/publishing/org-connections"),
  connectStart: (platform: PubPlatformId, scope?: PubTokenScope) =>
    api.post<PubOAuthStart>(`/media-factory/publishing/${platform}/connect/start`, scope ? { scope } : undefined),
  completeOAuth: (input: { code: string; state: string }) =>
    api.post<PubConnectionStatus>("/media-factory/publishing/oauth/callback", input),
  disconnect: (platform: PubPlatformId, scope: PubTokenScope = "user") =>
    api.del(`/media-factory/publishing/${platform}/connect${scope === "org" ? "?scope=org" : ""}`),
  status: (platform: PubPlatformId, scope: PubTokenScope = "user") =>
    api.get<PubConnectionStatus>(`/media-factory/publishing/${platform}/status`, scope === "org" ? { scope } : undefined),
  publish: (platform: PubPlatformId, input: PubPublishInput & { tokenScope?: PubTokenScope }) =>
    api.post<{ job: PubJob; deduplicated: boolean }>(`/media-factory/publishing/${platform}/publish`, input),
  jobs: (opts: { status?: PubJobStatus; platform?: PubPlatformId; limit?: number } = {}) =>
    api.get<PubJob[]>("/media-factory/publishing/jobs", opts as Record<string, unknown>),
  job: (id: string) => api.get<PubJob>(`/media-factory/publishing/jobs/${id}`),
  retry: (id: string) => api.post<PubJob>(`/media-factory/publishing/jobs/${id}/retry`),
  cancel: (id: string) => api.post<PubJob>(`/media-factory/publishing/jobs/${id}/cancel`),
  audit: (limit = 50) => api.get<PubAuditEvent[]>("/media-factory/publishing/audit", { limit }),
  // Browser-side direct upload (FormData — the JSON client cannot send it).
  upload: uploadPublishMedia,
  uploads: (limit = 50) => api.get<PubUploadRecord[]>("/media-factory/publishing/uploads", { limit }),
  deleteUpload: (file: string) => api.del(`/media-factory/publishing/uploads/${encodeURIComponent(file)}`),
  // Webhook status sync.
  webhooks: () => api.get<PubWebhookConfig[]>("/media-factory/publishing/webhooks"),
  registerWebhook: (platform: PubPlatformId) =>
    api.post<PubWebhookRegistration>(`/media-factory/publishing/webhooks/${platform}/register`),
  deleteWebhook: (platform: PubPlatformId) => api.del(`/media-factory/publishing/webhooks/${platform}`),
};

const API_BASE = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");

/** Sends a File via multipart/form-data. Exception to the "no raw fetch" rule
 *  (FormData requires a browser-managed Content-Type boundary). */
async function uploadPublishMedia(file: File): Promise<PubUploadResult> {
  const token = useAuthStore.getState().accessToken;
  const fd = new FormData();
  fd.append("file", file, file.name);
  const res = await fetch(`${API_BASE}/media-factory/publishing/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.ok) {
    throw new ApiError(body?.error?.code ?? "UPLOAD_FAILED", body?.error?.message ?? `Upload failed (HTTP ${res.status})`, res.status);
  }
  return body.data as PubUploadResult;
}

/**
 * S77.B item 22 — usage metering and pre-execution cost estimates.
 *
 * `estimate*` returns a projection (isEstimate: true); `summary`/`records`
 * return measured usage recorded after the work completed. Types come from
 * @windels/shared/mediaMetering, which the API compiles against too.
 */
import type {
  MediaCostEstimate, MediaUsageSummary, MediaUsageRecord,
  EstimateRenderInput, EstimatePublishInput,
} from "@windels/shared/mediaMetering";

export type {
  MediaCostEstimate, MediaCostEstimateLine, MediaUsageSummary,
  MediaUsageRecord, MediaUsageKind,
} from "@windels/shared/mediaMetering";
export { MEDIA_USAGE_UNIT_LABEL } from "@windels/shared/mediaMetering";

export const meteringApi = {
  estimateRender: (input: EstimateRenderInput) =>
    api.post<MediaCostEstimate>("/media-factory/usage/estimate/render", input),
  estimatePublish: (input: EstimatePublishInput) =>
    api.post<MediaCostEstimate>("/media-factory/usage/estimate/publish", input),
  summary: (windowDays = 30) =>
    api.get<MediaUsageSummary>("/media-factory/usage/summary", { windowDays }),
  records: (limit = 50) =>
    api.get<MediaUsageRecord[]>("/media-factory/usage/records", { limit }),
};
