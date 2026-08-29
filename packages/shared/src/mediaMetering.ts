// Session 77.B item 22 — Media Factory usage metering and pre-execution cost estimates.
//
// Spec: "Billing/usage metering — AI tokens, GPU time, render time, voice
// minutes, image/video generation, storage, publishing, workflow executions —
// into existing Billing/Wallet, with cost estimate shown pre-execution."
//
// Nothing was metered before this: renders burned CPU and publishes consumed
// platform quota with no record and no warning. Two ideas are kept strictly
// apart here, because conflating them is how a projection becomes a bill:
//
//   * an ESTIMATE is computed from inputs before work starts. It is a
//     projection and is labelled as one.
//   * a USAGE RECORD is written after work finishes, from measured units
//     (actual wall-clock render milliseconds, actual output bytes, actual
//     token counts). It never contains a forecast.
//
// Rates are configuration, not truth. They default to zero so an operator who
// has not set them sees "not priced" rather than an invented currency figure.

import { z } from "zod";

/** The billable unit kinds Media Factory can measure today. */
export const MEDIA_USAGE_KINDS = [
  "render_ms",
  "output_bytes",
  "ai_tokens",
  "voice_seconds",
  "publish_job",
] as const;
export type MediaUsageKind = (typeof MEDIA_USAGE_KINDS)[number];

/** Human-readable unit labels, for dashboards that should not invent their own. */
export const MEDIA_USAGE_UNIT_LABEL: Record<MediaUsageKind, string> = {
  render_ms: "render milliseconds",
  output_bytes: "output bytes",
  ai_tokens: "AI tokens",
  voice_seconds: "voice seconds",
  publish_job: "publish jobs",
};

/**
 * Price per unit, in micros (1e-6 of the billing currency) to avoid float drift
 * on small per-unit amounts.
 *
 * Every rate defaults to 0. A zero rate means **not priced**, which the
 * estimator reports honestly instead of pretending the work is free.
 */
export interface MediaRateCard {
  renderMsMicros: number;
  outputByteMicros: number;
  aiTokenMicros: number;
  voiceSecondMicros: number;
  publishJobMicros: number;
}

export const ZERO_RATE_CARD: MediaRateCard = {
  renderMsMicros: 0,
  outputByteMicros: 0,
  aiTokenMicros: 0,
  voiceSecondMicros: 0,
  publishJobMicros: 0,
};

/** One measured usage record. Written only after the work completed. */
export interface MediaUsageRecord {
  id: string;
  organizationId: string;
  /** Which operation produced it, e.g. "render" or "publish". */
  operation: string;
  /** Job/render id this usage belongs to, for reconciliation. */
  refId?: string;
  kind: MediaUsageKind;
  /** Measured quantity in the kind's unit. Never a projection. */
  quantity: number;
  /** quantity x rate at the time of recording. Absent when the kind is unpriced. */
  costMicros?: number;
  /** True when no rate was configured, so cost is unknown rather than zero. */
  unpriced: boolean;
  at: string;
}

/** A single projected line of a pre-execution estimate. */
export interface MediaCostEstimateLine {
  kind: MediaUsageKind;
  /** Projected quantity. Derived from the request, not measured. */
  quantity: number;
  costMicros?: number;
  unpriced: boolean;
  /** How the quantity was projected, so a user can judge the projection. */
  basis: string;
}

/**
 * A pre-execution cost projection.
 *
 * `isEstimate` is always true and `confidence` is deliberately coarse. Render
 * time depends on machine load and codec behaviour, so anything more precise
 * than a band would overstate what this can know.
 */
export interface MediaCostEstimate {
  isEstimate: true;
  operation: string;
  lines: MediaCostEstimateLine[];
  totalCostMicros?: number;
  /** True when at least one line has no configured rate. */
  partiallyUnpriced: boolean;
  /** Set when NO line could be priced at all. */
  unpriced: boolean;
  confidence: "low" | "medium";
  notes: string[];
}

/** Rollup of measured usage over a window. Contains no projections. */
export interface MediaUsageSummary {
  organizationId: string;
  windowDays: number;
  totals: Array<{
    kind: MediaUsageKind;
    quantity: number;
    costMicros?: number;
    unpriced: boolean;
  }>;
  totalCostMicros?: number;
  /** True when some recorded usage had no rate, so the total understates spend. */
  partiallyUnpriced: boolean;
  recordCount: number;
}

export const EstimateRenderSchema = z.object({
  durationSec: z.number().int().min(1).max(120),
  aspect: z.enum(["16:9", "9:16", "1:1"]).optional(),
  scriptLength: z.number().int().min(0).max(200_000).optional(),
});
export type EstimateRenderInput = z.infer<typeof EstimateRenderSchema>;

export const EstimatePublishSchema = z.object({
  platforms: z.array(z.string().min(1)).min(1).max(10),
  mediaBytes: z.number().int().min(0).optional(),
});
export type EstimatePublishInput = z.infer<typeof EstimatePublishSchema>;
