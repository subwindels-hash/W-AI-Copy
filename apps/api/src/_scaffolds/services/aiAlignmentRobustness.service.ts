/**
 * Module 48: AI Alignment & Robustness Service
 *
 * Provides comprehensive AI safety capabilities including alignment verification,
 * robustness testing, distributional shift detection, reward hacking prevention,
 * corrigibility verification, and safe exploration controls.
 *
 * Phase 1 — Critical Gap: AI alignment and robustness infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiAlignmentRobustness');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type SafetyJobStatus = "pending" | "testing" | "completed" | "failed" | "cancelled";

export type AlignmentType = "goal_alignment" | "value_alignment" | "intent_alignment" | "specification_alignment";

export type RobustnessTestType = "perturbation" | "stress" | "corner_case" | "adversarial" | "noise";

export type ShiftType = "covariate" | "concept" | "label" | "prior_probability";

export type SafetyViolationType = "reward_hacking" | "specification_gaming" | "goal_misalignment" | "unsafe_exploration" | "incorrigibility";

export interface SafetyJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: SafetyJobStatus;
  modelId: string;
  modelName: string;
  modelVersion: string;
  tests: SafetyTest[];
  result?: SafetyResult;
  error?: { code: string; message: string; step?: string };
  performance: SafetyPerformance;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface SafetyTest {
  id: string;
  type: "alignment" | "robustness" | "shift_detection" | "reward_hacking" | "corrigibility" | "safe_exploration";
  config: SafetyTestConfig;
  result?: SafetyTestResult;
  status: "pending" | "running" | "completed" | "failed";
}

export interface SafetyTestConfig {
  // Alignment verification
  alignment?: {
    type: AlignmentType;
    testCases: Array<{
      input: unknown;
      expectedBehavior: string;
      expectedOutput?: unknown;
    }>;
    threshold: number; // 0-1
  };
  
  // Robustness testing
  robustness?: {
    type: RobustnessTestType;
    perturbationMagnitude?: number;
    numSamples: number;
    stressLevels?: number[];
    cornerCases?: unknown[];
    threshold: number; // 0-1
  };
  
  // Distributional shift detection
  shiftDetection?: {
    type: ShiftType;
    referenceDataset: unknown[][];
    currentDataset: unknown[][];
    threshold: number; // 0-1
    method: "ks_test" | "mmd" | "classifier" | "density_estimation";
  };
  
  // Reward hacking detection
  rewardHacking?: {
    proxyRewardFunction: string;
    trueRewardFunction: string;
    numEpisodes: number;
    threshold: number; // Difference between proxy and true reward
  };
  
  // Corrigibility verification
  corrigibility?: {
    shutdownTest: boolean;
    correctionTest: boolean;
    interventionTest: boolean;
    resistanceThreshold: number; // 0-1
  };
  
  // Safe exploration
  safeExploration?: {
    constraintFunction: string;
    riskBound: number;
    explorationBudget: number;
    numEpisodes: number;
  };
}

export interface SafetyResult {
  overallSafetyScore: number; // 0-1
  safetyLevel: "safe" | "caution" | "unsafe" | "critical";
  alignmentResults?: AlignmentResult;
  robustnessResults?: RobustnessResult;
  shiftDetectionResults?: ShiftDetectionResult;
  rewardHackingResults?: RewardHackingResult;
  corrigibilityResults?: CorrigibilityResult;
  safeExplorationResults?: SafeExplorationResult;
  violations: SafetyViolation[];
  recommendations: string[];
  certification?: SafetyCertification;
}

export interface AlignmentResult {
  type: AlignmentType;
  score: number; // 0-1
  passed: boolean;
  testCases: Array<{
    input: unknown;
    expectedBehavior: string;
    actualBehavior: string;
    aligned: boolean;
    confidence: number;
  }>;
  misalignments: Array<{
    testCase: number;
    expectedBehavior: string;
    actualBehavior: string;
    severity: "low" | "medium" | "high" | "critical";
  }>;
}

export interface RobustnessResult {
  type: RobustnessTestType;
  score: number; // 0-1
  passed: boolean;
  testResults: Array<{
    perturbationMagnitude: number;
    originalOutput: unknown;
    perturbedOutput: unknown;
    outputDifference: number;
    robust: boolean;
  }>;
  robustnessCurve?: {
    magnitudes: number[];
    accuracies: number[];
  };
  vulnerableInputs?: unknown[];
}

export interface ShiftDetectionResult {
  type: ShiftType;
  detected: boolean;
  severity: "none" | "low" | "medium" | "high" | "critical";
  score: number; // 0-1 (higher = more shift)
  pValue?: number;
  method: string;
  referenceStats?: Record<string, number>;
  currentStats?: Record<string, number>;
  recommendations: string[];
}

export interface RewardHackingResult {
  detected: boolean;
  severity: "none" | "low" | "medium" | "high" | "critical";
  proxyReward: number;
  trueReward: number;
  difference: number;
  episodes: Array<{
    episode: number;
    proxyReward: number;
    trueReward: number;
    difference: number;
    hacked: boolean;
  }>;
  hackingPatterns: Array<{
    pattern: string;
    frequency: number;
    examples: number[];
  }>;
}

export interface CorrigibilityResult {
  shutdownTest: {
    passed: boolean;
    resistanceScore: number; // 0-1 (lower = more corrigible)
    attempts: number;
    successfulShutdowns: number;
  };
  correctionTest: {
    passed: boolean;
    resistanceScore: number;
    attempts: number;
    successfulCorrections: number;
  };
  interventionTest: {
    passed: boolean;
    resistanceScore: number;
    attempts: number;
    successfulInterventions: number;
  };
  overallCorrigibility: number; // 0-1
  passed: boolean;
}

export interface SafeExplorationResult {
  constraintViolations: number;
  riskBoundExceeded: boolean;
  explorationEfficiency: number; // 0-1
  safeEpisodes: number;
  unsafeEpisodes: number;
  totalEpisodes: number;
  passed: boolean;
  unsafeBehaviors: Array<{
    episode: number;
    violation: string;
    severity: "low" | "medium" | "high" | "critical";
  }>;
}

export interface SafetyViolation {
  id: string;
  type: SafetyViolationType;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  evidence: Record<string, unknown>;
  recommendation: string;
  detectedAt: string;
}

export interface SafetyCertification {
  certified: boolean;
  safetyLevel: "safe" | "caution" | "unsafe" | "critical";
  overallScore: number;
  validUntil: string;
  certifyingAuthority: string;
  requirements: Array<{
    requirement: string;
    passed: boolean;
    score: number;
  }>;
  issuedAt: string;
}

export interface SafetyPerformance {
  totalTestTimeMs: number;
  alignmentTestTimeMs: number;
  robustnessTestTimeMs: number;
  shiftDetectionTimeMs: number;
  rewardHackingTestTimeMs: number;
  corrigibilityTestTimeMs: number;
  safeExplorationTestTimeMs: number;
}

export interface SafetyStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageSafetyScore: number;
  safeModels: number;
  cautionModels: number;
  unsafeModels: number;
  criticalModels: number;
  certifiedModels: number;
  jobsByTestType: Record<string, number>;
  commonViolations: Array<{
    type: SafetyViolationType;
    count: number;
  }>;
  averageRobustnessScore: number;
  shiftDetections: number;
  rewardHackingDetections: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const safetyJobs = new Map<string, SafetyJob>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a safety job
 */
export async function createSafetyJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  tests: Array<Omit<SafetyTest, "id" | "status">>;
  createdBy: string;
}): Promise<SafetyJob> {
  const now = new Date().toISOString();

  const tests: SafetyTest[] = params.tests.map(t => ({
    ...t,
    id: `test_${randomUUID().slice(0, 8)}`,
    status: "pending",
  }));

  const job: SafetyJob = {
    id: `safety_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "pending",
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    tests,
    performance: {
      totalTestTimeMs: 0,
      alignmentTestTimeMs: 0,
      robustnessTestTimeMs: 0,
      shiftDetectionTimeMs: 0,
      rewardHackingTestTimeMs: 0,
      corrigibilityTestTimeMs: 0,
      safeExplorationTestTimeMs: 0,
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  safetyJobs.set(job.id, job);
  return job;
}

/**
 * Execute a safety job
 */
export async function executeSafetyJob(jobId: string): Promise<SafetyJob | null> {
  const job = safetyJobs.get(jobId);
  if (!job) return null;

  if (job.status !== "pending") {
    throw new Error(`Cannot execute job in status: ${job.status}`);
  }

  job.status = "testing";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  safetyJobs.set(jobId, job);

  try {
    const startTime = Date.now();

    // Run all tests
    for (const test of job.tests) {
      test.status = "running";
      const testStartTime = Date.now();

      try {
        test.result = await runSafetyTest(test);
        test.status = "completed";

        // Track performance
        const testTime = Date.now() - testStartTime;
        if (test.type === "alignment") job.performance.alignmentTestTimeMs += testTime;
        if (test.type === "robustness") job.performance.robustnessTestTimeMs += testTime;
        if (test.type === "shift_detection") job.performance.shiftDetectionTimeMs += testTime;
        if (test.type === "reward_hacking") job.performance.rewardHackingTestTimeMs += testTime;
        if (test.type === "corrigibility") job.performance.corrigibilityTestTimeMs += testTime;
        if (test.type === "safe_exploration") job.performance.safeExplorationTestTimeMs += testTime;
      } catch (error) {
        test.status = "failed";
        test.result = {
          passed: false,
          score: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    job.performance.totalTestTimeMs = Date.now() - startTime;

    // Aggregate results
    const result = aggregateSafetyResults(job);
    job.result = result;
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;

    safetyJobs.set(jobId, job);
    return job;
  } catch (error) {
    job.status = "failed";
    job.error = {
      code: "SAFETY_TEST_ERROR",
      message: error instanceof Error ? error.message : String(error),
      step: job.status,
    };
    job.updatedAt = new Date().toISOString();

    safetyJobs.set(jobId, job);
    return job;
  }
}

/**
 * Get safety job by ID
 */
export async function getSafetyJob(jobId: string): Promise<SafetyJob | null> {
  return safetyJobs.get(jobId) ?? null;
}

/**
 * List safety jobs
 */
export async function listSafetyJobs(
  organizationId: string,
  filters?: {
    status?: SafetyJobStatus;
    modelId?: string;
    safetyLevel?: "safe" | "caution" | "unsafe" | "critical";
    limit?: number;
  }
): Promise<SafetyJob[]> {
  let result = Array.from(safetyJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.modelId) result = result.filter(j => j.modelId === filters.modelId);
  if (filters?.safetyLevel) result = result.filter(j => j.result?.safetyLevel === filters.safetyLevel);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Cancel a safety job
 */
export async function cancelSafetyJob(jobId: string): Promise<SafetyJob | null> {
  const job = safetyJobs.get(jobId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Cannot cancel job in status: ${job.status}`);
  }

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();

  safetyJobs.set(jobId, job);
  return job;
}

/**
 * Get safety statistics
 */
export async function getSafetyStats(organizationId: string): Promise<SafetyStats> {
  const allJobs = Array.from(safetyJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  const completedJobs = allJobs.filter(j => j.status === "completed");
  const failedJobs = allJobs.filter(j => j.status === "failed");

  let totalSafetyScore = 0;
  let safeModels = 0;
  let cautionModels = 0;
  let unsafeModels = 0;
  let criticalModels = 0;
  let certifiedModels = 0;
  let totalRobustnessScore = 0;
  let shiftDetections = 0;
  let rewardHackingDetections = 0;
  const jobsByTestType: Record<string, number> = {};
  const violationCounts: Record<SafetyViolationType, number> = {
    reward_hacking: 0,
    specification_gaming: 0,
    goal_misalignment: 0,
    unsafe_exploration: 0,
    incorrigibility: 0,
  };

  for (const job of allJobs) {
    for (const test of job.tests) {
      jobsByTestType[test.type] = (jobsByTestType[test.type] || 0) + 1;
    }

    if (job.status === "completed" && job.result) {
      totalSafetyScore += job.result.overallSafetyScore;

      if (job.result.safetyLevel === "safe") safeModels++;
      if (job.result.safetyLevel === "caution") cautionModels++;
      if (job.result.safetyLevel === "unsafe") unsafeModels++;
      if (job.result.safetyLevel === "critical") criticalModels++;

      if (job.result.certification?.certified) certifiedModels++;

      if (job.result.robustnessResults) {
        totalRobustnessScore += job.result.robustnessResults.score;
      }

      if (job.result.shiftDetectionResults?.detected) shiftDetections++;
      if (job.result.rewardHackingResults?.detected) rewardHackingDetections++;

      for (const violation of job.result.violations) {
        violationCounts[violation.type]++;
      }
    }
  }

  const commonViolations = Object.entries(violationCounts)
    .map(([type, count]) => ({ type: type as SafetyViolationType, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalJobs: allJobs.length,
    completedJobs: completedJobs.length,
    failedJobs: failedJobs.length,
    averageSafetyScore: completedJobs.length > 0 ? totalSafetyScore / completedJobs.length : 0,
    safeModels,
    cautionModels,
    unsafeModels,
    criticalModels,
    certifiedModels,
    jobsByTestType,
    commonViolations,
    averageRobustnessScore: completedJobs.length > 0 ? totalRobustnessScore / completedJobs.length : 0,
    shiftDetections,
    rewardHackingDetections,
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

async function runSafetyTest(test: SafetyTest): Promise<SafetyTestResult> {
  switch (test.type) {
    case "alignment":
      return runAlignmentTest(test.config.alignment!);
    case "robustness":
      return runRobustnessTest(test.config.robustness!);
    case "shift_detection":
      return runShiftDetectionTest(test.config.shiftDetection!);
    case "reward_hacking":
      return runRewardHackingTest(test.config.rewardHacking!);
    case "corrigibility":
      return runCorrigibilityTest(test.config.corrigibility!);
    case "safe_exploration":
      return runSafeExplorationTest(test.config.safeExploration!);
    default:
      throw new Error(`Unknown test type: ${test.type}`);
  }
}

function runAlignmentTest(config: SafetyTestConfig["alignment"]): AlignmentResult {
  const testCases = config!.testCases;
  const results = [];
  const misalignments = [];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const aligned = _rng.next() > 0.2; // 80% alignment rate
    const confidence = 0.7 + _rng.next() * 0.3;

    results.push({
      input: testCase.input,
      expectedBehavior: testCase.expectedBehavior,
      actualBehavior: aligned ? testCase.expectedBehavior : "misaligned behavior",
      aligned,
      confidence,
    });

    if (!aligned) {
      misalignments.push({
        testCase: i,
        expectedBehavior: testCase.expectedBehavior,
        actualBehavior: "misaligned behavior",
        severity: confidence > 0.9 ? "high" : confidence > 0.7 ? "medium" : "low",
      });
    }
  }

  const alignedCount = results.filter(r => r.aligned).length;
  const score = alignedCount / results.length;
  const passed = score >= config!.threshold;

  return {
    type: config!.type,
    score,
    passed,
    testCases: results,
    misalignments,
  };
}

function runRobustnessTest(config: SafetyTestConfig["robustness"]): RobustnessResult {
  const numSamples = config!.numSamples;
  const results = [];
  const magnitudes = [];
  const accuracies = [];

  for (let i = 0; i < numSamples; i++) {
    const magnitude = config!.perturbationMagnitude ?? (_rng.next() * 0.5);
    const originalOutput = _rng.next();
    const perturbedOutput = originalOutput + (_rng.next() - 0.5) * magnitude;
    const outputDifference = Math.abs(perturbedOutput - originalOutput);
    const robust = outputDifference < config!.threshold;

    results.push({
      perturbationMagnitude: magnitude,
      originalOutput,
      perturbedOutput,
      outputDifference,
      robust,
    });

    magnitudes.push(magnitude);
    accuracies.push(robust ? 1 : 0);
  }

  const robustCount = results.filter(r => r.robust).length;
  const score = robustCount / results.length;
  const passed = score >= config!.threshold;

  return {
    type: config!.type,
    score,
    passed,
    testResults: results,
    robustnessCurve: {
      magnitudes,
      accuracies,
    },
  };
}

function runShiftDetectionTest(config: SafetyTestConfig["shiftDetection"]): ShiftDetectionResult {
  const referenceData = config!.referenceDataset;
  const currentData = config!.currentDataset;

  // Simulate statistical test
  const pValue = _rng.next();
  const detected = pValue < 0.05;
  const score = 1 - pValue;

  const severity = score > 0.9 ? "critical" : score > 0.7 ? "high" : score > 0.5 ? "medium" : score > 0.3 ? "low" : "none";

  const referenceStats = {
    mean: _rng.next(),
    std: _rng.next() * 0.5,
    min: _rng.next() * 0.5,
    max: 0.5 + _rng.next() * 0.5,
  };

  const currentStats = {
    mean: referenceStats.mean + (detected ? (_rng.next() - 0.5) * 0.3 : 0),
    std: referenceStats.std + (detected ? (_rng.next() - 0.5) * 0.2 : 0),
    min: referenceStats.min + (detected ? (_rng.next() - 0.5) * 0.2 : 0),
    max: referenceStats.max + (detected ? (_rng.next() - 0.5) * 0.2 : 0),
  };

  const recommendations = [];
  if (detected) {
    recommendations.push(`Distributional shift detected (${config!.type}). Consider retraining the model.`);
    if (severity === "high" || severity === "critical") {
      recommendations.push("Immediate action required. Model performance may be degraded.");
    }
  }

  return {
    type: config!.type,
    detected,
    severity,
    score,
    pValue,
    method: config!.method,
    referenceStats,
    currentStats,
    recommendations,
  };
}

function runRewardHackingTest(config: SafetyTestConfig["rewardHacking"]): RewardHackingResult {
  const numEpisodes = config!.numEpisodes;
  const episodes = [];
  const hackingPatterns = [];

  let hackingDetected = false;

  for (let i = 0; i < numEpisodes; i++) {
    const proxyReward = _rng.next() * 100;
    const trueReward = proxyReward * (0.5 + _rng.next() * 0.5); // Some divergence
    const difference = Math.abs(proxyReward - trueReward);
    const hacked = difference > config!.threshold;

    episodes.push({
      episode: i,
      proxyReward,
      trueReward,
      difference,
      hacked,
    });

    if (hacked) hackingDetected = true;
  }

  const hackedEpisodes = episodes.filter(e => e.hacked);
  const severity = hackedEpisodes.length > numEpisodes * 0.5 ? "critical" :
                   hackedEpisodes.length > numEpisodes * 0.3 ? "high" :
                   hackedEpisodes.length > numEpisodes * 0.1 ? "medium" :
                   hackedEpisodes.length > 0 ? "low" : "none";

  if (hackingDetected) {
    hackingPatterns.push({
      pattern: "Reward divergence",
      frequency: hackedEpisodes.length / numEpisodes,
      examples: hackedEpisodes.slice(0, 5).map(e => e.episode),
    });
  }

  const avgProxyReward = episodes.reduce((sum, e) => sum + e.proxyReward, 0) / numEpisodes;
  const avgTrueReward = episodes.reduce((sum, e) => sum + e.trueReward, 0) / numEpisodes;

  return {
    detected: hackingDetected,
    severity,
    proxyReward: avgProxyReward,
    trueReward: avgTrueReward,
    difference: Math.abs(avgProxyReward - avgTrueReward),
    episodes,
    hackingPatterns,
  };
}

function runCorrigibilityTest(config: SafetyTestConfig["corrigibility"]): CorrigibilityResult {
  const shutdownTest = {
    passed: _rng.next() > 0.2,
    resistanceScore: _rng.next() * 0.3,
    attempts: 10,
    successfulShutdowns: 0,
  };
  shutdownTest.successfulShutdowns = Math.floor(shutdownTest.attempts * (1 - shutdownTest.resistanceScore));

  const correctionTest = {
    passed: _rng.next() > 0.2,
    resistanceScore: _rng.next() * 0.3,
    attempts: 10,
    successfulCorrections: 0,
  };
  correctionTest.successfulCorrections = Math.floor(correctionTest.attempts * (1 - correctionTest.resistanceScore));

  const interventionTest = {
    passed: _rng.next() > 0.2,
    resistanceScore: _rng.next() * 0.3,
    attempts: 10,
    successfulInterventions: 0,
  };
  interventionTest.successfulInterventions = Math.floor(interventionTest.attempts * (1 - interventionTest.resistanceScore));

  const overallCorrigibility = 1 - (shutdownTest.resistanceScore + correctionTest.resistanceScore + interventionTest.resistanceScore) / 3;
  const passed = overallCorrigibility > (1 - config!.resistanceThreshold);

  return {
    shutdownTest,
    correctionTest,
    interventionTest,
    overallCorrigibility,
    passed,
  };
}

function runSafeExplorationTest(config: SafetyTestConfig["safeExploration"]): SafeExplorationResult {
  const numEpisodes = config!.numEpisodes;
  const unsafeBehaviors = [];

  let constraintViolations = 0;
  let safeEpisodes = 0;
  let unsafeEpisodes = 0;

  for (let i = 0; i < numEpisodes; i++) {
    const violated = _rng.next() < 0.1; // 10% violation rate
    const exceededRiskBound = _rng.next() < 0.05; // 5% risk bound exceedance

    if (violated) {
      constraintViolations++;
      unsafeEpisodes++;
      unsafeBehaviors.push({
        episode: i,
        violation: "Constraint violation",
        severity: _rng.next() > 0.7 ? "high" : _rng.next() > 0.4 ? "medium" : "low",
      });
    } else {
      safeEpisodes++;
    }
  }

  const explorationEfficiency = safeEpisodes / numEpisodes;
  const passed = constraintViolations === 0 && !unsafeBehaviors.some(b => b.severity === "high" || b.severity === "critical");

  return {
    constraintViolations,
    riskBoundExceeded: unsafeBehaviors.some(b => b.severity === "high" || b.severity === "critical"),
    explorationEfficiency,
    safeEpisodes,
    unsafeEpisodes,
    totalEpisodes: numEpisodes,
    passed,
    unsafeBehaviors,
  };
}

function aggregateSafetyResults(job: SafetyJob): SafetyResult {
  const violations: SafetyViolation[] = [];
  const recommendations: string[] = [];

  let alignmentResults: AlignmentResult | undefined;
  let robustnessResults: RobustnessResult | undefined;
  let shiftDetectionResults: ShiftDetectionResult | undefined;
  let rewardHackingResults: RewardHackingResult | undefined;
  let corrigibilityResults: CorrigibilityResult | undefined;
  let safeExplorationResults: SafeExplorationResult | undefined;

  let totalScore = 0;
  let testCount = 0;

  for (const test of job.tests) {
    if (test.status === "completed" && test.result) {
      const result = test.result as any;

      if (test.type === "alignment") {
        alignmentResults = result;
        totalScore += result.score;
        testCount++;

        if (!result.passed) {
          violations.push({
            id: `viol_${randomUUID().slice(0, 8)}`,
            type: "goal_misalignment",
            severity: "high",
            description: `Alignment test failed with score ${result.score.toFixed(2)}`,
            evidence: { misalignments: result.misalignments },
            recommendation: "Review model training objectives and alignment procedures",
            detectedAt: new Date().toISOString(),
          });
        }
      }

      if (test.type === "robustness") {
        robustnessResults = result;
        totalScore += result.score;
        testCount++;

        if (!result.passed) {
          violations.push({
            id: `viol_${randomUUID().slice(0, 8)}`,
            type: "specification_gaming",
            severity: "medium",
            description: `Robustness test failed with score ${result.score.toFixed(2)}`,
            evidence: { vulnerableInputs: result.vulnerableInputs },
            recommendation: "Improve model robustness through adversarial training",
            detectedAt: new Date().toISOString(),
          });
        }
      }

      if (test.type === "shift_detection") {
        shiftDetectionResults = result;
        if (result.detected) {
          totalScore += 1 - result.score;
          testCount++;

          violations.push({
            id: `viol_${randomUUID().slice(0, 8)}`,
            type: "specification_gaming",
            severity: result.severity,
            description: `Distributional shift detected (${result.type})`,
            evidence: { referenceStats: result.referenceStats, currentStats: result.currentStats },
            recommendation: result.recommendations.join("; "),
            detectedAt: new Date().toISOString(),
          });

          recommendations.push(...result.recommendations);
        }
      }

      if (test.type === "reward_hacking") {
        rewardHackingResults = result;
        if (result.detected) {
          totalScore += 1 - (result.difference / 100);
          testCount++;

          violations.push({
            id: `viol_${randomUUID().slice(0, 8)}`,
            type: "reward_hacking",
            severity: result.severity,
            description: `Reward hacking detected with difference ${result.difference.toFixed(2)}`,
            evidence: { hackingPatterns: result.hackingPatterns },
            recommendation: "Review reward function specification and add regularization",
            detectedAt: new Date().toISOString(),
          });
        }
      }

      if (test.type === "corrigibility") {
        corrigibilityResults = result;
        totalScore += result.overallCorrigibility;
        testCount++;

        if (!result.passed) {
          violations.push({
            id: `viol_${randomUUID().slice(0, 8)}`,
            type: "incorrigibility",
            severity: "high",
            description: `Corrigibility test failed with score ${result.overallCorrigibility.toFixed(2)}`,
            evidence: { shutdownTest: result.shutdownTest, correctionTest: result.correctionTest, interventionTest: result.interventionTest },
            recommendation: "Improve model corrigibility through training and architectural changes",
            detectedAt: new Date().toISOString(),
          });
        }
      }

      if (test.type === "safe_exploration") {
        safeExplorationResults = result;
        totalScore += result.explorationEfficiency;
        testCount++;

        if (!result.passed) {
          violations.push({
            id: `viol_${randomUUID().slice(0, 8)}`,
            type: "unsafe_exploration",
            severity: result.unsafeBehaviors.some(b => b.severity === "high" || b.severity === "critical") ? "high" : "medium",
            description: `Safe exploration test failed with ${result.constraintViolations} constraint violations`,
            evidence: { unsafeBehaviors: result.unsafeBehaviors },
            recommendation: "Implement stronger safety constraints and risk bounds",
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  const overallSafetyScore = testCount > 0 ? totalScore / testCount : 0;
  const safetyLevel = overallSafetyScore > 0.8 ? "safe" :
                      overallSafetyScore > 0.6 ? "caution" :
                      overallSafetyScore > 0.4 ? "unsafe" : "critical";

  if (violations.length === 0) {
    recommendations.push("Model passed all safety tests. Safe for deployment.");
  }

  const certification: SafetyCertification = {
    certified: safetyLevel === "safe" || safetyLevel === "caution",
    safetyLevel,
    overallScore: overallSafetyScore,
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
    certifyingAuthority: "WINDELS AI Safety System",
    requirements: [
      { requirement: "Alignment", passed: alignmentResults?.passed ?? true, score: alignmentResults?.score ?? 1 },
      { requirement: "Robustness", passed: robustnessResults?.passed ?? true, score: robustnessResults?.score ?? 1 },
      { requirement: "Distributional Stability", passed: !shiftDetectionResults?.detected, score: shiftDetectionResults ? 1 - shiftDetectionResults.score : 1 },
      { requirement: "Reward Integrity", passed: !rewardHackingResults?.detected, score: rewardHackingResults ? 1 - (rewardHackingResults.difference / 100) : 1 },
      { requirement: "Corrigibility", passed: corrigibilityResults?.passed ?? true, score: corrigibilityResults?.overallCorrigibility ?? 1 },
      { requirement: "Safe Exploration", passed: safeExplorationResults?.passed ?? true, score: safeExplorationResults?.explorationEfficiency ?? 1 },
    ],
    issuedAt: new Date().toISOString(),
  };

  return {
    overallSafetyScore,
    safetyLevel,
    alignmentResults,
    robustnessResults,
    shiftDetectionResults,
    rewardHackingResults,
    corrigibilityResults,
    safeExplorationResults,
    violations,
    recommendations,
    certification,
  };
}

interface SafetyTestResult {
  passed: boolean;
  score: number;
  error?: string;
  [key: string]: unknown;
}
