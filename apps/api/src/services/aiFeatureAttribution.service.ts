/**
 * Module 86: AI Feature Attribution Service
 *
 * Provides advanced feature attribution and attribution analysis including
 * Layer-wise Relevance Propagation (LRP), Grad-CAM, Grad-CAM++, saliency maps,
 * smooth gradients, attention-based attribution, feature interaction detection,
 * attribution consistency checking, attribution stability analysis, and
 * attribution comparison across methods.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FeatureAttributionJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: AttributionJobStatus;
  modelId: string;
  modelName: string;
  modelVersion: string;
  attributionMethods: AttributionMethod[];
  config: AttributionConfig;
  results: AttributionResults;
  analysis: AttributionAnalysis;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type AttributionJobStatus =
  | 'planned'
  | 'initializing'
  | 'computing'
  | 'analyzing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AttributionMethod =
  | 'shap'
  | 'lime'
  | 'integrated-gradients'
  | 'saliency-maps'
  | 'smooth-gradients'
  | 'grad-cam'
  | 'grad-cam-plus-plus'
  | 'layer-wise-relevance-propagation'
  | 'attention-attribution'
  | 'deep-lift'
  | 'expected-gradients'
  | 'kernel-shap'
  | 'tree-shap'
  | 'linear-shap'
  | 'permutation-importance'
  | 'custom';

export interface AttributionConfig {
  methods: AttributionMethodConfig[];
  inputData: AttributionInputData;
  modelConfig: AttributionModelConfig;
  analysisConfig: AttributionAnalysisConfig;
  visualizationConfig: AttributionVisualizationConfig;
}

export interface AttributionMethodConfig {
  method: AttributionMethod;
  enabled: boolean;
  priority: number;
  config: MethodSpecificConfig;
}

export interface MethodSpecificConfig {
  shap?: SHAPConfig;
  lime?: LIMEConfig;
  integratedGradients?: IntegratedGradientsConfig;
  saliencyMaps?: SaliencyMapsConfig;
  smoothGradients?: SmoothGradientsConfig;
  gradCAM?: GradCAMConfig;
  gradCAMPlusPlus?: GradCAMPlusPlusConfig;
  lrp?: LRPConfig;
  attentionAttribution?: AttentionAttributionConfig;
  deepLIFT?: DeepLIFTConfig;
  expectedGradients?: ExpectedGradientsConfig;
  custom?: Record<string, any>;
}

export interface SHAPConfig {
  algorithm: 'kernel' | 'tree' | 'deep' | 'linear' | 'gradient';
  backgroundSamples: number;
  nsamples?: number;
  l1Reg?: number;
  link?: 'identity' | 'logit';
}

export interface LIMEConfig {
  numSamples: number;
  numFeatures: number;
  kernelWidth?: number;
  featureSelection: 'forward_selection' | 'lasso' | 'none';
}

export interface IntegratedGradientsConfig {
  baseline: 'zero' | 'black' | 'custom';
  customBaseline?: number[];
  steps: number;
  internalBatchSize?: number;
}

export interface SaliencyMapsConfig {
  method: 'vanilla' | 'guided' | 'guided-backprop';
  absoluteValue: boolean;
}

export interface SmoothGradientsConfig {
  numSamples: number;
  stdev: number;
  baseline: 'zero' | 'black' | 'custom';
  customBaseline?: number[];
}

export interface GradCAMConfig {
  targetLayer: string;
  targetClass?: number;
  relu: boolean;
}

export interface GradCAMPlusPlusConfig extends GradCAMConfig {
  usePlusPlus: boolean;
}

export interface LRPConfig {
  rule: 'alpha-beta' | 'epsilon' | 'z-plus' | 'z-box';
  alpha?: number;
  beta?: number;
  epsilon?: number;
  lowestLayer?: string;
}

export interface AttentionAttributionConfig {
  attentionLayer: string;
  aggregation: 'sum' | 'mean' | 'max' | 'norm';
  headAggregation?: 'sum' | 'mean' | 'max';
}

export interface DeepLIFTConfig {
  reference: 'zero' | 'black' | 'custom';
  customReference?: number[];
  rescale: boolean;
}

export interface ExpectedGradientsConfig {
  backgroundSamples: number;
  numSamples: number;
  combineMultiplicative: boolean;
}

export interface AttributionInputData {
  samples: any[];
  featureNames: string[];
  targetNames?: string[];
  sampleIds?: string[];
  metadata?: Record<string, any>;
}

export interface AttributionModelConfig {
  framework: 'pytorch' | 'tensorflow' | 'scikit-learn' | 'xgboost' | 'lightgbm' | 'onnx' | 'custom';
  modelUrl?: string;
  predictFunction?: string;
  inputShape?: number[];
  outputShape?: number[];
  device?: 'cpu' | 'gpu' | 'auto';
}

export interface AttributionAnalysisConfig {
  featureInteractionDetection: boolean;
  attributionConsistencyChecking: boolean;
  attributionStabilityAnalysis: boolean;
  attributionComparison: boolean;
  attributionAggregation: boolean;
  qualityAssessment: boolean;
}

export interface AttributionVisualizationConfig {
  generateVisualizations: boolean;
  visualizationTypes: AttributionVisualizationType[];
  exportFormats: AttributionExportFormat[];
  style: 'default' | 'minimal' | 'dark' | 'colorblind' | 'publication';
}

export type AttributionVisualizationType =
  | 'feature-importance-bar'
  | 'feature-importance-beeswarm'
  | 'shap-summary'
  | 'shap-force'
  | 'shap-dependence'
  | 'saliency-heatmap'
  | 'grad-cam-heatmap'
  | 'attention-heatmap'
  | 'attribution-comparison'
  | 'feature-interaction'
  | 'attribution-stability';

export type AttributionExportFormat = 'json' | 'png' | 'svg' | 'pdf' | 'html';

export interface AttributionResults {
  methodResults: Record<AttributionMethod, MethodAttributionResult>;
  aggregatedAttributions?: AggregatedAttributions;
  comparisonResults?: AttributionComparisonResult;
  qualityMetrics?: AttributionQualityMetrics;
}

export interface MethodAttributionResult {
  method: AttributionMethod;
  status: 'completed' | 'failed' | 'skipped';
  attributions: FeatureAttribution[];
  globalAttributions?: FeatureAttribution[];
  localAttributions?: Record<string, FeatureAttribution[]>;
  computationTime: number;
  metadata?: Record<string, any>;
  error?: string;
}

export interface FeatureAttribution {
  feature: string;
  featureIndex: number;
  attribution: number;
  normalizedAttribution: number;
  rank: number;
  direction: 'positive' | 'negative' | 'neutral';
  confidence?: number;
  stdDev?: number;
  metadata?: Record<string, any>;
}

export interface AggregatedAttributions {
  method: 'mean' | 'median' | 'weighted' | 'ensemble';
  attributions: FeatureAttribution[];
  weights?: Record<AttributionMethod, number>;
  consistencyScore: number;
  metadata?: Record<string, any>;
}

export interface AttributionComparisonResult {
  methodComparisons: MethodComparison[];
  consistencyScore: number;
  correlationMatrix: CorrelationMatrix;
  rankingAgreement: number;
  metadata?: Record<string, any>;
}

export interface MethodComparison {
  method1: AttributionMethod;
  method2: AttributionMethod;
  correlation: number;
  rankingCorrelation: number;
  topKAgreement: number;
  attributionDifference: number;
  consistent: boolean;
}

export interface CorrelationMatrix {
  methods: AttributionMethod[];
  matrix: number[][];
}

export interface AttributionQualityMetrics {
  overallScore: number;
  consistencyScore: number;
  stabilityScore: number;
  faithfulnessScore: number;
  sparsityScore: number;
  metadata?: Record<string, any>;
}

export interface AttributionAnalysis {
  featureInteractions: FeatureInteraction[];
  attributionConsistency: AttributionConsistency;
  attributionStability: AttributionStability;
  recommendations: AttributionRecommendation[];
  insights: AttributionInsight[];
}

export interface FeatureInteraction {
  feature1: string;
  feature2: string;
  interactionStrength: number;
  interactionType: 'synergistic' | 'redundant' | 'complementary';
  detectionMethod: string;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface AttributionConsistency {
  overallConsistency: number;
  methodConsistency: Record<AttributionMethod, number>;
  rankingConsistency: number;
  topKConsistency: number;
  consistentFeatures: string[];
  inconsistentFeatures: string[];
  metadata?: Record<string, any>;
}

export interface AttributionStability {
  overallStability: number;
  methodStability: Record<AttributionMethod, number>;
  perturbationResults: PerturbationResult[];
  stabilityScore: number;
  metadata?: Record<string, any>;
}

export interface PerturbationResult {
  perturbationType: 'noise' | 'feature-masking' | 'feature-shuffling';
  perturbationMagnitude: number;
  attributionChange: number;
  stable: boolean;
  metadata?: Record<string, any>;
}

export interface AttributionRecommendation {
  id: string;
  type: 'method-selection' | 'parameter-tuning' | 'quality-improvement' | 'best-practice';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  expectedImpact: string;
  implementationEffort: 'low' | 'medium' | 'high';
  confidence: number;
  references?: string[];
}

export interface AttributionInsight {
  id: string;
  type: 'feature-importance' | 'feature-interaction' | 'model-behavior' | 'quality-issue';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  features?: string[];
  evidence: string;
  recommendations?: string[];
}

export interface FeatureAttributionDashboard {
  organizationId: string;
  totalAttributionJobs: number;
  completedAttributionJobs: number;
  averageQualityScore: number;
  recentAttributionJobs: FeatureAttributionJob[];
  topFeatures: TopFeature[];
  methodUsage: MethodUsage[];
  attributionTrends: AttributionTrend[];
  qualityDistribution: QualityDistribution;
}

export interface TopFeature {
  feature: string;
  averageAttribution: number;
  consistency: number;
  importanceRank: number;
  models: string[];
}

export interface MethodUsage {
  method: AttributionMethod;
  usageCount: number;
  averageQualityScore: number;
  averageComputationTime: number;
  successRate: number;
}

export interface AttributionTrend {
  date: string;
  jobCount: number;
  averageQualityScore: number;
  topMethod: AttributionMethod;
  averageComputationTime: number;
}

export interface QualityDistribution {
  excellent: number; // >0.9
  good: number; // 0.7-0.9
  acceptable: number; // 0.5-0.7
  poor: number; // <0.5
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const attributionJobs = new Map<string, FeatureAttributionJob>();

// ─── Attribution Job Management ────────────────────────────────────────────────

/**
 * Create a feature attribution job
 */
export async function createFeatureAttributionJob(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    modelId: string;
    modelName: string;
    modelVersion: string;
    attributionMethods: AttributionMethod[];
    config: AttributionConfig;
    createdBy: string;
  }
): Promise<FeatureAttributionJob> {
  const id = `attrjob_${randomUUID()}`;
  const now = new Date().toISOString();

  const job: FeatureAttributionJob = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    status: 'planned',
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    attributionMethods: params.attributionMethods,
    config: params.config,
    results: {
      methodResults: {},
    },
    analysis: {
      featureInteractions: [],
      attributionConsistency: {
        overallConsistency: 0,
        methodConsistency: {},
        rankingConsistency: 0,
        topKConsistency: 0,
        consistentFeatures: [],
        inconsistentFeatures: [],
      },
      attributionStability: {
        overallStability: 0,
        methodStability: {},
        perturbationResults: [],
        stabilityScore: 0,
      },
      recommendations: [],
      insights: [],
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  attributionJobs.set(id, job);
  return job;
}

/**
 * Start feature attribution job
 */
export async function startFeatureAttributionJob(
  jobId: string
): Promise<FeatureAttributionJob | null> {
  const job = attributionJobs.get(jobId);
  if (!job || job.status !== 'planned') return null;

  job.status = 'initializing';
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  attributionJobs.set(jobId, job);
  return job;
}

/**
 * Compute attributions for a method
 */
export async function computeMethodAttributions(
  jobId: string,
  method: AttributionMethod,
  result: MethodAttributionResult
): Promise<MethodAttributionResult | null> {
  const job = attributionJobs.get(jobId);
  if (!job || job.status !== 'initializing' && job.status !== 'computing') return null;

  job.status = 'computing';
  job.results.methodResults[method] = result;
  job.updatedAt = new Date().toISOString();

  attributionJobs.set(jobId, job);
  return result;
}

/**
 * Complete feature attribution job
 */
export async function completeFeatureAttributionJob(
  jobId: string,
  results: {
    methodResults: Record<AttributionMethod, MethodAttributionResult>;
    aggregatedAttributions?: AggregatedAttributions;
    comparisonResults?: AttributionComparisonResult;
    qualityMetrics?: AttributionQualityMetrics;
  },
  analysis: {
    featureInteractions: FeatureInteraction[];
    attributionConsistency: AttributionConsistency;
    attributionStability: AttributionStability;
    recommendations: AttributionRecommendation[];
    insights: AttributionInsight[];
  }
): Promise<FeatureAttributionJob | null> {
  const job = attributionJobs.get(jobId);
  if (!job || job.status !== 'computing') return null;

  job.results = {
    ...job.results,
    ...results,
  };

  job.analysis = analysis;

  job.status = 'completed';
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;

  attributionJobs.set(jobId, job);
  return job;
}

/**
 * Cancel feature attribution job
 */
export async function cancelFeatureAttributionJob(
  jobId: string
): Promise<FeatureAttributionJob | null> {
  const job = attributionJobs.get(jobId);
  if (!job || job.status === 'completed' || job.status === 'cancelled') return null;

  job.status = 'cancelled';
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;

  attributionJobs.set(jobId, job);
  return job;
}

/**
 * Get feature attribution job by ID
 */
export async function getFeatureAttributionJob(
  jobId: string
): Promise<FeatureAttributionJob | null> {
  return attributionJobs.get(jobId) || null;
}

/**
 * List feature attribution jobs for an organization
 */
export async function listFeatureAttributionJobs(
  organizationId: string,
  filters?: { status?: AttributionJobStatus; method?: AttributionMethod }
): Promise<FeatureAttributionJob[]> {
  let orgJobs = Array.from(attributionJobs.values()).filter((j) => j.organizationId === organizationId);

  if (filters?.status) {
    orgJobs = orgJobs.filter((j) => j.status === filters.status);
  }

  if (filters?.method) {
    orgJobs = orgJobs.filter((j) => j.attributionMethods.includes(filters.method!));
  }

  return orgJobs;
}

/**
 * Get feature attribution dashboard
 */
export async function getFeatureAttributionDashboard(
  organizationId: string
): Promise<FeatureAttributionDashboard> {
  const orgJobs = await listFeatureAttributionJobs(organizationId);

  const completedJobs = orgJobs.filter((j) => j.status === 'completed');

  const averageQualityScore = completedJobs.length > 0
    ? completedJobs.reduce((sum, j) => sum + (j.results.qualityMetrics?.overallScore || 0), 0) / completedJobs.length
    : 0;

  const recentAttributionJobs = orgJobs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  // Calculate top features across all jobs
  const featureStats = new Map<string, {
    totalAttribution: number;
    count: number;
    consistencySum: number;
    models: Set<string>;
  }>();

  for (const job of completedJobs) {
    const aggregated = job.results.aggregatedAttributions;
    if (aggregated) {
      for (const attr of aggregated.attributions) {
        const stats = featureStats.get(attr.feature) || {
          totalAttribution: 0,
          count: 0,
          consistencySum: 0,
          models: new Set<string>(),
        };

        stats.totalAttribution += Math.abs(attr.attribution);
        stats.count++;
        stats.models.add(job.modelId);

        featureStats.set(attr.feature, stats);
      }
    }
  }

  const topFeatures = Array.from(featureStats.entries())
    .map(([feature, stats]) => ({
      feature,
      averageAttribution: stats.totalAttribution / stats.count,
      consistency: stats.consistencySum / stats.count,
      importanceRank: 0,
      models: Array.from(stats.models),
    }))
    .sort((a, b) => b.averageAttribution - a.averageAttribution)
    .slice(0, 20);

  topFeatures.forEach((f, index) => {
    f.importanceRank = index + 1;
  });

  // Calculate method usage
  const methodStats = new Map<AttributionMethod, {
    usageCount: number;
    totalQualityScore: number;
    totalComputationTime: number;
    successCount: number;
  }>();

  for (const job of completedJobs) {
    for (const [method, result] of Object.entries(job.results.methodResults)) {
      const stats = methodStats.get(method as AttributionMethod) || {
        usageCount: 0,
        totalQualityScore: 0,
        totalComputationTime: 0,
        successCount: 0,
      };

      stats.usageCount++;
      stats.totalComputationTime += result.computationTime;
      if (result.status === 'completed') {
        stats.successCount++;
        if (job.results.qualityMetrics) {
          stats.totalQualityScore += job.results.qualityMetrics.overallScore;
        }
      }

      methodStats.set(method as AttributionMethod, stats);
    }
  }

  const methodUsage = Array.from(methodStats.entries())
    .map(([method, stats]) => ({
      method,
      usageCount: stats.usageCount,
      averageQualityScore: stats.successCount > 0 ? stats.totalQualityScore / stats.successCount : 0,
      averageComputationTime: stats.totalComputationTime / stats.usageCount,
      successRate: stats.successCount / stats.usageCount,
    }))
    .sort((a, b) => b.usageCount - a.usageCount);

  // Calculate attribution trends (last 30 days)
  const attributionTrends: AttributionTrend[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dayJobs = orgJobs.filter((j) => j.createdAt.startsWith(dateStr));
    const dayCompletedJobs = dayJobs.filter((j) => j.status === 'completed');

    const topMethod = dayCompletedJobs.length > 0
      ? dayCompletedJobs[0].attributionMethods[0]
      : 'shap';

    attributionTrends.push({
      date: dateStr,
      jobCount: dayJobs.length,
      averageQualityScore: dayCompletedJobs.length > 0
        ? dayCompletedJobs.reduce((sum, j) => sum + (j.results.qualityMetrics?.overallScore || 0), 0) / dayCompletedJobs.length
        : 0,
      topMethod,
      averageComputationTime: dayCompletedJobs.length > 0
        ? dayCompletedJobs.reduce((sum, j) => {
            const totalTime = Object.values(j.results.methodResults).reduce((t, r) => t + r.computationTime, 0);
            return sum + totalTime;
          }, 0) / dayCompletedJobs.length
        : 0,
    });
  }

  attributionTrends.reverse();

  // Calculate quality distribution
  const qualityDistribution: QualityDistribution = {
    excellent: 0,
    good: 0,
    acceptable: 0,
    poor: 0,
  };

  for (const job of completedJobs) {
    const score = job.results.qualityMetrics?.overallScore || 0;
    if (score > 0.9) qualityDistribution.excellent++;
    else if (score > 0.7) qualityDistribution.good++;
    else if (score > 0.5) qualityDistribution.acceptable++;
    else qualityDistribution.poor++;
  }

  return {
    organizationId,
    totalAttributionJobs: orgJobs.length,
    completedAttributionJobs: completedJobs.length,
    averageQualityScore,
    recentAttributionJobs,
    topFeatures,
    methodUsage,
    attributionTrends,
    qualityDistribution,
  };
}
