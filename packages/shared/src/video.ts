/**
 * WINDELS AI OS — AI Video Generation & Production Engine.
 *
 * Shared types for the video module (Slice "Video Engine"). The module is an
 * INCREMENTAL addition: it reuses the existing Redis job-queue pattern
 * (mediaGen / musicVideo), the existing Media Metering ledger for billing,
 * the existing Kernel event bus for orchestration events, and the existing
 * RBAC/auth middleware. No second auth, billing, wallet, storage or
 * agent-communication system is introduced here.
 */

// ── Creation types (§5) ────────────────────────────────────────────
export type VideoCreationType =
  | "advertisement"
  | "product"
  | "social"
  | "short_form"
  | "educational"
  | "explainer"
  | "business_presentation"
  | "marketing"
  | "cinematic"
  | "story"
  | "promotional"
  | "ugc"
  | "music_video"
  | "talking_avatar"
  | "image_animation"
  | "video_transform"
  | "image_to_video"
  | "video_to_video";

// ── Formats (§10) ──────────────────────────────────────────────────
export type VideoAspectRatio = "16:9" | "9:16" | "1:1" | "4:5" | "21:9";

export interface VideoFormatProfile {
  id: VideoAspectRatio;
  label: string;
  platforms: string[];
  width: number;
  height: number;
}

export const VIDEO_FORMAT_PROFILES: VideoFormatProfile[] = [
  { id: "16:9", label: "Landscape (YouTube / Desktop)", platforms: ["youtube", "desktop", "linkedin"], width: 1920, height: 1080 },
  { id: "9:16", label: "Vertical (TikTok / Reels / Shorts)", platforms: ["tiktok", "reels", "shorts", "whatsapp"], width: 1080, height: 1920 },
  { id: "1:1", label: "Square (Social feed)", platforms: ["instagram", "facebook"], width: 1080, height: 1080 },
  { id: "4:5", label: "Portrait feed", platforms: ["instagram", "facebook"], width: 1080, height: 1350 },
  { id: "21:9", label: "Cinematic widescreen", platforms: ["cinema", "desktop"], width: 2560, height: 1080 },
];

export type VideoResolution = "480p" | "720p" | "1080p" | "4k";
export type VideoQuality = "draft" | "standard" | "high" | "max";

// ── Provider gateway (§4) ──────────────────────────────────────────
export type VideoProviderOp =
  | "text-to-video"
  | "image-to-video"
  | "video-to-video"
  | "text-to-image"
  | "talking-avatar";

export interface VideoProviderCapability {
  op: VideoProviderOp;
  resolutions: VideoResolution[];
  aspectRatios: VideoAspectRatio[];
  maxDurationSec: number;
  characterConsistency: boolean;
  productConsistency: boolean;
  costWeight: number; // relative cost for routing
  qualityScore: number; // 0..1
}

export interface VideoProviderModel {
  providerId: string;
  modelId: string;
  label: string;
  status: "online" | "degraded" | "offline" | "stub";
  capabilities: VideoProviderCapability[];
  // Configured via env; never holds secrets client-side.
  configured: boolean;
}

export interface VideoProviderRouteRequest {
  op: VideoProviderOp;
  resolution: VideoResolution;
  aspectRatio: VideoAspectRatio;
  durationSec: number;
  needsCharacterConsistency?: boolean;
  needsProductConsistency?: boolean;
  maxCostWeight?: number;
  preferredProvider?: string;
}

export interface VideoProviderRoute {
  providerId: string;
  modelId: string;
  reason: string;
  estimatedCostMicros: number;
}

// ── Project (§7) ───────────────────────────────────────────────────
export type VideoProjectStatus =
  | "draft"
  | "planning"
  | "generating"
  | "rendering"
  | "qa"
  | "ready"
  | "failed"
  | "archived";

export interface VideoCharacter {
  id: string;
  name: string;
  description: string;
  referenceAssetIds: string[];
  consistencyKey?: string;
}

export interface VideoProductRef {
  /** Source of the product data — must not be invented. */
  source: "marketplace" | "crm" | "manual";
  sourceId?: string;
  name: string;
  description?: string;
  images: string[];
  price?: string;
  brand?: string;
  features: string[];
  category?: string;
  vendorName?: string;
}

export interface VideoScene {
  index: number;
  title: string;
  description: string;
  visualPrompt: string;
  cameraMovement: string;
  durationSec: number;
  environment: string;
  characterIds: string[];
  productIds: string[];
  voiceoverText?: string;
  caption?: string;
  transition?: string;
  clipAssetId?: string;
  status: "planned" | "generating" | "ready" | "failed";
}

export interface VideoScript {
  title: string;
  summary: string;
  tone: string;
  totalDurationSec: number;
  sections: Array<{ heading: string; body: string; durationSec: number }>;
  callToAction?: string;
}

export interface VideoStoryboard {
  style: string;
  palette: string[];
  frames: Array<{
    sceneIndex: number;
    shot: string;
    description: string;
    sketchPrompt: string;
    durationSec: number;
  }>;
}

export interface VideoAsset {
  id: string;
  kind: "clip" | "image" | "audio_voice" | "audio_music" | "audio_sfx" | "caption" | "logo" | "thumbnail" | "render" | "intermediate";
  url: string;
  mime: string;
  bytes?: number;
  durationSec?: number;
  providerId?: string;
  modelId?: string;
  thumbnailUrl?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface VideoVoiceTrack {
  id: string;
  sceneIndex?: number;
  text: string;
  voiceId?: string;
  assetId?: string;
  gender?: "male" | "female" | "neutral";
}

export interface VideoMusicTrack {
  id: string;
  mood: string;
  assetId?: string;
  volume: number;
}

export interface VideoCaption {
  sceneIndex: number;
  text: string;
  startSec: number;
  endSec: number;
}

export interface VideoVersion {
  id: string;
  label: string;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  platform?: string;
  renderAssetId?: string;
  thumbnailAssetId?: string;
  status: "planned" | "rendering" | "ready" | "failed";
  createdAt: string;
}

export interface VideoUsage {
  generationJobs: number;
  successfulGenerations: number;
  failedGenerations: number;
  totalDurationSec: number;
  voiceSeconds: number;
  renderMs: number;
  outputBytes: number;
  aiTokens: number;
  estimatedCostMicros: number;
  recordedCostMicros: number;
  unpriced: boolean;
}

export interface VideoProject {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  prompt: string;
  creationType: VideoCreationType;
  status: VideoProjectStatus;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  quality: VideoQuality;
  targetDurationSec: number;
  script?: VideoScript;
  storyboard?: VideoStoryboard;
  scenes: VideoScene[];
  characters: VideoCharacter[];
  products: VideoProductRef[];
  assets: VideoAsset[];
  voiceTracks: VideoVoiceTrack[];
  music: VideoMusicTrack[];
  captions: VideoCaption[];
  versions: VideoVersion[];
  jobs: VideoJob[];
  usage: VideoUsage;
  contentPolicy?: Record<string, unknown>;
  disclosureAiGenerated: boolean;
  marketplaceProductId?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Jobs (§8) ──────────────────────────────────────────────────────
export type VideoJobKind =
  | "plan"
  | "script"
  | "storyboard"
  | "scene_clip"
  | "image"
  | "voice"
  | "music"
  | "sfx"
  | "caption"
  | "render"
  | "qa"
  | "publish";

export type VideoJobStatus =
  | "pending"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "rejected";

export interface VideoJob {
  id: string;
  projectId: string;
  organizationId: string;
  kind: VideoJobKind;
  status: VideoJobStatus;
  progress: number; // 0..100
  priority: number;
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  providerId?: string;
  modelId?: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  costMicros?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  nextRunAt?: string;
}

// ── Quality / safety (§13) ─────────────────────────────────────────
export type VideoQaCheckId =
  | "generation_failures"
  | "missing_scenes"
  | "corrupted_media"
  | "av_sync"
  | "unsupported_media"
  | "caption_errors"
  | "brand_restrictions"
  | "content_policy"
  | "copyright"
  | "unsafe_content"
  | "incorrect_product_claims"
  | "ai_disclosure";

export interface VideoQaCheck {
  id: VideoQaCheckId;
  status: "pass" | "warn" | "fail" | "skipped";
  message: string;
}

export interface VideoQaReport {
  passed: boolean;
  checks: VideoQaCheck[];
  ranAt: string;
}

// ── Dashboard / capabilities ───────────────────────────────────────
export interface VideoDashboard {
  projects: number;
  ready: number;
  inProgress: number;
  failed: number;
  queuedJobs: number;
  runningJobs: number;
  providers: number;
  providersConfigured: number;
  totalDurationSec: number;
  recordedCostMicros: number;
  unpriced: boolean;
  ffmpegAvailable: boolean;
}

// ── Conversational modification (§6) ───────────────────────────────
export interface VideoModification {
  action:
    | "shorten"
    | "lengthen"
    | "change_background"
    | "set_tone"
    | "set_voice_gender"
    | "change_music"
    | "zoom_product"
    | "reformat"
    | "regenerate_scene"
    | "add_captions"
    | "set_aspect"
    | "custom";
  value?: string | number | boolean;
  instruction?: string;
}

// ── Publish (§12) ──────────────────────────────────────────────────
export type VideoPublishPlatform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "linkedin"
  | "x";

export interface VideoPublishRequest {
  versionId: string;
  platforms: VideoPublishPlatform[];
  title?: string;
  description?: string;
}

export interface VideoPublishResult {
  platform: VideoPublishPlatform;
  status: "queued" | "published" | "failed" | "unsupported";
  externalId?: string;
  url?: string;
  error?: string;
}
