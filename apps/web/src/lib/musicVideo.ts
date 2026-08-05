/** WINDELS AI OS — Music Video Generator client (Media Studio integration). */
import { api } from "./api";

export type MvMode = "single_image" | "multi_image_story" | "ai_storyboard" | "full_ai";
export type MvStatus = "queued" | "analyzing" | "storyboarding" | "rendering" | "completed" | "failed" | "cancelled" | "requires_config";
export type MvAspect = "16:9" | "9:16" | "1:1" | "4:5" | "21:9";
export type MvStyle =
  | "cinematic" | "hyper_realistic" | "music_video" | "anime" | "cartoon" | "children" | "3d"
  | "motion_graphics" | "documentary" | "abstract" | "luxury" | "corporate" | "fantasy"
  | "horror" | "scifi" | "afrofuturism" | "historical" | "custom";

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
  images: { id: string; name: string; url: string; width: number; height: number; sortOrder: number }[];
  audio?: { id: string; name: string; url: string; durationSec: number };
  audioTrackId?: string;
  analysis?: MvAudioAnalysis;
  storyboard?: MvStoryboard;
  outputUrl?: string;
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
  "cinematic", "hyper_realistic", "music_video", "anime", "cartoon", "children", "3d",
  "motion_graphics", "documentary", "abstract", "luxury", "corporate", "fantasy",
  "horror", "scifi", "afrofuturism", "historical", "custom",
].map((s) => ({ value: s as MvStyle, label: s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));

export const MV_ASPECTS: { value: MvAspect; label: string }[] = [
  { value: "16:9", label: "16:9 · YouTube" },
  { value: "9:16", label: "9:16 · TikTok/Reels/Shorts" },
  { value: "1:1", label: "1:1 · Instagram" },
  { value: "4:5", label: "4:5" },
  { value: "21:9", label: "21:9 · Cinematic" },
];

export const musicVideoApi = {
  jobs: () => api<MvRenderJob[]>("/media-factory/music-video/jobs"),
  job: (id: string) => api<MvRenderJob>(`/media-factory/music-video/jobs/${id}`),
  create: (input: {
    title: string; mode: MvMode; style: MvStyle; aspect: MvAspect;
    images: { url: string; name: string; sortOrder: number }[];
    audioUrl: string; audioName?: string; audioTrackId?: string; customStyle?: string; prompt?: string;
  }) => api<MvRenderJob>("/media-factory/music-video/jobs", { method: "POST", json: input }),
  run: (id: string) => api<MvRenderJob>(`/media-factory/music-video/jobs/${id}/run`, { method: "POST" }),
  cancel: (id: string) => api<MvRenderJob>(`/media-factory/music-video/jobs/${id}/cancel`, { method: "POST" }),
  remove: (id: string) => api<void>(`/media-factory/music-video/jobs/${id}`, { method: "DELETE" }),
};
