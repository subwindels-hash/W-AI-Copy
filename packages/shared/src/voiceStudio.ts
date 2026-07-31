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

export interface BuiltInVoice {
  id: string; name: string; gender: VsVoiceGender; age: VsVoiceAge;
  language: string; region?: string; accent?: string; category: string;
  tags: string[]; sampleRate: number; premium: boolean;
}
export interface CustomVoice {
  id: string; name: string; ownerId: string;
  baseVoiceId?: string; gender: VsVoiceGender; age: VsVoiceAge;
  language: string; languagesSpoken: string[]; region?: string;
  consent: VsConsentState; consentRecordedAt?: string;
  cloneMethod?: VsCloneMethod; trainedEpochs?: number;
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
  id: string; name: string; voiceId: string; settings: Partial<VoiceSettings>;
  description?: string;
}
export interface TtsRequest {
  voiceId: string; text: string; settings?: Partial<VoiceSettings>;
  emotion?: VsEmotion; language?: string;
}
export interface TtsJob {
  id: string; voiceId: string; status: "queued"|"synthesizing"|"ready"|"failed";
  durationMs?: number; audioUrl?: string; requestedAt: string;
}
export interface VoiceStudioDashboard {
  builtInVoices: number; customVoices: number; clonedVoices: number;
  languages: number; emotions: number; presets: number;
  ttsJobs24h: number; avgSynthLatencyMs: number; consentViolations: number;
}
