/** Session 60 — Training & Fine-Tuning client */
import { api } from "./api";
import type { TrainingDashboard, TrainingDataset, TrainingJob, TuningStrategy, DatasetFormat } from "@windels/shared";
export type { TrainingDashboard, TrainingDataset, TrainingJob, TuningStrategy, DatasetFormat } from "@windels/shared";

export const trainingApi = {
  dashboard: () => api<TrainingDashboard>("/training/dashboard/rollup"),
  listDatasets: () => api<TrainingDataset[]>("/training/datasets"),
  createDataset: (input: { name: string; format: DatasetFormat; rows?: number; sizeBytes?: number; syntheticPct?: number; cleaned?: boolean; ragbuilderIncluded?: boolean }) =>
    api<TrainingDataset>("/training/datasets", { method: "POST", json: input }),
  listJobs: () => api<TrainingJob[]>("/training/jobs"),
  startJob: (input: { name: string; baseModel: string; datasetId: string; strategy: TuningStrategy; hyperparams: TrainingJob["hyperparams"] }) =>
    api<TrainingJob>("/training/jobs", { method: "POST", json: input }),
  promoteCanary: (id: string, pct: number) => api<TrainingJob>(`/training/jobs/${id}/canary`, { method: "POST", json: { pct } }),
  rollback: (id: string) => api<TrainingJob>(`/training/jobs/${id}/rollback`, { method: "POST" }),
};
