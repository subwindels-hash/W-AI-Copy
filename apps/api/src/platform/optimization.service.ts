/**
 * OptimizationService — Slice 184 (Resource Optimization).
 *
 * Generates right-sizing / cost / orphan recommendations based on cluster
 * state and seeded heuristics. Returns estimated monthly savings, tracks
 * open/applied/dismissed recommendations, and provides a simple cost
 * breakdown by service/region/resource.
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../db/redis.js";
import { ClusterService } from "./cluster.service.js";
import type {
  OptimizationRecommendation, RecommendationKind, RecommendationSeverity,
  RecommendationStatus, CostBreakdown,
} from "@windels/shared/infrastructure";

const REC_KEY = "infra:recs";
const REC_PREFIX = "infra:rec:";
const COST_KEY = "infra:cost:current";
let seeded = false;
function now(){return new Date().toISOString();}

export const OptimizationService = {
  async seed() {
    if (seeded) return; seeded = true;
    try { if (await redisCmd.exists(COST_KEY)) return; } catch {}
    const cost: CostBreakdown = {
      month: new Date().toISOString().slice(0,7),
      totalUsd: 14820,
      byService: { api: 5200, web: 1800, worker: 2600, data: 3200, observability: 1200, misc: 820 },
      byRegion: { "na-east-1": 7800, "na-west-2": 2600, "eu-west-1": 2300, "ap-south-1": 1500, "eu-central-1-dr": 620 },
      byResource: { compute: 8100, storage: 2800, network: 2300, managed: 1620 },
      forecastUsd: 15200,
    };
    await redisCmd.set(COST_KEY, JSON.stringify(cost));
  },

  async generate(): Promise<OptimizationRecommendation[]> {
    await this.seed(); await ClusterService.seed();
    const workloads = await ClusterService.listWorkloads();
    const pods = await ClusterService.listPods();
    const newRecs: OptimizationRecommendation[] = [];

    for (const w of workloads) {
      const wlPods = pods.filter((p) => p.workloadName === w.name);
      const avgCpuMs = wlPods.reduce((s,p)=>s+p.containers.reduce((a,c)=>a+c.cpuMs,0),0) / (wlPods.length || 1);
      const avgMem = wlPods.reduce((s,p)=>s+p.containers.reduce((a,c)=>a+c.memoryBytes,0),0) / (wlPods.length || 1);
      if (avgCpuMs < 100 && w.desiredReplicas > 2) {
        newRecs.push(mk("downsize-workload","medium",{kind:"workload",name:w.name,namespace:w.namespace},
          `${w.name} averages ${Math.round(avgCpuMs)}ms CPU across ${wlPods.length} pods — consider reducing replicas or requests.`,
          `Reducing ${w.name} from ${w.desiredReplicas} to ${Math.max(1,w.desiredReplicas-1)} replicas is projected to cut idle CPU spend.`,
          180, "low", { targetReplicas: Math.max(1,w.desiredReplicas-1), suggestedCpuMs: Math.round(avgCpuMs*1.3) }));
      } else if (avgCpuMs > 400 && w.availableReplicas >= w.desiredReplicas) {
        newRecs.push(mk("upsize-workload","high",{kind:"workload",name:w.name,namespace:w.namespace},
          `${w.name} is hot (avg ${Math.round(avgCpuMs)}ms CPU) — add replicas or raise CPU request.`,
          "Scale-out recommended to keep p95 latency under SLA.", 340, "medium",
          { targetReplicas: w.desiredReplicas+1 }));
      }
      if (avgMem > 400_000_000 && w.name.includes("worker")) {
        newRecs.push(mk("rebalance-pod","low",{kind:"workload",name:w.name,namespace:w.namespace},
          `${w.name} pods use >400MiB avg memory — spread across larger nodes.`,
          "Use node affinities to rebalance memory-heavy workers.", 60, "low", {}));
      }
    }
    // One synthetic orphaned resource
    newRecs.push(mk("orphan-resource","medium",{kind:"storage",name:"windels-old-pvc-2026-01"},"Orphaned PVC 'windels-old-pvc-2026-01' not mounted by any workload.",
      "Delete the PVC after confirming no workload requires the snapshot.", 90, "low", {}));
    newRecs.push(mk("spot-migration","high",{kind:"node",name:"windels-worker-2"},"worker-2 runs exclusively on-demand.",
      "Migrate stateless workloads to spot instances for ~60% compute savings.", 1250, "medium", { target: "spot-pool" }));
    newRecs.push(mk("storage-class","low",{kind:"storage",name:"gp3-migration"},"Several PVCs still use gp2 storage class.",
      "Migrate to gp3 for ~20% lower cost and higher baseline IOPS.", 140, "low", { targetClass: "gp3" }));

    for (const r of newRecs) {
      await redisCmd.set(REC_PREFIX+r.id, JSON.stringify(r));
      await redisCmd.sadd(REC_KEY, r.id);
    }
    return newRecs;
  },

  async list(filter?: { status?: RecommendationStatus; severity?: RecommendationSeverity; kind?: RecommendationKind }): Promise<OptimizationRecommendation[]> {
    await this.seed();
    const ids = await redisCmd.smembers(REC_KEY);
    if (ids.length === 0) await this.generate();
    const all = await Promise.all((await redisCmd.smembers(REC_KEY)).map(async (id) => {
      const r = await redisCmd.get(REC_PREFIX+id); return r?JSON.parse(r) as OptimizationRecommendation:null;
    }));
    let out = all.filter(Boolean) as OptimizationRecommendation[];
    if (filter?.status) out = out.filter((r) => r.status === filter.status);
    if (filter?.severity) out = out.filter((r) => r.severity === filter.severity);
    if (filter?.kind) out = out.filter((r) => r.kind === filter.kind);
    return out.sort((a,b)=>b.estimatedSavingsUsdPerMonth - a.estimatedSavingsUsdPerMonth);
  },

  async setStatus(id: string, status: RecommendationStatus): Promise<OptimizationRecommendation|null> {
    await this.seed();
    const r = await redisCmd.get(REC_PREFIX+id); if (!r) return null;
    const rec = JSON.parse(r) as OptimizationRecommendation;
    rec.status = status;
    await redisCmd.set(REC_PREFIX+id, JSON.stringify(rec));
    return rec;
  },

  async getCost(): Promise<CostBreakdown> {
    await this.seed();
    return JSON.parse((await redisCmd.get(COST_KEY))!);
  },

  async savings(): Promise<{ open: number; totalUsd: number }> {
    const recs = await this.list({ status: "open" });
    return { open: recs.length, totalUsd: recs.reduce((s,r)=>s+r.estimatedSavingsUsdPerMonth,0) };
  },
};

function mk(
  kind: RecommendationKind,
  severity: RecommendationSeverity,
  target: OptimizationRecommendation["target"],
  summary: string, details: string,
  savings: number, risk: "low"|"medium"|"high",
  suggestedAction: Record<string, unknown>,
): OptimizationRecommendation {
  return {
    id: randomUUID(), kind, severity, target, summary, details,
    estimatedSavingsUsdPerMonth: savings, risk, status: "open",
    suggestedAction, createdAt: now(),
  };
}
