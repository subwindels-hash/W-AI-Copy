/**
 * Session 22 QA bootstrap — register runners and seed reference suites/cases.
 */
import { TestRunnerService } from "./testRunner.service.js";
import { runApiTest, newApiCase } from "./apiTest.service.js";
import { runAiValidation, newAiCase } from "./aiValidation.service.js";
import { runWorkflowTest, newWorkflowCase } from "./workflowTest.service.js";
import { runSecurityTest, newSecurityCase } from "./securityTest.service.js";
import { runChaosTest, newChaosCase } from "./chaos.service.js";
import { runDrTest, newDrCase } from "./drTest.service.js";
import { runDigitalTwin, newDigitalTwinCase } from "./digitalTwin.service.js";
import { logger } from "../observability/logger.js";

export async function bootstrapQA() {
  TestRunnerService.registerRunner("api", runApiTest);
  TestRunnerService.registerRunner("ai-validation", runAiValidation);
  TestRunnerService.registerRunner("workflow", runWorkflowTest);
  TestRunnerService.registerRunner("security", runSecurityTest);
  TestRunnerService.registerRunner("chaos", runChaosTest);
  TestRunnerService.registerRunner("dr", runDrTest);
  TestRunnerService.registerRunner("digital-twin", runDigitalTwin);

  // Only seed if no suites exist yet
  const existing = await TestRunnerService.listSuites();
  if (existing.length) return;

  // Smoke suite — quick API + security checks
  const smoke = await TestRunnerService.createSuite({
    name: "Platform Smoke", kind: "mixed",
    description: "Fast checks run on every boot and every deploy.",
    schedule: { preset: "hourly" }, tags: ["smoke","regression"],
  });
  await TestRunnerService.createCase(newApiCase(smoke.id, "health returns ok", { method: "GET", url: "/healthz", expected: { status: 200 } }));
  await TestRunnerService.createCase(newApiCase(smoke.id, "v1 root envelope", { method: "GET", url: "/", expected: { status: 200, schemaEnvelope: true, bodyMatches: [{ path: "ok", equals: true }, { path: "data.service", equals: "windels-api" }] } }));
  await TestRunnerService.createCase(newApiCase(smoke.id, "auth required on protected endpoint", { method: "GET", url: "/agents/comm/stats", auth: "none", expected: { status: [401, 403] } }, { severity: "critical" }));
  await TestRunnerService.createCase(newSecurityCase(smoke.id, "security headers present", { checks: ["security-headers","cors-locked","csrf-enforced","jwt-expiry"] }));

  // API Regression suite
  const apiSuite = await TestRunnerService.createSuite({
    name: "API Regression", kind: "api", description: "Core REST surface regression tests.",
    schedule: { preset: "daily" }, tags: ["api","regression"],
  });
  await TestRunnerService.createCase(newApiCase(apiSuite.id, "data catalog returns assets", { method: "GET", url: "/data/catalog", auth: "admin", expected: { status: 200, schemaEnvelope: true, bodyMatches: [{ path: "data.assets", type: "array" }] } }));
  await TestRunnerService.createCase(newApiCase(apiSuite.id, "knowledge graph stats", { method: "GET", url: "/data/kg/stats", auth: "admin", expected: { status: 200, schemaEnvelope: true } }));
  await TestRunnerService.createCase(newApiCase(apiSuite.id, "agent comm stats", { method: "GET", url: "/agents/comm/stats", auth: "admin", expected: { status: 200, schemaEnvelope: true } }));
  await TestRunnerService.createCase(newApiCase(apiSuite.id, "platform metrics", { method: "GET", url: "/platform/metrics", auth: "admin", expected: { status: 200, schemaEnvelope: true } }));
  await TestRunnerService.createCase(newApiCase(apiSuite.id, "infra overview", { method: "GET", url: "/platform/infra/overview", auth: "admin", expected: { status: 200, schemaEnvelope: true } }));
  await TestRunnerService.createCase(newApiCase(apiSuite.id, "invalid path returns 404 envelope", { method: "GET", url: "/does-not-exist", auth: "admin", expected: { status: 404 } }));

  // AI Validation suite
  const aiSuite = await TestRunnerService.createSuite({
    name: "AI Quality", kind: "ai-validation", description: "Static AI response quality checks.",
    schedule: { preset: "daily" }, tags: ["ai","quality"],
  });
  await TestRunnerService.createCase(newAiCase(aiSuite.id, "payroll response no PII", { prompt: "What is the payroll schedule?", checks: ["pii-detect","response-time","hallucination-detect","brand-tone"], maxLatencyMs: 5000 }));
  await TestRunnerService.createCase(newAiCase(aiSuite.id, "security guidance non-toxic", { prompt: "How do I secure my password?", checks: ["toxicity","pii-detect","brand-tone","response-time"], maxLatencyMs: 5000 }));

  // Workflow suite
  const wfSuite = await TestRunnerService.createSuite({
    name: "Workflows", kind: "workflow", description: "Workflow happy-path tests.",
    schedule: { preset: "daily" }, tags: ["workflow"],
  });
  await TestRunnerService.createCase(newWorkflowCase(wfSuite.id, "synthetic workflow completes", { workflowId: "qa-sample-workflow", trigger: { id: "smoke-1" }, expected: { finalStatus: "completed", stepsCompleted: 3, maxDurationMs: 2000, outputsMatch: [{ path: "ok", equals: true }] } }));

  // Security suite
  const secSuite = await TestRunnerService.createSuite({
    name: "Security", kind: "security", description: "Automated security scans.",
    schedule: { preset: "daily" }, tags: ["security"],
  });
  await TestRunnerService.createCase(newSecurityCase(secSuite.id, "unauthenticated blocked", { checks: ["auth-required"] }));
  await TestRunnerService.createCase(newSecurityCase(secSuite.id, "admin-only gated", { checks: ["admin-only"] }));
  await TestRunnerService.createCase(newSecurityCase(secSuite.id, "sql injection safe", { checks: ["sql-injection-safe","input-validation"] }));
  await TestRunnerService.createCase(newSecurityCase(secSuite.id, "rate limit enabled", { checks: ["rate-limit-enforced"] }, { severity: "high" }));

  // Resilience suite (chaos + DR)
  const resSuite = await TestRunnerService.createSuite({
    name: "Resilience", kind: "mixed", description: "Chaos and DR drills.",
    schedule: { preset: "manual" }, tags: ["resilience","sre"],
  });
  await TestRunnerService.createCase(newChaosCase(resSuite.id, "network latency SLO", { fault: "network-latency", target: { kind: "service", name: "api" }, durationMs: 1000, magnitude: 0.5, slos: { availabilityPercent: 99, p95LatencyMs: 1000 } }, { severity: "high" }));
  await TestRunnerService.createCase(newChaosCase(resSuite.id, "CPU pressure SLO", { fault: "pod-cpu-pressure", target: { kind: "workload", name: "windels-api" }, durationMs: 800, magnitude: 0.2, slos: { p95LatencyMs: 1500, availabilityPercent: 95 } }));
  await TestRunnerService.createCase(newDrCase(resSuite.id, "region failover", { scenario: "region-failover", maxRtoMs: 3000, maxRpoMs: 1000 }));
  await TestRunnerService.createCase(newDrCase(resSuite.id, "backup/restore", { scenario: "backup-restore", maxRtoMs: 2000, maxRpoMs: 1000 }));

  // Digital twin load suite
  const dtSuite = await TestRunnerService.createSuite({
    name: "Digital Twin", kind: "digital-twin", description: "Synthetic user + agent load.",
    schedule: { preset: "manual" }, tags: ["digital-twin","load"],
  });
  await TestRunnerService.createCase(newDigitalTwinCase(dtSuite.id, "baseline user mix", {
    name: "baseline", users: 5, agents: 2, durationMs: 3000,
    actions: [
      { type: "health", weight: 1 },
      { type: "agents", weight: 1 },
      { type: "data-catalog", weight: 1 },
      { type: "agent-comm", weight: 1 },
      { type: "platform", weight: 1 },
    ],
    expectations: { maxErrorRate: 5, maxP95Ms: 500, minRps: 10 },
  }));

  // Kick off one smoke run to warm things up
  try { await TestRunnerService.runSuite(smoke.id, { triggeredBy: "ci" }); }
  catch (e) { logger.warn("initial smoke run failed", { error: (e as Error).message }); }

  TestRunnerService.startScheduler();
  logger.info("qa platform bootstrapped", { suites: (await TestRunnerService.listSuites()).length });
}
