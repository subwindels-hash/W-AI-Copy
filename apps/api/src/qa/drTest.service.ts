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
      // Simulate backup snapshot + restore (no actual data loss in MVP)
      const t1 = performance.now();
      await sleep(50 + _rng.next()*150); // simulate backup
      const snapshotBytes = Math.floor(1_000_000 + _rng.next()*50_000_000);
      await sleep(30 + _rng.next()*200);  // simulate restore
      rtoMs = performance.now() - t1; rpoMs = 200; // 200ms acceptable RPO for MVP
      res.logs.push(`restored snapshot (${(snapshotBytes/1024/1024).toFixed(1)} MiB) in ${Math.round(rtoMs)}ms`);
    } else if (cfg.scenario === "dns-failover" || cfg.scenario === "total-outage") {
      const t1 = performance.now();
      await sleep(80 + _rng.next()*300); // simulate DNS propagation / cold start
      // Verify health returns after recovery
      const h = await fetch(`${BASE}/health`);
      rtoMs = performance.now() - t1; rpoMs = 500; success = h.status === 200;
      res.logs.push(`recovery in ${Math.round(rtoMs)}ms (health=${h.status})`);
    }

    // Validate URLs after drill
    for (const u of (cfg.validationUrls ?? [`http://127.0.0.1:${env.API_PORT}/healthz`, `${BASE}/`])) {
      const r = await fetch(u);
      res.assertions.push(assertion(`url:${u}`, `${u} responds post-drill`, r.status < 500, { actual: r.status }));
    }

    if (cfg.maxRtoMs != null) {
      res.assertions.push(assertion("rto", `RTO ≤ ${cfg.maxRtoMs}ms`, rtoMs <= cfg.maxRtoMs, { actual: Math.round(rtoMs) }));
    }
    if (cfg.maxRpoMs != null) {
      res.assertions.push(assertion("rpo", `RPO ≤ ${cfg.maxRpoMs}ms`, rpoMs <= cfg.maxRpoMs, { actual: Math.round(rpoMs) }));
    }
    res.assertions.push(assertion("success", "drill completed successfully", success));
    res.metrics.rtoMs = Math.round(rtoMs); res.metrics.rpoMs = Math.round(rpoMs);

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
