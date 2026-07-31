import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { prisma } from "../db/client.js";
import type { Logger } from "pino";
import type { OpexDashboard } from "@windels/shared";
import { AppError } from "../utils/result.js";
const K = { meta: (oid: string) => `opex:${oid}:meta`, alerts: (oid: string) => `opex:${oid}:safety-alerts` };
type Alert = { id: string; category: string; severity: "info" | "warning" | "critical"; source: string; message: string; model?: string; at: string; status: "open" | "acknowledged" | "resolved"; acknowledgedBy?: string; resolvedBy?: string; note?: string };
async function list(oid: string): Promise<Alert[]> { const raw = await redis.get(K.alerts(oid)); try { return raw ? JSON.parse(raw) : []; } catch { return []; } }
async function save(oid: string, alerts: Alert[]) { await redis.set(K.alerts(oid), JSON.stringify(alerts)); }
export const OpexService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels") { if (!(await redis.exists(K.meta(oid)))) { await redis.set(K.meta(oid), "1"); logger?.info({ msg: "[opex] safety register initialized", organizationId: oid }); } },
  async createAlert(oid: string, input: Omit<Alert, "id" | "at" | "status">) { await this.ensureBootstrapped(undefined, oid); const alerts = await list(oid); const alert: Alert = { ...input, id: `safety-${randomUUID()}`, at: new Date().toISOString(), status: "open" }; alerts.push(alert); await save(oid, alerts); return alert; },
  async updateAlert(oid: string, id: string, actorId: string, status: "acknowledged" | "resolved", note?: string) { const alerts = await list(oid); const i = alerts.findIndex((a) => a.id === id); if (i < 0) throw AppError.notFound("Safety alert not found"); const old = alerts[i]!; if (old.status === "resolved") throw AppError.conflict("Safety alert is already resolved"); const alert = { ...old, status, note: note ?? old.note, ...(status === "acknowledged" ? { acknowledgedBy: actorId } : { resolvedBy: actorId }) }; alerts[i] = alert; await save(oid, alerts); return alert; },
  /**
   * Operational-excellence rollup.
   *
   * Safety counts come from the org's recorded alert register; reliability and
   * data-freshness are derived from real AI traffic. Trust dimensions that
   * require an assessment nobody has run (alignment, transparency,
   * explainability) stay 0 — an unassessed platform must not score itself.
   */
  async dashboard(oid: string): Promise<OpexDashboard> {
    await this.ensureBootstrapped(undefined, oid);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const day = new Date(Date.now() - 86_400_000);

    const alerts = await list(oid);
    const open = alerts.filter((a) => a.status !== "resolved");
    const resolved24h = alerts.filter((a) => a.status === "resolved" && a.at >= day.toISOString()).length;

    const [aiTotal, aiFailed, latest, humanApprovals, pendingApprovals] = await Promise.all([
      prisma.aiRequest.count({ where: { organizationId: oid, createdAt: { gte: since } } }).catch(() => 0),
      prisma.aiRequest.count({ where: { organizationId: oid, createdAt: { gte: since }, status: { not: "succeeded" } } }).catch(() => 0),
      prisma.aiRequest.findFirst({ where: { organizationId: oid }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null),
      prisma.task.count({ where: { organizationId: oid, status: "DONE", updatedAt: { gte: since } } }).catch(() => 0),
      prisma.task.count({ where: { organizationId: oid, status: { in: ["TODO", "IN_PROGRESS"] } } }).catch(() => 0),
    ]);

    // Reliability = observed AI success rate. 0 when nothing has run, which is
    // honest: no evidence of reliability is not evidence of reliability.
    const reliability = aiTotal ? Math.round(((aiTotal - aiFailed) / aiTotal) * 100) : 0;
    const dataFreshnessHours = latest
      ? Math.round((Date.now() - latest.createdAt.getTime()) / 3_600_000)
      : 0;
    // Safety pass rate over the recorded register.
    const passRate = alerts.length
      ? Math.round(((alerts.length - open.length) / alerts.length) * 100)
      : 0;
    const decisionsRequiringHuman = pendingApprovals;
    const totalDecisions = humanApprovals + pendingApprovals;
    const humanApprovalRate = totalDecisions ? Math.round((humanApprovals / totalDecisions) * 100) : 0;

    return {
      trust: {
        // Only dimensions backed by a real signal are populated.
        trust: reliability, alignment: 0, safety: passRate, compliance: 0,
        transparency: 0, explainability: 0, reliability,
        hallucinationRisk: 0, evidenceQuality: 0,
        dataFreshnessHours, humanApprovalRate,
        operationalStability: reliability,
      },
      safety: {
        passRate,
        alertsOpen: open.length,
        alertsCritical: open.filter((a) => a.severity === "critical").length,
        mitigations24h: resolved24h,
        auditsCompleted: alerts.filter((a) => a.status === "resolved").length,
        benchmarks: {},
      },
      regulations: { tracked: 0, changed30d: 0, openGaps: 0, upcoming: 0 },
      playbooks: { total: 0, active: 0, simulating: 0, avgCompliancePct: 0 },
      explanations: { available24h: 0, avgEvidence: 0, avgConfidence: 0, challenged: 0, challengedUpheld: 0 },
      governance: { gates: [], pendingTotal: pendingApprovals, emergencyShutdowns: 0, overrides24h: 0 },
      continuous: {
        kpis: [
          { label: "AI success rate", value: reliability, target: 99, unit: "%", trend: "flat" },
          { label: "Safety alerts open", value: open.length, target: 0, unit: "", trend: "flat" },
          { label: "Mitigations (24h)", value: resolved24h, target: 0, unit: "", trend: "flat" },
        ],
        bottlenecks: open.length
          ? [{ area: "safety-register", impact: open.some((a) => a.severity === "critical") ? "high" as const : "med" as const, recommendation: "Triage open safety findings." }]
          : [],
        maturityScore: 0,
      },
      recentAlerts: alerts.slice(-20).reverse(),
      recentRegulations: [], recentExplanations: [],
      collaborationSessionsActive: 0,
      decisionsRequiringHuman,
    };
  },
};
