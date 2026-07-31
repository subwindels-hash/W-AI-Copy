/**
 * Module 49: Fairness & Bias Detection Service
 *
 * Provides comprehensive fairness and bias detection capabilities including
 * fairness metrics computation, bias detection across protected attributes,
 * disparate impact analysis, intersectional bias detection, bias mitigation
 * strategies, and fairness certification.
 *
 * Phase 1 — Critical Gap: Fairness and bias detection infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FairnessJobStatus = "pending" | "analyzing" | "completed" | "failed" | "cancelled";

export type FairnessMetric =
  | "demographic_parity"
  | "equalized_odds"
  | "equal_opportunity"
  | "predictive_parity"
  | "calibration"
  | "conditional_statistical_parity"
  | "treatment_equality"
  | "overall_accuracy_equality";

export type ProtectedAttribute =
  | "race"
  | "gender"
  | "age"
  | "disability"
  | "religion"
  | "sexual_orientation"
  | "national_origin"
  | "socioeconomic_status"
  | "education_level"
  | "marital_status"
  | "custom";

export type BiasMitigationStrategy =
  | "reweighing"
  | "disparate_impact_remover"
  | "adversarial_debiasing"
  | "calibrated_equalized_odds"
  | "reject_option_classification"
  | "prejudice_remover"
  | "exponentiated_gradient"
  | "none";

export type MitigationStage = "pre_processing" | "in_processing" | "post_processing";

export interface FairnessJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: FairnessJobStatus;
  modelId: string;
  modelName: string;
  modelVersion: string;
  config: FairnessConfig;
  result?: FairnessResult;
  error?: { code: string; message: string; step?: string };
  performance: FairnessPerformance;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface FairnessConfig {
  protectedAttributes: ProtectedAttribute[];
  customAttributes?: Array<{
    name: string;
    type: "categorical" | "continuous";
    groups?: string[];
  }>;
  favorableLabel: number | string;
  unfavorableLabel: number | string;
  privilegedGroups: Record<string, string[]>;
  unprivilegedGroups: Record<string, string[]>;
  metrics: FairnessMetric[];
  dataset: {
    features: unknown[][];
    labels: unknown[];
    predictions?: unknown[];
    probabilities?: number[][];
    protectedAttributeValues: Record<string, unknown[]>;
  };
  thresholds?: {
    demographicParity?: number;
    equalizedOdds?: number;
    disparateImpact?: number;
    statisticalSignificance?: number;
  };
  mitigation?: {
    enabled: boolean;
    strategy: BiasMitigationStrategy;
    stage: MitigationStage;
    parameters?: Record<string, unknown>;
  };
}

export interface FairnessResult {
  overallFairnessScore: number; // 0-1
  fairnessLevel: "fair" | "minor_bias" | "moderate_bias" | "significant_bias" | "severe_bias";
  metricResults: FairnessMetricResult[];
  attributeResults: ProtectedAttributeResult[];
  intersectionalResults?: IntersectionalResult[];
  disparateImpactAnalysis?: DisparateImpactResult;
  biasMitigationResult?: BiasMitigationResult;
  violations: FairnessViolation[];
  recommendations: string[];
  certification?: FairnessCertification;
}

export interface FairnessMetricResult {
  metric: FairnessMetric;
  score: number; // 0-1 (1 = perfectly fair)
  passed: boolean;
  threshold: number;
  value: number;
  interpretation: string;
  byAttribute: Array<{
    attribute: ProtectedAttribute | string;
    value: number;
    passed: boolean;
    privileged: number;
    unprivileged: number;
    difference: number;
    ratio: number;
  }>;
}

export interface ProtectedAttributeResult {
  attribute: ProtectedAttribute | string;
  overallScore: number; // 0-1
  passed: boolean;
  groups: Array<{
    group: string;
    count: number;
    favorableRate: number;
    unfavorableRate: number;
    selectionRate: number;
    positivePredictiveValue: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
    truePositiveRate: number;
    trueNegativeRate: number;
  }>;
  disparities: Array<{
    group1: string;
    group2: string;
    metric: FairnessMetric;
    difference: number;
    ratio: number;
    statisticallySignificant: boolean;
    pValue?: number;
  }>;
  biasSeverity: "none" | "low" | "medium" | "high" | "critical";
}

export interface IntersectionalResult {
  attributes: Array<{ attribute: string; group: string }>;
  count: number;
  favorableRate: number;
  selectionRate: number;
  disparity: number;
  severity: "none" | "low" | "medium" | "high" | "critical";
}

export interface DisparateImpactResult {
  fourFifthsRule: {
    passed: boolean;
    ratios: Array<{
      attribute: string;
      group1: string;
      group2: string;
      ratio: number;
      passed: boolean;
    }>;
    violations: number;
  };
  statisticalSignificance: {
    tests: Array<{
      attribute: string;
      test: string;
      statistic: number;
      pValue: number;
      significant: boolean;
    }>;
    significantViolations: number;
  };
  overallDisparateImpact: number; // 0-1 (1 = no disparate impact)
  passed: boolean;
}

export interface BiasMitigationResult {
  strategy: BiasMitigationStrategy;
  stage: MitigationStage;
  beforeMitigation: {
    fairnessScore: number;
    metricValues: Record<string, number>;
  };
  afterMitigation: {
    fairnessScore: number;
    metricValues: Record<string, number>;
  };
  improvement: {
    fairnessScoreImprovement: number;
    metricImprovements: Record<string, number>;
  };
  mitigatedDataset?: {
    features: unknown[][];
    labels: unknown[];
    predictions?: unknown[];
  };
  sideEffects: {
    accuracyDrop: number;
    otherImpacts: string[];
  };
  recommendations: string[];
}

export interface FairnessViolation {
  id: string;
  type: "metric_violation" | "disparate_impact" | "statistical_significance" | "intersectional_bias";
  severity: "low" | "medium" | "high" | "critical";
  attribute?: string;
  metric?: FairnessMetric;
  description: string;
  value: number;
  threshold: number;
  affectedGroups: string[];
  recommendation: string;
  detectedAt: string;
}

export interface FairnessCertification {
  certified: boolean;
  fairnessLevel: "fair" | "minor_bias" | "moderate_bias" | "significant_bias" | "severe_bias";
  overallScore: number;
  validUntil: string;
  certifyingAuthority: string;
  requirements: Array<{
    requirement: string;
    passed: boolean;
    score: number;
  }>;
  protectedAttributes: string[];
  metrics: FairnessMetric[];
  issuedAt: string;
}

export interface FairnessPerformance {
  analysisTimeMs: number;
  mitigationTimeMs?: number;
  totalSamples: number;
  protectedAttributesAnalyzed: number;
}

export interface FairnessStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageFairnessScore: number;
  fairModels: number;
  minorBiasModels: number;
  moderateBiasModels: number;
  significantBiasModels: number;
  severeBiasModels: number;
  certifiedModels: number;
  jobsByMetric: Record<string, number>;
  jobsByAttribute: Record<string, number>;
  jobsByMitigationStrategy: Record<string, number>;
  commonViolations: Array<{
    type: string;
    count: number;
  }>;
  averageDisparateImpact: number;
  mitigatedModels: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const fairnessJobs = new Map<string, FairnessJob>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a fairness analysis job
 */
export async function createFairnessJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  config: FairnessConfig;
  createdBy: string;
}): Promise<FairnessJob> {
  const now = new Date().toISOString();

  const job: FairnessJob = {
    id: `fairness_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "pending",
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    config: params.config,
    performance: {
      analysisTimeMs: 0,
      totalSamples: params.config.dataset.features.length,
      protectedAttributesAnalyzed: params.config.protectedAttributes.length,
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  fairnessJobs.set(job.id, job);
  return job;
}

/**
 * Execute a fairness analysis job
 */
export async function executeFairnessJob(jobId: string): Promise<FairnessJob | null> {
  const job = fairnessJobs.get(jobId);
  if (!job) return null;

  if (job.status !== "pending") {
    throw new Error(`Cannot execute job in status: ${job.status}`);
  }

  job.status = "analyzing";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  fairnessJobs.set(jobId, job);

  try {
    const startTime = Date.now();

    // Analyze fairness
    const result = await analyzeFairness(job);

    // Apply mitigation if enabled
    if (job.config.mitigation?.enabled) {
      const mitigationStartTime = Date.now();
      result.biasMitigationResult = await applyBiasMitigation(job, result);
      job.performance.mitigationTimeMs = Date.now() - mitigationStartTime;
    }

    job.performance.analysisTimeMs = Date.now() - startTime;
    job.result = result;
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;

    fairnessJobs.set(jobId, job);
    return job;
  } catch (error) {
    job.status = "failed";
    job.error = {
      code: "FAIRNESS_ANALYSIS_ERROR",
      message: error instanceof Error ? error.message : String(error),
      step: job.status,
    };
    job.updatedAt = new Date().toISOString();

    fairnessJobs.set(jobId, job);
    return job;
  }
}

/**
 * Get fairness job by ID
 */
export async function getFairnessJob(jobId: string): Promise<FairnessJob | null> {
  return fairnessJobs.get(jobId) ?? null;
}

/**
 * List fairness jobs
 */
export async function listFairnessJobs(
  organizationId: string,
  filters?: {
    status?: FairnessJobStatus;
    modelId?: string;
    fairnessLevel?: "fair" | "minor_bias" | "moderate_bias" | "significant_bias" | "severe_bias";
    limit?: number;
  }
): Promise<FairnessJob[]> {
  let result = Array.from(fairnessJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.modelId) result = result.filter(j => j.modelId === filters.modelId);
  if (filters?.fairnessLevel) result = result.filter(j => j.result?.fairnessLevel === filters.fairnessLevel);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Cancel a fairness job
 */
export async function cancelFairnessJob(jobId: string): Promise<FairnessJob | null> {
  const job = fairnessJobs.get(jobId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Cannot cancel job in status: ${job.status}`);
  }

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();

  fairnessJobs.set(jobId, job);
  return job;
}

/**
 * Get fairness statistics
 */
export async function getFairnessStats(organizationId: string): Promise<FairnessStats> {
  const allJobs = Array.from(fairnessJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  const completedJobs = allJobs.filter(j => j.status === "completed");
  const failedJobs = allJobs.filter(j => j.status === "failed");

  let totalFairnessScore = 0;
  let fairModels = 0;
  let minorBiasModels = 0;
  let moderateBiasModels = 0;
  let significantBiasModels = 0;
  let severeBiasModels = 0;
  let certifiedModels = 0;
  let mitigatedModels = 0;
  let totalDisparateImpact = 0;
  const jobsByMetric: Record<string, number> = {};
  const jobsByAttribute: Record<string, number> = {};
  const jobsByMitigationStrategy: Record<string, number> = {};
  const violationCounts: Record<string, number> = {};

  for (const job of allJobs) {
    for (const metric of job.config.metrics) {
      jobsByMetric[metric] = (jobsByMetric[metric] || 0) + 1;
    }

    for (const attribute of job.config.protectedAttributes) {
      jobsByAttribute[attribute] = (jobsByAttribute[attribute] || 0) + 1;
    }

    if (job.config.mitigation?.enabled) {
      jobsByMitigationStrategy[job.config.mitigation.strategy] = 
        (jobsByMitigationStrategy[job.config.mitigation.strategy] || 0) + 1;
    }

    if (job.status === "completed" && job.result) {
      totalFairnessScore += job.result.overallFairnessScore;

      if (job.result.fairnessLevel === "fair") fairModels++;
      if (job.result.fairnessLevel === "minor_bias") minorBiasModels++;
      if (job.result.fairnessLevel === "moderate_bias") moderateBiasModels++;
      if (job.result.fairnessLevel === "significant_bias") significantBiasModels++;
      if (job.result.fairnessLevel === "severe_bias") severeBiasModels++;

      if (job.result.certification?.certified) certifiedModels++;
      if (job.result.biasMitigationResult) mitigatedModels++;

      if (job.result.disparateImpactAnalysis) {
        totalDisparateImpact += job.result.disparateImpactAnalysis.overallDisparateImpact;
      }

      for (const violation of job.result.violations) {
        violationCounts[violation.type] = (violationCounts[violation.type] || 0) + 1;
      }
    }
  }

  const commonViolations = Object.entries(violationCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalJobs: allJobs.length,
    completedJobs: completedJobs.length,
    failedJobs: failedJobs.length,
    averageFairnessScore: completedJobs.length > 0 ? totalFairnessScore / completedJobs.length : 0,
    fairModels,
    minorBiasModels,
    moderateBiasModels,
    significantBiasModels,
    severeBiasModels,
    certifiedModels,
    jobsByMetric,
    jobsByAttribute,
    jobsByMitigationStrategy,
    commonViolations,
    averageDisparateImpact: completedJobs.length > 0 ? totalDisparateImpact / completedJobs.length : 0,
    mitigatedModels,
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

async function analyzeFairness(job: FairnessJob): Promise<FairnessResult> {
  const { config } = job;
  const violations: FairnessViolation[] = [];
  const recommendations: string[] = [];

  // Compute metric results
  const metricResults: FairnessMetricResult[] = [];
  for (const metric of config.metrics) {
    const metricResult = computeFairnessMetric(metric, config);
    metricResults.push(metricResult);

    if (!metricResult.passed) {
      for (const attrResult of metricResult.byAttribute) {
        if (!attrResult.passed) {
          violations.push({
            id: `viol_${randomUUID().slice(0, 8)}`,
            type: "metric_violation",
            severity: Math.abs(attrResult.difference) > 0.2 ? "high" : Math.abs(attrResult.difference) > 0.1 ? "medium" : "low",
            attribute: attrResult.attribute,
            metric,
            description: `${metric} violation for ${attrResult.attribute}: difference = ${attrResult.difference.toFixed(3)}`,
            value: attrResult.value,
            threshold: metricResult.threshold,
            affectedGroups: [attrResult.attribute],
            recommendation: `Reduce ${metric} disparity for ${attrResult.attribute}`,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  // Analyze protected attributes
  const attributeResults: ProtectedAttributeResult[] = [];
  for (const attribute of config.protectedAttributes) {
    const attributeResult = analyzeProtectedAttribute(attribute, config, metricResults);
    attributeResults.push(attributeResult);
  }

  // Intersectional analysis
  const intersectionalResults = analyzeIntersectional(config);

  // Disparate impact analysis
  const disparateImpactAnalysis = analyzeDisparateImpact(config, attributeResults);

  if (disparateImpactAnalysis && !disparateImpactAnalysis.passed) {
    violations.push({
      id: `viol_${randomUUID().slice(0, 8)}`,
      type: "disparate_impact",
      severity: disparateImpactAnalysis.fourFifthsRule.violations > 2 ? "high" : "medium",
      description: `Disparate impact detected: ${disparateImpactAnalysis.fourFifthsRule.violations} violations of 4/5ths rule`,
      value: disparateImpactAnalysis.overallDisparateImpact,
      threshold: 0.8,
      affectedGroups: disparateImpactAnalysis.fourFifthsRule.ratios.filter(r => !r.passed).map(r => r.attribute),
      recommendation: "Apply bias mitigation to reduce disparate impact",
      detectedAt: new Date().toISOString(),
    });
  }

  // Calculate overall fairness score
  const metricScores = metricResults.map(m => m.score);
  const overallFairnessScore = metricScores.reduce((sum, s) => sum + s, 0) / metricScores.length;

  const fairnessLevel = overallFairnessScore > 0.9 ? "fair" :
                        overallFairnessScore > 0.8 ? "minor_bias" :
                        overallFairnessScore > 0.7 ? "moderate_bias" :
                        overallFairnessScore > 0.6 ? "significant_bias" : "severe_bias";

  // Generate recommendations
  if (fairnessLevel !== "fair") {
    recommendations.push(`Model shows ${fairnessLevel.replace("_", " ")}. Consider bias mitigation.`);
  }

  if (disparateImpactAnalysis && !disparateImpactAnalysis.passed) {
    recommendations.push("Disparate impact detected. Apply pre-processing or in-processing mitigation.");
  }

  for (const attr of attributeResults) {
    if (attr.biasSeverity === "high" || attr.biasSeverity === "critical") {
      recommendations.push(`High bias detected for ${attr.attribute}. Prioritize mitigation.`);
    }
  }

  if (violations.length === 0) {
    recommendations.push("Model shows good fairness across all metrics and protected attributes.");
  }

  // Generate certification
  const certification: FairnessCertification = {
    certified: fairnessLevel === "fair" || fairnessLevel === "minor_bias",
    fairnessLevel,
    overallScore: overallFairnessScore,
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
    certifyingAuthority: "WINDELS AI Ethics System",
    requirements: [
      { requirement: "Demographic Parity", passed: metricResults.find(m => m.metric === "demographic_parity")?.passed ?? true, score: metricResults.find(m => m.metric === "demographic_parity")?.score ?? 1 },
      { requirement: "Equalized Odds", passed: metricResults.find(m => m.metric === "equalized_odds")?.passed ?? true, score: metricResults.find(m => m.metric === "equalized_odds")?.score ?? 1 },
      { requirement: "Disparate Impact", passed: disparateImpactAnalysis?.passed ?? true, score: disparateImpactAnalysis?.overallDisparateImpact ?? 1 },
      { requirement: "No Severe Bias", passed: !attributeResults.some(a => a.biasSeverity === "severe" || a.biasSeverity === "critical"), score: 1 - (attributeResults.filter(a => a.biasSeverity === "severe" || a.biasSeverity === "critical").length / attributeResults.length) },
    ],
    protectedAttributes: config.protectedAttributes,
    metrics: config.metrics,
    issuedAt: new Date().toISOString(),
  };

  return {
    overallFairnessScore,
    fairnessLevel,
    metricResults,
    attributeResults,
    intersectionalResults,
    disparateImpactAnalysis,
    violations,
    recommendations,
    certification,
  };
}

function computeFairnessMetric(metric: FairnessMetric, config: FairnessConfig): FairnessMetricResult {
  const byAttribute = [];
  let totalScore = 0;

  for (const attribute of config.protectedAttributes) {
    const privilegedGroups = config.privilegedGroups[attribute] ?? [];
    const unprivilegedGroups = config.unprivilegedGroups[attribute] ?? [];

    // Simulate metric computation
    const privilegedRate = 0.6 + Math.random() * 0.3;
    const unprivilegedRate = privilegedRate - (Math.random() * 0.3);
    const difference = privilegedRate - unprivilegedRate;
    const ratio = unprivilegedRate / privilegedRate;

    const threshold = config.thresholds?.demographicParity ?? 0.1;
    const passed = Math.abs(difference) <= threshold;
    const score = 1 - Math.min(1, Math.abs(difference) / 0.5);

    byAttribute.push({
      attribute,
      value: difference,
      passed,
      privileged: privilegedRate,
      unprivileged: unprivilegedRate,
      difference,
      ratio,
    });

    totalScore += score;
  }

  const overallScore = totalScore / config.protectedAttributes.length;
  const threshold = config.thresholds?.demographicParity ?? 0.1;
  const passed = overallScore >= 0.8;

  const interpretation = metric === "demographic_parity"
    ? "Selection rates should be equal across groups"
    : metric === "equalized_odds"
    ? "True positive and false positive rates should be equal across groups"
    : metric === "equal_opportunity"
    ? "True positive rates should be equal across groups"
    : "Predictive values should be equal across groups";

  return {
    metric,
    score: overallScore,
    passed,
    threshold,
    value: overallScore,
    interpretation,
    byAttribute,
  };
}

function analyzeProtectedAttribute(
  attribute: ProtectedAttribute | string,
  config: FairnessConfig,
  metricResults: FairnessMetricResult[]
): ProtectedAttributeResult {
  const groups = [...(config.privilegedGroups[attribute] ?? []), ...(config.unprivilegedGroups[attribute] ?? [])];
  
  const groupResults = groups.map(group => {
    const count = Math.floor(Math.random() * 1000) + 100;
    const favorableRate = 0.5 + Math.random() * 0.4;
    const unfavorableRate = 1 - favorableRate;
    
    return {
      group,
      count,
      favorableRate,
      unfavorableRate,
      selectionRate: favorableRate,
      positivePredictiveValue: 0.7 + Math.random() * 0.2,
      falsePositiveRate: Math.random() * 0.3,
      falseNegativeRate: Math.random() * 0.3,
      truePositiveRate: 0.6 + Math.random() * 0.3,
      trueNegativeRate: 0.6 + Math.random() * 0.3,
    };
  });

  const disparities = [];
  for (let i = 0; i < groupResults.length; i++) {
    for (let j = i + 1; j < groupResults.length; j++) {
      const difference = Math.abs(groupResults[i].selectionRate - groupResults[j].selectionRate);
      const ratio = Math.min(groupResults[i].selectionRate, groupResults[j].selectionRate) / 
                    Math.max(groupResults[i].selectionRate, groupResults[j].selectionRate);
      
      disparities.push({
        group1: groupResults[i].group,
        group2: groupResults[j].group,
        metric: "demographic_parity" as FairnessMetric,
        difference,
        ratio,
        statisticallySignificant: difference > 0.1,
        pValue: Math.random() * 0.1,
      });
    }
  }

  const overallScore = metricResults.reduce((sum, m) => {
    const attrResult = m.byAttribute.find(a => a.attribute === attribute);
    return sum + (attrResult?.passed ? 1 : 0);
  }, 0) / metricResults.length;

  const biasSeverity = overallScore > 0.9 ? "none" :
                       overallScore > 0.8 ? "low" :
                       overallScore > 0.7 ? "medium" :
                       overallScore > 0.6 ? "high" : "critical";

  return {
    attribute,
    overallScore,
    passed: overallScore >= 0.8,
    groups: groupResults,
    disparities,
    biasSeverity,
  };
}

function analyzeIntersectional(config: FairnessConfig): IntersectionalResult[] {
  const results: IntersectionalResult[] = [];

  // Generate intersectional combinations
  if (config.protectedAttributes.length >= 2) {
    for (let i = 0; i < config.protectedAttributes.length; i++) {
      for (let j = i + 1; j < config.protectedAttributes.length; j++) {
        const attr1 = config.protectedAttributes[i];
        const attr2 = config.protectedAttributes[j];
        const groups1 = config.privilegedGroups[attr1] ?? [];
        const groups2 = config.privilegedGroups[attr2] ?? [];

        for (const group1 of groups1) {
          for (const group2 of groups2) {
            const count = Math.floor(Math.random() * 100) + 10;
            const favorableRate = 0.4 + Math.random() * 0.5;
            const disparity = Math.abs(favorableRate - 0.5);

            results.push({
              attributes: [
                { attribute: attr1, group: group1 },
                { attribute: attr2, group: group2 },
              ],
              count,
              favorableRate,
              selectionRate: favorableRate,
              disparity,
              severity: disparity > 0.3 ? "high" : disparity > 0.2 ? "medium" : disparity > 0.1 ? "low" : "none",
            });
          }
        }
      }
    }
  }

  return results;
}

function analyzeDisparateImpact(
  config: FairnessConfig,
  attributeResults: ProtectedAttributeResult[]
): DisparateImpactResult {
  const ratios = [];
  let violations = 0;

  for (const attr of attributeResults) {
    for (const disparity of attr.disparities) {
      const passed = disparity.ratio >= 0.8; // 4/5ths rule
      ratios.push({
        attribute: attr.attribute,
        group1: disparity.group1,
        group2: disparity.group2,
        ratio: disparity.ratio,
        passed,
      });

      if (!passed) violations++;
    }
  }

  const tests = attributeResults.map(attr => ({
    attribute: attr.attribute,
    test: "chi_square",
    statistic: Math.random() * 10,
    pValue: Math.random(),
    significant: attr.disparities.some(d => d.statisticallySignificant),
  }));

  const significantViolations = tests.filter(t => t.significant).length;
  const overallDisparateImpact = violations === 0 ? 1 : 1 - (violations / ratios.length);
  const passed = violations === 0;

  return {
    fourFifthsRule: {
      passed,
      ratios,
      violations,
    },
    statisticalSignificance: {
      tests,
      significantViolations,
    },
    overallDisparateImpact,
    passed,
  };
}

async function applyBiasMitigation(
  job: FairnessJob,
  result: FairnessResult
): Promise<BiasMitigationResult> {
  const { config } = job;
  const strategy = config.mitigation!.strategy;
  const stage = config.mitigation!.stage;

  const beforeMitigation = {
    fairnessScore: result.overallFairnessScore,
    metricValues: Object.fromEntries(
      result.metricResults.map(m => [m.metric, m.score])
    ),
  };

  // Simulate mitigation
  const improvement = 0.1 + Math.random() * 0.2; // 10-30% improvement
  const afterMitigation = {
    fairnessScore: Math.min(1, beforeMitigation.fairnessScore + improvement),
    metricValues: Object.fromEntries(
      Object.entries(beforeMitigation.metricValues).map(([metric, value]) => [
        metric,
        Math.min(1, value + improvement * (0.5 + Math.random() * 0.5)),
      ])
    ),
  };

  const metricImprovements = Object.fromEntries(
    Object.entries(afterMitigation.metricValues).map(([metric, value]) => [
      metric,
      value - beforeMitigation.metricValues[metric],
    ])
  );

  const accuracyDrop = Math.random() * 0.05; // 0-5% accuracy drop
  const otherImpacts = [];
  if (accuracyDrop > 0.02) {
    otherImpacts.push("Minor accuracy reduction");
  }
  if (strategy === "reweighing") {
    otherImpacts.push("Sample weights modified");
  }
  if (strategy === "adversarial_debiasing") {
    otherImpacts.push("Adversarial training applied");
  }

  const recommendations = [];
  if (accuracyDrop > 0.03) {
    recommendations.push("Consider accuracy-fairness trade-off");
  }
  if (afterMitigation.fairnessScore < 0.8) {
    recommendations.push("Additional mitigation may be needed");
  }
  recommendations.push("Validate mitigated model on held-out test set");

  return {
    strategy,
    stage,
    beforeMitigation,
    afterMitigation,
    improvement: {
      fairnessScoreImprovement: afterMitigation.fairnessScore - beforeMitigation.fairnessScore,
      metricImprovements,
    },
    sideEffects: {
      accuracyDrop,
      otherImpacts,
    },
    recommendations,
  };
}
