/**
 * Session 37 — Enterprise Architecture API client.
 * Session 193 — added esiReport() and explicit type re-exports for the
 * cross-portfolio report.
 */
import { api } from "./api";
import type {
  ArchitectureStatus,
  ArchitectureModule,
  EsiFeed,
  EsiPortfolioReport,
  SuperintelligenceSignal,
} from "@windels/shared";
export type {
  ArchitectureStatus,
  ArchitectureModule,
  EsiFeed,
  EsiPortfolioReport,
  SuperintelligenceSignal,
} from "@windels/shared";

export const archApi = {
  dashboard: () => api<ArchitectureStatus>("/architecture/dashboard/rollup"),
  status: () => api<ArchitectureStatus>("/architecture/status"),
  modules: () => api<ArchitectureModule[]>("/architecture/modules"),
  esi: () => api<EsiFeed>("/architecture/esi"),
  esiReport: () => api<EsiPortfolioReport>("/architecture/esi/report"),
  pushSignal: (input: { source: string; signal: string; confidence?: number }) =>
    api<SuperintelligenceSignal>("/architecture/esi/signals", { method: "POST", json: input }),
};

// Alias used by the Session 193 console page; both names reach the same
// service.
export const architectureApi = archApi;
