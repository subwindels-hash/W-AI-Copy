/**
 * Module 91: AI Performance Profiling Service
 *
 * Provides comprehensive performance profiling for AI models including layer-by-layer
 * execution timing, memory allocation profiling, GPU kernel profiling, compute
 * utilization analysis, I/O profiling for data pipelines, and profiling session
 * management with historical comparison.
 *
 * Phase 1 — Layer-by-layer profiling with timing, memory, and GPU utilization
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiPerformanceProfiling');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type ProfilingSessionStatus = "idle" | "recording" | "paused" | "completed" | "failed" | "exported";

export type ProfilingMode = "inference" | "training" | "both";

export type ProfilingGranularity = "layer" | "operation" | "kernel" | "sub-operation";

export type ResourceType = "cpu" | "gpu" | "memory" | "io" | "network" | "tpu";

export type ProfilingScope = "forward-pass" | "backward-pass" | "data-loading" | "preprocessing" | "postprocessing" | "full-pipeline";

export type MemoryAccessType = "allocation" | "deallocation" | "transfer-host-to-device" | "transfer-device-to-host" | "transfer-device-to-device" | "cache-hit" | "cache-miss";

export type ComputeUnitType = "cuda-core" | "tensor-core" | "cpu-fp32" | "cpu-fp64" | "cpu-int8" | "tpu-mx" | "npu";

export interface ProfilingSession {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  modelId: string;
  modelName: string;
  framework: string;
  mode: ProfilingMode;
  granularity: ProfilingGranularity;
  status: ProfilingSessionStatus;
  config: ProfilingConfig;
  layerProfiles: LayerProfile[];
  memoryProfile: MemoryProfile | null;
  gpuProfile: GPUProfile | null;
  ioProfile: IOProfile | null;
  summary: ProfilingSummary | null;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfilingConfig {
  mode: ProfilingMode;
  granularity: ProfilingGranularity;
  scopes: ProfilingScope[];
  collectMemoryProfile: boolean;
  collectGPUProfile: boolean;
  collectIOProfile: boolean;
  warmupIterations: number;
  profileIterations: number;
  batchSize: number;
  inputShape: number[];
  hardwareTarget: string;
  samplingRate: number;
  enableKernelProfiling: boolean;
  enableMemoryTracing: boolean;
}

export interface LayerProfile {
  id: string;
  sessionId: string;
  layerName: string;
  layerIndex: number;
  layerType: string;
  operationType: string;
  timing: LayerTiming;
  compute: ComputeProfile;
  memory: LayerMemoryProfile;
  inputShapes: number[][];
  outputShape: number[];
  parameters: number;
  flopsEstimate: number;
  utilizationScore: number;
  bottleneckScore: number;
  metadata: Record<string, unknown>;
}

export interface LayerTiming {
  totalMs: number;
  computeMs: number;
  memoryAccessMs: number;
  synchronizationMs: number;
  dataTransferMs: number;
  overheadMs: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  stdMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  samples: number;
  percentageOfTotal: number;
  timeline: Array<{ iteration: number; duration: number; timestamp: string }>;
}

export interface ComputeProfile {
  totalFlops: number;
  achievedFlops: number;
  peakFlops: number;
  utilizationPercent: number;
  computeUnits: ComputeUnitType;
  computeUnitCount: number;
  computeUnitUtilization: number;
  parallelismEfficiency: number;
  vectorizationEfficiency: number;
  rooflineAnalysis: RooflinePoint;
}

export interface RooflinePoint {
  arithmeticIntensity: number;
  achievedPerformance: number;
  peakPerformance: number;
  memoryBandwidthBound: boolean;
  computeBound: boolean;
  distanceFromRoof: number;
  optimizationPotential: number;
}

export interface LayerMemoryProfile {
  peakMemoryBytes: number;
  averageMemoryBytes: number;
  allocatedBytes: number;
  freedBytes: number;
  fragmentation: number;
  cacheHitRate: number;
  memoryBandwidthBytesPerSec: number;
  memoryAccessPattern: "sequential" | "strided" | "random" | "mixed";
  temporaryBuffers: number;
  temporaryBufferSize: number;
}

export interface MemoryProfile {
  totalAllocatedBytes: number;
  peakUsageBytes: number;
  hostMemoryBytes: number;
  deviceMemoryBytes: number;
  sharedMemoryBytes: number;
  cacheMemoryBytes: number;
  allocationEvents: MemoryEvent[];
  fragmentationScore: number;
  memoryEfficiency: number;
  timeline: MemoryTimelinePoint[];
  breakdownByLayer: Array<{ layerName: string; bytes: number; percentage: number }>;
}

export interface MemoryEvent {
  id: string;
  type: MemoryAccessType;
  size: number;
  address: string;
  layerName: string;
  timestamp: string;
  durationMs: number;
  metadata: Record<string, unknown>;
}

export interface MemoryTimelinePoint {
  timestamp: string;
  usedBytes: number;
  allocatedBytes: number;
  freeBytes: number;
  fragmentation: number;
}

export interface GPUProfile {
  deviceName: string;
  deviceType: string;
  totalMemoryBytes: number;
  peakMemoryBytes: number;
  peakUtilization: number;
  averageUtilization: number;
  smUtilization: number;
  memoryControllerUtilization: number;
  pcieBandwidthUtilization: number;
  kernelProfiles: KernelProfile[];
  powerConsumption: PowerProfile;
  temperature: TemperatureProfile;
  timeline: GPUTimelinePoint[];
}

export interface KernelProfile {
  id: string;
  kernelName: string;
  layerName: string;
  invocations: number;
  totalTimeMs: number;
  averageTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  registersPerThread: number;
  sharedMemoryBytes: number;
  occupancy: number;
  warpEfficiency: number;
  memoryThroughput: number;
  computeThroughput: number;
}

export interface PowerProfile {
  averageWatts: number;
  peakWatts: number;
  totalEnergyJoules: number;
  energyPerInferenceMj: number;
  powerLimitWatts: number;
  powerUtilization: number;
}

export interface TemperatureProfile {
  averageCelsius: number;
  peakCelsius: number;
  throttleEvents: number;
  thermalThrottlingPercent: number;
}

export interface GPUTimelinePoint {
  timestamp: string;
  smUtilization: number;
  memoryUtilization: number;
  memoryUsedBytes: number;
  powerWatts: number;
  temperatureCelsius: number;
}

export interface IOProfile {
  dataLoadTimeMs: number;
  dataLoadBandwidthMBps: number;
  preprocessingTimeMs: number;
  pipelineUtilization: number;
  dataQueueDepth: number;
  prefetchHitRate: number;
  cacheHitRate: number;
  ioWaitPercent: number;
  storageType: "ssd" | "nvme" | "network" | "memory";
  throughputBreakdown: Array<{ stage: string; timeMs: number; percentage: number }>;
}

export interface ProfilingSummary {
  totalDurationMs: number;
  totalIterations: number;
  averageIterationMs: number;
  throughputInferencesPerSec: number;
  peakMemoryUsageBytes: number;
  gpuUtilizationAverage: number;
  cpuUtilizationAverage: number;
  topBottleneckLayers: Array<{ layerName: string; percentageOfTotal: number; type: string }>;
  optimizationScore: number;
  efficiencyScore: number;
  recommendations: string[];
  comparisonWithBaseline: ProfilingComparison | null;
}

export interface ProfilingComparison {
  baselineSessionId: string;
  baselineName: string;
  latencyChangePercent: number;
  throughputChangePercent: number;
  memoryChangePercent: number;
  gpuUtilizationChangePercent: number;
  improvedLayers: Array<{ name: string; improvementPercent: number }>;
  degradedLayers: Array<{ name: string; degradationPercent: number }>;
  overallVerdict: "improved" | "degraded" | "similar" | "mixed";
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const profilingSessions = new Map<string, ProfilingSession>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateLayerTiming(baseTimeMs: number): LayerTiming {
  const computeMs = baseTimeMs * (0.6 + _rng.next() * 0.2);
  const memoryAccessMs = baseTimeMs * (0.05 + _rng.next() * 0.1);
  const syncMs = baseTimeMs * (0.02 + _rng.next() * 0.05);
  const transferMs = baseTimeMs * (0.02 + _rng.next() * 0.05);
  const overheadMs = baseTimeMs - computeMs - memoryAccessMs - syncMs - transferMs;
  const samples = 100;
  const timings = Array.from({ length: samples }, () => baseTimeMs * (0.9 + _rng.next() * 0.2));
  timings.sort((a, b) => a - b);
  return {
    totalMs: baseTimeMs,
    computeMs,
    memoryAccessMs,
    synchronizationMs: syncMs,
    dataTransferMs: transferMs,
    overheadMs: Math.max(0, overheadMs),
    averageMs: timings.reduce((a, b) => a + b, 0) / samples,
    minMs: timings[0],
    maxMs: timings[samples - 1],
    stdMs: Math.sqrt(timings.reduce((acc, t) => acc + (t - baseTimeMs) ** 2, 0) / samples),
    p50Ms: timings[Math.floor(samples * 0.5)],
    p90Ms: timings[Math.floor(samples * 0.9)],
    p95Ms: timings[Math.floor(samples * 0.95)],
    p99Ms: timings[Math.floor(samples * 0.99)],
    samples,
    percentageOfTotal: 0,
    timeline: timings.slice(0, 10).map((d, i) => ({
      iteration: i,
      duration: d,
      timestamp: new Date(Date.now() - (10 - i) * 1000).toISOString(),
    })),
  };
}

function generateComputeProfile(layerType: string, flops: number): ComputeProfile {
  const peakFlops = 312e12; // A100 TF32 peak
  const utilPercent = layerType === "attention" ? 0.65 + _rng.next() * 0.2 :
                      layerType === "dense" ? 0.55 + _rng.next() * 0.25 :
                      0.3 + _rng.next() * 0.4;
  const achievedFlops = flops * utilPercent;
  const arithIntensity = flops / (flops * 0.001 + 1);
  const memBound = arithIntensity < 100;
  return {
    totalFlops: flops,
    achievedFlops,
    peakFlops,
    utilizationPercent: utilPercent * 100,
    computeUnits: "tensor-core",
    computeUnitCount: 108,
    computeUnitUtilization: utilPercent * 0.9,
    parallelismEfficiency: 0.7 + _rng.next() * 0.2,
    vectorizationEfficiency: 0.6 + _rng.next() * 0.3,
    rooflineAnalysis: {
      arithmeticIntensity: arithIntensity,
      achievedPerformance: achievedFlops,
      peakPerformance: peakFlops,
      memoryBandwidthBound: memBound,
      computeBound: !memBound,
      distanceFromRoof: 1 - (achievedFlops / peakFlops),
      optimizationPotential: (1 - utilPercent) * 0.6,
    },
  };
}

// ─── Profiling Session Management ─────────────────────────────────────────────

export async function createProfilingSession(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelName: string;
  framework: string;
  config?: Partial<ProfilingConfig>;
}): Promise<ProfilingSession> {
  const now = new Date().toISOString();
  const defaultConfig: ProfilingConfig = {
    mode: "inference",
    granularity: "layer",
    scopes: ["forward-pass"],
    collectMemoryProfile: true,
    collectGPUProfile: true,
    collectIOProfile: true,
    warmupIterations: 10,
    profileIterations: 100,
    batchSize: 1,
    inputShape: [1, 128, 512],
    hardwareTarget: "gpu-a100",
    samplingRate: 1000,
    enableKernelProfiling: true,
    enableMemoryTracing: true,
  };
  const session: ProfilingSession = {
    id: `ps_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description || "",
    modelId: params.modelId,
    modelName: params.modelName,
    framework: params.framework,
    mode: params.config?.mode || "inference",
    granularity: params.config?.granularity || "layer",
    status: "idle",
    config: { ...defaultConfig, ...params.config },
    layerProfiles: [],
    memoryProfile: null,
    gpuProfile: null,
    ioProfile: null,
    summary: null,
    startedAt: null,
    completedAt: null,
    duration: null,
    createdAt: now,
    updatedAt: now,
  };
  profilingSessions.set(session.id, session);
  return session;
}

export async function getProfilingSession(sessionId: string): Promise<ProfilingSession | null> {
  return profilingSessions.get(sessionId) || null;
}

export async function listProfilingSessions(organizationId: string): Promise<ProfilingSession[]> {
  return Array.from(profilingSessions.values()).filter((s) => s.organizationId === organizationId);
}

export async function startProfilingSession(sessionId: string): Promise<ProfilingSession> {
  const session = profilingSessions.get(sessionId);
  if (!session) throw new Error(`Profiling session ${sessionId} not found`);
  if (session.status !== "idle" && session.status !== "completed") {
    throw new Error(`Cannot start session in status: ${session.status}`);
  }
  const now = new Date().toISOString();
  session.status = "recording";
  session.startedAt = now;
  session.layerProfiles = [];
  session.memoryProfile = null;
  session.gpuProfile = null;
  session.ioProfile = null;
  session.summary = null;
  session.updatedAt = now;
  return session;
}

export async function completeProfilingSession(sessionId: string): Promise<ProfilingSession> {
  const session = profilingSessions.get(sessionId);
  if (!session) throw new Error(`Profiling session ${sessionId} not found`);
  if (session.status !== "recording" && session.status !== "paused") {
    throw new Error(`Cannot complete session in status: ${session.status}`);
  }
  const now = new Date().toISOString();
  // Generate layer profiles
  const layers = generateLayerProfiles(session);
  session.layerProfiles = layers;
  // Generate memory profile
  if (session.config.collectMemoryProfile) {
    session.memoryProfile = generateMemoryProfile(session, layers);
  }
  // Generate GPU profile
  if (session.config.collectGPUProfile) {
    session.gpuProfile = generateGPUProfile(session, layers);
  }
  // Generate IO profile
  if (session.config.collectIOProfile) {
    session.ioProfile = generateIOProfile(session);
  }
  // Generate summary
  session.summary = generateProfilingSummary(session, layers);
  session.status = "completed";
  session.completedAt = now;
  session.duration = session.startedAt
    ? new Date(now).getTime() - new Date(session.startedAt).getTime()
    : null;
  session.updatedAt = now;
  return session;
}

function generateLayerProfiles(session: ProfilingSession): LayerProfile[] {
  const layerDefs = [
    { name: "input_embedding", type: "embedding", op: "embedding_lookup", params: 25_600_000, flops: 1e8 },
    { name: "positional_encoding", type: "positional", op: "add", params: 0, flops: 1e6 },
    { name: "attention_layer_1_qkv", type: "attention", op: "linear_projection", params: 786_432, flops: 2e10 },
    { name: "attention_layer_1_scores", type: "attention", op: "matmul_softmax", params: 0, flops: 5e9 },
    { name: "attention_layer_1_output", type: "attention", op: "matmul_linear", params: 262_144, flops: 2e10 },
    { name: "layer_norm_1", type: "normalization", op: "layer_norm", params: 1_024, flops: 1e7 },
    { name: "feed_forward_1_expand", type: "dense", op: "linear_relu", params: 2_097_152, flops: 4e10 },
    { name: "feed_forward_1_project", type: "dense", op: "linear", params: 2_097_152, flops: 4e10 },
    { name: "layer_norm_2", type: "normalization", op: "layer_norm", params: 1_024, flops: 1e7 },
    { name: "attention_layer_2_qkv", type: "attention", op: "linear_projection", params: 786_432, flops: 2e10 },
    { name: "attention_layer_2_scores", type: "attention", op: "matmul_softmax", params: 0, flops: 5e9 },
    { name: "attention_layer_2_output", type: "attention", op: "matmul_linear", params: 262_144, flops: 2e10 },
    { name: "output_projection", type: "dense", op: "linear", params: 25_600_000, flops: 5e10 },
    { name: "softmax", type: "activation", op: "softmax", params: 0, flops: 1e6 },
  ];
  const totalBaseMs = 15 + _rng.next() * 10; // 15-25ms total inference
  const weights = layerDefs.map((l) =>
    l.type === "attention" ? 1.5 : l.type === "dense" ? 1.3 : l.type === "embedding" ? 0.8 : 0.3
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return layerDefs.map((def, idx) => {
    const baseTimeMs = (totalBaseMs * weights[idx]) / totalWeight;
    const timing = generateLayerTiming(baseTimeMs);
    const totalTime = layerDefs.reduce((acc, _, i) => acc + (totalBaseMs * weights[i]) / totalWeight, 0);
    timing.percentageOfTotal = (baseTimeMs / totalTime) * 100;
    const compute = generateComputeProfile(def.type, def.flops);
    const memProfile: LayerMemoryProfile = {
      peakMemoryBytes: Math.floor(def.flops * 0.0001 + _rng.next() * 10_000_000),
      averageMemoryBytes: Math.floor(def.flops * 0.00005 + _rng.next() * 5_000_000),
      allocatedBytes: def.params * 4 + Math.floor(_rng.next() * 1_000_000),
      freedBytes: Math.floor(_rng.next() * 500_000),
      fragmentation: _rng.next() * 0.15,
      cacheHitRate: 0.7 + _rng.next() * 0.25,
      memoryBandwidthBytesPerSec: 1.5e12 * (0.3 + _rng.next() * 0.5),
      memoryAccessPattern: def.type === "attention" ? "mixed" : "sequential",
      temporaryBuffers: Math.floor(_rng.next() * 5) + 1,
      temporaryBufferSize: Math.floor(_rng.next() * 2_000_000) + 100_000,
    };
    const bottleneckScore = timing.percentageOfTotal * (1 + (1 - compute.utilizationPercent / 100) * 0.5);
    return {
      id: `lp_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      sessionId: session.id,
      layerName: def.name,
      layerIndex: idx,
      layerType: def.type,
      operationType: def.op,
      timing,
      compute,
      memory: memProfile,
      inputShapes: [[session.config.batchSize, 128, 512]],
      outputShape: [session.config.batchSize, 128, 512],
      parameters: def.params,
      flopsEstimate: def.flops,
      utilizationScore: compute.utilizationPercent,
      bottleneckScore,
      metadata: { framework: session.framework },
    };
  });
}

function generateMemoryProfile(session: ProfilingSession, layers: LayerProfile[]): MemoryProfile {
  const totalAlloc = layers.reduce((acc, l) => acc + l.memory.allocatedBytes, 0);
  const peakUsage = Math.floor(totalAlloc * (1.2 + _rng.next() * 0.3));
  const now = new Date().toISOString();
  return {
    totalAllocatedBytes: totalAlloc,
    peakUsageBytes: peakUsage,
    hostMemoryBytes: Math.floor(totalAlloc * 0.3),
    deviceMemoryBytes: Math.floor(totalAlloc * 0.65),
    sharedMemoryBytes: Math.floor(totalAlloc * 0.03),
    cacheMemoryBytes: Math.floor(totalAlloc * 0.02),
    allocationEvents: Array.from({ length: 20 }, (_, i) => ({
      id: `me_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: (["allocation", "deallocation", "transfer-host-to-device", "transfer-device-to-host"] as MemoryAccessType[])[i % 4],
      size: Math.floor(_rng.next() * 10_000_000) + 100_000,
      address: `0x${Math.floor(_rng.next() * 0xffffffff).toString(16)}`,
      layerName: layers[i % layers.length].layerName,
      timestamp: new Date(Date.now() - (20 - i) * 100).toISOString(),
      durationMs: _rng.next() * 2,
      metadata: {},
    })),
    fragmentationScore: _rng.next() * 0.2,
    memoryEfficiency: 0.7 + _rng.next() * 0.25,
    timeline: Array.from({ length: 10 }, (_, i) => ({
      timestamp: new Date(Date.now() - (10 - i) * 500).toISOString(),
      usedBytes: Math.floor(peakUsage * (0.5 + i * 0.05)),
      allocatedBytes: totalAlloc,
      freeBytes: Math.floor(80_000_000_000 - peakUsage * (0.5 + i * 0.05)),
      fragmentation: _rng.next() * 0.2,
    })),
    breakdownByLayer: layers.map((l) => ({
      layerName: l.layerName,
      bytes: l.memory.allocatedBytes,
      percentage: (l.memory.allocatedBytes / totalAlloc) * 100,
    })),
  };
}

function generateGPUProfile(session: ProfilingSession, layers: LayerProfile[]): GPUProfile {
  const totalComputeMs = layers.reduce((acc, l) => acc + l.timing.computeMs, 0);
  const totalMs = layers.reduce((acc, l) => acc + l.timing.totalMs, 0);
  const avgUtil = (totalComputeMs / totalMs) * 100;
  const kernelNames = [
    "volta_sgemm_128x128_tn", "volta_h884gemm_nt", "softmax_forward_kernel",
    "layernorm_forward_kernel", "elementwise_mul_kernel", "embedding_lookup_kernel",
    "flash_attention_forward", "gelu_forward_kernel", "transpose_kernel", "reduce_sum_kernel",
  ];
  return {
    deviceName: "NVIDIA A100-SXM4-80GB",
    deviceType: "gpu",
    totalMemoryBytes: 80_000_000_000,
    peakMemoryBytes: session.memoryProfile?.peakUsageBytes || 5_000_000_000,
    peakUtilization: avgUtil * 1.2,
    averageUtilization: avgUtil,
    smUtilization: avgUtil * 0.95,
    memoryControllerUtilization: 40 + _rng.next() * 30,
    pcieBandwidthUtilization: 20 + _rng.next() * 40,
    kernelProfiles: kernelNames.map((name, i) => {
      const invocations = Math.floor(_rng.next() * 500) + 50;
      const avgTime = _rng.next() * 0.5 + 0.01;
      return {
        id: `kp_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        kernelName: name,
        layerName: layers[i % layers.length].layerName,
        invocations,
        totalTimeMs: invocations * avgTime,
        averageTimeMs: avgTime,
        minTimeMs: avgTime * 0.8,
        maxTimeMs: avgTime * 1.5,
        registersPerThread: Math.floor(_rng.next() * 64) + 16,
        sharedMemoryBytes: Math.floor(_rng.next() * 49152),
        occupancy: 0.5 + _rng.next() * 0.45,
        warpEfficiency: 0.6 + _rng.next() * 0.35,
        memoryThroughput: 30 + _rng.next() * 50,
        computeThroughput: 40 + _rng.next() * 50,
      };
    }),
    powerConsumption: {
      averageWatts: 250 + _rng.next() * 100,
      peakWatts: 350 + _rng.next() * 50,
      totalEnergyJoules: totalMs * 0.3,
      energyPerInferenceMj: totalMs * 0.3,
      powerLimitWatts: 400,
      powerUtilization: 0.65 + _rng.next() * 0.2,
    },
    temperature: {
      averageCelsius: 65 + _rng.next() * 15,
      peakCelsius: 78 + _rng.next() * 10,
      throttleEvents: _rng.next() < 0.1 ? 1 : 0,
      thermalThrottlingPercent: _rng.next() < 0.1 ? _rng.next() * 5 : 0,
    },
    timeline: Array.from({ length: 10 }, (_, i) => ({
      timestamp: new Date(Date.now() - (10 - i) * 500).toISOString(),
      smUtilization: avgUtil * (0.8 + _rng.next() * 0.4),
      memoryUtilization: 40 + _rng.next() * 40,
      memoryUsedBytes: Math.floor(5_000_000_000 * (0.7 + _rng.next() * 0.3)),
      powerWatts: 250 + _rng.next() * 100,
      temperatureCelsius: 65 + _rng.next() * 15,
    })),
  };
}

function generateIOProfile(session: ProfilingSession): IOProfile {
  const dataLoadMs = 2 + _rng.next() * 5;
  const preprocessMs = 1 + _rng.next() * 3;
  return {
    dataLoadTimeMs: dataLoadMs,
    dataLoadBandwidthMBps: 500 + _rng.next() * 2000,
    preprocessingTimeMs: preprocessMs,
    pipelineUtilization: 0.6 + _rng.next() * 0.35,
    dataQueueDepth: Math.floor(_rng.next() * 8) + 2,
    prefetchHitRate: 0.8 + _rng.next() * 0.15,
    cacheHitRate: 0.7 + _rng.next() * 0.25,
    ioWaitPercent: _rng.next() * 10,
    storageType: "nvme",
    throughputBreakdown: [
      { stage: "data-loading", timeMs: dataLoadMs, percentage: dataLoadMs / (dataLoadMs + preprocessMs + 20) * 100 },
      { stage: "preprocessing", timeMs: preprocessMs, percentage: preprocessMs / (dataLoadMs + preprocessMs + 20) * 100 },
      { stage: "inference", timeMs: 20, percentage: 20 / (dataLoadMs + preprocessMs + 20) * 100 },
      { stage: "postprocessing", timeMs: 0.5, percentage: 0.5 / (dataLoadMs + preprocessMs + 20) * 100 },
    ],
  };
}

function generateProfilingSummary(session: ProfilingSession, layers: LayerProfile[]): ProfilingSummary {
  const totalDuration = layers.reduce((acc, l) => acc + l.timing.totalMs, 0);
  const sortedByTime = [...layers].sort((a, b) => b.timing.totalMs - a.timing.totalMs);
  const topBottlenecks = sortedByTime.slice(0, 5).map((l) => ({
    layerName: l.layerName,
    percentageOfTotal: l.timing.percentageOfTotal,
    type: l.layerType,
  }));
  const avgGPUUtil = session.gpuProfile?.averageUtilization || 0;
  const memEfficiency = session.memoryProfile?.memoryEfficiency || 0;
  const optScore = Math.round(
    avgGPUUtil * 0.4 + memEfficiency * 100 * 0.3 + (100 - topBottlenecks[0].percentageOfTotal) * 0.3
  );
  const effScore = Math.round(avgGPUUtil * 0.5 + memEfficiency * 100 * 0.5);
  const recommendations: string[] = [];
  if (avgGPUUtil < 60) recommendations.push("GPU underutilized — increase batch size or optimize kernel launches");
  if (topBottlenecks[0].percentageOfTotal > 30) recommendations.push(`${topBottlenecks[0].layerName} consumes ${topBottlenecks[0].percentageOfTotal.toFixed(1)}% of total time — consider fusing or optimizing this layer`);
  if (session.ioProfile && session.ioProfile.ioWaitPercent > 5) recommendations.push("I/O bottleneck detected — implement data prefetching and increase queue depth");
  if (session.memoryProfile && session.memoryProfile.fragmentationScore > 0.15) recommendations.push("Memory fragmentation is high — use memory pooling or pre-allocate buffers");
  const attentionLayers = layers.filter((l) => l.layerType === "attention");
  if (attentionLayers.length > 0) {
    const attnPercent = attentionLayers.reduce((acc, l) => acc + l.timing.percentageOfTotal, 0);
    if (attnPercent > 50) recommendations.push(`Attention layers consume ${attnPercent.toFixed(1)}% of time — consider Flash Attention or sparse attention`);
  }
  return {
    totalDurationMs: totalDuration,
    totalIterations: session.config.profileIterations,
    averageIterationMs: totalDuration,
    throughputInferencesPerSec: 1000 / totalDuration,
    peakMemoryUsageBytes: session.memoryProfile?.peakUsageBytes || 0,
    gpuUtilizationAverage: avgGPUUtil,
    cpuUtilizationAverage: 30 + _rng.next() * 40,
    topBottleneckLayers: topBottlenecks,
    optimizationScore: Math.min(100, Math.max(0, optScore)),
    efficiencyScore: Math.min(100, Math.max(0, effScore)),
    recommendations,
    comparisonWithBaseline: null,
  };
}

// ─── Profiling Comparison ─────────────────────────────────────────────────────

export async function compareSessions(sessionId: string, baselineId: string): Promise<ProfilingSession> {
  const session = profilingSessions.get(sessionId);
  const baseline = profilingSessions.get(baselineId);
  if (!session || !baseline) throw new Error("One or both profiling sessions not found");
  if (!session.summary || !baseline.summary) throw new Error("Sessions must be completed before comparison");
  const latencyChange = ((session.summary.averageIterationMs - baseline.summary.averageIterationMs) / baseline.summary.averageIterationMs) * 100;
  const throughputChange = ((session.summary.throughputInferencesPerSec - baseline.summary.throughputInferencesPerSec) / baseline.summary.throughputInferencesPerSec) * 100;
  const memoryChange = ((session.summary.peakMemoryUsageBytes - baseline.summary.peakMemoryUsageBytes) / baseline.summary.peakMemoryUsageBytes) * 100;
  const gpuChange = session.summary.gpuUtilizationAverage - baseline.summary.gpuUtilizationAverage;
  // Layer-level comparison
  const improved: Array<{ name: string; improvementPercent: number }> = [];
  const degraded: Array<{ name: string; degradationPercent: number }> = [];
  session.layerProfiles.forEach((sl) => {
    const bl = baseline.layerProfiles.find((b) => b.layerName === sl.layerName);
    if (bl) {
      const change = ((sl.timing.totalMs - bl.timing.totalMs) / bl.timing.totalMs) * 100;
      if (change < -5) improved.push({ name: sl.layerName, improvementPercent: Math.abs(change) });
      else if (change > 5) degraded.push({ name: sl.layerName, degradationPercent: change });
    }
  });
  let verdict: ProfilingComparison["overallVerdict"] = "similar";
  if (improved.length > degraded.length + 1) verdict = "improved";
  else if (degraded.length > improved.length + 1) verdict = "degraded";
  else if (improved.length > 0 && degraded.length > 0) verdict = "mixed";
  session.summary.comparisonWithBaseline = {
    baselineSessionId: baselineId,
    baselineName: baseline.name,
    latencyChangePercent: Math.round(latencyChange * 100) / 100,
    throughputChangePercent: Math.round(throughputChange * 100) / 100,
    memoryChangePercent: Math.round(memoryChange * 100) / 100,
    gpuUtilizationChangePercent: Math.round(gpuChange * 100) / 100,
    improvedLayers: improved,
    degradedLayers: degraded,
    overallVerdict: verdict,
  };
  session.updatedAt = new Date().toISOString();
  return session;
}

// ─── Layer Detail Profiling ───────────────────────────────────────────────────

export async function getLayerDetail(sessionId: string, layerName: string): Promise<LayerProfile | null> {
  const session = profilingSessions.get(sessionId);
  if (!session) throw new Error(`Profiling session ${sessionId} not found`);
  return session.layerProfiles.find((l) => l.layerName === layerName) || null;
}

export async function getKernelBreakdown(sessionId: string): Promise<KernelProfile[]> {
  const session = profilingSessions.get(sessionId);
  if (!session) throw new Error(`Profiling session ${sessionId} not found`);
  return session.gpuProfile?.kernelProfiles || [];
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export async function getStats(organizationId: string): Promise<{
  totalSessions: number;
  completedSessions: number;
  averageOptimizationScore: number;
  averageEfficiencyScore: number;
  averageLatencyMs: number;
  averageThroughput: number;
  frameworkDistribution: Record<string, number>;
  topBottleneckTypes: Record<string, number>;
  totalGPUEnergyJoules: number;
}> {
  const orgSessions = Array.from(profilingSessions.values()).filter((s) => s.organizationId === organizationId);
  const completed = orgSessions.filter((s) => s.status === "completed" && s.summary);
  const frameworks: Record<string, number> = {};
  const bottleneckTypes: Record<string, number> = {};
  let totalEnergy = 0;
  orgSessions.forEach((s) => {
    frameworks[s.framework] = (frameworks[s.framework] || 0) + 1;
    if (s.gpuProfile) totalEnergy += s.gpuProfile.powerConsumption.totalEnergyJoules;
  });
  completed.forEach((s) => {
    s.summary?.topBottleneckLayers.forEach((b) => {
      bottleneckTypes[b.type] = (bottleneckTypes[b.type] || 0) + 1;
    });
  });
  return {
    totalSessions: orgSessions.length,
    completedSessions: completed.length,
    averageOptimizationScore: completed.length > 0
      ? Math.round(completed.reduce((acc, s) => acc + (s.summary?.optimizationScore || 0), 0) / completed.length)
      : 0,
    averageEfficiencyScore: completed.length > 0
      ? Math.round(completed.reduce((acc, s) => acc + (s.summary?.efficiencyScore || 0), 0) / completed.length)
      : 0,
    averageLatencyMs: completed.length > 0
      ? Math.round(completed.reduce((acc, s) => acc + (s.summary?.averageIterationMs || 0), 0) / completed.length * 100) / 100
      : 0,
    averageThroughput: completed.length > 0
      ? Math.round(completed.reduce((acc, s) => acc + (s.summary?.throughputInferencesPerSec || 0), 0) / completed.length * 100) / 100
      : 0,
    frameworkDistribution: frameworks,
    topBottleneckTypes: bottleneckTypes,
    totalGPUEnergyJoules: Math.round(totalEnergy),
  };
}
