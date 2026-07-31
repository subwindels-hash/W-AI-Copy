/**
 * Session 26 bootstrap — seed engineering observability data if empty.
 */
import { logger } from "../observability/logger.js";
import { MetricsService } from "./metrics.service.js";
import { DeploymentService } from "./deployments.service.js";
import { TechDebtService } from "./techDebt.service.js";
import { PipelineService } from "./pipeline.service.js";
import { ProductivityService } from "./productivity.service.js";
import type { SLOTier, ServiceMetric } from "@windels/shared";

const SEED_SERVICES: Array<{ id: string; name: string; tier: SLOTier; owner: string; p50: number; rps: number; err: number; sat: number; sloLatency: number; sloAvail: number }> = [
  { id: "svc-api", name: "API", tier: "tier1", owner: "platform-team", p50: 40, rps: 850, err: 0.3, sat: 62, sloLatency: 200, sloAvail: 99.95 },
  { id: "svc-web", name: "Web", tier: "tier1", owner: "web-team", p50: 120, rps: 1200, err: 0.2, sat: 48, sloLatency: 500, sloAvail: 99.9 },
  { id: "svc-agents", name: "Agents Runtime", tier: "tier1", owner: "ai-team", p50: 320, rps: 220, err: 0.8, sat: 70, sloLatency: 800, sloAvail: 99.5 },
  { id: "svc-workflows", name: "Workflows", tier: "tier2", owner: "platform-team", p50: 85, rps: 150, err: 0.4, sat: 55, sloLatency: 400, sloAvail: 99.9 },
  { id: "svc-data", name: "Data Platform", tier: "tier2", owner: "data-team", p50: 210, rps: 90, err: 0.5, sat: 66, sloLatency: 600, sloAvail: 99.5 },
  { id: "svc-qa", name: "QA Runner", tier: "tier3", owner: "qa-team", p50: 600, rps: 20, err: 1.2, sat: 40, sloLatency: 1500, sloAvail: 99.0 },
  { id: "svc-gov", name: "Governance", tier: "tier3", owner: "platform-team", p50: 55, rps: 45, err: 0.1, sat: 35, sloLatency: 300, sloAvail: 99.5 },
  { id: "svc-program", name: "Program Mgmt", tier: "tier3", owner: "pm-team", p50: 48, rps: 30, err: 0.2, sat: 30, sloLatency: 300, sloAvail: 99.0 },
];

const DEBT_SEEDS = [
  { title: "PlatformPage tab monolith", category: "architecture" as const, severity: "high" as const, area: "web", owner: "web-team", hours: 64, churn: 88 },
  { title: "Redis keys lack TTL on legacy qa:*", category: "architecture" as const, severity: "medium" as const, area: "api", owner: "platform-team", hours: 8, churn: 32 },
  { title: "Missing e2e coverage for mobile offline", category: "tests" as const, severity: "high" as const, area: "mobile", owner: "mobile-team", hours: 24, churn: 45 },
  { title: "Rate-limiter burst tuning", category: "performance" as const, severity: "medium" as const, area: "api", owner: "platform-team", hours: 6, churn: 28 },
  { title: "Helmet CSP allows unsafe-inline", category: "security" as const, severity: "high" as const, area: "web", owner: "security-team", hours: 16, churn: 40 },
  { title: "Docs out of date for SDK v4", category: "docs" as const, severity: "low" as const, area: "dx", owner: "dx-team", hours: 12, churn: 22 },
  { title: "Flaky qa.digital-twin test", category: "tests" as const, severity: "medium" as const, area: "qa", owner: "qa-team", hours: 4, churn: 60 },
  { title: "Lodash sub-deps outdated (CVE note)", category: "dependency" as const, severity: "high" as const, area: "shared", owner: "platform-team", hours: 6, churn: 50 },
  { title: "EventBus subscriber blocks main Redis client", category: "architecture" as const, severity: "critical" as const, area: "api", owner: "platform-team", hours: 24, churn: 70 },
  { title: "Story point heuristics uncalibrated", category: "code" as const, severity: "low" as const, area: "program", owner: "ai-team", hours: 8, churn: 18 },
];

export async function bootstrapEngineering() {
  const existing = await MetricsService.list();
  if (existing.length > 0) {
    const dep = await DeploymentService.analytics();
    const debt = await TechDebtService.summary();
    const pipe = await PipelineService.analytics();
    const prod = await ProductivityService.summary();
    logger.info("engineering observability already seeded", {
      services: existing.length,
      deploys30d: dep.deploysLast30d,
      debtItems: debt.totalItems,
      pipelineRuns7d: pipe.totalRuns7d,
      activeDevs: prod.activeDevelopers,
    });
    return;
  }

  for (const s of SEED_SERVICES) {
    const m: ServiceMetric = {
      serviceId: s.id,
      name: s.name,
      tier: s.tier,
      owner: s.owner,
      p50LatencyMs: s.p50,
      p95LatencyMs: Math.round(s.p50 * 2.2),
      p99LatencyMs: Math.round(s.p50 * 3.5),
      rps: s.rps,
      errorRatePct: s.err,
      availabilityPct: s.sloAvail - 0.03,
      saturationPct: s.sat,
      sloLatencyMs: s.sloLatency,
      sloAvailabilityPct: s.sloAvail,
      errorBudgetRemainingPct: 85,
    };
    await MetricsService.upsert(m);
  }

  // Deployments — 40 in last 30d distributed across services with a few failures
  const svcIds = SEED_SERVICES.map(s => s.name.toLowerCase().replace(/\s+/g, "-"));
  for (let i = 0; i < 40; i++) {
    const daysAgo = 14;
    const svc = svcIds[i % svcIds.length];
    const env = i % 7 === 0 ? "canary" : "production";
    await DeploymentService.record({
      service: svc,
      version: `1.${Math.floor(i/5)}.${i}`,
      environment: env,
      status: "success",
      startedAt: new Date(Date.now() - daysAgo * 86400_000 - 43200_000).toISOString(),
      durationMs: 320_000,
      leadTimeHours: 9.0,
      triggeredBy: ["ci","alice","bob","carol"][i%4],
    });
  }

  // Tech debt
  for (const d of DEBT_SEEDS) {
    await TechDebtService.create({
      title: d.title, category: d.category, severity: d.severity, area: d.area,
      owner: d.owner, estimatedEffortHours: d.hours, churnScore: d.churn,
    });
  }

  // Pipeline runs — 50 over 7d
  for (let i = 0; i < 50; i++) {
    await PipelineService.record({
      startedAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
    });
  }

  await ProductivityService.seedIfEmpty();

  const dep = await DeploymentService.analytics();
  const debt = await TechDebtService.summary();
  const pipe = await PipelineService.analytics();
  const prod = await ProductivityService.summary();
  logger.info("engineering observability bootstrapped", {
    services: SEED_SERVICES.length,
    deploys30d: dep.deploysLast30d,
    debtTotal: debt.totalItems,
    debtCritical: debt.bySeverity.critical ?? 0,
    pipelinePassRate: pipe.passRatePct,
    dora: { df: prod.dora.deploymentFrequency, lt: prod.dora.leadTimeHours, cfr: prod.dora.changeFailRate, mttr: prod.dora.mttrHours },
  });
}
