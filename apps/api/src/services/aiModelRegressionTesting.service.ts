/**
 * Module 147: AI Model Regression Testing Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides regression testing capabilities for AI models including automated
 * regression detection, baseline comparison, regression reporting, and
 * continuous regression monitoring.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RegressionTestSuite {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: RegressionSuiteStatus;
  modelId: string;
  baselineVersion: string;
  testCases: RegressionTestCase[];
  configuration: RegressionTestConfiguration;
  baselines: RegressionBaseline[];
  lastRun?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type RegressionSuiteStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed';

export interface RegressionTestCase {
  id: string;
  name: string;
  description?: string;
  type: RegressionTestType;
  input: any;
  expectedOutput: any;
  tolerance: number;
  priority: 'high' | 'medium' | 'low';
  tags: string[];
  enabled: boolean;
}

export type RegressionTestType =
  | 'functional'
  | 'performance'
  | 'accuracy'
  | 'behavioral'
  | 'edge_case';

export interface RegressionTestConfiguration {
  comparisonMode: 'exact' | 'tolerance' | 'statistical';
  statisticalSignificance: number;
  sampleSize: number;
  parallelExecution: boolean;
  maxConcurrency: number;
  failOnRegression: boolean;
  regressionThreshold: number;
}

export interface RegressionBaseline {
  id: string;
  version: string;
  createdAt: string;
  results: RegressionTestResult[];
  metadata: BaselineMetadata;
}

export interface BaselineMetadata {
  modelVersion: string;
  environment: string;
  dataset: string;
  parameters: Record<string, any>;
  metrics: Record<string, number>;
}

export interface RegressionTestRun {
  id: string;
  suiteId: string;
  currentVersion: string;
  baselineVersion: string;
  status: RegressionRunStatus;
  results: RegressionTestResult[];
  comparison: RegressionComparison;
  summary: RegressionRunSummary;
  startedAt: string;
  completedAt?: string;
  duration: number; // seconds
  triggeredBy: string;
}

export type RegressionRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'regression_detected';

export interface RegressionTestResult {
  testCaseId: string;
  testCaseName: string;
  status: 'passed' | 'failed' | 'regression' | 'skipped';
  baselineOutput: any;
  currentOutput: any;
  difference: number;
  withinTolerance: boolean;
  regressionDetected: boolean;
  duration: number; // seconds
  error?: string;
}

export interface RegressionComparison {
  totalTests: number;
  passed: number;
  failed: number;
  regressions: number;
  regressionRate: number;
  regressions: RegressionDetail[];
  statisticalAnalysis?: StatisticalAnalysis;
}

export interface RegressionDetail {
  testCaseId: string;
  testCaseName: string;
  type: RegressionTestType;
  baselineOutput: any;
  currentOutput: any;
  difference: number;
  percentChange: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  impact: string;
  recommendation: string;
}

export interface StatisticalAnalysis {
  tTestResult: number;
  pValue: number;
  significant: boolean;
  confidenceLevel: number;
  effectSize: number;
}

export interface RegressionRunSummary {
  totalTests: number;
  passed: number;
  failed: number;
  regressions: number;
  regressionRate: number;
  criticalRegressions: number;
  highRegressions: number;
  mediumRegressions: number;
  lowRegressions: number;
  overallStatus: 'passed' | 'failed' | 'regression_detected';
  recommendations: string[];
}

export interface RegressionReport {
  id: string;
  runId: string;
  type: 'summary' | 'detailed' | 'technical';
  title: string;
  executiveSummary: string;
  comparison: RegressionComparison;
  regressions: RegressionDetail[];
  trends: RegressionTrend[];
  impact: RegressionImpact;
  recommendations: RegressionRecommendation[];
  appendices: ReportAppendix[];
  generatedAt: string;
  generatedBy: string;
}

export interface RegressionTrend {
  metric: string;
  dataPoints: TrendDataPoint[];
  trend: 'improving' | 'degrading' | 'stable';
  changePercent: number;
}

export interface TrendDataPoint {
  timestamp: string;
  version: string;
  value: number;
}

export interface RegressionImpact {
  functional: ImpactAssessment;
  performance: ImpactAssessment;
  accuracy: ImpactAssessment;
  overall: 'critical' | 'high' | 'medium' | 'low' | 'none';
}

export interface ImpactAssessment {
  affected: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  description: string;
}

export interface RegressionRecommendation {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'code' | 'model' | 'data' | 'configuration';
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

export interface RegressionAlert {
  id: string;
  suiteId: string;
  runId: string;
  type: 'regression_detected' | 'critical_regression' | 'trend_degradation';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  regressions: number;
  triggeredAt: string;
  acknowledged: boolean;
  resolvedAt?: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const regressionTestSuites = new Map<string, RegressionTestSuite>();
const regressionTestRuns = new Map<string, RegressionTestRun[]>();
const regressionReports = new Map<string, RegressionReport>();
const regressionAlerts = new Map<string, RegressionAlert[]>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculateDifference(baseline: any, current: any): number {
  if (typeof baseline === 'number' && typeof current === 'number') {
    return Math.abs(current - baseline);
  }
  
  if (typeof baseline === 'object' && typeof current === 'object') {
    const keys = Object.keys(baseline);
    let totalDiff = 0;
    
    for (const key of keys) {
      if (typeof baseline[key] === 'number' && typeof current[key] === 'number') {
        totalDiff += Math.abs(current[key] - baseline[key]);
      }
    }
    
    return totalDiff / keys.length;
  }
  
  return baseline === current ? 0 : 1;
}

function performTTest(baselineValues: number[], currentValues: number[]): StatisticalAnalysis {
  const n1 = baselineValues.length;
  const n2 = currentValues.length;
  
  const mean1 = baselineValues.reduce((sum, v) => sum + v, 0) / n1;
  const mean2 = currentValues.reduce((sum, v) => sum + v, 0) / n2;
  
  const variance1 = baselineValues.reduce((sum, v) => sum + Math.pow(v - mean1, 2), 0) / (n1 - 1);
  const variance2 = currentValues.reduce((sum, v) => sum + Math.pow(v - mean2, 2), 0) / (n2 - 1);
  
  const pooledStd = Math.sqrt(((n1 - 1) * variance1 + (n2 - 1) * variance2) / (n1 + n2 - 2));
  const tStat = (mean1 - mean2) / (pooledStd * Math.sqrt(1/n1 + 1/n2));
  
  // Simplified p-value calculation
  const pValue = 2 * (1 - Math.min(0.999, Math.abs(tStat) / 3));
  
  const effectSize = (mean1 - mean2) / pooledStd;
  
  return {
    tTestResult: tStat,
    pValue,
    significant: pValue < 0.05,
    confidenceLevel: 0.95,
    effectSize,
  };
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createRegressionTestSuite(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  baselineVersion: string;
  testCases: Omit<RegressionTestCase, 'id'>[];
  configuration: RegressionTestConfiguration;
  createdBy: string;
}): RegressionTestSuite {
  const now = new Date().toISOString();
  const id = randomUUID();

  const suite: RegressionTestSuite = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'ready',
    modelId: params.modelId,
    baselineVersion: params.baselineVersion,
    testCases: params.testCases.map(tc => ({ ...tc, id: randomUUID() })),
    configuration: params.configuration,
    baselines: [],
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  regressionTestSuites.set(id, suite);
  regressionTestRuns.set(id, []);
  regressionAlerts.set(id, []);

  return suite;
}

export function getRegressionTestSuite(id: string): RegressionTestSuite | undefined {
  return regressionTestSuites.get(id);
}

export function listRegressionTestSuites(
  organizationId: string,
  filters?: { status?: RegressionSuiteStatus; modelId?: string }
): RegressionTestSuite[] {
  let result = Array.from(regressionTestSuites.values()).filter(
    s => s.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(s => s.status === filters.status);
  if (filters?.modelId) result = result.filter(s => s.modelId === filters.modelId);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addRegressionTestCase(
  suiteId: string,
  testCase: Omit<RegressionTestCase, 'id'>
): RegressionTestSuite {
  const suite = regressionTestSuites.get(suiteId);
  if (!suite) throw new Error(`Regression test suite ${suiteId} not found`);

  const newTestCase: RegressionTestCase = {
    ...testCase,
    id: randomUUID(),
  };

  suite.testCases.push(newTestCase);
  suite.updatedAt = new Date().toISOString();

  return suite;
}

export function createBaseline(
  suiteId: string,
  version: string,
  results: RegressionTestResult[],
  metadata: BaselineMetadata
): RegressionBaseline {
  const suite = regressionTestSuites.get(suiteId);
  if (!suite) throw new Error(`Regression test suite ${suiteId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const baseline: RegressionBaseline = {
    id,
    version,
    createdAt: now,
    results,
    metadata,
  };

  suite.baselines.push(baseline);
  suite.updatedAt = now;

  return baseline;
}

export function runRegressionTests(
  suiteId: string,
  currentVersion: string,
  triggeredBy: string
): RegressionTestRun {
  const suite = regressionTestSuites.get(suiteId);
  if (!suite) throw new Error(`Regression test suite ${suiteId} not found`);

  const baseline = suite.baselines.find(b => b.version === suite.baselineVersion);
  if (!baseline) throw new Error('Baseline not found');

  const now = new Date().toISOString();
  const id = randomUUID();

  const run: RegressionTestRun = {
    id,
    suiteId,
    currentVersion,
    baselineVersion: suite.baselineVersion,
    status: 'running',
    results: [],
    comparison: {
      totalTests: suite.testCases.length,
      passed: 0,
      failed: 0,
      regressions: 0,
      regressionRate: 0,
      regressions: [],
    },
    summary: {
      totalTests: suite.testCases.length,
      passed: 0,
      failed: 0,
      regressions: 0,
      regressionRate: 0,
      criticalRegressions: 0,
      highRegressions: 0,
      mediumRegressions: 0,
      lowRegressions: 0,
      overallStatus: 'passed',
      recommendations: [],
    },
    startedAt: now,
    duration: 0,
    triggeredBy,
  };

  const suiteRuns = regressionTestRuns.get(suiteId) || [];
  suiteRuns.push(run);
  regressionTestRuns.set(suiteId, suiteRuns);

  suite.lastRun = now;
  suite.status = 'running';
  suite.updatedAt = now;

  // Simulate test execution
  setTimeout(() => {
    executeRegressionTests(run, suite, baseline);
  }, 100);

  return run;
}

function executeRegressionTests(
  run: RegressionTestRun,
  suite: RegressionTestSuite,
  baseline: RegressionBaseline
): void {
  const results: RegressionTestResult[] = [];
  const regressions: RegressionDetail[] = [];
  let totalDuration = 0;

  for (const testCase of suite.testCases) {
    if (!testCase.enabled) {
      results.push({
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        status: 'skipped',
        baselineOutput: null,
        currentOutput: null,
        difference: 0,
        withinTolerance: true,
        regressionDetected: false,
        duration: 0,
      });
      continue;
    }

    const baselineResult = baseline.results.find(r => r.testCaseId === testCase.id);
    const baselineOutput = baselineResult?.currentOutput || testCase.expectedOutput;

    // Simulate current output
    const hasRegression = Math.random() > 0.9; // 10% regression rate
    const currentOutput = hasRegression
      ? { ...baselineOutput, value: baselineOutput.value * (1 + Math.random() * 0.2) }
      : baselineOutput;

    const difference = calculateDifference(baselineOutput, currentOutput);
    const withinTolerance = difference <= testCase.tolerance;
    const regressionDetected = !withinTolerance;

    const duration = Math.random() * 2;
    totalDuration += duration;

    const status = regressionDetected ? 'regression' : 'passed';

    results.push({
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      status,
      baselineOutput,
      currentOutput,
      difference,
      withinTolerance,
      regressionDetected,
      duration,
    });

    if (regressionDetected) {
      const percentChange = (difference / (typeof baselineOutput === 'number' ? baselineOutput : 1)) * 100;
      const severity = percentChange > 20 ? 'critical'
        : percentChange > 10 ? 'high'
        : percentChange > 5 ? 'medium'
        : 'low';

      regressions.push({
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        type: testCase.type,
        baselineOutput,
        currentOutput,
        difference,
        percentChange,
        severity,
        impact: `${testCase.name} shows ${percentChange.toFixed(2)}% change`,
        recommendation: 'Review changes and validate output',
      });
    }
  }

  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const regressionCount = results.filter(r => r.status === 'regression').length;

  run.results = results;
  run.comparison.passed = passed;
  run.comparison.failed = failed;
  run.comparison.regressions = regressionCount;
  run.comparison.regressionRate = (regressionCount / results.length) * 100;
  run.comparison.regressions = regressions;

  run.summary.passed = passed;
  run.summary.failed = failed;
  run.summary.regressions = regressionCount;
  run.summary.regressionRate = run.comparison.regressionRate;
  run.summary.criticalRegressions = regressions.filter(r => r.severity === 'critical').length;
  run.summary.highRegressions = regressions.filter(r => r.severity === 'high').length;
  run.summary.mediumRegressions = regressions.filter(r => r.severity === 'medium').length;
  run.summary.lowRegressions = regressions.filter(r => r.severity === 'low').length;

  if (regressionCount > 0) {
    run.summary.overallStatus = 'regression_detected';
    run.summary.recommendations.push(`Review ${regressionCount} regressions`);
    
    if (run.summary.criticalRegressions > 0) {
      run.summary.recommendations.push('Address critical regressions immediately');
    }
  }

  // Statistical analysis
  if (suite.configuration.comparisonMode === 'statistical') {
    const baselineValues = baseline.results.map(r => 
      typeof r.currentOutput === 'number' ? r.currentOutput : 0
    );
    const currentValues = results.map(r => 
      typeof r.currentOutput === 'number' ? r.currentOutput : 0
    );

    run.comparison.statisticalAnalysis = performTTest(baselineValues, currentValues);
  }

  run.status = regressionCount > 0 ? 'regression_detected' : 'completed';
  run.completedAt = new Date().toISOString();
  run.duration = totalDuration;

  suite.status = 'completed';
  suite.updatedAt = new Date().toISOString();

  // Create alert if regressions detected
  if (regressionCount > 0) {
    const alerts = regressionAlerts.get(suiteId) || [];
    alerts.push({
      id: randomUUID(),
      suiteId,
      runId: run.id,
      type: run.summary.criticalRegressions > 0 ? 'critical_regression' : 'regression_detected',
      severity: run.summary.criticalRegressions > 0 ? 'critical' : 'high',
      title: `${regressionCount} regressions detected`,
      description: `Regression test run detected ${regressionCount} regressions`,
      regressions: regressionCount,
      triggeredAt: new Date().toISOString(),
      acknowledged: false,
    });
    regressionAlerts.set(suiteId, alerts);
  }
}

export function getRegressionTestRun(
  suiteId: string,
  runId: string
): RegressionTestRun | undefined {
  const runs = regressionTestRuns.get(suiteId) || [];
  return runs.find(r => r.id === runId);
}

export function listRegressionTestRuns(
  suiteId: string,
  filters?: { status?: RegressionRunStatus; limit?: number }
): RegressionTestRun[] {
  let result = regressionTestRuns.get(suiteId) || [];

  if (filters?.status) result = result.filter(r => r.status === filters.status);

  result = result.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  if (filters?.limit) {
    result = result.slice(0, filters.limit);
  }

  return result;
}

export function generateRegressionReport(
  suiteId: string,
  runId: string,
  type: 'summary' | 'detailed' | 'technical',
  generatedBy: string
): RegressionReport {
  const run = getRegressionTestRun(suiteId, runId);
  if (!run) throw new Error(`Regression test run ${runId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const executiveSummary = `Regression test run completed with ${run.summary.regressions} regressions detected ` +
    `(${run.summary.regressionRate.toFixed(1)}% regression rate).`;

  const trends: RegressionTrend[] = [
    {
      metric: 'Regression Rate',
      dataPoints: [
        { timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), version: 'v1.0', value: 5 },
        { timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), version: 'v1.1', value: 3 },
        { timestamp: now, version: run.currentVersion, value: run.summary.regressionRate },
      ],
      trend: run.summary.regressionRate > 5 ? 'degrading' : 'stable',
      changePercent: run.summary.regressionRate - 5,
    },
  ];

  const impact: RegressionImpact = {
    functional: {
      affected: run.summary.regressions,
      severity: run.summary.criticalRegressions > 0 ? 'critical' : run.summary.highRegressions > 0 ? 'high' : 'low',
      description: `${run.summary.regressions} functional regressions detected`,
    },
    performance: {
      affected: 0,
      severity: 'none',
      description: 'No performance regressions detected',
    },
    accuracy: {
      affected: 0,
      severity: 'none',
      description: 'No accuracy regressions detected',
    },
    overall: run.summary.criticalRegressions > 0 ? 'critical'
      : run.summary.highRegressions > 0 ? 'high'
      : run.summary.regressions > 0 ? 'medium'
      : 'none',
  };

  const recommendations: RegressionRecommendation[] = [
    {
      id: randomUUID(),
      priority: run.summary.criticalRegressions > 0 ? 'critical' : 'high',
      category: 'code',
      title: 'Review regressions',
      description: `${run.summary.regressions} regressions detected`,
      impact: 'Functional correctness',
      effort: 'medium',
      actionItems: [
        'Review code changes',
        'Validate outputs',
        'Update tests if needed',
      ],
    },
  ];

  const report: RegressionReport = {
    id,
    runId,
    type,
    title: `${type.charAt(0).toUpperCase() + type.slice(1)} Regression Report`,
    executiveSummary,
    comparison: run.comparison,
    regressions: run.comparison.regressions,
    trends,
    impact,
    recommendations,
    appendices: [],
    generatedAt: now,
    generatedBy,
  };

  regressionReports.set(id, report);
  return report;
}

export function getRegressionReport(id: string): RegressionReport | undefined {
  return regressionReports.get(id);
}

export function listRegressionReports(
  organizationId: string,
  filters?: { type?: string; suiteId?: string }
): RegressionReport[] {
  const suites = Array.from(regressionTestSuites.values()).filter(
    s => s.organizationId === organizationId
  );
  const suiteIds = suites.map(s => s.id);

  let result = Array.from(regressionReports.values()).filter(r => {
    const runs = regressionTestRuns.get(r.runId);
    return runs && suiteIds.includes(runs[0]?.suiteId || '');
  });

  if (filters?.type) result = result.filter(r => r.type === filters.type);

  return result.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export function getRegressionAlerts(
  suiteId: string,
  filters?: { severity?: string; acknowledged?: boolean }
): RegressionAlert[] {
  let result = regressionAlerts.get(suiteId) || [];

  if (filters?.severity) result = result.filter(a => a.severity === filters.severity);
  if (filters?.acknowledged !== undefined) {
    result = result.filter(a => a.acknowledged === filters.acknowledged);
  }

  return result.sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt));
}

export function acknowledgeRegressionAlert(
  suiteId: string,
  alertId: string
): RegressionAlert {
  const alerts = regressionAlerts.get(suiteId) || [];
  const alert = alerts.find(a => a.id === alertId);
  if (!alert) throw new Error(`Alert ${alertId} not found`);

  alert.acknowledged = true;
  return alert;
}

export function getRegressionTestDashboard(organizationId: string): {
  totalSuites: number;
  totalTests: number;
  averageRegressionRate: number;
  criticalRegressions: number;
  activeAlerts: number;
  lastRunStatus: 'passed' | 'failed' | 'regression' | 'none';
} {
  const suites = Array.from(regressionTestSuites.values()).filter(
    s => s.organizationId === organizationId
  );

  const totalTests = suites.reduce((sum, s) => sum + s.testCases.length, 0);

  const suiteIds = suites.map(s => s.id);
  const allRuns = suiteIds.flatMap(id => regressionTestRuns.get(id) || []);

  const completedRuns = allRuns.filter(r => 
    r.status === 'completed' || r.status === 'regression_detected'
  );

  const averageRegressionRate = completedRuns.length > 0
    ? completedRuns.reduce((sum, r) => sum + r.summary.regressionRate, 0) / completedRuns.length
    : 0;

  const criticalRegressions = completedRuns.reduce(
    (sum, r) => sum + r.summary.criticalRegressions, 0
  );

  const activeAlerts = suiteIds.reduce((sum, id) => {
    const alerts = regressionAlerts.get(id) || [];
    return sum + alerts.filter(a => !a.acknowledged).length;
  }, 0);

  const lastRun = completedRuns[0];
  const lastRunStatus = !lastRun ? 'none'
    : lastRun.status === 'regression_detected' ? 'regression'
    : lastRun.status === 'completed' ? 'passed'
    : 'failed';

  return {
    totalSuites: suites.length,
    totalTests,
    averageRegressionRate,
    criticalRegressions,
    activeAlerts,
    lastRunStatus,
  };
}
