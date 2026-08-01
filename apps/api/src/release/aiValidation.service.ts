/**
 * AiValidationService - Slice 201: AI Validation Pipeline (heuristic/MVP).
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { AiValidationResult, ValidationCheck } from "@windels/shared";
import { PipelineService } from "./pipeline.service.js";

const KEY = (rid: string) => `rel:validation:${rid}`;

function iso() { return new Date().toISOString(); }

/**
 * The checks a release must clear, and their severity.
 *
 * ── THESE ARE NOT RESULTS ────────────────────────────────────────────────
 * Every entry here used to carry `passed: true` with a confident message
 * ("No hardcoded secrets detected", "All auth routes gated", "Migrations
 * applied cleanly"). Nothing was executed: `runChecks()` returned the literal
 * list, `run()` counted zero failures, computed a score of 100 and advanced the
 * release to `awaiting_approval`. Every release that ever called this passed
 * its security and migration gates without a single check running.
 *
 * A validation gate that cannot fail is worse than no gate, because it is
 * documented as having passed. Checks now start unevaluated and a real runner
 * must report each outcome through `recordCheckResult()`.
 */
const REQUIRED_CHECKS: Array<Pick<ValidationCheck, "name" | "category" | "severity">> = [
  { name: "TypeScript typecheck",   category: "schema",       severity: "blocker" },
  { name: "Unit test suite",        category: "tests",        severity: "blocker" },
  { name: "E2E smoke",              category: "tests",        severity: "blocker" },
  { name: "Dependency audit",       category: "dependencies", severity: "warning" },
  { name: "Secrets scan",           category: "security",     severity: "blocker" },
  { name: "Auth/Z regression",      category: "security",     severity: "blocker" },
  { name: "Schema migrations",      category: "schema",       severity: "blocker" },
  { name: "Bundle size regression", category: "performance",  severity: "warning" },
  { name: "API p95 latency",        category: "performance",  severity: "error"   },
  { name: "Compliance (audit-log)", category: "compliance",   severity: "error"   },
];

/** The unevaluated check set for a new validation run. */
function pendingChecks(): ValidationCheck[] {
  return REQUIRED_CHECKS.map((c) => ({
    ...c,
    id: randomUUID(),
    passed: false,
    evaluated: false,
    message: "not evaluated",
    durationMs: 0,
  }));
}

export const AiValidationService = {
  async run(releaseId: string): Promise<AiValidationResult | null> {
    const rel = await PipelineService.get(releaseId);
    if (!rel) return null;
    await PipelineService.setStatus(releaseId, "validating");
    const start = Date.now();
    const startedAt = iso();
    const checks = pendingChecks();
    const result: AiValidationResult = {
      id: randomUUID(),
      releaseId,
      checks,
      // Nothing has been evaluated yet, so the run has not passed and scores 0.
      // It must not read as a rejection either — the release simply stays in
      // `validating` until a runner reports results.
      overallPassed: false,
      score: 0,
      startedAt,
      finishedAt: undefined,
      durationMs: Date.now() - start,
    };
    await redis.set(KEY(releaseId), JSON.stringify(result), "EX", 60 * 60 * 24 * 7);
    return result;
  },

  /**
   * Record the outcome of one check from a runner that actually executed it.
   *
   * Once every check has reported, the release advances: `awaiting_approval` if
   * no blocker or error failed, `rejected` otherwise. A release can no longer
   * reach approval without each gate genuinely reporting.
   */
  async recordCheckResult(
    releaseId: string,
    checkName: string,
    outcome: { passed: boolean; message?: string; durationMs?: number },
  ): Promise<AiValidationResult | null> {
    const raw = await redis.get(KEY(releaseId));
    if (!raw) return null;
    const result = JSON.parse(raw) as AiValidationResult;
    const check = result.checks.find((c) => c.name === checkName);
    if (!check) return null;

    check.passed = outcome.passed;
    check.message = outcome.message ?? (outcome.passed ? "passed" : "failed");
    check.durationMs = outcome.durationMs ?? 0;
    check.evaluated = true;

    const evaluated = result.checks.filter((c) => c.evaluated === true);
    const complete = evaluated.length === result.checks.length;

    if (complete) {
      const blockers = result.checks.filter((c) => c.severity === "blocker" && !c.passed).length;
      const errors = result.checks.filter((c) => c.severity === "error" && !c.passed).length;
      const warnings = result.checks.filter((c) => c.severity === "warning" && !c.passed).length;
      result.overallPassed = blockers === 0 && errors === 0;
      result.score = Math.max(0, Math.min(100, Math.round(100 - blockers * 25 - errors * 10 - warnings * 3)));
      result.finishedAt = iso();
      await PipelineService.setStatus(releaseId, result.overallPassed ? "awaiting_approval" : "rejected");
    }

    await redis.set(KEY(releaseId), JSON.stringify(result), "EX", 60 * 60 * 24 * 7);
    return result;
  },
  async get(releaseId: string): Promise<AiValidationResult | null> {
    const raw = await redis.get(KEY(releaseId));
    return raw ? (JSON.parse(raw) as AiValidationResult) : null;
  },
};
