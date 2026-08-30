/**
 * Module 39: Model Validation & Testing Service
 *
 * Provides automated model validation including statistical significance testing,
 * A/B testing, performance regression testing, fairness and bias testing,
 * and model explainability validation.
 *
 * Phase 1 — Critical Gap: Model validation and testing infrastructure
 */

import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../../db/redis.js";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:modelValidationTesting');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type ValidationStatus = "pending" | "running" | "passed" | "failed" | "error";

export type TestType =
  | "statistical_significance"
  | "performance_regression"
  | "ab_test"
  | "fairness"
  | "bias"
  | "explainability"
  | "custom";

export type StatisticalTest = "t_test" | "mann_whitney" | "bootstrap" | "bayesian" | "ks_test";

export type FairnessMetric =
  | "demographic_parity"
  | "equalized_odds"
  | "equal_opportunity"
  | "predictive_parity"
  | "disparate_impact";

export interface ValidationSuite {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelVersion: string;
  baselineModelId?: string;
  baselineModelVersion?: string;
  status: ValidationStatus;
  tests: ValidationTest[];
  overallScore: number;
  passedTests: number;
  failedTests: number;
  totalTests: number;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationTest {
  id: string;
  suiteId: string;
  name: string;
  type: TestType;
  status: ValidationStatus;
  config: ValidationTestConfig;
  result?: ValidationResult;
  weight: number;
  required: boolean;
  createdAt: string;
}

export interface ValidationTestConfig {
  // Statistical significance
  statisticalTest?: StatisticalTest;
  alpha?: number;
  metric?: string;
  
  // Performance regression
  baselineMetric?: number;
  threshold?: number;
  tolerance?: number;
  
  // A/B testing
  trafficSplit?: Record<string, number>;
  duration?: number;
  minSampleSize?: number;
  
  // Fairness
  protectedAttributes?: string[];
  fairnessMetrics?: FairnessMetric[];
  threshold?: number;
  
  // Bias
  biasMetrics?: string[];
  threshold?: number;
  
  // Explainability
  method?: "shap" | "lime" | "feature_importance";
  topKFeatures?: number;
  consistencyThreshold?: number;
  
  // Custom
  customLogic?: string;
  parameters?: Record<string, unknown>;
}

export interface ValidationResult {
  passed: boolean;
  score: number;
  details: Record<string, unknown>;
  statisticalSignificance?: StatisticalSignificanceResult;
  performanceRegression?: PerformanceRegressionResult;
  abTest?: ABTestResult;
  fairness?: FairnessResult;
  bias?: BiasResult;
  explainability?: ExplainabilityResult;
  error?: string;
  completedAt: string;
}

export interface StatisticalSignificanceResult {
  test: StatisticalTest;
  pValue: number;
  alpha: number;
  significant: boolean;
  effectSize: number;
  confidence: number;
  meanDifference: number;
  confidenceInterval: [number, number];
  sampleSize: number;
}

export interface PerformanceRegressionResult {
  baselineMetric: number;
  currentMetric: number;
  difference: number;
  percentChange: number;
  withinTolerance: boolean;
  threshold: number;
  tolerance: number;
}

export interface ABTestResult {
  variants: ABTestVariant[];
  winner?: string;
  confidence: number;
  significant: boolean;
  recommendation?: string;
}

export interface ABTestVariant {
  name: string;
  modelId: string;
  modelVersion: string;
  trafficPercent: number;
  samples: number;
  metric: number;
  confidence: number;
}

export interface FairnessResult {
  protectedAttribute: string;
  metrics: FairnessMetricResult[];
  overallScore: number;
  passed: boolean;
  recommendation?: string;
}

export interface FairnessMetricResult {
  metric: FairnessMetric;
  value: number;
  threshold: number;
  passed: boolean;
  groups: Record<string, number>;
}

export interface BiasResult {
  biasType: string;
  severity: "low" | "medium" | "high" | "critical";
  score: number;
  affectedGroups: string[];
  recommendation?: string;
}

export interface ExplainabilityResult {
  method: string;
  topFeatures: Array<{
    feature: string;
    importance: number;
    direction?: "positive" | "negative";
  }>;
  consistencyScore: number;
  passed: boolean;
  recommendation?: string;
}

export interface ValidationStats {
  totalSuites: number;
  suitesByStatus: Record<string, number>;
  totalTests: number;
  testsByType: Record<string, number>;
  averageScore: number;
  passRate: number;
  averageDurationMs: number;
  topFailedTests: Record<string, number>;
}

// ─── Redis Keys ───────────────────────────────────────────────────────────────

const VALIDATION_SUITE_KEY = (id: string) => `mlops:validation:${id}`;
const VALIDATION_SUITES_KEY = "mlops:validations";
const VALIDATION_MODEL_KEY = (modelId: string) => `mlops:model:${modelId}:validations`;
const VALIDATION_STATS_KEY = "mlops:validation:stats";

// ─── Service Implementation ───────────────────────────────────────────────────

export const ModelValidationTestingService = {
  /**
   * Create a validation suite
   */
  async createSuite(input: {
    organizationId: string;
    name: string;
    description?: string;
    modelId: string;
    modelVersion: string;
    baselineModelId?: string;
    baselineModelVersion?: string;
    tests?: Array<Omit<ValidationTest, "id" | "suiteId" | "status" | "result" | "createdAt">>;
    createdBy: string;
  }): Promise<ValidationSuite> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const tests: ValidationTest[] = (input.tests ?? this._getDefaultTests()).map(t => ({
      ...t,
      id: randomUUID(),
      suiteId: id,
      status: "pending",
      createdAt: now,
    }));

    const suite: ValidationSuite = {
      id,
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      modelId: input.modelId,
      modelVersion: input.modelVersion,
      baselineModelId: input.baselineModelId,
      baselineModelVersion: input.baselineModelVersion,
      status: "pending",
      tests,
      overallScore: 0,
      passedTests: 0,
      failedTests: 0,
      totalTests: tests.length,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    await redis.set(VALIDATION_SUITE_KEY(id), JSON.stringify(suite));
    await redis.sadd(VALIDATION_SUITES_KEY, id);
    await redis.sadd(VALIDATION_MODEL_KEY(input.modelId), id);

    return suite;
  },

  /**
   * Get validation suite by ID
   */
  async getSuite(id: string): Promise<ValidationSuite | null> {
    const raw = await redis.get(VALIDATION_SUITE_KEY(id));
    return raw ? JSON.parse(raw) as ValidationSuite : null;
  },

  /**
   * List validation suites
   */
  async listSuites(filters?: {
    organizationId?: string;
    modelId?: string;
    status?: ValidationStatus;
    limit?: number;
    offset?: number;
  }): Promise<ValidationSuite[]> {
    let ids: string[];

    if (filters?.modelId) {
      ids = await redis.smembers(VALIDATION_MODEL_KEY(filters.modelId));
    } else {
      ids = await redis.smembers(VALIDATION_SUITES_KEY);
    }

    const suites: ValidationSuite[] = [];
    for (const id of ids) {
      const suite = await this.getSuite(id);
      if (!suite) continue;

      if (filters?.organizationId && suite.organizationId !== filters.organizationId) continue;
      if (filters?.status && suite.status !== filters.status) continue;

      suites.push(suite);
    }

    suites.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;
    return suites.slice(offset, offset + limit);
  },

  /**
   * Run validation suite
   */
  async runSuite(id: string): Promise<ValidationSuite | null> {
    const suite = await this.getSuite(id);
    if (!suite) return null;

    suite.status = "running";
    suite.startTime = new Date().toISOString();
    suite.updatedAt = suite.startTime;

    await redis.set(VALIDATION_SUITE_KEY(id), JSON.stringify(suite));

    // Run all tests
    for (const test of suite.tests) {
      await this._runTest(suite, test);
    }

    // Calculate overall results
    suite.passedTests = suite.tests.filter(t => t.status === "passed").length;
    suite.failedTests = suite.tests.filter(t => t.status === "failed").length;
    
    const totalWeight = suite.tests.reduce((sum, t) => sum + t.weight, 0);
    const weightedScore = suite.tests.reduce((sum, t) => {
      const score = t.result?.score ?? 0;
      return sum + (score * t.weight);
    }, 0);
    
    suite.overallScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    suite.status = suite.failedTests === 0 ? "passed" : "failed";
    suite.endTime = new Date().toISOString();
    suite.durationMs = new Date(suite.endTime).getTime() - new Date(suite.startTime!).getTime();
    suite.updatedAt = suite.endTime;

    await redis.set(VALIDATION_SUITE_KEY(id), JSON.stringify(suite));
    return suite;
  },

  /**
   * Run a single test
   */
  async _runTest(suite: ValidationSuite, test: ValidationTest): Promise<void> {
    test.status = "running";
    await redis.set(VALIDATION_SUITE_KEY(suite.id), JSON.stringify(suite));

    try {
      let result: ValidationResult;

      switch (test.type) {
        case "statistical_significance":
          result = await this._runStatisticalTest(suite, test);
          break;
        case "performance_regression":
          result = await this._runPerformanceRegression(suite, test);
          break;
        case "ab_test":
          result = await this._runABTest(suite, test);
          break;
        case "fairness":
          result = await this._runFairnessTest(suite, test);
          break;
        case "bias":
          result = await this._runBiasTest(suite, test);
          break;
        case "explainability":
          result = await this._runExplainabilityTest(suite, test);
          break;
        case "custom":
          result = await this._runCustomTest(suite, test);
          break;
        default:
          throw new Error(`Unknown test type: ${test.type}`);
      }

      test.result = result;
      test.status = result.passed ? "passed" : "failed";
    } catch (error) {
      test.status = "error";
      test.result = {
        passed: false,
        score: 0,
        details: {},
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString(),
      };
    }

    await redis.set(VALIDATION_SUITE_KEY(suite.id), JSON.stringify(suite));
  },

  /**
   * Run statistical significance test
   */
  async _runStatisticalTest(suite: ValidationSuite, test: ValidationTest): Promise<ValidationResult> {
    _rng.reseed(`_runStatisticalTest:${suite}`);
    const config = test.config;
    const alpha = config.alpha ?? 0.05;
    const statisticalTest = config.statisticalTest ?? "t_test";

    // Simulate statistical test
    const pValue = _rng.next();
    const significant = pValue < alpha;
    const effectSize = _rng.next() * 0.5;
    const meanDifference = (_rng.next() - 0.5) * 0.2;
    const confidence = 1 - pValue;
    const sampleSize = 100 + Math.floor(_rng.next() * 900);

    const result: StatisticalSignificanceResult = {
      test: statisticalTest,
      pValue,
      alpha,
      significant,
      effectSize,
      confidence,
      meanDifference,
      confidenceInterval: [meanDifference - 0.1, meanDifference + 0.1],
      sampleSize,
    };

    return {
      passed: significant,
      score: significant ? 100 : 0,
      details: result,
      statisticalSignificance: result,
      completedAt: new Date().toISOString(),
    };
  },

  /**
   * Run performance regression test
   */
  async _runPerformanceRegression(suite: ValidationSuite, test: ValidationTest): Promise<ValidationResult> {
    _rng.reseed(`_runPerformanceRegression:${suite}`);
    const config = test.config;
    const baselineMetric = config.baselineMetric ?? 0.85;
    const threshold = config.threshold ?? 0.05;
    const tolerance = config.tolerance ?? 0.02;

    // Simulate current metric
    const currentMetric = baselineMetric + (_rng.next() - 0.5) * 0.1;
    const difference = currentMetric - baselineMetric;
    const percentChange = (difference / baselineMetric) * 100;
    const withinTolerance = Math.abs(difference) <= tolerance;

    const result: PerformanceRegressionResult = {
      baselineMetric,
      currentMetric,
      difference,
      percentChange,
      withinTolerance,
      threshold,
      tolerance,
    };

    return {
      passed: withinTolerance,
      score: withinTolerance ? 100 : Math.max(0, 100 - Math.abs(percentChange) * 10),
      details: result,
      performanceRegression: result,
      completedAt: new Date().toISOString(),
    };
  },

  /**
   * Run A/B test
   */
  async _runABTest(suite: ValidationSuite, test: ValidationTest): Promise<ValidationResult> {
    _rng.reseed(`_runABTest:${suite}`);
    const config = test.config;
    const trafficSplit = config.trafficSplit ?? { control: 50, treatment: 50 };
    const minSampleSize = config.minSampleSize ?? 1000;

    // Simulate A/B test
    const variants: ABTestVariant[] = Object.entries(trafficSplit).map(([name, percent]) => ({
      name,
      modelId: name === "control" ? (suite.baselineModelId ?? suite.modelId) : suite.modelId,
      modelVersion: name === "control" ? (suite.baselineModelVersion ?? suite.modelVersion) : suite.modelVersion,
      trafficPercent: percent,
      samples: minSampleSize + Math.floor(_rng.next() * 500),
      metric: 0.7 + _rng.next() * 0.2,
      confidence: 0.8 + _rng.next() * 0.2,
    }));

    // Determine winner
    variants.sort((a, b) => b.metric - a.metric);
    const winner = variants[0];
    const runnerUp = variants[1];
    const significant = winner && runnerUp && (winner.metric - runnerUp.metric) > 0.05;
    const confidence = significant ? 0.95 : 0.7;

    const result: ABTestResult = {
      variants,
      winner: significant ? winner.name : undefined,
      confidence,
      significant,
      recommendation: significant
        ? `Deploy ${winner.name} as it significantly outperforms other variants`
        : "No significant difference detected; continue testing or maintain current deployment",
    };

    return {
      passed: significant,
      score: significant ? 100 : 50,
      details: result,
      abTest: result,
      completedAt: new Date().toISOString(),
    };
  },

  /**
   * Run fairness test
   */
  async _runFairnessTest(suite: ValidationSuite, test: ValidationTest): Promise<ValidationResult> {
    _rng.reseed(`_runFairnessTest:${suite}`);
    const config = test.config;
    const protectedAttributes = config.protectedAttributes ?? ["gender", "race"];
    const fairnessMetrics = config.fairnessMetrics ?? ["demographic_parity", "equalized_odds"];
    const threshold = config.threshold ?? 0.8;

    const fairnessResults: FairnessResult[] = [];

    for (const attr of protectedAttributes) {
      const metrics: FairnessMetricResult[] = [];

      for (const metric of fairnessMetrics) {
        const value = 0.7 + _rng.next() * 0.3;
        const passed = value >= threshold;
        const groups = {
          group_a: 0.6 + _rng.next() * 0.3,
          group_b: 0.6 + _rng.next() * 0.3,
        };

        metrics.push({
          metric,
          value,
          threshold,
          passed,
          groups,
        });
      }

      const overallScore = metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
      const passed = metrics.every(m => m.passed);

      fairnessResults.push({
        protectedAttribute: attr,
        metrics,
        overallScore,
        passed,
        recommendation: passed
          ? `Model is fair across ${attr} groups`
          : `Model shows bias across ${attr} groups; consider rebalancing training data`,
      });
    }

    const allPassed = fairnessResults.every(r => r.passed);
    const avgScore = fairnessResults.reduce((sum, r) => sum + r.overallScore, 0) / fairnessResults.length;

    return {
      passed: allPassed,
      score: avgScore * 100,
      details: { fairnessResults },
      fairness: fairnessResults[0],
      completedAt: new Date().toISOString(),
    };
  },

  /**
   * Run bias test
   */
  async _runBiasTest(suite: ValidationSuite, test: ValidationTest): Promise<ValidationResult> {
    _rng.reseed(`_runBiasTest:${suite}`);
    const config = test.config;
    const biasMetrics = config.biasMetrics ?? ["representation", "prediction"];
    const threshold = config.threshold ?? 0.1;

    const biasResults: BiasResult[] = [];

    for (const biasType of biasMetrics) {
      const score = _rng.next();
      const severity = score < 0.1 ? "low" : score < 0.3 ? "medium" : score < 0.5 ? "high" : "critical";
      const affectedGroups = severity !== "low" ? ["group_a", "group_b"] : [];

      biasResults.push({
        biasType,
        severity,
        score,
        affectedGroups,
        recommendation: severity === "low"
          ? "No significant bias detected"
          : `Bias detected in ${biasType}; review training data and model architecture`,
      });
    }

    const allPassed = biasResults.every(r => r.severity === "low" || r.score < threshold);
    const avgScore = biasResults.reduce((sum, r) => sum + r.score, 0) / biasResults.length;

    return {
      passed: allPassed,
      score: (1 - avgScore) * 100,
      details: { biasResults },
      bias: biasResults[0],
      completedAt: new Date().toISOString(),
    };
  },

  /**
   * Run explainability test
   */
  async _runExplainabilityTest(suite: ValidationSuite, test: ValidationTest): Promise<ValidationResult> {
    _rng.reseed(`_runExplainabilityTest:${suite}`);
    const config = test.config;
    const method = config.method ?? "shap";
    const topKFeatures = config.topKFeatures ?? 10;
    const consistencyThreshold = config.consistencyThreshold ?? 0.8;

    // Simulate feature importance
    const features = [
      "age", "income", "education", "location", "tenure",
      "usage_frequency", "support_tickets", "contract_type", "payment_method", "region"
    ];

    const topFeatures = features.slice(0, topKFeatures).map(feature => ({
      feature,
      importance: _rng.next(),
      direction: (_rng.next() > 0.5 ? "positive" : "negative") as "positive" | "negative",
    }));

    topFeatures.sort((a, b) => b.importance - a.importance);

    const consistencyScore = 0.7 + _rng.next() * 0.3;
    const passed = consistencyScore >= consistencyThreshold;

    const result: ExplainabilityResult = {
      method,
      topFeatures,
      consistencyScore,
      passed,
      recommendation: passed
        ? "Model explanations are consistent and reliable"
        : "Model explanations show inconsistency; consider using ensemble methods",
    };

    return {
      passed,
      score: consistencyScore * 100,
      details: result,
      explainability: result,
      completedAt: new Date().toISOString(),
    };
  },

  /**
   * Run custom test
   */
  async _runCustomTest(suite: ValidationSuite, test: ValidationTest): Promise<ValidationResult> {
    _rng.reseed(`_runCustomTest:${suite}`);
    // Simulate custom test
    const passed = _rng.next() > 0.3;
    const score = passed ? 70 + _rng.next() * 30 : _rng.next() * 70;

    return {
      passed,
      score,
      details: { custom: true, parameters: test.config.parameters },
      completedAt: new Date().toISOString(),
    };
  },

  /**
   * Get default tests
   */
  _getDefaultTests(): Array<Omit<ValidationTest, "id" | "suiteId" | "status" | "result" | "createdAt">> {
    return [
      {
        name: "Statistical Significance Test",
        type: "statistical_significance",
        config: {
          statisticalTest: "t_test",
          alpha: 0.05,
          metric: "accuracy",
        },
        weight: 1.0,
        required: true,
      },
      {
        name: "Performance Regression Test",
        type: "performance_regression",
        config: {
          baselineMetric: 0.85,
          threshold: 0.05,
          tolerance: 0.02,
        },
        weight: 1.5,
        required: true,
      },
      {
        name: "Fairness Test",
        type: "fairness",
        config: {
          protectedAttributes: ["gender", "race"],
          fairnessMetrics: ["demographic_parity", "equalized_odds"],
          threshold: 0.8,
        },
        weight: 1.0,
        required: false,
      },
      {
        name: "Explainability Test",
        type: "explainability",
        config: {
          method: "shap",
          topKFeatures: 10,
          consistencyThreshold: 0.8,
        },
        weight: 0.5,
        required: false,
      },
    ];
  },

  /**
   * Get validation statistics
   */
  async getStats(organizationId?: string): Promise<ValidationStats> {
    const ids = await redis.smembers(VALIDATION_SUITES_KEY);
    const suites: ValidationSuite[] = [];

    for (const id of ids) {
      const suite = await this.getSuite(id);
      if (suite && (!organizationId || suite.organizationId === organizationId)) {
        suites.push(suite);
      }
    }

    const stats: ValidationStats = {
      totalSuites: suites.length,
      suitesByStatus: {},
      totalTests: 0,
      testsByType: {},
      averageScore: 0,
      passRate: 0,
      averageDurationMs: 0,
      topFailedTests: {},
    };

    let totalScore = 0;
    let totalDuration = 0;
    let durationCount = 0;
    let passedSuites = 0;

    for (const suite of suites) {
      // Status counts
      stats.suitesByStatus[suite.status] = (stats.suitesByStatus[suite.status] ?? 0) + 1;

      // Score and duration
      totalScore += suite.overallScore;
      if (suite.durationMs) {
        totalDuration += suite.durationMs;
        durationCount++;
      }

      if (suite.status === "passed") passedSuites++;

      // Test counts
      stats.totalTests += suite.totalTests;
      for (const test of suite.tests) {
        stats.testsByType[test.type] = (stats.testsByType[test.type] ?? 0) + 1;

        if (test.status === "failed") {
          stats.topFailedTests[test.name] = (stats.topFailedTests[test.name] ?? 0) + 1;
        }
      }
    }

    stats.averageScore = suites.length > 0 ? totalScore / suites.length : 0;
    stats.passRate = suites.length > 0 ? (passedSuites / suites.length) * 100 : 0;
    stats.averageDurationMs = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

    return stats;
  },

  /**
   * Delete validation suite
   */
  async deleteSuite(id: string): Promise<boolean> {
    const suite = await this.getSuite(id);
    if (!suite) return false;

    await redis.del(VALIDATION_SUITE_KEY(id));
    await redis.srem(VALIDATION_SUITES_KEY, id);
    await redis.srem(VALIDATION_MODEL_KEY(suite.modelId), id);

    return true;
  },
};
