import { api } from "./api";
import type { BmDashboard, BmRun, BmScheduled, BmMetric } from "@windels/shared";
export type { BmDashboard, BmRun, BmScheduled, BmArea, BmMetric } from "@windels/shared";

export interface RecordBenchmarkInput {
  area: BmRun["area"];
  targetId?: string;
  targetName?: string;
  notes?: string;
  metrics: BmMetric[];
  overallScore: number;
  passed: boolean;
  evaluator: string;
  evidence: string;
}

export const benchmarksApi = {
  dashboard: () => api<BmDashboard>("/benchmarks/dashboard/rollup"),
  runs: () => api<BmRun[]>("/benchmarks/runs"),
  record: (input: RecordBenchmarkInput) =>
    api<BmRun>("/benchmarks/run", { method: "POST", json: input }),
  schedule: (input: { area: BmRun["area"]; cron: string; enabled: boolean; targetId?: string }) =>
    api<BmScheduled>("/benchmarks/schedule", { method: "POST", json: input }),
};
