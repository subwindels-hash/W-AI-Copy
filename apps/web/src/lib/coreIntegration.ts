/** Session 45 — Core Enterprise Integration (checkpoint). */
import { api } from "./api";
import type { CeilCheckpointReport } from "@windels/shared";
export type { CeilCheckpointReport } from "@windels/shared";

export const ceiApi = {
  checkpoint: () => api<CeilCheckpointReport>("/core-integration/checkpoint"),
};
