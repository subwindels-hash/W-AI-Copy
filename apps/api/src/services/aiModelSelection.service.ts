/**
 * Module 81: AI Model Selection Service
 *
 * Provides intelligent model selection including task-based model selection,
 * multi-criteria decision making, cost-performance tradeoff analysis,
 * constraint-based selection, model recommendation engine, and selection
 * analytics for optimal model selection.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ModelSelectionRequest {
  id: string;
  organizationId: string;
  taskType: TaskType;
  taskRequirements: TaskRequirements;
  constraints: SelectionConstraints;
  preferences: SelectionPreferences;
  context: SelectionContext;
  timestamp: string;
}

export type TaskType =
  | 'text-generation'
  | 'text-classification'
  | 'text-summarization'
  | 'translation'
  | 'question-answering'
  | 'code-generation'
  | 'image-generation'
  | 'image-classification'
  | 'speech-to-text'
  | 'text-to-speech'
  | 'embedding'
  | 'custom';

export interface TaskRequirements {
  inputModality: Modality[];
  outputModality: Modality[];
  requiredCapabilities: string[];
  minContextWindow?: number;
  maxLatencyMs?: number;
  minQualityScore?: number;
  expectedInputTokens?: number;
  expectedOutputTokens?: number;
  expectedRequestsPerMinute?: number;
  dataSensitivity?: 'low' | 'medium' | 'high' | 'critical';
  complianceRequirements?: string[];
}

export type Modality = 'text' | 'image' | 'audio' | 'video' | 'code' | 'structured-data';

export interface SelectionConstraints {
  maxCostPerRequest?: number;
  maxCostPerMonth?: number;
  maxLatencyMs?: number;
  minAvailability?: number;
  requiredProviders?: string[];
  excludedProviders?: string[];
  requiredRegions?: string[];
  excludedRegions?: string[];
  maxModels?: number;
  hardConstraints: boolean;
}

export interface SelectionPreferences {
  prioritizeCost: boolean;
  prioritizePerformance: boolean;
  prioritizeQuality: boolean;
  prioritizeLatency: boolean;
  weights: PreferenceWeights;
  tradeoffStrategy: TradeoffStrategy;
}

export interface PreferenceWeights {
  cost: number; // 0-1
  performance: number; // 0-1
  quality: number; // 0-1
  latency: number; // 0-1
  availability: number; // 0-1
}

export type TradeoffStrategy =
  | 'weighted-sum'
  | 'lexicographic'
  | 'pareto-optimal'
  | 'constraint-satisfaction'
  | 'custom';

export interface SelectionContext {
  userId?: string;
  sessionId?: string;
  portfolioId?: string;
  previousSelections?: string[];
  feedback?: SelectionFeedback[];
  metadata?: Record<string, any>;
}

export interface SelectionFeedback {
  modelId: string;
  rating: number; // 1-5
  comments?: string;
  timestamp: string;
}

export interface ModelSelectionResult {
  id: string;
  requestId: string;
  selectedModels: SelectedModel[];
  recommendation: ModelRecommendation;
  reasoning: SelectionReasoning;
  alternatives: AlternativeModel[];
  confidence: number;
  timestamp: string;
}

export interface SelectedModel {
  modelId: string;
  modelName: string;
  provider: string;
  version: string;
  score: number;
  rank: number;
  trafficAllocation: number; // percentage
  reasoning: string;
  metrics: ModelMetrics;
  cost: ModelCostEstimate;
}

export interface ModelMetrics {
  avgLatencyMs: number;
  p95LatencyMs: number;
  throughputPerSecond: number;
  qualityScore: number;
  availability: number;
  errorRate: number;
}

export interface ModelCostEstimate {
  costPerRequest: number;
  costPer1kTokens: number;
  estimatedMonthlyCost: number;
  costBreakdown: {
    inputCost: number;
    outputCost: number;
    infrastructureCost: number;
  };
}

export interface ModelRecommendation {
  type: 'single' | 'ensemble' | 'fallback-chain' | 'load-balanced';
  primaryModel: SelectedModel;
  secondaryModels?: SelectedModel[];
  fallbackModels?: SelectedModel[];
  routingStrategy: RoutingStrategy;
  expectedPerformance: ExpectedPerformance;
  expectedCost: ExpectedCost;
  risks: SelectionRisk[];
  mitigationStrategies: string[];
}

export type RoutingStrategy =
  | 'primary-only'
  | 'weighted-routing'
  | 'latency-based'
  | 'cost-based'
  | 'quality-based'
  | 'fallback-chain'
  | 'load-balanced';

export interface ExpectedPerformance {
  avgLatencyMs: number;
  p95LatencyMs: number;
  throughputPerSecond: number;
  qualityScore: number;
  availability: number;
  confidence: number;
}

export interface ExpectedCost {
  costPerRequest: number;
  estimatedMonthlyCost: number;
  costRange: {
    min: number;
    max: number;
  };
  costOptimizationOpportunities: string[];
}

export interface SelectionRisk {
  type: 'latency' | 'cost' | 'quality' | 'availability' | 'compliance' | 'provider';
  severity: 'low' | 'medium' | 'high';
  probability: number;
  impact: string;
  mitigation: string;
}

export interface SelectionReasoning {
  decisionCriteria: DecisionCriterion[];
  tradeoffs: Tradeoff[];
  constraints: ConstraintSatisfaction[];
  keyFactors: string[];
  explanation: string;
}

export interface DecisionCriterion {
  criterion: string;
  weight: number;
  score: number;
  weightedScore: number;
  explanation: string;
}

export interface Tradeoff {
  criterion1: string;
  criterion2: string;
  tradeoff: string;
  impact: string;
}

export interface ConstraintSatisfaction {
  constraint: string;
  required: any;
  actual: any;
  satisfied: boolean;
  margin: number;
}

export interface AlternativeModel {
  modelId: string;
  modelName: string;
  provider: string;
  score: number;
  rank: number;
  reasonNotSelected: string;
  tradeoffs: string[];
  metrics: ModelMetrics;
  cost: ModelCostEstimate;
}

export interface SelectionHistory {
  id: string;
  organizationId: string;
  request: ModelSelectionRequest;
  result: ModelSelectionResult;
  outcome?: SelectionOutcome;
  timestamp: string;
}

export interface SelectionOutcome {
  usedModel: string;
  actualLatencyMs: number;
  actualQualityScore: number;
  actualCost: number;
  userSatisfaction?: number;
  feedback?: string;
  timestamp: string;
}

export interface SelectionAnalytics {
  organizationId: string;
  totalSelections: number;
  successfulSelections: number;
  averageConfidence: number;
  topSelectedModels: Array<{
    modelId: string;
    modelName: string;
    selectionCount: number;
    avgScore: number;
    successRate: number;
  }>;
  selectionByTaskType: Record<TaskType, number>;
  averageSelectionTime: number;
  costOptimization: {
    totalPotentialSavings: number;
    avgCostPerSelection: number;
    costReductionPercentage: number;
  };
  performanceOptimization: {
    avgLatencyReduction: number;
    avgQualityImprovement: number;
    throughputImprovement: number;
  };
  recentSelections: SelectionHistory[];
}

export interface SelectionDashboard {
  organizationId: string;
  totalSelections: number;
  successfulSelections: number;
  averageConfidence: number;
  topModels: Array<{
    modelId: string;
    modelName: string;
    selectionCount: number;
    successRate: number;
  }>;
  selectionByTaskType: Record<TaskType, number>;
  recentSelections: SelectionHistory[];
  costSavings: number;
  performanceImprovements: number;
  selectionTrends: Array<{
    date: string;
    selections: number;
    avgConfidence: number;
    avgCost: number;
  }>;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const selectionHistory = new Map<string, SelectionHistory[]>();
const modelCatalog = new Map<string, ModelInfo[]>();

interface ModelInfo {
  modelId: string;
  modelName: string;
  provider: string;
  version: string;
  capabilities: string[];
  modalities: Modality[];
  contextWindow: number;
  metrics: ModelMetrics;
  cost: ModelCostEstimate;
  regions: string[];
  compliance: string[];
  availability: number;
}

// ─── Model Selection ───────────────────────────────────────────────────────────

/**
 * Create a model selection request
 */
export async function createModelSelectionRequest(
  organizationId: string,
  params: {
    taskType: TaskType;
    taskRequirements: TaskRequirements;
    constraints?: Partial<SelectionConstraints>;
    preferences?: Partial<SelectionPreferences>;
    context?: Partial<SelectionContext>;
  }
): Promise<ModelSelectionRequest> {
  const id = `req_${randomUUID()}`;
  const now = new Date().toISOString();

  const request: ModelSelectionRequest = {
    id,
    organizationId,
    taskType: params.taskType,
    taskRequirements: params.taskRequirements,
    constraints: {
      maxCostPerRequest: params.constraints?.maxCostPerRequest,
      maxCostPerMonth: params.constraints?.maxCostPerMonth,
      maxLatencyMs: params.constraints?.maxLatencyMs,
      minAvailability: params.constraints?.minAvailability || 0.95,
      requiredProviders: params.constraints?.requiredProviders || [],
      excludedProviders: params.constraints?.excludedProviders || [],
      requiredRegions: params.constraints?.requiredRegions || [],
      excludedRegions: params.constraints?.excludedRegions || [],
      maxModels: params.constraints?.maxModels || 5,
      hardConstraints: params.constraints?.hardConstraints ?? true,
    },
    preferences: {
      prioritizeCost: params.preferences?.prioritizeCost ?? false,
      prioritizePerformance: params.preferences?.prioritizePerformance ?? false,
      prioritizeQuality: params.preferences?.prioritizeQuality ?? true,
      prioritizeLatency: params.preferences?.prioritizeLatency ?? false,
      weights: params.preferences?.weights || {
        cost: 0.2,
        performance: 0.3,
        quality: 0.3,
        latency: 0.1,
        availability: 0.1,
      },
      tradeoffStrategy: params.preferences?.tradeoffStrategy || 'weighted-sum',
    },
    context: {
      userId: params.context?.userId,
      sessionId: params.context?.sessionId,
      portfolioId: params.context?.portfolioId,
      previousSelections: params.context?.previousSelections || [],
      feedback: params.context?.feedback || [],
      metadata: params.context?.metadata,
    },
    timestamp: now,
  };

  return request;
}

/**
 * Select models based on request
 */
export async function selectModels(
  request: ModelSelectionRequest
): Promise<ModelSelectionResult> {
  const resultId = `result_${randomUUID()}`;
  const now = new Date().toISOString();

  // Get available models
  const availableModels = await getAvailableModels(request);

  // Score and rank models
  const scoredModels = await scoreModels(availableModels, request);

  // Apply selection strategy
  const selectedModels = await applySelectionStrategy(scoredModels, request);

  // Generate recommendation
  const recommendation = await generateRecommendation(selectedModels, request);

  // Generate reasoning
  const reasoning = await generateReasoning(selectedModels, request);

  // Generate alternatives
  const alternatives = await generateAlternatives(scoredModels, selectedModels, request);

  // Calculate confidence
  const confidence = calculateConfidence(selectedModels, request);

  const result: ModelSelectionResult = {
    id: resultId,
    requestId: request.id,
    selectedModels,
    recommendation,
    reasoning,
    alternatives,
    confidence,
    timestamp: now,
  };

  // Store in history
  const history: SelectionHistory = {
    id: `hist_${randomUUID()}`,
    organizationId: request.organizationId,
    request,
    result,
    timestamp: now,
  };

  const orgHistory = selectionHistory.get(request.organizationId) || [];
  orgHistory.push(history);
  selectionHistory.set(request.organizationId, orgHistory);

  return result;
}

/**
 * Record selection outcome
 */
export async function recordSelectionOutcome(
  organizationId: string,
  selectionId: string,
  outcome: Omit<SelectionOutcome, 'timestamp'>
): Promise<boolean> {
  const orgHistory = selectionHistory.get(organizationId) || [];
  const history = orgHistory.find((h) => h.result.id === selectionId);

  if (!history) return false;

  history.outcome = {
    ...outcome,
    timestamp: new Date().toISOString(),
  };

  selectionHistory.set(organizationId, orgHistory);
  return true;
}

/**
 * Get selection analytics
 */
export async function getSelectionAnalytics(organizationId: string): Promise<SelectionAnalytics> {
  const orgHistory = selectionHistory.get(organizationId) || [];

  const totalSelections = orgHistory.length;
  const successfulSelections = orgHistory.filter((h) => h.outcome && h.outcome.userSatisfaction && h.outcome.userSatisfaction >= 4).length;
  const averageConfidence = orgHistory.length > 0
    ? orgHistory.reduce((sum, h) => sum + h.result.confidence, 0) / orgHistory.length
    : 0;

  const modelCounts = new Map<string, { modelName: string; count: number; totalScore: number; successCount: number }>();
  const selectionByTaskType: Record<string, number> = {};

  for (const history of orgHistory) {
    const primaryModel = history.result.selectedModels[0];
    if (primaryModel) {
      const current = modelCounts.get(primaryModel.modelId) || {
        modelName: primaryModel.modelName,
        count: 0,
        totalScore: 0,
        successCount: 0,
      };
      current.count++;
      current.totalScore += primaryModel.score;
      if (history.outcome?.userSatisfaction && history.outcome.userSatisfaction >= 4) {
        current.successCount++;
      }
      modelCounts.set(primaryModel.modelId, current);
    }

    selectionByTaskType[history.request.taskType] = (selectionByTaskType[history.request.taskType] || 0) + 1;
  }

  const topSelectedModels = Array.from(modelCounts.entries())
    .map(([modelId, data]) => ({
      modelId,
      modelName: data.modelName,
      selectionCount: data.count,
      avgScore: data.count > 0 ? data.totalScore / data.count : 0,
      successRate: data.count > 0 ? (data.successCount / data.count) * 100 : 0,
    }))
    .sort((a, b) => b.selectionCount - a.selectionCount)
    .slice(0, 10);

  const recentSelections = orgHistory
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);

  return {
    organizationId,
    totalSelections,
    successfulSelections,
    averageConfidence,
    topSelectedModels,
    selectionByTaskType: selectionByTaskType as Record<TaskType, number>,
    averageSelectionTime: 0, // Would be calculated from actual selection time
    costOptimization: {
      totalPotentialSavings: 0,
      avgCostPerSelection: 0,
      costReductionPercentage: 0,
    },
    performanceOptimization: {
      avgLatencyReduction: 0,
      avgQualityImprovement: 0,
      throughputImprovement: 0,
    },
    recentSelections,
  };
}

/**
 * Get selection dashboard
 */
export async function getSelectionDashboard(organizationId: string): Promise<SelectionDashboard> {
  const analytics = await getSelectionAnalytics(organizationId);

  const selectionTrends: Array<{
    date: string;
    selections: number;
    avgConfidence: number;
    avgCost: number;
  }> = [];

  // Generate trends for last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const daySelections = analytics.recentSelections.filter((h) => h.timestamp.startsWith(dateStr));
    const avgConfidence = daySelections.length > 0
      ? daySelections.reduce((sum, h) => sum + h.result.confidence, 0) / daySelections.length
      : 0;
    const avgCost = daySelections.length > 0
      ? daySelections.reduce((sum, h) => sum + (h.result.recommendation.expectedCost.costPerRequest || 0), 0) / daySelections.length
      : 0;

    selectionTrends.push({
      date: dateStr,
      selections: daySelections.length,
      avgConfidence,
      avgCost,
    });
  }

  return {
    organizationId,
    totalSelections: analytics.totalSelections,
    successfulSelections: analytics.successfulSelections,
    averageConfidence: analytics.averageConfidence,
    topModels: analytics.topSelectedModels.map((m) => ({
      modelId: m.modelId,
      modelName: m.modelName,
      selectionCount: m.selectionCount,
      successRate: m.successRate,
    })),
    selectionByTaskType: analytics.selectionByTaskType,
    recentSelections: analytics.recentSelections.slice(0, 10),
    costSavings: analytics.costOptimization.totalPotentialSavings,
    performanceImprovements: analytics.performanceOptimization.avgQualityImprovement,
    selectionTrends,
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

async function getAvailableModels(request: ModelSelectionRequest): Promise<ModelInfo[]> {
  // In production, this would fetch from model registry
  // For now, return mock data
  const models: ModelInfo[] = [
    {
      modelId: 'gpt-4',
      modelName: 'GPT-4',
      provider: 'openai',
      version: 'latest',
      capabilities: ['text-generation', 'question-answering', 'code-generation'],
      modalities: ['text', 'code'],
      contextWindow: 128000,
      metrics: {
        avgLatencyMs: 1500,
        p95LatencyMs: 2500,
        throughputPerSecond: 10,
        qualityScore: 0.95,
        availability: 0.99,
        errorRate: 0.01,
      },
      cost: {
        costPerRequest: 0.03,
        costPer1kTokens: 0.06,
        estimatedMonthlyCost: 1000,
        costBreakdown: { inputCost: 0.01, outputCost: 0.02, infrastructureCost: 0 },
      },
      regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
      compliance: ['SOC2', 'GDPR'],
      availability: 0.99,
    },
    {
      modelId: 'claude-3-opus',
      modelName: 'Claude 3 Opus',
      provider: 'anthropic',
      version: 'latest',
      capabilities: ['text-generation', 'question-answering', 'text-summarization'],
      modalities: ['text'],
      contextWindow: 200000,
      metrics: {
        avgLatencyMs: 1200,
        p95LatencyMs: 2000,
        throughputPerSecond: 12,
        qualityScore: 0.93,
        availability: 0.98,
        errorRate: 0.02,
      },
      cost: {
        costPerRequest: 0.025,
        costPer1kTokens: 0.05,
        estimatedMonthlyCost: 800,
        costBreakdown: { inputCost: 0.008, outputCost: 0.017, infrastructureCost: 0 },
      },
      regions: ['us-east-1', 'us-west-2'],
      compliance: ['SOC2', 'GDPR'],
      availability: 0.98,
    },
    {
      modelId: 'gemini-pro',
      modelName: 'Gemini Pro',
      provider: 'google',
      version: 'latest',
      capabilities: ['text-generation', 'question-answering', 'translation'],
      modalities: ['text', 'image'],
      contextWindow: 100000,
      metrics: {
        avgLatencyMs: 800,
        p95LatencyMs: 1500,
        throughputPerSecond: 15,
        qualityScore: 0.90,
        availability: 0.99,
        errorRate: 0.01,
      },
      cost: {
        costPerRequest: 0.015,
        costPer1kTokens: 0.03,
        estimatedMonthlyCost: 500,
        costBreakdown: { inputCost: 0.005, outputCost: 0.01, infrastructureCost: 0 },
      },
      regions: ['us-central1', 'europe-west1', 'asia-east1'],
      compliance: ['SOC2', 'GDPR', 'HIPAA'],
      availability: 0.99,
    },
  ];

  // Filter based on constraints
  let filtered = models;

  if (request.constraints.excludedProviders.length > 0) {
    filtered = filtered.filter((m) => !request.constraints.excludedProviders.includes(m.provider));
  }

  if (request.constraints.requiredProviders.length > 0) {
    filtered = filtered.filter((m) => request.constraints.requiredProviders.includes(m.provider));
  }

  if (request.taskRequirements.maxLatencyMs) {
    filtered = filtered.filter((m) => m.metrics.avgLatencyMs <= request.taskRequirements.maxLatencyMs!);
  }

  if (request.taskRequirements.minContextWindow) {
    filtered = filtered.filter((m) => m.contextWindow >= request.taskRequirements.minContextWindow!);
  }

  if (request.taskRequirements.requiredCapabilities.length > 0) {
    filtered = filtered.filter((m) =>
      request.taskRequirements.requiredCapabilities.every((cap) => m.capabilities.includes(cap))
    );
  }

  return filtered;
}

async function scoreModels(
  models: ModelInfo[],
  request: ModelSelectionRequest
): Promise<Array<ModelInfo & { score: number; breakdown: Record<string, number> }>> {
  const scored = models.map((model) => {
    const breakdown: Record<string, number> = {};

    // Cost score (lower is better, so invert)
    const maxCost = Math.max(...models.map((m) => m.cost.costPerRequest));
    breakdown.cost = maxCost > 0 ? (1 - model.cost.costPerRequest / maxCost) * 100 : 100;

    // Performance score
    const maxThroughput = Math.max(...models.map((m) => m.metrics.throughputPerSecond));
    breakdown.performance = maxThroughput > 0 ? (model.metrics.throughputPerSecond / maxThroughput) * 100 : 0;

    // Quality score
    breakdown.quality = model.metrics.qualityScore * 100;

    // Latency score (lower is better, so invert)
    const maxLatency = Math.max(...models.map((m) => m.metrics.avgLatencyMs));
    breakdown.latency = maxLatency > 0 ? (1 - model.metrics.avgLatencyMs / maxLatency) * 100 : 100;

    // Availability score
    breakdown.availability = model.availability * 100;

    // Calculate weighted score
    const weights = request.preferences.weights;
    const score =
      breakdown.cost * weights.cost +
      breakdown.performance * weights.performance +
      breakdown.quality * weights.quality +
      breakdown.latency * weights.latency +
      breakdown.availability * weights.availability;

    return { ...model, score, breakdown };
  });

  return scored.sort((a, b) => b.score - a.score);
}

async function applySelectionStrategy(
  scoredModels: Array<ModelInfo & { score: number; breakdown: Record<string, number> }>,
  request: ModelSelectionRequest
): Promise<SelectedModel[]> {
  const maxModels = request.constraints.maxModels;
  const selected: SelectedModel[] = [];

  for (let i = 0; i < Math.min(maxModels, scoredModels.length); i++) {
    const model = scoredModels[i];
    selected.push({
      modelId: model.modelId,
      modelName: model.modelName,
      provider: model.provider,
      version: model.version,
      score: model.score,
      rank: i + 1,
      trafficAllocation: i === 0 ? 70 : 30 / (maxModels - 1),
      reasoning: `Ranked #${i + 1} with score ${model.score.toFixed(2)}`,
      metrics: model.metrics,
      cost: model.cost,
    });
  }

  // Normalize traffic allocation
  const totalAllocation = selected.reduce((sum, m) => sum + m.trafficAllocation, 0);
  if (totalAllocation > 0) {
    for (const model of selected) {
      model.trafficAllocation = (model.trafficAllocation / totalAllocation) * 100;
    }
  }

  return selected;
}

async function generateRecommendation(
  selectedModels: SelectedModel[],
  request: ModelSelectionRequest
): Promise<ModelRecommendation> {
  const primaryModel = selectedModels[0];
  const secondaryModels = selectedModels.slice(1);

  const type: ModelRecommendation['type'] = selectedModels.length === 1
    ? 'single'
    : selectedModels.length === 2
    ? 'fallback-chain'
    : 'ensemble';

  const routingStrategy: RoutingStrategy = selectedModels.length === 1
    ? 'primary-only'
    : selectedModels.length === 2
    ? 'fallback-chain'
    : 'weighted-routing';

  const expectedPerformance: ExpectedPerformance = {
    avgLatencyMs: primaryModel.metrics.avgLatencyMs,
    p95LatencyMs: primaryModel.metrics.p95LatencyMs,
    throughputPerSecond: primaryModel.metrics.throughputPerSecond,
    qualityScore: primaryModel.metrics.qualityScore,
    availability: primaryModel.metrics.availability,
    confidence: 0.85,
  };

  const expectedCost: ExpectedCost = {
    costPerRequest: primaryModel.cost.costPerRequest,
    estimatedMonthlyCost: primaryModel.cost.estimatedMonthlyCost,
    costRange: {
      min: primaryModel.cost.costPerRequest * 0.8,
      max: primaryModel.cost.costPerRequest * 1.2,
    },
    costOptimizationOpportunities: [
      'Consider caching for repeated requests',
      'Use batch processing for bulk operations',
    ],
  };

  const risks: SelectionRisk[] = [
    {
      type: 'latency',
      severity: 'medium',
      probability: 0.2,
      impact: 'Latency may exceed SLA during peak load',
      mitigation: 'Implement request queuing and timeout handling',
    },
  ];

  const mitigationStrategies = [
    'Monitor latency and error rates',
    'Implement circuit breaker pattern',
    'Set up alerts for SLA violations',
  ];

  return {
    type,
    primaryModel,
    secondaryModels,
    routingStrategy,
    expectedPerformance,
    expectedCost,
    risks,
    mitigationStrategies,
  };
}

async function generateReasoning(
  selectedModels: SelectedModel[],
  request: ModelSelectionRequest
): Promise<SelectionReasoning> {
  const primaryModel = selectedModels[0];

  const decisionCriteria: DecisionCriterion[] = [
    {
      criterion: 'Quality',
      weight: request.preferences.weights.quality,
      score: primaryModel.metrics.qualityScore * 100,
      weightedScore: primaryModel.metrics.qualityScore * 100 * request.preferences.weights.quality,
      explanation: `Quality score of ${(primaryModel.metrics.qualityScore * 100).toFixed(1)}%`,
    },
    {
      criterion: 'Performance',
      weight: request.preferences.weights.performance,
      score: primaryModel.metrics.throughputPerSecond,
      weightedScore: primaryModel.metrics.throughputPerSecond * request.preferences.weights.performance,
      explanation: `Throughput of ${primaryModel.metrics.throughputPerSecond} req/s`,
    },
    {
      criterion: 'Cost',
      weight: request.preferences.weights.cost,
      score: 100 - (primaryModel.cost.costPerRequest / 0.03) * 100,
      weightedScore: (100 - (primaryModel.cost.costPerRequest / 0.03) * 100) * request.preferences.weights.cost,
      explanation: `Cost of $${primaryModel.cost.costPerRequest.toFixed(4)} per request`,
    },
  ];

  const tradeoffs: Tradeoff[] = [
    {
      criterion1: 'Quality',
      criterion2: 'Cost',
      tradeoff: 'Higher quality models tend to be more expensive',
      impact: 'Selected model balances quality and cost based on preferences',
    },
  ];

  const constraints: ConstraintSatisfaction[] = [];

  if (request.constraints.maxCostPerRequest) {
    constraints.push({
      constraint: 'Max Cost Per Request',
      required: request.constraints.maxCostPerRequest,
      actual: primaryModel.cost.costPerRequest,
      satisfied: primaryModel.cost.costPerRequest <= request.constraints.maxCostPerRequest,
      margin: request.constraints.maxCostPerRequest - primaryModel.cost.costPerRequest,
    });
  }

  if (request.taskRequirements.maxLatencyMs) {
    constraints.push({
      constraint: 'Max Latency',
      required: request.taskRequirements.maxLatencyMs,
      actual: primaryModel.metrics.avgLatencyMs,
      satisfied: primaryModel.metrics.avgLatencyMs <= request.taskRequirements.maxLatencyMs,
      margin: request.taskRequirements.maxLatencyMs - primaryModel.metrics.avgLatencyMs,
    });
  }

  const keyFactors = [
    `Quality score of ${(primaryModel.metrics.qualityScore * 100).toFixed(1)}%`,
    `Average latency of ${primaryModel.metrics.avgLatencyMs}ms`,
    `Cost of $${primaryModel.cost.costPerRequest.toFixed(4)} per request`,
  ];

  const explanation = `Selected ${primaryModel.modelName} from ${primaryModel.provider} as the primary model based on ${request.preferences.tradeoffStrategy} strategy. The model provides the best balance of quality, performance, and cost for the ${request.taskType} task.`;

  return {
    decisionCriteria,
    tradeoffs,
    constraints,
    keyFactors,
    explanation,
  };
}

async function generateAlternatives(
  scoredModels: Array<ModelInfo & { score: number; breakdown: Record<string, number> }>,
  selectedModels: SelectedModel[],
  request: ModelSelectionRequest
): Promise<AlternativeModel[]> {
  const selectedIds = new Set(selectedModels.map((m) => m.modelId));
  const alternatives: AlternativeModel[] = [];

  for (let i = 0; i < scoredModels.length; i++) {
    const model = scoredModels[i];
    if (selectedIds.has(model.modelId)) continue;

    alternatives.push({
      modelId: model.modelId,
      modelName: model.modelName,
      provider: model.provider,
      score: model.score,
      rank: i + 1,
      reasonNotSelected: `Lower score (${model.score.toFixed(2)}) compared to selected models`,
      tradeoffs: [
        model.metrics.qualityScore < selectedModels[0].metrics.qualityScore ? 'Lower quality' : 'Higher cost',
      ],
      metrics: model.metrics,
      cost: model.cost,
    });

    if (alternatives.length >= 5) break;
  }

  return alternatives;
}

function calculateConfidence(
  selectedModels: SelectedModel[],
  request: ModelSelectionRequest
): number {
  const primaryModel = selectedModels[0];

  // Base confidence on score
  let confidence = primaryModel.score / 100;

  // Adjust based on constraint satisfaction
  if (request.constraints.maxCostPerRequest && primaryModel.cost.costPerRequest > request.constraints.maxCostPerRequest * 0.9) {
    confidence *= 0.9;
  }

  if (request.taskRequirements.maxLatencyMs && primaryModel.metrics.avgLatencyMs > request.taskRequirements.maxLatencyMs * 0.9) {
    confidence *= 0.9;
  }

  // Adjust based on availability
  confidence *= primaryModel.metrics.availability;

  return Math.min(1, Math.max(0, confidence));
}
