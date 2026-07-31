/**
 * Session 24 bootstrap — seed releases if empty.
 */
import { logger } from "../observability/logger.js";
import { PipelineService } from "./pipeline.service.js";
import { ApprovalService } from "./approval.service.js";
import { ImprovementService } from "./improvement.service.js";
import type { PipelineDeploymentStrategy, PipelineReleaseStatus } from "@windels/shared";

const SEED: Array<{
  title: string;
  version: string;
  service: string;
  strategy: PipelineDeploymentStrategy;
  description: string;
  changelog: string[];
  risk: "low" | "medium" | "high" | "critical";
  status?: PipelineReleaseStatus;
  environment?: "dev" | "staging" | "canary" | "production";
}> = [
  { title: "Initial GA rollout", version: "1.0.0", service: "platform", strategy: "blue-green", description: "First production release", changelog: ["GA launch", "auth", "workforce hub"], risk: "high", status: "deployed", environment: "production" },
  { title: "Session 21 infra hotfix", version: "1.0.1", service: "api", strategy: "rolling", description: "Fixes multi-region failover race", changelog: ["fix failover race", "improve redis retry"], risk: "medium", status: "deployed", environment: "production" },
  { title: "Session 22 QA platform", version: "1.1.0", service: "qa", strategy: "canary", description: "QA runner + suites", changelog: ["add test runner", "security checks", "digital-twin runner"], risk: "medium", status: "deployed", environment: "production" },
  { title: "Session 23 governance", version: "1.2.0", service: "governance", strategy: "rolling", description: "Engineering governance dashboard", changelog: ["ADRs", "coding/repo standards", "security posture", "dependency scan"], risk: "low", status: "deployed", environment: "production" },
  { title: "Staging patch", version: "1.2.1", service: "web", strategy: "rolling", description: "Sidebar version bump", changelog: ["bump v0.23.0"], risk: "low", status: "staging_validated", environment: "staging" },
  { title: "Session 24 release mgmt", version: "1.3.0", service: "release", strategy: "canary", description: "Release pipeline + AI validation", changelog: ["pipeline", "approval gates", "AI validation", "staging/production promotion", "DORA metrics"], risk: "medium", status: "draft", environment: "dev" },
];

export async function bootstrapReleases() {
  const existing = await PipelineService.list(1);
  if (existing.length > 0) {
    const m = await ImprovementService.metrics();
    logger.info("release pipeline already seeded", { total: m.total, successRate: m.successRate, dora: m.dora });
    return;
  }
  for (const s of SEED) {
    const rel = await PipelineService.create({
      title: s.title,
      version: s.version,
      service: s.service,
      strategy: s.strategy,
      description: s.description,
      changelog: s.changelog,
      risk: s.risk,
      author: "bootstrap",
    });
    await ApprovalService.seedGates(rel.id, s.risk);
    if (s.status && s.status !== "draft") {
      await PipelineService.setStatus(rel.id, s.status, s.environment ?? "dev");
    }
  }
  const m = await ImprovementService.metrics();
  logger.info("release pipeline bootstrapped", {
    total: m.total,
    successRate: m.successRate,
    deployFreq: m.dora.deploymentFrequency,
    leadTimeH: m.dora.leadTimeHours,
    changeFailRate: m.dora.changeFailRate,
  });
}
