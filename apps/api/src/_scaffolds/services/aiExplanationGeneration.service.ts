/**
 * Module 86: AI Explanation Generation Service
 *
 * Provides comprehensive explanation generation and management including
 * natural language explanation generation, audience-specific explanations,
 * explanation quality assessment and scoring, explanation comparison and selection,
 * explanation caching and versioning, explanation API and serving, explanation
 * lifecycle management, explanation approval workflows, and explanation feedback.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ExplanationGenerationJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: ExplanationJobStatus;
  modelId: string;
  modelName: string;
  modelVersion: string;
  explanationType: ExplanationType;
  targetAudience: TargetAudience;
  config: ExplanationGenerationConfig;
  result: ExplanationGenerationResult;
  quality: ExplanationQualityAssessment;
  metadata: ExplanationMetadata;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type ExplanationJobStatus =
  | 'planned'
  | 'generating'
  | 'reviewing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ExplanationType =
  | 'global'
  | 'local'
  | 'cohort'
  | 'counterfactual'
  | 'feature-importance'
  | 'decision-rules'
  | 'natural-language'
  | 'visual'
  | 'interactive';

export type TargetAudience =
  | 'technical'
  | 'business'
  | 'executive'
  | 'layperson'
  | 'regulator'
  | 'custom';

export interface ExplanationGenerationConfig {
  explanationMethods: ExplanationMethodConfig[];
  naturalLanguageConfig?: NaturalLanguageConfig;
  visualizationConfig?: ExplanationVisualizationConfig;
  qualityConfig: ExplanationQualityConfig;
  cachingConfig: ExplanationCachingConfig;
  servingConfig?: ExplanationServingConfig;
  approvalConfig?: ExplanationApprovalConfig;
}

export interface ExplanationMethodConfig {
  method: string;
  enabled: boolean;
  priority: number;
  config: Record<string, any>;
}

export interface NaturalLanguageConfig {
  enabled: boolean;
  language: string;
  detailLevel: 'minimal' | 'standard' | 'detailed';
  technicalDepth: 'low' | 'medium' | 'high';
  includeExamples: boolean;
  includeVisualizations: boolean;
  customTemplates?: Record<string, string>;
}

export interface ExplanationVisualizationConfig {
  enabled: boolean;
  visualizationTypes: string[];
  exportFormats: string[];
  interactive: boolean;
  style: 'default' | 'minimal' | 'dark' | 'colorblind' | 'publication';
}

export interface ExplanationQualityConfig {
  enabled: boolean;
  metrics: QualityMetric[];
  thresholds: QualityThresholds;
  automatedAssessment: boolean;
  humanReview: boolean;
}

export interface QualityMetric {
  name: string;
  type: 'faithfulness' | 'completeness' | 'consistency' | 'clarity' | 'actionability';
  weight: number;
  threshold?: number;
}

export interface QualityThresholds {
  minimumOverallScore: number;
  minimumFaithfulness: number;
  minimumCompleteness: number;
  minimumConsistency: number;
  minimumClarity: number;
}

export interface ExplanationCachingConfig {
  enabled: boolean;
  ttl: number; // seconds
  maxSize: number; // MB
  cacheKey: 'model-instance' | 'model-dataset' | 'custom';
  invalidationStrategy: 'ttl' | 'manual' | 'model-update';
}

export interface ExplanationServingConfig {
  enabled: boolean;
  endpoint: string;
  authentication: boolean;
  rateLimit: number; // requests per minute
  timeout: number; // seconds
  versioning: boolean;
  abTesting: boolean;
}

export interface ExplanationApprovalConfig {
  enabled: boolean;
  requiredFor: TargetAudience[];
  approvers: string[];
  approvalThreshold: number;
  escalationEnabled: boolean;
  escalationApprovers?: string[];
}

export interface ExplanationGenerationResult {
  explanations: GeneratedExplanation[];
  naturalLanguageExplanations?: NaturalLanguageExplanation[];
  visualizations?: ExplanationVisualization[];
  qualityAssessment: ExplanationQualityAssessment;
  recommendations: ExplanationRecommendation[];
  metadata?: Record<string, any>;
}

export interface GeneratedExplanation {
  id: string;
  type: ExplanationType;
  method: string;
  scope: 'global' | 'local' | 'cohort';
  result: Record<string, any>;
  qualityScore: number;
  computationTime: number;
  metadata?: Record<string, any>;
}

export interface NaturalLanguageExplanation {
  id: string;
  audience: TargetAudience;
  language: string;
  summary: string;
  detailedExplanation: string;
  keyFindings: string[];
  examples?: string[];
  visualizations?: string[];
  confidence: number;
  readabilityScore: number;
  metadata?: Record<string, any>;
}

export interface ExplanationVisualization {
  id: string;
  type: string;
  title: string;
  description?: string;
  data: Record<string, any>;
  format: string;
  url?: string;
  interactive: boolean;
  metadata?: Record<string, any>;
}

export interface ExplanationQualityAssessment {
  overallScore: number;
  metrics: QualityMetricResult[];
  faithfulnessScore: number;
  completenessScore: number;
  consistencyScore: number;
  clarityScore: number;
  actionabilityScore: number;
  humanReviewResults?: HumanReviewResult[];
  recommendations: string[];
  metadata?: Record<string, any>;
}

export interface QualityMetricResult {
  metric: string;
  score: number;
  weight: number;
  weightedScore: number;
  threshold?: number;
  passed: boolean;
  details?: string;
}

export interface HumanReviewResult {
  reviewerId: string;
  reviewerName: string;
  reviewDate: string;
  overallScore: number;
  feedback: string;
  approved: boolean;
  suggestions?: string[];
}

export interface ExplanationRecommendation {
  id: string;
  type: 'improvement' | 'best-practice' | 'optimization' | 'quality-enhancement';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  expectedImpact: string;
  implementationEffort: 'low' | 'medium' | 'high';
  confidence: number;
  references?: string[];
}

export interface ExplanationMetadata {
  modelId: string;
  modelName: string;
  modelVersion: string;
  explanationVersion: string;
  generatedAt: string;
  expiresAt?: string;
  cachedAt?: string;
  cacheKey?: string;
  tags?: string[];
  customMetadata?: Record<string, any>;
}

export interface ExplanationCache {
  id: string;
  cacheKey: string;
  modelId: string;
  modelVersion: string;
  explanationType: ExplanationType;
  targetAudience: TargetAudience;
  result: ExplanationGenerationResult;
  qualityScore: number;
  cachedAt: string;
  expiresAt: string;
  hitCount: number;
  lastAccessedAt: string;
  metadata?: Record<string, any>;
}

export interface ExplanationApproval {
  id: string;
  explanationId: string;
  reviewerId: string;
  reviewerName: string;
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
  reviewDate?: string;
  feedback?: string;
  approvedAt?: string;
  escalatedAt?: string;
  escalatedTo?: string;
  metadata?: Record<string, any>;
}

export interface ExplanationFeedback {
  id: string;
  explanationId: string;
  userId: string;
  userName: string;
  rating: number; // 1-5
  feedback: string;
  helpfulness: 'very-helpful' | 'helpful' | 'neutral' | 'not-helpful';
  suggestions?: string[];
  submittedAt: string;
  metadata?: Record<string, any>;
}

export interface ExplanationServing {
  id: string;
  explanationId: string;
  endpoint: string;
  version: string;
  status: 'active' | 'inactive' | 'deprecated';
  trafficSplit: number; // percentage
  abTestGroup?: string;
  metrics: ServingMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface ServingMetrics {
  totalRequests: number;
  averageLatency: number;
  successRate: number;
  cacheHitRate: number;
  averageRating: number;
  feedbackCount: number;
  metadata?: Record<string, any>;
}

export interface ExplanationLifecycle {
  id: string;
  explanationId: string;
  modelId: string;
  modelVersion: string;
  explanationVersion: string;
  status: 'draft' | 'reviewing' | 'approved' | 'published' | 'deprecated' | 'archived';
  versions: ExplanationVersion[];
  approvals: ExplanationApproval[];
  feedback: ExplanationFeedback[];
  servingHistory: ExplanationServing[];
  createdAt: string;
  updatedAt: string;
}

export interface ExplanationVersion {
  version: string;
  result: ExplanationGenerationResult;
  qualityScore: number;
  createdAt: string;
  createdBy: string;
  changelog?: string;
  metadata?: Record<string, any>;
}

export interface ExplanationGenerationDashboard {
  organizationId: string;
  totalExplanations: number;
  activeExplanations: number;
  cachedExplanations: number;
  averageQualityScore: number;
  recentExplanations: ExplanationGenerationJob[];
  topModels: TopModel[];
  audienceDistribution: AudienceDistribution;
  explanationTrends: ExplanationTrend[];
  qualityDistribution: QualityDistribution;
  servingMetrics: OverallServingMetrics;
}

export interface TopModel {
  modelId: string;
  modelName: string;
  explanationCount: number;
  averageQualityScore: number;
  topAudience: TargetAudience;
}

export interface AudienceDistribution {
  technical: number;
  business: number;
  executive: number;
  layperson: number;
  regulator: number;
  custom: number;
}

export interface ExplanationTrend {
  date: string;
  explanationCount: number;
  averageQualityScore: number;
  cacheHitRate: number;
  averageRating: number;
}

export interface QualityDistribution {
  excellent: number; // >0.9
  good: number; // 0.7-0.9
  acceptable: number; // 0.5-0.7
  poor: number; // <0.5
}

export interface OverallServingMetrics {
  totalRequests: number;
  averageLatency: number;
  successRate: number;
  cacheHitRate: number;
  averageRating: number;
  totalFeedback: number;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const explanationJobs = new Map<string, ExplanationGenerationJob>();
const explanationCache = new Map<string, ExplanationCache>();
const explanationApprovals = new Map<string, ExplanationApproval[]>();
const explanationFeedback = new Map<string, ExplanationFeedback[]>();
const explanationLifecycle = new Map<string, ExplanationLifecycle>();

// ─── Explanation Generation Management ─────────────────────────────────────────

/**
 * Create an explanation generation job
 */
export async function createExplanationGenerationJob(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    modelId: string;
    modelName: string;
    modelVersion: string;
    explanationType: ExplanationType;
    targetAudience: TargetAudience;
    config: ExplanationGenerationConfig;
    createdBy: string;
  }
): Promise<ExplanationGenerationJob> {
  const id = `expjob_${randomUUID()}`;
  const now = new Date().toISOString();

  const job: ExplanationGenerationJob = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    status: 'planned',
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    explanationType: params.explanationType,
    targetAudience: params.targetAudience,
    config: params.config,
    result: {
      explanations: [],
      qualityAssessment: {
        overallScore: 0,
        metrics: [],
        faithfulnessScore: 0,
        completenessScore: 0,
        consistencyScore: 0,
        clarityScore: 0,
        actionabilityScore: 0,
        recommendations: [],
      },
      metadata: {
        modelId: params.modelId,
        modelName: params.modelName,
        modelVersion: params.modelVersion,
        explanationVersion: '1.0',
        generatedAt: now,
      },
    },
    quality: {
      overallScore: 0,
      metrics: [],
      faithfulnessScore: 0,
      completenessScore: 0,
      consistencyScore: 0,
      clarityScore: 0,
      actionabilityScore: 0,
      recommendations: [],
    },
    metadata: {
      modelId: params.modelId,
      modelName: params.modelName,
      modelVersion: params.modelVersion,
      explanationVersion: '1.0',
      generatedAt: now,
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  explanationJobs.set(id, job);

  // Create lifecycle entry
  const lifecycle: ExplanationLifecycle = {
    id: `lifecycle_${randomUUID()}`,
    explanationId: id,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    explanationVersion: '1.0',
    status: 'draft',
    versions: [],
    approvals: [],
    feedback: [],
    servingHistory: [],
    createdAt: now,
    updatedAt: now,
  };

  explanationLifecycle.set(id, lifecycle);
  explanationApprovals.set(id, []);
  explanationFeedback.set(id, []);

  return job;
}

/**
 * Start explanation generation job
 */
export async function startExplanationGenerationJob(
  jobId: string
): Promise<ExplanationGenerationJob | null> {
  const job = explanationJobs.get(jobId);
  if (!job || job.status !== 'planned') return null;

  job.status = 'generating';
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  explanationJobs.set(jobId, job);
  return job;
}

/**
 * Complete explanation generation job
 */
export async function completeExplanationGenerationJob(
  jobId: string,
  result: {
    explanations: GeneratedExplanation[];
    naturalLanguageExplanations?: NaturalLanguageExplanation[];
    visualizations?: ExplanationVisualization[];
    qualityAssessment: ExplanationQualityAssessment;
    recommendations: ExplanationRecommendation[];
  }
): Promise<ExplanationGenerationJob | null> {
  const job = explanationJobs.get(jobId);
  if (!job || job.status !== 'generating') return null;

  job.result = {
    ...job.result,
    ...result,
  };

  job.quality = result.qualityAssessment;

  // Check if approval is required
  if (job.config.approvalConfig?.enabled) {
    const requiresApproval = job.config.approvalConfig.requiredFor.includes(job.targetAudience);
    if (requiresApproval) {
      job.status = 'reviewing';
    } else {
      job.status = 'completed';
    }
  } else {
    job.status = 'completed';
  }

  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;

  // Update lifecycle
  const lifecycle = explanationLifecycle.get(jobId);
  if (lifecycle) {
    lifecycle.status = job.status === 'reviewing' ? 'reviewing' : 'approved';
    lifecycle.versions.push({
      version: '1.0',
      result: job.result,
      qualityScore: job.quality.overallScore,
      createdAt: job.completedAt,
      createdBy: job.createdBy,
    });
    lifecycle.updatedAt = job.completedAt;
    explanationLifecycle.set(jobId, lifecycle);
  }

  // Cache explanation if enabled
  if (job.config.cachingConfig.enabled) {
    const cacheKey = generateCacheKey(job);
    const cache: ExplanationCache = {
      id: `cache_${randomUUID()}`,
      cacheKey,
      modelId: job.modelId,
      modelVersion: job.modelVersion,
      explanationType: job.explanationType,
      targetAudience: job.targetAudience,
      result: job.result,
      qualityScore: job.quality.overallScore,
      cachedAt: job.completedAt,
      expiresAt: new Date(Date.now() + job.config.cachingConfig.ttl * 1000).toISOString(),
      hitCount: 0,
      lastAccessedAt: job.completedAt,
    };

    explanationCache.set(cacheKey, cache);
    job.metadata.cachedAt = cache.cachedAt;
    job.metadata.cacheKey = cacheKey;
  }

  explanationJobs.set(jobId, job);
  return job;
}

/**
 * Approve explanation
 */
export async function approveExplanation(
  jobId: string,
  reviewerId: string,
  reviewerName: string,
  feedback?: string
): Promise<ExplanationApproval | null> {
  const job = explanationJobs.get(jobId);
  if (!job || job.status !== 'reviewing') return null;

  const approval: ExplanationApproval = {
    id: `approval_${randomUUID()}`,
    explanationId: jobId,
    reviewerId,
    reviewerName,
    status: 'approved',
    reviewDate: new Date().toISOString(),
    feedback,
    approvedAt: new Date().toISOString(),
  };

  const approvals = explanationApprovals.get(jobId) || [];
  approvals.push(approval);
  explanationApprovals.set(jobId, approvals);

  // Check if all approvals are complete
  const requiredApprovals = job.config.approvalConfig?.approvers.length || 0;
  if (approvals.length >= requiredApprovals) {
    job.status = 'completed';
    job.completedAt = approval.approvedAt;
    job.updatedAt = approval.approvedAt;

    // Update lifecycle
    const lifecycle = explanationLifecycle.get(jobId);
    if (lifecycle) {
      lifecycle.status = 'approved';
      lifecycle.approvals = approvals;
      lifecycle.updatedAt = approval.approvedAt;
      explanationLifecycle.set(jobId, lifecycle);
    }
  }

  explanationJobs.set(jobId, job);
  return approval;
}

/**
 * Reject explanation
 */
export async function rejectExplanation(
  jobId: string,
  reviewerId: string,
  reviewerName: string,
  feedback: string
): Promise<ExplanationApproval | null> {
  const job = explanationJobs.get(jobId);
  if (!job || job.status !== 'reviewing') return null;

  const approval: ExplanationApproval = {
    id: `approval_${randomUUID()}`,
    explanationId: jobId,
    reviewerId,
    reviewerName,
    status: 'rejected',
    reviewDate: new Date().toISOString(),
    feedback,
  };

  const approvals = explanationApprovals.get(jobId) || [];
  approvals.push(approval);
  explanationApprovals.set(jobId, approvals);

  job.status = 'failed';
  job.updatedAt = new Date().toISOString();

  // Update lifecycle
  const lifecycle = explanationLifecycle.get(jobId);
  if (lifecycle) {
    lifecycle.status = 'draft';
    lifecycle.approvals = approvals;
    lifecycle.updatedAt = job.updatedAt;
    explanationLifecycle.set(jobId, lifecycle);
  }

  explanationJobs.set(jobId, job);
  return approval;
}

/**
 * Submit explanation feedback
 */
export async function submitExplanationFeedback(
  jobId: string,
  userId: string,
  userName: string,
  rating: number,
  feedback: string,
  helpfulness: ExplanationFeedback['helpfulness'],
  suggestions?: string[]
): Promise<ExplanationFeedback | null> {
  const job = explanationJobs.get(jobId);
  if (!job || job.status !== 'completed') return null;

  const feedbackEntry: ExplanationFeedback = {
    id: `feedback_${randomUUID()}`,
    explanationId: jobId,
    userId,
    userName,
    rating,
    feedback,
    helpfulness,
    suggestions,
    submittedAt: new Date().toISOString(),
  };

  const feedbackList = explanationFeedback.get(jobId) || [];
  feedbackList.push(feedbackEntry);
  explanationFeedback.set(jobId, feedbackList);

  // Update lifecycle
  const lifecycle = explanationLifecycle.get(jobId);
  if (lifecycle) {
    lifecycle.feedback = feedbackList;
    lifecycle.updatedAt = feedbackEntry.submittedAt;
    explanationLifecycle.set(jobId, lifecycle);
  }

  return feedbackEntry;
}

/**
 * Publish explanation
 */
export async function publishExplanation(
  jobId: string,
  endpoint: string,
  trafficSplit: number = 100,
  abTestGroup?: string
): Promise<ExplanationServing | null> {
  const job = explanationJobs.get(jobId);
  if (!job || job.status !== 'completed') return null;

  const serving: ExplanationServing = {
    id: `serving_${randomUUID()}`,
    explanationId: jobId,
    endpoint,
    version: job.metadata.explanationVersion,
    status: 'active',
    trafficSplit,
    abTestGroup,
    metrics: {
      totalRequests: 0,
      averageLatency: 0,
      successRate: 100,
      cacheHitRate: 0,
      averageRating: 0,
      feedbackCount: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Update lifecycle
  const lifecycle = explanationLifecycle.get(jobId);
  if (lifecycle) {
    lifecycle.status = 'published';
    lifecycle.servingHistory.push(serving);
    lifecycle.updatedAt = serving.createdAt;
    explanationLifecycle.set(jobId, lifecycle);
  }

  return serving;
}

/**
 * Get explanation from cache
 */
export async function getExplanationFromCache(
  modelId: string,
  modelVersion: string,
  explanationType: ExplanationType,
  targetAudience: TargetAudience
): Promise<ExplanationCache | null> {
  const cacheKey = `${modelId}:${modelVersion}:${explanationType}:${targetAudience}`;
  const cache = explanationCache.get(cacheKey);

  if (cache) {
    // Check if cache is expired
    if (new Date(cache.expiresAt) < new Date()) {
      explanationCache.delete(cacheKey);
      return null;
    }

    // Update cache stats
    cache.hitCount++;
    cache.lastAccessedAt = new Date().toISOString();
    explanationCache.set(cacheKey, cache);

    return cache;
  }

  return null;
}

/**
 * Cancel explanation generation job
 */
export async function cancelExplanationGenerationJob(
  jobId: string
): Promise<ExplanationGenerationJob | null> {
  const job = explanationJobs.get(jobId);
  if (!job || job.status === 'completed' || job.status === 'cancelled') return null;

  job.status = 'cancelled';
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;

  explanationJobs.set(jobId, job);
  return job;
}

/**
 * Get explanation generation job by ID
 */
export async function getExplanationGenerationJob(
  jobId: string
): Promise<ExplanationGenerationJob | null> {
  return explanationJobs.get(jobId) || null;
}

/**
 * List explanation generation jobs for an organization
 */
export async function listExplanationGenerationJobs(
  organizationId: string,
  filters?: { status?: ExplanationJobStatus; audience?: TargetAudience }
): Promise<ExplanationGenerationJob[]> {
  let orgJobs = Array.from(explanationJobs.values()).filter((j) => j.organizationId === organizationId);

  if (filters?.status) {
    orgJobs = orgJobs.filter((j) => j.status === filters.status);
  }

  if (filters?.audience) {
    orgJobs = orgJobs.filter((j) => j.targetAudience === filters.audience);
  }

  return orgJobs;
}

/**
 * Get explanation generation dashboard
 */
export async function getExplanationGenerationDashboard(
  organizationId: string
): Promise<ExplanationGenerationDashboard> {
  const orgJobs = await listExplanationGenerationJobs(organizationId);

  const activeExplanations = orgJobs.filter((j) => j.status === 'completed').length;
  const cachedExplanations = Array.from(explanationCache.values()).filter(
    (c) => orgJobs.some((j) => j.modelId === c.modelId)
  ).length;

  const averageQualityScore = orgJobs.length > 0
    ? orgJobs.reduce((sum, j) => sum + j.quality.overallScore, 0) / orgJobs.length
    : 0;

  const recentExplanations = orgJobs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  // Calculate top models
  const modelStats = new Map<string, {
    modelName: string;
    explanationCount: number;
    totalQualityScore: number;
    audienceCounts: Record<TargetAudience, number>;
  }>();

  for (const job of orgJobs) {
    const stats = modelStats.get(job.modelId) || {
      modelName: job.modelName,
      explanationCount: 0,
      totalQualityScore: 0,
      audienceCounts: {
        technical: 0,
        business: 0,
        executive: 0,
        layperson: 0,
        regulator: 0,
        custom: 0,
      },
    };

    stats.explanationCount++;
    stats.totalQualityScore += job.quality.overallScore;
    stats.audienceCounts[job.targetAudience]++;

    modelStats.set(job.modelId, stats);
  }

  const topModels = Array.from(modelStats.entries())
    .map(([modelId, stats]) => {
      const topAudience = Object.entries(stats.audienceCounts)
        .sort((a, b) => b[1] - a[1])[0][0] as TargetAudience;

      return {
        modelId,
        modelName: stats.modelName,
        explanationCount: stats.explanationCount,
        averageQualityScore: stats.totalQualityScore / stats.explanationCount,
        topAudience,
      };
    })
    .sort((a, b) => b.explanationCount - a.explanationCount)
    .slice(0, 10);

  // Calculate audience distribution
  const audienceDistribution: AudienceDistribution = {
    technical: 0,
    business: 0,
    executive: 0,
    layperson: 0,
    regulator: 0,
    custom: 0,
  };

  for (const job of orgJobs) {
    audienceDistribution[job.targetAudience]++;
  }

  // Calculate explanation trends (last 30 days)
  const explanationTrends: ExplanationTrend[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dayJobs = orgJobs.filter((j) => j.createdAt.startsWith(dateStr));
    const dayCompletedJobs = dayJobs.filter((j) => j.status === 'completed');

    explanationTrends.push({
      date: dateStr,
      explanationCount: dayJobs.length,
      averageQualityScore: dayCompletedJobs.length > 0
        ? dayCompletedJobs.reduce((sum, j) => sum + j.quality.overallScore, 0) / dayCompletedJobs.length
        : 0,
      cacheHitRate: 0, // Would calculate from cache stats
      averageRating: 0, // Would calculate from feedback
    });
  }

  explanationTrends.reverse();

  // Calculate quality distribution
  const qualityDistribution: QualityDistribution = {
    excellent: 0,
    good: 0,
    acceptable: 0,
    poor: 0,
  };

  for (const job of orgJobs) {
    const score = job.quality.overallScore;
    if (score > 0.9) qualityDistribution.excellent++;
    else if (score > 0.7) qualityDistribution.good++;
    else if (score > 0.5) qualityDistribution.acceptable++;
    else qualityDistribution.poor++;
  }

  // Calculate overall serving metrics
  const allFeedback = Array.from(explanationFeedback.values()).flat();
  const overallServingMetrics: OverallServingMetrics = {
    totalRequests: 0, // Would calculate from serving metrics
    averageLatency: 0,
    successRate: 100,
    cacheHitRate: 0,
    averageRating: allFeedback.length > 0
      ? allFeedback.reduce((sum, f) => sum + f.rating, 0) / allFeedback.length
      : 0,
    totalFeedback: allFeedback.length,
  };

  return {
    organizationId,
    totalExplanations: orgJobs.length,
    activeExplanations,
    cachedExplanations,
    averageQualityScore,
    recentExplanations,
    topModels,
    audienceDistribution,
    explanationTrends,
    qualityDistribution,
    servingMetrics: overallServingMetrics,
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function generateCacheKey(job: ExplanationGenerationJob): string {
  return `${job.modelId}:${job.modelVersion}:${job.explanationType}:${job.targetAudience}`;
}
