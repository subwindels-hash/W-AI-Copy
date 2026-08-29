/** AI VIDEO TRANSFORMER — web API client. */
import { api, ApiError } from "./api";
import type { VtxDashboard, VtxEditPlan, VtxJob, VtxProject, VtxSceneUnderstanding } from "@windels/shared";

export interface UploadedSource { assetId: string; url: string; meta: { width: number; height: number; durationSec: number; fps: number; frameCount: number }; projectId: string; }

export const vtxApi = {
  upload: async (file: File): Promise<UploadedSource> => {
    const { useAuthStore } = await import("@/store/auth");
    const token = useAuthStore.getState().accessToken;
    const base = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");
    const fd = new FormData(); fd.append("file", file, file.name);
    const res = await fetch(`${base}/video-editor/upload`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new ApiError(body?.error?.code ?? "UPLOAD_FAILED", body?.error?.message ?? `Upload failed (${res.status})`, res.status);
    return body.data as UploadedSource;
  },
  analyze: (sourceAssetId: string, prompt = "") => api.post<VtxSceneUnderstanding>(`/video-editor/sources/${sourceAssetId}/analyze`, { prompt }),
  understanding: (id: string) => api.get<VtxSceneUnderstanding | null>(`/video-editor/sources/${id}/understanding`),
  parse: (prompt: string) => api.post<VtxEditPlan>("/video-editor/parse", { prompt }),
  estimate: (body: { prompt: string; durationSec?: number; resolution?: string; preview?: boolean }) =>
    api.post<{ credits: number; runtimeSec: number; model: string; multiStage: boolean; stages: string[] }>("/video-editor/estimate", body),
  transform: (body: { sourceAssetId: string; prompt: string; resolution?: string; preview?: boolean; previewSeconds?: number; projectId?: string }) =>
    api.post<VtxJob>("/video-editor/transform", body),
  job: (id: string) => api.get<VtxJob>(`/video-editor/jobs/${id}`),
  jobs: () => api.get<VtxJob[]>("/video-editor/jobs"),
  cancel: (id: string) => api.post(`/video-editor/jobs/${id}/cancel`),
  projects: () => api.get<VtxProject[]>("/video-editor/projects"),
  project: (id: string) => api.get<VtxProject>(`/video-editor/projects/${id}`),
  dashboard: () => api.get<VtxDashboard>("/video-editor/dashboard"),
  eventsUrl: (id: string) => `${(import.meta as any).env?.VITE_API_URL ?? "/api/v1"}/video-editor/jobs/${id}/events`,
};
