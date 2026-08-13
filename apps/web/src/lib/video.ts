/**
 * WINDELS AI Video Studio — API client.
 * Routes through the centralized `api()` client (auth refresh, RBAC, logging).
 */
import { api } from "./api";
import type {
  VideoProject,
  VideoJob,
  VideoDashboard,
  VideoProviderModel,
  VideoCreationType,
  VideoAspectRatio,
  VideoResolution,
  VideoQuality,
  VideoModification,
  VideoPublishResult,
  VideoProductRef,
} from "@windels/shared";

export type {
  VideoProject, VideoJob, VideoDashboard, VideoProviderModel,
  VideoCreationType, VideoAspectRatio, VideoResolution, VideoQuality,
  VideoModification, VideoPublishResult, VideoProductRef,
};

export interface Capabilities {
  creationTypes: VideoCreationType[];
  aspectRatios: VideoAspectRatio[];
  resolutions: VideoResolution[];
  providers: VideoProviderModel[];
  ffmpegAvailable: boolean;
}

export interface CreateVideoInput {
  name?: string;
  prompt: string;
  creationType?: VideoCreationType;
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  quality?: VideoQuality;
  targetDurationSec?: number;
  marketplaceProductId?: string;
  products?: VideoProductRef[];
  discloseAi?: boolean;
}

export const videoApi = {
  capabilities: () => api<Capabilities>("/video/capabilities"),
  providers: () => api<VideoProviderModel[]>("/video/providers"),
  dashboard: () => api<VideoDashboard>("/video/dashboard"),

  create: (input: CreateVideoInput) =>
    api<VideoProject>("/video/projects", { method: "POST", json: input }),
  list: (limit = 100) =>
    api<VideoProject[]>("/video/projects", { params: { limit } }),
  get: (id: string) => api<VideoProject>(`/video/projects/${id}`),
  update: (id: string, patch: Partial<CreateVideoInput>) =>
    api<VideoProject>(`/video/projects/${id}`, { method: "PATCH", json: patch }),
  remove: (id: string) =>
    api<{ deleted: boolean }>(`/video/projects/${id}`, { method: "DELETE" }),

  plan: (id: string) =>
    api<VideoProject>(`/video/projects/${id}/plan`, { method: "POST" }),
  generate: (id: string, body: { sceneIndex?: number; op?: string; voiceGender?: "male" | "female" | "neutral"; voiceId?: string } = {}) =>
    api<{ project: VideoProject; jobs: VideoJob[] }>(`/video/projects/${id}/generate`, { method: "POST", json: body }),
  render: (id: string, versionId?: string) =>
    api<{ project: VideoProject; job: VideoJob }>(`/video/projects/${id}/render`, { method: "POST", json: { versionId } }),
  produce: (id: string, body = {}) =>
    api<VideoProject>(`/video/projects/${id}/produce`, { method: "POST", json: body }),
  modify: (id: string, mod: VideoModification) =>
    api<VideoProject>(`/video/projects/${id}/modify`, { method: "POST", json: mod }),
  createVersion: (id: string, body: { aspectRatio?: VideoAspectRatio; platform?: string }) =>
    api<VideoProject[`versions`][number]>(`/video/projects/${id}/versions`, { method: "POST", json: body }),
  attachMarketplaceProduct: (id: string, productId: string) =>
    api<VideoProject>(`/video/projects/${id}/marketplace/${productId}`, { method: "POST" }),
  publish: (id: string, body: { versionId: string; platforms: string[]; title?: string; description?: string }) =>
    api<{ results: VideoPublishResult[] }>(`/video/projects/${id}/publish`, { method: "POST", json: body }),

  jobs: (projectId?: string) =>
    api<VideoJob[]>("/video/jobs", projectId ? { params: { projectId } } : {}),
  job: (id: string) => api<VideoJob>(`/video/jobs/${id}`),
  cancelJob: (id: string) =>
    api<VideoJob>(`/video/jobs/${id}/cancel`, { method: "POST" }),
};
