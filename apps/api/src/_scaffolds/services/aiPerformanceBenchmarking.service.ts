/**
 * Module 127: AI Performance Benchmarking Service
 * WINDELS AI OS - Phase 3
 * 
 * Provides performance benchmarking capabilities including standardized benchmarks,
 * performance regression detection, comparative analysis, benchmark automation,
 * and performance tracking over time.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiPerformanceBenchmarking');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BenchmarkSuite {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: BenchmarkStatus;
  benchmarks: Benchmark[];
  configuration: BenchmarkConfiguration;
  results?: BenchmarkSuiteResults;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type BenchmarkStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Benchmark {
  id: string;
  name: string;
  modelId: string;
  modelVersion: string;
  dataset: BenchmarkDataset;
  metrics: BenchmarkMetric[];
  configuration: BenchmarkRunConfiguration;
}

export interface BenchmarkDataset {
  id: string;
  name: string;
  type: 'synthetic' | 'standard' | 'custom';
  size: number;
  format: string;
  location: string;
  preprocessing?: string;
}

export interface BenchmarkMetric {
  name: string;
  type: 'latency' | 'throughput' | 'accuracy' | 'memory' | 'cpu' | 'gpu' | 'custom';
  unit: string;
  direction: 'higher_is_better' | 'lower_is_better';
  target?: number;
  weight: number;
}

export interface BenchmarkRunConfiguration {
  iterations: number;
  warmupIterations: number;
  batchSize: number;
  concurrency: number;
  hardware: HardwareConfig;
  environment: Record<string, string>;
}

export interface HardwareConfig {
  cpuCores: number;
  memoryGB: number;
  gpuType?: string;
  gpuCount?: number;
  gpuMemoryGB?: number;
}

export interface BenchmarkConfiguration {
  baselineModelId?: string;
  baselineVersion?: string;
  comparisonModels?: string[];
  regressionThreshold: number;
  statisticalSignificance: number;
  timeout: number;
  parallelExecution: boolean;
}

export interface BenchmarkSuiteResults {
  summary: BenchmarkSummary;
  individualResults: BenchmarkResult[];
  comparison?: BenchmarkComparison;
  regressionAnalysis?: RegressionAnalysis;
  performanceTrend?: PerformanceTrend;
  recommendations: BenchmarkRecommendation[];
}

export interface BenchmarkSummary {
  overallScore: number;
  passedBenchmarks: number;
  failedBenchmarks: number;
  totalBenchmarks: number;
  averageLatency: number;
  averageThroughput: number;
  averageAccuracy: number;
  bestPerformingModel?: string;
}

export interface BenchmarkResult {
  benchmarkId: string;
  benchmarkName: string;
  modelId: string;
  modelVersion: string;
  status: 'passed' | 'failed' | 'error';
  metrics: MetricResult[];
  performance: PerformanceMetrics;
  resourceUsage: ResourceUsage;
  executionTime: number;
  environment: Record<string, string>;
  timestamp: string;
}

export interface MetricResult {
  name: string;
  value: number;
  target?: number;
  passed: boolean;
  percentile?: Record<string, number>;
  confidence?: number;
}

export interface PerformanceMetrics {
  latency: LatencyMetrics;
  throughput: ThroughputMetrics;
  scalability: ScalabilityMetrics;
}

export interface LatencyMetrics {
  mean: number;
  median: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  std: number;
}

export interface ThroughputMetrics {
  requestsPerSecond: number;
  samplesPerSecond: number;
  batchSize: number;
  concurrency: number;
}

export interface ScalabilityMetrics {
  linearSpeedup: number;
  efficiency: number;
  scalingFactor: number;
}

export interface ResourceUsage {
  cpuUsage: number;
  memoryUsage: number;
  gpuUsage?: number;
  gpuMemoryUsage?: number;
  networkIO?: number;
  diskIO?: number;
}

export interface BenchmarkComparison {
  baseline: BenchmarkResult;
  candidates: BenchmarkResult[];
  comparisons: ModelComparison[];
  winner?: string;
}

export interface ModelComparison {
  modelId: string;
  modelVersion: string;
  metricComparisons: MetricComparison[];
  overallImprovement: number;
  rank: number;
}

export interface MetricComparison {
  metric: string;
  baselineValue: number;
  candidateValue: number;
  difference: number;
  percentChange: number;
  improvement: boolean;
}

export interface RegressionAnalysis {
  hasRegression: boolean;
  regressionScore: number;
  regressedMetrics: RegressedMetric[];
  severity: 'none' | 'minor' | 'moderate' | 'severe' | 'critical';
  recommendations: string[];
}

export interface RegressedMetric {
  metric: string;
  baselineValue: number;
  currentValue: number;
  regression: number;
  percentRegression: number;
  threshold: number;
  exceeded: boolean;
}

export interface PerformanceTrend {
  period: string;
  dataPoints: TrendDataPoint[];
  trend: 'improving' | 'degrading' | 'stable';
  trendPercentage: number;
  forecast?: TrendForecast[];
}

export interface TrendDataPoint {
  timestamp: string;
  modelVersion: string;
  metrics: Record<string, number>;
}

export interface TrendForecast {
  timestamp: string;
  predictedValue: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
}

export interface BenchmarkRecommendation {
  id: string;
  category: 'performance' | 'resource' | 'configuration' | 'architecture';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  expectedImprovement: string;
  effort: 'low' | 'medium' | 'high';
  actionItems: string[];
}

export interface BenchmarkHistory {
  modelId: string;
  history: HistoricalBenchmark[];
  trends: Record<string, TrendAnalysis>;
}

export interface HistoricalBenchmark {
  timestamp: string;
  modelVersion: string;
  overallScore: number;
  metrics: Record<string, number>;
  benchmarkSuiteId: string;
}

export interface TrendAnalysis {
  metric: string;
  direction: 'improving' | 'degrading' | 'stable';
  changePercentage: number;
  dataPoints: number;
  confidence: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const benchmarkSuites = new Map<string, BenchmarkSuite>();
const benchmarkHistory = new Map<string, BenchmarkHistory>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculateLatencyMetrics(latencies: number[]): LatencyMetrics {
  const sorted = [...latencies].sort((a, b) => a - b);
  const mean = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
  const variance = latencies.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / latencies.length;

  return {
    mean,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
    std: Math.sqrt(variance),
  };
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createBenchmarkSuite(params: {
  organizationId: string;
  name: string;
  description?: string;
  benchmarks: Benchmark[];
  configuration?: Partial<BenchmarkConfiguration>;
  createdBy: string;
}): BenchmarkSuite {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultConfig: BenchmarkConfiguration = {
    regressionThreshold: 0.05,
    statisticalSignificance: 0.95,
    timeout: 3600,
    parallelExecution: true,
  };

  const suite: BenchmarkSuite = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'pending',
    benchmarks: params.benchmarks,
    configuration: { ...defaultConfig, ...params.configuration },
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  benchmarkSuites.set(id, suite);
  return suite;
}

export function getBenchmarkSuite(id: string): BenchmarkSuite | undefined {
  return benchmarkSuites.get(id);
}

export function listBenchmarkSuites(
  organizationId: string,
  filters?: { status?: BenchmarkStatus }
): BenchmarkSuite[] {
  let result = Array.from(benchmarkSuites.values()).filter(
    s => s.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(s => s.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function runBenchmarkSuite(suiteId: string): BenchmarkSuite {
  const suite = benchmarkSuites.get(suiteId);
  if (!suite) throw new Error(`Benchmark suite ${suiteId} not found`);

  suite.status = 'running';
  suite.updatedAt = new Date().toISOString();

  // Simulate benchmark execution
  setTimeout(() => {
    completeBenchmarkSuite(suite);
  }, 2000);

  return suite;
}

function completeBenchmarkSuite(suite: BenchmarkSuite): void {
  const now = new Date().toISOString();

  const individualResults: BenchmarkResult[] = suite.benchmarks.map(benchmark => {
    const latencies = Array(benchmark.configuration.iterations).fill(0).map(() => 50 + _rng.next() * 30);
    const latencyMetrics = calculateLatencyMetrics(latencies);

    return {
      benchmarkId: benchmark.id,
      benchmarkName: benchmark.name,
      modelId: benchmark.modelId,
      modelVersion: benchmark.modelVersion,
      status: 'passed' as const,
      metrics: benchmark.metrics.map(metric => ({
        name: metric.name,
        value: metric.type === 'latency' ? latencyMetrics.mean :
               metric.type === 'throughput' ? 1000 / latencyMetrics.mean :
               metric.type === 'accuracy' ? 0.85 + _rng.next() * 0.1 :
               _rng.next() * 100,
        target: metric.target,
        passed: true,
        percentile: { p50: latencyMetrics.median, p95: latencyMetrics.p95, p99: latencyMetrics.p99 },
      })),
      performance: {
        latency: latencyMetrics,
        throughput: {
          requestsPerSecond: 1000 / latencyMetrics.mean,
          samplesPerSecond: benchmark.configuration.batchSize * (1000 / latencyMetrics.mean),
          batchSize: benchmark.configuration.batchSize,
          concurrency: benchmark.configuration.concurrency,
        },
        scalability: {
          linearSpeedup: 0.9,
          efficiency: 0.85,
          scalingFactor: benchmark.configuration.concurrency * 0.85,
        },
      },
      resourceUsage: {
        cpuUsage: 45 + _rng.next() * 20,
        memoryUsage: 60 + _rng.next() * 20,
        gpuUsage: 70 + _rng.next() * 20,
        gpuMemoryUsage: 65 + _rng.next() * 20,
      },
      executionTime: benchmark.configuration.iterations * latencyMetrics.mean / 1000,
      environment: benchmark.configuration.environment,
      timestamp: now,
    };
  });

  const avgLatency = individualResults.reduce((sum, r) => sum + r.performance.latency.mean, 0) / individualResults.length;
  const avgThroughput = individualResults.reduce((sum, r) => sum + r.performance.throughput.requestsPerSecond, 0) / individualResults.length;
  const avgAccuracy = individualResults.reduce((sum, r) => {
    const accMetric = r.metrics.find(m => m.name.toLowerCase().includes('accuracy'));
    return sum + (accMetric?.value || 0);
  }, 0) / individualResults.length;

  suite.results = {
    summary: {
      overallScore: 85,
      passedBenchmarks: individualResults.length,
      failedBenchmarks: 0,
      totalBenchmarks: individualResults.length,
      averageLatency: avgLatency,
      averageThroughput: avgThroughput,
      averageAccuracy: avgAccuracy,
    },
    individualResults,
    recommendations: [
      {
        id: randomUUID(),
        category: 'performance',
        priority: 'medium',
        title: 'Optimize Batch Size',
        description: 'Current batch size may not be optimal for your hardware',
        expectedImprovement: '10-15% throughput improvement',
        effort: 'low',
        actionItems: [
          'Test different batch sizes (16, 32, 64, 128)',
          'Monitor GPU utilization at each batch size',
          'Select batch size with best throughput/utilization balance',
        ],
      },
    ],
  };

  suite.status = 'completed';
  suite.updatedAt = now;

  // Update benchmark history
  individualResults.forEach(result => {
    const history = benchmarkHistory.get(result.modelId) || {
      modelId: result.modelId,
      history: [],
      trends: {},
    };

    history.history.push({
      timestamp: now,
      modelVersion: result.modelVersion,
      overallScore: 85,
      metrics: {
        latency: result.performance.latency.mean,
        throughput: result.performance.throughput.requestsPerSecond,
        accuracy: avgAccuracy,
      },
      benchmarkSuiteId: suite.id,
    });

    benchmarkHistory.set(result.modelId, history);
  });
}

export function compareBenchmarkResults(
  suiteId: string,
  baselineModelId: string,
  candidateModelIds: string[]
): BenchmarkComparison {
  const suite = benchmarkSuites.get(suiteId);
  if (!suite || !suite.results) throw new Error(`Benchmark suite ${suiteId} not found or incomplete`);

  const baseline = suite.results.individualResults.find(r => r.modelId === baselineModelId);
  if (!baseline) throw new Error('Baseline model not found in results');

  const candidates = suite.results.individualResults.filter(r => candidateModelIds.includes(r.modelId));

  const comparisons: ModelComparison[] = candidates.map(candidate => {
    const metricComparisons: MetricComparison[] = baseline.metrics.map(baselineMetric => {
      const candidateMetric = candidate.metrics.find(m => m.name === baselineMetric.name);
      const candidateValue = candidateMetric?.value || 0;
      const difference = candidateValue - baselineMetric.value;
      const percentChange = (difference / baselineMetric.value) * 100;
      const metric = baseline.metrics.find(m => m.name === baselineMetric.name);
      const isLatency = baselineMetric.name.toLowerCase().includes('latency');
      const improvement = isLatency ? difference < 0 : difference > 0;

      return {
        metric: baselineMetric.name,
        baselineValue: baselineMetric.value,
        candidateValue,
        difference,
        percentChange,
        improvement,
      };
    });

    const overallImprovement = metricComparisons.reduce((sum, m) => sum + m.percentChange, 0) / metricComparisons.length;

    return {
      modelId: candidate.modelId,
      modelVersion: candidate.modelVersion,
      metricComparisons,
      overallImprovement,
      rank: 0,
    };
  });

  comparisons.sort((a, b) => b.overallImprovement - a.overallImprovement);
  comparisons.forEach((c, i) => { c.rank = i + 1; });

  const winner = comparisons.length > 0 && comparisons[0].overallImprovement > 0
    ? comparisons[0].modelId
    : baselineModelId;

  return {
    baseline,
    candidates,
    comparisons,
    winner,
  };
}

export function detectPerformanceRegression(
  suiteId: string,
  baselineSuiteId: string
): RegressionAnalysis {
  const currentSuite = benchmarkSuites.get(suiteId);
  const baselineSuite = benchmarkSuites.get(baselineSuiteId);

  if (!currentSuite || !currentSuite.results || !baselineSuite || !baselineSuite.results) {
    throw new Error('One or both benchmark suites not found or incomplete');
  }

  const currentAvg = currentSuite.results.summary;
  const baselineAvg = baselineSuite.results.summary;

  const regressedMetrics: RegressedMetric[] = [];

  // Check latency regression
  const latencyRegression = (currentAvg.averageLatency - baselineAvg.averageLatency) / baselineAvg.averageLatency;
  if (latencyRegression > currentSuite.configuration.regressionThreshold) {
    regressedMetrics.push({
      metric: 'latency',
      baselineValue: baselineAvg.averageLatency,
      currentValue: currentAvg.averageLatency,
      regression: currentAvg.averageLatency - baselineAvg.averageLatency,
      percentRegression: latencyRegression * 100,
      threshold: currentSuite.configuration.regressionThreshold * 100,
      exceeded: true,
    });
  }

  // Check throughput regression
  const throughputRegression = (baselineAvg.averageThroughput - currentAvg.averageThroughput) / baselineAvg.averageThroughput;
  if (throughputRegression > currentSuite.configuration.regressionThreshold) {
    regressedMetrics.push({
      metric: 'throughput',
      baselineValue: baselineAvg.averageThroughput,
      currentValue: currentAvg.averageThroughput,
      regression: baselineAvg.averageThroughput - currentAvg.averageThroughput,
      percentRegression: throughputRegression * 100,
      threshold: currentSuite.configuration.regressionThreshold * 100,
      exceeded: true,
    });
  }

  const hasRegression = regressedMetrics.length > 0;
  const regressionScore = regressedMetrics.reduce((sum, m) => sum + m.percentRegression, 0) / Math.max(regressedMetrics.length, 1);

  const severity: 'none' | 'minor' | 'moderate' | 'severe' | 'critical' =
    !hasRegression ? 'none' :
    regressionScore < 5 ? 'minor' :
    regressionScore < 10 ? 'moderate' :
    regressionScore < 20 ? 'severe' : 'critical';

  const recommendations: string[] = [];
  if (hasRegression) {
    recommendations.push('Investigate recent code changes that may have caused regression');
    recommendations.push('Review resource usage and identify bottlenecks');
    recommendations.push('Consider rolling back to baseline version if regression is severe');
  }

  return {
    hasRegression,
    regressionScore,
    regressedMetrics,
    severity,
    recommendations,
  };
}

export function getBenchmarkHistory(modelId: string): BenchmarkHistory | undefined {
  return benchmarkHistory.get(modelId);
}

export function analyzePerformanceTrends(modelId: string, period: string): PerformanceTrend {
  const history = benchmarkHistory.get(modelId);
  if (!history) throw new Error(`No benchmark history found for model ${modelId}`);

  const dataPoints = history.history.map(h => ({
    timestamp: h.timestamp,
    modelVersion: h.modelVersion,
    metrics: h.metrics,
  }));

  const latencies = dataPoints.map(d => d.metrics.latency);
  const firstLatency = latencies[0];
  const lastLatency = latencies[latencies.length - 1];
  const trendPercentage = ((lastLatency - firstLatency) / firstLatency) * 100;

  const trend: 'improving' | 'degrading' | 'stable' =
    trendPercentage < -5 ? 'improving' :
    trendPercentage > 5 ? 'degrading' : 'stable';

  return {
    period,
    dataPoints,
    trend,
    trendPercentage,
  };
}

export function generateBenchmarkReport(suiteId: string): {
  summary: string;
  keyFindings: string[];
  performanceMetrics: any;
  recommendations: BenchmarkRecommendation[];
} {
  const suite = benchmarkSuites.get(suiteId);
  if (!suite || !suite.results) throw new Error(`Benchmark suite ${suiteId} not found or incomplete`);

  return {
    summary: `Benchmark suite "${suite.name}" completed with ${suite.results.summary.passedBenchmarks}/${suite.results.summary.totalBenchmarks} benchmarks passed.`,
    keyFindings: [
      `Average latency: ${suite.results.summary.averageLatency.toFixed(2)}ms`,
      `Average throughput: ${suite.results.summary.averageThroughput.toFixed(2)} req/s`,
      `Average accuracy: ${(suite.results.summary.averageAccuracy * 100).toFixed(2)}%`,
    ],
    performanceMetrics: suite.results.individualResults.map(r => ({
      benchmark: r.benchmarkName,
      model: r.modelId,
      latency: r.performance.latency,
      throughput: r.performance.throughput,
      resourceUsage: r.resourceUsage,
    })),
    recommendations: suite.results.recommendations,
  };
}
