/**
 * Shared types — Unified Voice Module (v4.0)
 *
 * Combines Voice Studio (Session 40) + Voice Foundry (Session 41) types.
 *
 * Voice Studio provides:
 *   - Built-in voice catalog
 *   - Custom voice management
 *   - TTS synthesis
 *   - Voice presets and settings
 *
 * Voice Foundry provides:
 *   - Voice generation/design
 *   - Voice evolution
 *   - Voice deployment management
 *   - Voice packs
 */

// ─── Voice Studio Types ──────────────────────────────────────────────────────

export type VsVoiceGender = "masculine" | "feminine" | "neutral" | "child-boy" | "child-girl" | "teen";
export type VsVoiceAge = "child" | "teen" | "young-adult" | "adult" | "senior";
export type VsConsentState = "none" | "consent-recorded" | "consent-verified" | "revoked";
export type VsCloneMethod = "upload-samples" | "record-in-app" | "import-audio" | "pro-training" | "fast-clone" | "hf-clone";
export type VsEmotion = "happy" | "sad" | "calm" | "friendly" | "professional" | "serious" | "excited" | "motivational" | "inspirational" | "empathetic" | "urgent" | "confident" | "storytelling";
export type VsVoiceVisibility = "private" | "org" | "public";

export interface BuiltInVoice {
  id: string;
  name: string;
  gender: VsVoiceGender;
  age: VsVoiceAge;
  language: string;
  region?: string;
  accent?: string;
  category: string;
  tags: string[];
  sampleRate: number;
  premium: boolean;
}

export interface CustomVoice {
  id: string;
  name: string;
  ownerId: string;
  baseVoiceId?: string;
  gender: VsVoiceGender;
  age: VsVoiceAge;
  language: string;
  languagesSpoken: string[];
  region?: string;
  consent: VsConsentState;
  consentRecordedAt?: string;
  cloneMethod?: VsCloneMethod;
  trainedEpochs?: number;
  visibility: VsVoiceVisibility;
  settings: VoiceSettings;
  emotions: VsEmotion[];
  createdAt: string;
}

export interface VoiceSettings {
  pitch: number;        // -10..10
  speed: number;        // 0.5..2.0
  volume: number;       // 0..1
  energy: number;       // 0..1
  warmth: number;       // 0..1
  emotion: VsEmotion;
  formality: number;    // 0..1
  accentStrength: number; // 0..1
  pauseMs: number;
  breathing: number;    // 0..1
}

export interface VoicePreset {
  id: string;
  name: string;
  voiceId: string;
  settings: Partial<VoiceSettings>;
  description?: string;
}

export interface TtsRequest {
  voiceId: string;
  text: string;
  settings?: Partial<VoiceSettings>;
  emotion?: VsEmotion;
  language?: string;
}

export interface TtsJob {
  id: string;
  voiceId: string;
  text: string;
  status: "queued" | "synthesizing" | "ready" | "failed" | "completed";
  durationMs?: number;
  audioUrl?: string;
  provider?: string;
  clientSide?: boolean;
  /** Honest failure reason (e.g. VOICE_MODEL_NOT_CONFIGURED) — present only on failed jobs. */
  error?: string;
  requestedAt: string;
  createdAt: string;
}

export interface VoiceStudioDashboard {
  builtinVoices: number;
  customVoices: number;
  synthesisJobs24h: number;
}

// ─── Voice Foundry Types ─────────────────────────────────────────────────────

export type VfCategory =
  | "original-male" | "original-female" | "children" | "elder"
  | "executive" | "narrator" | "customer-service" | "sales"
  | "character" | "digital-human" | "ai-employee" | "brand" | "accessibility";

export type VfGender = "masculine" | "feminine" | "neutral" | "androgynous";

export type VfSpeakingStyle =
  | "conversational" | "formal" | "warm" | "energetic" | "calm" | "authoritative"
  | "friendly" | "dramatic" | "narrator" | "customer-service" | "educational"
  | "persuasive" | "soothing" | "playful" | "professional";

export interface VfVoiceDesign {
  gender: VfGender;
  estimatedAge: number;          // 6..90
  accent?: string;
  language: string;
  languagesSpoken: string[];
  speakingStyle: VfSpeakingStyle;
  personality: string;
  formality: number;             // 0..1
  warmth: number;                // 0..1
  confidence: number;            // 0..1
  energy: number;                // 0..1
  pitch: number;                 // -10..10
  speed: number;                 // 0.5..2.0
  targetEmotion?: string;
  pronunciation?: string;
  breathingStyle?: "natural" | "calm" | "energetic" | "minimal";
  pauseTiming?: "natural" | "short" | "dramatic" | "long";
  vocalTexture?: "smooth" | "raspy" | "breathy" | "rich" | "clear" | "warm" | "bright";
  tone?: string;
  expressiveness?: number;       // 0..1
  conversationalStyle?: "natural" | "articulate" | "casual" | "professional";
}

export interface VfGeneratedVoice {
  id: string;
  name: string;
  category: VfCategory;
  design: VfVoiceDesign;
  baseVoiceId?: string;
  version: number;
  auditTrail: string[];
  ownership: "windels" | "org" | "user";
  visibility: "private" | "org" | "marketplace";
  languagesSpoken: string[];
  ready: boolean;
  createdAt: string;
}

export type VfEvolutionOp =
  | "pronunciation" | "naturalness" | "emotion-expand" | "accent-refine"
  | "style-optimize" | "language-expand" | "quality-enhance";

export interface VfEvolutionJob {
  id: string;
  voiceId: string;
  op: VfEvolutionOp;
  status: "queued" | "running" | "completed" | "failed";
  fromVersion: number;
  toVersion?: number;
  startedAt: string;
  completedAt?: string;
  notes?: string;
}

export type VfDeployTarget =
  | "ai-employee" | "ai-assistant" | "digital-human" | "support-agent" | "sales-agent"
  | "executive-agent" | "voice-call" | "podcast" | "audiobook" | "marketing-video"
  | "presentation" | "training" | "navigation" | "accessibility" | "live-meeting"
  | "smart-device" | "robotics";

export interface VfDeployment {
  id: string;
  voiceId: string;
  target: VfDeployTarget;
  deployedAt: string;
  active: boolean;
}

export interface VfVoicePack {
  id: string;
  name: string;
  kind: "voice-pack" | "corporate" | "industry" | "narrator-collection"
      | "support-pack" | "regional" | "language-pack" | "character-pack" | "accessibility";
  category: VfCategory;
  voiceIds: string[];
  languages: string[];
  description: string;
  premium: boolean;
  installed: boolean;
  author: string;
}

export interface VoiceFoundryDashboard {
  generatedVoices: number;
  voicePacks: number;
  activeDeployments: number;
  deploymentTargets: string[];
}

// ─── Combined Dashboard ──────────────────────────────────────────────────────

export interface VoiceDashboard extends VoiceStudioDashboard, VoiceFoundryDashboard {}

// ─── Route Validation Schemas ────────────────────────────────────────────────

import { z } from "zod";

export const voiceRoutesSchema = {
  voiceId: z.object({
    voiceId: z.string().cuid(),
  }),

  noteId: z.object({
    id: z.string().cuid(),
  }),

  note: z.object({
    title: z.string().optional(),
    body: z.string().optional(),
  }),

  voiceDesign: z.object({
    gender: z.enum(["masculine", "feminine", "neutral", "androgynous"]).optional(),
    estimatedAge: z.number().min(6).max(90).optional(),
    language: z.string().optional(),
    languagesSpoken: z.array(z.string()).optional(),
    speakingStyle: z.string().optional(),
    personality: z.string().optional(),
    formality: z.number().min(0).max(1).optional(),
    warmth: z.number().min(0).max(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
    energy: z.number().min(0).max(1).optional(),
    pitch: z.number().min(-10).max(10).optional(),
    speed: z.number().min(0.5).max(2).optional(),
  }),

  evolveOps: z.object({
    operations: z.array(z.object({
      op: z.enum(["warmth", "confidence", "energy", "pitch", "speed"]),
      value: z.number(),
    })),
  }),

  deployTarget: z.object({
    target: z.enum([
      "ai-employee", "ai-assistant", "digital-human", "support-agent", "sales-agent",
      "executive-agent", "voice-call", "podcast", "audiobook", "marketing-video",
      "presentation", "training", "navigation", "accessibility", "live-meeting",
      "smart-device", "robotics",
    ]),
  }),
};
