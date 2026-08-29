/**
 * Shared types — Enterprise Voice Studio (Session 40).
 * Built on Session 38 self-hosted infra, communicating through Session 39 Kernel.
 * Voice cloning ALWAYS requires consent/authorization (standing rule).
 */

export type VsVoiceGender = "masculine" | "feminine" | "neutral" | "child-boy" | "child-girl" | "teen";
export type VsVoiceAge = "child" | "teen" | "young-adult" | "adult" | "senior";
export type VsConsentState = "none" | "consent-recorded" | "consent-verified" | "revoked";
export type VsCloneMethod = "upload-samples" | "record-in-app" | "import-audio" | "pro-training" | "fast-clone" | "hf-clone";
export type VsEmotion = "happy"|"sad"|"calm"|"friendly"|"professional"|"serious"|"excited"|"motivational"|"inspirational"|"empathetic"|"urgent"|"confident"|"storytelling";
export type VsVoiceVisibility = "private" | "org" | "public";

/** Canonical emotion list — `emotions` in the dashboard is this length. */
export const VS_EMOTIONS = [
  "happy","sad","calm","friendly","professional","serious","excited",
  "motivational","inspirational","empathetic","urgent","confident","storytelling",
] as const;

export interface BuiltInVoice {
  id: string; name: string; gender: VsVoiceGender; age: VsVoiceAge;
  language: string; region?: string; accent?: string; category: string;
  tags: string[]; sampleRate: number; premium: boolean;
}
export interface CustomVoice {
  id: string; name: string; ownerId: string;
  /**
   * Owning organization. A cloned voice is biometric data gated by a consent
   * record; before Session 162 these were stored globally and readable by
   * every tenant.
   */
  organizationId: string;
  baseVoiceId?: string; gender: VsVoiceGender; age: VsVoiceAge;
  language: string; languagesSpoken: string[]; region?: string;
  consent: VsConsentState; consentRecordedAt?: string;
  consentRecordedBy?: string;
  cloneMethod?: VsCloneMethod;
  /**
   * Only set when a real training run reports one. This process trains no
   * model, so it is `null` rather than an invented epoch count.
   */
  trainedEpochs?: number | null;
  visibility: VsVoiceVisibility;
  settings: VoiceSettings;
  emotions: VsEmotion[];
  createdAt: string;
  /** Set on records adopted from the pre-S162 global store. */
  migratedFrom?: "global";
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
  id: string; name: string; voiceId: string; settings: Partial<VoiceSettings>;
  description?: string;
  organizationId?: string;
  createdAt?: string;
  migratedFrom?: "global";
}
export interface TtsRequest {
  voiceId: string; text: string; settings?: Partial<VoiceSettings>;
  emotion?: VsEmotion; language?: string;
}
export interface TtsJob {
  id: string; voiceId: string;
  /**
   * `demo` means no real TTS provider was configured and no audio was
   * synthesized. It is a distinct state from `ready` on purpose — the
   * underlying VoiceService already returned it, but the shared contract
   * omitted it, so a placeholder could be typed as a finished render.
   */
  status: "queued"|"synthesizing"|"ready"|"failed"|"demo";
  durationMs?: number; audioUrl?: string; requestedAt: string;
  organizationId?: string;
  migratedFrom?: "global";
}

/** Names the source of each dashboard figure. */
export interface VoiceStudioProvenance {
  latency: string;
  languages: string;
  jobs: string;
  consentViolations: string;
}

export interface VoiceStudioDashboard {
  builtInVoices: number; customVoices: number; clonedVoices: number;
  /** Distinct languages actually present — never a hardcoded base + n. */
  languages: number;
  emotions: number;
  presets: number;
  /** Real rolling 24h window over the job ledger. */
  ttsJobs24h: number;
  /** Lifetime job count, reported separately so 24h is not a lifetime total. */
  ttsJobsTotal: number;
  /** `null` until a real sample exists — never a hardcoded 180. */
  avgSynthLatencyMs: number | null;
  consentViolations: number;
  provenance: VoiceStudioProvenance;
}
