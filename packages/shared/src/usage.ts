/**
 * Session 55 — Enterprise Usage Intelligence (V8.4 §10, completed by
 * Session 123).
 *
 * Executive-level visibility: usage, utilization, automation, savings, ROI.
 * Session 123's honesty rules, now encoded in the types:
 *
 *   - a percentage change without a prior-period baseline is `null`, never 0
 *     (0 reads as "no change");
 *   - a rate with an empty denominator is `null` — no AI requests is not a
 *     0 % error rate, and no workflow runs is not a 0 % automation rate;
 *   - an average latency that was never measured is `null`, never 0 ms
 *     (0 ms reads as "perfectly fast");
 *   - per-module p95 latency and error rate are measured from real request
 *     rows, and `null` where a module has no requests;
 *   - the 30-day series carries real token counts, and empty days have
 *     `latencyMs: null`, not 0;
 *   - structural zeros (host resources, cost, savings, ROI, carbon) are
 *     named by the `provenance` block field by field.
 */

import { z } from "zod";

export interface UsageMetric {
  label: string;
  /** `null` when nothing was measured (e.g. no AI requests → latency). */
  value: number | null;
  unit: string;
  /** Same-window change vs the prior period; `null` without a baseline. */
  deltaPct: number | null;
  trend: "up" | "down" | "flat" | null;
}

export interface UsageByDepartment {
  department: string;
  requests: number;
  costUsd: number;
  automationRate: number; // 0..1
  productivityGainHours: number;
  savingsUsd: number;
  roiPct: number;
}

export interface UsageByModule {
  module: string;
  requests: number;
  /** Distinct users who produced requests in the window (Session 123). */
  users: number;
  /** Undefined until a cost source is wired; 0 would read as "free". */
  costUsd?: number;
  /** Measured 95th-percentile latency of the module's requests; `null`
   *  when the module has no requests in the window. */
  p95LatencyMs: number | null;
  /** Measured error rate (0–100) of the module's requests; `null` when the
   *  module has no requests in the window. */
  errorRate: number | null;
  /** Share of all AI requests in the window, 0-100. */
  sharePct?: number;
}

/** Per-model usage rollup, counted from AiRequest. */
export interface UsageByModel {
  modelId: string;
  requests: number;
  tokens: number;
}

export interface UsageTimeSeriesPoint {
  ts: string;
  requests: number;
  tokens: number;
  /** Undefined until a cost source exists. */
  costUsd?: number;
  /** Average latency of the day's requests; `null` on days with none
   *  (0 ms would read as "perfectly fast"). */
  latencyMs: number | null;
  /** No automation-task metering exists; `null`, never 0. */
  automationTasks: number | null;
}

export interface ResourceUtilization {
  cpuPct: number;
  memPct: number;
  gpuPct: number;
  storageGb: number;
  storageQuotaGb: number;
  networkMbps: number;
  carbonKgCO2e: number;
  costPerDayUsd: number;
}

/** The `ledger` block the rollup route attaches (most recent events). */
export interface UsageLedgerSummary {
  /** Number of events fetched (capped). */
  total: number;
  /** Aggregated quantity/count per feature over the fetched events. */
  byFeature: Record<string, { quantity: number; count: number }>;
  /** States what the numbers are (capped window, not the full ledger). */
  note: string;
}

export interface UsageDashboard {
  metrics: UsageMetric[];
  departments: UsageByDepartment[];
  modules: UsageByModule[];
  /** Top models by request volume over the window. */
  topModels: UsageByModel[];
  series: UsageTimeSeriesPoint[]; // last 30 points
  resources: ResourceUtilization;
  totalRequests30d: number;
  totalCost30dUsd: number;
  totalSavings30dUsd: number;
  /** `null` when no workflow runs were recorded in the window. */
  automationRate: number | null;
  productivityGainHours30d: number;
  roiPct: number;
  /** `null` when the organization has no members. */
  adoptionPct: number | null;
  carbonKgCO2e30d: number;
  /** Members who actually generated AI traffic in the window (not merely enrolled). */
  activeMembers30d: number;
  workflowsTotal: number;
  /** Session 123 — states, field by field, which numbers are measured and
   *  which are structural zeros from missing feeds. Optional so existing
   *  consumers keep compiling unchanged. */
  provenance?: UsageProvenance;
}

/* ═════════════════════════════════════════════════════════════════════════
 * Session 123 — provenance
 * ═════════════════════════════════════════════════════════════════════════ */

export const USAGE_PROVENANCE_BASES = ["measured", "structural_zero", "not_assessed"] as const;
export type UsageProvenanceBasis = (typeof USAGE_PROVENANCE_BASES)[number];

export interface UsageProvenanceEntry {
  field: string;
  basis: UsageProvenanceBasis;
  detail: string;
}

export interface UsageProvenance {
  entries: UsageProvenanceEntry[];
  note: string;
}

export const USAGE_PROVENANCE_NOTE =
  "metrics, modules, topModels, series, automationRate, adoptionPct and activeMembers30d are " +
  "counted from real records (AiRequest, conversations, talk messages, workflow runs, tasks, " +
  "memberships). resources, totalCost30dUsd, totalSavings30dUsd, productivityGainHours30d, " +
  "roiPct and carbonKgCO2e30d are structural zeros: no host telemetry or billing feed is " +
  "connected, so nothing is reported as if it were a measurement.";

/* ── Event ledger schemas (moved from the route file) ───────────────────── */

export const UsageEventSchema = z.object({
  feature: z.string().min(2).max(64),
  actor: z.string().min(2).max(120),
  quantity: z.number().nonnegative().max(1e9),
  unit: z.string().min(1).max(24),
  meta: z.record(z.any()).optional(),
});
export type UsageEventInput = z.infer<typeof UsageEventSchema>;

export const UsageEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});
