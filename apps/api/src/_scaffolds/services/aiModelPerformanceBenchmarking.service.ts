/**
 * Module 143: AI Model Performance Benchmarking Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides performance benchmarking capabilities for AI models including standardized
 * benchmark suites, performance comparison, regression detection, benchmark reporting,
 * and performance trend analysis.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiModelPerformanceBenchmarking');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BenchmarkSuite {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: BenchmarkType;
  status: BenchmarkSuiteStatus;
  testCases: BenchmarkTestCase[];
  configuration: BenchmarkConfiguration;
  baseline?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type BenchmarkType =
  | 'inference_latency'
  | 'throughput'
  | 'accuracy'
  | 'resource_usage'
  | 'scalability'
  | 'comprehensive';

export type BenchmarkSuiteStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed';

export interface BenchmarkTestCase {
  id: string;
  name: string;
  description?: string;
  input: BenchmarkInput;
  expectedOutput?: any;
  metrics: string[];
  iterations: number;
  warmupIterations: number;
  timeout: number; // seconds
}

export interface BenchmarkInput {
  type: 'static' | 'synthetic' | 'dataset';
  data?: any;
  datasetId?: string;
  sampleSize?: number;
  shape?: number[];
  distribution?: string;
}

export interface BenchmarkConfiguration {
  environment: BenchmarkEnvironment;
  hardware: BenchmarkHardware;
  parameters: Record<string, any>;
  statistical: StatisticalConfig;
}

export interface BenchmarkEnvironment {
  framework: string;
  version: string;
  python?: string;
  cuda?: string;
  dependencies: Record<string, string>;
}

export interface BenchmarkHardware {
  cpu: string;
  cpuCores: number;
  memory: number; // GB
  gpu?: string;
  gpuCount?: number;
  gpuMemory?: number; // GB
}

export interface StatisticalConfig {
  confidenceLevel: number;
  outlierDetection: boolean;
  outlierThreshold: number;
  bootstrapSamples: number;
}

export interface BenchmarkRun {
  id: string;
  suiteId: string;
  modelId: string;
  modelVersion: string;
  status: BenchmarkRunStatus;
  results: BenchmarkResult[];
  summary: BenchmarkSummary;
  comparison?: BenchmarkComparison;
  startedAt: string;
  completedAt?: string;
  duration: number; // seconds
  environment: BenchmarkEnvironment;
  hardware: BenchmarkHardware;
  initiatedBy: string;
}

export type BenchmarkRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BenchmarkResult {
  testCaseId: string;
  testCaseName: string;
  metrics: BenchmarkMetric[];
  iterations: IterationResult[];
  statistics: ResultStatistics;
  status: 'passed' | 'failed' | 'error';
  error?: string;
}

export interface BenchmarkMetric {
  name: string;
  value: number;
  unit: string;
  lowerIsBetter: boolean;
}

export interface IterationResult {
  iteration: number;
  metrics: Record<string, number>;
  duration: number; // seconds
  timestamp: string;
}

export interface ResultStatistics {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  confidenceInterval: {
    lower: number;
    upper: number;
    level: number;
  };
}

export interface BenchmarkSummary {
  overallScore: number;
  passedTests: number;
  failedTests: number;
  totalTests: number;
  averageLatency: number;
  throughput: number;
  resourceUsage: ResourceUsageSummary;
  recommendations: string[];
}

export interface ResourceUsageSummary {
  cpuUsage: number;
  memoryUsage: number;
  gpuUsage?: number;
  gpuMemoryUsage?: number;
}

export interface BenchmarkComparison {
  baselineRunId: string;
  currentRunId: string;
  differences: MetricDifference[];
  regression: boolean;
  regressionDetails: string[];
  improvement: boolean;
  improvementDetails: string[];
}

export interface MetricDifference {
  metric: string;
  baselineValue: number;
  currentValue: number;
  difference: number;
  percentChange: number;
  isRegression: boolean;
  isImprovement: boolean;
  significance: 'significant' | 'marginal' | 'insignificant';
}

export interface BenchmarkReport {
  id: string;
  runId: string;
  type: 'detailed' | 'summary' | 'comparison';
  title: string;
  executiveSummary: string;
  results: BenchmarkResult[];
  comparison?: BenchmarkComparison;
  performanceTrends: PerformanceTrend[];
  recommendations: BenchmarkRecommendation[];
  appendices: ReportAppendix[];
  generatedAt: string;
  generatedBy: string;
}

export interface PerformanceTrend {
  metric: string;
  dataPoints: TrendDataPoint[];
  trend: 'improving' | 'degrading' | 'stable';
  changePercent: number;
}

export interface TrendDataPoint {
  timestamp: string;
  value: number;
  modelVersion: string;
}

export interface BenchmarkRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'performance' | 'resource' | 'configuration' | 'optimization';
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  actionItems: string[];
}

export interface ReportAppendix {
  title: string;
  content: string;
  data?: any;
}

export interface PerformanceRegression {
  id: string;
  runId: string;
  modelId: string;
  metric: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  baselineValue: number;
  currentValue: number;
  regressionPercent: number;
  detectedAt: string;
  acknowledged: boolean;
  resolvedAt?: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const benchmarkSuites = new Map<string, BenchmarkSuite>();
const benchmarkRuns = new Map<string, BenchmarkRun[]>();
const benchmarkReports = new Map<string, BenchmarkReport>();
const performanceRegressions = new Map<string, PerformanceRegression[]>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculateStatistics(values: number[], confidenceLevel: number): ResultStatistics {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];

  const zScore = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.99 ? 2.576 : 1.645;
  const marginOfError = zScore * (stdDev / Math.sqrt(n));

  return {
    mean,
    median,
    stdDev,
    min: sorted[0],
    max: sorted[n - 1],
    p50: sorted[Math.floor(n * 0.5)],
    p90: sorted[Math.floor(n * 0.9)],
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)],
    confidenceInterval: {
      lower: mean - marginOfError,
      upper: mean + marginOfError,
      level: confidenceLevel,
    },
  };
}

function detectOutliers(values: number[], threshold: number): number[] {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const stdDev = Math.sqrt(
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  );

  return values.filter(v => Math.abs(v - mean) > threshold * stdDev);
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createBenchmarkSuite(params: {
  organizationId: string;
  name: string;
  description?: string;
  type: BenchmarkType;
  testCases: Omit<BenchmarkTestCase, 'id'>[];
  configuration: BenchmarkConfiguration;
  baseline?: string;
  createdBy: string;
}): BenchmarkSuite {
  const now = new Date().toISOString();
  const id = randomUUID();

  const suite: BenchmarkSuite = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    type: params.type,
    status: 'ready',
    testCases: params.testCases.map(tc => ({ ...tc, id: randomUUID() })),
    configuration: params.configuration,
    baseline: params.baseline,
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  benchmarkSuites.set(id, suite);
  benchmarkRuns.set(id, []);

  return suite;
}

export function getBenchmarkSuite(id: string): BenchmarkSuite | undefined {
  return benchmarkSuites.get(id);
}

export function listBenchmarkSuites(
  organizationId: string,
  filters?: { type?: BenchmarkType; status?: BenchmarkSuiteStatus }
): BenchmarkSuite[] {
  let result = Array.from(benchmarkSuites.values()).filter(
    s => s.organizationId === organizationId
  );

  if (filters?.type) result = result.filter(s => s.type === filters.type);
  if (filters?.status) result = result.filter(s => s.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateBenchmarkSuite(
  suiteId: string,
  updates: Partial<BenchmarkSuite>
): BenchmarkSuite {
  const suite = benchmarkSuites.get(suiteId);
  if (!suite) throw new Error(`Benchmark suite ${suiteId} not found`);

  Object.assign(suite, updates);
  suite.updatedAt = new Date().toISOString();

  return suite;
}

export function runBenchmark(
  suiteId: string,
  modelId: string,
  modelVersion: string,
  initiatedBy: string
): BenchmarkRun {
  const suite = benchmarkSuites.get(suiteId);
  if (!suite) throw new Error(`Benchmark suite ${suiteId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const run: BenchmarkRun = {
    id,
    suiteId,
    modelId,
    modelVersion,
    status: 'running',
    results: [],
    summary: {
      overallScore: 0,
      passedTests: 0,
      failedTests: 0,
      totalTests: suite.testCases.length,
      averageLatency: 0,
      throughput: 0,
      resourceUsage: {
        cpuUsage: 0,
        memoryUsage: 0,
      },
      recommendations: [],
    },
    startedAt: now,
    duration: 0,
    environment: suite.configuration.environment,
    hardware: suite.configuration.hardware,
    initiatedBy,
  };

  const suiteRuns = benchmarkRuns.get(suiteId) || [];
  suiteRuns.push(run);
  benchmarkRuns.set(suiteId, suiteRuns);

  // Simulate benchmark execution
  setTimeout(() => {
    executeBenchmark(run, suite);
  }, 100);

  return run;
}

function executeBenchmark(run: BenchmarkRun, suite: BenchmarkSuite): void {
  const results: BenchmarkResult[] = [];
  let totalLatency = 0;
  let totalThroughput = 0;

  for (const testCase of suite.testCases) {
    const iterations: IterationResult[] = [];
    const metricValues: Record<string, number[]> = {};

    // Warmup iterations
    for (let i = 0; i < testCase.warmupIterations; i++) {
      // Simulate warmup
    }

    // Actual iterations
    for (let i = 0; i < testCase.iterations; i++) {
      const latency = 50 + _rng.next() * 100; // 50-150ms
      const throughput = 1000 / latency; // requests per second

      const metrics: Record<string, number> = {
        latency,
        throughput,
        cpuUsage: 30 + _rng.next() * 40,
        memoryUsage: 40 + _rng.next() * 30,
      };

      if (suite.configuration.hardware.gpu) {
        metrics.gpuUsage = 50 + _rng.next() * 40;
        metrics.gpuMemoryUsage = 30 + _rng.next() * 50;
      }

      iterations.push({
        iteration: i + 1,
        metrics,
        duration: latency / 1000,
        timestamp: new Date().toISOString(),
      });

      // Collect metric values
      for (const [key, value] of Object.entries(metrics)) {
        if (!metricValues[key]) metricValues[key] = [];
        metricValues[key].push(value);
      }

      totalLatency += latency;
      totalThroughput += throughput;
    }

    // Detect and remove outliers
    if (suite.configuration.statistical.outlierDetection) {
      for (const [key, values] of Object.entries(metricValues)) {
        const outliers = detectOutliers(values, suite.configuration.statistical.outlierThreshold);
        metricValues[key] = values.filter(v => !outliers.includes(v));
      }
    }

    // Calculate statistics for each metric
    const metrics: BenchmarkMetric[] = [];
    for (const [key, values] of Object.entries(metricValues)) {
      const stats = calculateStatistics(values, suite.configuration.statistical.confidenceLevel);
      metrics.push({
        name: key,
        value: stats.mean,
        unit: key.includes('latency') ? 'ms' : key.includes('throughput') ? 'req/s' : '%',
        lowerIsBetter: key.includes('latency') || key.includes('usage'),
      });
    }

    const primaryMetric = metrics.find(m => m.name === 'latency') || metrics[0];
    const primaryValues = metricValues[primaryMetric.name];
    const statistics = calculateStatistics(primaryValues, suite.configuration.statistical.confidenceLevel);

    results.push({
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      metrics,
      iterations,
      statistics,
      status: 'passed',
    });
  }

  const averageLatency = totalLatency / (suite.testCases.length * suite.testCases[0]?.iterations || 1);
  const averageThroughput = totalThroughput / (suite.testCases.length * suite.testCases[0]?.iterations || 1);

  run.results = results;
  run.summary.averageLatency = averageLatency;
  run.summary.throughput = averageThroughput;
  run.summary.passedTests = results.filter(r => r.status === 'passed').length;
  run.summary.failedTests = results.filter(r => r.status === 'failed').length;
  run.summary.overallScore = (run.summary.passedTests / run.summary.totalTests) * 100;

  // Compare with baseline if available
  if (suite.baseline) {
    const suiteRuns = benchmarkRuns.get(suiteId) || [];
    const baselineRun = suiteRuns.find(r => r.id === suite.baseline);

    if (baselineRun) {
      run.comparison = compareBenchmarkRuns(baselineRun, run);

      // Detect regressions
      if (run.comparison.regression) {
        for (const detail of run.comparison.regressionDetails) {
          const regression: PerformanceRegression = {
            id: randomUUID(),
            runId: run.id,
            modelId: run.modelId,
            metric: detail,
            severity: 'high',
            baselineValue: 0,
            currentValue: 0,
            regressionPercent: 0,
            detectedAt: new Date().toISOString(),
            acknowledged: false,
          };

          const regressions = performanceRegressions.get(run.modelId) || [];
          regressions.push(regression);
          performanceRegressions.set(run.modelId, regressions);
        }
      }
    }
  }

  run.status = 'completed';
  run.completedAt = new Date().toISOString();
  run.duration = (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000;
}

function compareBenchmarkRuns(baseline: BenchmarkRun, current: BenchmarkRun): BenchmarkComparison {
  const differences: MetricDifference[] = [];
  const regressionDetails: string[] = [];
  const improvementDetails: string[] = [];

  for (const currentResult of current.results) {
    const baselineResult = baseline.results.find(r => r.testCaseId === currentResult.testCaseId);
    if (!baselineResult) continue;

    for (const currentMetric of currentResult.metrics) {
      const baselineMetric = baselineResult.metrics.find(m => m.name === currentMetric.name);
      if (!baselineMetric) continue;

      const difference = currentMetric.value - baselineMetric.value;
      const percentChange = (difference / baselineMetric.value) * 100;

      const isRegression = currentMetric.lowerIsBetter ? difference > 0 : difference < 0;
      const isImprovement = currentMetric.lowerIsBetter ? difference < 0 : difference > 0;

      const significance = Math.abs(percentChange) > 10 ? 'significant'
        : Math.abs(percentChange) > 5 ? 'marginal'
        : 'insignificant';

      differences.push({
        metric: currentMetric.name,
        baselineValue: baselineMetric.value,
        currentValue: currentMetric.value,
        difference,
        percentChange,
        isRegression,
        isImprovement,
        significance,
      });

      if (isRegression && significance === 'significant') {
        regressionDetails.push(`${currentMetric.name}: ${percentChange.toFixed(2)}% regression`);
      }

      if (isImprovement && significance === 'significant') {
        improvementDetails.push(`${currentMetric.name}: ${percentChange.toFixed(2)}% improvement`);
      }
    }
  }

  return {
    baselineRunId: baseline.id,
    currentRunId: current.id,
    differences,
    regression: regressionDetails.length > 0,
    regressionDetails,
    improvement: improvementDetails.length > 0,
    improvementDetails,
  };
}

export function getBenchmarkRun(suiteId: string, runId: string): BenchmarkRun | undefined {
  const suiteRuns = benchmarkRuns.get(suiteId) || [];
  return suiteRuns.find(r => r.id === runId);
}

export function listBenchmarkRuns(
  suiteId: string,
  filters?: { modelId?: string; status?: BenchmarkRunStatus }
): BenchmarkRun[] {
  let result = benchmarkRuns.get(suiteId) || [];

  if (filters?.modelId) result = result.filter(r => r.modelId === filters.modelId);
  if (filters?.status) result = result.filter(r => r.status === filters.status);

  return result.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function compareBenchmarks(
  suiteId: string,
  baselineRunId: string,
  currentRunId: string
): BenchmarkComparison {
  const suiteRuns = benchmarkRuns.get(suiteId) || [];
  const baseline = suiteRuns.find(r => r.id === baselineRunId);
  const current = suiteRuns.find(r => r.id === currentRunId);

  if (!baseline || !current) {
    throw new Error('One or both benchmark runs not found');
  }

  return compareBenchmarkRuns(baseline, current);
}

export function generateBenchmarkReport(
  suiteId: string,
  runId: string,
  type: 'detailed' | 'summary' | 'comparison',
  generatedBy: string
): BenchmarkReport {
  const run = getBenchmarkRun(suiteId, runId);
  if (!run) throw new Error(`Benchmark run ${runId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const executiveSummary = `Benchmark "${run.summary.overallScore.toFixed(1)}% score with ` +
    `${run.summary.passedTests}/${run.summary.totalTests} tests passed. ` +
    `Average latency: ${run.summary.averageLatency.toFixed(2)}ms, ` +
    `Throughput: ${run.summary.throughput.toFixed(2)} req/s.`;

  const recommendations: BenchmarkRecommendation[] = [];

  if (run.summary.averageLatency > 100) {
    recommendations.push({
      id: randomUUID(),
      priority: 'high',
      category: 'performance',
      title: 'Optimize Inference Latency',
      description: `Average latency (${run.summary.averageLatency.toFixed(2)}ms) exceeds target`,
      impact: 'Improved user experience and throughput',
      effort: 'medium',
      actionItems: [
        'Profile model inference',
        'Consider model quantization',
        'Implement batching',
      ],
    });
  }

  if (run.summary.resourceUsage.cpuUsage > 80) {
    recommendations.push({
      id: randomUUID(),
      priority: 'medium',
      category: 'resource',
      title: 'Optimize CPU Usage',
      description: `CPU usage (${run.summary.resourceUsage.cpuUsage.toFixed(1)}%) is high`,
      impact: 'Better resource utilization and cost efficiency',
      effort: 'medium',
      actionItems: [
        'Review model complexity',
        'Consider horizontal scaling',
        'Optimize preprocessing',
      ],
    });
  }

  const report: BenchmarkReport = {
    id,
    runId,
    type,
    title: `${type.charAt(0).toUpperCase() + type.slice(1)} Benchmark Report`,
    executiveSummary,
    results: run.results,
    comparison: run.comparison,
    performanceTrends: [],
    recommendations,
    appendices: [],
    generatedAt: now,
    generatedBy,
  };

  benchmarkReports.set(id, report);
  return report;
}

export function getBenchmarkReport(id: string): BenchmarkReport | undefined {
  return benchmarkReports.get(id);
}

export function listBenchmarkReports(
  organizationId: string,
  filters?: { suiteId?: string; type?: string }
): BenchmarkReport[] {
  const suites = Array.from(benchmarkSuites.values()).filter(
    s => s.organizationId === organizationId
  );
  const suiteIds = suites.map(s => s.id);

  let result = Array.from(benchmarkReports.values()).filter(
    r => {
      const run = Array.from(benchmarkRuns.values())
        .flat()
        .find(run => run.id === r.runId);
      return run && suiteIds.includes(run.suiteId);
    }
  );

  if (filters?.suiteId) {
    result = result.filter(r => {
      const run = Array.from(benchmarkRuns.values())
        .flat()
        .find(run => run.id === r.runId);
      return run && run.suiteId === filters.suiteId;
    });
  }

  if (filters?.type) result = result.filter(r => r.type === filters.type);

  return result.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export function getPerformanceRegressions(
  modelId: string,
  filters?: { severity?: string; acknowledged?: boolean }
): PerformanceRegression[] {
  let result = performanceRegressions.get(modelId) || [];

  if (filters?.severity) result = result.filter(r => r.severity === filters.severity);
  if (filters?.acknowledged !== undefined) {
    result = result.filter(r => r.acknowledged === filters.acknowledged);
  }

  return result.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

export function acknowledgePerformanceRegression(
  modelId: string,
  regressionId: string
): PerformanceRegression {
  const regressions = performanceRegressions.get(modelId) || [];
  const regression = regressions.find(r => r.id === regressionId);
  if (!regression) throw new Error(`Regression ${regressionId} not found`);

  regression.acknowledged = true;
  return regression;
}

export function resolvePerformanceRegression(
  modelId: string,
  regressionId: string
): PerformanceRegression {
  const regressions = performanceRegressions.get(modelId) || [];
  const regression = regressions.find(r => r.id === regressionId);
  if (!regression) throw new Error(`Regression ${regressionId} not found`);

  regression.resolvedAt = new Date().toISOString();
  return regression;
}

export function getBenchmarkDashboard(organizationId: string): {
  totalSuites: number;
  totalRuns: number;
  averageScore: number;
  activeRegressions: number;
  trend: 'improving' | 'stable' | 'degrading';
} {
  const suites = Array.from(benchmarkSuites.values()).filter(
    s => s.organizationId === organizationId
  );

  const suiteIds = suites.map(s => s.id);
  const allRuns = suiteIds.flatMap(id => benchmarkRuns.get(id) || []);

  const completedRuns = allRuns.filter(r => r.status === 'completed');
  const averageScore = completedRuns.length > 0
    ? completedRuns.reduce((sum, r) => sum + r.summary.overallScore, 0) / completedRuns.length
    : 0;

  const modelIds = [...new Set(allRuns.map(r => r.modelId))];
  const activeRegressions = modelIds.reduce((sum, modelId) => {
    const regressions = performanceRegressions.get(modelId) || [];
    return sum + regressions.filter(r => !r.resolvedAt).length;
  }, 0);

  return {
    totalSuites: suites.length,
    totalRuns: allRuns.length,
    averageScore,
    activeRegressions,
    trend: 'stable',
  };
}
