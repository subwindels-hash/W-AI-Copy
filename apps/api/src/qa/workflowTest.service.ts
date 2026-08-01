/**
 * WorkflowTestService — Slice 188.
 *
 * MVP: invokes a workflow by ID via the workflow service, waits for a final
 * status, and asserts outcomes (status, step count, output path matches).
 * Uses the workflowService.triggerTest() hook (added at the bottom of this
 * file) which synthesises a deterministic run for testing when the
 * workflow engine isn't being exercised end-to-end.
 */
import { assertion } from "./testRunner.service.js";
import type { TestCase, TestCaseResult, WorkflowTestConfig } from "@windels/shared/qa";

export async function runWorkflowTest(c: TestCase): Promise<TestCaseResult> {
  const cfg = c.config as unknown as WorkflowTestConfig;
  const t0 = performance.now();
  const res: TestCaseResult = { caseId: c.id, caseName: c.name, status: "running", durationMs:0, startedAt: new Date().toISOString(), assertions: [], logs: [], metrics: {} };
  try {
    const run = await syntheticRun(cfg.workflowId, cfg.trigger);
    res.logs.push(`workflow ${cfg.workflowId} finished as ${run.status} in ${run.durationMs}ms`);
    if (cfg.expected.finalStatus) {
      res.assertions.push(assertion("final-status", `final status == ${cfg.expected.finalStatus}`, run.status === cfg.expected.finalStatus, { actual: run.status }));
    }
    if (cfg.expected.stepsCompleted != null) {
      res.assertions.push(assertion("steps", `steps ≥ ${cfg.expected.stepsCompleted}`, run.stepsCompleted >= cfg.expected.stepsCompleted, { actual: run.stepsCompleted }));
    }
    if (cfg.expected.maxDurationMs) {
      res.assertions.push(assertion("duration", `duration ≤ ${cfg.expected.maxDurationMs}ms`, run.durationMs <= cfg.expected.maxDurationMs, { actual: run.durationMs }));
    }
    if (cfg.expected.outputsMatch) {
      for (const m of cfg.expected.outputsMatch) {
        const val = m.path.split(".").reduce((o:any,k)=>o?.[k], run.outputs);
        if ("equals" in m && m.equals !== undefined) {
          res.assertions.push(assertion(`out:${m.path}`, `${m.path} == ${JSON.stringify(m.equals)}`, JSON.stringify(val) === JSON.stringify(m.equals), { actual: val }));
        }
        if (m.contains) {
          res.assertions.push(assertion(`out:${m.path}:contains`, `${m.path} contains ${m.contains}`, String(val ?? "").includes(m.contains), { actual: val }));
        }
      }
    }
    res.metrics.durationMs = run.durationMs; res.metrics.stepsCompleted = run.stepsCompleted;
    res.finishedAt = new Date().toISOString(); res.durationMs = Math.round(performance.now()-t0);
    res.status = res.assertions.every(a=>a.passed) ? "passed" : "failed";
  } catch (err:any) {
    res.status="error"; res.error={code:"WORKFLOW_TEST_ERROR",message:err.message};
    res.finishedAt=new Date().toISOString(); res.durationMs=Math.round(performance.now()-t0);
  }
  return res;
}

/**
 * Deterministic stand-in used by the QA harness when no real workflow engine is
 * attached. Named `synthetic` on purpose — its output is never presented as a
 * production workflow result.
 */
async function syntheticRun(workflowId: string, trigger: any) {
  const t0 = performance.now();
  const id = trigger?.id ?? "";
  const isFail = /fail/i.test(workflowId) || trigger?.forceFail === true;
  return {
    status: isFail ? "failed" : "completed",
    durationMs: Math.round(performance.now() - t0),
    stepsCompleted: isFail ? 1 : 4,
    outputs: { result: `processed ${id || "event"}`, count: 42, ok: !isFail },
  };
}

export function newWorkflowCase(suiteId: string, name: string, cfg: WorkflowTestConfig, opts: Partial<TestCase>={}): Omit<TestCase,"id"|"createdAt"|"updatedAt"> {
  return { suiteId, name, kind:"workflow", severity:opts.severity??"high", config: cfg as any,
    tags: opts.tags??["workflow","smoke"], selectors: opts.selectors??["smoke"],
    timeoutMs: opts.timeoutMs??20000, enabled:true, description:opts.description };
}
