/**
 * Module 135: AI Model Load Testing Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides comprehensive load testing capabilities for AI models including stress testing,
 * performance testing, scalability testing, and bottleneck identification under various
 * load conditions.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiModelLoadTesting');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LoadTest {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: LoadTestStatus;
  modelId: string;
  modelVersion: string;
  configuration: LoadTestConfiguration;
  results?: LoadTestResults;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
}

export type LoadTestStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface LoadTestConfiguration {
  testType: LoadTestType;
  loadProfile: LoadProfile;
  scenarios: TestScenario[];
  thresholds: PerformanceThresholds;
  duration: number; // seconds
  rampUpTime: number; // seconds
  concurrentUsers: number;
  requestsPerSecond?: number;
  thinkTime?: number; // milliseconds
  dataSets: TestDataSet[];
}

export type LoadTestType =
  | 'load_test'
  | 'stress_test'
  | 'spike_test'
  | 'soak_test'
  | 'scalability_test'
  | 'volume_test';

export interface LoadProfile {
  type: 'constant' | 'ramp_up' | 'step' | 'spike' | 'custom';
  pattern: LoadPattern[];
}

export interface LoadPattern {
  startTime: number; // seconds
  endTime: number; // seconds
  users: number;
  requestsPerSecond?: number;
}

export interface TestScenario {
  id: string;
  name: string;
  weight: number; // percentage
  steps: TestStep[];
  thinkTime?: number;
}

export interface TestStep {
  id: string;
  action: 'predict' | 'batch_predict' | 'health_check' | 'custom';
  input: any;
  expectedResponseTime?: number;
  assertions?: TestAssertion[];
}

export interface TestAssertion {
  type: 'status_code' | 'response_time' | 'response_body' | 'custom';
  expected: any;
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';
}

export interface PerformanceThresholds {
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
  };
  errorRate: number;
  throughput: number;
  cpuUsage: number;
  memoryUsage: number;
}

export interface TestDataSet {
  id: string;
  name: string;
  type: 'static' | 'dynamic' | 'file';
  data: any[];
  filePath?: string;
  size: number;
}

export interface LoadTestResults {
  summary: TestSummary;
  performanceMetrics: PerformanceMetrics;
  resourceMetrics: ResourceMetrics;
  errorAnalysis: ErrorAnalysis;
  timeline: TimelineDataPoint[];
  percentiles: PercentileData;
  bottlenecks: Bottleneck[];
  recommendations: LoadTestRecommendation[];
}

export interface TestSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  averageResponseTime: number;
  throughput: number;
  concurrentUsers: number;
  duration: number;
  status: 'passed' | 'failed' | 'warning';
}

export interface PerformanceMetrics {
  responseTime: ResponseTimeMetrics;
  throughput: ThroughputMetrics;
  latency: LatencyMetrics;
  concurrency: ConcurrencyMetrics;
}

export interface ResponseTimeMetrics {
  min: number;
  max: number;
  average: number;
  median: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  stdDev: number;
}

export interface ThroughputMetrics {
  requestsPerSecond: number;
  transactionsPerSecond: number;
  peakThroughput: number;
  averageThroughput: number;
  throughputOverTime: TimeSeriesDataPoint[];
}

export interface LatencyMetrics {
  networkLatency: number;
  processingLatency: number;
  queueLatency: number;
  totalLatency: number;
}

export interface ConcurrencyMetrics {
  maxConcurrentUsers: number;
  averageConcurrentUsers: number;
  peakConcurrency: number;
  concurrencyOverTime: TimeSeriesDataPoint[];
}

export interface ResourceMetrics {
  cpu: ResourceMetric;
  memory: ResourceMetric;
  gpu?: ResourceMetric;
  network: NetworkMetric;
  disk: DiskMetric;
}

export interface ResourceMetric {
  usage: TimeSeriesDataPoint[];
  average: number;
  peak: number;
  min: number;
  max: number;
}

export interface NetworkMetric {
  bytesSent: number;
  bytesReceived: number;
  packetsSent: number;
  packetsReceived: number;
  bandwidth: TimeSeriesDataPoint[];
}

export interface DiskMetric {
  readBytes: number;
  writeBytes: number;
  readOps: number;
  writeOps: number;
  ioWait: TimeSeriesDataPoint[];
}

export interface TimeSeriesDataPoint {
  timestamp: string;
  value: number;
}

export interface ErrorAnalysis {
  totalErrors: number;
  errorRate: number;
  errorsByType: ErrorTypeCount[];
  errorsByStatusCode: StatusCodeCount[];
  errorTimeline: TimeSeriesDataPoint[];
  topErrors: ErrorDetail[];
}

export interface ErrorTypeCount {
  type: string;
  count: number;
  percentage: number;
}

export interface StatusCodeCount {
  statusCode: number;
  count: number;
  percentage: number;
}

export interface ErrorDetail {
  message: string;
  count: number;
  percentage: number;
  sample: any;
  firstOccurrence: string;
  lastOccurrence: string;
}

export interface TimelineDataPoint {
  timestamp: string;
  requests: number;
  responseTime: number;
  errors: number;
  throughput: number;
  concurrentUsers: number;
}

export interface PercentileData {
  responseTime: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
    p999: number;
  };
  throughput: {
    p50: number;
    p95: number;
    p99: number;
  };
}

export interface Bottleneck {
  id: string;
  type: 'cpu' | 'memory' | 'network' | 'disk' | 'database' | 'model_inference';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  metrics: Record<string, number>;
  recommendations: string[];
}

export interface LoadTestRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'performance' | 'scalability' | 'reliability' | 'resource';
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  actionItems: string[];
}

export interface LoadTestReport {
  id: string;
  testId: string;
  executiveSummary: string;
  testConfiguration: LoadTestConfiguration;
  results: LoadTestResults;
  comparison?: LoadTestComparison;
  findings: LoadTestFinding[];
  recommendations: LoadTestRecommendation[];
  appendices: ReportAppendix[];
  generatedAt: string;
}

export interface LoadTestComparison {
  baselineTestId: string;
  baselineResults: LoadTestResults;
  currentResults: LoadTestResults;
  differences: MetricDifference[];
  regression: boolean;
  regressionDetails: string[];
}

export interface MetricDifference {
  metric: string;
  baseline: number;
  current: number;
  difference: number;
  percentChange: number;
  isRegression: boolean;
}

export interface LoadTestFinding {
  id: string;
  type: 'strength' | 'weakness' | 'observation';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  evidence: string[];
  impact: string;
}

export interface ReportAppendix {
  title: string;
  content: string;
  data?: any;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const loadTests = new Map<string, LoadTest>();
const loadTestReports = new Map<string, LoadTestReport>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculatePercentiles(values: number[]): {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  p999: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const len = sorted.length;

  return {
    p50: sorted[Math.floor(len * 0.5)] || 0,
    p75: sorted[Math.floor(len * 0.75)] || 0,
    p90: sorted[Math.floor(len * 0.9)] || 0,
    p95: sorted[Math.floor(len * 0.95)] || 0,
    p99: sorted[Math.floor(len * 0.99)] || 0,
    p999: sorted[Math.floor(len * 0.999)] || 0,
  };
}

function calculateStdDev(values: number[], mean: number): number {
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createLoadTest(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelVersion: string;
  configuration: LoadTestConfiguration;
  createdBy: string;
}): LoadTest {
  const now = new Date().toISOString();
  const id = randomUUID();

  const test: LoadTest = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'draft',
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    configuration: params.configuration,
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  loadTests.set(id, test);
  return test;
}

export function getLoadTest(id: string): LoadTest | undefined {
  return loadTests.get(id);
}

export function listLoadTests(
  organizationId: string,
  filters?: { status?: LoadTestStatus; modelId?: string; testType?: LoadTestType }
): LoadTest[] {
  let result = Array.from(loadTests.values()).filter(
    t => t.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(t => t.status === filters.status);
  if (filters?.modelId) result = result.filter(t => t.modelId === filters.modelId);
  if (filters?.testType) result = result.filter(t => t.configuration.testType === filters.testType);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function prepareLoadTest(testId: string): LoadTest {
  const test = loadTests.get(testId);
  if (!test) throw new Error(`Load test ${testId} not found`);

  if (test.status !== 'draft') {
    throw new Error('Test can only be prepared from draft status');
  }

  // Validate configuration
  if (test.configuration.scenarios.length === 0) {
    throw new Error('At least one test scenario must be defined');
  }

  if (test.configuration.duration <= 0) {
    throw new Error('Test duration must be greater than 0');
  }

  if (test.configuration.concurrentUsers <= 0) {
    throw new Error('Concurrent users must be greater than 0');
  }

  test.status = 'ready';
  test.updatedAt = new Date().toISOString();

  return test;
}

export function startLoadTest(testId: string): LoadTest {
  const test = loadTests.get(testId);
  if (!test) throw new Error(`Load test ${testId} not found`);

  if (test.status !== 'ready' && test.status !== 'paused') {
    throw new Error('Test must be in ready or paused status to start');
  }

  test.status = 'running';
  test.startedAt = new Date().toISOString();
  test.updatedAt = new Date().toISOString();

  // Simulate test execution
  setTimeout(() => {
    executeLoadTest(test);
  }, 100);

  return test;
}

function executeLoadTest(test: LoadTest): void {
  const now = new Date().toISOString();
  const duration = test.configuration.duration;
  const concurrentUsers = test.configuration.concurrentUsers;

  // Simulate test execution and collect metrics
  const responseTimes: number[] = [];
  const timeline: TimelineDataPoint[] = [];
  const errors: any[] = [];

  // Generate simulated data
  const intervalMs = 1000; // 1 second intervals
  const intervals = Math.floor(duration * 1000 / intervalMs);

  for (let i = 0; i < intervals; i++) {
    const timestamp = new Date(new Date(test.startedAt!).getTime() + i * intervalMs).toISOString();
    
    // Simulate ramp-up
    const rampUpProgress = Math.min(1, (i * intervalMs / 1000) / test.configuration.rampUpTime);
    const currentUsers = Math.floor(concurrentUsers * rampUpProgress);
    
    // Generate response times (normal distribution)
    const baseResponseTime = 100 + _rng.next() * 50;
    const loadFactor = 1 + (currentUsers / concurrentUsers) * 0.5;
    const responseTime = baseResponseTime * loadFactor + (_rng.next() - 0.5) * 20;
    
    responseTimes.push(responseTime);
    
    // Generate requests
    const requests = Math.floor(currentUsers * 2 + _rng.next() * 10);
    const errorCount = Math.floor(requests * 0.02 * _rng.next());
    const throughput = requests / (intervalMs / 1000);
    
    timeline.push({
      timestamp,
      requests,
      responseTime,
      errors: errorCount,
      throughput,
      concurrentUsers: currentUsers,
    });
    
    // Collect errors
    for (let j = 0; j < errorCount; j++) {
      errors.push({
        timestamp,
        type: ['timeout', 'server_error', 'validation_error'][Math.floor(_rng.next() * 3)],
        message: 'Simulated error',
      });
    }
  }

  // Calculate metrics
  const totalRequests = timeline.reduce((sum, p) => sum + p.requests, 0);
  const totalErrors = errors.length;
  const successfulRequests = totalRequests - totalErrors;
  const errorRate = (totalErrors / totalRequests) * 100;
  const averageResponseTime = responseTimes.reduce((sum, v) => sum + v, 0) / responseTimes.length;
  const throughput = totalRequests / duration;

  const percentiles = calculatePercentiles(responseTimes);
  const stdDev = calculateStdDev(responseTimes, averageResponseTime);

  // Determine test status
  const thresholds = test.configuration.thresholds;
  const passed = 
    percentiles.p95 <= thresholds.responseTime.p95 &&
    errorRate <= thresholds.errorRate &&
    throughput >= thresholds.throughput;

  const status = passed ? 'passed' : errorRate > thresholds.errorRate * 2 ? 'failed' : 'warning';

  // Identify bottlenecks
  const bottlenecks: Bottleneck[] = [];
  
  if (percentiles.p99 > thresholds.responseTime.p99 * 1.5) {
    bottlenecks.push({
      id: randomUUID(),
      type: 'model_inference',
      severity: 'high',
      description: 'High response time at p99 percentile',
      impact: 'User experience degradation under load',
      metrics: { p99: percentiles.p99, threshold: thresholds.responseTime.p99 },
      recommendations: [
        'Optimize model inference pipeline',
        'Consider model quantization',
        'Implement request batching',
      ],
    });
  }

  if (errorRate > thresholds.errorRate) {
    bottlenecks.push({
      id: randomUUID(),
      type: 'cpu',
      severity: errorRate > thresholds.errorRate * 2 ? 'critical' : 'medium',
      description: 'High error rate under load',
      impact: 'Service reliability issues',
      metrics: { errorRate, threshold: thresholds.errorRate },
      recommendations: [
        'Increase CPU resources',
        'Implement circuit breaker pattern',
        'Add request queue with backpressure',
      ],
    });
  }

  // Generate recommendations
  const recommendations: LoadTestRecommendation[] = [];

  if (percentiles.p95 > thresholds.responseTime.p95) {
    recommendations.push({
      id: randomUUID(),
      priority: 'high',
      category: 'performance',
      title: 'Optimize Response Time',
      description: `P95 response time (${percentiles.p95.toFixed(2)}ms) exceeds threshold (${thresholds.responseTime.p95}ms)`,
      impact: 'Improved user experience and throughput',
      effort: 'medium',
      actionItems: [
        'Profile model inference to identify bottlenecks',
        'Implement caching for frequent requests',
        'Consider model optimization techniques',
      ],
    });
  }

  if (throughput < thresholds.throughput) {
    recommendations.push({
      id: randomUUID(),
      priority: 'high',
      category: 'scalability',
      title: 'Increase Throughput',
      description: `Throughput (${throughput.toFixed(2)} req/s) below threshold (${thresholds.throughput} req/s)`,
      impact: 'Higher capacity and better resource utilization',
      effort: 'medium',
      actionItems: [
        'Implement horizontal scaling',
        'Optimize batch processing',
        'Review resource allocation',
      ],
    });
  }

  // Build results
  const results: LoadTestResults = {
    summary: {
      totalRequests,
      successfulRequests,
      failedRequests: totalErrors,
      errorRate,
      averageResponseTime,
      throughput,
      concurrentUsers,
      duration,
      status,
    },
    performanceMetrics: {
      responseTime: {
        min: Math.min(...responseTimes),
        max: Math.max(...responseTimes),
        average: averageResponseTime,
        median: percentiles.p50,
        ...percentiles,
        stdDev,
      },
      throughput: {
        requestsPerSecond: throughput,
        transactionsPerSecond: throughput,
        peakThroughput: Math.max(...timeline.map(p => p.throughput)),
        averageThroughput: throughput,
        throughputOverTime: timeline.map(p => ({
          timestamp: p.timestamp,
          value: p.throughput,
        })),
      },
      latency: {
        networkLatency: 10,
        processingLatency: averageResponseTime - 10,
        queueLatency: 5,
        totalLatency: averageResponseTime,
      },
      concurrency: {
        maxConcurrentUsers: concurrentUsers,
        averageConcurrentUsers: concurrentUsers * 0.8,
        peakConcurrency: concurrentUsers,
        concurrencyOverTime: timeline.map(p => ({
          timestamp: p.timestamp,
          value: p.concurrentUsers,
        })),
      },
    },
    resourceMetrics: {
      cpu: {
        usage: timeline.map((p, i) => ({
          timestamp: p.timestamp,
          value: 30 + (p.concurrentUsers / concurrentUsers) * 50 + _rng.next() * 10,
        })),
        average: 55,
        peak: 85,
        min: 30,
        max: 85,
      },
      memory: {
        usage: timeline.map((p, i) => ({
          timestamp: p.timestamp,
          value: 40 + (p.concurrentUsers / concurrentUsers) * 30 + _rng.next() * 5,
        })),
        average: 55,
        peak: 75,
        min: 40,
        max: 75,
      },
      network: {
        bytesSent: totalRequests * 1024,
        bytesReceived: totalRequests * 2048,
        packetsSent: totalRequests * 2,
        packetsReceived: totalRequests * 2,
        bandwidth: timeline.map(p => ({
          timestamp: p.timestamp,
          value: p.throughput * 3072,
        })),
      },
      disk: {
        readBytes: totalRequests * 512,
        writeBytes: totalRequests * 256,
        readOps: totalRequests,
        writeOps: totalRequests / 2,
        ioWait: timeline.map(p => ({
          timestamp: p.timestamp,
          value: _rng.next() * 5,
        })),
      },
    },
    errorAnalysis: {
      totalErrors,
      errorRate,
      errorsByType: [
        { type: 'timeout', count: Math.floor(totalErrors * 0.4), percentage: 40 },
        { type: 'server_error', count: Math.floor(totalErrors * 0.35), percentage: 35 },
        { type: 'validation_error', count: Math.floor(totalErrors * 0.25), percentage: 25 },
      ],
      errorsByStatusCode: [
        { statusCode: 500, count: Math.floor(totalErrors * 0.5), percentage: 50 },
        { statusCode: 503, count: Math.floor(totalErrors * 0.3), percentage: 30 },
        { statusCode: 400, count: Math.floor(totalErrors * 0.2), percentage: 20 },
      ],
      errorTimeline: timeline.map(p => ({
        timestamp: p.timestamp,
        value: p.errors,
      })),
      topErrors: [
        {
          message: 'Request timeout',
          count: Math.floor(totalErrors * 0.4),
          percentage: 40,
          sample: { error: 'timeout', duration: 30000 },
          firstOccurrence: timeline[0]?.timestamp || now,
          lastOccurrence: timeline[timeline.length - 1]?.timestamp || now,
        },
      ],
    },
    timeline,
    percentiles: {
      responseTime: percentiles,
      throughput: {
        p50: throughput * 0.9,
        p95: throughput * 1.1,
        p99: throughput * 1.2,
      },
    },
    bottlenecks,
    recommendations,
  };

  test.results = results;
  test.status = 'completed';
  test.completedAt = new Date().toISOString();
  test.updatedAt = new Date().toISOString();
}

export function pauseLoadTest(testId: string): LoadTest {
  const test = loadTests.get(testId);
  if (!test) throw new Error(`Load test ${testId} not found`);

  if (test.status !== 'running') {
    throw new Error('Test must be running to pause');
  }

  test.status = 'paused';
  test.updatedAt = new Date().toISOString();

  return test;
}

export function cancelLoadTest(testId: string): LoadTest {
  const test = loadTests.get(testId);
  if (!test) throw new Error(`Load test ${testId} not found`);

  if (test.status === 'completed' || test.status === 'cancelled') {
    throw new Error('Cannot cancel completed or already cancelled test');
  }

  test.status = 'cancelled';
  test.completedAt = new Date().toISOString();
  test.updatedAt = new Date().toISOString();

  return test;
}

export function generateLoadTestReport(testId: string): LoadTestReport {
  const test = loadTests.get(testId);
  if (!test) throw new Error(`Load test ${testId} not found`);

  if (!test.results) {
    throw new Error('Test must be completed before generating report');
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  const executiveSummary = `Load test "${test.name}" ${test.results.summary.status} with ${test.results.summary.totalRequests} requests over ${test.results.summary.duration} seconds. ` +
    `Average response time: ${test.results.summary.averageResponseTime.toFixed(2)}ms, ` +
    `Throughput: ${test.results.summary.throughput.toFixed(2)} req/s, ` +
    `Error rate: ${test.results.summary.errorRate.toFixed(2)}%.`;

  const findings: LoadTestFinding[] = [];

  if (test.results.summary.status === 'passed') {
    findings.push({
      id: randomUUID(),
      type: 'strength',
      severity: 'info',
      title: 'Test Passed',
      description: 'All performance thresholds were met',
      evidence: [
        `P95 response time: ${test.results.performanceMetrics.responseTime.p95.toFixed(2)}ms`,
        `Error rate: ${test.results.summary.errorRate.toFixed(2)}%`,
        `Throughput: ${test.results.summary.throughput.toFixed(2)} req/s`,
      ],
      impact: 'System performs well under load',
    });
  }

  if (test.results.bottlenecks.length > 0) {
    findings.push({
      id: randomUUID(),
      type: 'weakness',
      severity: test.results.bottlenecks.some(b => b.severity === 'critical') ? 'critical' : 'warning',
      title: 'Performance Bottlenecks Detected',
      description: `${test.results.bottlenecks.length} bottleneck(s) identified`,
      evidence: test.results.bottlenecks.map(b => b.description),
      impact: 'Degraded performance under load',
    });
  }

  const report: LoadTestReport = {
    id,
    testId,
    executiveSummary,
    testConfiguration: test.configuration,
    results: test.results,
    findings,
    recommendations: test.results.recommendations,
    appendices: [],
    generatedAt: now,
  };

  loadTestReports.set(id, report);
  return report;
}

export function getLoadTestReport(id: string): LoadTestReport | undefined {
  return loadTestReports.get(id);
}

export function compareLoadTests(
  baselineTestId: string,
  currentTestId: string
): LoadTestComparison {
  const baselineTest = loadTests.get(baselineTestId);
  const currentTest = loadTests.get(currentTestId);

  if (!baselineTest || !currentTest) {
    throw new Error('One or both tests not found');
  }

  if (!baselineTest.results || !currentTest.results) {
    throw new Error('Both tests must be completed');
  }

  const baseline = baselineTest.results;
  const current = currentTest.results;

  const differences: MetricDifference[] = [
    {
      metric: 'Average Response Time',
      baseline: baseline.summary.averageResponseTime,
      current: current.summary.averageResponseTime,
      difference: current.summary.averageResponseTime - baseline.summary.averageResponseTime,
      percentChange: ((current.summary.averageResponseTime - baseline.summary.averageResponseTime) / baseline.summary.averageResponseTime) * 100,
      isRegression: current.summary.averageResponseTime > baseline.summary.averageResponseTime * 1.1,
    },
    {
      metric: 'P95 Response Time',
      baseline: baseline.performanceMetrics.responseTime.p95,
      current: current.performanceMetrics.responseTime.p95,
      difference: current.performanceMetrics.responseTime.p95 - baseline.performanceMetrics.responseTime.p95,
      percentChange: ((current.performanceMetrics.responseTime.p95 - baseline.performanceMetrics.responseTime.p95) / baseline.performanceMetrics.responseTime.p95) * 100,
      isRegression: current.performanceMetrics.responseTime.p95 > baseline.performanceMetrics.responseTime.p95 * 1.1,
    },
    {
      metric: 'Throughput',
      baseline: baseline.summary.throughput,
      current: current.summary.throughput,
      difference: current.summary.throughput - baseline.summary.throughput,
      percentChange: ((current.summary.throughput - baseline.summary.throughput) / baseline.summary.throughput) * 100,
      isRegression: current.summary.throughput < baseline.summary.throughput * 0.9,
    },
    {
      metric: 'Error Rate',
      baseline: baseline.summary.errorRate,
      current: current.summary.errorRate,
      difference: current.summary.errorRate - baseline.summary.errorRate,
      percentChange: baseline.summary.errorRate > 0 ? ((current.summary.errorRate - baseline.summary.errorRate) / baseline.summary.errorRate) * 100 : 0,
      isRegression: current.summary.errorRate > baseline.summary.errorRate * 1.5,
    },
  ];

  const regression = differences.some(d => d.isRegression);
  const regressionDetails = differences
    .filter(d => d.isRegression)
    .map(d => `${d.metric} regressed by ${d.percentChange.toFixed(2)}%`);

  return {
    baselineTestId,
    baselineResults: baseline,
    currentResults: current,
    differences,
    regression,
    regressionDetails,
  };
}

export function getLoadTestTimeline(testId: string): TimelineDataPoint[] {
  const test = loadTests.get(testId);
  if (!test) throw new Error(`Load test ${testId} not found`);

  return test.results?.timeline || [];
}

export function getLoadTestPercentiles(testId: string): PercentileData | undefined {
  const test = loadTests.get(testId);
  if (!test) throw new Error(`Load test ${testId} not found`);

  return test.results?.percentiles;
}
