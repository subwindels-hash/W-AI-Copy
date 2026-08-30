/**
 * Module 81: AI Model Portfolio Service
 *
 * Provides comprehensive model portfolio management including portfolio optimization,
 * resource allocation across models, portfolio rebalancing, portfolio analytics,
 * and portfolio governance for optimal model portfolio management.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ModelPortfolio {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: PortfolioStatus;
  models: PortfolioModel[];
  resources: PortfolioResources;
  optimization: PortfolioOptimization;
  governance: PortfolioGovernance;
  analytics: PortfolioAnalytics;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type PortfolioStatus = 'active' | 'optimizing' | 'rebalancing' | 'inactive' | 'archived';

export interface PortfolioModel {
  id: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  provider: string;
  status: ModelStatus;
  allocation: ModelAllocation;
  performance: ModelPerformance;
  cost: ModelCost;
  constraints: ModelConstraints;
  priority: number;
  tags: string[];
  addedAt: string;
  lastOptimizedAt?: string;
}

export type ModelStatus = 'active' | 'inactive' | 'optimizing' | 'degraded' | 'retired';

export interface ModelAllocation {
  resourceBudget: ResourceBudget;
  currentUsage: ResourceUsage;
  utilizationPercentage: number;
  requestDistribution: number; // percentage of total requests
  trafficWeight: number; // for routing
}

export interface ResourceBudget {
  cpuCores: number;
  memoryGb: number;
  gpuCount: number;
  gpuMemoryGb: number;
  storageGb: number;
  monthlyBudgetUsd: number;
  maxRequestsPerMinute: number;
}

export interface ResourceUsage {
  cpuCores: number;
  memoryGb: number;
  gpuCount: number;
  gpuMemoryGb: number;
  storageGb: number;
  monthlyCostUsd: number;
  requestsPerMinute: number;
}

export interface ModelPerformance {
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  throughputPerSecond: number;
  errorRate: number;
  availability: number;
  qualityScore: number;
  lastUpdated: string;
}

export interface ModelCost {
  costPerRequest: number;
  costPer1kTokens: number;
  monthlyCost: number;
  costTrend: 'increasing' | 'stable' | 'decreasing';
  costEfficiency: number; // quality per dollar
  lastUpdated: string;
}

export interface ModelConstraints {
  minAllocation: Partial<ResourceBudget>;
  maxAllocation: Partial<ResourceBudget>;
  requiredCapabilities: string[];
  excludedProviders: string[];
  maxLatencyMs?: number;
  minQualityScore?: number;
  maxCostPerRequest?: number;
}

export interface PortfolioResources {
  totalBudget: ResourceBudget;
  allocatedResources: ResourceUsage;
  availableResources: ResourceBudget;
  utilizationPercentage: number;
  overAllocated: boolean;
}

export interface PortfolioOptimization {
  strategy: OptimizationStrategy;
  objectives: OptimizationObjective[];
  constraints: OptimizationConstraint[];
  lastOptimizedAt?: string;
  optimizationHistory: OptimizationRecord[];
  recommendations: OptimizationRecommendation[];
}

export type OptimizationStrategy =
  | 'cost-minimization'
  | 'performance-maximization'
  | 'balanced'
  | 'quality-focused'
  | 'custom';

export interface OptimizationObjective {
  type: 'minimize-cost' | 'maximize-performance' | 'maximize-quality' | 'minimize-latency' | 'maximize-throughput' | 'balance-resources';
  weight: number; // 0-1
  target?: number;
  priority: number;
}

export interface OptimizationConstraint {
  type: 'max-cost' | 'min-quality' | 'max-latency' | 'min-availability' | 'resource-limit' | 'provider-limit';
  value: number;
  hard: boolean; // hard constraints cannot be violated
}

export interface OptimizationRecord {
  id: string;
  timestamp: string;
  strategy: OptimizationStrategy;
  objectives: OptimizationObjective[];
  beforeState: PortfolioState;
  afterState: PortfolioState;
  improvements: OptimizationImprovement[];
  duration: number; // seconds
  status: 'success' | 'partial' | 'failed';
}

export interface PortfolioState {
  totalCost: number;
  avgPerformance: number;
  avgQuality: number;
  resourceUtilization: number;
  modelAllocations: Array<{
    modelId: string;
    allocation: ModelAllocation;
  }>;
}

export interface OptimizationImprovement {
  modelId: string;
  modelName: string;
  metric: string;
  before: number;
  after: number;
  improvementPercentage: number;
}

export interface OptimizationRecommendation {
  id: string;
  type: 'reallocate' | 'add-model' | 'remove-model' | 'adjust-traffic' | 'upgrade-resources' | 'downgrade-resources';
  priority: 'high' | 'medium' | 'low';
  modelId?: string;
  description: string;
  expectedImprovement: {
    costReduction?: number;
    performanceImprovement?: number;
    qualityImprovement?: number;
  };
  implementationEffort: 'low' | 'medium' | 'high';
  risk: 'low' | 'medium' | 'high';
  createdAt: string;
  appliedAt?: string;
}

export interface PortfolioGovernance {
  policies: PortfolioPolicy[];
  approvalRequired: boolean;
  approvers: string[];
  complianceStatus: ComplianceStatus;
  lastReviewedAt?: string;
}

export interface PortfolioPolicy {
  id: string;
  name: string;
  description: string;
  type: 'cost-limit' | 'quality-threshold' | 'provider-restriction' | 'capability-requirement' | 'custom';
  condition: PolicyCondition;
  action: PolicyAction;
  enabled: boolean;
  createdAt: string;
}

export interface PolicyCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  scope: 'portfolio' | 'model';
}

export interface PolicyAction {
  type: 'alert' | 'block' | 'rebalance' | 'notify' | 'custom';
  config: Record<string, any>;
}

export type ComplianceStatus = 'compliant' | 'warning' | 'non-compliant' | 'not-assessed';

export interface PortfolioAnalytics {
  totalModels: number;
  activeModels: number;
  totalCost: number;
  avgCostPerRequest: number;
  avgPerformance: number;
  avgQuality: number;
  resourceUtilization: number;
  costTrend: CostTrend[];
  performanceTrend: PerformanceTrend[];
  topModels: TopModel[];
  optimizationOpportunities: number;
}

export interface CostTrend {
  timestamp: string;
  totalCost: number;
  costPerRequest: number;
  costBreakdown: Array<{
    modelId: string;
    modelName: string;
    cost: number;
    percentage: number;
  }>;
}

export interface PerformanceTrend {
  timestamp: string;
  avgLatency: number;
  avgThroughput: number;
  avgQuality: number;
  breakdown: Array<{
    modelId: string;
    modelName: string;
    latency: number;
    throughput: number;
    quality: number;
  }>;
}

export interface TopModel {
  modelId: string;
  modelName: string;
  metric: 'cost' | 'performance' | 'quality' | 'requests';
  value: number;
  rank: number;
}

export interface PortfolioDashboard {
  organizationId: string;
  totalPortfolios: number;
  activePortfolios: number;
  totalModels: number;
  totalCost: number;
  avgPerformance: number;
  avgQuality: number;
  resourceUtilization: number;
  recentOptimizations: OptimizationRecord[];
  topRecommendations: OptimizationRecommendation[];
  costBreakdown: Array<{
    modelId: string;
    modelName: string;
    cost: number;
    percentage: number;
  }>;
  performanceBreakdown: Array<{
    modelId: string;
    modelName: string;
    latency: number;
    throughput: number;
    quality: number;
  }>;
  portfolioHealth: {
    healthy: number;
    warning: number;
    critical: number;
  };
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const portfolios = new Map<string, ModelPortfolio>();

// ─── Portfolio Management ──────────────────────────────────────────────────────

/**
 * Create a model portfolio
 */
export async function createModelPortfolio(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    totalBudget: ResourceBudget;
    optimizationStrategy?: OptimizationStrategy;
    objectives?: OptimizationObjective[];
    constraints?: OptimizationConstraint[];
    createdBy: string;
  }
): Promise<ModelPortfolio> {
  const id = `portfolio_${randomUUID()}`;
  const now = new Date().toISOString();

  const portfolio: ModelPortfolio = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    status: 'active',
    models: [],
    resources: {
      totalBudget: params.totalBudget,
      allocatedResources: {
        cpuCores: 0,
        memoryGb: 0,
        gpuCount: 0,
        gpuMemoryGb: 0,
        storageGb: 0,
        monthlyCostUsd: 0,
        requestsPerMinute: 0,
      },
      availableResources: { ...params.totalBudget },
      utilizationPercentage: 0,
      overAllocated: false,
    },
    optimization: {
      strategy: params.optimizationStrategy || 'balanced',
      objectives: params.objectives || [
        { type: 'minimize-cost', weight: 0.3, priority: 1 },
        { type: 'maximize-performance', weight: 0.3, priority: 2 },
        { type: 'maximize-quality', weight: 0.4, priority: 3 },
      ],
      constraints: params.constraints || [
        { type: 'max-cost', value: params.totalBudget.monthlyBudgetUsd, hard: true },
        { type: 'min-quality', value: 0.7, hard: false },
      ],
      optimizationHistory: [],
      recommendations: [],
    },
    governance: {
      policies: [],
      approvalRequired: false,
      approvers: [],
      complianceStatus: 'not-assessed',
    },
    analytics: {
      totalModels: 0,
      activeModels: 0,
      totalCost: 0,
      avgCostPerRequest: 0,
      avgPerformance: 0,
      avgQuality: 0,
      resourceUtilization: 0,
      costTrend: [],
      performanceTrend: [],
      topModels: [],
      optimizationOpportunities: 0,
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  portfolios.set(id, portfolio);
  return portfolio;
}

/**
 * Add a model to portfolio
 */
export async function addModelToPortfolio(
  portfolioId: string,
  params: {
    modelId: string;
    modelName: string;
    modelVersion: string;
    provider: string;
    allocation: ModelAllocation;
    constraints?: ModelConstraints;
    priority?: number;
    tags?: string[];
  }
): Promise<PortfolioModel | null> {
  const portfolio = portfolios.get(portfolioId);
  if (!portfolio) return null;

  const model: PortfolioModel = {
    id: `pmodel_${randomUUID()}`,
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    provider: params.provider,
    status: 'active',
    allocation: params.allocation,
    performance: {
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      throughputPerSecond: 0,
      errorRate: 0,
      availability: 1,
      qualityScore: 0,
      lastUpdated: new Date().toISOString(),
    },
    cost: {
      costPerRequest: 0,
      costPer1kTokens: 0,
      monthlyCost: 0,
      costTrend: 'stable',
      costEfficiency: 0,
      lastUpdated: new Date().toISOString(),
    },
    constraints: params.constraints || {
      minAllocation: {},
      maxAllocation: {},
      requiredCapabilities: [],
      excludedProviders: [],
    },
    priority: params.priority || 1,
    tags: params.tags || [],
    addedAt: new Date().toISOString(),
  };

  portfolio.models.push(model);
  updatePortfolioResources(portfolio);
  portfolio.updatedAt = new Date().toISOString();

  portfolios.set(portfolioId, portfolio);
  return model;
}

/**
 * Remove a model from portfolio
 */
export async function removeModelFromPortfolio(
  portfolioId: string,
  modelId: string
): Promise<boolean> {
  const portfolio = portfolios.get(portfolioId);
  if (!portfolio) return false;

  const initialLength = portfolio.models.length;
  portfolio.models = portfolio.models.filter((m) => m.modelId !== modelId);

  if (portfolio.models.length < initialLength) {
    updatePortfolioResources(portfolio);
    portfolio.updatedAt = new Date().toISOString();
    portfolios.set(portfolioId, portfolio);
    return true;
  }

  return false;
}

/**
 * Optimize portfolio
 */
export async function optimizePortfolio(
  portfolioId: string,
  options?: {
    strategy?: OptimizationStrategy;
    dryRun?: boolean;
  }
): Promise<OptimizationRecord | null> {
  const portfolio = portfolios.get(portfolioId);
  if (!portfolio) return null;

  const recordId = `opt_${randomUUID()}`;
  const now = new Date().toISOString();

  const beforeState: PortfolioState = {
    totalCost: portfolio.analytics.totalCost,
    avgPerformance: portfolio.analytics.avgPerformance,
    avgQuality: portfolio.analytics.avgQuality,
    resourceUtilization: portfolio.resources.utilizationPercentage,
    modelAllocations: portfolio.models.map((m) => ({
      modelId: m.modelId,
      allocation: { ...m.allocation },
    })),
  };

  // Simulate optimization
  const strategy = options?.strategy || portfolio.optimization.strategy;
  const improvements: OptimizationImprovement[] = [];

  // Apply optimization logic based on strategy
  if (strategy === 'cost-minimization') {
    // Reduce allocation for low-priority models
    for (const model of portfolio.models) {
      if (model.priority <= 2 && model.allocation.utilizationPercentage < 50) {
        const reduction = 0.2;
        model.allocation.resourceBudget.monthlyBudgetUsd *= (1 - reduction);
        model.allocation.resourceBudget.cpuCores *= (1 - reduction);
        improvements.push({
          modelId: model.modelId,
          modelName: model.modelName,
          metric: 'cost',
          before: model.cost.monthlyCost,
          after: model.cost.monthlyCost * (1 - reduction),
          improvementPercentage: reduction * 100,
        });
      }
    }
  } else if (strategy === 'performance-maximization') {
    // Increase allocation for high-priority models
    for (const model of portfolio.models) {
      if (model.priority >= 4 && model.allocation.utilizationPercentage > 80) {
        const increase = 0.3;
        model.allocation.resourceBudget.cpuCores *= (1 + increase);
        model.allocation.resourceBudget.memoryGb *= (1 + increase);
        improvements.push({
          modelId: model.modelId,
          modelName: model.modelName,
          metric: 'performance',
          before: model.performance.avgLatencyMs,
          after: model.performance.avgLatencyMs * 0.8,
          improvementPercentage: 20,
        });
      }
    }
  } else if (strategy === 'balanced') {
    // Balance resource allocation based on utilization
    for (const model of portfolio.models) {
      if (model.allocation.utilizationPercentage < 30) {
        // Reduce underutilized resources
        const reduction = 0.15;
        model.allocation.resourceBudget.cpuCores *= (1 - reduction);
        improvements.push({
          modelId: model.modelId,
          modelName: model.modelName,
          metric: 'resource-utilization',
          before: model.allocation.utilizationPercentage,
          after: model.allocation.utilizationPercentage * 1.2,
          improvementPercentage: 20,
        });
      } else if (model.allocation.utilizationPercentage > 85) {
        // Increase overutilized resources
        const increase = 0.2;
        model.allocation.resourceBudget.cpuCores *= (1 + increase);
        improvements.push({
          modelId: model.modelId,
          modelName: model.modelName,
          metric: 'resource-utilization',
          before: model.allocation.utilizationPercentage,
          after: Math.min(100, model.allocation.utilizationPercentage * 0.85),
          improvementPercentage: 15,
        });
      }
    }
  }

  const afterState: PortfolioState = {
    totalCost: portfolio.models.reduce((sum, m) => sum + m.cost.monthlyCost, 0),
    avgPerformance: portfolio.models.reduce((sum, m) => sum + m.performance.throughputPerSecond, 0) / portfolio.models.length,
    avgQuality: portfolio.models.reduce((sum, m) => sum + m.performance.qualityScore, 0) / portfolio.models.length,
    resourceUtilization: portfolio.resources.utilizationPercentage,
    modelAllocations: portfolio.models.map((m) => ({
      modelId: m.modelId,
      allocation: { ...m.allocation },
    })),
  };

  const record: OptimizationRecord = {
    id: recordId,
    timestamp: now,
    strategy,
    objectives: portfolio.optimization.objectives,
    beforeState,
    afterState,
    improvements,
    duration: 5, // simulated
    status: improvements.length > 0 ? 'success' : 'partial',
  };

  if (!options?.dryRun) {
    portfolio.optimization.optimizationHistory.push(record);
    portfolio.optimization.lastOptimizedAt = now;
    updatePortfolioResources(portfolio);
    portfolio.updatedAt = now;
    portfolios.set(portfolioId, portfolio);
  }

  return record;
}

/**
 * Generate optimization recommendations
 */
export async function generateOptimizationRecommendations(
  portfolioId: string
): Promise<OptimizationRecommendation[]> {
  const portfolio = portfolios.get(portfolioId);
  if (!portfolio) return [];

  const recommendations: OptimizationRecommendation[] = [];
  const now = new Date().toISOString();

  for (const model of portfolio.models) {
    // Check for underutilized models
    if (model.allocation.utilizationPercentage < 30 && model.cost.monthlyCost > 100) {
      recommendations.push({
        id: `rec_${randomUUID()}`,
        type: 'downgrade-resources',
        priority: 'medium',
        modelId: model.modelId,
        description: `Model ${model.modelName} is underutilized (${model.allocation.utilizationPercentage.toFixed(1)}%) with high cost ($${model.cost.monthlyCost.toFixed(2)}/month)`,
        expectedImprovement: {
          costReduction: model.cost.monthlyCost * 0.3,
        },
        implementationEffort: 'low',
        risk: 'low',
        createdAt: now,
      });
    }

    // Check for overutilized models
    if (model.allocation.utilizationPercentage > 85 && model.performance.errorRate > 0.05) {
      recommendations.push({
        id: `rec_${randomUUID()}`,
        type: 'upgrade-resources',
        priority: 'high',
        modelId: model.modelId,
        description: `Model ${model.modelName} is overutilized (${model.allocation.utilizationPercentage.toFixed(1)}%) with high error rate (${(model.performance.errorRate * 100).toFixed(1)}%)`,
        expectedImprovement: {
          performanceImprovement: 25,
        },
        implementationEffort: 'medium',
        risk: 'low',
        createdAt: now,
      });
    }

    // Check for high-cost low-quality models
    if (model.cost.costEfficiency < 0.5 && model.cost.monthlyCost > 200) {
      recommendations.push({
        id: `rec_${randomUUID()}`,
        type: 'remove-model',
        priority: 'medium',
        modelId: model.modelId,
        description: `Model ${model.modelName} has low cost efficiency (${model.cost.costEfficiency.toFixed(2)}) with high cost ($${model.cost.monthlyCost.toFixed(2)}/month)`,
        expectedImprovement: {
          costReduction: model.cost.monthlyCost,
        },
        implementationEffort: 'medium',
        risk: 'medium',
        createdAt: now,
      });
    }
  }

  // Check for traffic rebalancing opportunities
  const totalTraffic = portfolio.models.reduce((sum, m) => sum + m.allocation.requestDistribution, 0);
  if (totalTraffic > 0) {
    for (const model of portfolio.models) {
      const trafficPercentage = (model.allocation.requestDistribution / totalTraffic) * 100;
      if (trafficPercentage > 50 && model.performance.qualityScore < 0.7) {
        recommendations.push({
          id: `rec_${randomUUID()}`,
          type: 'adjust-traffic',
          priority: 'high',
          modelId: model.modelId,
          description: `Model ${model.modelName} receives ${trafficPercentage.toFixed(1)}% of traffic but has low quality score (${model.performance.qualityScore.toFixed(2)})`,
          expectedImprovement: {
            qualityImprovement: 15,
          },
          implementationEffort: 'low',
          risk: 'low',
          createdAt: now,
        });
      }
    }
  }

  portfolio.optimization.recommendations = recommendations;
  portfolio.updatedAt = now;
  portfolios.set(portfolioId, portfolio);

  return recommendations;
}

/**
 * Apply optimization recommendation
 */
export async function applyOptimizationRecommendation(
  portfolioId: string,
  recommendationId: string
): Promise<boolean> {
  const portfolio = portfolios.get(portfolioId);
  if (!portfolio) return false;

  const recommendation = portfolio.optimization.recommendations.find((r) => r.id === recommendationId);
  if (!recommendation) return false;

  const model = portfolio.models.find((m) => m.modelId === recommendation.modelId);
  if (!model) return false;

  // Apply recommendation
  if (recommendation.type === 'downgrade-resources') {
    model.allocation.resourceBudget.monthlyBudgetUsd *= 0.7;
    model.allocation.resourceBudget.cpuCores *= 0.7;
  } else if (recommendation.type === 'upgrade-resources') {
    model.allocation.resourceBudget.cpuCores *= 1.3;
    model.allocation.resourceBudget.memoryGb *= 1.3;
  } else if (recommendation.type === 'remove-model') {
    portfolio.models = portfolio.models.filter((m) => m.modelId !== model.modelId);
  } else if (recommendation.type === 'adjust-traffic') {
    model.allocation.requestDistribution *= 0.5;
    // Redistribute traffic to other models
    const otherModels = portfolio.models.filter((m) => m.modelId !== model.modelId);
    const redistribution = model.allocation.requestDistribution / otherModels.length;
    for (const other of otherModels) {
      other.allocation.requestDistribution += redistribution;
    }
  }

  recommendation.appliedAt = new Date().toISOString();
  updatePortfolioResources(portfolio);
  portfolio.updatedAt = recommendation.appliedAt;
  portfolios.set(portfolioId, portfolio);

  return true;
}

/**
 * Get portfolio by ID
 */
export async function getModelPortfolio(portfolioId: string): Promise<ModelPortfolio | null> {
  return portfolios.get(portfolioId) || null;
}

/**
 * List portfolios
 */
export async function listModelPortfolios(
  organizationId: string,
  filters?: { status?: PortfolioStatus }
): Promise<ModelPortfolio[]> {
  const allPortfolios = Array.from(portfolios.values()).filter((p) => p.organizationId === organizationId);

  return allPortfolios.filter((p) => {
    if (filters?.status && p.status !== filters.status) return false;
    return true;
  });
}

/**
 * Get portfolio dashboard
 */
export async function getPortfolioDashboard(organizationId: string): Promise<PortfolioDashboard> {
  const allPortfolios = await listModelPortfolios(organizationId);
  const allModels = allPortfolios.flatMap((p) => p.models);

  const totalCost = allModels.reduce((sum, m) => sum + m.cost.monthlyCost, 0);
  const avgPerformance = allModels.length > 0
    ? allModels.reduce((sum, m) => sum + m.performance.throughputPerSecond, 0) / allModels.length
    : 0;
  const avgQuality = allModels.length > 0
    ? allModels.reduce((sum, m) => sum + m.performance.qualityScore, 0) / allModels.length
    : 0;
  const resourceUtilization = allPortfolios.length > 0
    ? allPortfolios.reduce((sum, p) => sum + p.resources.utilizationPercentage, 0) / allPortfolios.length
    : 0;

  const recentOptimizations = allPortfolios
    .flatMap((p) => p.optimization.optimizationHistory)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  const topRecommendations = allPortfolios
    .flatMap((p) => p.optimization.recommendations)
    .filter((r) => !r.appliedAt)
    .sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    })
    .slice(0, 10);

  const costBreakdown = allModels
    .map((m) => ({
      modelId: m.modelId,
      modelName: m.modelName,
      cost: m.cost.monthlyCost,
      percentage: totalCost > 0 ? (m.cost.monthlyCost / totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  const performanceBreakdown = allModels
    .map((m) => ({
      modelId: m.modelId,
      modelName: m.modelName,
      latency: m.performance.avgLatencyMs,
      throughput: m.performance.throughputPerSecond,
      quality: m.performance.qualityScore,
    }))
    .sort((a, b) => b.quality - a.quality)
    .slice(0, 10);

  return {
    organizationId,
    totalPortfolios: allPortfolios.length,
    activePortfolios: allPortfolios.filter((p) => p.status === 'active').length,
    totalModels: allModels.length,
    totalCost,
    avgPerformance,
    avgQuality,
    resourceUtilization,
    recentOptimizations,
    topRecommendations,
    costBreakdown,
    performanceBreakdown,
    portfolioHealth: {
      healthy: allPortfolios.filter((p) => p.resources.utilizationPercentage >= 50 && p.resources.utilizationPercentage <= 80).length,
      warning: allPortfolios.filter((p) => p.resources.utilizationPercentage < 50 || p.resources.utilizationPercentage > 80).length,
      critical: allPortfolios.filter((p) => p.resources.overAllocated).length,
    },
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function updatePortfolioResources(portfolio: ModelPortfolio): void {
  const allocated = {
    cpuCores: 0,
    memoryGb: 0,
    gpuCount: 0,
    gpuMemoryGb: 0,
    storageGb: 0,
    monthlyCostUsd: 0,
    requestsPerMinute: 0,
  };

  for (const model of portfolio.models) {
    allocated.cpuCores += model.allocation.resourceBudget.cpuCores;
    allocated.memoryGb += model.allocation.resourceBudget.memoryGb;
    allocated.gpuCount += model.allocation.resourceBudget.gpuCount;
    allocated.gpuMemoryGb += model.allocation.resourceBudget.gpuMemoryGb;
    allocated.storageGb += model.allocation.resourceBudget.storageGb;
    allocated.monthlyCostUsd += model.allocation.resourceBudget.monthlyBudgetUsd;
    allocated.requestsPerMinute += model.allocation.resourceBudget.maxRequestsPerMinute;
  }

  portfolio.resources.allocatedResources = allocated;
  portfolio.resources.availableResources = {
    cpuCores: Math.max(0, portfolio.resources.totalBudget.cpuCores - allocated.cpuCores),
    memoryGb: Math.max(0, portfolio.resources.totalBudget.memoryGb - allocated.memoryGb),
    gpuCount: Math.max(0, portfolio.resources.totalBudget.gpuCount - allocated.gpuCount),
    gpuMemoryGb: Math.max(0, portfolio.resources.totalBudget.gpuMemoryGb - allocated.gpuMemoryGb),
    storageGb: Math.max(0, portfolio.resources.totalBudget.storageGb - allocated.storageGb),
    monthlyBudgetUsd: Math.max(0, portfolio.resources.totalBudget.monthlyBudgetUsd - allocated.monthlyCostUsd),
    maxRequestsPerMinute: Math.max(0, portfolio.resources.totalBudget.maxRequestsPerMinute - allocated.requestsPerMinute),
  };

  const totalBudgetValue = portfolio.resources.totalBudget.cpuCores + portfolio.resources.totalBudget.memoryGb + portfolio.resources.totalBudget.gpuCount * 10;
  const allocatedValue = allocated.cpuCores + allocated.memoryGb + allocated.gpuCount * 10;
  portfolio.resources.utilizationPercentage = totalBudgetValue > 0 ? (allocatedValue / totalBudgetValue) * 100 : 0;
  portfolio.resources.overAllocated = allocatedValue > totalBudgetValue;

  // Update analytics
  portfolio.analytics.totalModels = portfolio.models.length;
  portfolio.analytics.activeModels = portfolio.models.filter((m) => m.status === 'active').length;
  portfolio.analytics.totalCost = allocated.monthlyCostUsd;
  portfolio.analytics.resourceUtilization = portfolio.resources.utilizationPercentage;

  if (portfolio.models.length > 0) {
    portfolio.analytics.avgPerformance = portfolio.models.reduce((sum, m) => sum + m.performance.throughputPerSecond, 0) / portfolio.models.length;
    portfolio.analytics.avgQuality = portfolio.models.reduce((sum, m) => sum + m.performance.qualityScore, 0) / portfolio.models.length;
    portfolio.analytics.avgCostPerRequest = allocated.requestsPerMinute > 0 ? allocated.monthlyCostUsd / (allocated.requestsPerMinute * 60 * 24 * 30) : 0;
  }
}
