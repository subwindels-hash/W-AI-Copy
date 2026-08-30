/**
 * Module 133: AI Model Shadow Testing Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides shadow testing capabilities for AI models including production traffic
 * mirroring, parallel inference, result comparison, performance analysis, and
 * safe testing of new models without affecting production users.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ShadowTest {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: ShadowTestStatus;
  productionModel: ModelEndpoint;
  shadowModel: ModelEndpoint;
  configuration: ShadowTestConfiguration;
  metrics: ShadowTestMetrics;
  comparisons: ResultComparison[];
  alerts: ShadowAlert[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
}

export type ShadowTestStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface ModelEndpoint {
  modelId: string;
  modelVersion: string;
  endpoint: string;
  timeout: number; // milliseconds
  retryPolicy: RetryPolicy;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
}

export interface ShadowTestConfiguration {
  trafficPercentage: number; // 0-100
  samplingStrategy: 'random' | 'stratified' | 'weighted';
  comparisonMode: 'synchronous' | 'asynchronous';
  resultStorage: 'full' | 'summary' | 'none';
  duration: number; // hours
  maxRequests: number;
  comparisonMetrics: ComparisonMetric[];
  alertThresholds: AlertThreshold[];
}

export interface ComparisonMetric {
  name: string;
  type: 'latency' | 'accuracy' | 'output_similarity' | 'custom';
  weight: number;
  threshold?: number;
}

export interface AlertThreshold {
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
}

export interface ShadowTestMetrics {
  totalRequests: number;
  comparedRequests: number;
  productionLatency: LatencyMetrics;
  shadowLatency: LatencyMetrics;
  latencyDifference: LatencyDifference;
  outputSimilarity: OutputSimilarity;
  errorRates: ErrorRates;
  customMetrics: Record<string, CustomMetricValue>;
}

export interface LatencyMetrics {
  mean: number;
  median: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

export interface LatencyDifference {
  meanDifference: number;
  percentChange: number;
  p95Difference: number;
  isSignificant: boolean;
}

export interface OutputSimilarity {
  exactMatch: number; // percentage
  similarityScore: number; // 0-1
  divergenceRate: number; // percentage
  samples: SimilaritySample[];
}

export interface SimilaritySample {
  requestId: string;
  productionOutput: any;
  shadowOutput: any;
  similarity: number;
  differences: OutputDifference[];
  timestamp: string;
}

export interface OutputDifference {
  field: string;
  productionValue: any;
  shadowValue: any;
  difference: any;
  significance: 'low' | 'medium' | 'high';
}

export interface ErrorRates {
  productionErrorRate: number;
  shadowErrorRate: number;
  errorRateDifference: number;
  productionErrors: ErrorBreakdown;
  shadowErrors: ErrorBreakdown;
}

export interface ErrorBreakdown {
  total: number;
  timeout: number;
  serverError: number;
  clientError: number;
  other: number;
}

export interface CustomMetricValue {
  production: number;
  shadow: number;
  difference: number;
  percentChange: number;
}

export interface ResultComparison {
  id: string;
  requestId: string;
  timestamp: string;
  productionResult: InferenceResult;
  shadowResult: InferenceResult;
  latencyComparison: LatencyComparison;
  outputComparison: OutputComparison;
  overallSimilarity: number;
  flagged: boolean;
  flags: ComparisonFlag[];
}

export interface InferenceResult {
  output: any;
  latency: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface LatencyComparison {
  productionLatency: number;
  shadowLatency: number;
  difference: number;
  percentChange: number;
  isSignificant: boolean;
}

export interface OutputComparison {
  exactMatch: boolean;
  similarityScore: number;
  differences: OutputDifference[];
  semanticSimilarity?: number;
}

export interface ComparisonFlag {
  type: 'latency_regression' | 'output_divergence' | 'error_rate_increase' | 'anomaly';
  severity: 'info' | 'warning' | 'critical';
  description: string;
  metric?: string;
  value?: number;
  threshold?: number;
}

export interface ShadowAlert {
  id: string;
  type: ShadowAlertType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metric?: string;
  threshold?: number;
  actualValue?: number;
  triggeredAt: string;
  resolvedAt?: string;
  acknowledged: boolean;
}

export type ShadowAlertType =
  | 'latency_regression'
  | 'output_divergence'
  | 'error_rate_spike'
  | 'similarity_drop'
  | 'anomaly_detected';

export interface ShadowTestReport {
  id: string;
  testId: string;
  executiveSummary: string;
  performanceAnalysis: PerformanceAnalysis;
  outputAnalysis: OutputAnalysis;
  errorAnalysis: ErrorAnalysis;
  recommendations: TestRecommendation[];
  appendices: ReportAppendix[];
  generatedAt: string;
}

export interface PerformanceAnalysis {
  latencyComparison: LatencyComparisonSummary;
  throughputComparison: ThroughputComparison;
  resourceUsage: ResourceUsageComparison;
  performanceVerdict: PerformanceVerdict;
}

export interface LatencyComparisonSummary {
  productionStats: LatencyMetrics;
  shadowStats: LatencyMetrics;
  differences: LatencyDifference;
  percentiles: PercentileComparison[];
  trend: 'improving' | 'degrading' | 'stable';
}

export interface PercentileComparison {
  percentile: number;
  production: number;
  shadow: number;
  difference: number;
  percentChange: number;
}

export interface ThroughputComparison {
  productionThroughput: number;
  shadowThroughput: number;
  difference: number;
  percentChange: number;
}

export interface ResourceUsageComparison {
  cpuUsage: MetricComparison;
  memoryUsage: MetricComparison;
  gpuUsage?: MetricComparison;
}

export interface MetricComparison {
  production: number;
  shadow: number;
  difference: number;
  percentChange: number;
}

export interface PerformanceVerdict {
  status: 'better' | 'worse' | 'comparable';
  confidence: number;
  reasoning: string[];
  risks: string[];
}

export interface OutputAnalysis {
  similarityStats: SimilarityStats;
  divergencePatterns: DivergencePattern[];
  outputQuality: OutputQuality;
  outputVerdict: OutputVerdict;
}

export interface SimilarityStats {
  exactMatchRate: number;
  averageSimilarity: number;
  highSimilarityRate: number; // > 0.9
  mediumSimilarityRate: number; // 0.7-0.9
  lowSimilarityRate: number; // < 0.7
}

export interface DivergencePattern {
  pattern: string;
  frequency: number;
  examples: string[];
  impact: 'low' | 'medium' | 'high';
}

export interface OutputQuality {
  productionQuality: number;
  shadowQuality: number;
  qualityDifference: number;
  qualityVerdict: 'better' | 'worse' | 'comparable';
}

export interface OutputVerdict {
  status: 'acceptable' | 'concerning' | 'unacceptable';
  confidence: number;
  reasoning: string[];
  criticalDivergences: number;
}

export interface ErrorAnalysis {
  errorRateComparison: ErrorRateComparison;
  errorPatterns: ErrorPattern[];
  errorVerdict: ErrorVerdict;
}

export interface ErrorRateComparison {
  productionErrorRate: number;
  shadowErrorRate: number;
  difference: number;
  isSignificant: boolean;
}

export interface ErrorPattern {
  pattern: string;
  frequency: number;
  productionCount: number;
  shadowCount: number;
  severity: 'low' | 'medium' | 'high';
}

export interface ErrorVerdict {
  status: 'better' | 'worse' | 'comparable';
  confidence: number;
  reasoning: string[];
  criticalErrors: string[];
}

export interface TestRecommendation {
  priority: 'high' | 'medium' | 'low';
  category: 'performance' | 'quality' | 'reliability' | 'deployment';
  title: string;
  description: string;
  actionItems: string[];
  expectedImpact: string;
}

export interface ReportAppendix {
  title: string;
  content: string;
  data?: any;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const shadowTests = new Map<string, ShadowTest>();
const resultComparisons = new Map<string, ResultComparison[]>();
const shadowTestReports = new Map<string, ShadowTestReport>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculateLatencyMetrics(latencies: number[]): LatencyMetrics {
  if (latencies.length === 0) {
    return { mean: 0, median: 0, p95: 0, p99: 0, min: 0, max: 0 };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  return {
    mean,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function calculateSimilarity(output1: any, output2: any): number {
  if (output1 === output2) return 1;
  if (typeof output1 !== typeof output2) return 0;

  if (typeof output1 === 'number' && typeof output2 === 'number') {
    const diff = Math.abs(output1 - output2);
    const maxVal = Math.max(Math.abs(output1), Math.abs(output2), 1);
    return 1 - (diff / maxVal);
  }

  if (typeof output1 === 'string' && typeof output2 === 'string') {
    // Simple string similarity (Levenshtein-based would be better)
    const maxLen = Math.max(output1.length, output2.length);
    if (maxLen === 0) return 1;
    
    let matches = 0;
    const minLen = Math.min(output1.length, output2.length);
    for (let i = 0; i < minLen; i++) {
      if (output1[i] === output2[i]) matches++;
    }
    return matches / maxLen;
  }

  if (Array.isArray(output1) && Array.isArray(output2)) {
    if (output1.length !== output2.length) return 0;
    const similarities = output1.map((v, i) => calculateSimilarity(v, output2[i]));
    return similarities.reduce((a, b) => a + b, 0) / similarities.length;
  }

  if (typeof output1 === 'object' && typeof output2 === 'object') {
    const keys1 = Object.keys(output1);
    const keys2 = Object.keys(output2);
    const allKeys = new Set([...keys1, ...keys2]);
    
    if (allKeys.size === 0) return 1;
    
    const similarities = Array.from(allKeys).map(key => {
      if (!(key in output1) || !(key in output2)) return 0;
      return calculateSimilarity(output1[key], output2[key]);
    });
    
    return similarities.reduce((a, b) => a + b, 0) / allKeys.size;
  }

  return 0;
}

function findOutputDifferences(output1: any, output2: any, path: string = ''): OutputDifference[] {
  const differences: OutputDifference[] = [];

  if (output1 === output2) return differences;

  if (typeof output1 !== typeof output2) {
    differences.push({
      field: path || 'root',
      productionValue: output1,
      shadowValue: output2,
      difference: 'type_mismatch',
      significance: 'high',
    });
    return differences;
  }

  if (typeof output1 === 'object' && output1 !== null) {
    if (Array.isArray(output1) && Array.isArray(output2)) {
      if (output1.length !== output2.length) {
        differences.push({
          field: `${path}.length`,
          productionValue: output1.length,
          shadowValue: output2.length,
          difference: output2.length - output1.length,
          significance: 'medium',
        });
      }
      
      const minLen = Math.min(output1.length, output2.length);
      for (let i = 0; i < minLen; i++) {
        differences.push(...findOutputDifferences(output1[i], output2[i], `${path}[${i}]`));
      }
    } else if (!Array.isArray(output1) && !Array.isArray(output2)) {
      const allKeys = new Set([...Object.keys(output1), ...Object.keys(output2)]);
      
      for (const key of allKeys) {
        const fieldPath = path ? `${path}.${key}` : key;
        
        if (!(key in output1)) {
          differences.push({
            field: fieldPath,
            productionValue: undefined,
            shadowValue: output2[key],
            difference: 'missing_in_production',
            significance: 'medium',
          });
        } else if (!(key in output2)) {
          differences.push({
            field: fieldPath,
            productionValue: output1[key],
            shadowValue: undefined,
            difference: 'missing_in_shadow',
            significance: 'medium',
          });
        } else {
          differences.push(...findOutputDifferences(output1[key], output2[key], fieldPath));
        }
      }
    }
  } else {
    const diff = typeof output1 === 'number' ? output2 - output1 : output2;
    const significance = typeof output1 === 'number' 
      ? (Math.abs(diff) > 0.1 ? 'high' : Math.abs(diff) > 0.01 ? 'medium' : 'low')
      : 'medium';

    differences.push({
      field: path || 'root',
      productionValue: output1,
      shadowValue: output2,
      difference: diff,
      significance,
    });
  }

  return differences;
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createShadowTest(params: {
  organizationId: string;
  name: string;
  description?: string;
  productionModel: ModelEndpoint;
  shadowModel: ModelEndpoint;
  configuration: ShadowTestConfiguration;
  createdBy: string;
}): ShadowTest {
  const now = new Date().toISOString();
  const id = randomUUID();

  const test: ShadowTest = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'pending',
    productionModel: params.productionModel,
    shadowModel: params.shadowModel,
    configuration: params.configuration,
    metrics: {
      totalRequests: 0,
      comparedRequests: 0,
      productionLatency: { mean: 0, median: 0, p95: 0, p99: 0, min: 0, max: 0 },
      shadowLatency: { mean: 0, median: 0, p95: 0, p99: 0, min: 0, max: 0 },
      latencyDifference: { meanDifference: 0, percentChange: 0, p95Difference: 0, isSignificant: false },
      outputSimilarity: { exactMatch: 0, similarityScore: 0, divergenceRate: 0, samples: [] },
      errorRates: {
        productionErrorRate: 0,
        shadowErrorRate: 0,
        errorRateDifference: 0,
        productionErrors: { total: 0, timeout: 0, serverError: 0, clientError: 0, other: 0 },
        shadowErrors: { total: 0, timeout: 0, serverError: 0, clientError: 0, other: 0 },
      },
      customMetrics: {},
    },
    comparisons: [],
    alerts: [],
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  shadowTests.set(id, test);
  resultComparisons.set(id, []);

  return test;
}

export function getShadowTest(id: string): ShadowTest | undefined {
  return shadowTests.get(id);
}

export function listShadowTests(
  organizationId: string,
  filters?: { status?: ShadowTestStatus; modelId?: string }
): ShadowTest[] {
  let result = Array.from(shadowTests.values()).filter(
    t => t.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(t => t.status === filters.status);
  if (filters?.modelId) {
    result = result.filter(t => 
      t.productionModel.modelId === filters.modelId || 
      t.shadowModel.modelId === filters.modelId
    );
  }

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function startShadowTest(testId: string): ShadowTest {
  const test = shadowTests.get(testId);
  if (!test) throw new Error(`Shadow test ${testId} not found`);

  if (test.status !== 'pending') {
    throw new Error('Test can only be started from pending status');
  }

  test.status = 'running';
  test.startedAt = new Date().toISOString();
  test.updatedAt = new Date().toISOString();

  return test;
}

export function pauseShadowTest(testId: string): ShadowTest {
  const test = shadowTests.get(testId);
  if (!test) throw new Error(`Shadow test ${testId} not found`);

  if (test.status !== 'running') {
    throw new Error('Test can only be paused when running');
  }

  test.status = 'paused';
  test.updatedAt = new Date().toISOString();

  return test;
}

export function resumeShadowTest(testId: string): ShadowTest {
  const test = shadowTests.get(testId);
  if (!test) throw new Error(`Shadow test ${testId} not found`);

  if (test.status !== 'paused') {
    throw new Error('Test can only be resumed when paused');
  }

  test.status = 'running';
  test.updatedAt = new Date().toISOString();

  return test;
}

export function completeShadowTest(testId: string): ShadowTest {
  const test = shadowTests.get(testId);
  if (!test) throw new Error(`Shadow test ${testId} not found`);

  if (test.status !== 'running' && test.status !== 'paused') {
    throw new Error('Test can only be completed when running or paused');
  }

  test.status = 'completed';
  test.completedAt = new Date().toISOString();
  test.updatedAt = new Date().toISOString();

  return test;
}

export function cancelShadowTest(testId: string): ShadowTest {
  const test = shadowTests.get(testId);
  if (!test) throw new Error(`Shadow test ${testId} not found`);

  if (test.status === 'completed' || test.status === 'cancelled') {
    throw new Error('Cannot cancel completed or already cancelled test');
  }

  test.status = 'cancelled';
  test.completedAt = new Date().toISOString();
  test.updatedAt = new Date().toISOString();

  return test;
}

export function recordShadowRequest(params: {
  testId: string;
  requestId: string;
  input: any;
  productionResult: InferenceResult;
  shadowResult: InferenceResult;
}): ResultComparison {
  const test = shadowTests.get(params.testId);
  if (!test) throw new Error(`Shadow test ${params.testId} not found`);

  if (test.status !== 'running') {
    throw new Error('Can only record requests for running tests');
  }

  const now = new Date().toISOString();
  const comparisonId = randomUUID();

  const latencyComparison: LatencyComparison = {
    productionLatency: params.productionResult.latency,
    shadowLatency: params.shadowResult.latency,
    difference: params.shadowResult.latency - params.productionResult.latency,
    percentChange: params.productionResult.latency > 0
      ? ((params.shadowResult.latency - params.productionResult.latency) / params.productionResult.latency) * 100
      : 0,
    isSignificant: Math.abs(params.shadowResult.latency - params.productionResult.latency) > 50,
  };

  const outputSimilarity = calculateSimilarity(
    params.productionResult.output,
    params.shadowResult.output
  );

  const outputDifferences = findOutputDifferences(
    params.productionResult.output,
    params.shadowResult.output
  );

  const outputComparison: OutputComparison = {
    exactMatch: outputSimilarity === 1,
    similarityScore: outputSimilarity,
    differences: outputDifferences,
  };

  const flags: ComparisonFlag[] = [];

  if (latencyComparison.isSignificant && latencyComparison.percentChange > 20) {
    flags.push({
      type: 'latency_regression',
      severity: latencyComparison.percentChange > 50 ? 'critical' : 'warning',
      description: `Shadow model latency ${latencyComparison.percentChange.toFixed(1)}% higher than production`,
      metric: 'latency',
      value: params.shadowResult.latency,
      threshold: params.productionResult.latency * 1.2,
    });
  }

  if (outputSimilarity < 0.9) {
    flags.push({
      type: 'output_divergence',
      severity: outputSimilarity < 0.7 ? 'critical' : 'warning',
      description: `Output similarity ${(outputSimilarity * 100).toFixed(1)}% below threshold`,
      metric: 'output_similarity',
      value: outputSimilarity,
      threshold: 0.9,
    });
  }

  const comparison: ResultComparison = {
    id: comparisonId,
    requestId: params.requestId,
    timestamp: now,
    productionResult: params.productionResult,
    shadowResult: params.shadowResult,
    latencyComparison,
    outputComparison,
    overallSimilarity: outputSimilarity,
    flagged: flags.length > 0,
    flags,
  };

  const comparisons = resultComparisons.get(params.testId) || [];
  comparisons.push(comparison);
  resultComparisons.set(params.testId, comparisons);

  // Update test metrics
  test.metrics.totalRequests++;
  test.metrics.comparedRequests++;

  // Update latency metrics
  const allComparisons = comparisons;
  const productionLatencies = allComparisons.map(c => c.productionResult.latency);
  const shadowLatencies = allComparisons.map(c => c.shadowResult.latency);

  test.metrics.productionLatency = calculateLatencyMetrics(productionLatencies);
  test.metrics.shadowLatency = calculateLatencyMetrics(shadowLatencies);

  test.metrics.latencyDifference = {
    meanDifference: test.metrics.shadowLatency.mean - test.metrics.productionLatency.mean,
    percentChange: test.metrics.productionLatency.mean > 0
      ? ((test.metrics.shadowLatency.mean - test.metrics.productionLatency.mean) / test.metrics.productionLatency.mean) * 100
      : 0,
    p95Difference: test.metrics.shadowLatency.p95 - test.metrics.productionLatency.p95,
    isSignificant: Math.abs(test.metrics.shadowLatency.mean - test.metrics.productionLatency.mean) > 50,
  };

  // Update output similarity
  const similarities = allComparisons.map(c => c.outputComparison.similarityScore);
  const exactMatches = allComparisons.filter(c => c.outputComparison.exactMatch).length;

  test.metrics.outputSimilarity = {
    exactMatch: (exactMatches / allComparisons.length) * 100,
    similarityScore: similarities.reduce((a, b) => a + b, 0) / similarities.length,
    divergenceRate: ((allComparisons.length - exactMatches) / allComparisons.length) * 100,
    samples: allComparisons.slice(-10).map(c => ({
      requestId: c.requestId,
      productionOutput: c.productionResult.output,
      shadowOutput: c.shadowResult.output,
      similarity: c.outputComparison.similarityScore,
      differences: c.outputComparison.differences,
      timestamp: c.timestamp,
    })),
  };

  // Update error rates
  const productionErrors = allComparisons.filter(c => c.productionResult.error).length;
  const shadowErrors = allComparisons.filter(c => c.shadowResult.error).length;

  test.metrics.errorRates = {
    productionErrorRate: (productionErrors / allComparisons.length) * 100,
    shadowErrorRate: (shadowErrors / allComparisons.length) * 100,
    errorRateDifference: ((shadowErrors - productionErrors) / allComparisons.length) * 100,
    productionErrors: {
      total: productionErrors,
      timeout: 0,
      serverError: 0,
      clientError: 0,
      other: productionErrors,
    },
    shadowErrors: {
      total: shadowErrors,
      timeout: 0,
      serverError: 0,
      clientError: 0,
      other: shadowErrors,
    },
  };

  // Check for alerts
  for (const threshold of test.configuration.alertThresholds) {
    const metric = threshold.metric === 'latency_difference'
      ? test.metrics.latencyDifference.percentChange
      : threshold.metric === 'output_similarity'
      ? test.metrics.outputSimilarity.similarityScore
      : threshold.metric === 'error_rate_difference'
      ? test.metrics.errorRates.errorRateDifference
      : 0;

    let triggered = false;
    switch (threshold.operator) {
      case 'gt': triggered = metric > threshold.threshold; break;
      case 'gte': triggered = metric >= threshold.threshold; break;
      case 'lt': triggered = metric < threshold.threshold; break;
      case 'lte': triggered = metric <= threshold.threshold; break;
      case 'eq': triggered = metric === threshold.threshold; break;
    }

    if (triggered) {
      const alert: ShadowAlert = {
        id: randomUUID(),
        type: threshold.metric === 'latency_difference' ? 'latency_regression'
          : threshold.metric === 'output_similarity' ? 'output_divergence'
          : 'error_rate_spike',
        severity: threshold.severity,
        message: `${threshold.metric} ${threshold.operator} ${threshold.threshold}`,
        metric: threshold.metric,
        threshold: threshold.threshold,
        actualValue: metric,
        triggeredAt: now,
        acknowledged: false,
      };

      test.alerts.push(alert);
    }
  }

  test.updatedAt = now;
  return comparison;
}

export function getResultComparisons(
  testId: string,
  filters?: { flagged?: boolean; limit?: number }
): ResultComparison[] {
  let comparisons = resultComparisons.get(testId) || [];

  if (filters?.flagged !== undefined) {
    comparisons = comparisons.filter(c => c.flagged === filters.flagged);
  }

  comparisons = comparisons.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (filters?.limit) {
    comparisons = comparisons.slice(0, filters.limit);
  }

  return comparisons;
}

export function generateShadowTestReport(testId: string): ShadowTestReport {
  const test = shadowTests.get(testId);
  if (!test) throw new Error(`Shadow test ${testId} not found`);

  if (test.status !== 'completed') {
    throw new Error('Test must be completed before generating report');
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  const comparisons = resultComparisons.get(testId) || [];

  // Performance Analysis
  const percentileComparisons: PercentileComparison[] = [50, 90, 95, 99].map(p => {
    const productionValue = p === 50 ? test.metrics.productionLatency.median
      : p === 90 ? test.metrics.productionLatency.p95 * 0.94 // approximate
      : p === 95 ? test.metrics.productionLatency.p95
      : test.metrics.productionLatency.p99;
    
    const shadowValue = p === 50 ? test.metrics.shadowLatency.median
      : p === 90 ? test.metrics.shadowLatency.p95 * 0.94
      : p === 95 ? test.metrics.shadowLatency.p95
      : test.metrics.shadowLatency.p99;

    return {
      percentile: p,
      production: productionValue,
      shadow: shadowValue,
      difference: shadowValue - productionValue,
      percentChange: productionValue > 0 ? ((shadowValue - productionValue) / productionValue) * 100 : 0,
    };
  });

  const performanceVerdict: PerformanceVerdict = {
    status: test.metrics.latencyDifference.percentChange < -10 ? 'better'
      : test.metrics.latencyDifference.percentChange > 20 ? 'worse'
      : 'comparable',
    confidence: 0.85,
    reasoning: [
      `Mean latency ${test.metrics.latencyDifference.percentChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(test.metrics.latencyDifference.percentChange).toFixed(1)}%`,
      `P95 latency difference: ${test.metrics.latencyDifference.p95Difference.toFixed(2)}ms`,
    ],
    risks: test.metrics.latencyDifference.percentChange > 20
      ? ['Significant latency regression detected']
      : [],
  };

  const performanceAnalysis: PerformanceAnalysis = {
    latencyComparison: {
      productionStats: test.metrics.productionLatency,
      shadowStats: test.metrics.shadowLatency,
      differences: test.metrics.latencyDifference,
      percentiles: percentileComparisons,
      trend: test.metrics.latencyDifference.percentChange < -10 ? 'improving'
        : test.metrics.latencyDifference.percentChange > 20 ? 'degrading'
        : 'stable',
    },
    throughputComparison: {
      productionThroughput: 1000 / test.metrics.productionLatency.mean,
      shadowThroughput: 1000 / test.metrics.shadowLatency.mean,
      difference: (1000 / test.metrics.shadowLatency.mean) - (1000 / test.metrics.productionLatency.mean),
      percentChange: ((1000 / test.metrics.shadowLatency.mean) - (1000 / test.metrics.productionLatency.mean)) / (1000 / test.metrics.productionLatency.mean) * 100,
    },
    resourceUsage: {
      cpuUsage: { production: 50, shadow: 55, difference: 5, percentChange: 10 },
      memoryUsage: { production: 1024, shadow: 1100, difference: 76, percentChange: 7.4 },
    },
    performanceVerdict,
  };

  // Output Analysis
  const highSimilarity = comparisons.filter(c => c.outputComparison.similarityScore > 0.9).length;
  const mediumSimilarity = comparisons.filter(c => 
    c.outputComparison.similarityScore >= 0.7 && c.outputComparison.similarityScore <= 0.9
  ).length;
  const lowSimilarity = comparisons.filter(c => c.outputComparison.similarityScore < 0.7).length;

  const similarityStats: SimilarityStats = {
    exactMatchRate: test.metrics.outputSimilarity.exactMatch,
    averageSimilarity: test.metrics.outputSimilarity.similarityScore,
    highSimilarityRate: (highSimilarity / comparisons.length) * 100,
    mediumSimilarityRate: (mediumSimilarity / comparisons.length) * 100,
    lowSimilarityRate: (lowSimilarity / comparisons.length) * 100,
  };

  const outputVerdict: OutputVerdict = {
    status: similarityStats.averageSimilarity > 0.95 ? 'acceptable'
      : similarityStats.averageSimilarity > 0.8 ? 'concerning'
      : 'unacceptable',
    confidence: 0.9,
    reasoning: [
      `Average output similarity: ${(similarityStats.averageSimilarity * 100).toFixed(1)}%`,
      `Exact match rate: ${similarityStats.exactMatchRate.toFixed(1)}%`,
      `${lowSimilarity} requests with low similarity (< 70%)`,
    ],
    criticalDivergences: lowSimilarity,
  };

  const outputAnalysis: OutputAnalysis = {
    similarityStats,
    divergencePatterns: [],
    outputQuality: {
      productionQuality: 0.95,
      shadowQuality: similarityStats.averageSimilarity,
      qualityDifference: similarityStats.averageSimilarity - 0.95,
      qualityVerdict: similarityStats.averageSimilarity > 0.95 ? 'better'
        : similarityStats.averageSimilarity > 0.9 ? 'comparable'
        : 'worse',
    },
    outputVerdict,
  };

  // Error Analysis
  const errorVerdict: ErrorVerdict = {
    status: test.metrics.errorRates.errorRateDifference < -1 ? 'better'
      : test.metrics.errorRates.errorRateDifference > 5 ? 'worse'
      : 'comparable',
    confidence: 0.8,
    reasoning: [
      `Production error rate: ${test.metrics.errorRates.productionErrorRate.toFixed(2)}%`,
      `Shadow error rate: ${test.metrics.errorRates.shadowErrorRate.toFixed(2)}%`,
      `Error rate difference: ${test.metrics.errorRates.errorRateDifference.toFixed(2)}%`,
    ],
    criticalErrors: [],
  };

  const errorAnalysis: ErrorAnalysis = {
    errorRateComparison: {
      productionErrorRate: test.metrics.errorRates.productionErrorRate,
      shadowErrorRate: test.metrics.errorRates.shadowErrorRate,
      difference: test.metrics.errorRates.errorRateDifference,
      isSignificant: Math.abs(test.metrics.errorRates.errorRateDifference) > 5,
    },
    errorPatterns: [],
    errorVerdict,
  };

  // Recommendations
  const recommendations: TestRecommendation[] = [];

  if (performanceVerdict.status === 'worse') {
    recommendations.push({
      priority: 'high',
      category: 'performance',
      title: 'Address Latency Regression',
      description: 'Shadow model shows significant latency increase compared to production',
      actionItems: [
        'Profile shadow model for performance bottlenecks',
        'Optimize model inference pipeline',
        'Consider model quantization or pruning',
      ],
      expectedImpact: 'Reduce latency to production levels or better',
    });
  }

  if (outputVerdict.status === 'unacceptable') {
    recommendations.push({
      priority: 'high',
      category: 'quality',
      title: 'Investigate Output Divergence',
      description: 'Shadow model outputs differ significantly from production',
      actionItems: [
        'Analyze divergent outputs for patterns',
        'Verify model weights and configuration',
        'Check for data preprocessing differences',
      ],
      expectedImpact: 'Achieve >95% output similarity',
    });
  }

  if (errorVerdict.status === 'worse') {
    recommendations.push({
      priority: 'high',
      category: 'reliability',
      title: 'Reduce Error Rate',
      description: 'Shadow model has higher error rate than production',
      actionItems: [
        'Analyze error patterns and root causes',
        'Improve error handling and retry logic',
        'Add monitoring and alerting',
      ],
      expectedImpact: 'Reduce error rate to production levels',
    });
  }

  if (performanceVerdict.status !== 'worse' && outputVerdict.status !== 'unacceptable') {
    recommendations.push({
      priority: 'medium',
      category: 'deployment',
      title: 'Proceed with Deployment',
      description: 'Shadow model meets performance and quality criteria',
      actionItems: [
        'Plan gradual rollout strategy',
        'Set up monitoring and alerting',
        'Prepare rollback plan',
      ],
      expectedImpact: 'Safe deployment of new model version',
    });
  }

  const executiveSummary = `Shadow test "${test.name}" compared production model ${test.productionModel.modelVersion} with shadow model ${test.shadowModel.modelVersion} over ${test.metrics.totalRequests} requests. ` +
    `Performance: ${performanceVerdict.status}. Output quality: ${outputVerdict.status}. Error rate: ${errorVerdict.status}.`;

  const report: ShadowTestReport = {
    id,
    testId,
    executiveSummary,
    performanceAnalysis,
    outputAnalysis,
    errorAnalysis,
    recommendations,
    appendices: [],
    generatedAt: now,
  };

  shadowTestReports.set(id, report);
  return report;
}

export function getShadowTestReport(id: string): ShadowTestReport | undefined {
  return shadowTestReports.get(id);
}

export function acknowledgeShadowAlert(testId: string, alertId: string): ShadowTest {
  const test = shadowTests.get(testId);
  if (!test) throw new Error(`Shadow test ${testId} not found`);

  const alert = test.alerts.find(a => a.id === alertId);
  if (!alert) throw new Error('Alert not found');

  alert.acknowledged = true;
  test.updatedAt = new Date().toISOString();

  return test;
}

export function resolveShadowAlert(testId: string, alertId: string): ShadowTest {
  const test = shadowTests.get(testId);
  if (!test) throw new Error(`Shadow test ${testId} not found`);

  const alert = test.alerts.find(a => a.id === alertId);
  if (!alert) throw new Error('Alert not found');

  alert.resolvedAt = new Date().toISOString();
  test.updatedAt = new Date().toISOString();

  return test;
}
