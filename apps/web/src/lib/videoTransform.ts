/**
 * AI Video Transformation Studio — web API client.
 */
import { api } from "./api";
import type {
  VtDashboard, VtJob, VtJobInput, VtNodeDef, VtProviderModel,
  VtWorkflow, VtWorkflowConnection, VtWorkflowNode, VtActivityEvent, VtWorkflowValidation,} from "@windels/shared";

export type {
  VtDashboard, VtJob, VtJobInput, VtNodeDef, VtProviderModel,
  VtWorkflow, VtWorkflowConnection, VtWorkflowNode, VtActivityEvent,
};

export interface UploadedSource {
  assetId: string;
  url: string;
  meta: { width: number; height: number; durationSec: number; fps: number; frameCount: number; codec?: string; sizeBytes?: number };
}

export const vtApi = {
  nodes: () => api<VtNodeDef[]>("/video-transform/nodes"),
  /** S210: pre-flight a graph so the editor can show problems before Run. */
  validateWorkflow: (id: string) => api<VtWorkflowValidation>(`/video-transform/workflows/${id}/validate`),
  providers: (kind?: string) => api<VtProviderModel[]>("/video-transform/providers", kind ? { params: { kind } } : {}),
  dashboard: () => api<VtDashboard>("/video-transform/dashboard"),
  activity: () => api<VtActivityEvent[]>("/video-transform/activity"),

  uploadSource: async (file: File): Promise<UploadedSource> => {
    const { useAuthStore } = await import("@/store/auth");
    const token = useAuthStore.getState().accessToken;
    const base = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");
    const fd = new FormData();
    fd.append("file", file, file.name);
    const res = await fetch(`${base}/video-transform/sources`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
    const body = await res.json();
    if (!res.ok || !body?.ok) throw new Error(body?.error?.message ?? "Upload failed");
    return body.data;
  },

  createJob: (input: VtJobInput, workflowId?: string) =>
    api<VtJob>("/video-transform/jobs", { method: "POST", json: { input, workflowId } }),
  jobs: () => api<VtJob[]>("/video-transform/jobs"),
  job: (id: string) => api<VtJob>(`/video-transform/jobs/${id}`),
  cancelJob: (id: string) => api<VtJob>(`/video-transform/jobs/${id}/cancel`, { method: "POST" }),
  estimate: (input: VtJobInput) => api<{ credits: number; seconds: number }>("/video-transform/estimate", { method: "POST", json: { input } }),
  eventsUrl: (id: string) => {
    const base = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");
    return `${base}/video-transform/jobs/${id}/events`;
  },

  createWorkflow: (body: { name: string; description?: string; nodes?: VtWorkflowNode[]; connections?: VtWorkflowConnection[]; isTemplate?: boolean }) =>
    api<VtWorkflow>("/video-transform/workflows", { method: "POST", json: body }),
  workflows: () => api<VtWorkflow[]>("/video-transform/workflows"),
  workflow: (id: string) => api<VtWorkflow>(`/video-transform/workflows/${id}`),
  deleteWorkflow: (id: string) => api<{ ok: boolean }>(`/video-transform/workflows/${id}`, { method: "DELETE" }),
  addNode: (id: string, node: Omit<VtWorkflowNode, "id">) =>
    api<VtWorkflow>(`/video-transform/workflows/${id}/nodes`, { method: "POST", json: node }),
  connect: (id: string, conn: Omit<VtWorkflowConnection, "id" | "type">) =>
    api<VtWorkflow>(`/video-transform/workflows/${id}/connect`, { method: "POST", json: conn }),
  runWorkflow: (id: string, inputs?: Record<string, string>) =>
    api<VtJob>(`/video-transform/workflows/${id}/run`, { method: "POST", json: { inputs } }),
};
