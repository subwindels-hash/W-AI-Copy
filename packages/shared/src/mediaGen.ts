/**
 * Shared types — Session 42: Universal Media Generation.
 *
 * Image, audio, and video generation on Session 38 self-hosted GPU infrastructure
 * routed through Session 39 Kernel compute allocation. Digital humans stubbed for
 * Session 62.
 */

export type MgImageOp = "text-to-image" | "image-edit" | "restore" | "upscale" | "logo" | "marketing" | "mockup" | "technical";
export type MgAudioOp = "music" | "sfx" | "podcast" | "ambient" | "branding" | "adaptive";
export type MgVideoOp = "text-to-video" | "image-to-video" | "avatar" | "marketing" | "training" | "presentation" | "storyboard" | "subtitles" | "translation" | "enhancement";

export interface MgJob {
  id: string;
  modality: "image" | "audio" | "video";
  op: MgImageOp | MgAudioOp | MgVideoOp;
  prompt: string;
  status: "queued" | "gpu-allocated" | "generating" | "post" | "ready" | "failed";
  gpuNodeId?: string;
  durationMs?: number;
  createdAt: string;
  url?: string;
  safety: "pending" | "approved" | "approved-child-safe" | "rejected";
}

export interface MgCapability {
  modality: "image" | "audio" | "video";
  op: string;
  gpuRequiredMb: number;
  avgMs: number;
  status: "online" | "stub" | "offline";
}

export interface MgDashboard {
  jobs24h: number;
  ready: number;
  failed: number;
  avgLatencyMs: number;
  gpuUtilizationPct: number;
  capabilities: number;
  /** True when any video capability cannot actually generate (S211). */
  videoOpsStubbed: boolean;
  /** True only when a real inference provider is wired (S211). */
  providersConfigured?: boolean;
  /** True when MG_SIMULATE=1 — jobs complete but produce no real media (S211). */
  simulated?: boolean;
  routedThroughKernel: boolean;
}
