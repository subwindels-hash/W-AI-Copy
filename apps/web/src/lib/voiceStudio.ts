/**
 * Session 40 — Enterprise Voice Studio API client.
 * Consent gate is enforced server-side before any voice cloning.
 */
import { api } from "./api";
import type { BuiltInVoice, CustomVoice, VoiceSettings, VoicePreset, TtsJob, VoiceStudioDashboard, VsVoiceGender as VoiceGender, VsVoiceAge as VoiceAge, VsCloneMethod as CloneMethod, VsEmotion as Emotion } from "@windels/shared";
export type { BuiltInVoice, CustomVoice, VoiceSettings, VoicePreset, TtsJob, VoiceStudioDashboard, VsVoiceGender as VoiceGender, VsVoiceAge as VoiceAge, VsCloneMethod as CloneMethod, VsEmotion as Emotion } from "@windels/shared";


export const vsApi = {
  dashboard: () => api<VoiceStudioDashboard>("/voice-studio/dashboard/rollup"),
  builtinVoices: () => api<BuiltInVoice[]>("/voice-studio/voices/builtin"),
  customVoices: () => api<CustomVoice[]>("/voice-studio/voices/custom"),
  /** Only the caller's own voices, rather than the whole organization's. */
  myVoices: () => api<CustomVoice[]>("/voice-studio/voices/custom", { params: { mine: 1 } }),
  cloneVoice: (input: {
    name: string; gender: VoiceGender; age: VoiceAge; language?: string;
    method?: CloneMethod; consentGranted: boolean; baseVoiceId?: string;
  }) => api<CustomVoice>("/voice-studio/voices/clone", { method: "POST", json: input }),
  updateSettings: (id: string, patch: Partial<VoiceSettings>) =>
    api<CustomVoice>(`/voice-studio/voices/${id}/settings`, { method: "PATCH", json: patch }),
  presets: () => api<VoicePreset[]>("/voice-studio/presets"),
  createPreset: (input: { name: string; voiceId: string; settings: Partial<VoiceSettings>; description?: string }) =>
    api<VoicePreset>("/voice-studio/presets", { method: "POST", json: input }),
  synthesize: (input: { voiceId: string; text: string; settings?: Partial<VoiceSettings>; emotion?: Emotion; language?: string }) =>
    api<TtsJob>("/voice-studio/synthesize", { method: "POST", json: input }),
  jobs: () => api<TtsJob[]>("/voice-studio/jobs"),
};

export { VS_EMOTIONS } from "@windels/shared";
