/**
 * Session 55 — Usage Intelligence client (Session 123 completion).
 *
 * The `dashboard()` method is unchanged; Session 123 adds the event ledger
 * methods and re-exports the widened shared contract, whose deltas/trends are
 * `null` without a prior-period baseline, whose rates are `null` on empty
 * denominators (no AI requests is not a 0 % error rate), and whose per-module
 * p95 latency / error rate are measured from real request rows.
 */
import { api } from "./api";
import type {
  UsageDashboard,
  UsageEventInput,
  UsageLedgerSummary,
  UsageProvenance,
} from "@windels/shared/usage";

export type {
  UsageDashboard,
  UsageEventInput,
  UsageLedgerSummary,
  UsageProvenance,
} from "@windels/shared/usage";

export interface UsageEventRow {
  id: string;
  createdAt: string;
  feature: string;
  actor: string;
  quantity: number;
  unit: string;
  meta?: Record<string, unknown>;
}

export interface UsageRollupResponse extends UsageDashboard {
  ledger: UsageLedgerSummary;
}

export const usageApi = {
  dashboard: () => api<UsageRollupResponse>("/usage-intel/dashboard/rollup"),
  recordEvent: (input: UsageEventInput) =>
    api<UsageEventRow>("/usage-intel/events", { method: "POST", json: input }),
  events: (limit: number = 100) =>
    api<UsageEventRow[]>("/usage-intel/events", { params: { limit } }),
  event: (id: string) => api<UsageEventRow>(`/usage-intel/events/${id}`),
  removeEvent: (id: string) =>
    api<{ id: string; deleted: true }>(`/usage-intel/events/${id}`, { method: "DELETE" }),
};
