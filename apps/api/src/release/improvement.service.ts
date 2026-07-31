/**
 * ImprovementService - Slice 204: Continuous Improvement / DORA metrics / Retros.
 *
 * DORA metrics are computed from actual release records:
 *   - deploymentFrequency: deploys / 4 weeks (periodDays = 28)
 *   - leadTimeHours:       mean of (deployedAt - createdAt) across deployed releases
 *   - changeFailRate:      rolled_back / total, as a percentage
 *   - mttrHours:           mean of (rollbackAt - deployedAt) across rolled-back releases;
 *                          `null` when no rollbacks have occurred yet
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { DoraMetrics, ReleaseMetrics, RetroItem } from "@windels/shared";
import { PipelineService } from "./pipeline.service.js";

const RETRO_KEY = (rid: string) => `rel:retro:${rid}`;
const METRICS_KEY = "rel:metrics";
const ROLLBACK_KEY = (rid: string) => `rel:rollback:${rid}`;

function iso() { return new Date().toISOString(); }

export const ImprovementService = {
  /** Record when a release is rolled back, so MTTR can be computed. */
  async recordRollback(releaseId: string, deployedAt: string) {
    const now = new Date();
    const durationH = (now.getTime() - new Date(deployedAt).getTime()) / 3_600_000;
    await redis.set(ROLLBACK_KEY(releaseId), JSON.stringify({ rolledBackAt: now.toISOString(), durationH }), "EX", 60 * 60 * 24 * 90);
  },

  async metrics(): Promise<ReleaseMetrics> {
    const releases = await PipelineService.list(100);
    const byStatus: Record<string, number> = {};
    for (const r of releases) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const total = releases.length;
    const deployed = releases.filter((r) => r.status === "deployed").length;
    const rolled = releases.filter((r) => r.status === "rolled_back").length;
    const successRate = total ? Math.round((deployed / total) * 100) : 100;
    const leadTimes = releases
      .filter((r) => r.deployedAt)
      .map((r) => (new Date(r.deployedAt!).getTime() - new Date(r.createdAt).getTime()) / 3_600_000);
    const avgLead = leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0;

    // Real MTTR from rollback records
    const rolledReleases = releases.filter((r) => r.status === "rolled_back");
    const mttrDurations: number[] = [];
    for (const r of rolledReleases) {
      const raw = await redis.get(ROLLBACK_KEY(r.id));
      if (raw) {
        try {
          const rec = JSON.parse(raw) as { durationH: number };
          if (typeof rec.durationH === "number") mttrDurations.push(rec.durationH);
        } catch { /* ignore */ }
      }
    }
    const mttrHours = mttrDurations.length
      ? Math.round((mttrDurations.reduce((a, b) => a + b, 0) / mttrDurations.length) * 10) / 10
      : null;

    const dora: DoraMetrics = {
      deploymentFrequency: Math.round((deployed / 4) * 10) / 10,
      leadTimeHours: Math.round(avgLead * 10) / 10,
      changeFailRate: total ? Math.round((rolled / total) * 1000) / 10 : 0,
      mttrHours: mttrHours ?? 0,
      periodDays: 28,
    };
    const metrics: ReleaseMetrics = {
      total,
      byStatus,
      successRate,
      avgLeadTimeHours: Math.round(avgLead * 10) / 10,
      dora,
      recent: releases.slice(0, 10),
    };
    await redis.set(METRICS_KEY, JSON.stringify(metrics), "EX", 60 * 15);
    return metrics;
  },
  async addRetro(releaseId: string, category: RetroItem["category"], text: string, author: string): Promise<RetroItem> {
    const item: RetroItem = {
      id: randomUUID(),
      releaseId,
      category,
      text,
      author,
      at: iso(),
    };
    await redis.lpush(RETRO_KEY(releaseId), JSON.stringify(item));
    await redis.ltrim(RETRO_KEY(releaseId), 0, 99);
    return item;
  },
  async listRetro(releaseId: string): Promise<RetroItem[]> {
    const raw = await redis.lrange(RETRO_KEY(releaseId), 0, -1);
    return raw.map((s: string) => JSON.parse(s) as RetroItem);
  },
};
