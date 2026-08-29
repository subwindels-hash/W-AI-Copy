/**
 * WINDELS AI VIDEO STUDIO — Cinematic Video Intelligence.
 *
 * Shared contracts for the cinematic generation layer. This EXTENDS the
 * existing video engine (packages/shared/src/video.ts): it adds character/
 * scene consistency, cinematic camera/motion/lighting/positioning control,
 * 50+ typed references, multi-shot long-form generation, synchronized
 * audio/dialogue/lip-sync, model capability registry + router/failover, the
 * autonomous Video Director/Quality agents, and per-shot regeneration.
 *
 * It reuses the existing job/storage/billing/agent systems — no parallel
 * auth, billing, wallet or storage architecture is introduced.
 */

// ── Creation modes ─────────────────────────────────────────────────
export type CinematicMode =
  | "text_to_video" | "image_to_video" | "video_to_video"
  | "multi_reference" | "script_to_video" | "storyboard"
  | "product" | "advertisement" | "social" | "restyle";

export type CinematicStyle =
  | "photorealistic" | "cinematic" | "anime" | "documentary" | "commercial"
  | "fashion" | "scifi" | "fantasy" | "historical" | "horror"
  | "music_video" | "corporate" | "product";

// ── References (§5–7, §31) ─────────────────────────────────────────
export type ReferenceRole =
  | "character" | "face" | "body" | "clothing" | "location" | "product"
  | "object" | "vehicle" | "style" | "lighting" | "architecture"
  | "background" | "camera";
export type ReferenceStrength = "low" | "medium" | "high" | "maximum";

export interface CinematicReference {
  id: string;
  role: ReferenceRole;
  assetId: string;
  url: string;
  label?: string;
  strength: ReferenceStrength;
  /** Stable consistency key used to lock identity across shots. */
  lockKey?: string;
}

// ── Characters (§7–8) ──────────────────────────────────────────────
export interface CharacterProfile {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  description?: string;
  ageRange?: string;
  voiceId?: string;
  style?: string;
  clothing?: string;
  attributes: Record<string, string>;
  references: CinematicReference[];
  /** Internal identity embedding key (not persisted biometric raw data). */
  identityKey?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Cinematic controls (§10–15) ────────────────────────────────────
export type CameraType =
  | "dolly_in" | "dolly_out" | "drone" | "tracking" | "handheld"
  | "orbit" | "static" | "crane" | "fpv" | "zoom_in" | "zoom_out" | "whip_pan";
export type CameraAngle = "close_up" | "medium" | "wide" | "low" | "high" | "over_shoulder" | "first_person" | "establishing";

export interface CameraControl {
  type: CameraType;
  lensMm?: number;
  focalLength?: number;
  distance?: string;
  height?: string;
  angle?: CameraAngle;
  speed?: "slow" | "normal" | "fast";
  shake?: number; // 0..1
  depthOfField?: boolean;
  focus?: string;
}

export type MotionAction =
  | "walking" | "running" | "dancing" | "sitting" | "turning"
  | "jumping" | "fighting" | "driving" | "flying" | "talking"
  | "hand_gesture" | "facial_expression" | "object_movement" | "idle";

export interface MotionControl {
  action: MotionAction | string;
  direction?: string;
  intensity?: number; // 0..1
  naturalLanguage?: string;
}

export type Position =
  | "foreground" | "middle_ground" | "background"
  | "left" | "center" | "right" | "top" | "bottom" | "custom";

export interface Positioning {
  subjectId: string;
  position: Position;
  /** Custom normalized [x,y] when position === 'custom'. */
  x?: number;
  y?: number;
  z?: number; // depth
}

export type LightingPreset =
  | "daylight" | "golden_hour" | "sunset" | "sunrise" | "night"
  | "moonlight" | "studio" | "neon" | "cinematic" | "soft" | "hard"
  | "backlight" | "rim" | "volumetric" | "fog" | "firelight";

export interface LightingControl {
  preset: LightingPreset | string;
  direction?: string;
  color?: string;
  intensity?: number;
  naturalLanguage?: string;
}

// ── Shots / scenes / multi-shot (§16–18) ───────────────────────────
export interface CinematicShot {
  id: string;
  index: number;
  title: string;
  description: string;
  durationSec: number;
  camera: CameraControl;
  motion?: MotionControl;
  lighting: LightingControl;
  positions: Positioning[];
  characterIds: string[];
  referenceIds: string[];
  dialogue?: string;
  voiceId?: string;
  sfx: string[];
  prompt: string;          // expanded structured prompt
  negativePrompt?: string;
  seed?: number;
  status: "planned" | "generating" | "audio" | "qc" | "ready" | "failed";
  resultAssetId?: string;
  error?: string;
  attempts: number;
}

export interface CinematicStoryboard {
  summary: string;
  tone: string;
  totalDurationSec: number;
  shots: CinematicShot[];
}

// ── Audio (§20–23) ─────────────────────────────────────────────────
export interface AudioTrack {
  id: string;
  kind: "dialogue" | "music" | "sfx" | "ambient" | "voice";
  label: string;
  assetId?: string;
  url?: string;
  startSec: number;
  durationSec: number;
  volume: number;
  characterId?: string;
  lipSync?: boolean;
}

// ── Generations / versions (§30, §43, §45) ─────────────────────────
export interface CinematicGeneration {
  id: string;
  shotId?: string;
  projectId: string;
  variation: number;
  modelId: string;
  providerId: string;
  prompt: string;
  seed: number;
  assetId?: string;
  url?: string;
  durationSec?: number;
  resolution?: string;
  favorite: boolean;
  qualityScore?: number;
  qualityReport?: CinematicQualityReport;
  createdAt: string;
}

// ── Models / capability registry (§34–36, §62–63) ──────────────────
export interface CinematicModelCapability {
  textToVideo: boolean;
  imageToVideo: boolean;
  videoToVideo: boolean;
  multiReference: boolean;
  maxReferences: number;
  characterConsistency: boolean;
  audioGeneration: boolean;
  dialogue: boolean;
  lipSync: boolean;
  maxDurationSec: number;
  maxResolution: string;
  supportedAspectRatios: string[];
  supportedResolutions: string[];
}

export interface VideoModelDescriptor {
  providerId: string;
  modelId: string;
  label: string;
  configured: boolean;
  status: "online" | "degraded" | "offline" | "stub";
  tier: "fast" | "standard" | "high_quality" | "identity";
  costCredits: number;          // per 10 seconds, baseline
  estimatedSecPerSec: number;   // processing time per output second
  capabilities: CinematicModelCapability;
}

export interface ModelRouteDecision {
  providerId: string;
  modelId: string;
  label: string;
  reason: string;
  estimatedCredits: number;
  estimatedRuntimeSec: number;
  multiShot: boolean;
}

// ── Quality (§42, §67) ─────────────────────────────────────────────
export type CinematicQcId =
  | "face_consistency" | "character_consistency" | "hands" | "anatomy"
  | "motion" | "flicker" | "frame_continuity" | "scene_continuity"
  | "lighting" | "shadows" | "audio_sync" | "lip_sync" | "audio_quality"
  | "resolution" | "encoding" | "artifacts" | "negative_prompt";

export interface CinematicQcCheck {
  id: CinematicQcId;
  status: "pass" | "warn" | "fail" | "skipped";
  score?: number;
  message: string;
  autoRetried?: boolean;
}

export interface CinematicQualityReport {
  shotId?: string;
  passed: boolean;
  score: number;
  checks: CinematicQcCheck[];
  retriedShotIds: string[];
  recommendedGenerationId?: string;
  ranAt: string;
}

// ── Jobs (§46–48) ──────────────────────────────────────────────────
export type CinematicJobStage =
  | "QUEUED" | "ANALYZING" | "PLANNING" | "GENERATING" | "PROCESSING"
  | "AUDIO_GENERATION" | "LIP_SYNC" | "QUALITY_CHECK" | "RENDERING"
  | "COMPLETED" | "FAILED" | "CANCELLED";

export interface CinematicJob {
  id: string;
  organizationId: string;
  userId: string;
  projectId: string;
  stage: CinematicJobStage;
  percent: number;
  message: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  currentShotId?: string;
  estimatedCredits: number;
  creditsUsed: number;
  modelId?: string;
  providerId?: string;
  multiShot: boolean;
  error?: string;
  errorCode?: string;
  retriable?: boolean;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

// ── Project (§44–45) ───────────────────────────────────────────────
export interface CinematicProject {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  prompt: string;
  enhancedPrompt?: string;
  negativePrompt?: string;
  mode: CinematicMode;
  style: CinematicStyle;
  aspectRatio: string;
  resolution: string;
  fps: number;
  durationSec: number;
  quality: "draft" | "standard" | "high" | "ultra";
  audioEnabled: boolean;
  dialogueEnabled: boolean;
  musicEnabled: boolean;
  sfxEnabled: boolean;
  lipSync: boolean;
  seed?: number;
  variation: number;
  camera: CameraControl;
  motion?: MotionControl;
  lighting: LightingControl;
  positions: Positioning[];
  references: CinematicReference[];
  characterIds: string[];
  storyboard?: CinematicStoryboard;
  audioTracks: AudioTrack[];
  generations: CinematicGeneration[];
  jobs: CinematicJob[];
  finalAssetId?: string;
  status: "draft" | "planned" | "generating" | "qc" | "ready" | "failed";
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CinematicDashboard {
  projects: number;
  ready: number;
  inProgress: number;
  failed: number;
  runningJobs: number;
  models: number;
  modelsConfigured: number;
  creditsUsed: number;
  ffmpegAvailable: boolean;
}
