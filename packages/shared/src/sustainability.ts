/**
 * Session 64 — Enterprise Sustainability & ESG Intelligence (completed by
 * Session 121).
 *
 * Carbon, ESG reporting, energy, water, waste, supply chain, green AI
 * monitoring. Session 121's honesty rules, now encoded in the types:
 *
 *   - an ESG score requires an attested assessment; nothing in this module
 *     attests one, so every score field is `null` with a `note` saying so —
 *     Session 64's `92 - ytd * 2.5` formula (and the hard-coded social 85 /
 *     governance 88) were invented ratings presented as data-derived;
 *   - a year-on-year change needs a same-period baseline: `changePct` /
 *     `emissionsYtdChangePct` are `null` when the prior period has no
 *     recorded emissions, never `0` (0 reads as "no change");
 *   - unmeasured quantities are `null` (`gpuHours`, `optimizedPct`), never 0;
 *   - the rollup's structural zeros (renewables share, water, waste, offsets,
 *     net-zero target) stay for contract compatibility but are named by the
 *     `provenance` block field by field.
 */

import { z } from "zod";

export interface EsgScore {
  /** 0..100 — `null` until an attested assessment exists. */
  environmental: number | null;
  social: number | null;
  governance: number | null;
  overall: number | null;
  /** Direction of the overall score; `null` when there is no baseline. */
  trend: "up" | "down" | "flat" | null;
  /** Why the scores are what they are. Never empty on a live payload. */
  note: string;
}

export interface EmissionsSource {
  id: string;
  category: "scope1" | "scope2" | "scope3";
  source: string;
  tCO2e: number;
  /** Same-period (YTD vs YTD) change; `null` without a prior-period baseline. */
  changePct: number | null;
}

export interface EnergyMetric {
  period: string;     // YYYY-MM
  kwh: number;
  /** Session 168 — `null`, not 0: a utility feed is not connected. */
  renewablePct: number | null;
  /** Session 168 — `null`, not 0: cost requires a utility feed. */
  costUsd: number | null;
  pue?: number;
}

export interface ResourceMetric {
  label: string;
  waterML: number;      // megaliters
  wasteT: number;       // tonnes
  recycledPct: number;
}

export interface SupplyChainSupplier {
  id: string;
  name: string;
  esgScore: number;
  riskLevel: "low" | "medium" | "high";
  carbonIntensity: number; // kgCO2e/$
}

export interface GreenAiMetric {
  workload: string;
  /** Structural zero — GPU-hour metering is not recorded; see provenance. */
  gpuHours: number | null;
  /** Sum of kWh readings on *compute* records only (Session 121 fix). */
  kwh: number;
  co2eKg: number;
  /** Structural zero — optimisation reporting is not recorded. */
  optimizedPct: number | null;
}

export interface SustainabilityDashboard {
  scores: EsgScore;
  emissionsTotalTCO2e: number;
  /** Same-period YTD change; `null` without a prior-period baseline. */
  emissionsYtdChangePct: number | null;
  /** Session 168 — `null`, not 0: no utility/renewables feed is connected.
   *  A 0 here rendered as "0% renewable", which is a measurement claim. */
  energyRenewablePct: number | null;
  /** Session 168 — `null`, not 0: no water metering is recorded. */
  waterMl: number | null;
  /** Session 168 — `null`, not 0: no waste tracking is recorded. */
  wasteRecycledPct: number | null;
  /** Session 168 — `null`, not 0: no offset purchases are recorded. */
  offsetsPurchasedT: number | null;
  /** Session 168 — `null`, not 0: 0 was a claim that the target year is 0 CE. */
  netZeroTargetYear: number | null;
  emissionsBySource: EmissionsSource[];
  energySeries: EnergyMetric[]; // last 12 months
  resources: ResourceMetric[];
  suppliers: SupplyChainSupplier[];
  greenAi: GreenAiMetric[];
  reportingFrameworks: Array<{ name: string; lastReportedAt: string; status: "on_track" | "at_risk" | "overdue" }>;
  /** Session 121 — states, field by field, which numbers are measured and
   *  which are structural zeros from missing feeds/attestations. Optional so
   *  every existing consumer of this shape keeps compiling unchanged. */
  provenance?: EsgProvenance;
}

/* ═════════════════════════════════════════════════════════════════════════
 * Session 121 — provenance
 * ═════════════════════════════════════════════════════════════════════════ */

export const ESG_PROVENANCE_BASES = ["measured", "structural_zero", "not_assessed"] as const;
export type EsgProvenanceBasis = (typeof ESG_PROVENANCE_BASES)[number];

export interface EsgProvenanceEntry {
  field: string;
  basis: EsgProvenanceBasis;
  detail: string;
}

export interface EsgProvenance {
  entries: EsgProvenanceEntry[];
  note: string;
}

export const ESG_PROVENANCE_NOTE =
  "emissionsTotalTCO2e, emissionsYtdChangePct, emissionsBySource, energySeries.kwh and " +
  "greenAi are arithmetic over recorded activity records. Every other rollup number is a " +
  "structural zero: the feed or attestation that would measure it is not connected, so " +
  "nothing is reported as if it were a measurement.";

/* ── Activity records ───────────────────────────────────────────────────── */

export const SUSTAINABILITY_CATEGORIES = ["scope1", "scope2", "scope3", "compute"] as const;
export type SustainabilityCategory = (typeof SUSTAINABILITY_CATEGORIES)[number];

export interface EsgRecordRow {
  id: string;
  category: SustainabilityCategory;
  activity: string;
  quantity: number;
  unit: string;
  /** kg CO2e per unit — disclosed by the caller, never inferred. */
  emissionFactorKg: number;
  tCO2e: number;
  occurredAt: string;
  source: string;
  /** Optional energy reading so the series reflects real consumption. */
  kwh?: number;
  recordedAt: string;
}

export const SUSTAINABILITY_MAX_RECORDS = 10000;
export const SUSTAINABILITY_MAX_LIST_LIMIT = 1000;

/** The POST /activity body (moved from the route file into the shared
 *  contract so the API and the web client share one definition). */
export const SustainabilityActivitySchema = z.object({
  category: z.enum(SUSTAINABILITY_CATEGORIES),
  activity: z.string().trim().min(1).max(200),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1).max(32),
  emissionFactorKg: z.number().min(0),
  occurredAt: z.string().datetime(),
  source: z.string().trim().min(1).max(300),
  /** Optional energy reading so the 12-month series reflects real consumption. */
  kwh: z.number().min(0).optional(),
});
export type SustainabilityActivityInput = z.infer<typeof SustainabilityActivitySchema>;

export const SustainabilityRecordIdSchema = z.object({ id: z.string().min(1).max(64) });

export const SustainabilityListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(SUSTAINABILITY_MAX_LIST_LIMIT).optional(),
});
