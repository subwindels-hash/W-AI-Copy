/**
 * DrTestService — Slice 191 (Disaster Recovery).
 *
 * Runs DR drills: region failover (re-uses Session 21 RegionService.failover),
 * backup/restore simulation, redis-restore, DNS-failover, total-outage. For
 * each drill we measure RPO (how much data "lost") and RTO (time to recover)
 * against configured thresholds.
 */
import { assertion } from "./testRunner.service.js";
import { env } from "../config/env.js";
import { RegionService } from "../platform/region.service.js";
import type { TestCase, TestCaseResult, DrConfig } from "@windels/shared/qa";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('qa:drTest');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const BASE = `http://127.0.0.1:${env.API_PORT}/api/v1`;

export async function runDrTest(c: TestCase): Promise<TestCaseResult> {
  const cfg = c.config as unknown as DrConfig;
  const t0 = performance.now();
  const res: TestCaseResult = { caseId: c.id, caseName: c.name, status: "running", durationMs:0, startedAt: new Date().toISOString(), assertions: [], logs: [], metrics: {} };
  try {
    res.logs.push(`dr drill: ${cfg.scenario}`);
    let rpoMs = 0; let rtoMs = 0; let success = true;
    // Set when a scenario performed no work: suppresses RTO/RPO assertions and
    // the metrics block, so nothing downstream can read an invented figure.
    let notPerformed = false;
    // Cleared by a scenario that cannot measure recovery-point objective, so
    // no RPO assertion or metric is emitted for it.
    let rpoMeasured = true;

    if (cfg.scenario === "region-failover") {
      const tStart = performance.now();
      // Find first secondary region to fail over to
      await RegionService.seed();
      const regions = await RegionService.list();
      const primary = regions.find((r) => r.replicationRole === "primary") ?? regions[0];
      const secondary = regions.find((r) => r.id !== primary.id && r.tier !== "dr") ?? regions.find((r) => r.id !== primary.id);
      if (!secondary) throw new Error("no secondary region available");
      res.logs.push(`failing over ${primary.id} → ${secondary.id}`);
      const fo = await RegionService.failover(primary.id, secondary.id, "qa dr drill: region-failover");
      rtoMs = performance.now() - tStart;
      rpoMs = primary.replicationLagMs ?? 100;
      res.logs.push(`failover state=${fo.state} in ${Math.round(rtoMs)}ms`);
      success = fo.state === "complete";
    } else if (cfg.scenario === "backup-restore" || cfg.scenario === "db-failover" || cfg.scenario === "redis-restore") {
      // NOT IMPLEMENTED — and reported as such.
      //
      // This branch used to sleep for a randomised interval, invent a snapshot
      // size, set rtoMs from its own sleep and hardcode rpoMs = 200. Because
      // `success` defaults to true and this path never reassigned it, the drill
      // reported "passed", and those two invented numbers were then checked
      // against the caller's maxRtoMs/maxRpoMs. A recovery-objective audit
      // could be satisfied by a drill that backed up and restored nothing.
      //
      // Performing it for real needs a snapshot/restore integration this
      // service does not have. Until then it reports honestly: no measurement,
      // no assertions derived from one, and a failing verdict so it cannot be
      // mistaken for a successful drill.
      res.logs.push(
        `${cfg.scenario}: not performed — no backup/restore integration is configured, ` +
        `so no RTO or RPO was measured. Wire a snapshot provider to run this drill.`,
      );
      res.assertions.push(assertion("success", "drill completed successfully", false, {
        actual: "not_performed",
      }));
      res.error = {
        code: "DR_SCENARIO_NOT_IMPLEMENTED",
        message: `DR scenario "${cfg.scenario}" is not implemented; no drill was performed and no recovery objective was measured.`,
      };
      notPerformed = true;
    } else if (cfg.scenario === "dns-failover" || cfg.scenario === "total-outage") {
      // This branch does perform a real check — it probes /health and derives
      // `success` from the actual status code. Two things were still invented
      // and have been removed: an artificial 80-380ms sleep that inflated the
      // reported RTO, and a hardcoded `rpoMs = 500` that was then compared
      // against the caller's RPO threshold. Recovery-point objective needs
      // replication telemetry this service does not collect, so it is left
      // unmeasured rather than asserted.
      const t1 = performance.now();
      const h = await fetch(`${BASE}/health`);
      rtoMs = performance.now() - t1;
      success = h.status === 200;
      rpoMeasured = false;
      res.logs.push(
        `recovery probe in ${Math.round(rtoMs)}ms (health=${h.status}); ` +
        `RPO not measured — no replication telemetry available.`,
      );
    }

    // Validate URLs after drill
    for (const u of (cfg.validationUrls ?? [`http://127.0.0.1:${env.API_PORT}/healthz`, `${BASE}/`])) {
      const r = await fetch(u);
      res.assertions.push(assertion(`url:${u}`, `${u} responds post-drill`, r.status < 500, { actual: r.status }));
    }

    // An SLA can only be asserted against a real measurement. When the drill
    // did not run, no rto/rpo assertion is recorded — a generous threshold must
    // not be able to manufacture a passing check.
    if (!notPerformed) {
      if (cfg.maxRtoMs != null) {
        res.assertions.push(assertion("rto", `RTO ≤ ${cfg.maxRtoMs}ms`, rtoMs <= cfg.maxRtoMs, { actual: Math.round(rtoMs) }));
      }
      if (cfg.maxRpoMs != null && rpoMeasured) {
        res.assertions.push(assertion("rpo", `RPO ≤ ${cfg.maxRpoMs}ms`, rpoMs <= cfg.maxRpoMs, { actual: Math.round(rpoMs) }));
      }
      res.assertions.push(assertion("success", "drill completed successfully", success));
      res.metrics.rtoMs = Math.round(rtoMs);
      if (rpoMeasured) res.metrics.rpoMs = Math.round(rpoMs);
    }

    res.finishedAt = new Date().toISOString(); res.durationMs = Math.round(performance.now()-t0);
    res.status = res.assertions.every(a=>a.passed) ? "passed" : "failed";
  } catch (err:any) {
    res.status="error"; res.error={code:"DR_TEST_ERROR",message:err.message};
    res.finishedAt=new Date().toISOString(); res.durationMs=Math.round(performance.now()-t0);
  }
  return res;
}
function sleep(ms:number){return new Promise(r=>setTimeout(r,ms));}

export function newDrCase(suiteId: string, name: string, cfg: DrConfig, opts: Partial<TestCase>={}): Omit<TestCase,"id"|"createdAt"|"updatedAt"> {
  return { suiteId, name, kind:"dr", severity:opts.severity??"critical", config:cfg as any,
    tags:opts.tags??["dr","resilience"], selectors:opts.selectors??["pre-deploy"],
    timeoutMs: opts.timeoutMs??60000, enabled:true, description:opts.description };
}
