import { api } from "./api";
import type { ComposedWorkflow, ComposerDashboard, ComposerLibraryEntry, ComposerRunLog, ComposerValidationResult } from "@windels/shared";
export type { ComposedWorkflow, ComposerDashboard, ComposerLibraryEntry, ComposerRunLog, ComposerValidationResult } from "@windels/shared";

export const composerApi = {
  dashboard: () => api<ComposerDashboard>("/composer/dashboard/rollup"),
  list: () => api<ComposedWorkflow[]>("/composer/workflows"),
  get: (id: string) => api<ComposedWorkflow>(`/composer/workflows/${encodeURIComponent(id)}`),
  upsert: (input: Partial<ComposedWorkflow> & { name: string; nodes: ComposedWorkflow["nodes"]; edges: ComposedWorkflow["edges"] }) =>
    api<ComposedWorkflow>("/composer/workflows", { method: "POST", json: input }),
  validate: (id: string) => api<ComposerValidationResult>(`/composer/workflows/${encodeURIComponent(id)}/validate`),
  deploy: (id: string) => api<ComposedWorkflow>(`/composer/workflows/${encodeURIComponent(id)}/deploy`, { method: "POST" }),
  run: (id: string) => api<ComposerRunLog>(`/composer/workflows/${encodeURIComponent(id)}/run`, { method: "POST", json: {} }),
  runs: () => api<ComposerRunLog[]>("/composer/runs"),
  library: () => api<ComposerLibraryEntry[]>("/composer/library"),
};
