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
  "custom",
] as const;
export type MvStyle = (typeof MV_STYLES)[number];

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
  images: MvImageAsset[];
  audio?: MvAudioAsset;
  /** Optional reference to an AI music generator track id. */
  audioTrackId?: string;
  analysis?: MvAudioAnalysis;
  storyboard?: MvStoryboard;
  /** Output file (when rendered). */
  outputUrl?: string;
  outputPath?: string;
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
});
export type CreateMusicVideoInput = z.input<typeof CreateMusicVideoSchema>;

export const MvJobIdSchema = z.object({ id: z.string().min(1).max(64) });
