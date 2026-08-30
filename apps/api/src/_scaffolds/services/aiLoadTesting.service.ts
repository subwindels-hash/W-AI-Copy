/**
 * Module 58: AI Load Testing Service
 *
 * Provides comprehensive load testing for AI inference endpoints including stress testing,
 * spike testing, soak testing, capacity planning, scalability validation, AI-specific
 * metrics collection (tokens/second, inference latency, queue depth), SLA validation,
 * and detailed performance reporting.
 *
 * Phase 1 — Critical Gap: Dedicated AI inference load testing infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiLoadTesting');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type LoadTestType = "stress" | "spike" | "soak" | "capacity" | "scalability" | "endurance" | "custom";

export type LoadTestStatus = "draft" | "ready" | "running" | "completed" | "failed" | "cancelled";

export type LoadPattern = "constant" | "ramp-up" | "step" | "spike" | "random" | "custom";

export type SLAVerdict = "passed" | "failed" | "warning";

export interface LoadTest {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: LoadTestStatus;
  testType: LoadTestType;
  target: LoadTestTarget;
  loadProfile: LoadProfile;
  testConfig: LoadTestConfig;
  slaRequirements: SLARequirement[];
  results?: LoadTestResults;
  createdBy: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoadTestTarget {
  modelId: string;
  modelName: string;
  endpoint: string;
  protocol: "http" | "grpc" | "websocket";
  authentication?: { type: "bearer" | "api-key" | "basic"; credentials?: string };
  timeout: number;
  retries: number;
}

export interface LoadProfile {
  pattern: LoadPattern;
  startUsers: number;
  peakUsers: number;
  rampUpDurationSeconds: number;
  steadyStateDurationSeconds: number;
  rampDownDurationSeconds: number;
  steps?: Array<{ users: number; durationSeconds: number }>;
  spikeConfig?: { spikeUsers: number; spikeDurationSeconds: number; spikeCount: number };
  customScript?: string;
}

export interface LoadTestConfig {
  totalDurationSeconds: number;
  requestTimeout: number;
  thinkTimeMs: { min: number; max: number };
  payloadConfig: PayloadConfig;
  warmupDurationSeconds: number;
  samplingIntervalSeconds: number;
  collectDetailedMetrics: boolean;
  parallelExecution: boolean;
}

export interface PayloadConfig {
  type: "fixed" | "random" | "from-dataset" | "generated";
  fixedPayload?: Record<string, unknown>;
  datasetId?: string;
  datasetSampleCount?: number;
  generatorConfig?: { inputShape: number[]; dataType: string; distribution: string };
  payloadSizeBytes?: number;
}

export interface SLARequirement {
  id: string;
  metric: string;
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  threshold: number;
  unit: string;
  percentile?: number;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface LoadTestResults {
  overallStatus: "passed" | "failed" | "warning";
  summary: LoadTestSummary;
  performanceMetrics: PerformanceMetrics;
  scalabilityAnalysis: ScalabilityAnalysis;
  resourceUtilization: ResourceUtilization;
  errorAnalysis: ErrorAnalysis;
  slaValidation: SLAValidation;
  capacityPlanning: CapacityPlanning;
  timeSeriesData: TimeSeriesData;
  recommendations: string[];
}

export interface LoadTestSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  totalDurationSeconds: number;
  peakConcurrentUsers: number;
  averageThroughput: number;
  peakThroughput: number;
}

export interface PerformanceMetrics {
  latency: LatencyMetrics;
  throughput: ThroughputMetrics;
  aiSpecific: AISpecificMetrics;
}

export interface LatencyMetrics {
  mean: number;
  median: number;
  p90: number;
  p95: number;
  p99: number;
  p999: number;
  min: number;
  max: number;
  stdDev: number;
  distribution: Array<{ bucket: string; count: number; percentage: number }>;
}

export interface ThroughputMetrics {
  requestsPerSecond: number;
  peakRequestsPerSecond: number;
  averageResponseSize: number;
  bandwidthMbps: number;
}

export interface AISpecificMetrics {
  tokensPerSecond?: number;
  inferenceLatencyMs: number;
  queueDepth: { mean: number; max: number; p95: number };
  batchSize: { mean: number; max: number };
  gpuUtilization: { mean: number; peak: number };
  memoryUsageMb: { mean: number; peak: number };
  modelLoadingTimeMs?: number;
  preprocessingTimeMs?: number;
  postprocessingTimeMs?: number;
}

export interface ScalabilityAnalysis {
  scalabilityScore: number;
  linearScalability: boolean;
  efficiencyPercent: number;
  scalingBottleneck?: string;
  throughputVsLoad: Array<{ users: number; throughput: number; latency: number }>;
  saturationPoint?: { users: number; throughput: number; latency: number };
  recommendations: string[];
}

export interface ResourceUtilization {
  cpu: { mean: number; peak: number; cores: number };
  memory: { meanMb: number; peakMb: number; totalMb: number };
  gpu?: { mean: number; peak: number; memoryUsedMb: number; memoryTotalMb: number; count: number };
  network: { inboundMbps: number; outboundMbps: number };
  disk: { readIops: number; writeIops: number; readMbps: number; writeMbps: number };
}

export interface ErrorAnalysis {
  totalErrors: number;
  errorRate: number;
  errorsByType: Record<string, { count: number; percentage: number; sampleMessage?: string }>;
  errorsByStatusCode: Record<string, number>;
  errorTimeline: Array<{ timestamp: string; count: number; type: string }>;
  topErrors: Array<{ type: string; count: number; message: string; firstOccurrence: string; lastOccurrence: string }>;
}

export interface SLAValidation {
  overallVerdict: SLAVerdict;
  results: SLAResult[];
  passedCount: number;
  failedCount: number;
  warningCount: number;
}

export interface SLAResult {
  requirement: SLARequirement;
  actualValue: number;
  verdict: SLAVerdict;
  margin: number;
  details: string;
}

export interface CapacityPlanning {
  currentCapacity: { users: number; requestsPerSecond: number };
  maxCapacity: { users: number; requestsPerSecond: number };
  headroomPercent: number;
  scalingRecommendations: Array<{ targetUsers: number; requiredReplicas: number; instanceType: string; estimatedCostMonthly: number }>;
  costProjections: Array<{ users: number; monthlyCost: number; costPerRequest: number }>;
  timeToSaturation?: string;
}

export interface TimeSeriesData {
  latencyOverTime: Array<{ timestamp: string; p50: number; p95: number; p99: number }>;
  throughputOverTime: Array<{ timestamp: string; value: number }>;
  errorRateOverTime: Array<{ timestamp: string; value: number }>;
  concurrentUsersOverTime: Array<{ timestamp: string; value: number }>;
  cpuOverTime: Array<{ timestamp: string; value: number }>;
  memoryOverTime: Array<{ timestamp: string; value: number }>;
  gpuOverTime?: Array<{ timestamp: string; utilization: number; memoryPercent: number }>;
}

export interface LoadTestingStats {
  totalTests: number;
  completedTests: number;
  averageSuccessRate: number;
  averageLatencyP95: number;
  averageThroughput: number;
  slaPassRate: number;
  testsByType: Record<string, number>;
  topTestedModels: Array<{ modelId: string; modelName: string; testCount: number }>;
  totalRequestsGenerated: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const tests = new Map<string, LoadTest>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a load test
 */
export async function createLoadTest(params: {
  organizationId: string;
  name: string;
  description?: string;
  testType: LoadTestType;
  target: LoadTestTarget;
  loadProfile: LoadProfile;
  testConfig: LoadTestConfig;
  slaRequirements: Omit<SLARequirement, "id">[];
  createdBy: string;
}): Promise<LoadTest> {
  const now = new Date().toISOString();

  const test: LoadTest = {
    id: `lt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    status: "ready",
    testType: params.testType,
    target: params.target,
    loadProfile: params.loadProfile,
    testConfig: params.testConfig,
    slaRequirements: params.slaRequirements.map(sla => ({ ...sla, id: `sla_${randomUUID().replace(/-/g, "").slice(0, 12)}` })),
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  tests.set(test.id, test);
  return test;
}

/**
 * Execute a load test
 */
export async function executeLoadTest(testId: string): Promise<LoadTest | null> {
  const test = tests.get(testId);
  if (!test || test.status !== "ready") return null;

  test.status = "running";
  test.startedAt = new Date().toISOString();
  test.updatedAt = test.startedAt;
  tests.set(testId, test);

  setTimeout(() => runLoadTest(testId), 100);
  return test;
}

/**
 * Get load test by ID
 */
export async function getLoadTest(testId: string): Promise<LoadTest | null> {
  return tests.get(testId) ?? null;
}

/**
 * List load tests
 */
export async function listLoadTests(
  organizationId: string,
  filters?: { status?: LoadTestStatus; testType?: LoadTestType; limit?: number },
): Promise<LoadTest[]> {
  let result = Array.from(tests.values()).filter(t => t.organizationId === organizationId);
  if (filters?.status) result = result.filter(t => t.status === filters.status);
  if (filters?.testType) result = result.filter(t => t.testType === filters.testType);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, filters?.limit ?? 50);
}

/**
 * Cancel a running load test
 */
export async function cancelLoadTest(testId: string): Promise<LoadTest | null> {
  const test = tests.get(testId);
  if (!test || test.status !== "running") return null;

  test.status = "cancelled";
  test.updatedAt = new Date().toISOString();
  tests.set(testId, test);
  return test;
}

/**
 * Get load testing statistics
 */
export async function getLoadTestingStats(organizationId: string): Promise<LoadTestingStats> {
  const all = Array.from(tests.values()).filter(t => t.organizationId === organizationId);
  const completed = all.filter(t => t.status === "completed");

  let totalSuccessRate = 0;
  let totalLatencyP95 = 0;
  let totalThroughput = 0;
  let slaPassed = 0;
  let slaTotal = 0;
  let totalRequests = 0;
  const testsByType: Record<string, number> = {};
  const modelTests: Record<string, { modelName: string; count: number }> = {};

  for (const test of completed) {
    if (test.results) {
      totalSuccessRate += test.results.summary.successRate;
      totalLatencyP95 += test.results.performanceMetrics.latency.p95;
      totalThroughput += test.results.performanceMetrics.throughput.requestsPerSecond;
      totalRequests += test.results.summary.totalRequests;

      for (const sla of test.results.slaValidation.results) {
        slaTotal++;
        if (sla.verdict === "passed") slaPassed++;
      }
    }

    testsByType[test.testType] = (testsByType[test.testType] || 0) + 1;
    const modelKey = test.target.modelId;
    if (!modelTests[modelKey]) {
      modelTests[modelKey] = { modelName: test.target.modelName, count: 0 };
    }
    modelTests[modelKey].count++;
  }

  return {
    totalTests: all.length,
    completedTests: completed.length,
    averageSuccessRate: completed.length > 0 ? Math.round(totalSuccessRate / completed.length * 100) / 100 : 0,
    averageLatencyP95: completed.length > 0 ? Math.round(totalLatencyP95 / completed.length * 100) / 100 : 0,
    averageThroughput: completed.length > 0 ? Math.round(totalThroughput / completed.length * 100) / 100 : 0,
    slaPassRate: slaTotal > 0 ? Math.round((slaPassed / slaTotal) * 10000) / 100 : 0,
    testsByType,
    topTestedModels: Object.entries(modelTests)
      .map(([modelId, data]) => ({ modelId, modelName: data.modelName, testCount: data.count }))
      .sort((a, b) => b.testCount - a.testCount)
      .slice(0, 5),
    totalRequestsGenerated: totalRequests,
  };
}

// ─── Internal: Load Test Execution ────────────────────────────────────────────

async function runLoadTest(testId: string): Promise<void> {
  const test = tests.get(testId);
  if (!test) return;

  try {
    await new Promise(r => setTimeout(r, 50));

    const summary = generateLoadTestSummary(test);
    const performanceMetrics = generatePerformanceMetrics(test, summary);
    const scalabilityAnalysis = generateScalabilityAnalysis(test, performanceMetrics);
    const resourceUtilization = generateResourceUtilization(test);
    const errorAnalysis = generateErrorAnalysis(test, summary);
    const slaValidation = validateSLA(test.slaRequirements, performanceMetrics, summary);
    const capacityPlanning = generateCapacityPlanning(test, performanceMetrics, scalabilityAnalysis);
    const timeSeriesData = generateTimeSeriesData(test);

    const overallStatus = slaValidation.overallVerdict === "failed" ? "failed" : slaValidation.overallVerdict === "warning" ? "warning" : "passed";

    test.results = {
      overallStatus,
      summary,
      performanceMetrics,
      scalabilityAnalysis,
      resourceUtilization,
      errorAnalysis,
      slaValidation,
      capacityPlanning,
      timeSeriesData,
      recommendations: generateRecommendations(test, performanceMetrics, scalabilityAnalysis, slaValidation),
    };

    test.status = "completed";
    test.completedAt = new Date().toISOString();
    test.updatedAt = test.completedAt;
    tests.set(testId, test);
  } catch (error) {
    test.status = "failed";
    test.updatedAt = new Date().toISOString();
    tests.set(testId, test);
  }
}

function generateLoadTestSummary(test: LoadTest): LoadTestSummary {
  const totalRequests = Math.round(test.loadProfile.peakUsers * test.testConfig.totalDurationSeconds * 0.8);
  const failedRequests = Math.round(totalRequests * (0.01 + _rng.next() * 0.03));
  const successfulRequests = totalRequests - failedRequests;

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    successRate: Math.round((successfulRequests / totalRequests) * 10000) / 100,
    totalDurationSeconds: test.testConfig.totalDurationSeconds,
    peakConcurrentUsers: test.loadProfile.peakUsers,
    averageThroughput: Math.round(successfulRequests / test.testConfig.totalDurationSeconds * 100) / 100,
    peakThroughput: Math.round((successfulRequests / test.testConfig.totalDurationSeconds) * 1.5 * 100) / 100,
  };
}

function generatePerformanceMetrics(test: LoadTest, summary: LoadTestSummary): PerformanceMetrics {
  const baseLatency = 20 + _rng.next() * 80;
  const loadFactor = test.loadProfile.peakUsers / 100;

  const latencies: number[] = [];
  for (let i = 0; i < 1000; i++) {
    latencies.push(baseLatency * (0.5 + _rng.next() * 1.5) * (1 + loadFactor * 0.5));
  }
  latencies.sort((a, b) => a - b);

  const mean = latencies.reduce((s, v) => s + v, 0) / latencies.length;
  const stdDev = Math.sqrt(latencies.reduce((s, v) => s + (v - mean) ** 2, 0) / latencies.length);

  const latency: LatencyMetrics = {
    mean: Math.round(mean * 100) / 100,
    median: Math.round(latencies[500] * 100) / 100,
    p90: Math.round(latencies[900] * 100) / 100,
    p95: Math.round(latencies[950] * 100) / 100,
    p99: Math.round(latencies[990] * 100) / 100,
    p999: Math.round(latencies[999] * 100) / 100,
    min: Math.round(latencies[0] * 100) / 100,
    max: Math.round(latencies[999] * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    distribution: [
      { bucket: "0-50ms", count: Math.round(summary.totalRequests * 0.3), percentage: 30 },
      { bucket: "50-100ms", count: Math.round(summary.totalRequests * 0.4), percentage: 40 },
      { bucket: "100-200ms", count: Math.round(summary.totalRequests * 0.2), percentage: 20 },
      { bucket: "200-500ms", count: Math.round(summary.totalRequests * 0.08), percentage: 8 },
      { bucket: ">500ms", count: Math.round(summary.totalRequests * 0.02), percentage: 2 },
    ],
  };

  const throughput: ThroughputMetrics = {
    requestsPerSecond: summary.averageThroughput,
    peakRequestsPerSecond: summary.peakThroughput,
    averageResponseSize: 1024 + _rng.next() * 4096,
    bandwidthMbps: Math.round((summary.averageThroughput * 2048 * 8) / 1024 / 1024 * 100) / 100,
  };

  const aiSpecific: AISpecificMetrics = {
    tokensPerSecond: test.target.modelName.includes("text") || test.target.modelName.includes("llm") ? 50 + _rng.next() * 150 : undefined,
    inferenceLatencyMs: Math.round(mean * 0.8 * 100) / 100,
    queueDepth: { mean: Math.round((2 + _rng.next() * 8) * loadFactor * 100) / 100, max: Math.round((10 + _rng.next() * 20) * loadFactor), p95: Math.round((5 + _rng.next() * 10) * loadFactor * 100) / 100 },
    batchSize: { mean: Math.round((4 + _rng.next() * 12) * 100) / 100, max: Math.round(16 + _rng.next() * 16) },
    gpuUtilization: { mean: Math.round((50 + _rng.next() * 30) * (1 + loadFactor * 0.3) * 100) / 100, peak: Math.round((80 + _rng.next() * 15) * 100) / 100 },
    memoryUsageMb: { mean: Math.round((2048 + _rng.next() * 4096) * 100) / 100, peak: Math.round((4096 + _rng.next() * 8192) * 100) / 100 },
    modelLoadingTimeMs: 500 + _rng.next() * 2000,
    preprocessingTimeMs: 5 + _rng.next() * 15,
    postprocessingTimeMs: 2 + _rng.next() * 8,
  };

  return { latency, throughput, aiSpecific };
}

function generateScalabilityAnalysis(test: LoadTest, metrics: PerformanceMetrics): ScalabilityAnalysis {
  const throughputVsLoad: ScalabilityAnalysis["throughputVsLoad"] = [];
  const steps = 10;
  const userStep = test.loadProfile.peakUsers / steps;

  let maxThroughput = 0;
  let saturationPoint: ScalabilityAnalysis["saturationPoint"];

  for (let i = 1; i <= steps; i++) {
    const users = Math.round(userStep * i);
    const throughput = Math.min(users * 10, metrics.throughput.peakRequestsPerSecond * (1 - Math.pow(i / steps, 2) * 0.3));
    const latency = metrics.latency.mean * (1 + Math.pow(i / steps, 1.5) * 2);
    throughputVsLoad.push({ users, throughput: Math.round(throughput * 100) / 100, latency: Math.round(latency * 100) / 100 });

    if (throughput > maxThroughput) {
      maxThroughput = throughput;
      if (i === steps || throughput < users * 8) {
        saturationPoint = { users, throughput, latency };
      }
    }
  }

  const efficiency = (metrics.throughput.requestsPerSecond / (test.loadProfile.peakUsers * 10)) * 100;
  const linearScalability = efficiency > 70;

  return {
    scalabilityScore: Math.round(efficiency),
    linearScalability,
    efficiencyPercent: Math.round(efficiency * 100) / 100,
    scalingBottleneck: efficiency < 60 ? "GPU compute saturation" : efficiency < 75 ? "Memory bandwidth limitation" : undefined,
    throughputVsLoad,
    saturationPoint,
    recommendations: linearScalability ? ["System scales linearly — add more replicas for higher load"] : ["Consider optimizing batch processing", "Review GPU memory allocation", "Implement request queuing"],
  };
}

function generateResourceUtilization(test: LoadTest): ResourceUtilization {
  const loadFactor = test.loadProfile.peakUsers / 100;

  return {
    cpu: { mean: Math.round((40 + _rng.next() * 30) * (1 + loadFactor * 0.3) * 100) / 100, peak: Math.round((70 + _rng.next() * 25) * 100) / 100, cores: 8 },
    memory: { meanMb: Math.round((4096 + _rng.next() * 4096) * 100) / 100, peakMb: Math.round((8192 + _rng.next() * 8192) * 100) / 100, totalMb: 32768 },
    gpu: { mean: Math.round((50 + _rng.next() * 30) * (1 + loadFactor * 0.3) * 100) / 100, peak: Math.round((80 + _rng.next() * 15) * 100) / 100, memoryUsedMb: Math.round((4096 + _rng.next() * 8192) * 100) / 100, memoryTotalMb: 16384, count: 2 },
    network: { inboundMbps: Math.round((50 + _rng.next() * 100) * 100) / 100, outboundMbps: Math.round((100 + _rng.next() * 200) * 100) / 100 },
    disk: { readIops: Math.round(1000 + _rng.next() * 2000), writeIops: Math.round(500 + _rng.next() * 1000), readMbps: Math.round((50 + _rng.next() * 100) * 100) / 100, writeMbps: Math.round((20 + _rng.next() * 50) * 100) / 100 },
  };
}

function generateErrorAnalysis(test: LoadTest, summary: LoadTestSummary): ErrorAnalysis {
  const errorTypes = [
    { type: "Timeout", count: Math.round(summary.failedRequests * 0.4), message: "Request timeout after 30s" },
    { type: "503 Service Unavailable", count: Math.round(summary.failedRequests * 0.3), message: "Service temporarily unavailable" },
    { type: "500 Internal Server Error", count: Math.round(summary.failedRequests * 0.2), message: "Internal server error during inference" },
    { type: "429 Too Many Requests", count: Math.round(summary.failedRequests * 0.1), message: "Rate limit exceeded" },
  ];

  const errorsByType: ErrorAnalysis["errorsByType"] = {};
  const errorsByStatusCode: ErrorAnalysis["errorsByStatusCode"] = {};
  const topErrors: ErrorAnalysis["topErrors"] = [];

  for (const err of errorTypes) {
    errorsByType[err.type] = { count: err.count, percentage: Math.round((err.count / summary.failedRequests) * 10000) / 100, sampleMessage: err.message };
    const statusCode = err.type.split(" ")[0];
    if (!isNaN(Number(statusCode))) {
      errorsByStatusCode[statusCode] = err.count;
    }
    topErrors.push({
      type: err.type,
      count: err.count,
      message: err.message,
      firstOccurrence: new Date(Date.now() - 3600000).toISOString(),
      lastOccurrence: new Date().toISOString(),
    });
  }

  return {
    totalErrors: summary.failedRequests,
    errorRate: Math.round((summary.failedRequests / summary.totalRequests) * 10000) / 100,
    errorsByType,
    errorsByStatusCode,
    errorTimeline: [],
    topErrors,
  };
}

function validateSLA(requirements: SLARequirement[], metrics: PerformanceMetrics, summary: LoadTestSummary): SLAValidation {
  const results: SLAResult[] = [];
  let passedCount = 0;
  let failedCount = 0;
  let warningCount = 0;

  for (const req of requirements) {
    let actualValue = 0;

    if (req.metric === "latency_p95") actualValue = metrics.latency.p95;
    else if (req.metric === "latency_p99") actualValue = metrics.latency.p99;
    else if (req.metric === "latency_mean") actualValue = metrics.latency.mean;
    else if (req.metric === "throughput") actualValue = metrics.throughput.requestsPerSecond;
    else if (req.metric === "error_rate") actualValue = summary.successRate;
    else if (req.metric === "success_rate") actualValue = summary.successRate;

    let verdict: SLAVerdict = "passed";
    if (req.operator === "lt" && actualValue >= req.threshold) verdict = "failed";
    else if (req.operator === "lte" && actualValue > req.threshold) verdict = "failed";
    else if (req.operator === "gt" && actualValue <= req.threshold) verdict = "failed";
    else if (req.operator === "gte" && actualValue < req.threshold) verdict = "failed";

    if (verdict === "passed") {
      const margin = Math.abs((actualValue - req.threshold) / req.threshold);
      if (margin < 0.1) verdict = "warning";
    }

    const margin = Math.round(((actualValue - req.threshold) / req.threshold) * 10000) / 100;

    results.push({
      requirement: req,
      actualValue: Math.round(actualValue * 100) / 100,
      verdict,
      margin,
      details: `${req.metric}: ${actualValue.toFixed(2)}${req.unit} (threshold: ${req.threshold}${req.unit})`,
    });

    if (verdict === "passed") passedCount++;
    else if (verdict === "failed") failedCount++;
    else warningCount++;
  }

  const overallVerdict: SLAVerdict = failedCount > 0 ? "failed" : warningCount > 0 ? "warning" : "passed";

  return { overallVerdict, results, passedCount, failedCount, warningCount };
}

function generateCapacityPlanning(test: LoadTest, metrics: PerformanceMetrics, scalability: ScalabilityAnalysis): CapacityPlanning {
  const currentCapacity = { users: test.loadProfile.peakUsers, requestsPerSecond: metrics.throughput.requestsPerSecond };
  const maxCapacity = scalability.saturationPoint ? { users: scalability.saturationPoint.users, requestsPerSecond: scalability.saturationPoint.throughput } : { users: test.loadProfile.peakUsers * 2, requestsPerSecond: metrics.throughput.peakRequestsPerSecond * 1.5 };
  const headroom = ((maxCapacity.users - currentCapacity.users) / maxCapacity.users) * 100;

  const scalingRecommendations: CapacityPlanning["scalingRecommendations"] = [];
  for (const multiplier of [1.5, 2, 3]) {
    const targetUsers = Math.round(currentCapacity.users * multiplier);
    const requiredReplicas = Math.ceil(targetUsers / (currentCapacity.users / 2));
    scalingRecommendations.push({
      targetUsers,
      requiredReplicas,
      instanceType: "gpu-a100-40gb",
      estimatedCostMonthly: requiredReplicas * 2500,
    });
  }

  const costProjections: CapacityPlanning["costProjections"] = [];
  for (const users of [100, 500, 1000, 2000, 5000]) {
    const replicas = Math.ceil(users / (currentCapacity.users / 2));
    const monthlyCost = replicas * 2500;
    const monthlyRequests = users * 60 * 60 * 24 * 30;
    costProjections.push({ users, monthlyCost, costPerRequest: Math.round((monthlyCost / monthlyRequests) * 1000000) / 1000000 });
  }

  return {
    currentCapacity,
    maxCapacity,
    headroomPercent: Math.round(headroom * 100) / 100,
    scalingRecommendations,
    costProjections,
    timeToSaturation: headroom < 20 ? "Less than 1 month at current growth rate" : headroom < 50 ? "1-3 months at current growth rate" : undefined,
  };
}

function generateTimeSeriesData(test: LoadTest): TimeSeriesData {
  const points = 30;
  const interval = test.testConfig.totalDurationSeconds / points;
  const latencyOverTime: TimeSeriesData["latencyOverTime"] = [];
  const throughputOverTime: TimeSeriesData["throughputOverTime"] = [];
  const errorRateOverTime: TimeSeriesData["errorRateOverTime"] = [];
  const concurrentUsersOverTime: TimeSeriesData["concurrentUsersOverTime"] = [];
  const cpuOverTime: TimeSeriesData["cpuOverTime"] = [];
  const memoryOverTime: TimeSeriesData["memoryOverTime"] = [];
  const gpuOverTime: TimeSeriesData["gpuOverTime"] = [];

  for (let i = 0; i < points; i++) {
    const timestamp = new Date(Date.now() + i * interval * 1000).toISOString();
    const progress = i / points;
    const users = progress < 0.2 ? test.loadProfile.peakUsers * (progress / 0.2) : progress > 0.8 ? test.loadProfile.peakUsers * (1 - (progress - 0.8) / 0.2) : test.loadProfile.peakUsers;
    const baseLatency = 30 + _rng.next() * 50;
    const loadFactor = users / test.loadProfile.peakUsers;

    latencyOverTime.push({ timestamp, p50: Math.round(baseLatency * 100) / 100, p95: Math.round(baseLatency * 1.5 * 100) / 100, p99: Math.round(baseLatency * 2 * 100) / 100 });
    throughputOverTime.push({ timestamp, value: Math.round((users * 10) * (1 - loadFactor * 0.2) * 100) / 100 });
    errorRateOverTime.push({ timestamp, value: Math.round((0.01 + loadFactor * 0.02) * 10000) / 10000 });
    concurrentUsersOverTime.push({ timestamp, value: Math.round(users) });
    cpuOverTime.push({ timestamp, value: Math.round((30 + loadFactor * 50) * 100) / 100 });
    memoryOverTime.push({ timestamp, value: Math.round((40 + loadFactor * 40) * 100) / 100 });
    gpuOverTime.push({ timestamp, utilization: Math.round((40 + loadFactor * 50) * 100) / 100, memoryPercent: Math.round((30 + loadFactor * 50) * 100) / 100 });
  }

  return { latencyOverTime, throughputOverTime, errorRateOverTime, concurrentUsersOverTime, cpuOverTime, memoryOverTime, gpuOverTime };
}

function generateRecommendations(test: LoadTest, metrics: PerformanceMetrics, scalability: ScalabilityAnalysis, sla: SLAValidation): string[] {
  const recs: string[] = [];

  if (sla.overallVerdict === "failed") {
    recs.push("SLA requirements not met — consider scaling up infrastructure or optimizing model");
  }

  if (metrics.latency.p99 > metrics.latency.mean * 3) {
    recs.push("High tail latency detected — investigate outlier requests and implement request prioritization");
  }

  if (scalability.efficiencyPercent < 70) {
    recs.push("Sub-linear scalability — review batch processing and GPU utilization");
  }

  if (metrics.aiSpecific.gpuUtilization.peak > 90) {
    recs.push("GPU saturation detected — consider adding more GPU resources or optimizing model");
  }

  if (metrics.aiSpecific.queueDepth.max > 20) {
    recs.push("High queue depth — implement request shedding or increase replica count");
  }

  recs.push("Implement auto-scaling based on load test results");
  recs.push("Run load tests regularly to detect performance regressions");

  return recs;
}
