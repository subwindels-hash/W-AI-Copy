/**
 * IaCService — Slice 178 (Infrastructure as Code).
 *
 * Tracks Terraform/Helm/Kubectl stacks (deployment environments) and runs
 * (plan/apply). MVP seeds three environments (dev/staging/prod) plus the
 * EU/AP multi-region stacks added in Slice 182, and lets users trigger
 * plan/apply (simulated) and inspect drift.
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../db/redis.js";
import type { IaCStack, IaCRun, IaCStatus } from "@windels/shared/infrastructure";

const STACKS_KEY = "infra:iac:stacks";
const STACK_PREFIX = "infra:iac:stack:";
const RUNS_KEY = "infra:iac:runs";
const RUN_PREFIX = "infra:iac:run:";
let seeded = false;
function now(){return new Date().toISOString();}
function sk(id:string){return STACK_PREFIX+id;}
function rk(id:string){return RUN_PREFIX+id;}

const DEFAULT_STACKS: Array<Omit<IaCStack,"id"|"status"|"driftDetected"|"updatedAt"|"resources">> = [
  { name: "windels-na-east-prod", provider: "terraform", environment: "prod", path: "infra/terraform/environments/prod" },
  { name: "windels-na-east-staging", provider: "terraform", environment: "staging", path: "infra/terraform/environments/staging" },
  { name: "windels-na-east-dev", provider: "terraform", environment: "dev", path: "infra/terraform/environments/dev" },
  { name: "windels-eu-west-prod", provider: "terraform", environment: "eu", path: "infra/terraform/environments/eu" },
  { name: "windels-ap-south-prod", provider: "terraform", environment: "ap", path: "infra/terraform/environments/ap" },
  { name: "windels-k8s-base", provider: "helm", environment: "prod", path: "infra/k8s" },
  { name: "windels-monitoring", provider: "helm", environment: "prod", path: "infra/monitoring" },
];

export const IaCService = {
  async seed() {
    if (seeded) return; seeded = true;
    try {
      const existing = await redisCmd.exists(STACKS_KEY);
      if (existing) return;
    } catch { /* ignore */ }
    for (const d of DEFAULT_STACKS) {
      const stack: IaCStack = {
        id: randomUUID(), ...d,
        // Resource count comes from a real plan/apply; it was a random 20-100.
        // Drift is only true when a plan has actually reported it.
        status: "applied", driftDetected: false, updatedAt: now(),
      };
      await redisCmd.set(sk(stack.id), JSON.stringify(stack));
      await redisCmd.sadd(STACKS_KEY, stack.id);
    }
  },

  async list(): Promise<IaCStack[]> {
    await this.seed();
    const ids = await redisCmd.smembers(STACKS_KEY);
    const out: IaCStack[] = [];
    for (const id of ids) { const r = await redisCmd.get(sk(id)); if (r) out.push(JSON.parse(r)); }
    return out.sort((a,b)=>a.name.localeCompare(b.name));
  },
  async get(id: string): Promise<IaCStack|null> {
    await this.seed(); const r = await redisCmd.get(sk(id)); return r ? JSON.parse(r) : null;
  },

  async run(stackId: string, kind: "plan" | "apply", triggeredBy: string): Promise<IaCRun> {
    const stack = await this.get(stackId); if (!stack) throw new Error("stack not found");
    const id = randomUUID();
    const run: IaCRun = {
      // No terraform/pulumi/helm binary is invoked here, so the run is queued
      // for an external executor rather than reporting "succeeded" with an
      // invented diff (previously add 0-2 / change 0-4 / destroy 0-1 for a plan
      // that never ran). recordRun() writes the real outcome.
      id, stackId, kind, triggeredBy, status: "queued",
      startedAt: now(), logRef: `runs/${id}.log`,
    };
    stack.lastPlanId = kind === "plan" ? id : stack.lastPlanId;
    stack.lastApplyId = kind === "apply" ? id : stack.lastApplyId;
    // The stack state only advances once the executor reports back.
    stack.updatedAt = now();
    const multi = redisCmd.multi();
    multi.set(sk(stackId), JSON.stringify(stack));
    multi.set(rk(id), JSON.stringify(run));
    multi.sadd(RUNS_KEY, id);
    await multi.exec();
    return run;
  },

  /**
   * Record the outcome of a run executed by a real IaC tool. This is the
   * intake path that replaces the fabricated plan diff: the executor reports
   * the actual add/change/destroy counts, the managed resource total, and
   * whether the run succeeded.
   */
  async recordRun(
    runId: string,
    result: {
      status: "succeeded" | "failed" | "cancelled";
      summary?: { add: number; change: number; destroy: number };
      resources?: number;
      driftDetected?: boolean;
    },
  ): Promise<IaCRun | null> {
    const raw = await redisCmd.get(rk(runId));
    if (!raw) return null;
    const run = JSON.parse(raw) as IaCRun;
    run.status = result.status;
    run.summary = result.summary;
    run.finishedAt = now();
    await redisCmd.set(rk(runId), JSON.stringify(run));

    const stack = await this.get(run.stackId);
    if (stack) {
      if (result.status === "succeeded") {
        stack.status = (run.kind === "apply" ? "applied" : "planned") as IaCStatus;
      } else {
        stack.status = "failed" as IaCStatus;
      }
      if (result.resources !== undefined) stack.resources = result.resources;
      if (result.driftDetected !== undefined) stack.driftDetected = result.driftDetected;
      stack.updatedAt = now();
      await redisCmd.set(sk(run.stackId), JSON.stringify(stack));
    }
    return run;
  },

  async listRuns(stackId?: string): Promise<IaCRun[]> {
    await this.seed();
    const ids = await redisCmd.smembers(RUNS_KEY);
    const out: IaCRun[] = [];
    for (const id of ids) { const r = await redisCmd.get(rk(id)); if (r) { const run = JSON.parse(r); if (!stackId || run.stackId === stackId) out.push(run); } }
    return out.sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
  },

  async markDrift(stackId: string, drifted: boolean): Promise<IaCStack|null> {
    const s = await this.get(stackId); if (!s) return null;
    s.driftDetected = drifted; s.status = drifted ? "drifted" : "applied"; s.updatedAt = now();
    await redisCmd.set(sk(stackId), JSON.stringify(s));
    return s;
  },
};
