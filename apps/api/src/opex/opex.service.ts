/**
 * Session 73 — Operational Excellence & Responsible AI.
 *
 * The three endpoints this service backs keep their paths, their request bodies
 * and their response shapes. What changed in Session 118 is what happens
 * underneath:
 *
 *   - `createAlert` and `updateAlert` now write through
 *     `OpexAssuranceService`, which stores one key per finding behind an
 *     append-only index. They used to read the organization's entire register
 *     out of a single Redis string, mutate the array in memory and write it
 *     back, so two administrators filing a finding at the same time lost one of
 *     them. Their return values are unchanged.
 *   - `dashboard` keeps its shape and gains a `provenance` block. Two of its
 *     numbers were wrong and are corrected here:
 *       * `mitigations24h` filtered on `at`, the *filing* time, so a finding
 *         resolved a minute ago did not count if it was filed last week. It now
 *         uses the recorded resolution time.
 *       * `reliability` used `Math.round`, so 999 successes out of 1 000
 *         reported 100%. It is floored.
 *       * `humanApprovalRate` counted tasks completed in the last 30 days
 *         against every open task ever created. Both sides now use the same
 *         window.
 *
 * The rollup's remaining zeros are structural: `regulations`, `playbooks`,
 * `explanations`, `governance.gates`, `safety.benchmarks`, `maturityScore` and
 * `collaborationSessionsActive` are declared by the Session 73 contract and
 * nothing in this deployment populates them. Rather than delete fields that
 * existing consumers read, the `provenance` block states which is which, and
 * `GET /opex/trust` reports the honest, nullable version of the trust block.
 */
import { redisCmd as redis } from "../db/redis.js";
import { prisma } from "../db/client.js";
import type { Logger } from "pino";
import type { OpexDashboard, OpexSeverity } from "@windels/shared";
import { opexRatePercent } from "@windels/shared/opex";
import { AppError } from "../utils/result.js";
import { OpexAssuranceService, toLegacyAlert } from "./opexAssurance.service.js";
import type { LegacyOpexAlert } from "./opexAssurance.service.js";

const K = {
  meta: (oid: string) => `opex:${oid}:meta`,
  alerts: (oid: string) => `opex:${oid}:safety-alerts`,
};

/** Retained for callers that still import the Session 73 alert shape. */
export type Alert = LegacyOpexAlert;

export const OpexService = {
  async ensureBootstrapped(logger?: Logger, oid?: string) {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) return;
    if (!(await redis.exists(K.meta(oid)))) {
      await redis.set(K.meta(oid), "1");
      logger?.info({ msg: "[opex] safety register initialized", organizationId: oid });
    }
  },

  /**
   * File a safety finding.
   *
   * Same signature, same return value. The write now goes to one key per
   * finding instead of a read-modify-write over the whole register.
   */
  async createAlert(
    oid: string,
    input: Omit<Alert, "id" | "at" | "status">,
    actorId: string | null = null,
  ): Promise<Alert> {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) throw new Error("organizationId is required");
    const record = await OpexAssuranceService.fileAlert(oid, actorId, {
      category: input.category,
      severity: input.severity as OpexSeverity,
      source: input.source,
      message: input.message,
      model: input.model ?? null,
    });
    return toLegacyAlert(record);
  },

  /**
   * Acknowledge or resolve a finding.
   *
   * Same signature, same return value, same `409` on an already-resolved
   * record — except the error now points at the reopen path, which exists.
   */
  async updateAlert(
    oid: string,
    id: string,
    actorId: string,
    status: "acknowledged" | "resolved",
    note?: string,
  ): Promise<Alert> {
    const record = await OpexAssuranceService.readAlert(oid, id).catch(() => null);
    if (!record) {
      // Adopt the Session 73 register first: the id may predate the durable
      // store, in which case it is imported rather than reported missing.
      await OpexAssuranceService.ensureLegacyImported(oid);
      const adopted = await OpexAssuranceService.readAlert(oid, id);
      if (!adopted) throw AppError.notFound("Safety alert not found");
    }
    const next = await OpexAssuranceService.transitionAlert(oid, id, actorId, status, note);
    return toLegacyAlert(next);
  },

  /**
   * Operational-excellence rollup.
   *
   * Safety counts come from the organization's recorded register; reliability
   * and data freshness are derived from real AI traffic. Trust dimensions that
   * require an assessment nobody has run stay 0 in *this* payload because the
   * Session 73 contract types them as non-nullable numbers — the `provenance`
   * block below marks each one, and `GET /opex/trust` reports them as `null`.
   */
  async dashboard(oid: string): Promise<OpexDashboard> {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) throw new Error("organizationId is required");
    await OpexAssuranceService.ensureLegacyImported(oid);

    const [summary, reliabilityReport, policy] = await Promise.all([
      OpexAssuranceService.registerSummary(oid),
      OpexAssuranceService.reliability(oid),
      OpexAssuranceService.getPolicy(oid),
    ]);
    const taskClosure = await OpexAssuranceService.taskClosure(oid, policy.reliabilityWindowDays);
    const page = await OpexAssuranceService.listAlerts(oid, { limit: 20 });

    const pendingApprovals = await prisma.task
      .count({ where: { organizationId: oid, status: { in: ["TODO", "IN_PROGRESS"] } } })
      .catch(() => 0);

    // Floored, never rounded: a rate that rounds a failure away cannot be used
    // to notice one. 0 here means "no recorded traffic", which provenance says.
    const reliability = reliabilityReport.successRatePercent ?? 0;
    const dataFreshnessHours = reliabilityReport.dataFreshnessHours ?? 0;
    // The closure rate over filed findings. Session 73 called this the safety
    // pass rate; provenance states what it actually measures.
    const passRate = summary.closureRatePercent ?? 0;
    const humanApprovalRate = taskClosure.ratePercent ?? 0;

    return {
      trust: {
        trust: reliability,
        alignment: 0,
        safety: passRate,
        compliance: 0,
        transparency: 0,
        explainability: 0,
        reliability,
        hallucinationRisk: 0,
        evidenceQuality: 0,
        dataFreshnessHours,
        humanApprovalRate,
        operationalStability: reliability,
      },
      safety: {
        passRate,
        alertsOpen: summary.open,
        alertsCritical: summary.openCritical,
        // From the recorded resolution time, not the filing time.
        mitigations24h: summary.resolvedLast24h,
        auditsCompleted: summary.byStatus.resolved,
        benchmarks: {},
      },
      regulations: { tracked: 0, changed30d: 0, openGaps: 0, upcoming: 0 },
      playbooks: { total: 0, active: 0, simulating: 0, avgCompliancePct: 0 },
      explanations: { available24h: 0, avgEvidence: 0, avgConfidence: 0, challenged: 0, challengedUpheld: 0 },
      governance: { gates: [], pendingTotal: pendingApprovals, emergencyShutdowns: 0, overrides24h: 0 },
      continuous: {
        kpis: [
          { label: "AI success rate", value: reliability, target: 99, unit: "%", trend: "flat" },
          { label: "Safety findings open", value: summary.open, target: 0, unit: "", trend: "flat" },
          { label: "Resolved (24h)", value: summary.resolvedLast24h, target: 0, unit: "", trend: "flat" },
        ],
        bottlenecks: summary.open
          ? [
              {
                area: "safety-register",
                impact: summary.openCritical ? ("high" as const) : ("med" as const),
                recommendation: "Triage open safety findings.",
              },
            ]
          : [],
        maturityScore: 0,
      },
      recentAlerts: page.alerts.map(toLegacyAlert),
      recentRegulations: [],
      recentExplanations: [],
      collaborationSessionsActive: 0,
      decisionsRequiringHuman: pendingApprovals,
      provenance: OpexAssuranceService.provenance({
        reliability: reliabilityReport.total > 0,
        freshness: reliabilityReport.lastRequestAt !== null,
        register: summary.total > 0,
      }),
    };
  },
};

/** Exported for the assurance service's legacy adoption path. */
export const OPEX_LEGACY_REGISTER_KEY = K.alerts;
export { opexRatePercent };
