/**
 * Session 41 — AI Voice Foundry API client.
 */
import { api } from "./api";
import type { VfDashboard, VfGeneratedVoice, VfVoiceDesign, VfEvolutionJob, VfDeployment, VfVoicePack, VfCategory, VfEvolutionOp, VfDeployTarget } from "@windels/shared";
export type { VfDashboard, VfGeneratedVoice, VfVoiceDesign, VfEvolutionJob, VfDeployment, VfVoicePack, VfCategory, VfEvolutionOp, VfDeployTarget } from "@windels/shared";

export const vfApi = {
  dashboard: () => api<VfDashboard>("/voice-foundry/dashboard/rollup"),
  voices: (category?: VfCategory) => api<VfGeneratedVoice[]>("/voice-foundry/voices", category ? { params: { category } } : {}),
  generate: (input: { name: string; category: VfCategory; design?: Partial<VfVoiceDesign> }) =>
    api<VfGeneratedVoice>("/voice-foundry/voices/generate", { method: "POST", json: input }),
  design: (prompt: string) => api<VfVoiceDesign>("/voice-foundry/design", { method: "POST", json: { prompt } }),
  evolve: (id: string, op: VfEvolutionOp) => api<VfEvolutionJob>(`/voice-foundry/voices/${id}/evolve`, { method: "POST", json: { op } }),
  evolutions: (id: string) => api<VfEvolutionJob[]>(`/voice-foundry/voices/${id}/evolutions`),
  deploy: (id: string, target: VfDeployTarget) => api<VfDeployment>(`/voice-foundry/voices/${id}/deploy`, { method: "POST", json: { target } }),
  deployments: () => api<VfDeployment[]>("/voice-foundry/deployments"),
  packs: () => api<VfVoicePack[]>("/voice-foundry/packs"),
};
