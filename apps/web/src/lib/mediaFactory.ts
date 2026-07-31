/**
 * Session 77B — Autonomous AI Media/Content Factory API client.
 */
import { api } from "./api";
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

import type {
  PubPlatformId, PubPlatformInfo, PubPublishInput, PubJob, PubJobStatus,
  PubConnectionStatus, PubOAuthStart, PubAuditEvent,
} from "@windels/shared";
export type {
  PubPlatformId, PubPlatformInfo, PubPublishInput, PubJob, PubJobStatus,
  PubConnectionStatus, PubOAuthStart, PubAuditEvent,
} from "@windels/shared";

export const publishingApi = {
  platforms: () => api.get<PubPlatformInfo[]>("/media-factory/publishing/platforms"),
  connectStart: (platform: PubPlatformId) =>
    api.post<PubOAuthStart>(`/media-factory/publishing/${platform}/connect/start`),
  completeOAuth: (input: { code: string; state: string }) =>
    api.post<PubConnectionStatus>("/media-factory/publishing/oauth/callback", input),
  disconnect: (platform: PubPlatformId) =>
    api.del(`/media-factory/publishing/${platform}/connect`),
  status: (platform: PubPlatformId) =>
    api.get<PubConnectionStatus>(`/media-factory/publishing/${platform}/status`),
  publish: (platform: PubPlatformId, input: PubPublishInput) =>
    api.post<{ job: PubJob; deduplicated: boolean }>(`/media-factory/publishing/${platform}/publish`, input),
  jobs: (opts: { status?: PubJobStatus; platform?: PubPlatformId; limit?: number } = {}) =>
    api.get<PubJob[]>("/media-factory/publishing/jobs", opts as Record<string, unknown>),
  job: (id: string) => api.get<PubJob>(`/media-factory/publishing/jobs/${id}`),
  retry: (id: string) => api.post<PubJob>(`/media-factory/publishing/jobs/${id}/retry`),
  cancel: (id: string) => api.post<PubJob>(`/media-factory/publishing/jobs/${id}/cancel`),
  audit: (limit = 50) => api.get<PubAuditEvent[]>("/media-factory/publishing/audit", { limit }),
};
