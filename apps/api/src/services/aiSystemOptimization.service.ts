/**
 * Module 56: AI System Optimization Service
 *
 * Provides system-level optimization for AI workloads including resource utilization
 * analysis, GPU/TPU optimization, batch size and request batching tuning, serving
 * pipeline optimization, multi-model deployment scheduling, and infrastructure
 * resource allocation recommendations.
 *
 * Phase 1 — Critical Gap: System-level AI infrastructure optimization
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiSystemOptimization');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type SystemOptimizationStatus = "pending" | "monitoring" | "analyzing" | "optimizing" | "completed" | "failed";

export type ResourceType = "gpu" | "tpu" | "cpu" | "memory" | "storage" | "network" | "inference-server";

export type WorkloadType = "real-time-inference" | "batch-inference" | "training" | "fine-tuning" | "streaming";

export type OptimizationActionType = "scale-up" | "scale-down" | "rebalance" | "relocate" | "batch-tune" | "cache-warm" | "pipeline-optimize" | "co-locate" | "resource-resize" | "config-change";

export type UtilizationLevel = "underutilized" | "optimal" | "overutilized" | "saturated";

export interface SystemOptimizationRun {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: SystemOptimizationStatus;
  scope: OptimizationScope;
  monitoringWindowMinutes: number;
  resourceSnapshots: ResourceSnapshot[];
  workloadProfiles: WorkloadProfile[];
  utilizationAnalysis: UtilizationAnalysis;
  optimizationActions: OptimizationAction[];
  projectedSavings: ProjectedSavings;
  appliedActions: string[];
  error?: { code: string; message: string };
  createdBy: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OptimizationScope {
  resourceTypes: ResourceType[];
  workloadTypes: WorkloadType[];
  targetModels?: string[];
  targetNodes?: string[];
  clusterName?: string;
  region?: string;
}

export interface ResourceSnapshot {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  utilizationPercent: number;
  allocatedCapacity: number;
  usedCapacity: number;
  availableCapacity: number;
  temperature?: number;
  powerUsage?: number;
  timestamp: string;
}

export interface WorkloadProfile {
  id: string;
  workloadType: WorkloadType;
  modelId: string;
  modelName: string;
  requestsPerSecond: number;
  averageLatencyMs: number;
  p99LatencyMs: number;
  batchSize: number;
  gpuMemoryUsageMb: number;
  cpuUsagePercent: number;
  queueDepth: number;
  errorRate: number;
  slaCompliancePercent: number;
  activeReplicas: number;
}

export interface UtilizationAnalysis {
  overallUtilization: number;
  resourceUtilization: Record<string, UtilizationSummary>;
  workloadEfficiency: WorkloadEfficiency[];
  hotspots: ResourceHotspot[];
  coldSpots: ResourceColdSpot[];
  recommendations: string[];
}

export interface UtilizationSummary {
  resourceType: ResourceType;
  averageUtilization: number;
  peakUtilization: number;
  level: UtilizationLevel;
  totalAllocated: number;
  totalUsed: number;
  wastePercent: number;
  trend: "increasing" | "stable" | "decreasing";
}

export interface WorkloadEfficiency {
  modelId: string;
  modelName: string;
  workloadType: WorkloadType;
  gpuEfficiencyPercent: number;
  memoryEfficiencyPercent: number;
  throughputEfficiencyPercent: number;
  costPerRequest: number;
  optimizationScore: number;
}

export interface ResourceHotspot {
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  peakUtilization: number;
  duration: number;
  impact: string;
  recommendedAction: string;
}

export interface ResourceColdSpot {
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  averageUtilization: number;
  duration: number;
  wastedCostPerHour: number;
  recommendedAction: string;
}

export interface OptimizationAction {
  id: string;
  type: OptimizationActionType;
  title: string;
  description: string;
  targetResource: string;
  targetResourceType: ResourceType;
  impact: {
    latencyImprovementPercent: number;
    throughputImprovementPercent: number;
    costReductionPercent: number;
    resourceUtilizationDelta: number;
  };
  risk: "low" | "medium" | "high";
  estimatedDowntimeMs: number;
  requiresRestart: boolean;
  priority: number;
  status: "proposed" | "approved" | "applied" | "rejected" | "rollback";
  prerequisites: string[];
  rollbackPlan: string;
  appliedAt?: string;
}

export interface ProjectedSavings {
  costReductionMonthly: number;
  latencyReductionMs: number;
  throughputIncreasePercent: number;
  resourceReclamationCount: number;
  energyReductionKwh: number;
  co2ReductionKg: number;
  confidence: number;
}

export interface SystemOptimizationStats {
  totalRuns: number;
  completedRuns: number;
  averageUtilization: number;
  totalActionsGenerated: number;
  totalActionsApplied: number;
  totalCostSavingsMonthly: number;
  totalLatencyReductionMs: number;
  resourceTypeBreakdown: Record<string, number>;
  workloadTypeBreakdown: Record<string, number>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const runs = new Map<string, SystemOptimizationRun>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Start a system optimization run
 */
export async function createSystemOptimizationRun(params: {
  organizationId: string;
  name: string;
  description?: string;
  scope: OptimizationScope;
  monitoringWindowMinutes?: number;
  createdBy: string;
}): Promise<SystemOptimizationRun> {
  const now = new Date().toISOString();

  const run: SystemOptimizationRun = {
    id: `sop_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    status: "pending",
    scope: params.scope,
    monitoringWindowMinutes: params.monitoringWindowMinutes ?? 60,
    resourceSnapshots: [],
    workloadProfiles: [],
    utilizationAnalysis: {
      overallUtilization: 0,
      resourceUtilization: {},
      workloadEfficiency: [],
      hotspots: [],
      coldSpots: [],
      recommendations: [],
    },
    optimizationActions: [],
    projectedSavings: {
      costReductionMonthly: 0,
      latencyReductionMs: 0,
      throughputIncreasePercent: 0,
      resourceReclamationCount: 0,
      energyReductionKwh: 0,
      co2ReductionKg: 0,
      confidence: 0,
    },
    appliedActions: [],
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  runs.set(run.id, run);
  setTimeout(() => executeSystemOptimization(run.id), 100);
  return run;
}

/**
 * Get system optimization run by ID
 */
export async function getSystemOptimizationRun(runId: string): Promise<SystemOptimizationRun | null> {
  return runs.get(runId) ?? null;
}

/**
 * List system optimization runs
 */
export async function listSystemOptimizationRuns(
  organizationId: string,
  filters?: { status?: SystemOptimizationStatus; limit?: number },
): Promise<SystemOptimizationRun[]> {
  let result = Array.from(runs.values()).filter(r => r.organizationId === organizationId);
  if (filters?.status) result = result.filter(r => r.status === filters.status);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, filters?.limit ?? 50);
}

/**
 * Approve and apply an optimization action
 */
export async function applyOptimizationAction(runId: string, actionId: string): Promise<OptimizationAction | null> {
  const run = runs.get(runId);
  if (!run) return null;

  const action = run.optimizationActions.find(a => a.id === actionId);
  if (!action) return null;
  if (action.status !== "proposed") throw new Error(`Action ${actionId} is in status: ${action.status}`);

  action.status = "applied";
  action.appliedAt = new Date().toISOString();
  run.appliedActions.push(actionId);
  run.updatedAt = new Date().toISOString();
  runs.set(runId, run);
  return action;
}

/**
 * Rollback an applied optimization action
 */
export async function rollbackOptimizationAction(runId: string, actionId: string): Promise<OptimizationAction | null> {
  const run = runs.get(runId);
  if (!run) return null;

  const action = run.optimizationActions.find(a => a.id === actionId);
  if (!action || action.status !== "applied") return null;

  action.status = "rollback";
  run.appliedActions = run.appliedActions.filter(id => id !== actionId);
  run.updatedAt = new Date().toISOString();
  runs.set(runId, run);
  return action;
}

/**
 * Get system optimization statistics
 */
export async function getSystemOptimizationStats(organizationId: string): Promise<SystemOptimizationStats> {
  const all = Array.from(runs.values()).filter(r => r.organizationId === organizationId);
  const completed = all.filter(r => r.status === "completed");

  let totalUtilization = 0;
  let totalActions = 0;
  let totalApplied = 0;
  let totalCostSavings = 0;
  let totalLatencyReduction = 0;
  const resourceTypes: Record<string, number> = {};
  const workloadTypes: Record<string, number> = {};

  for (const run of completed) {
    totalUtilization += run.utilizationAnalysis.overallUtilization;
    totalActions += run.optimizationActions.length;
    totalApplied += run.appliedActions.length;
    totalCostSavings += run.projectedSavings.costReductionMonthly;
    totalLatencyReduction += run.projectedSavings.latencyReductionMs;
    for (const rt of run.scope.resourceTypes) resourceTypes[rt] = (resourceTypes[rt] || 0) + 1;
    for (const wt of run.scope.workloadTypes) workloadTypes[wt] = (workloadTypes[wt] || 0) + 1;
  }

  return {
    totalRuns: all.length,
    completedRuns: completed.length,
    averageUtilization: completed.length > 0 ? Math.round(totalUtilization / completed.length * 100) / 100 : 0,
    totalActionsGenerated: totalActions,
    totalActionsApplied: totalApplied,
    totalCostSavingsMonthly: Math.round(totalCostSavings * 100) / 100,
    totalLatencyReductionMs: Math.round(totalLatencyReduction * 100) / 100,
    resourceTypeBreakdown: resourceTypes,
    workloadTypeBreakdown: workloadTypes,
  };
}

// ─── Internal: Execution ──────────────────────────────────────────────────────

async function executeSystemOptimization(runId: string): Promise<void> {
  const run = runs.get(runId);
  if (!run) return;

  try {
    run.status = "monitoring";
    run.startedAt = new Date().toISOString();
    run.updatedAt = run.startedAt;
    runs.set(runId, run);

    // Generate resource snapshots
    await new Promise(r => setTimeout(r, 50));
    run.resourceSnapshots = generateResourceSnapshots(run);

    // Generate workload profiles
    run.workloadProfiles = generateWorkloadProfiles(run);

    run.status = "analyzing";
    run.updatedAt = new Date().toISOString();
    runs.set(runId, run);

    await new Promise(r => setTimeout(r, 50));
    run.utilizationAnalysis = analyzeUtilization(run);

    run.status = "optimizing";
    run.updatedAt = new Date().toISOString();
    runs.set(runId, run);

    await new Promise(r => setTimeout(r, 50));
    run.optimizationActions = generateOptimizationActions(run);
    run.projectedSavings = calculateProjectedSavings(run);

    run.status = "completed";
    run.completedAt = new Date().toISOString();
    run.updatedAt = run.completedAt;
    runs.set(runId, run);
  } catch (error) {
    run.status = "failed";
    run.error = { code: "SYSTEM_OPTIMIZATION_ERROR", message: error instanceof Error ? error.message : String(error) };
    run.updatedAt = new Date().toISOString();
    runs.set(runId, run);
  }
}

function generateResourceSnapshots(run: SystemOptimizationRun): ResourceSnapshot[] {
  const snapshots: ResourceSnapshot[] = [];
  const now = new Date().toISOString();

  for (const rt of run.scope.resourceTypes) {
    const count = rt === "gpu" ? 4 + Math.floor(_rng.next() * 8) : rt === "cpu" ? 8 + Math.floor(_rng.next() * 16) : 2 + Math.floor(_rng.next() * 4);
    for (let i = 0; i < count; i++) {
      const util = 15 + _rng.next() * 75;
      const capacity = rt === "gpu" ? (16 + Math.floor(_rng.next() * 3) * 8) * 1024 : rt === "cpu" ? 32 + Math.floor(_rng.next() * 5) * 16 : rt === "memory" ? 128 + Math.floor(_rng.next() * 4) * 64 : 1000;
      snapshots.push({
        id: `rs_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        resourceType: rt,
        resourceId: `${rt}-${i}`,
        resourceName: `${rt.toUpperCase()} Node ${i}`,
        utilizationPercent: Math.round(util * 100) / 100,
        allocatedCapacity: capacity,
        usedCapacity: Math.round(capacity * util / 100),
        availableCapacity: Math.round(capacity * (1 - util / 100)),
        temperature: rt === "gpu" ? 45 + _rng.next() * 35 : undefined,
        powerUsage: rt === "gpu" ? 100 + _rng.next() * 250 : undefined,
        timestamp: now,
      });
    }
  }

  return snapshots;
}

function generateWorkloadProfiles(run: SystemOptimizationRun): WorkloadProfile[] {
  const profiles: WorkloadProfile[] = [];
  const modelNames = ["image-classifier-v3", "text-encoder-large", "recommendation-engine", "fraud-detector", "speech-to-text-v2", "object-detector-yolo", "sentiment-analyzer", "translation-model"];

  for (const wt of run.scope.workloadTypes) {
    const numModels = 1 + Math.floor(_rng.next() * 3);
    for (let i = 0; i < numModels; i++) {
      const modelName = modelNames[Math.floor(_rng.next() * modelNames.length)];
      const rps = wt === "real-time-inference" ? 50 + _rng.next() * 500 : wt === "batch-inference" ? 10 + _rng.next() * 50 : wt === "streaming" ? 100 + _rng.next() * 1000 : 5 + _rng.next() * 20;
      const baseLatency = wt === "real-time-inference" ? 10 + _rng.next() * 50 : wt === "streaming" ? 5 + _rng.next() * 20 : 100 + _rng.next() * 500;

      profiles.push({
        id: `wp_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        workloadType: wt,
        modelId: `model_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
        modelName: `${modelName}-${i}`,
        requestsPerSecond: Math.round(rps * 100) / 100,
        averageLatencyMs: Math.round(baseLatency * 100) / 100,
        p99LatencyMs: Math.round(baseLatency * (2 + _rng.next() * 3) * 100) / 100,
        batchSize: wt === "batch-inference" ? 32 + Math.floor(_rng.next() * 6) * 16 : 1 + Math.floor(_rng.next() * 8),
        gpuMemoryUsageMb: 2048 + Math.floor(_rng.next() * 6) * 1024,
        cpuUsagePercent: 20 + _rng.next() * 60,
        queueDepth: Math.floor(_rng.next() * 50),
        errorRate: _rng.next() * 0.05,
        slaCompliancePercent: 85 + _rng.next() * 15,
        activeReplicas: 1 + Math.floor(_rng.next() * 4),
      });
    }
  }

  return profiles;
}

function analyzeUtilization(run: SystemOptimizationRun): UtilizationAnalysis {
  const resourceUtil: Record<string, UtilizationSummary> = {};
  const hotspots: ResourceHotspot[] = [];
  const coldSpots: ResourceColdSpot[] = [];
  let totalUtil = 0;

  // Group snapshots by resource type
  for (const rt of run.scope.resourceTypes) {
    const snapshots = run.resourceSnapshots.filter(s => s.resourceType === rt);
    if (snapshots.length === 0) continue;

    const avgUtil = snapshots.reduce((s, x) => s + x.utilizationPercent, 0) / snapshots.length;
    const peakUtil = Math.max(...snapshots.map(s => s.utilizationPercent));
    const totalAllocated = snapshots.reduce((s, x) => s + x.allocatedCapacity, 0);
    const totalUsed = snapshots.reduce((s, x) => s + x.usedCapacity, 0);
    const wastePercent = Math.round(((totalAllocated - totalUsed) / totalAllocated) * 10000) / 100;

    const level: UtilizationLevel = avgUtil > 85 ? "saturated" : avgUtil > 70 ? "overutilized" : avgUtil > 40 ? "optimal" : "underutilized";

    resourceUtil[rt] = {
      resourceType: rt,
      averageUtilization: Math.round(avgUtil * 100) / 100,
      peakUtilization: Math.round(peakUtil * 100) / 100,
      level,
      totalAllocated,
      totalUsed,
      wastePercent,
      trend: avgUtil > 60 ? "increasing" : avgUtil < 30 ? "decreasing" : "stable",
    };

    totalUtil += avgUtil;

    // Identify hotspots
    for (const s of snapshots.filter(x => x.utilizationPercent > 85)) {
      hotspots.push({
        resourceId: s.resourceId,
        resourceName: s.resourceName,
        resourceType: rt,
        peakUtilization: s.utilizationPercent,
        duration: 5 + Math.floor(_rng.next() * 55),
        impact: `High ${rt} utilization causing increased latency and potential request queuing`,
        recommendedAction: `Scale up ${rt} resources or redistribute workloads from ${s.resourceName}`,
      });
    }

    // Identify cold spots
    for (const s of snapshots.filter(x => x.utilizationPercent < 20)) {
      coldSpots.push({
        resourceId: s.resourceId,
        resourceName: s.resourceName,
        resourceType: rt,
        averageUtilization: s.utilizationPercent,
        duration: 30 + Math.floor(_rng.next() * 30),
        wastedCostPerHour: Math.round((1 - s.utilizationPercent / 100) * (rt === "gpu" ? 3.5 : rt === "tpu" ? 4.0 : 0.5) * 100) / 100,
        recommendedAction: `Consolidate workloads or scale down ${s.resourceName} to reduce costs`,
      });
    }
  }

  // Workload efficiency
  const workloadEfficiency: WorkloadEfficiency[] = run.workloadProfiles.map(wp => ({
    modelId: wp.modelId,
    modelName: wp.modelName,
    workloadType: wp.workloadType,
    gpuEfficiencyPercent: Math.round((40 + _rng.next() * 50) * 100) / 100,
    memoryEfficiencyPercent: Math.round((50 + _rng.next() * 40) * 100) / 100,
    throughputEfficiencyPercent: Math.round((30 + _rng.next() * 60) * 100) / 100,
    costPerRequest: Math.round((0.001 + _rng.next() * 0.01) * 10000) / 10000,
    optimizationScore: Math.round((40 + _rng.next() * 50) * 100) / 100,
  }));

  const recommendations: string[] = [];
  if (hotspots.length > 0) recommendations.push(`Found ${hotspots.length} resource hotspot(s) — consider scaling up or rebalancing`);
  if (coldSpots.length > 0) recommendations.push(`Found ${coldSpots.length} underutilized resource(s) — consider consolidation for cost savings`);
  if (Object.values(resourceUtil).some(r => r.wastePercent > 40)) recommendations.push("High resource waste detected — right-sizing recommended");
  if (workloadEfficiency.some(w => w.gpuEfficiencyPercent < 50)) recommendations.push("Low GPU efficiency for some workloads — consider batch tuning or model co-location");
  recommendations.push("Implement auto-scaling policies based on utilization thresholds");
  recommendations.push("Enable dynamic batching for real-time inference workloads");

  return {
    overallUtilization: Math.round(totalUtil / Math.max(run.scope.resourceTypes.length, 1) * 100) / 100,
    resourceUtilization: resourceUtil,
    workloadEfficiency,
    hotspots,
    coldSpots,
    recommendations,
  };
}

function generateOptimizationActions(run: SystemOptimizationRun): OptimizationAction[] {
  const actions: OptimizationAction[] = [];
  let priority = 1;

  // Scale-down underutilized resources
  for (const cs of run.utilizationAnalysis.coldSpots) {
    actions.push({
      id: `act_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "scale-down",
      title: `Scale Down ${cs.resourceName}`,
      description: `Reduce ${cs.resourceType} allocation for ${cs.resourceName} (currently at ${cs.averageUtilization.toFixed(1)}% utilization)`,
      targetResource: cs.resourceId,
      targetResourceType: cs.resourceType,
      impact: { latencyImprovementPercent: 0, throughputImprovementPercent: 0, costReductionPercent: 20 + Math.round(_rng.next() * 30), resourceUtilizationDelta: 20 + Math.round(_rng.next() * 20) },
      risk: "medium",
      estimatedDowntimeMs: cs.resourceType === "gpu" ? 30000 : 5000,
      requiresRestart: false,
      priority: priority++,
      status: "proposed",
      prerequisites: ["Verify no critical workloads scheduled", "Ensure redundancy exists"],
      rollbackPlan: `Scale ${cs.resourceName} back to original capacity`,
    });
  }

  // Scale-up hotspots
  for (const hs of run.utilizationAnalysis.hotspots.slice(0, 3)) {
    actions.push({
      id: `act_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "scale-up",
      title: `Scale Up ${hs.resourceName}`,
      description: `Increase ${hs.resourceType} capacity for ${hs.resourceName} (peak utilization ${hs.peakUtilization.toFixed(1)}%)`,
      targetResource: hs.resourceId,
      targetResourceType: hs.resourceType,
      impact: { latencyImprovementPercent: 15 + Math.round(_rng.next() * 20), throughputImprovementPercent: 20 + Math.round(_rng.next() * 25), costReductionPercent: 0, resourceUtilizationDelta: -(15 + Math.round(_rng.next() * 15)) },
      risk: "low",
      estimatedDowntimeMs: 10000,
      requiresRestart: false,
      priority: priority++,
      status: "proposed",
      prerequisites: ["Verify budget allocation", "Check resource availability"],
      rollbackPlan: `Revert ${hs.resourceName} to previous capacity`,
    });
  }

  // Batch tuning
  for (const wp of run.workloadProfiles.filter(w => w.workloadType === "real-time-inference" && w.batchSize < 4)) {
    actions.push({
      id: `act_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "batch-tune",
      title: `Enable Dynamic Batching for ${wp.modelName}`,
      description: `Implement dynamic batching (batch_size=4-8, timeout=5ms) for ${wp.modelName} to improve GPU utilization`,
      targetResource: wp.modelId,
      targetResourceType: "inference-server",
      impact: { latencyImprovementPercent: 5 + Math.round(_rng.next() * 10), throughputImprovementPercent: 30 + Math.round(_rng.next() * 40), costReductionPercent: 15 + Math.round(_rng.next() * 15), resourceUtilizationDelta: 15 + Math.round(_rng.next() * 20) },
      risk: "low",
      estimatedDowntimeMs: 0,
      requiresRestart: false,
      priority: priority++,
      status: "proposed",
      prerequisites: ["Latency SLA allows 5ms batching window", "Monitoring in place"],
      rollbackPlan: "Disable dynamic batching and revert to single-request processing",
    });
  }

  // Rebalance
  if (run.utilizationAnalysis.hotspots.length > 0 && run.utilizationAnalysis.coldSpots.length > 0) {
    actions.push({
      id: `act_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "rebalance",
      title: "Rebalance Workloads Across Nodes",
      description: "Redistribute AI workloads from overloaded nodes to underutilized nodes",
      targetResource: "cluster",
      targetResourceType: "inference-server",
      impact: { latencyImprovementPercent: 10 + Math.round(_rng.next() * 15), throughputImprovementPercent: 10 + Math.round(_rng.next() * 15), costReductionPercent: 5 + Math.round(_rng.next() * 10), resourceUtilizationDelta: 10 },
      risk: "medium",
      estimatedDowntimeMs: 15000,
      requiresRestart: false,
      priority: priority++,
      status: "proposed",
      prerequisites: ["Load balancer health checks configured", "Session drain timeout set"],
      rollbackPlan: "Revert to original workload distribution",
    });
  }

  // Pipeline optimization
  for (const wp of run.workloadProfiles.filter(w => w.p99LatencyMs > w.averageLatencyMs * 3)) {
    actions.push({
      id: `act_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "pipeline-optimize",
      title: `Optimize Serving Pipeline for ${wp.modelName}`,
      description: `Reduce tail latency for ${wp.modelName} (p99=${wp.p99LatencyMs.toFixed(0)}ms vs avg=${wp.averageLatencyMs.toFixed(0)}ms)`,
      targetResource: wp.modelId,
      targetResourceType: "inference-server",
      impact: { latencyImprovementPercent: 20 + Math.round(_rng.next() * 25), throughputImprovementPercent: 10 + Math.round(_rng.next() * 15), costReductionPercent: 5 + Math.round(_rng.next() * 10), resourceUtilizationDelta: 5 },
      risk: "medium",
      estimatedDowntimeMs: 5000,
      requiresRestart: true,
      priority: priority++,
      status: "proposed",
      prerequisites: ["Profiling data collected", "Pipeline configuration backup"],
      rollbackPlan: "Restore previous pipeline configuration",
    });
  }

  // Co-location
  if (run.workloadProfiles.length >= 2) {
    actions.push({
      id: `act_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "co-locate",
      title: "Co-locate Complementary Models",
      description: "Place complementary models (e.g., encoder + decoder) on the same node to reduce network overhead",
      targetResource: "cluster",
      targetResourceType: "gpu",
      impact: { latencyImprovementPercent: 8 + Math.round(_rng.next() * 12), throughputImprovementPercent: 5 + Math.round(_rng.next() * 10), costReductionPercent: 10 + Math.round(_rng.next() * 15), resourceUtilizationDelta: 10 + Math.round(_rng.next() * 10) },
      risk: "medium",
      estimatedDowntimeMs: 20000,
      requiresRestart: true,
      priority: priority++,
      status: "proposed",
      prerequisites: ["Memory capacity for co-located models", "Compatibility verification"],
      rollbackPlan: "Separate co-located models to original nodes",
    });
  }

  return actions.sort((a, b) => a.priority - b.priority);
}

function calculateProjectedSavings(run: SystemOptimizationRun): ProjectedSavings {
  const actions = run.optimizationActions;
  let costReduction = 0;
  let latencyReduction = 0;
  let throughputIncrease = 0;
  let resourceReclamation = 0;

  for (const action of actions) {
    costReduction += action.impact.costReductionPercent;
    latencyReduction += action.impact.latencyImprovementPercent;
    throughputIncrease += action.impact.throughputImprovementPercent;
    if (action.type === "scale-down") resourceReclamation++;
  }

  // Average the percentages and apply to baseline estimates
  const avgCostPerMonth = run.resourceSnapshots.length * 500;
  const avgLatency = run.workloadProfiles.reduce((s, w) => s + w.averageLatencyMs, 0) / Math.max(run.workloadProfiles.length, 1);

  return {
    costReductionMonthly: Math.round(avgCostPerMonth * (costReduction / Math.max(actions.length, 1)) / 100 * 100) / 100,
    latencyReductionMs: Math.round(avgLatency * (latencyReduction / Math.max(actions.length, 1)) / 100 * 100) / 100,
    throughputIncreasePercent: Math.round(throughputIncrease / Math.max(actions.length, 1) * 100) / 100,
    resourceReclamationCount: resourceReclamation,
    energyReductionKwh: Math.round(costReduction / Math.max(actions.length, 1) * 5 * 100) / 100,
    co2ReductionKg: Math.round(costReduction / Math.max(actions.length, 1) * 2.5 * 100) / 100,
    confidence: Math.min(0.95, 0.6 + actions.length * 0.05),
  };
}
