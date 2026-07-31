/**
 * Shared types — Enterprise AI Voice Foundry & Autonomous Voice Synthesis (Session 41).
 *
 * Extends Session 40 Voice Studio: invents, designs, synthesizes, evolves, and manages
 * entirely original AI voices without relying on external AI APIs. Reuses S40's
 * CustomVoice data model and preset store; adds foundry-specific design, evolution,
 * asset management, deployment targeting, and marketplace pack types.
 *
 * Autonomous voices are exempt from source-speaker consent but still pass ownership
 * verification and immutable audit logging (Session 44 governance hooks).
 */

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
  personality: string;           // natural language adjective list or brand descriptor
  formality: number;             // 0..1
  warmth: number;                // 0..1
  confidence: number;            // 0..1
  energy: number;                // 0..1
  pitch: number;                 // -10..10
  speed: number;                 // 0.5..2.0
  targetEmotion?: string;
  pronunciation?: string;        // accent/dialect hint
  breathingStyle?: "natural" | "calm" | " energetic" | "minimal";
  pauseTiming?: "natural" | "short" | "dramatic" | "long";
  vocalTexture?: "smooth" | "raspy" | "breathy" | "rich" | "clear" | "warm" | "bright";
  tone?: string;
  expressiveness?: number;       // 0..1
  conversationalStyle?: "natural" | "articulate" | "casual" | "professional";
}

export interface VfGeneratedVoice {
  id: string;                    // "vf-<uuid8>"
  name: string;
  category: VfCategory;
  design: VfVoiceDesign;
  baseVoiceId?: string;          // if evolved from an existing voice
  version: number;
  auditTrail: string[];          // immutable audit log entries
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
  id: string;                    // "vp-<uuid8>"
  name: string;
  kind: "voice-pack" | "corporate" | "industry" | "narrator-collection"
      | "support-pack" | "regional" | "language-pack" | "character-pack" | "accessibility";
  category: VfCategory;
  voiceIds: string[];
  languages: string[];
  description: string;
  premium: boolean;
  installed: boolean;
  author: "windels" | "org" | "marketplace";
}

export interface VfDashboard {
  generatedVoices: number;
  voicesReady: number;
  categories: number;
  evolutionJobs24h: number;
  deployments: number;
  activeTargets: number;
  voicePacks: number;
  languagesSupported: number;
  consentExemptAutonomous: number; // voices created by the Foundry itself (no source speaker)
}
