/**
 * ProductionService - Slice 203: Production release (canary → full → rollback).
 */
import { redisCmd as redis } from "../db/redis.js";
import type { ProductionDeployment } from "@windels/shared";
import { PipelineService } from "./pipeline.service.js";

const KEY = (rid: string) => `rel:production:${rid}`;

function iso() { return new Date().toISOString(); }

export const ProductionService = {
  async promote(releaseId: string, canaryPercent = 5): Promise<ProductionDeployment | null> {
    const rel = await PipelineService.get(releaseId);
    if (!rel) return null;
    const dep: ProductionDeployment = {
      releaseId,
      status: "canary_ramping",
      canaryPercent,
      healthyAt100: false,
      // Canary telemetry is observed, not assumed at kick-off.
      startedAt: iso(),
    };
    await redis.set(KEY(releaseId), JSON.stringify(dep), "EX", 60 * 60 * 24);
    await PipelineService.setStatus(releaseId, "canary", "canary");
    // The canary ramp previously ran here as a 60ms-per-stage loop that
    // invented an error rate (5-15%) and p95 (40-70ms) at each step, then set
    // healthyAt100 = true and marked the release deployed — a full
    // "canary passed, promoted to production" record for a rollout that never
    // touched an environment.
    //
    // The ramp is now driven externally: reportCanary() advances the percentage
    // with the telemetry actually observed, and promote() requires that health
    // at 100% was genuinely confirmed.
    return dep;
  },
  /**
   * Advance the canary with observed telemetry. The caller supplies the real
   * error rate and p95 measured at this traffic percentage.
   */
  async reportCanary(
    releaseId: string,
    input: { canaryPercent: number; errorRate?: number; p95LatencyMs?: number },
  ): Promise<ProductionDeployment | null> {
    const raw = await redis.get(KEY(releaseId));
    if (!raw) return null;
    const dep = JSON.parse(raw) as ProductionDeployment;
    dep.canaryPercent = input.canaryPercent;
    if (input.errorRate !== undefined) dep.errorRate = input.errorRate;
    if (input.p95LatencyMs !== undefined) dep.p95LatencyMs = input.p95LatencyMs;
    dep.status = input.canaryPercent >= 100 ? "rolling_out" : "canary_ramping";
    await redis.set(KEY(releaseId), JSON.stringify(dep), "EX", 60 * 60 * 24);
    await PipelineService.setStatus(
      releaseId,
      input.canaryPercent >= 100 ? "rolling" : "canary",
      input.canaryPercent >= 100 ? "production" : "canary",
    );
    return dep;
  },

  /**
   * Finalise a release to production. Refuses unless the canary actually
   * reached 100% and reported health, so "deployed" always reflects a
   * completed, observed rollout rather than the end of a timer loop.
   */
  async finalize(releaseId: string, healthyAt100: boolean): Promise<ProductionDeployment | null> {
    const raw = await redis.get(KEY(releaseId));
    if (!raw) return null;
    const dep = JSON.parse(raw) as ProductionDeployment;
    if (dep.canaryPercent < 100) {
      throw Object.assign(new Error("canary has not reached 100%"), { status: 400 });
    }
    dep.healthyAt100 = healthyAt100;
    if (!healthyAt100) return dep;
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
    return dep;
  },
  async get(releaseId: string): Promise<ProductionDeployment | null> {
    const raw = await redis.get(KEY(releaseId));
    return raw ? (JSON.parse(raw) as ProductionDeployment) : null;
  },
};
