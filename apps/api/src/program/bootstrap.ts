/**
 * Session 25 bootstrap — seed AI program management data if empty.
 */
import { logger } from "../observability/logger.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { RoadmapService } from "./roadmap.service.js";
import { SprintService } from "./sprint.service.js";
import { RequirementsService } from "./requirements.service.js";
import { ArchReviewService } from "./archReview.service.js";
import { RiskService } from "./risk.service.js";
import { ExecReportService } from "./execReport.service.js";
import type { ReqPriority, ReqStatus, StoryStatus } from "@windels/shared";

export async function bootstrapProgram() {
  // Demo/reference program data is opt-in; production starts empty.
  if (!demoDataEnabled()) return skipDemoSeed("program");
  const existing = await RoadmapService.list();
  if (existing.length > 0) {
    const matrix = await RiskService.matrix();
    const sprints = await SprintService.listSprints();
    logger.info("program management already seeded", {
      roadmaps: existing.length,
      sprints: sprints.length,
      criticalRisks: matrix.criticalCount,
    });
    return;
  }

  const cy = new Date().getFullYear();
  const rm = await RoadmapService.create({
    title: `${cy} Annual Roadmap`,
    year: cy,
    vision: "Deliver an AI-native operating system for engineering teams across release, program, observability, and developer platform pillars.",
    themes: ["Platform Foundations", "AI Agents", "Enterprise Readiness", "Developer Experience"],
    status: "approved",
  });
  await RoadmapService.addInitiative(rm.id, {
    title: "Release & Program Management",
    description: "Ship enterprise release pipeline and AI program management surface.",
    quarter: "Q3", year: cy, priority: "p0", owner: "platform-team",
    status: "in_progress", progressPct: 75, dependencies: [], milestones: [
      { id: "m1", title: "Release pipeline GA", dueAt: new Date(Date.now()-7*86400_000).toISOString(), status: "done", progressPct: 100 },
      { id: "m2", title: "AI program management beta", dueAt: new Date(Date.now()+14*86400_000).toISOString(), status: "in_progress", progressPct: 40 },
    ],
  });
  await RoadmapService.addInitiative(rm.id, {
    title: "Engineering Observability",
    description: "DORA / SPACE metrics, deployment analytics, technical debt dashboard.",
    quarter: "Q3", year: cy, priority: "p1", owner: "observability-team",
    status: "proposed", progressPct: 10, dependencies: [], milestones: [],
  });
  await RoadmapService.addInitiative(rm.id, {
    title: "Enterprise Developer Platform",
    description: "SDKs, CLI, emulator, local dev env.",
    quarter: "Q4", year: cy, priority: "p1", owner: "dx-team",
    status: "proposed", progressPct: 0, dependencies: [], milestones: [],
  });

  // Sprints
  const now = Date.now();
  await SprintService.createSprint({
    name: "Sprint 24 — Release Mgmt",
    number: 24,
    startAt: new Date(now - 14*86400_000).toISOString(),
    endAt: new Date(now - 1*86400_000).toISOString(),
    status: "completed", goal: "Ship Session 24 release management pipeline",
    capacityPoints: 42, completedPoints: 40, velocityProjected: 38,
  });
  const active = await SprintService.createSprint({
    name: "Sprint 25 — Program Mgmt",
    number: 25,
    startAt: new Date(now - 2*86400_000).toISOString(),
    endAt: new Date(now + 12*86400_000).toISOString(),
    status: "active", goal: "Ship AI program management agents (roadmap, sprints, risks, exec)",
    capacityPoints: 40, velocityProjected: 42,
  });
  await SprintService.createSprint({
    name: "Sprint 26 — Observability",
    number: 26,
    startAt: new Date(now + 12*86400_000).toISOString(),
    endAt: new Date(now + 26*86400_000).toISOString(),
    status: "planned", goal: "Engineering metrics and deployment analytics",
    capacityPoints: 40, velocityProjected: 44,
  });

  // Seed stories
  const storySeeds: Array<{ title: string; points: number; status: StoryStatus; sprintId: string | null; epic: string; tags: string[]; acceptanceCriteria?: string[] }> = [
    { title: "Roadmap planning agent", points: 8, status: "done", sprintId: null, epic: "program", tags: ["ai","roadmap"], acceptanceCriteria: ["Agent can propose milestones","Confidence score surfaced"] },
    { title: "Sprint planning agent", points: 5, status: "done", sprintId: null, epic: "program", tags: ["ai","sprints"] },
    { title: "Requirements intelligence", points: 5, status: "in_progress", sprintId: active.id, epic: "program", tags: ["ai","reqs"] },
    { title: "Architecture review agent", points: 8, status: "in_progress", sprintId: active.id, epic: "program", tags: ["ai","arch"] },
    { title: "Risk management agent", points: 5, status: "in_progress", sprintId: active.id, epic: "program", tags: ["ai","risk"] },
    { title: "Executive reporting agent", points: 5, status: "in_progress", sprintId: active.id, epic: "program", tags: ["ai","exec"] },
    { title: "Observability metrics foundation", points: 8, status: "backlog", sprintId: null, epic: "observability", tags: ["metrics"] },
    { title: "Technical debt dashboard", points: 5, status: "backlog", sprintId: null, epic: "observability", tags: ["debt"] },
    { title: "SCIM provisioning", points: 13, status: "backlog", sprintId: null, epic: "enterprise", tags: ["security","sso"] },
    { title: "Mobile offline sync v2", points: 8, status: "ready", sprintId: null, epic: "mobile", tags: ["mobile","offline"] },
    { title: "Search cross-workspace scope", points: 5, status: "ready", sprintId: null, epic: "search", tags: ["search"] },
    { title: "Onboarding flow overhaul", points: 8, status: "backlog", sprintId: null, epic: "dx", tags: ["onboarding"] },
  ];
  for (const s of storySeeds) {
    const st = await SprintService.createStory(s);
    if (s.sprintId) await SprintService.assignToSprint(st.id, s.sprintId);
    await SprintService.setStoryStatus(st.id, s.status);
  }

  // Requirements
  const reqSeeds: Array<{ title: string; priority: ReqPriority; status: ReqStatus; source: "customer"|"internal"|"sales"|"support"|"ai_generated"; epic: string; tags: string[]; coverage: { hasTests: boolean; hasDesign: boolean; hasAcceptance: boolean; linkedStories: number }; aiGaps?: string[] }> = [
    { title: "AI-assisted roadmap planning", priority: "must_have", status: "in_development", source: "internal", epic: "program", tags: ["ai"], coverage: { hasTests: true, hasDesign: true, hasAcceptance: true, linkedStories: 2 } },
    { title: "Sprint burndown visualization", priority: "should_have", status: "in_development", source: "customer", epic: "program", tags: ["viz"], coverage: { hasTests: true, hasDesign: true, hasAcceptance: true, linkedStories: 1 } },
    { title: "Risk matrix heatmap", priority: "should_have", status: "in_development", source: "internal", epic: "risk", tags: ["viz"], coverage: { hasTests: true, hasDesign: true, hasAcceptance: true, linkedStories: 1 } },
    { title: "Executive weekly narrative", priority: "must_have", status: "in_development", source: "sales", epic: "exec", tags: ["ai","reporting"], coverage: { hasTests: false, hasDesign: true, hasAcceptance: true, linkedStories: 1 } },
    { title: "SCIM / enterprise provisioning", priority: "must_have", status: "captured", source: "sales", epic: "enterprise", tags: ["sso"], coverage: { hasTests: false, hasDesign: false, hasAcceptance: false, linkedStories: 1 } },
    { title: "Mobile offline editing", priority: "should_have", status: "refining", source: "customer", epic: "mobile", tags: ["offline"], coverage: { hasTests: true, hasDesign: false, hasAcceptance: false, linkedStories: 1 } },
    { title: "Cross-workspace universal search", priority: "could_have", status: "ready", source: "support", epic: "search", tags: ["search"], coverage: { hasTests: false, hasDesign: true, hasAcceptance: true, linkedStories: 1 } },
    { title: "Faster team onboarding", priority: "should_have", status: "refining", source: "customer", epic: "dx", tags: ["onboarding"], coverage: { hasTests: false, hasDesign: false, hasAcceptance: false, linkedStories: 1 } },
    { title: "SOC2 audit log export", priority: "must_have", status: "captured", source: "sales", epic: "compliance", tags: ["soc2"], coverage: { hasTests: false, hasDesign: false, hasAcceptance: false, linkedStories: 0 }, aiGaps: ["Needs audit events for every new session's mutations"] },
    { title: "Architecture review AI scoring", priority: "could_have", status: "in_development", source: "ai_generated", epic: "arch", tags: ["ai"], coverage: { hasTests: true, hasDesign: true, hasAcceptance: true, linkedStories: 1 } },
  ];
  for (const r of reqSeeds) { await RequirementsService.create(r); }

  // Architecture review
  await ArchReviewService.create({
    title: "Q3 Architecture Review — AI Agents Subsystem",
    scope: "agent runtime, program management agents, release pipeline",
    requestedBy: "Super Admin",
    status: "in_review",
    adrsConsulted: ["ADR-003", "ADR-005", "ADR-012"],
  });

  // Risks
  await RiskService.create({
    title: "Security score below SOC2 target",
    category: "compliance", likelihood: 4, impact: 5, status: "mitigating", owner: "security-team",
    description: "Security posture score of 83 is 7 points below 90 target required for SOC2 Type I.",
  });
  await RiskService.create({
    title: "Capacity over-commit in Q3",
    category: "resource", likelihood: 3, impact: 4, status: "assessed", owner: "pm-team",
    description: "Committed scope exceeds projected velocity by ~20%; need to defer one P1 initiative.",
  });
  await RiskService.create({
    title: "Platform tab monolith affects release cadence",
    category: "technical", likelihood: 3, impact: 3, status: "identified", owner: "platform-team",
    description: "PlatformPage.tsx grows ~200 lines per session; plan to split in Session 26/27.",
  });
  await RiskService.create({
    title: "Customer onboarding churn",
    category: "market", likelihood: 3, impact: 4, status: "mitigating", owner: "growth-team",
    description: "Feedback cluster: setup >1h for mid-market teams. Onboarding overhaul committed to backlog.",
  });
  await RiskService.create({
    title: "Redis keyspace bloat",
    category: "operational", likelihood: 2, impact: 3, status: "accepted", owner: "platform-team",
    description: "All new sessions add Redis keys; acceptable while MVP. Plan migration to Prisma for compliance slices.",
  });
  await RiskService.create({
    title: "AI agent hallucination on arch reviews",
    category: "technical", likelihood: 2, impact: 3, status: "identified", owner: "ai-team",
    description: "Heuristic-only AI may produce false-positive findings; always offer human override.",
  });

  const report = await ExecReportService.generate();
  const matrix = await RiskService.matrix();
  logger.info("program management bootstrapped", {
    roadmaps: existing.length + 1,
    sprints: 3,
    initiatives: 3,
    stories: storySeeds.length,
    requirements: reqSeeds.length,
    criticalRisks: matrix.criticalCount,
    reportHeadline: report.headline.slice(0, 80),
  });
}
