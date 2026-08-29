/** Session 44 — Voice Ownership, Security & Governance. */
import { api } from "./api";
import type { VoAuditEntry, VoDashboard, VoPolicy, VoVoiceOwner } from "@windels/shared";
export type { VoAuditEntry, VoDashboard, VoPolicy, VoVoiceOwner } from "@windels/shared";

export const voApi = {
  dashboard: () => api<VoDashboard>("/voice-ownership/dashboard/rollup"),
  owners: () => api<VoVoiceOwner[]>("/voice-ownership/owners"),
  onboard: (input: { voiceId: string; source: VoVoiceOwner["ownershipSource"]; identityLevel?: VoVoiceOwner["identityLevel"]; consentGranted?: boolean }) =>
    api<VoVoiceOwner>("/voice-ownership/onboard", { method: "POST", json: input }),
  consent: (voiceId: string, granted: boolean) => api<VoVoiceOwner>(`/voice-ownership/voices/${voiceId}/consent`, { method: "POST", json: { granted } }),
  upgradeIdentity: (voiceId: string, level: VoVoiceOwner["identityLevel"]) => api<VoVoiceOwner>(`/voice-ownership/voices/${voiceId}/identity`, { method: "POST", json: { level } }),
  audit: (voiceId?: string) => api<VoAuditEntry[]>("/voice-ownership/audit", voiceId ? { params: { voiceId } } : {}),
  policies: () => api<VoPolicy[]>("/voice-ownership/policies"),
  checkConsent: (voiceId: string) => api<{ ok: boolean; code?: string; reason?: string }>(`/voice-ownership/voices/${voiceId}/check-consent`, { method: "POST" }),
};
