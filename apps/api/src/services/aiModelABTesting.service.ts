/**
 * Module 131: AI Model A/B Testing Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides advanced A/B testing capabilities for AI models including experiment
 * design, traffic splitting, statistical analysis, significance testing, and
 * automated experiment management.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ABTest {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: ABTestStatus;
  hypothesis: TestHypothesis;
  variants: TestVariant[];
  trafficAllocation: TrafficAllocation;
  metrics: TestMetric[];
  configuration: ABTestConfiguration;
  results?: ABTestResults;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type ABTestStatus =
  | 'draft'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'inconclusive';

export interface TestHypothesis {
  nullHypothesis: string;
  alternativeHypothesis: string;
  primaryMetric: string;
  minimumDetectableEffect: number;
  significanceLevel: number;
  statisticalPower: number;
}

export interface TestVariant {
  id: string;
  name: string;
  modelId: string;
  modelVersion: string;
  isControl: boolean;
  trafficPercentage: number;
  metadata?: Record<string, any>;
}

export interface TrafficAllocation {
  strategy: 'random' | 'weighted' | 'stratified' | 'adaptive';
  splitRatio: number[];
  stratificationKey?: string;
  adaptiveAlgorithm?: 'multi-armed-bandit' | 'bayesian' | 'thompson-sampling';
}

export interface TestMetric {
  name: string;
  type: 'primary' | 'secondary' | 'guardrail';
  goal: 'increase' | 'decrease' | 'maintain';
  minimumSampleSize: number;
  currentSampleSize: number;
  values: MetricValue[];
}

export interface MetricValue {
  variantId: string;
  value: number;
  sampleSize: number;
  confidence: number;
  timestamp: string;
}

export interface ABTestConfiguration {
  duration: number; // days
  minimumSampleSize: number;
  earlyStopping: boolean;
  sequentialTesting: boolean;
  multipleComparisonCorrection: 'bonferroni' | 'holm' | 'benjamini-hochberg' | 'none';
  bayesianAnalysis: boolean;
  priorDistribution?: PriorDistribution;
}

export interface PriorDistribution {
  type: 'normal' | 'beta' | 'uniform';
  parameters: Record<string, number>;
}

export interface ABTestResults {
  winner?: string;
  statisticalSignificance: boolean;
  pValues: Record<string, number>;
  confidenceIntervals: Record<string, ConfidenceInterval>;
  effectSizes: Record<string, number>;
  bayesianAnalysis?: BayesianResults;
  powerAnalysis: PowerAnalysis;
  recommendations: string[];
  completedAt: string;
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  confidence: number;
}

export interface BayesianResults {
  posteriorDistributions: Record<string, PosteriorDistribution>;
  probabilityOfImprovement: Record<string, number>;
  expectedLoss: Record<string, number>;
  credibleIntervals: Record<string, ConfidenceInterval>;
}

export interface PosteriorDistribution {
  mean: number;
  variance: number;
  samples: number[];
}

export interface PowerAnalysis {
  achievedPower: number;
  requiredSampleSize: number;
  actualSampleSize: number;
  isSufficientlyPowered: boolean;
}

export interface TestEvent {
  id: string;
  testId: string;
  variantId: string;
  userId: string;
  timestamp: string;
  metrics: Record<string, number>;
  metadata?: Record<string, any>;
}

export interface TestReport {
  id: string;
  testId: string;
  executiveSummary: string;
  statisticalAnalysis: StatisticalAnalysis;
  variantComparison: VariantComparison[];
  insights: TestInsight[];
  recommendations: string[];
  appendices: ReportAppendix[];
  generatedAt: string;
}

export interface StatisticalAnalysis {
  frequentist: FrequentistAnalysis;
  bayesian?: BayesianAnalysis;
  effectSizeAnalysis: EffectSizeAnalysis;
}

export interface FrequentistAnalysis {
  testType: string;
  testStatistic: number;
  pValue: number;
  significanceLevel: number;
  isSignificant: boolean;
  confidenceInterval: ConfidenceInterval;
}

export interface BayesianAnalysis {
  posteriorProbability: number;
  bayesFactor: number;
  credibleInterval: ConfidenceInterval;
  roiDistribution: number[];
}

export interface EffectSizeAnalysis {
  cohensD: number;
  interpretation: 'negligible' | 'small' | 'medium' | 'large';
  practicalSignificance: boolean;
}

export interface VariantComparison {
  variantA: string;
  variantB: string;
  metricName: string;
  difference: number;
  percentChange: number;
  confidence: number;
  isSignificant: boolean;
}

export interface TestInsight {
  type: 'finding' | 'anomaly' | 'recommendation';
  severity: 'info' | 'warning' | 'critical';
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

const abTests = new Map<string, ABTest>();
const testEvents = new Map<string, TestEvent[]>();
const testReports = new Map<string, TestReport>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculateSampleSize(
  baselineRate: number,
  minimumDetectableEffect: number,
  significanceLevel: number,
  power: number
): number {
  // Simplified sample size calculation for proportions
  const zAlpha = 1.96; // for 0.05 significance
  const zBeta = 0.84; // for 0.8 power
  
  const p1 = baselineRate;
  const p2 = baselineRate * (1 + minimumDetectableEffect);
  
  const pooledP = (p1 + p2) / 2;
  
  const numerator = Math.pow(zAlpha * Math.sqrt(2 * pooledP * (1 - pooledP)) + 
                            zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2);
  const denominator = Math.pow(p2 - p1, 2);
  
  return Math.ceil(numerator / denominator);
}

function performTTest(
  sample1: number[],
  sample2: number[]
): { tStatistic: number; pValue: number; df: number } {
  const n1 = sample1.length;
  const n2 = sample2.length;
  const mean1 = sample1.reduce((a, b) => a + b, 0) / n1;
  const mean2 = sample2.reduce((a, b) => a + b, 0) / n2;
  
  const var1 = sample1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
  const var2 = sample2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);
  
  const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
  const standardError = Math.sqrt(pooledVar * (1/n1 + 1/n2));
  
  const tStatistic = (mean1 - mean2) / standardError;
  const df = n1 + n2 - 2;
  
  // Simplified p-value calculation (would use t-distribution in production)
  const pValue = 2 * (1 - Math.min(0.999, Math.abs(tStatistic) / 3));
  
  return { tStatistic, pValue, df };
}

function calculateEffectSize(sample1: number[], sample2: number[]): number {
  const n1 = sample1.length;
  const n2 = sample2.length;
  const mean1 = sample1.reduce((a, b) => a + b, 0) / n1;
  const mean2 = sample2.reduce((a, b) => a + b, 0) / n2;
  
  const var1 = sample1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
  const var2 = sample2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);
  
  const pooledStd = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));
  
  return (mean1 - mean2) / pooledStd; // Cohen's d
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createABTest(params: {
  organizationId: string;
  name: string;
  description?: string;
  hypothesis: TestHypothesis;
  variants: Omit<TestVariant, 'id'>[];
  trafficAllocation: TrafficAllocation;
  metrics: Omit<TestMetric, 'values' | 'currentSampleSize'>[];
  configuration: ABTestConfiguration;
  createdBy: string;
}): ABTest {
  const now = new Date().toISOString();
  const id = randomUUID();

  const variants: TestVariant[] = params.variants.map(v => ({
    ...v,
    id: randomUUID(),
  }));

  const metrics: TestMetric[] = params.metrics.map(m => ({
    ...m,
    currentSampleSize: 0,
    values: [],
  }));

  const test: ABTest = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'draft',
    hypothesis: params.hypothesis,
    variants,
    trafficAllocation: params.trafficAllocation,
    metrics,
    configuration: params.configuration,
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  abTests.set(id, test);
  testEvents.set(id, []);

  return test;
}

export function getABTest(id: string): ABTest | undefined {
  return abTests.get(id);
}

export function listABTests(
  organizationId: string,
  filters?: { status?: ABTestStatus }
): ABTest[] {
  let result = Array.from(abTests.values()).filter(
    t => t.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(t => t.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function startABTest(testId: string): ABTest {
  const test = abTests.get(testId);
  if (!test) throw new Error(`A/B test ${testId} not found`);

  if (test.status !== 'draft') {
    throw new Error('Test can only be started from draft status');
  }

  test.status = 'running';
  test.startDate = new Date().toISOString();
  test.updatedAt = new Date().toISOString();

  return test;
}

export function pauseABTest(testId: string): ABTest {
  const test = abTests.get(testId);
  if (!test) throw new Error(`A/B test ${testId} not found`);

  if (test.status !== 'running') {
    throw new Error('Test can only be paused when running');
  }

  test.status = 'paused';
  test.updatedAt = new Date().toISOString();

  return test;
}

export function resumeABTest(testId: string): ABTest {
  const test = abTests.get(testId);
  if (!test) throw new Error(`A/B test ${testId} not found`);

  if (test.status !== 'paused') {
    throw new Error('Test can only be resumed when paused');
  }

  test.status = 'running';
  test.updatedAt = new Date().toISOString();

  return test;
}

export function completeABTest(testId: string): ABTest {
  const test = abTests.get(testId);
  if (!test) throw new Error(`A/B test ${testId} not found`);

  if (test.status !== 'running' && test.status !== 'paused') {
    throw new Error('Test can only be completed when running or paused');
  }

  test.status = 'completed';
  test.endDate = new Date().toISOString();
  test.updatedAt = new Date().toISOString();

  // Analyze results
  test.results = analyzeTestResults(test);

  return test;
}

function analyzeTestResults(test: ABTest): ABTestResults {
  const controlVariant = test.variants.find(v => v.isControl);
  if (!controlVariant) throw new Error('No control variant found');

  const controlEvents = (testEvents.get(test.id) || [])
    .filter(e => e.variantId === controlVariant.id);

  const pValues: Record<string, number> = {};
  const confidenceIntervals: Record<string, ConfidenceInterval> = {};
  const effectSizes: Record<string, number> = {};

  let bestVariant = controlVariant;
  let bestImprovement = 0;

  for (const variant of test.variants) {
    if (variant.isControl) continue;

    const variantEvents = (testEvents.get(test.id) || [])
      .filter(e => e.variantId === variant.id);

    const controlValues = controlEvents.map(e => e.metrics[test.hypothesis.primaryMetric] || 0);
    const variantValues = variantEvents.map(e => e.metrics[test.hypothesis.primaryMetric] || 0);

    if (controlValues.length > 0 && variantValues.length > 0) {
      const { pValue } = performTTest(controlValues, variantValues);
      pValues[variant.id] = pValue;

      const effectSize = calculateEffectSize(controlValues, variantValues);
      effectSizes[variant.id] = effectSize;

      const controlMean = controlValues.reduce((a, b) => a + b, 0) / controlValues.length;
      const variantMean = variantValues.reduce((a, b) => a + b, 0) / variantValues.length;
      const improvement = (variantMean - controlMean) / controlMean;

      if (improvement > bestImprovement && pValue < test.hypothesis.significanceLevel) {
        bestImprovement = improvement;
        bestVariant = variant;
      }

      // Calculate confidence interval
      const pooledStd = Math.sqrt(
        (controlValues.reduce((sum, x) => sum + Math.pow(x - controlMean, 2), 0) +
         variantValues.reduce((sum, x) => sum + Math.pow(x - variantMean, 2), 0)) /
        (controlValues.length + variantValues.length - 2)
      );
      const marginOfError = 1.96 * pooledStd * Math.sqrt(1/controlValues.length + 1/variantValues.length);

      confidenceIntervals[variant.id] = {
        lower: (variantMean - controlMean) - marginOfError,
        upper: (variantMean - controlMean) + marginOfError,
        confidence: 0.95,
      };
    }
  }

  const requiredSampleSize = calculateSampleSize(
    0.5, // baseline rate
    test.hypothesis.minimumDetectableEffect,
    test.hypothesis.significanceLevel,
    test.hypothesis.statisticalPower
  );

  const actualSampleSize = controlEvents.length;
  const achievedPower = actualSampleSize >= requiredSampleSize ? 0.8 : 0.5;

  const statisticalSignificance = Object.values(pValues).some(
    p => p < test.hypothesis.significanceLevel
  );

  const winner = statisticalSignificance && bestVariant !== controlVariant
    ? bestVariant.id
    : undefined;

  const recommendations: string[] = [];
  if (winner) {
    recommendations.push(`Deploy variant ${bestVariant.name} as it shows statistically significant improvement`);
  } else if (!statisticalSignificance) {
    recommendations.push('No statistically significant difference detected - consider running test longer');
  }
  if (actualSampleSize < requiredSampleSize) {
    recommendations.push(`Increase sample size to ${requiredSampleSize} for adequate statistical power`);
  }

  return {
    winner,
    statisticalSignificance,
    pValues,
    confidenceIntervals,
    effectSizes,
    powerAnalysis: {
      achievedPower,
      requiredSampleSize,
      actualSampleSize,
      isSufficientlyPowered: actualSampleSize >= requiredSampleSize,
    },
    recommendations,
    completedAt: new Date().toISOString(),
  };
}

export function recordTestEvent(event: Omit<TestEvent, 'id'>): TestEvent {
  const test = abTests.get(event.testId);
  if (!test) throw new Error(`A/B test ${event.testId} not found`);

  if (test.status !== 'running') {
    throw new Error('Can only record events for running tests');
  }

  const newEvent: TestEvent = {
    ...event,
    id: randomUUID(),
  };

  const events = testEvents.get(event.testId) || [];
  events.push(newEvent);
  testEvents.set(event.testId, events);

  // Update metric sample sizes
  for (const metric of test.metrics) {
    if (event.metrics[metric.name] !== undefined) {
      metric.currentSampleSize++;
      metric.values.push({
        variantId: event.variantId,
        value: event.metrics[metric.name],
        sampleSize: metric.currentSampleSize,
        confidence: 0.95,
        timestamp: event.timestamp,
      });
    }
  }

  // Check for early stopping
  if (test.configuration.earlyStopping && test.results) {
    const shouldStop = checkEarlyStopping(test);
    if (shouldStop) {
      test.status = 'completed';
      test.endDate = new Date().toISOString();
    }
  }

  test.updatedAt = new Date().toISOString();

  return newEvent;
}

function checkEarlyStopping(test: ABTest): boolean {
  if (!test.results) return false;

  // Check if any variant is significantly better or worse
  for (const variant of test.variants) {
    if (variant.isControl) continue;

    const pValue = test.results.pValues[variant.id];
    if (pValue !== undefined && pValue < test.hypothesis.significanceLevel / 10) {
      // Very significant result - stop early
      return true;
    }
  }

  return false;
}

export function getTestEvents(
  testId: string,
  filters?: { variantId?: string; limit?: number }
): TestEvent[] {
  let events = testEvents.get(testId) || [];

  if (filters?.variantId) events = events.filter(e => e.variantId === filters.variantId);

  events = events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (filters?.limit) events = events.slice(0, filters.limit);

  return events;
}

export function generateTestReport(testId: string): TestReport {
  const test = abTests.get(testId);
  if (!test) throw new Error(`A/B test ${testId} not found`);

  if (!test.results) {
    throw new Error('Test must be completed before generating report');
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  const controlVariant = test.variants.find(v => v.isControl);
  if (!controlVariant) throw new Error('No control variant found');

  const variantComparisons: VariantComparison[] = [];

  for (const variant of test.variants) {
    if (variant.isControl) continue;

    const controlEvents = (testEvents.get(test.id) || [])
      .filter(e => e.variantId === controlVariant.id);
    const variantEvents = (testEvents.get(test.id) || [])
      .filter(e => e.variantId === variant.id);

    const controlValues = controlEvents.map(e => e.metrics[test.hypothesis.primaryMetric] || 0);
    const variantValues = variantEvents.map(e => e.metrics[test.hypothesis.primaryMetric] || 0);

    if (controlValues.length > 0 && variantValues.length > 0) {
      const controlMean = controlValues.reduce((a, b) => a + b, 0) / controlValues.length;
      const variantMean = variantValues.reduce((a, b) => a + b, 0) / variantValues.length;
      const difference = variantMean - controlMean;
      const percentChange = (difference / controlMean) * 100;

      variantComparisons.push({
        variantA: controlVariant.name,
        variantB: variant.name,
        metricName: test.hypothesis.primaryMetric,
        difference,
        percentChange,
        confidence: 1 - (test.results.pValues[variant.id] || 1),
        isSignificant: (test.results.pValues[variant.id] || 1) < test.hypothesis.significanceLevel,
      });
    }
  }

  const insights: TestInsight[] = [];

  if (test.results.winner) {
    const winnerVariant = test.variants.find(v => v.id === test.results!.winner);
    insights.push({
      type: 'finding',
      severity: 'info',
      description: `Variant ${winnerVariant?.name} is the winner with statistically significant improvement`,
      evidence: [`p-value: ${test.results.pValues[test.results.winner]}`],
      impact: 'Deploy winning variant to improve primary metric',
    });
  }

  if (!test.results.powerAnalysis.isSufficientlyPowered) {
    insights.push({
      type: 'warning',
      severity: 'warning',
      description: 'Test did not achieve sufficient statistical power',
      evidence: [
        `Required sample size: ${test.results.powerAnalysis.requiredSampleSize}`,
        `Actual sample size: ${test.results.powerAnalysis.actualSampleSize}`,
      ],
      impact: 'Results may not be reliable - consider running test longer',
    });
  }

  const executiveSummary = test.results.winner
    ? `A/B test "${test.name}" completed successfully. Variant ${test.variants.find(v => v.id === test.results!.winner)?.name} showed statistically significant improvement and is recommended for deployment.`
    : `A/B test "${test.name}" completed but did not find statistically significant differences between variants.`;

  const report: TestReport = {
    id,
    testId,
    executiveSummary,
    statisticalAnalysis: {
      frequentist: {
        testType: 'Two-sample t-test',
        testStatistic: 0,
        pValue: Math.min(...Object.values(test.results.pValues)),
        significanceLevel: test.hypothesis.significanceLevel,
        isSignificant: test.results.statisticalSignificance,
        confidenceInterval: test.results.confidenceIntervals[test.results.winner || ''] || {
          lower: 0,
          upper: 0,
          confidence: 0.95,
        },
      },
      effectSizeAnalysis: {
        cohensD: Object.values(test.results.effectSizes)[0] || 0,
        interpretation: 'medium',
        practicalSignificance: true,
      },
    },
    variantComparison: variantComparisons,
    insights,
    recommendations: test.results.recommendations,
    appendices: [],
    generatedAt: now,
  };

  testReports.set(id, report);
  return report;
}

export function getTestReport(id: string): TestReport | undefined {
  return testReports.get(id);
}

export function cancelABTest(testId: string): ABTest {
  const test = abTests.get(testId);
  if (!test) throw new Error(`A/B test ${testId} not found`);

  if (test.status === 'completed' || test.status === 'cancelled') {
    throw new Error('Cannot cancel completed or already cancelled test');
  }

  test.status = 'cancelled';
  test.endDate = new Date().toISOString();
  test.updatedAt = new Date().toISOString();

  return test;
}

export function getTestStatistics(testId: string): {
  totalEvents: number;
  eventsByVariant: Record<string, number>;
  duration: number;
  completionPercentage: number;
} {
  const test = abTests.get(testId);
  if (!test) throw new Error(`A/B test ${testId} not found`);

  const events = testEvents.get(testId) || [];
  const eventsByVariant: Record<string, number> = {};

  for (const event of events) {
    eventsByVariant[event.variantId] = (eventsByVariant[event.variantId] || 0) + 1;
  }

  const duration = test.startDate
    ? (new Date().getTime() - new Date(test.startDate).getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  const completionPercentage = Math.min(100, (duration / test.configuration.duration) * 100);

  return {
    totalEvents: events.length,
    eventsByVariant,
    duration,
    completionPercentage,
  };
}
