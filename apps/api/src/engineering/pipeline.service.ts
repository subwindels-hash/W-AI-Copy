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

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const PIPELINE_NAMES = ["ci-main", "ci-web", "ci-api", "ci-shared", "ci-e2e", "ci-release"];
const STAGE_NAMES = ["checkout", "install", "lint", "typecheck", "test", "build", "e2e", "deploy"];

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
  async record(input: Partial<PipelineRun>): Promise<PipelineRun> {
    const id = randomUUID();
    const pipeline = input.pipeline ?? PIPELINE_NAMES[rand(0, PIPELINE_NAMES.length-1)];
    const branches = ["main", "develop", "feature/session-26", "release/1.3"];
    const statusRoll = Math.random();
    const status: PipelineStatus = input.status ?? (statusRoll < 0.78 ? "passed" : statusRoll < 0.92 ? "failed" : "canceled");
    const durationMs = input.durationMs ?? rand(120_000, 540_000);
    const stageCount = rand(4, 7);
    const chosen = STAGE_NAMES.slice(0, stageCount);
    const stages = chosen.map((name) => {
      const st = name === chosen[chosen.length-1] && status === "failed" ? "failed" as const : "passed" as const;
      return { name, durationMs: Math.round(durationMs / stageCount * (0.7 + Math.random() * 0.6)), status: st as PipelineStatus };
    });
    const n = await redis.incr(COUNTER);
    const run: PipelineRun = {
      id,
      pipeline,
      branch: input.branch ?? branches[n % branches.length],
      commitSha: randomUUID().slice(0, 7),
      author: input.author ?? ["alice","bob","carol","dave","super-admin"][n%5],
      status,
      startedAt: iso(),
      finishedAt: new Date(Date.now() + durationMs).toISOString(),
      durationMs,
      stages,
      flaky: Math.random() < 0.08,
    };
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
