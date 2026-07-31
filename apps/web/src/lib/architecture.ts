/**
 * Session 37 — Enterprise Architecture API client.
 */
import { api } from "./api";
import type { ArchitectureStatus, ArchitectureModule, EsiFeed, SuperintelligenceSignal } from "@windels/shared";
export type { ArchitectureStatus, ArchitectureModule, EsiFeed, SuperintelligenceSignal } from "@windels/shared";


export const archApi = {
  dashboard: () => api<ArchitectureStatus>("/architecture/dashboard/rollup"),
  status: () => api<ArchitectureStatus>("/architecture/status"),
  modules: () => api<ArchitectureModule[]>("/architecture/modules"),
  esi: () => api<EsiFeed>("/architecture/esi"),
  pushSignal: (input: { source: string; signal: string; confidence?: number }) =>
    api<SuperintelligenceSignal>("/architecture/esi/signals", { method: "POST", json: input }),
};
