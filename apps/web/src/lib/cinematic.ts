/** AI Video Studio (Cinematic) — web API client. */
import { api } from "./api";
import type {
  CharacterProfile, CinematicDashboard, CinematicJob, CinematicProject,
  VideoModelDescriptor,
} from "@windels/shared";

export type { CharacterProfile, CinematicDashboard, CinematicJob, CinematicProject, VideoModelDescriptor };

export interface CreateCinematicInput {
  prompt: string;
  title?: string;
  mode?: string;
  style?: string;
  aspectRatio?: string;
  resolution?: string;
  fps?: number;
  durationSec?: number;
  quality?: string;
  audioEnabled?: boolean;
  dialogueEnabled?: boolean;
  musicEnabled?: boolean;
  sfxEnabled?: boolean;
  lipSync?: boolean;
  negativePrompt?: string;
  seed?: number;
  references?: Array<{ role: string; assetId: string; url: string; label?: string; strength: string }>;
  characterIds?: string[];
}

export const cinematicApi = {
  dashboard: () => api<CinematicDashboard>("/cinematic/dashboard"),
  models: () => api<VideoModelDescriptor[]>("/cinematic/models"),
  activity: () => api<any[]>("/cinematic/activity"),

  createProject: (body: CreateCinematicInput) => api<CinematicProject>("/cinematic/projects", { method: "POST", json: body }),
  listProjects: () => api<CinematicProject[]>("/cinematic/projects"),
  getProject: (id: string) => api<CinematicProject>(`/cinematic/projects/${id}`),
  updateProject: (id: string, patch: Partial<CreateCinematicInput>) => api<CinematicProject>(`/cinematic/projects/${id}`, { method: "PATCH", json: patch }),
  deleteProject: (id: string) => api<{ ok: boolean }>(`/cinematic/projects/${id}`, { method: "DELETE" }),
  estimate: (id: string) => api<{ credits: number; runtimeSec: number; multiShot: boolean; model: string }>(`/cinematic/projects/${id}/estimate`, { method: "POST" }),

  generate: (id: string, body: { preview?: boolean; shotId?: string } = {}) =>
    api<CinematicJob>(`/cinematic/projects/${id}/generate`, { method: "POST", json: body }),
  regenerateShot: (id: string, shotId: string) =>
    api<CinematicJob>(`/cinematic/projects/${id}/shots/${shotId}/regenerate`, { method: "POST" }),

  jobs: (projectId?: string) => api<CinematicJob[]>("/cinematic/jobs", projectId ? { params: { projectId } } : {}),
  job: (id: string) => api<CinematicJob>(`/cinematic/jobs/${id}`),
  cancelJob: (id: string) => api<CinematicJob>(`/cinematic/jobs/${id}/cancel`, { method: "POST" }),
  eventsUrl: (id: string) => `${(import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "")}/cinematic/jobs/${id}/events`,

  createCharacter: (body: { name: string; description?: string; references: any[] }) =>
    api<CharacterProfile>("/cinematic/characters", { method: "POST", json: body }),
  characters: () => api<CharacterProfile[]>("/cinematic/characters"),
  deleteCharacter: (id: string) => api<{ deleted: boolean }>(`/cinematic/characters/${id}`, { method: "DELETE" }),
};
