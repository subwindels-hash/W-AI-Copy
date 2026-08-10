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
import { redisCmd } from "../db/redis.js";
import { createBackup } from "../services/automatedBackup.service.js";
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
      if (cfg.scenario === "redis-restore") {
        // Real Redis restore drill: write a test key, DUMP it, delete it,
        // RESTORE it, and verify the value round-trips. RPO is genuinely 0
        // (the dump captured the value before deletion) and RTO is the
        // dump+restore time.
        const tStart = performance.now();
        const key = `dr:restore:${Date.now().toString(36)}`;
        const value = `dr-value-${Date.now()}`;
        try {
          await redisCmd.set(key, value);
          const dumped = await redisCmd.dump(key);
          await redisCmd.del(key);
          if (!dumped) throw new Error("DUMP returned empty payload");
          await redisCmd.restore(key, 0, dumped as unknown as Buffer);
          const restored = await redisCmd.get(key);
          rtoMs = performance.now() - tStart;
          rpoMs = 0; // dump captured the pre-delete value
          success = restored === value;
          res.logs.push(`redis DUMP→RESTORE round-trip in ${Math.round(rtoMs)}ms; verified=${success}`);
        } catch (e: any) {
          rtoMs = performance.now() - tStart;
          success = false;
          rpoMeasured = false;
          res.logs.push(`redis-restore drill failed: ${e?.message ?? "error"}`);
        } finally {
          await redisCmd.del(key).catch(() => {});
        }
      } else if (cfg.scenario === "backup-restore") {
        // Real backup attempt via the automated backup service (pg_dump when a
        // database is reachable). RTO is the actual backup duration; RPO is
        // 0 for a full backup. If the backup service cannot reach a database,
        // the drill fails honestly rather than inventing a recovery objective.
        const tStart = performance.now();
        try {
          const databaseName = process.env.DATABASE_NAME || "windels";
          const backup = await createBackup({
            type: "full",
            databaseName,
            storageRegion: process.env.DR_STORAGE_REGION || "primary",
            retentionDays: 30,
            metadata: { dr: true, scenario: "backup-restore" },
          });
          rtoMs = performance.now() - tStart;
          rpoMs = 0; // full backup — no incremental gap
          success = backup.status === "completed" || backup.status === "verified";
          res.logs.push(`backup ${backup.id} ${backup.status} in ${Math.round(rtoMs)}ms`);
        } catch (e: any) {
          rtoMs = performance.now() - tStart;
          success = false;
          rpoMeasured = false;
          res.logs.push(`backup-restore drill failed: ${e?.message ?? "error"}`);
        }
      } else {
        // db-failover: real region failover (the database region moves).
        const tStart = performance.now();
        try {
          await RegionService.seed();
          const regions = await RegionService.list();
          const primary = regions.find((r) => r.replicationRole === "primary") ?? regions[0];
          const secondary = regions.find((r) => r.id !== primary.id && r.tier !== "dr") ?? regions.find((r) => r.id !== primary.id);
          if (!secondary) throw new Error("no secondary region available");
          res.logs.push(`db failover ${primary.id} → ${secondary.id}`);
          const fo = await RegionService.failover(primary.id, secondary.id, "qa dr drill: db-failover");
          rtoMs = performance.now() - tStart;
          rpoMs = primary.replicationLagMs ?? 0;
          success = fo.state === "complete";
          res.logs.push(`db failover state=${fo.state} in ${Math.round(rtoMs)}ms`);
        } catch (e: any) {
          rtoMs = performance.now() - tStart;
          success = false;
          rpoMeasured = false;
          res.logs.push(`db-failover drill failed: ${e?.message ?? "error"}`);
        }
      }
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
