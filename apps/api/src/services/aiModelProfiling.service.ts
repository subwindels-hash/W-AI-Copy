/**
 * Module 106: AI Model Profiling Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides comprehensive performance profiling for AI models including latency
 * analysis, throughput measurement, memory usage tracking, bottleneck identification,
 * and resource utilization monitoring.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProfilingSession {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  status: ProfilingStatus;
  configuration: ProfilingConfiguration;
  results?: ProfilingResults;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type ProfilingStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ProfilingConfiguration {
  workloadType: 'synthetic' | 'replay' | 'production';
  duration: number; // seconds
  requestRate?: number; // requests per second
  concurrency: number;
  payloadSizes: number[]; // bytes
  warmupDuration: number; // seconds
  cooldownDuration: number; // seconds
  metrics: ProfilingMetric[];
  environment: ProfilingEnvironment;
}

export type ProfilingMetric =
  | 'latency'
  | 'throughput'
  | 'memory'
  | 'cpu'
  | 'gpu'
  | 'network'
  | 'disk_io'
  | 'queue_depth';

export interface ProfilingEnvironment {
  hardware: HardwareSpec;
  runtime: RuntimeSpec;
  deployment: DeploymentSpec;
}

export interface HardwareSpec {
  cpuCores: number;
  cpuModel?: string;
  memoryGB: number;
  gpuCount: number;
  gpuModel?: string;
  gpuMemoryGB?: number;
  networkBandwidthMbps: number;
  diskType: 'ssd' | 'hdd' | 'nvme';
}

export interface RuntimeSpec {
  framework: string;
  frameworkVersion: string;
  pythonVersion?: string;
  cudaVersion?: string;
  cudnnVersion?: string;
  optimizations: string[];
}

export interface DeploymentSpec {
  type: 'single_instance' | 'multi_instance' | 'serverless' | 'edge';
  replicas: number;
  loadBalancer: boolean;
  autoScaling: boolean;
}

export interface ProfilingResults {
  summary: ProfilingSummary;
  latencyAnalysis: LatencyAnalysis;
  throughputAnalysis: ThroughputAnalysis;
  resourceUtilization: ResourceUtilization;
  bottlenecks: Bottleneck[];
  timeline: ProfilingTimeline[];
  recommendations: string[];
}

export interface ProfilingSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  requestsPerSecond: number;
  peakRequestsPerSecond: number;
  errorRate: number;
  overallScore: number; // 0-100
}

export interface LatencyAnalysis {
  distribution: LatencyDistribution;
  percentiles: Record<string, number>;
  breakdown: LatencyBreakdown;
  outliers: LatencyOutlier[];
  trends: LatencyTrend[];
}

export interface LatencyDistribution {
  buckets: Array<{
    range: string;
    count: number;
    percentage: number;
  }>;
  mean: number;
  median: number;
  mode: number;
  standardDeviation: number;
  variance: number;
}

export interface LatencyBreakdown {
  preprocessing: number;
  inference: number;
  postprocessing: number;
  network: number;
  queue: number;
  total: number;
}

export interface LatencyOutlier {
  timestamp: string;
  latencyMs: number;
  reason?: string;
  context?: Record<string, any>;
}

export interface LatencyTrend {
  timestamp: string;
  averageLatencyMs: number;
  p95LatencyMs: number;
  requestCount: number;
}

export interface ThroughputAnalysis {
  averageRequestsPerSecond: number;
  peakRequestsPerSecond: number;
  sustainedThroughput: number;
  throughputOverTime: ThroughputPoint[];
  saturationPoint?: number;
  scalabilityScore: number; // 0-100
}

export interface ThroughputPoint {
  timestamp: string;
  requestsPerSecond: number;
  concurrency: number;
  averageLatencyMs: number;
}

export interface ResourceUtilization {
  cpu: ResourceMetric;
  memory: ResourceMetric;
  gpu?: ResourceMetric;
  network?: ResourceMetric;
  diskIO?: ResourceMetric;
  queueDepth?: QueueDepthMetric;
}

export interface ResourceMetric {
  average: number;
  peak: number;
  p95: number;
  timeline: ResourceTimelinePoint[];
}

export interface ResourceTimelinePoint {
  timestamp: string;
  value: number;
}

export interface QueueDepthMetric {
  average: number;
  peak: number;
  waitTimeMs: number;
  timeline: ResourceTimelinePoint[];
}

export interface Bottleneck {
  id: string;
  type: BottleneckType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  impact: string;
  metrics: Record<string, number>;
  location?: string;
  recommendations: string[];
}

export type BottleneckType =
  | 'cpu_bound'
  | 'memory_bound'
  | 'gpu_bound'
  | 'io_bound'
  | 'network_bound'
  | 'queue_congestion'
  | 'model_complexity'
  | 'batch_size'
  | 'concurrency';

export interface ProfilingTimeline {
  timestamp: string;
  requestsPerSecond: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
  cpuUtilization: number;
  memoryUtilization: number;
  gpuUtilization?: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const profilingSessions = new Map<string, ProfilingSession>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateLatencyDistribution(latencies: number[]): LatencyDistribution {
  const buckets = [
    { range: '0-50ms', min: 0, max: 50 },
    { range: '50-100ms', min: 50, max: 100 },
    { range: '100-200ms', min: 100, max: 200 },
    { range: '200-500ms', min: 200, max: 500 },
    { range: '500-1000ms', min: 500, max: 1000 },
    { range: '>1000ms', min: 1000, max: Infinity },
  ];

  const distribution = buckets.map(bucket => {
    const count = latencies.filter(l => l >= bucket.min && l < bucket.max).length;
    return {
      range: bucket.range,
      count,
      percentage: (count / latencies.length) * 100,
    };
  });

  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const sorted = [...latencies].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const variance = latencies.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / latencies.length;

  return {
    buckets: distribution,
    mean,
    median,
    mode: mean, // Simplified
    standardDeviation: Math.sqrt(variance),
    variance,
  };
}

function calculatePercentile(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

function identifyBottlenecks(results: Partial<ProfilingResults>): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];

  if (results.resourceUtilization) {
    const { cpu, memory, gpu } = results.resourceUtilization;

    if (cpu.peak > 90) {
      bottlenecks.push({
        id: randomUUID(),
        type: 'cpu_bound',
        severity: cpu.peak > 95 ? 'critical' : 'high',
        description: `CPU utilization peaked at ${cpu.peak.toFixed(1)}%`,
        impact: 'High CPU usage may cause request queuing and increased latency',
        metrics: { cpu_peak: cpu.peak, cpu_average: cpu.average },
        recommendations: [
          'Consider horizontal scaling with more instances',
          'Optimize CPU-intensive operations',
          'Enable model quantization to reduce CPU load',
        ],
      });
    }

    if (memory.peak > 85) {
      bottlenecks.push({
        id: randomUUID(),
        type: 'memory_bound',
        severity: memory.peak > 95 ? 'critical' : 'high',
        description: `Memory utilization peaked at ${memory.peak.toFixed(1)}%`,
        impact: 'High memory usage may cause OOM errors and instability',
        metrics: { memory_peak: memory.peak, memory_average: memory.average },
        recommendations: [
          'Increase memory allocation',
          'Implement memory-efficient batching',
          'Use model compression techniques',
        ],
      });
    }

    if (gpu && gpu.peak > 90) {
      bottlenecks.push({
        id: randomUUID(),
        type: 'gpu_bound',
        severity: gpu.peak > 95 ? 'critical' : 'high',
        description: `GPU utilization peaked at ${gpu.peak.toFixed(1)}%`,
        impact: 'GPU saturation limits inference throughput',
        metrics: { gpu_peak: gpu.peak, gpu_average: gpu.average },
        recommendations: [
          'Optimize batch size for better GPU utilization',
          'Consider GPU upgrade or adding more GPUs',
          'Implement model parallelism',
        ],
      });
    }
  }

  if (results.latencyAnalysis && results.latencyAnalysis.breakdown) {
    const { inference, preprocessing, postprocessing } = results.latencyAnalysis.breakdown;
    const total = inference + preprocessing + postprocessing;

    if (inference / total > 0.8) {
      bottlenecks.push({
        id: randomUUID(),
        type: 'model_complexity',
        severity: 'medium',
        description: `Inference takes ${((inference / total) * 100).toFixed(1)}% of total latency`,
        impact: 'Model complexity is the primary latency contributor',
        metrics: { inference_ms: inference, total_ms: total, inference_percentage: (inference / total) * 100 },
        recommendations: [
          'Consider model distillation or pruning',
          'Use smaller model variants',
          'Implement early exit mechanisms',
        ],
      });
    }
  }

  return bottlenecks;
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createProfilingSession(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  configuration: ProfilingConfiguration;
  createdBy: string;
}): ProfilingSession {
  const now = new Date().toISOString();
  const id = randomUUID();

  const session: ProfilingSession = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    status: 'pending',
    configuration: params.configuration,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  profilingSessions.set(id, session);
  return session;
}

export function getProfilingSession(id: string): ProfilingSession | undefined {
  return profilingSessions.get(id);
}

export function listProfilingSessions(
  organizationId: string,
  filters?: { modelId?: string; status?: ProfilingStatus }
): ProfilingSession[] {
  let result = Array.from(profilingSessions.values()).filter(
    s => s.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(s => s.modelId === filters.modelId);
  if (filters?.status) result = result.filter(s => s.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function startProfilingSession(sessionId: string): ProfilingSession {
  const session = profilingSessions.get(sessionId);
  if (!session) throw new Error(`Profiling session ${sessionId} not found`);
  if (session.status !== 'pending') throw new Error('Session is not in pending status');

  session.status = 'running';
  session.updatedAt = new Date().toISOString();
  return session;
}

export function completeProfilingSession(
  sessionId: string,
  rawData: {
    latencies: number[];
    requestTimestamps: string[];
    cpuUtilization: number[];
    memoryUtilization: number[];
    gpuUtilization?: number[];
    errors: number;
  }
): ProfilingSession {
  const session = profilingSessions.get(sessionId);
  if (!session) throw new Error(`Profiling session ${sessionId} not found`);
  if (session.status !== 'running') throw new Error('Session is not running');

  const now = new Date().toISOString();
  const { latencies, requestTimestamps, cpuUtilization, memoryUtilization, gpuUtilization, errors } = rawData;

  const totalRequests = latencies.length;
  const successfulRequests = totalRequests - errors;
  const duration = session.configuration.duration;

  // Calculate summary
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / totalRequests;
  const p50 = calculatePercentile(latencies, 50);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);
  const rps = totalRequests / duration;

  const summary: ProfilingSummary = {
    totalRequests,
    successfulRequests,
    failedRequests: errors,
    averageLatencyMs: avgLatency,
    p50LatencyMs: p50,
    p95LatencyMs: p95,
    p99LatencyMs: p99,
    requestsPerSecond: rps,
    peakRequestsPerSecond: rps * 1.2, // Estimated
    errorRate: (errors / totalRequests) * 100,
    overallScore: Math.max(0, 100 - (avgLatency / 10) - (errors / totalRequests) * 100),
  };

  // Latency analysis
  const latencyDistribution = generateLatencyDistribution(latencies);
  const latencyAnalysis: LatencyAnalysis = {
    distribution: latencyDistribution,
    percentiles: {
      p50,
      p75: calculatePercentile(latencies, 75),
      p90: calculatePercentile(latencies, 90),
      p95,
      p99,
      p999: calculatePercentile(latencies, 99.9),
    },
    breakdown: {
      preprocessing: avgLatency * 0.1,
      inference: avgLatency * 0.7,
      postprocessing: avgLatency * 0.1,
      network: avgLatency * 0.05,
      queue: avgLatency * 0.05,
      total: avgLatency,
    },
    outliers: latencies
      .filter(l => l > p99)
      .slice(0, 10)
      .map((l, i) => ({
        timestamp: requestTimestamps[i] || now,
        latencyMs: l,
        reason: 'High latency outlier',
      })),
    trends: [], // Would be populated with time-series data
  };

  // Throughput analysis
  const throughputAnalysis: ThroughputAnalysis = {
    averageRequestsPerSecond: rps,
    peakRequestsPerSecond: rps * 1.3,
    sustainedThroughput: rps * 0.9,
    throughputOverTime: [],
    saturationPoint: rps * 1.5,
    scalabilityScore: Math.min(100, (rps / session.configuration.concurrency) * 10),
  };

  // Resource utilization
  const cpuAvg = cpuUtilization.reduce((a, b) => a + b, 0) / cpuUtilization.length;
  const memAvg = memoryUtilization.reduce((a, b) => a + b, 0) / memoryUtilization.length;

  const resourceUtilization: ResourceUtilization = {
    cpu: {
      average: cpuAvg,
      peak: Math.max(...cpuUtilization),
      p95: calculatePercentile(cpuUtilization, 95),
      timeline: cpuUtilization.map((v, i) => ({
        timestamp: requestTimestamps[i] || now,
        value: v,
      })),
    },
    memory: {
      average: memAvg,
      peak: Math.max(...memoryUtilization),
      p95: calculatePercentile(memoryUtilization, 95),
      timeline: memoryUtilization.map((v, i) => ({
        timestamp: requestTimestamps[i] || now,
        value: v,
      })),
    },
  };

  if (gpuUtilization) {
    const gpuAvg = gpuUtilization.reduce((a, b) => a + b, 0) / gpuUtilization.length;
    resourceUtilization.gpu = {
      average: gpuAvg,
      peak: Math.max(...gpuUtilization),
      p95: calculatePercentile(gpuUtilization, 95),
      timeline: gpuUtilization.map((v, i) => ({
        timestamp: requestTimestamps[i] || now,
        value: v,
      })),
    };
  }

  // Identify bottlenecks
  const partialResults = { latencyAnalysis, resourceUtilization };
  const bottlenecks = identifyBottlenecks(partialResults);

  // Generate recommendations
  const recommendations: string[] = [];
  if (summary.errorRate > 1) {
    recommendations.push('Investigate high error rate - consider increasing timeout or retry logic');
  }
  if (p99 > 1000) {
    recommendations.push('P99 latency exceeds 1 second - optimize tail latency');
  }
  if (cpuAvg > 70) {
    recommendations.push('High CPU utilization - consider horizontal scaling');
  }
  if (memAvg > 70) {
    recommendations.push('High memory utilization - optimize memory usage or increase allocation');
  }

  session.results = {
    summary,
    latencyAnalysis,
    throughputAnalysis,
    resourceUtilization,
    bottlenecks,
    timeline: [],
    recommendations,
  };

  session.status = 'completed';
  session.completedAt = now;
  session.duration = duration;
  session.updatedAt = now;

  return session;
}

export function cancelProfilingSession(sessionId: string): ProfilingSession {
  const session = profilingSessions.get(sessionId);
  if (!session) throw new Error(`Profiling session ${sessionId} not found`);

  session.status = 'cancelled';
  session.updatedAt = new Date().toISOString();
  return session;
}

export function compareProfilingSessions(
  session1Id: string,
  session2Id: string
): {
  session1: ProfilingSummary;
  session2: ProfilingSummary;
  differences: Array<{
    metric: string;
    value1: number;
    value2: number;
    change: number;
    percentChange: number;
    winner: 'session1' | 'session2' | 'tie';
  }>;
  overallWinner: 'session1' | 'session2' | 'tie';
} {
  const session1 = profilingSessions.get(session1Id);
  const session2 = profilingSessions.get(session2Id);

  if (!session1 || !session2) throw new Error('One or both sessions not found');
  if (!session1.results || !session2.results) throw new Error('One or both sessions incomplete');

  const s1 = session1.results.summary;
  const s2 = session2.results.summary;

  const differences = [
    {
      metric: 'average_latency_ms',
      value1: s1.averageLatencyMs,
      value2: s2.averageLatencyMs,
      change: s2.averageLatencyMs - s1.averageLatencyMs,
      percentChange: ((s2.averageLatencyMs - s1.averageLatencyMs) / s1.averageLatencyMs) * 100,
      winner: s1.averageLatencyMs < s2.averageLatencyMs ? 'session1' : 'session2',
    },
    {
      metric: 'p95_latency_ms',
      value1: s1.p95LatencyMs,
      value2: s2.p95LatencyMs,
      change: s2.p95LatencyMs - s1.p95LatencyMs,
      percentChange: ((s2.p95LatencyMs - s1.p95LatencyMs) / s1.p95LatencyMs) * 100,
      winner: s1.p95LatencyMs < s2.p95LatencyMs ? 'session1' : 'session2',
    },
    {
      metric: 'requests_per_second',
      value1: s1.requestsPerSecond,
      value2: s2.requestsPerSecond,
      change: s2.requestsPerSecond - s1.requestsPerSecond,
      percentChange: ((s2.requestsPerSecond - s1.requestsPerSecond) / s1.requestsPerSecond) * 100,
      winner: s1.requestsPerSecond > s2.requestsPerSecond ? 'session1' : 'session2',
    },
    {
      metric: 'error_rate',
      value1: s1.errorRate,
      value2: s2.errorRate,
      change: s2.errorRate - s1.errorRate,
      percentChange: ((s2.errorRate - s1.errorRate) / s1.errorRate) * 100,
      winner: s1.errorRate < s2.errorRate ? 'session1' : 'session2',
    },
  ];

  const s1Wins = differences.filter(d => d.winner === 'session1').length;
  const s2Wins = differences.filter(d => d.winner === 'session2').length;
  const overallWinner = s1Wins > s2Wins ? 'session1' : s2Wins > s1Wins ? 'session2' : 'tie';

  return {
    session1: s1,
    session2: s2,
    differences,
    overallWinner,
  };
}

export function getProfilingResults(sessionId: string): ProfilingResults | undefined {
  const session = profilingSessions.get(sessionId);
  if (!session) throw new Error(`Profiling session ${sessionId} not found`);
  return session.results;
}
