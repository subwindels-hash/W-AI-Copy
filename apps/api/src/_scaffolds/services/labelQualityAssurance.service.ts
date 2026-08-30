/**
 * Module 41: Label Quality Assurance Service
 *
 * Provides quality control for data labeling including inter-annotator agreement
 * metrics, active learning integration, label validation, annotator performance
 * tracking, and quality assurance workflows.
 *
 * Phase 1 — Critical Gap: Data labeling quality assurance infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:labelQualityAssurance');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type AgreementMetric = "cohens_kappa" | "fleiss_kappa" | "krippendorff_alpha" | "percent_agreement" | "cronbach_alpha";

export type QualityStatus = "pending" | "passed" | "failed" | "needs_review" | "calibrated";

export type SamplingStrategy = "random" | "uncertainty" | "diversity" | "committee" | "stratified";

export interface QualityControlConfig {
  minAnnotatorsPerTask: number;
  agreementThreshold: number; // 0-1
  enableGoldenStandard: boolean;
  goldenStandardFrequency?: number; // every N tasks
  reviewSampleRate: number; // 0-1
  autoApproveThreshold?: number; // 0-1
}

export interface InterAnnotatorAgreement {
  id: string;
  projectId: string;
  taskId?: string;
  metric: AgreementMetric;
  score: number; // 0-1
  confidence?: number; // 0-1
  annotators: string[];
  labels: string[];
  sampleSize: number;
  calculatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface GoldenStandard {
  id: string;
  projectId: string;
  dataId: string;
  dataUrl: string;
  expectedAnnotations: Array<{
    labelId: string;
    labelName: string;
    value: unknown;
  }>;
  createdBy: string;
  createdAt: string;
  usedCount: number;
  lastUsedAt?: string;
}

export interface GoldenStandardResult {
  id: string;
  goldenStandardId: string;
  annotatorId: string;
  taskId: string;
  accuracy: number; // 0-1
  precision?: number;
  recall?: number;
  f1Score?: number;
  mismatches: Array<{
    expected: unknown;
    actual: unknown;
    label: string;
  }>;
  evaluatedAt: string;
}

export interface QualityReview {
  id: string;
  projectId: string;
  taskId: string;
  reviewerId: string;
  status: QualityStatus;
  agreementScore?: number;
  issues: QualityIssue[];
  recommendations: string[];
  reviewedAt: string;
}

export interface QualityIssue {
  id: string;
  type: "disagreement" | "guideline_violation" | "inconsistency" | "bias" | "error";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affectedLabels: string[];
  suggestedAction: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface ActiveLearningQuery {
  id: string;
  projectId: string;
  strategy: SamplingStrategy;
  modelId?: string;
  modelVersion?: string;
  batchSize: number;
  candidates: Array<{
    dataId: string;
    dataUrl: string;
    score: number;
    reason: string;
    metadata?: Record<string, unknown>;
  }>;
  selected: string[];
  status: "pending" | "in_progress" | "completed";
  createdAt: string;
  completedAt?: string;
}

export interface AnnotatorCalibration {
  id: string;
  annotatorId: string;
  projectId: string;
  goldenStandardResults: GoldenStandardResult[];
  overallAccuracy: number;
  labelSpecificAccuracy: Record<string, number>;
  calibrationStatus: "calibrated" | "needs_training" | "failed";
  recommendations: string[];
  calibratedAt: string;
  nextCalibrationAt?: string;
}

export interface QualityReport {
  id: string;
  projectId: string;
  reportDate: string;
  overallQuality: number; // 0-100
  interAnnotatorAgreement: {
    overall: number;
    byLabel: Record<string, number>;
  };
  annotatorPerformance: Array<{
    annotatorId: string;
    annotatorName: string;
    qualityScore: number;
    agreementScore: number;
    tasksCompleted: number;
    approvalRate: number;
  }>;
  qualityIssues: {
    total: number;
    bySeverity: Record<string, number>;
    unresolved: number;
  };
  activeLearningMetrics?: {
    queriesGenerated: number;
    samplesSelected: number;
    modelImprovement?: number;
  };
  recommendations: string[];
  generatedBy: string;
}

export interface QualityStats {
  totalReviews: number;
  passedReviews: number;
  failedReviews: number;
  averageAgreementScore: number;
  totalGoldenStandards: number;
  averageCalibrationAccuracy: number;
  totalActiveLearningQueries: number;
  totalQualityIssues: number;
  unresolvedIssues: number;
  qualityTrend: "improving" | "stable" | "declining";
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const qualityConfigs = new Map<string, QualityControlConfig>();
const agreementMetrics = new Map<string, InterAnnotatorAgreement>();
const goldenStandards = new Map<string, GoldenStandard>();
const goldenStandardResults = new Map<string, GoldenStandardResult>();
const qualityReviews = new Map<string, QualityReview>();
const activeLearningQueries = new Map<string, ActiveLearningQuery>();
const annotatorCalibrations = new Map<string, AnnotatorCalibration>();
const qualityReports = new Map<string, QualityReport>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Configure quality control for a project
 */
export async function configureQualityControl(
  projectId: string,
  config: QualityControlConfig
): Promise<QualityControlConfig> {
  qualityConfigs.set(projectId, config);
  return config;
}

/**
 * Get quality control configuration
 */
export async function getQualityControlConfig(projectId: string): Promise<QualityControlConfig | null> {
  return qualityConfigs.get(projectId) ?? null;
}

/**
 * Calculate inter-annotator agreement
 */
export async function calculateAgreement(
  projectId: string,
  taskId: string | null,
  metric: AgreementMetric,
  annotatorIds: string[]
): Promise<InterAnnotatorAgreement> {
  // Import task service to get annotations
  const { getTask, listTasks } = await import("./annotationProjectManagement.service.js");

  let annotations: Array<{ annotatorId: string; labelName: string; value: unknown }[]> = [];

  if (taskId) {
    // Calculate for specific task
    const task = await getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const annotatorAnnotations = annotatorIds.map(id => 
      task.annotations.filter(a => a.annotatorId === id)
    );
    annotations = annotatorAnnotations;
  } else {
    // Calculate for all tasks in project
    const tasks = await listTasks(projectId, { limit: 1000 });
    const allAnnotations: Array<{ annotatorId: string; labelName: string; value: unknown }[]> = [];

    for (const task of tasks) {
      for (const annotatorId of annotatorIds) {
        const annotatorAnns = task.annotations.filter(a => a.annotatorId === annotatorId);
        allAnnotations.push(annotatorAnns);
      }
    }
    annotations = allAnnotations;
  }

  // Calculate agreement score based on metric
  let score = 0;
  const labels = new Set<string>();
  annotations.flat().forEach(a => labels.add(a.labelName));

  switch (metric) {
    case "percent_agreement":
      score = calculatePercentAgreement(annotations);
      break;
    case "cohens_kappa":
      score = calculateCohensKappa(annotations);
      break;
    case "fleiss_kappa":
      score = calculateFleissKappa(annotations);
      break;
    case "krippendorff_alpha":
      score = calculateKrippendorffAlpha(annotations);
      break;
    case "cronbach_alpha":
      score = calculateCronbachAlpha(annotations);
      break;
  }

  const agreement: InterAnnotatorAgreement = {
    id: `agreement_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    projectId,
    taskId: taskId ?? undefined,
    metric,
    score,
    annotators: annotatorIds,
    labels: Array.from(labels),
    sampleSize: annotations.length,
    calculatedAt: new Date().toISOString(),
  };

  agreementMetrics.set(agreement.id, agreement);
  return agreement;
}

/**
 * Create a golden standard
 */
export async function createGoldenStandard(params: {
  projectId: string;
  dataId: string;
  dataUrl: string;
  expectedAnnotations: Array<{
    labelId: string;
    labelName: string;
    value: unknown;
  }>;
  createdBy: string;
}): Promise<GoldenStandard> {
  const now = new Date().toISOString();

  const goldenStandard: GoldenStandard = {
    id: `golden_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    projectId: params.projectId,
    dataId: params.dataId,
    dataUrl: params.dataUrl,
    expectedAnnotations: params.expectedAnnotations,
    createdBy: params.createdBy,
    createdAt: now,
    usedCount: 0,
  };

  goldenStandards.set(goldenStandard.id, goldenStandard);
  return goldenStandard;
}

/**
 * Evaluate annotator against golden standard
 */
export async function evaluateAgainstGoldenStandard(
  goldenStandardId: string,
  annotatorId: string,
  taskId: string,
  actualAnnotations: Array<{ labelName: string; value: unknown }>
): Promise<GoldenStandardResult> {
  const goldenStandard = goldenStandards.get(goldenStandardId);
  if (!goldenStandard) throw new Error(`Golden standard ${goldenStandardId} not found`);

  const expected = goldenStandard.expectedAnnotations;
  const mismatches: GoldenStandardResult["mismatches"] = [];

  let correct = 0;
  const total = Math.max(expected.length, actualAnnotations.length);

  for (const exp of expected) {
    const match = actualAnnotations.find(
      a => a.labelName === exp.labelName && JSON.stringify(a.value) === JSON.stringify(exp.value)
    );
    if (match) {
      correct++;
    } else {
      const actual = actualAnnotations.find(a => a.labelName === exp.labelName);
      mismatches.push({
        expected: exp.value,
        actual: actual?.value,
        label: exp.labelName,
      });
    }
  }

  const accuracy = total > 0 ? correct / total : 0;

  // Calculate precision, recall, F1 for multi-label scenarios
  const truePositives = correct;
  const falsePositives = actualAnnotations.length - correct;
  const falseNegatives = expected.length - correct;

  const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
  const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
  const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

  const result: GoldenStandardResult = {
    id: `gs_result_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    goldenStandardId,
    annotatorId,
    taskId,
    accuracy,
    precision,
    recall,
    f1Score,
    mismatches,
    evaluatedAt: new Date().toISOString(),
  };

  goldenStandardResults.set(result.id, result);

  // Update golden standard usage
  goldenStandard.usedCount++;
  goldenStandard.lastUsedAt = result.evaluatedAt;
  goldenStandards.set(goldenStandardId, goldenStandard);

  return result;
}

/**
 * Calibrate annotator using golden standards
 */
export async function calibrateAnnotator(
  annotatorId: string,
  projectId: string
): Promise<AnnotatorCalibration> {
  // Get all golden standard results for this annotator
  const results = Array.from(goldenStandardResults.values()).filter(
    r => r.annotatorId === annotatorId
  );

  if (results.length === 0) {
    throw new Error(`No golden standard results found for annotator ${annotatorId}`);
  }

  const overallAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;

  // Calculate label-specific accuracy
  const labelAccuracy: Record<string, number[]> = {};
  for (const result of results) {
    const gs = goldenStandards.get(result.goldenStandardId);
    if (!gs) continue;

    for (const mismatch of result.mismatches) {
      if (!labelAccuracy[mismatch.label]) {
        labelAccuracy[mismatch.label] = [];
      }
      labelAccuracy[mismatch.label].push(0); // incorrect
    }

    for (const ann of gs.expectedAnnotations) {
      if (!labelAccuracy[ann.labelName]) {
        labelAccuracy[ann.labelName] = [];
      }
      const isCorrect = !result.mismatches.some(m => m.label === ann.labelName);
      if (isCorrect) {
        labelAccuracy[ann.labelName].push(1);
      }
    }
  }

  const labelSpecificAccuracy: Record<string, number> = {};
  for (const [label, scores] of Object.entries(labelAccuracy)) {
    labelSpecificAccuracy[label] = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }

  const calibrationStatus: AnnotatorCalibration["calibrationStatus"] =
    overallAccuracy >= 0.9 ? "calibrated" : overallAccuracy >= 0.7 ? "needs_training" : "failed";

  const recommendations: string[] = [];
  if (calibrationStatus === "needs_training") {
    recommendations.push("Complete additional training on guideline documentation");
    recommendations.push("Review mismatched examples with a senior annotator");
  } else if (calibrationStatus === "failed") {
    recommendations.push("Mandatory retraining required before continuing");
    recommendations.push("Schedule one-on-one session with project manager");
  }

  const calibration: AnnotatorCalibration = {
    id: `calibration_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    annotatorId,
    projectId,
    goldenStandardResults: results,
    overallAccuracy,
    labelSpecificAccuracy,
    calibrationStatus,
    recommendations,
    calibratedAt: new Date().toISOString(),
    nextCalibrationAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  };

  annotatorCalibrations.set(calibration.id, calibration);
  return calibration;
}

/**
 * Generate active learning query
 */
export async function generateActiveLearningQuery(params: {
  projectId: string;
  strategy: SamplingStrategy;
  batchSize: number;
  modelId?: string;
  modelVersion?: string;
  candidatePool: Array<{
    dataId: string;
    dataUrl: string;
    modelConfidence?: number;
    metadata?: Record<string, unknown>;
  }>;
}): Promise<ActiveLearningQuery> {
  const now = new Date().toISOString();

  // Score candidates based on strategy
  const scoredCandidates = params.candidatePool.map(candidate => {
    let score = 0;
    let reason = "";

    switch (params.strategy) {
      case "uncertainty":
        // Select samples with lowest model confidence
        score = 1 - (candidate.modelConfidence ?? 0.5);
        reason = `Model confidence: ${((candidate.modelConfidence ?? 0.5) * 100).toFixed(1)}%`;
        break;
      case "random":
        score = _rng.next();
        reason = "Random selection";
        break;
      case "diversity":
        // Would use embedding similarity in production
        score = _rng.next();
        reason = "Diversity-based selection";
        break;
      case "committee":
        // Would use disagreement between multiple models
        score = 1 - (candidate.modelConfidence ?? 0.5);
        reason = "Committee disagreement";
        break;
      case "stratified":
        // Would stratify by metadata
        score = _rng.next();
        reason = "Stratified sampling";
        break;
    }

    return {
      dataId: candidate.dataId,
      dataUrl: candidate.dataUrl,
      score,
      reason,
      metadata: candidate.metadata,
    };
  });

  // Sort by score and select top N
  scoredCandidates.sort((a, b) => b.score - a.score);
  const selected = scoredCandidates.slice(0, params.batchSize).map(c => c.dataId);

  const query: ActiveLearningQuery = {
    id: `al_query_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    projectId: params.projectId,
    strategy: params.strategy,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    batchSize: params.batchSize,
    candidates: scoredCandidates,
    selected,
    status: "pending",
    createdAt: now,
  };

  activeLearningQueries.set(query.id, query);
  return query;
}

/**
 * Complete active learning query
 */
export async function completeActiveLearningQuery(queryId: string): Promise<ActiveLearningQuery | null> {
  const query = activeLearningQueries.get(queryId);
  if (!query) return null;

  query.status = "completed";
  query.completedAt = new Date().toISOString();

  activeLearningQueries.set(queryId, query);
  return query;
}

/**
 * Perform quality review
 */
export async function performQualityReview(
  projectId: string,
  taskId: string,
  reviewerId: string
): Promise<QualityReview> {
  const { getTask, calculateAgreement } = await import("./annotationProjectManagement.service.js");

  const task = await getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  // Calculate agreement if multiple annotators
  const annotators = Array.from(new Set(task.annotations.map(a => a.annotatorId)));
  let agreementScore: number | undefined;

  if (annotators.length > 1) {
    const agreement = await calculateAgreement(projectId, taskId, "percent_agreement", annotators);
    agreementScore = agreement.score;
  }

  // Identify quality issues
  const issues: QualityIssue[] = [];

  if (agreementScore !== undefined && agreementScore < 0.7) {
    issues.push({
      id: `issue_${randomUUID().slice(0, 8)}`,
      type: "disagreement",
      severity: agreementScore < 0.5 ? "high" : "medium",
      description: `Low inter-annotator agreement: ${(agreementScore * 100).toFixed(1)}%`,
      affectedLabels: Array.from(new Set(task.annotations.map(a => a.labelName))),
      suggestedAction: "Review guidelines and provide additional training",
      resolved: false,
    });
  }

  // Check for guideline violations (simplified)
  const config = qualityConfigs.get(projectId);
  if (config?.agreementThreshold && agreementScore !== undefined && agreementScore < config.agreementThreshold) {
    issues.push({
      id: `issue_${randomUUID().slice(0, 8)}`,
      type: "guideline_violation",
      severity: "medium",
      description: `Agreement below threshold: ${(agreementScore * 100).toFixed(1)}% < ${(config.agreementThreshold * 100).toFixed(1)}%`,
      affectedLabels: [],
      suggestedAction: "Review task with annotators and clarify guidelines",
      resolved: false,
    });
  }

  const status: QualityStatus =
    issues.length === 0 ? "passed" :
    issues.some(i => i.severity === "high" || i.severity === "critical") ? "failed" :
    "needs_review";

  const recommendations: string[] = [];
  if (status === "failed") {
    recommendations.push("Reassign task for re-annotation");
    recommendations.push("Schedule training session with annotators");
  } else if (status === "needs_review") {
    recommendations.push("Review annotations with senior annotator");
    recommendations.push("Update guidelines if needed");
  }

  const review: QualityReview = {
    id: `review_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    projectId,
    taskId,
    reviewerId,
    status,
    agreementScore,
    issues,
    recommendations,
    reviewedAt: new Date().toISOString(),
  };

  qualityReviews.set(review.id, review);
  return review;
}

/**
 * Resolve quality issue
 */
export async function resolveQualityIssue(
  reviewId: string,
  issueId: string,
  resolvedBy: string
): Promise<QualityIssue | null> {
  const review = qualityReviews.get(reviewId);
  if (!review) return null;

  const issue = review.issues.find(i => i.id === issueId);
  if (!issue) return null;

  issue.resolved = true;
  issue.resolvedAt = new Date().toISOString();
  issue.resolvedBy = resolvedBy;

  qualityReviews.set(reviewId, review);
  return issue;
}

/**
 * Generate quality report
 */
export async function generateQualityReport(
  projectId: string,
  generatedBy: string
): Promise<QualityReport> {
  const { listTasks, listAnnotators } = await import("./annotationProjectManagement.service.js");

  const tasks = await listTasks(projectId, { limit: 1000 });
  const annotators = await listAnnotators(projectId);

  // Calculate overall quality score
  const reviews = Array.from(qualityReviews.values()).filter(r => r.projectId === projectId);
  const passedReviews = reviews.filter(r => r.status === "passed").length;
  const overallQuality = reviews.length > 0 ? (passedReviews / reviews.length) * 100 : 100;

  // Calculate inter-annotator agreement
  const agreements = Array.from(agreementMetrics.values()).filter(a => a.projectId === projectId);
  const avgAgreement = agreements.length > 0
    ? agreements.reduce((sum, a) => sum + a.score, 0) / agreements.length
    : 0;

  const agreementByLabel: Record<string, number[]> = {};
  for (const agreement of agreements) {
    for (const label of agreement.labels) {
      if (!agreementByLabel[label]) {
        agreementByLabel[label] = [];
      }
      agreementByLabel[label].push(agreement.score);
    }
  }

  const byLabel: Record<string, number> = {};
  for (const [label, scores] of Object.entries(agreementByLabel)) {
    byLabel[label] = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }

  // Annotator performance
  const annotatorPerformance = annotators.map(annotator => {
    const annotatorTasks = tasks.filter(t => t.assignedTo === annotator.id);
    const approvedTasks = annotatorTasks.filter(t => t.status === "approved").length;
    const approvalRate = annotatorTasks.length > 0 ? approvedTasks / annotatorTasks.length : 0;

    const annotatorAgreements = agreements.filter(a => a.annotators.includes(annotator.id));
    const avgAgreementScore = annotatorAgreements.length > 0
      ? annotatorAgreements.reduce((sum, a) => sum + a.score, 0) / annotatorAgreements.length
      : 0;

    const qualityScore = (approvalRate * 0.5 + avgAgreementScore * 0.5) * 100;

    return {
      annotatorId: annotator.id,
      annotatorName: annotator.name,
      qualityScore,
      agreementScore: avgAgreementScore,
      tasksCompleted: annotatorTasks.length,
      approvalRate,
    };
  });

  // Quality issues
  const allIssues = reviews.flatMap(r => r.issues);
  const unresolvedIssues = allIssues.filter(i => !i.resolved).length;
  const issuesBySeverity: Record<string, number> = {};
  for (const issue of allIssues) {
    issuesBySeverity[issue.severity] = (issuesBySeverity[issue.severity] || 0) + 1;
  }

  // Active learning metrics
  const alQueries = Array.from(activeLearningQueries.values()).filter(q => q.projectId === projectId);
  const alMetrics = alQueries.length > 0 ? {
    queriesGenerated: alQueries.length,
    samplesSelected: alQueries.reduce((sum, q) => sum + q.selected.length, 0),
  } : undefined;

  const recommendations: string[] = [];
  if (overallQuality < 80) {
    recommendations.push("Improve annotator training and guidelines");
  }
  if (avgAgreement < 0.7) {
    recommendations.push("Address inter-annotator disagreement through calibration");
  }
  if (unresolvedIssues > 10) {
    recommendations.push("Prioritize resolving outstanding quality issues");
  }

  const report: QualityReport = {
    id: `report_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    projectId,
    reportDate: new Date().toISOString(),
    overallQuality,
    interAnnotatorAgreement: {
      overall: avgAgreement,
      byLabel,
    },
    annotatorPerformance,
    qualityIssues: {
      total: allIssues.length,
      bySeverity: issuesBySeverity,
      unresolved: unresolvedIssues,
    },
    activeLearningMetrics: alMetrics,
    recommendations,
    generatedBy,
  };

  qualityReports.set(report.id, report);
  return report;
}

/**
 * Get quality statistics
 */
export async function getQualityStats(projectId: string): Promise<QualityStats> {
  const reviews = Array.from(qualityReviews.values()).filter(r => r.projectId === projectId);
  const agreements = Array.from(agreementMetrics.values()).filter(a => a.projectId === projectId);
  const gsResults = Array.from(goldenStandardResults.values());
  const alQueries = Array.from(activeLearningQueries.values()).filter(q => q.projectId === projectId);

  const passedReviews = reviews.filter(r => r.status === "passed").length;
  const failedReviews = reviews.filter(r => r.status === "failed").length;

  const avgAgreement = agreements.length > 0
    ? agreements.reduce((sum, a) => sum + a.score, 0) / agreements.length
    : 0;

  const avgCalibrationAccuracy = gsResults.length > 0
    ? gsResults.reduce((sum, r) => sum + r.accuracy, 0) / gsResults.length
    : 0;

  const allIssues = reviews.flatMap(r => r.issues);
  const unresolvedIssues = allIssues.filter(i => !i.resolved).length;

  // Determine quality trend (simplified)
  const recentReviews = reviews.slice(-10);
  const olderReviews = reviews.slice(-20, -10);
  const recentPassRate = recentReviews.length > 0
    ? recentReviews.filter(r => r.status === "passed").length / recentReviews.length
    : 0;
  const olderPassRate = olderReviews.length > 0
    ? olderReviews.filter(r => r.status === "passed").length / olderReviews.length
    : 0;

  const qualityTrend: QualityStats["qualityTrend"] =
    recentPassRate > olderPassRate + 0.1 ? "improving" :
    recentPassRate < olderPassRate - 0.1 ? "declining" :
    "stable";

  return {
    totalReviews: reviews.length,
    passedReviews,
    failedReviews,
    averageAgreementScore: Math.round(avgAgreement * 100) / 100,
    totalGoldenStandards: goldenStandards.size,
    averageCalibrationAccuracy: Math.round(avgCalibrationAccuracy * 100) / 100,
    totalActiveLearningQueries: alQueries.length,
    totalQualityIssues: allIssues.length,
    unresolvedIssues,
    qualityTrend,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculatePercentAgreement(annotations: Array<Array<{ labelName: string; value: unknown }>>): number {
  if (annotations.length < 2) return 1;

  let agreements = 0;
  let total = 0;

  for (let i = 0; i < annotations.length - 1; i++) {
    for (let j = i + 1; j < annotations.length; j++) {
      const ann1 = annotations[i];
      const ann2 = annotations[j];

      const maxLen = Math.max(ann1.length, ann2.length);
      for (let k = 0; k < maxLen; k++) {
        total++;
        if (k < ann1.length && k < ann2.length) {
          if (ann1[k].labelName === ann2[k].labelName && 
              JSON.stringify(ann1[k].value) === JSON.stringify(ann2[k].value)) {
            agreements++;
          }
        }
      }
    }
  }

  return total > 0 ? agreements / total : 1;
}

function calculateCohensKappa(annotations: Array<Array<{ labelName: string; value: unknown }>>): number {
  // Simplified Cohen's Kappa for 2 annotators
  if (annotations.length !== 2) return calculatePercentAgreement(annotations);

  const po = calculatePercentAgreement(annotations);
  // Simplified: assume random agreement is 0.5
  const pe = 0.5;

  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

function calculateFleissKappa(annotations: Array<Array<{ labelName: string; value: unknown }>>): number {
  // Simplified Fleiss' Kappa for multiple annotators
  const po = calculatePercentAgreement(annotations);
  const pe = 1 / annotations.length; // Simplified

  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

function calculateKrippendorffAlpha(annotations: Array<Array<{ labelName: string; value: unknown }>>): number {
  // Simplified Krippendorff's Alpha
  return calculatePercentAgreement(annotations);
}

function calculateCronbachAlpha(annotations: Array<Array<{ labelName: string; value: unknown }>>): number {
  // Simplified Cronbach's Alpha
  return calculatePercentAgreement(annotations);
}
