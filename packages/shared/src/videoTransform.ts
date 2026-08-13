/**
 * WINDELS AI Video Transformation Studio — shared contracts.
 *
 * Node-based AI video transformation: upload a video, extract an exact frame,
 * generate a reference environment, segment the subject into an alpha matte,
 * and run Switch X to composite the preserved subject into the new environment.
 *
 * Reuses the existing WINDELS storage, job, billing/usage, agent and realtime
 * infrastructure. No second auth/billing/storage system is introduced.
 */

// ── Media metadata ─────────────────────────────────────────────────
export interface VtVideoMeta {
  width: number;
  height: number;
  durationSec: number;
  fps: number;
  frameCount: number;
  codec?: string;
  sizeBytes?: number;
}

export type VtPortType =
  | "video"
  | "image"
  | "alpha"
  | "rgba"
  | "prompt"
  | "reference"
  | "frame"
  | "audio"
  | "mask"
  | "metadata";

export type VtNodeKind =
  // input
  | "video_input" | "image_input" | "audio_input" | "text_input"
  // video
  | "video_preview" | "exact_frame" | "video_matte" | "video_trim"
  | "video_crop" | "video_resize" | "video_fps" | "video_merge"
  | "video_composite" | "video_transform" | "switch_x"
  // image
  | "image_generator" | "image_editor" | "image_upscaler"
  | "image_reference" | "image_preview"
  // ai
  | "ai_prompt" | "ai_video_generator" | "ai_video_to_video"
  | "ai_image_to_video" | "ai_background_replacement"
  | "ai_subject_replacement" | "ai_relighting" | "ai_style_transfer"
  // utility
  | "switch" | "condition" | "router" | "combine" | "cache"
  | "delay" | "output";

export interface VtPortDef {
  id: string;
  name: string;
  type: VtPortType;
  direction: "in" | "out";
}

export interface VtNodeDef {
  kind: VtNodeKind;
  label: string;
  category: "input" | "video" | "image" | "ai" | "utility";
  inputs: VtPortDef[];
  outputs: VtPortDef[];
  settings: VtNodeSetting[];
}

export type VtNodeSetting =
  | { key: string; label: string; type: "text" | "number" | "select" | "slider" | "boolean" | "textarea"; default?: unknown; options?: string[]; min?: number; max?: number; step?: number };

export interface VtWorkflowNode {
  id: string;
  kind: VtNodeKind;
  x: number;
  y: number;
  collapsed?: boolean;
  settings: Record<string, unknown>;
}

export interface VtWorkflowConnection {
  id: string;
  sourceNode: string;
  sourcePort: string;
  targetNode: string;
  targetPort: string;
  type: VtPortType;
}

export interface VtWorkflow {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  description?: string;
  nodes: VtWorkflowNode[];
  connections: VtWorkflowConnection[];
  version: number;
  isTemplate: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Jobs ───────────────────────────────────────────────────────────
export type VtJobStage =
  | "QUEUED" | "ANALYZING" | "EXTRACTING_FRAME" | "GENERATING_REFERENCE"
  | "GENERATING_MATTE" | "TRANSFORMING_VIDEO" | "QUALITY_CHECK"
  | "ENCODING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface VtProgress {
  stage: VtJobStage;
  percent: number;
  message: string;
}

export type VtJobInput =
  | { kind: "exact_frame"; sourceAssetId: string; frameNumber: number }
  | { kind: "image_generate"; prompt: string; referenceAssetIds: string[]; modelId?: string; resolution?: string; quality?: string; aspectRatio?: string; quantity?: number; referenceStrength?: number; matchImages?: string[] }
  | { kind: "video_matte"; sourceAssetId: string; settings?: VtMatteSettings }
  | { kind: "switch_x"; sourceAssetId: string; alphaAssetId?: string; prompt: string; referenceAssetId?: string; preserveSubject?: VtPreserveMode; transformMode?: VtTransformMode; resolution?: string; previewSeconds?: number }
  | { kind: "workflow"; workflowId: string; inputs?: Record<string, string> };

export interface VtJob {
  id: string;
  organizationId: string;
  userId: string;
  workflowId?: string;
  kind: VtJobInput["kind"];
  stage: VtJobStage;
  percent: number;
  message: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  input: VtJobInput;
  resultAssetIds: string[];
  versions: VtGenerationResult[];
  error?: string;
  errorCode?: string;
  retriable?: boolean;
  modelId?: string;
  providerId?: string;
  creditsUsed: number;
  estimatedCredits: number;
  estimatedRuntimeSec: number;
  durationSec?: number;
  resolution?: string;
  qualityReport?: VtQualityReport;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface VtGenerationResult {
  id: string;
  jobId: string;
  index: number;
  assetId: string;
  prompt: string;
  modelId: string;
  providerId: string;
  favorite: boolean;
  createdAt: string;
}

// ── Matte ──────────────────────────────────────────────────────────
export type VtMattePreviewMode = "original" | "alpha" | "transparent" | "rgba" | "overlay" | "difference";

export interface VtMatteSettings {
  expandPx?: number;
  contractPx?: number;
  featherPx?: number;
  edgeSoftness?: number;
  hairRefinement?: boolean;
  spillRemoval?: boolean;
  edgeCleanup?: boolean;
  temporalSmoothing?: number;
  backgroundCleanup?: boolean;
}

// ── Switch X ───────────────────────────────────────────────────────
export type VtPreserveMode = "maximum" | "high" | "balanced" | "creative";
export type VtTransformMode =
  | "background_only" | "subject_and_background" | "full_scene"
  | "environment_replacement" | "cinematic_restyle";

export interface VtSwitchXSettings {
  prompt: string;
  preserveSubject: VtPreserveMode;
  transformMode: VtTransformMode;
  resolution: "480p" | "720p" | "1080p" | "1440p" | "4k";
  previewSeconds?: number;
}

// ── Providers ──────────────────────────────────────────────────────
export type VtProviderKind = "image" | "video" | "matte" | "upscale";

export interface VtProviderModel {
  providerId: string;
  modelId: string;
  label: string;
  kind: VtProviderKind;
  configured: boolean;
  status: "online" | "degraded" | "offline" | "stub";
  resolutions: string[];
  aspectRatios: string[];
  maxQuantity?: number;
  maxDurationSec?: number;
  identityPreservation: boolean;
  costCredits: number;
  estimatedSecPerSec: number;
}

// ── Quality ────────────────────────────────────────────────────────
export interface VtQualityCheck {
  id: string;
  status: "pass" | "warn" | "fail" | "skipped";
  score?: number;
  message: string;
}

export interface VtQualityReport {
  passed: boolean;
  score: number;
  checks: VtQualityCheck[];
  retried: boolean;
  ranAt: string;
}

// ── Workflow node results (runtime) ────────────────────────────────
export interface VtNodeResult {
  nodeId: string;
  port: string;
  type: VtPortType;
  assetId?: string;
  value?: unknown;
  jobId?: string;
  at: string;
}

// ── Events / webhooks ──────────────────────────────────────────────
export type VtWebhookEvent =
  | "video.generation.started"
  | "video.generation.progress"
  | "video.generation.completed"
  | "video.generation.failed"
  | "video.quality_check.completed";

export interface VtActivityEvent {
  id: string;
  organizationId: string;
  jobId?: string;
  workflowId?: string;
  kind: string;
  message: string;
  at: string;
}

export interface VtDashboard {
  jobs: number;
  running: number;
  completed: number;
  failed: number;
  providers: number;
  providersConfigured: number;
  creditsUsed: number;
  ffmpegAvailable: boolean;
}
