/**
 * PipelineService - Slice 214: Pipeline Analytics (CI runs).
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { PipelineAnalytics, PipelineRun, PipelineStatus } from "@windels/shared";

const LIST_KEY = "eng:pipelines";
const COUNTER = "eng:pipeline:counter";
const DETAIL = (id: string) => `eng:pipeline:${id}`;

function iso() { return new Date().toISOString(); }
const SER = <T>(v: T) => JSON.stringify(v);


export const PipelineService = {
  async list(limit = 50): Promise<PipelineRun[]> {
    const ids = await redis.lrange(LIST_KEY, 0, limit - 1);
    const out: PipelineRun[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (raw) out.push(JSON.parse(raw) as PipelineRun);
    }
    return out;
  },
  /**
   * Record a CI pipeline run.
   *
   * This previously invented an entire run when called with no input: a random
   * pipeline name, a status rolled from a 78/14/8 pass/fail/cancel
   * distribution, a 2-9 minute duration split across 4-7 stages, a random
   * author from a hard-coded list, and an 8% chance of being marked flaky.
   * The HTTP route calls it with `{}`, so every request minted a fabricated
   * build that then fed the CI analytics (pass rate, flaky rate, duration
   * percentiles).
   *
   * A run must now describe something that actually ran: `pipeline`, `status`
   * and `durationMs` are required. Stage timings are recorded, not apportioned,
   * and `flaky` is only true when the caller observed a flake.
   */
  async record(input: Partial<PipelineRun> & { pipeline: string; status: PipelineStatus; durationMs: number }): Promise<PipelineRun> {
    const id = randomUUID();
    const n = await redis.incr(COUNTER);
    const run: PipelineRun = {
      id,
      pipeline: input.pipeline,
      branch: input.branch ?? "unknown",
      commitSha: input.commitSha ?? "unknown",
      author: input.author ?? "unknown",
      status: input.status,
      startedAt: input.startedAt ?? iso(),
      finishedAt: input.finishedAt ?? new Date(Date.now() + input.durationMs).toISOString(),
      durationMs: input.durationMs,
      // Stages come from the real build; nothing is synthesised or apportioned.
      stages: input.stages ?? [],
      flaky: input.flaky ?? false,
    };
    void n;
    await redis.set(DETAIL(id), SER(run));
    await redis.lpush(LIST_KEY, id);
    await redis.ltrim(LIST_KEY, 0, 199);
    return run;
  },
  async analytics(): Promise<PipelineAnalytics> {
    const runs = await this.list(200);
    const now = Date.now();
    const in7d = runs.filter(r => now - new Date(r.startedAt).getTime() < 7*86400_000);
    const passed = in7d.filter(r => r.status === "passed").length;
    const failed = in7d.filter(r => r.status === "failed").length;
    const passRate = in7d.length ? Math.round(passed / in7d.length * 1000) / 10 : 0;
    const durations = in7d.map(r => r.durationMs).sort((a,b)=>a-b);
    const avg = durations.length ? Math.round(durations.reduce((a,b)=>a+b,0)/durations.length) : 0;
    const median = durations.length ? durations[Math.floor(durations.length/2)] : 0;
    const flaky = in7d.filter(r => r.flaky).length;
    const slowest = in7d.slice().sort((a,b)=>b.durationMs-a.durationMs)[0];
    const reasons: Record<string, number> = {};
    for (const r of in7d) {
      if (r.status !== "failed") continue;
      const failedStage = r.stages.find(s => s.status === "failed")?.name ?? "unknown";
      reasons[failedStage] = (reasons[failedStage] ?? 0) + 1;
    }
    const failureReasons = Object.entries(reasons).map(([reason, count]) => ({ reason, count })).sort((a,b)=>b.count-a.count);
    return {
      totalRuns7d: in7d.length,
      passRatePct: passRate,
      avgDurationMs: avg,
      medianDurationMs: median,
      flakyCount: flaky,
      slowestPipeline: slowest ? `${slowest.pipeline} (${Math.round(slowest.durationMs/1000)}s)` : "n/a",
      failureReasons: failureReasons.length ? failureReasons : [{ reason: "none (healthy)", count: 0 }],
    };
  },
};
