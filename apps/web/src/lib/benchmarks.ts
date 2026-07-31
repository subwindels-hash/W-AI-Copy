import { api } from "./api";
import type { BmDashboard, BmRun, BmScheduled } from "@windels/shared";
export type { BmDashboard, BmRun, BmScheduled, BmArea } from "@windels/shared";

export const benchmarksApi = {
  dashboard: () => api<BmDashboard>("/benchmarks/dashboard/rollup"),
  runs: () => api<BmRun[]>("/benchmarks/runs"),
  run: (input: { area: BmRun["area"]; targetId?: string; notes?: string }) =>
    api<BmRun>("/benchmarks/run", { method: "POST", json: input }),
  schedule: (input: { area: BmRun["area"]; cron: string; enabled: boolean; targetId?: string }) =>
    api<BmScheduled>("/benchmarks/schedule", { method: "POST", json: input }),
};
