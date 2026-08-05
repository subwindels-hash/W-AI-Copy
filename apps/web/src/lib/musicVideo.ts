/** WINDELS AI OS — Music Video Generator client (Media Studio integration). */
import { api } from "./api";

export type MvMode = "single_image" | "multi_image_story" | "ai_storyboard" | "full_ai";
export type MvStatus = "queued" | "analyzing" | "storyboarding" | "rendering" | "completed" | "failed" | "cancelled" | "requires_config";
export type MvAspect = "16:9" | "9:16" | "1:1" | "4:5" | "21:9";
export type MvExportFormat = "mp4" | "mov" | "webm";
export type MvStyle =
  | "cinematic" | "hyper_realistic" | "realistic" | "music_video" | "anime" | "cartoon" | "children" | "3d"
  | "motion_graphics" | "documentary" | "abstract" | "luxury" | "corporate" | "fantasy"
  | "horror" | "scifi" | "afrofuturism" | "historical" | "story_mode" | "dance" | "performance" | "lyric_video" | "custom";
export type MvCameraMotion = "subtle" | "moderate" | "dynamic" | "cinematic";
export type MvSceneMotion = "none" | "slow" | "medium" | "fast";
export type MvCharacterMotion = "none" | "subtle" | "animated";
export type MvLighting = "natural" | "dramatic" | "neon" | "golden_hour" | "studio" | "dark";

export interface MvRenderSettings {
  animationStrength: number;
  cameraMotion: MvCameraMotion;
  sceneMotion: MvSceneMotion;
  characterMotion: MvCharacterMotion;
  lighting: MvLighting;
  effects: string[];
  durationSec: number;
  aspect: MvAspect;
  frameRate: number;
  resolution: "720p" | "1080p" | "1440p" | "4k";
  exportFormat: MvExportFormat;
}

export type MvAgentKey = "ai-director" | "ai-storyboard" | "ai-image-gen" | "ai-video-gen" | "ai-motion" | "ai-music-analysis" | "ai-audio" | "ai-quality-control" | "ai-rendering";

export interface MvAgent {
  key: MvAgentKey;
  name: string;
  description: string;
  routable: true;
  status: "online" | "paused";
  lastHeartbeat: string;
  runs24h: number;
  decisions24h: number;
  blocked24h: number;
}

export interface MvScene {
  index: number;
  imageAssetId?: string;
  title: string;
  startSec: number;
  durationSec: number;
  camera: string;
  effect: string;
  transition: string;
  caption?: string;
  colorGrade: string;
}

export interface MvStoryboard {
  mode: MvMode;
  style: MvStyle;
  aspect: MvAspect;
  scenes: MvScene[];
  totalDurationSec: number;
  aiGenerated: boolean;
}

export interface MvAudioAnalysis {
  durationSec: number;
  bpm: number | null;
  beatTimesSec: number[];
  energyCurve: number[];
  sections: { label: string; startSec: number; endSec: number; intensity: number }[];
  loudness: number;
  tempoLabel: "slow" | "medium" | "fast";
}

export interface MvRenderJob {
  id: string;
  organizationId: string;
  createdById: string;
  title: string;
  mode: MvMode;
  style: MvStyle;
  aspect: MvAspect;
  status: MvStatus;
  settings: MvRenderSettings;
  images: { id: string; name: string; url: string; width: number; height: number; sortOrder: number }[];
  audio?: { id: string; name: string; url: string; durationSec: number };
  audioTrackId?: string;
  analysis?: MvAudioAnalysis;
  storyboard?: MvStoryboard;
  outputUrl?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  sizeBytes?: number;
  error?: string;
  progressPct: number;
  stage: string;
  stages: { key: string; status: string; detail?: string; at?: string }[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  usage: { secondsRendered: number; imageCount: number; aiCalls: number };
}

export const MV_MODES: { value: MvMode; label: string; blurb: string }[] = [
  { value: "single_image", label: "Single Image Animation", blurb: "One image becomes a cinematic animated video synced to audio." },
  { value: "multi_image_story", label: "Multiple Image Story", blurb: "Several images become scenes in one music video." },
  { value: "ai_storyboard", label: "AI Storyboard", blurb: "AI adds transition scenes between your uploaded images." },
  { value: "full_ai", label: "Full AI Music Video", blurb: "AI generates images, animates them, syncs music, renders." },
];

export const MV_STYLES: { value: MvStyle; label: string }[] = [
  "cinematic", "hyper_realistic", "realistic", "music_video", "anime", "cartoon", "children", "3d",
  "motion_graphics", "documentary", "abstract", "luxury", "corporate", "fantasy",
  "horror", "scifi", "afrofuturism", "historical", "story_mode", "dance", "performance", "lyric_video", "custom",
].map((s) => ({ value: s as MvStyle, label: s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));

export const MV_ASPECTS: { value: MvAspect; label: string }[] = [
  { value: "16:9", label: "16:9 · YouTube" },
  { value: "9:16", label: "9:16 · TikTok/Reels/Shorts" },
  { value: "1:1", label: "1:1 · Instagram" },
  { value: "4:5", label: "4:5" },
  { value: "21:9", label: "21:9 · Cinematic" },
];

export const MV_EXPORT_FORMATS: { value: MvExportFormat; label: string }[] = [
  { value: "mp4", label: "MP4" },
  { value: "mov", label: "MOV" },
  { value: "webm", label: "WEBM" },
];

export const MV_RESOLUTIONS: { value: MvRenderSettings["resolution"]; label: string }[] = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "1440p", label: "1440p (2K)" },
  { value: "4k", label: "4K" },
];

export const MV_LIGHTINGS: { value: MvLighting; label: string }[] = [
  { value: "natural", label: "Natural" }, { value: "dramatic", label: "Dramatic" },
  { value: "neon", label: "Neon" }, { value: "golden_hour", label: "Golden Hour" },
  { value: "studio", label: "Studio" }, { value: "dark", label: "Dark" },
];

export const MV_EFFECTS = ["lens_flare", "bloom", "motion_blur", "film_grain", "glow", "neon", "particles", "rain", "snow", "lightning", "color_grade"];

/** Upload an image/audio file as raw bytes; returns the public URL. */
export async function uploadMusicVideoFile(kind: "image" | "audio", file: File | Blob, filename: string): Promise<{ url: string; name: string; kind: "image" | "audio"; size: number }> {
  const buf = await file.arrayBuffer();
  const { useAuthStore } = await import("@/store/auth");
  const token = useAuthStore.getState().accessToken;
  const base = import.meta.env.VITE_API_URL ?? "/api/v1";
  const res = await fetch(`${base}/media-factory/music-video/upload/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: buf,
  });
  const body = await res.json();
  if (!res.ok || !body?.ok) throw new Error(body?.error?.message ?? "Upload failed");
  return body.data;
}

export const musicVideoApi = {
  jobs: () => api<MvRenderJob[]>("/media-factory/music-video/jobs"),
  job: (id: string) => api<MvRenderJob>(`/media-factory/music-video/jobs/${id}`),
  create: (input: {
    title: string; mode: MvMode; style: MvStyle; aspect: MvAspect;
    images: { url: string; name: string; sortOrder: number }[];
    audioUrl: string; audioName?: string; audioTrackId?: string; customStyle?: string; prompt?: string;
    settings?: Partial<MvRenderSettings>;
  }) => api<MvRenderJob>("/media-factory/music-video/jobs", { method: "POST", json: input }),
  run: (id: string) => api<MvRenderJob>(`/media-factory/music-video/jobs/${id}/run`, { method: "POST" }),
  cancel: (id: string) => api<MvRenderJob>(`/media-factory/music-video/jobs/${id}/cancel`, { method: "POST" }),
  remove: (id: string) => api<void>(`/media-factory/music-video/jobs/${id}`, { method: "DELETE" }),
  agents: () => api<MvAgent[]>("/media-factory/music-video/agents"),
  runAgent: (key: MvAgentKey, payload?: Record<string, any>) => api<{ agent: string; verdict: string; detail: string; data?: any }>(`/media-factory/music-video/agents/${key}/run`, { method: "POST", json: payload ?? {} }),
};
