/** Session 73 — Operational Excellence & Responsible AI client */
import { api } from "./api";
import type { OpexDashboard } from "@windels/shared";
export type { OpexDashboard } from "@windels/shared";
export const opexApi = {
  dashboard: () => api<OpexDashboard>("/opex/dashboard/rollup"),
};

/**
 * Session 118 — operational-excellence assurance client.
 *
 * `opexApi` above is unchanged. This adds typed access to the assurance
 * surface, whose defining difference from the Session 73 rollup is that its
 * measures can say `null`: a dimension nobody has assessed is not a zero.
 */
import type {
  OpexAlertPage,
  OpexAlertRecord,
  OpexAssessment,
  OpexAssessedDimension,
  OpexAssessmentRegister,
  OpexAssuranceSummary,
  OpexBreachReport,
  OpexConfigurationReport,
  OpexEventPage,
  OpexFailureBreakdown,
  OpexGapReport,
  OpexPolicy,
  OpexPolicyUpdateInput,
  OpexProvenance,
  OpexRegisterSummary,
  OpexReliability,
  OpexTimings,
  OpexTransition,
  OpexTrustReport,
} from "@windels/shared/opex";

export type {
  OpexAlertPage,
  OpexAlertRecord,
  OpexAssessment,
  OpexAssessedDimension,
  OpexAssessmentRegister,
  OpexAssuranceSummary,
  OpexBreachReport,
  OpexConfigurationReport,
  OpexEventPage,
  OpexFailureBreakdown,
  OpexGapReport,
  OpexPolicy,
  OpexProvenance,
  OpexRegisterSummary,
  OpexReliability,
  OpexTimings,
  OpexTrustReport,
} from "@windels/shared/opex";

export {
  OPEX_ASSESSED_DIMENSIONS,
  OPEX_ALERT_STATUSES,
  OPEX_SEVERITIES,
  OPEX_UNIMPLEMENTED_SECTIONS,
  opexDimensionDirection,
} from "@windels/shared/opex";

const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

export const opexAssuranceApi = {
  /* Register */
  listAlerts: (q: { status?: string; severity?: string; category?: string; limit?: number } = {}) =>
    api<OpexAlertPage>(`/opex/register/alerts${qs(q)}`),
  registerSummary: () => api<OpexRegisterSummary>("/opex/register/summary"),
  timings: () => api<OpexTimings>("/opex/register/timings"),
  breaches: () => api<OpexBreachReport>("/opex/register/breaches"),
  getAlert: (alertId: string) =>
    api<OpexAlertRecord>(`/opex/register/alerts/${encodeURIComponent(alertId)}`),
  history: (alertId: string) =>
    api<{
      alertId: string;
      transitions: OpexTransition[];
      reopenCount: number;
      importedFromLegacyRegister: boolean;
      note: string;
    }>(`/opex/register/alerts/${encodeURIComponent(alertId)}/history`),
  reopen: (alertId: string, reason: string) =>
    api<OpexAlertRecord>(`/opex/register/alerts/${encodeURIComponent(alertId)}/reopen`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  /* Reliability */
  reliability: (windowDays?: number) =>
    api<OpexReliability>(`/opex/reliability${qs({ windowDays })}`),
  failures: (windowDays?: number) =>
    api<OpexFailureBreakdown>(`/opex/reliability/failures${qs({ windowDays })}`),

  /* Assessments and trust */
  assessments: () => api<OpexAssessmentRegister>("/opex/assessments"),
  recordAssessment: (
    dimension: OpexAssessedDimension,
    body: { score: number; method: string; note?: string },
  ) =>
    api<OpexAssessment>(`/opex/assessments/${dimension}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  clearAssessment: (dimension: OpexAssessedDimension) =>
    api<{ dimension: OpexAssessedDimension; cleared: boolean; note: string }>(
      `/opex/assessments/${dimension}`,
      { method: "DELETE" },
    ),
  trust: () => api<OpexTrustReport>("/opex/trust"),

  /* Policy */
  policy: () => api<OpexPolicy>("/opex/policy"),
  updatePolicy: (body: OpexPolicyUpdateInput) =>
    api<OpexPolicy>("/opex/policy", { method: "PUT", body: JSON.stringify(body) }),

  /* Assurance */
  summary: () => api<OpexAssuranceSummary>("/opex/assurance/summary"),
  configuration: () => api<OpexConfigurationReport>("/opex/assurance/configuration"),
  gaps: () => api<OpexGapReport>("/opex/assurance/gaps"),
  provenance: () => api<OpexProvenance>("/opex/assurance/provenance"),

  /* Ledger */
  events: (q: { kind?: string; alertId?: string; limit?: number } = {}) =>
    api<OpexEventPage>(`/opex/events${qs(q)}`),
};

/** Rendering a measure: null must never be printed as 0. */
export function formatOpexMeasure(
  value: number | null,
  unit: "percent" | "hours" | "count" | "milliseconds",
): string {
  if (value === null) return "not assessed";
  if (unit === "percent") return `${value}%`;
  if (unit === "hours") return `${value} h`;
  if (unit === "milliseconds") return `${value} ms`;
  return String(value);
}

export const OPEX_BASIS_LABELS: Record<string, string> = {
  observed: "Observed",
  operator_assessed: "Operator assessed",
  not_assessed: "Not assessed",
};

export const OPEX_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};
