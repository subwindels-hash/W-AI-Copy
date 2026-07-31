/**
 * ImprovementService - Slice 204: Continuous Improvement / DORA metrics / Retros.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { DoraMetrics, ReleaseMetrics, RetroItem } from "@windels/shared";
import { PipelineService } from "./pipeline.service.js";

const RETRO_KEY = (rid: string) => `rel:retro:${rid}`;
const METRICS_KEY = "rel:metrics";

function iso() { return new Date().toISOString(); }

export const ImprovementService = {
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
    const dora: DoraMetrics = {
      deploymentFrequency: Math.round((deployed / 4) * 10) / 10,
      leadTimeHours: Math.round(avgLead * 10) / 10,
      changeFailRate: total ? Math.round((rolled / total) * 1000) / 10 : 0,
      mttrHours: 1.2,
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
