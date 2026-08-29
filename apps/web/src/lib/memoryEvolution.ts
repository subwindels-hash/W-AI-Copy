/** Session 47 — Enterprise Memory Evolution Engine. */
import { api } from "./api";
import type { MeConsolidationJob, MeDashboard, MeMemory, MeMemoryType } from "@windels/shared";
export type { MeConsolidationJob, MeDashboard, MeMemory, MeMemoryType } from "@windels/shared";

export const meApi = {
  dashboard: () => api<MeDashboard>("/memory-evolution/dashboard/rollup"),
  recall: (filter?: { type?: MeMemoryType; scope?: string; query?: string; limit?: number }) =>
    api<MeMemory[]>("/memory-evolution/memories", { params: filter as any }),
  add: (input: { type: MeMemoryType; content: string; tags?: string[]; scope?: string; confidence?: number }) =>
    api<MeMemory>("/memory-evolution/memories", { method: "POST", json: input }),
  consolidate: (kind: MeConsolidationJob["kind"] = "merge") =>
    api<MeConsolidationJob>("/memory-evolution/consolidate", { method: "POST", json: { kind } }),
  consolidations: () => api<MeConsolidationJob[]>("/memory-evolution/consolidations"),
  share: (memoryId: string, agentId: string) =>
    api<{ ok: true; sharedWith: string }>(`/memory-evolution/memories/${memoryId}/share`, { method: "POST", json: { agentId } }),
};
