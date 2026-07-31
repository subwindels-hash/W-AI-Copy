/**
 * ProductionService - Slice 203: Production release (canary → full → rollback).
 *
 * Canary progression is a real state machine in Redis. Error-rate / p95 latency
 * during canary steps are simulated placeholders until a real APM adapter is
 * wired in; they are labelled `simulated: true` in the response.
 */
import { redisCmd as redis } from "../db/redis.js";
import type { ProductionDeployment } from "@windels/shared";
import { PipelineService } from "./pipeline.service.js";
import { ImprovementService } from "./improvement.service.js";

const KEY = (rid: string) => `rel:production:${rid}`;

function iso() { return new Date().toISOString(); }

export const ProductionService = {
  async promote(releaseId: string, canaryPercent = 5): Promise<ProductionDeployment | null> {
    const rel = await PipelineService.get(releaseId);
    if (!rel) return null;
    const dep: ProductionDeployment & { simulated?: boolean } = {
      releaseId,
      status: "canary_ramping",
      canaryPercent,
      healthyAt100: false,
      errorRate: 0.1,
      p95LatencyMs: 42,
      startedAt: iso(),
      simulated: true,
    };
    await redis.set(KEY(releaseId), JSON.stringify(dep), "EX", 60 * 60 * 24);
    await PipelineService.setStatus(releaseId, "canary", "canary");
    for (const pct of [25, 50, 75, 100]) {
      await new Promise((r) => setTimeout(r, 60));
      dep.canaryPercent = pct;
      // Simulated health metrics — replace with real APM query.
      dep.errorRate = 0.05 + Math.random() * 0.1;
      dep.p95LatencyMs = 40 + Math.floor(Math.random() * 30);
      dep.status = pct === 100 ? "rolling_out" : "canary_ramping";
      await redis.set(KEY(releaseId), JSON.stringify(dep), "EX", 60 * 60 * 24);
      await PipelineService.setStatus(releaseId, pct === 100 ? "rolling" : "canary", pct === 100 ? "production" : "canary");
    }
    dep.healthyAt100 = true;
    dep.status = "deployed";
    dep.promotedAt = iso();
    await redis.set(KEY(releaseId), JSON.stringify(dep), "EX", 60 * 60 * 24);
    await PipelineService.setStatus(releaseId, "deployed", "production");
    return dep;
  },
  async rollback(releaseId: string): Promise<ProductionDeployment | null> {
    const raw = await redis.get(KEY(releaseId));
    if (!raw) return null;
    const dep = JSON.parse(raw) as ProductionDeployment;
    dep.status = "rolling_back";
    await redis.set(KEY(releaseId), JSON.stringify(dep), "EX", 60 * 60 * 24);
    await PipelineService.setStatus(releaseId, "rolled_back", "production");
    dep.status = "rolled_back";
    dep.rolledBackAt = iso();
    await redis.set(KEY(releaseId), JSON.stringify(dep), "EX", 60 * 60 * 24);
    // Record MTTR: use promotedAt (when release went live) so we measure
    // "time from deploy → rollback" — the DORA definition.
    const deployedAt = dep.promotedAt ?? dep.startedAt;
    if (deployedAt) await ImprovementService.recordRollback(releaseId, deployedAt);
    return dep;
  },
  async get(releaseId: string): Promise<ProductionDeployment | null> {
    const raw = await redis.get(KEY(releaseId));
    return raw ? (JSON.parse(raw) as ProductionDeployment) : null;
  },
};
