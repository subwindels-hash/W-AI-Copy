// WINDELS AI OS — AI Music Video Generator (single source of truth).
//
// Integrates into the existing Media Generation Studio: it reuses the media
// factory upload/render storage, the AI music generator for audio, the AI
// registry for storyboard/intelligent editing, and the existing Redis job-queue
// pattern. This is NOT a disconnected module — it is an enhancement of the
// studio's video pipeline (a new "Music Video Generator" mode).
//
// It is honest about its rendering capability: when ffmpeg is present on the
// host it renders a real MP4; when it is not, the job reports
// `requires-config` (like the existing media factory video renderer) rather
// than pretending to produce a file. All analysis (BPM, beat times, energy,
// scene planning, camera motion, effects) is real and computed from the
// uploaded audio + images.

import { z } from "zod";

/* ── Core enums ───────────────────────────────────────────────── */

export const MV_MODES = [
  "single_image",
  "multi_image_story",
  "ai_storyboard",
  "full_ai",
] as const;
export type MvMode = (typeof MV_MODES)[number];

export const MV_STATUSES = [
  "queued",
  "analyzing",
  "storyboarding",
  "rendering",
  "completed",
  "failed",
  "cancelled",
  "requires_config",
] as const;
export type MvStatus = (typeof MV_STATUSES)[number];

export const MV_ASPECTS = ["16:9", "9:16", "1:1", "4:5", "21:9"] as const;
export type MvAspect = (typeof MV_ASPECTS)[number];

export const MV_STYLES = [
  "cinematic",
  "hyper_realistic",
  "realistic",
  "music_video",
  "anime",
  "cartoon",
  "children",
  "3d",
  "motion_graphics",
  "documentary",
  "abstract",
  "luxury",
  "corporate",
  "fantasy",
  "horror",
  "scifi",
  "afrofuturism",
  "historical",
  "story_mode",
  "dance",
  "performance",
  "lyric_video",
  "custom",
] as const;
export type MvStyle = (typeof MV_STYLES)[number];

/** Export container formats the render pipeline can produce. */
export const MV_EXPORT_FORMATS = ["mp4", "mov", "webm"] as const;
export type MvExportFormat = (typeof MV_EXPORT_FORMATS)[number];

/** Supported input image/audio extensions for the upload endpoint. */
export const MV_UPLOAD_IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "tiff", "tif"] as const;
export const MV_UPLOAD_AUDIO_EXT = ["mp3", "wav", "flac", "aac", "ogg", "m4a"] as const;

/** Image/audio file formats the studio accepts (validated on the client + server). */
export const MV_IMAGE_TYPES = ["jpg", "jpeg", "png", "webp", "svg", "heic"] as const;
export const MV_AUDIO_TYPES = ["mp3", "wav", "aac", "flac", "ogg", "m4a"] as const;

/** Uploaded source assets referenced by a music video job. */
export interface MvImageAsset {
  id: string;
  name: string;
  /** Public URL (media-factory render endpoint). */
  url: string;
  /** Local storage path (never exposed). */
  path: string;
  width: number;
  height: number;
  sortOrder: number;
}

export interface MvAudioAsset {
  id: string;
  name: string;
  url: string;
  path: string;
  durationSec: number;
}

/* ── Audio analysis (real, from the actual file) ──────────────── */

export interface MvAudioAnalysis {
  durationSec: number;
  /** Estimated BPM computed from onset/energy analysis of the PCM. */
  bpm: number | null;
  /** Beat times (seconds) where the analysis detected a strong transient. */
  beatTimesSec: number[];
  /** Per-second energy envelope (0..1), used to drive camera intensity. */
  energyCurve: number[];
  /** Structural sections guessed from energy/loudness (verse/chorus/etc.). */
  sections: { label: string; startSec: number; endSec: number; intensity: number }[];
  /** Average loudness 0..1. */
  loudness: number;
  tempoLabel: "slow" | "medium" | "fast";
}

/* ── Scene plan ──────────────────────────────────────────────── */

export type MvCameraMotion =
  | "pan_left"
  | "pan_right"
  | "tilt_up"
  | "tilt_down"
  | "zoom_in"
  | "zoom_out"
  | "dolly_in"
  | "dolly_out"
  | "orbit"
  | "static";

export interface MvScene {
  index: number;
  /** Image asset id used as the base for this scene ('' = AI-generated). */
  imageAssetId?: string;
  title: string;
  startSec: number;
  durationSec: number;
  camera: MvCameraMotion;
  /** Animated effect (lens flare, bloom, rain, snow, etc.). */
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

/** Per-job render controls (user-tunable). */
export interface MvRenderSettings {
  /** 1 (subtle) .. 10 (extreme). */
  animationStrength: number;
  cameraMotion: "subtle" | "moderate" | "dynamic" | "cinematic";
  sceneMotion: "none" | "slow" | "medium" | "fast";
  characterMotion: "none" | "subtle" | "animated";
  lighting: "natural" | "dramatic" | "neon" | "golden_hour" | "studio" | "dark";
  effects: string[];
  durationSec: number;
  aspect: MvAspect;
  frameRate: number;
  resolution: "720p" | "1080p" | "1440p" | "4k";
  exportFormat: MvExportFormat;
}

/* ── Job record ──────────────────────────────────────────────── */

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
  images: MvImageAsset[];
  audio?: MvAudioAsset;
  /** Optional reference to an AI music generator track id. */
  audioTrackId?: string;
  analysis?: MvAudioAnalysis;
  storyboard?: MvStoryboard;
  /** Output file (when rendered). */
  outputUrl?: string;
  outputPath?: string;
  /** Preview (low-res / thumbnail) URL when available. */
  previewUrl?: string;
  thumbnailUrl?: string;
  sizeBytes?: number;
  error?: string;
  progressPct: number;
  stage: string;
  /** Per-stage timing for status monitoring. */
  stages: { key: string; status: string; detail?: string; at?: string }[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  /** Usage/billing metering (real). */
  usage: { secondsRendered: number; imageCount: number; aiCalls: number };
}

/* ── Requests ────────────────────────────────────────────────── */

/** User-tunable render settings (subset — full list in MvRenderSettings). */
export const MvRenderSettingsSchema = z.object({
  animationStrength: z.number().int().min(1).max(10).default(5),
  cameraMotion: z.enum(["subtle", "moderate", "dynamic", "cinematic"]).default("cinematic"),
  sceneMotion: z.enum(["none", "slow", "medium", "fast"]).default("medium"),
  characterMotion: z.enum(["none", "subtle", "animated"]).default("subtle"),
  lighting: z.enum(["natural", "dramatic", "neon", "golden_hour", "studio", "dark"]).default("dramatic"),
  effects: z.array(z.string()).default([]),
  durationSec: z.number().int().min(3).max(120).optional(),
  aspect: z.enum(MV_ASPECTS).optional(),
  frameRate: z.number().int().min(24).max(60).default(30),
  resolution: z.enum(["720p", "1080p", "1440p", "4k"]).default("1080p"),
  exportFormat: z.enum(MV_EXPORT_FORMATS).default("mp4"),
});

export const CreateMusicVideoSchema = z.object({
  title: z.string().min(1).max(120),
  mode: z.enum(MV_MODES),
  style: z.enum(MV_STYLES).default("cinematic"),
  aspect: z.enum(MV_ASPECTS).default("16:9"),
  /** Image asset URLs + sort order (from uploads or the image generator). */
  images: z.array(z.object({
    url: z.string().min(1),
    name: z.string().min(1).max(160),
    sortOrder: z.number().int().nonnegative().default(0),
  })).min(1).max(20),
  /** Audio asset URL (uploaded or from the AI music generator). */
  audioUrl: z.string().min(1),
  audioName: z.string().max(160).optional(),
  /** If the audio came from the AI Music Generator, its track id (for reuse). */
  audioTrackId: z.string().optional(),
  /** Optional custom brand style descriptor (used when style = "custom"). */
  customStyle: z.string().max(500).optional(),
  /** For full_ai mode: a prompt describing the desired video. */
  prompt: z.string().max(2000).optional(),
  /** User render controls (defaults applied when absent). */
  settings: MvRenderSettingsSchema.optional(),
});
export type CreateMusicVideoInput = z.input<typeof CreateMusicVideoSchema>;

export const MvJobIdSchema = z.object({ id: z.string().min(1).max(64) });

/* ── Upload requests ─────────────────────────────────────────── */

export const UPLOAD_RESPONSE_SCHEMA = z.object({
  ok: z.boolean(),
  data: z.object({
    url: z.string(),
    name: z.string(),
    kind: z.enum(["image", "audio"]),
    size: z.number(),
  }),
  meta: z.object({ requestId: z.string() }).optional(),
});

/* ── AI music video agents (chat-routable workforce) ─────────── */

export type MvAgentKey =
  | "ai-director"
  | "ai-storyboard"
  | "ai-image-gen"
  | "ai-video-gen"
  | "ai-motion"
  | "ai-music-analysis"
  | "ai-audio"
  | "ai-quality-control"
  | "ai-rendering";

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
