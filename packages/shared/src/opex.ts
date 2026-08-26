/** Session 73 — Operational Excellence & Responsible AI (V9.2)
 * Safety & assurance, regulatory intelligence, human+AI collaboration,
 * operational playbooks, explainability, trust analytics, governance orchestration,
 * continuous operational excellence. Extends Session 56.3 Trust Center (no fork).
 */

export const SAFETY_CATEGORIES = [
  "alignment","jailbreak","prompt_injection","hallucination","bias","drift",
  "toxicity","pii","harm","fairness","adv_example","autonomous_safety",
] as const;
export type SafetyCategory = typeof SAFETY_CATEGORIES[number];

/** A recorded safety finding in the org-scoped safety register.
 *  `category` is free-form: operators file findings that do not always map onto
 *  SAFETY_CATEGORIES. Lifecycle is open -> acknowledged -> resolved, and every
 *  transition records the administrator who made it. */
export interface SafetyAlert {
  id: string; category: string; severity: "info"|"warning"|"critical";
  source: string; message: string; model?: string; at: string;
  status: "open"|"acknowledged"|"resolved";
  acknowledgedBy?: string; resolvedBy?: string; note?: string;
}

export interface Regulation {
  id: string; name: string; jurisdiction: string; category: "privacy"|"security"|"finance"|"health"|"ai_act"|"environmental"|"tax"|"cyber"|"procurement";
  effectiveDate?: string; status: "proposed"|"enacted"|"enforcing"|"updated";
  summary: string; impactAreas: string[]; gapCount: number; gapResolved: number;
}

export interface Playbook {
  id: string; name: string; category: "cyber"|"dr"|"procurement"|"escalation"|"hr"|"construction"|"manufacturing"|"healthcare"|"legal"|"finance"|"sales"|"marketing"|"gov"|"emergency"|"ops";
  version: string; steps: number; simulations: number; status: "draft"|"approved"|"active"|"retired";
  lastRun?: string; compliance: "verified"|"gaps"|"unknown";
}

export interface Explanation {
  id: string; decisionId: string; decisionSummary: string;
  confidence: number; evidenceCount: number; knowledgeSources: string[];
  memoryTouches: number; toolCalls: number; policyChecks: string[];
  risks: string[]; humanApprover?: string;
}

export interface TrustScores {
  trust: number; alignment: number; safety: number; compliance: number;
  transparency: number; explainability: number; reliability: number;
  hallucinationRisk: number; evidenceQuality: number; dataFreshnessHours: number;
  humanApprovalRate: number; operationalStability: number;
}

export interface GovernanceGate {
  id: string; name: string; level: "l1_auto"|"l2_manager"|"l3_director"|"l4_exec"|"l5_board";
  pending: number; approved24h: number; rejected24h: number; avgDecisionMin: number;
}

export interface OpexKpi { label: string; value: number; target: number; unit?: string; trend: "up"|"down"|"flat"; }

export interface OpexDashboard {
  trust: TrustScores;
  /** `benchmarks` is partial: only categories that have actually been evaluated
   *  appear. An unevaluated category is absent rather than reported as passing. */
  safety: { passRate: number; alertsOpen: number; alertsCritical: number; mitigations24h: number; auditsCompleted: number; benchmarks: Partial<Record<SafetyCategory, { pass: boolean; score: number }>>; };
  regulations: { tracked: number; changed30d: number; openGaps: number; upcoming: number; };
  playbooks: { total: number; active: number; simulating: number; avgCompliancePct: number; };
  explanations: { available24h: number; avgEvidence: number; avgConfidence: number; challenged: number; challengedUpheld: number; };
  governance: { gates: GovernanceGate[]; pendingTotal: number; emergencyShutdowns: number; overrides24h: number; };
  continuous: { kpis: OpexKpi[]; bottlenecks: Array<{ area: string; impact: "low"|"med"|"high"; recommendation: string }>; maturityScore: number; };
  recentAlerts: SafetyAlert[];
  recentRegulations: Regulation[];
  recentExplanations: Explanation[];
  collaborationSessionsActive: number;
  decisionsRequiringHuman: number;
  /** Session 118 addendum — states which numbers above are measured and which
   *  are structural zeros from a section nothing implements. Optional so every
   *  existing consumer of this shape keeps compiling unchanged. */
  provenance?: OpexProvenance;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Session 118 — Operational Excellence assurance
 *
 * Session 73 shipped a dashboard whose unmeasured dimensions were reported as
 * the number `0`. On a 0–100 scale `0` is a score, not an absence: the console
 * rendered "Alignment 0%" for a platform nobody had ever assessed, and
 * "Hallucination Risk 0%" — which for a *risk* metric reads as the best
 * possible result. This section replaces that with a measure type that can say
 * `null`, carries the basis it was obtained on, and states which direction is
 * good.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { z } from "zod";

/* ── Measures ──────────────────────────────────────────────────────────── */

export const OPEX_BASES = ["observed", "operator_assessed", "not_assessed"] as const;
export type OpexBasis = (typeof OPEX_BASES)[number];

export const OPEX_UNITS = ["percent", "hours", "count", "milliseconds"] as const;
export type OpexUnit = (typeof OPEX_UNITS)[number];

/**
 * One reported number, or an explicit absence.
 *
 * `value: null` means nothing has been measured. It is never replaced by `0`,
 * because a consumer cannot tell a real zero from a missing one, and for
 * `lower_is_better` dimensions a missing zero reads as a perfect result.
 */
export interface OpexMeasure {
  key: string;
  label: string;
  value: number | null;
  unit: OpexUnit;
  basis: OpexBasis;
  /** `higher_is_better` for a score, `lower_is_better` for a risk or a latency. */
  direction: "higher_is_better" | "lower_is_better";
  /** How many underlying records produced the value. 0 whenever value is null. */
  sampleSize: number;
  /** When the value was observed or the assessment was recorded. */
  asOf: string | null;
  /** True when an operator assessment exists but has passed its validity window. */
  stale: boolean;
  detail: string;
}

/* ── Safety register ───────────────────────────────────────────────────── */

export const OPEX_SEVERITIES = ["info", "warning", "critical"] as const;
export type OpexSeverity = (typeof OPEX_SEVERITIES)[number];

export const OPEX_ALERT_STATUSES = ["open", "acknowledged", "resolved"] as const;
export type OpexAlertStatus = (typeof OPEX_ALERT_STATUSES)[number];

/** One recorded status change. Append-only: a transition is never edited. */
export interface OpexTransition {
  at: string;
  from: OpexAlertStatus | null;
  to: OpexAlertStatus;
  actorId: string;
  reason: string | null;
}

/**
 * A safety finding in the durable register.
 *
 * Session 73 stored the whole register as one JSON array in one Redis string
 * and recorded only `at` (the filing time) plus a single `acknowledgedBy` /
 * `resolvedBy` field overwritten in place. There was no resolution timestamp at
 * all, so "mitigations in the last 24 hours" was computed from the *filing*
 * time — an alert filed three days ago and resolved a minute ago did not count,
 * and one filed two hours ago and resolved ninety minutes ago did.
 */
export interface OpexAlertRecord {
  id: string;
  organizationId: string;
  category: string;
  severity: OpexSeverity;
  source: string;
  message: string;
  model: string | null;
  status: OpexAlertStatus;
  /** Filing time. Equal to the Session 73 record's `at`. */
  filedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  reopenedAt: string | null;
  reopenCount: number;
  updatedAt: string;
  note: string | null;
  /**
   * True for a record adopted from the Session 73 blob, where acknowledgement
   * and resolution times were never written. Such a record is excluded from
   * every timing statistic rather than being given an invented timestamp.
   */
  importedFromLegacyRegister: boolean;
  transitions: OpexTransition[];
}

export interface OpexAlertPage {
  alerts: OpexAlertRecord[];
  total: number;
  returned: number;
  truncated: boolean;
  note: string;
}

export interface OpexAgeing {
  under24h: number;
  under7d: number;
  under30d: number;
  over30d: number;
}

export interface OpexRegisterSummary {
  total: number;
  byStatus: Record<OpexAlertStatus, number>;
  bySeverity: Record<OpexSeverity, number>;
  byCategory: Array<{ category: string; total: number; open: number }>;
  open: number;
  openCritical: number;
  oldestOpenAt: string | null;
  oldestOpenAgeHours: number | null;
  ageing: OpexAgeing;
  /** Share of filed findings that have been closed. Null when nothing is filed. */
  closureRatePercent: number | null;
  resolvedLast24h: number;
  /** Resolved records carrying no resolution time; excluded from resolvedLast24h. */
  resolvedTimeUnknown: number;
  imported: number;
  retentionLimit: number;
  truncated: boolean;
  note: string;
  closureNote: string;
}

export interface OpexStat {
  median: number | null;
  p90: number | null;
  sampleSize: number;
  /** Records that could not contribute, with the reason stated. */
  excluded: number;
  excludedReason: string;
}

export interface OpexTimings {
  timeToAcknowledgeHours: OpexStat;
  timeToResolveHours: OpexStat;
  note: string;
}

/* ── Reliability, derived from recorded AI traffic ─────────────────────── */

export interface OpexReliability {
  windowDays: number;
  total: number;
  succeeded: number;
  failed: number;
  /**
   * Floored, never rounded. 999 successes out of 1 000 reports 99, not 100:
   * a metric that rounds a failure away cannot be used to notice one.
   */
  successRatePercent: number | null;
  latency: { p50Ms: number | null; p95Ms: number | null; sampleSize: number; sampled: boolean };
  /** Null when no request has ever been recorded — not 0, which reads as "fresh". */
  dataFreshnessHours: number | null;
  lastRequestAt: string | null;
  note: string;
  freshnessNote: string;
}

export interface OpexFailureGroup {
  key: string;
  total: number;
  failed: number;
  failureRatePercent: number | null;
}

export interface OpexFailureBreakdown {
  windowDays: number;
  sampleSize: number;
  sampled: boolean;
  byProvider: OpexFailureGroup[];
  byModel: OpexFailureGroup[];
  byChannel: OpexFailureGroup[];
  note: string;
}

/* ── Operator assessments ──────────────────────────────────────────────── */

/**
 * Dimensions that no signal in this platform can observe. They report `null`
 * until somebody records an assessment and says how it was performed.
 */
export const OPEX_ASSESSED_DIMENSIONS = [
  "alignment",
  "compliance",
  "transparency",
  "explainability",
  "evidence_quality",
  "hallucination_risk",
  "safety",
] as const;
export type OpexAssessedDimension = (typeof OPEX_ASSESSED_DIMENSIONS)[number];

/** Risk dimensions where a lower score is the better result. */
export const OPEX_RISK_DIMENSIONS: readonly OpexAssessedDimension[] = ["hallucination_risk"];

export interface OpexAssessment {
  dimension: OpexAssessedDimension;
  score: number;
  /** How the score was arrived at. Required, because a score without a method is an opinion. */
  method: string;
  assessedBy: string;
  assessedAt: string;
  /** Null when the policy sets no validity window. */
  expiresAt: string | null;
  stale: boolean;
  note: string | null;
}

export interface OpexAssessmentRegister {
  assessments: OpexAssessment[];
  assessed: number;
  stale: number;
  notAssessed: OpexAssessedDimension[];
  validityDays: number | null;
  note: string;
}

export interface OpexTrustReport {
  organizationId: string;
  generatedAt: string;
  measures: OpexMeasure[];
  observed: number;
  assessed: number;
  notAssessed: number;
  /**
   * Deliberately absent: this module does not publish a single composite trust
   * number. Averaging observed traffic statistics with unassessed dimensions
   * produces a figure whose movement cannot be attributed to anything.
   */
  compositeScore: null;
  compositeNote: string;
  note: string;
}

/* ── Policy ────────────────────────────────────────────────────────────── */

export interface OpexPolicy {
  organizationId: string;
  reliabilityWindowDays: number;
  registerRetention: number;
  /** Expectation for acknowledging a critical finding. Advisory: nothing is blocked. */
  criticalAckHours: number;
  criticalResolveHours: number;
  /** Null disables assessment expiry entirely. */
  assessmentValidityDays: number | null;
  requireReopenReason: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  isDefault: boolean;
  note: string;
}

export interface OpexPolicyUpdateInput {
  reliabilityWindowDays?: number;
  registerRetention?: number;
  criticalAckHours?: number;
  criticalResolveHours?: number;
  assessmentValidityDays?: number | null;
  requireReopenReason?: boolean;
}

/* ── Breaches, configuration and gaps ──────────────────────────────────── */

export interface OpexBreach {
  alertId: string;
  severity: OpexSeverity;
  kind: "acknowledgement_overdue" | "resolution_overdue";
  ageHours: number;
  expectationHours: number;
  filedAt: string;
  message: string;
}

export interface OpexBreachReport {
  breaches: OpexBreach[];
  counts: { acknowledgement_overdue: number; resolution_overdue: number };
  /** Records excluded because their transition times were never recorded. */
  excludedImported: number;
  note: string;
}

export type OpexCheckState = "pass" | "warn" | "fail";

export interface OpexConfigurationCheck {
  key: string;
  label: string;
  state: OpexCheckState;
  detail: string;
}

export interface OpexConfigurationReport {
  checks: OpexConfigurationCheck[];
  /** Derived from the checks. A warning is never rounded up to a pass. */
  ready: boolean;
  /** Contract sections declared in Session 73 that nothing implements. */
  unimplementedSections: string[];
  generatedAt: string;
  note: string;
}

export interface OpexGap {
  key: string;
  severity: "low" | "medium" | "high";
  detail: string;
}

export interface OpexGapReport {
  gaps: OpexGap[];
  counts: { high: number; medium: number; low: number };
  note: string;
}

/* ── Provenance addendum for the Session 73 dashboard ──────────────────── */

export interface OpexProvenanceEntry {
  field: string;
  basis: OpexBasis;
  detail: string;
}

/**
 * Attached to the Session 73 rollup so a consumer can tell which of its numbers
 * are measured and which are structural zeros from an unimplemented section.
 */
export interface OpexProvenance {
  entries: OpexProvenanceEntry[];
  observedFields: number;
  structuralZeroFields: number;
  note: string;
}

/* ── Ledger ────────────────────────────────────────────────────────────── */

export const OPEX_EVENT_KINDS = [
  "alert_filed",
  "alert_acknowledged",
  "alert_resolved",
  "alert_reopened",
  "alert_trimmed",
  "legacy_register_imported",
  "assessment_recorded",
  "assessment_cleared",
  "policy_updated",
] as const;
export type OpexEventKind = (typeof OPEX_EVENT_KINDS)[number];

export interface OpexEvent {
  id: string;
  at: string;
  kind: OpexEventKind;
  organizationId: string;
  actorId: string | null;
  alertId: string | null;
  detail: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface OpexEventPage {
  events: OpexEvent[];
  stored: number;
  retentionLimit: number;
  oldestAt: string | null;
  note: string;
}

export interface OpexAssuranceSummary {
  organizationId: string;
  generatedAt: string;
  register: OpexRegisterSummary;
  reliability: OpexReliability;
  trust: OpexTrustReport;
  breaches: OpexBreachReport;
  note: string;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

export const OPEX_MAX_ALERTS = 2000;
export const OPEX_MAX_ALERT_PAGE = 200;
export const OPEX_EVENT_LIMIT = 500;
export const OPEX_MAX_LATENCY_SAMPLE = 2000;
export const OPEX_DEFAULT_RELIABILITY_WINDOW_DAYS = 30;
export const OPEX_MAX_RELIABILITY_WINDOW_DAYS = 365;
export const OPEX_DEFAULT_CRITICAL_ACK_HOURS = 4;
export const OPEX_DEFAULT_CRITICAL_RESOLVE_HOURS = 72;
export const OPEX_DEFAULT_ASSESSMENT_VALIDITY_DAYS = 180;
export const OPEX_MIN_ASSESSMENT_METHOD_LENGTH = 10;
export const OPEX_MIN_REOPEN_REASON_LENGTH = 10;

/** Sections the Session 73 contract declares that nothing in this deployment implements. */
export const OPEX_UNIMPLEMENTED_SECTIONS = [
  "playbooks",
  "explanations",
  "safety.benchmarks",
  "continuous.maturityScore",
] as const;

/* ── Notes that ship inside payloads ───────────────────────────────────── */

export const OPEX_MEASURE_NOTE =
  "A measure with value null has not been taken. It is never reported as 0: on a 0-100 scale zero is a score, and for a risk dimension a missing zero reads as the best possible result.";

export const OPEX_CLOSURE_NOTE =
  "The closure rate is the share of filed findings that have been closed. It is not a safety assessment: an organization that files one trivial finding and closes it reaches 100%, and one that has never filed anything has no rate at all.";

export const OPEX_REGISTER_NOTE =
  "The register holds findings this organization filed. It does not discover them. An empty register means nothing was filed, which is not evidence that nothing happened.";

export const OPEX_IMPORT_NOTE =
  "Records adopted from the Session 73 register carry no acknowledgement or resolution time, because none was ever recorded. They are excluded from every timing statistic rather than being given an invented timestamp.";

export const OPEX_RELIABILITY_NOTE =
  "Reliability is the observed success rate of AI requests this deployment recorded in the window. The percentage is floored, never rounded: a metric that rounds a failure away cannot be used to notice one. With no recorded requests the rate is null, because no evidence of reliability is not evidence of reliability.";

export const OPEX_FRESHNESS_NOTE =
  "Data freshness is the age of the most recent recorded AI request. It is null when none has ever been recorded, rather than 0, which would read as perfectly fresh.";

export const OPEX_ASSESSMENT_NOTE =
  "An assessed dimension reports the score an operator recorded, together with who recorded it, how, and when. It is this platform reporting a human judgement, not the platform evaluating itself.";

export const OPEX_COMPOSITE_NOTE =
  "This module publishes no single composite trust score. Averaging observed traffic statistics against unassessed dimensions produces a number whose movement cannot be attributed to anything, and whose stability depends on how many dimensions are missing.";

export const OPEX_BREACH_NOTE =
  "A breach is a finding that has been open longer than this organization's own stated expectation. The expectation is advisory: nothing in this API refuses a request or escalates on its own.";

export const OPEX_CONFIG_NOTE =
  "The configuration report describes what this deployment implements. A passing check means implemented and reachable, not audited or certified.";

export const OPEX_GAP_NOTE =
  "These are the things this operational-excellence surface does not do. They are listed so that a zero in the Session 73 rollup is not read as a measurement.";

export const OPEX_PROVENANCE_NOTE =
  "Provenance states, field by field, whether a number in the Session 73 rollup was observed or is a structural zero from a section nothing implements. The rollup's shape is unchanged for existing consumers.";

export const OPEX_POLICY_NOTE =
  "This policy sets the organization's own expectations and retention. It is advisory: this API records breaches of it and refuses nothing.";

export const OPEX_LEDGER_NOTE =
  "The operational-excellence ledger describes events recorded since it was introduced. Nothing before it is reconstructed or estimated.";

/* ── Pure helpers ──────────────────────────────────────────────────────── */

export function defaultOpexPolicy(organizationId: string): OpexPolicy {
  return {
    organizationId,
    reliabilityWindowDays: OPEX_DEFAULT_RELIABILITY_WINDOW_DAYS,
    registerRetention: OPEX_MAX_ALERTS,
    criticalAckHours: OPEX_DEFAULT_CRITICAL_ACK_HOURS,
    criticalResolveHours: OPEX_DEFAULT_CRITICAL_RESOLVE_HOURS,
    assessmentValidityDays: OPEX_DEFAULT_ASSESSMENT_VALIDITY_DAYS,
    requireReopenReason: true,
    updatedAt: null,
    updatedBy: null,
    isDefault: true,
    note: OPEX_POLICY_NOTE,
  };
}

/**
 * Percentage of `part` in `whole`, floored.
 *
 * Floored rather than rounded so a success rate can never present a run that
 * contained a failure as 100%. Returns null for an empty denominator instead of
 * 0, which would claim total failure where there was no evidence at all.
 */
export function opexRatePercent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  const clamped = Math.min(Math.max(part, 0), whole);
  return Math.floor((clamped / whole) * 100);
}

/** Hours between two ISO timestamps, or null when either is missing/unparsable. */
export function opexHoursBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const hours = (to - from) / 3_600_000;
  return hours < 0 ? null : Math.round(hours * 100) / 100;
}

/** Nearest-rank percentile over an unsorted numeric sample. Null when empty. */
export function opexPercentile(values: number[], percentile: number): number | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const p = Math.min(Math.max(percentile, 0), 100);
  const rank = Math.ceil((p / 100) * clean.length);
  return clean[Math.max(rank, 1) - 1] ?? null;
}

export function opexAgeingBucket(ageHours: number): keyof OpexAgeing {
  if (ageHours < 24) return "under24h";
  if (ageHours < 24 * 7) return "under7d";
  if (ageHours < 24 * 30) return "under30d";
  return "over30d";
}

export function emptyOpexAgeing(): OpexAgeing {
  return { under24h: 0, under7d: 0, under30d: 0, over30d: 0 };
}

/** True when an assessment recorded at `assessedAt` has passed its validity window. */
export function opexAssessmentStale(
  assessedAt: string,
  validityDays: number | null,
  nowMs: number,
): boolean {
  if (validityDays === null) return false;
  const at = Date.parse(assessedAt);
  if (!Number.isFinite(at)) return true;
  return nowMs - at > validityDays * 86_400_000;
}

export function opexAssessmentExpiry(assessedAt: string, validityDays: number | null): string | null {
  if (validityDays === null) return null;
  const at = Date.parse(assessedAt);
  if (!Number.isFinite(at)) return null;
  return new Date(at + validityDays * 86_400_000).toISOString();
}

export function opexDimensionDirection(
  dimension: OpexAssessedDimension,
): "higher_is_better" | "lower_is_better" {
  return OPEX_RISK_DIMENSIONS.includes(dimension) ? "lower_is_better" : "higher_is_better";
}

/** A measure for a dimension nobody has assessed. Value is null, never 0. */
export function notAssessedMeasure(
  key: string,
  label: string,
  direction: "higher_is_better" | "lower_is_better",
  detail: string,
): OpexMeasure {
  return {
    key,
    label,
    value: null,
    unit: "percent",
    basis: "not_assessed",
    direction,
    sampleSize: 0,
    asOf: null,
    stale: false,
    detail,
  };
}

export function opexGapReport(input: {
  openCritical: number;
  oldestOpenAgeHours: number | null;
  notAssessed: number;
  staleAssessments: number;
  reliabilitySample: number;
  breaches: number;
}): OpexGapReport {
  const gaps: OpexGap[] = [];
  if (input.openCritical > 0) {
    gaps.push({
      key: "open_critical_findings",
      severity: "high",
      detail: `${input.openCritical} critical finding(s) are open in the safety register.`,
    });
  }
  if (input.breaches > 0) {
    gaps.push({
      key: "expectation_breaches",
      severity: "high",
      detail: `${input.breaches} finding(s) are older than this organization's own stated expectation.`,
    });
  }
  if (input.notAssessed > 0) {
    gaps.push({
      key: "dimensions_never_assessed",
      severity: "medium",
      detail: `${input.notAssessed} trust dimension(s) have never been assessed and report null rather than a score.`,
    });
  }
  if (input.staleAssessments > 0) {
    gaps.push({
      key: "assessments_stale",
      severity: "medium",
      detail: `${input.staleAssessments} assessment(s) have passed their validity window and are reported stale.`,
    });
  }
  if (input.reliabilitySample === 0) {
    gaps.push({
      key: "no_recorded_ai_traffic",
      severity: "medium",
      detail:
        "No AI requests were recorded in the window, so reliability, latency and data freshness are null rather than computed.",
    });
  }
  if (input.oldestOpenAgeHours !== null && input.oldestOpenAgeHours > 24 * 30) {
    gaps.push({
      key: "stale_open_finding",
      severity: "low",
      detail: `The oldest open finding has been open for ${Math.round(input.oldestOpenAgeHours / 24)} day(s).`,
    });
  }
  for (const section of OPEX_UNIMPLEMENTED_SECTIONS) {
    gaps.push({
      key: `unimplemented_${section.replace(/\./g, "_")}`,
      severity: "low",
      detail: `The Session 73 rollup declares \`${section}\` but nothing in this deployment populates it; it reports a structural zero.`,
    });
  }
  return {
    gaps,
    counts: {
      high: gaps.filter((g) => g.severity === "high").length,
      medium: gaps.filter((g) => g.severity === "medium").length,
      low: gaps.filter((g) => g.severity === "low").length,
    },
    note: OPEX_GAP_NOTE,
  };
}

/* ── Zod schemas ───────────────────────────────────────────────────────── */

export const OpexAlertQuerySchema = z.object({
  status: z.enum(OPEX_ALERT_STATUSES).optional(),
  severity: z.enum(OPEX_SEVERITIES).optional(),
  category: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(OPEX_MAX_ALERT_PAGE).optional(),
});

export const OpexAlertIdParamSchema = z.object({
  alertId: z.string().trim().min(1).max(128),
});

export const OpexReopenSchema = z.object({
  reason: z.string().trim().min(OPEX_MIN_REOPEN_REASON_LENGTH).max(2000),
});

export const OpexDimensionParamSchema = z.object({
  dimension: z.enum(OPEX_ASSESSED_DIMENSIONS),
});

export const OpexAssessmentInputSchema = z.object({
  score: z.number().min(0).max(100),
  method: z.string().trim().min(OPEX_MIN_ASSESSMENT_METHOD_LENGTH).max(1000),
  note: z.string().trim().max(2000).optional(),
});

export const OpexPolicyUpdateSchema = z
  .object({
    reliabilityWindowDays: z.number().int().min(1).max(OPEX_MAX_RELIABILITY_WINDOW_DAYS).optional(),
    registerRetention: z.number().int().min(10).max(OPEX_MAX_ALERTS).optional(),
    criticalAckHours: z.number().int().min(1).max(24 * 30).optional(),
    criticalResolveHours: z.number().int().min(1).max(24 * 365).optional(),
    assessmentValidityDays: z.number().int().min(1).max(3650).nullable().optional(),
    requireReopenReason: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No policy fields supplied." });

export const OpexWindowQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(OPEX_MAX_RELIABILITY_WINDOW_DAYS).optional(),
});

export const OpexEventQuerySchema = z.object({
  kind: z.enum(OPEX_EVENT_KINDS).optional(),
  alertId: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(OPEX_EVENT_LIMIT).optional(),
});

/* ── Governance gates (AI-decision approval gates) ─────────────────────────
 *
 * Session-completion: `governance.gates` was a structural zero. These schemas
 * and types back a real org-scoped approval-gate store: a gate is an approval
 * checkpoint at an authority level, and every decision (approve/reject) is a
 * recorded event. The opex rollup's per-gate figures (pending, approved24h,
 * rejected24h, avgDecisionMin) are computed from those recorded decisions —
 * never estimated. */

export const OPEX_GATE_LEVELS = ["l1_auto", "l2_manager", "l3_director", "l4_exec", "l5_board"] as const;
export type OpexGateLevel = (typeof OPEX_GATE_LEVELS)[number];

export const OPEX_GATE_DECISIONS = ["approved", "rejected"] as const;
export type OpexGateDecision = (typeof OPEX_GATE_DECISIONS)[number];

export const OpexGateCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  level: z.enum(OPEX_GATE_LEVELS),
  description: z.string().trim().max(1000).optional(),
});
export type OpexGateCreateInput = z.infer<typeof OpexGateCreateSchema>;

export const OpexGateRequestSchema = z.object({
  subject: z.string().trim().min(2).max(300),
  detail: z.string().trim().max(2000).optional(),
});
export type OpexGateRequestInput = z.infer<typeof OpexGateRequestSchema>;

export const OpexGateDecisionSchema = z.object({
  decision: z.enum(OPEX_GATE_DECISIONS),
  reason: z.string().trim().max(2000).optional(),
});
export type OpexGateDecisionInput = z.infer<typeof OpexGateDecisionSchema>;

export const OpexGateIdParamSchema = z.object({ gateId: z.string().trim().min(1).max(128) });
export const OpexGateRequestIdParamSchema = z.object({
  gateId: z.string().trim().min(1).max(128),
  requestId: z.string().trim().min(1).max(128),
});

export interface OpexGateRequestRecord {
  id: string;
  gateId: string;
  subject: string;
  detail: string | null;
  status: "pending" | OpexGateDecision;
  requestedBy: string | null;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
}

export interface OpexGateRecord {
  id: string;
  name: string;
  level: OpexGateLevel;
  description: string | null;
  createdAt: string;
  createdBy: string | null;
}

/* ── Regulatory tracking (org-scoped) ──────────────────────────────────────
 *
 * Session-completion: `regulations` was a structural zero. These schemas back a
 * real org-scoped regulatory register. The opex rollup figures (tracked,
 * changed30d, openGaps, upcoming) are computed from stored records only. */

export const OPEX_REGULATION_CATEGORIES = [
  "privacy", "security", "finance", "health", "ai_act", "environmental", "tax", "cyber", "procurement",
] as const;
export type OpexRegulationCategory = (typeof OPEX_REGULATION_CATEGORIES)[number];

export const OPEX_REGULATION_STATUSES = ["proposed", "enacted", "enforcing", "updated"] as const;
export type OpexRegulationStatus = (typeof OPEX_REGULATION_STATUSES)[number];

export const OpexRegulationCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  jurisdiction: z.string().trim().min(2).max(120),
  category: z.enum(OPEX_REGULATION_CATEGORIES),
  status: z.enum(OPEX_REGULATION_STATUSES).default("proposed"),
  summary: z.string().trim().max(2000).default(""),
  effectiveDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  impactAreas: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  gapCount: z.number().int().min(0).max(100000).default(0),
  gapResolved: z.number().int().min(0).max(100000).default(0),
});
export type OpexRegulationCreateInput = z.infer<typeof OpexRegulationCreateSchema>;

export const OpexRegulationUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    status: z.enum(OPEX_REGULATION_STATUSES).optional(),
    summary: z.string().trim().max(2000).optional(),
    effectiveDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).nullable().optional(),
    impactAreas: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    gapCount: z.number().int().min(0).max(100000).optional(),
    gapResolved: z.number().int().min(0).max(100000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No regulation fields supplied." });
export type OpexRegulationUpdateInput = z.infer<typeof OpexRegulationUpdateSchema>;

export const OpexRegulationIdParamSchema = z.object({ regulationId: z.string().trim().min(1).max(128) });
