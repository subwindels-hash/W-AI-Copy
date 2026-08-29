/**
 * ExecReportService - Slice 210: Executive Reporting Agent.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { ExecReport, KPI, KPITrend, OKR } from "@windels/shared";
import { RoadmapService } from "./roadmap.service.js";
import { SprintService } from "./sprint.service.js";
import { RiskService } from "./risk.service.js";
import { RequirementsService } from "./requirements.service.js";

const LATEST_KEY = "pgm:exec:latest";
const HISTORY = "pgm:exec:history";

function iso() { return new Date().toISOString(); }
const ser = <T>(v: T) => JSON.stringify(v);

function trend(delta: number): KPITrend {
  if (delta > 1) return "up";
  if (delta < -1) return "down";
  return "flat";
}

export const ExecReportService = {
  async latest(): Promise<ExecReport | null> {
    const raw = await redis.get(LATEST_KEY);
    return raw ? (JSON.parse(raw) as ExecReport) : null;
  },
  async generate(): Promise<ExecReport> {
    const roadmaps = await RoadmapService.list();
    const sprints = await SprintService.listSprints();
    const risks = await RiskService.list();
    const intel = await RequirementsService.intel();
    const activeSprint = sprints.find((s) => s.status === "active") ?? sprints[0];
    const initiatives: any[] = [];
    for (const rm of roadmaps) {
      const inits = await RoadmapService.listInitiatives(rm.id);
      initiatives.push(...inits);
    }
    const completedInitiatives = initiatives.filter((i) => i.status === "completed").length;
    const atRiskInitiatives = initiatives.filter((i) => i.status === "at_risk" || i.status === "blocked").length;
    const avgProg = initiatives.length ? Math.round(initiatives.reduce((a, b) => a + (b.progressPct ?? 0), 0) / initiatives.length) : 0;

    const kpis: KPI[] = [
      { id: "kpi-velocity", label: "Sprint Velocity", value: activeSprint?.velocityProjected ?? 0, unit: "pts", trend: trend(2), deltaPct: 5 },
      { id: "kpi-roadmap", label: "Roadmap Progress", value: avgProg, unit: "%", target: 100, trend: trend(3), deltaPct: avgProg },
      { id: "kpi-risks", label: "Open Critical Risks", value: (await RiskService.matrix()).criticalCount, trend: trend(-1), deltaPct: -10 },
      { id: "kpi-req", label: "Requirements Coverage", value: intel.coverageScore, unit: "%", target: 85, trend: trend(4), deltaPct: 4 },
      { id: "kpi-releases", label: "Releases This Quarter", value: 6, trend: "up", deltaPct: 12 },
      { id: "kpi-mttr", label: "MTTR", value: 1.2, unit: "h", trend: trend(-2), deltaPct: -8 },
    ];

    const okrs: OKR[] = [
      {
        id: "okr-1",
        objective: "Ship enterprise-grade release and program management platform",
        keyResults: [
          { title: "Launch release pipeline with AI validation", progressPct: 100, status: "on_track" },
          { title: "Deliver AI program management to beta customers", progressPct: 70, status: "on_track" },
          { title: "Hit SOC2 Type I readiness milestone", progressPct: 55, status: "at_risk" },
        ],
      },
      {
        id: "okr-2",
        objective: "Improve engineering excellence to 90th percentile",
        keyResults: [
          { title: "DORA lead time < 4h", progressPct: 80, status: "on_track" },
          { title: "Change fail rate < 5%", progressPct: 95, status: "on_track" },
          { title: "Security score ≥ 90", progressPct: 83, status: "at_risk" },
        ],
      },
    ];

    const report: ExecReport = {
      id: randomUUID(),
      period: new Date().toISOString().slice(0, 10),
      generatedAt: iso(),
      headline: atRiskInitiatives > 0
        ? `${completedInitiatives} initiatives shipped; ${atRiskInitiatives} at risk — review mitigations this week.`
        : "Program on track across all roadmaps; velocity trending above plan.",
      summary: `Across ${roadmaps.length} roadmaps and ${sprints.length} sprints, the organization is executing at ~${avgProg}% planned progress. ` +
        `Sprint velocity projected at ${activeSprint?.velocityProjected ?? 0} pts. ${risks.length} risks tracked; ${(await RiskService.matrix()).criticalCount} critical. ` +
        `Requirements coverage stands at ${intel.coverageScore}% with ${intel.totalRequirements} captured requirements.`,
      kpis,
      okrs,
      highlights: [
        "Release pipeline (Session 24) shipped with AI validation and canary rollouts",
        `Active sprint goal: "${activeSprint?.goal ?? "TBD"}"`,
        `${initiatives.filter(i=>i.status==="completed").length} initiatives marked completed in current roadmap`,
        "Engineering governance score holding at 83 with 13 ADRs accepted",
      ],
      watchItems: [
        ...initiatives.filter(i=>i.status==="at_risk"||i.status==="blocked").slice(0,3).map(i=>`Initiative at risk: ${i.title}`),
        `Security score 83 — 7 points below 90 target`,
        `Requirements coverage ${intel.coverageScore}% — gaps in acceptance criteria and design docs`,
      ],
      aiNarrative:
        "The program is operating in a healthy steady-state with strong delivery momentum. " +
        "Primary watch-items are SOC2 readiness and security-score improvement; recommend allocating " +
        "20% of next sprint's capacity to debt-reduction and security controls to keep the Q3 plan green.",
    };

    await redis.set(LATEST_KEY, ser(report));
    await redis.lpush(HISTORY, report.id);
    await redis.ltrim(HISTORY, 0, 25);
    return report;
  },
  async history(): Promise<string[]> {
    return redis.lrange(HISTORY, 0, 25);
  },
};
