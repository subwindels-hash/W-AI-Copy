/**
 * Module 62: AI Cost Optimization Service
 *
 * Provides AI cost optimization including cost analysis with multi-dimensional
 * breakdowns, model pricing comparison across providers, waste detection for
 * idle resources and over-provisioned models, cost forecasting based on usage
 * trends, and right-sizing recommendations for AI workloads.
 *
 * Phase 1 — Critical Gap: AI cost optimization analysis and recommendations
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiCostOptimization');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type OptimizationCategory = "right-sizing" | "pricing-optimization" | "waste-elimination" | "architecture-change" | "caching" | "batching" | "model-selection" | "reserved-capacity";

export type OptimizationPriority = "critical" | "high" | "medium" | "low";

export type OptimizationStatus = "identified" | "in-review" | "approved" | "implemented" | "rejected" | "deferred";

export type WasteType = "idle-resource" | "over-provisioned" | "unused-model" | "duplicate-inference" | "excessive-logging" | "stale-deployment" | "unused-storage";

export type ForecastMethod = "linear" | "exponential" | "seasonal" | "moving-average" | "arima";

export interface CostOptimizationAnalysis {
  id: string;
  organizationId: string;
  name: string;
  analysisPeriod: { start: string; end: string };
  totalCurrentCost: number;
  totalPotentialSavings: number;
  savingsPercent: number;
  recommendations: OptimizationRecommendation[];
  wasteItems: WasteItem[];
  pricingComparisons: PricingComparison[];
  forecast: CostForecast;
  rightSizingOpportunities: RightSizingOpportunity[];
  status: "completed" | "in-progress" | "failed";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OptimizationRecommendation {
  id: string;
  category: OptimizationCategory;
  title: string;
  description: string;
  rationale: string;
  currentCost: number;
  projectedCost: number;
  estimatedSavings: number;
  savingsPercent: number;
  priority: OptimizationPriority;
  status: OptimizationStatus;
  effortLevel: "low" | "medium" | "high";
  implementationTimeDays: number;
  riskLevel: "low" | "medium" | "high";
  affectedModels: Array<{ modelId: string; modelName: string; currentCost: number }>;
  prerequisites: string[];
  implementationSteps: string[];
  expectedImpact: { latencyImpactPercent: number; qualityImpactPercent: number; availabilityImpactPercent: number };
  roiMonths: number;
}

export interface WasteItem {
  id: string;
  type: WasteType;
  description: string;
  resourceId: string;
  resourceName: string;
  resourceType: string;
  monthlyCost: number;
  utilizationPercent: number;
  lastUsedAt?: string;
  idleSinceDays?: number;
  recommendedAction: string;
  potentialSavings: number;
  priority: OptimizationPriority;
}

export interface PricingComparison {
  modelId: string;
  modelName: string;
  currentProvider: ProviderPricing;
  alternativeProviders: ProviderPricing[];
  recommendedProvider: string;
  potentialSavings: number;
  savingsPercent: number;
  migrationEffort: "low" | "medium" | "high";
  qualityDelta: number;
}

export interface ProviderPricing {
  provider: string;
  inputTokenPrice: number;
  outputTokenPrice: number;
  monthlyEstimatedCost: number;
  latencyMs: number;
  qualityScore: number;
  sla: string;
  features: string[];
}

export interface CostForecast {
  method: ForecastMethod;
  currentMonthlyCost: number;
  forecastedCosts: Array<{ period: string; cost: number; lowerBound: number; upperBound: number }>;
  growthRate: number;
  confidenceScore: number;
  costDrivers: Array<{ factor: string; contributionPercent: number; trend: string }>;
  budgetProjection: { monthsUntilExceeded?: number; recommendedBudget: number };
}

export interface RightSizingOpportunity {
  modelId: string;
  modelName: string;
  currentConfig: ResourceConfig;
  recommendedConfig: ResourceConfig;
  currentMonthlyCost: number;
  recommendedMonthlyCost: number;
  monthlySavings: number;
  utilizationAnalysis: { cpuPercent: number; gpuPercent: number; memoryPercent: number; queueDepth: number };
  riskAssessment: { performanceRisk: "low" | "medium" | "high"; availabilityRisk: "low" | "medium" | "high" };
}

export interface ResourceConfig {
  instanceType: string;
  replicaCount: number;
  gpuType?: string;
  gpuCount?: number;
  memoryGb: number;
  cpuCores: number;
}

export interface CostOptimizationStats {
  totalAnalyses: number;
  totalRecommendations: number;
  implementedRecommendations: number;
  totalPotentialSavings: number;
  realizedSavings: number;
  topCategories: Record<string, number>;
  topWasteTypes: Record<string, number>;
  averageSavingsPercent: number;
  forecastAccuracy: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const analyses = new Map<string, CostOptimizationAnalysis>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Run a cost optimization analysis
 */
export async function runCostOptimizationAnalysis(params: {
  organizationId: string;
  name: string;
  startDate: string;
  endDate: string;
  currentCosts: Array<{ modelId: string; modelName: string; provider: string; monthlyCost: number; usage: { inputTokens: number; outputTokens: number; inferenceCount: number }; config: ResourceConfig; utilization: { cpuPercent: number; gpuPercent: number; memoryPercent: number; queueDepth: number } }>;
  createdBy: string;
}): Promise<CostOptimizationAnalysis> {
  const now = new Date().toISOString();
  const totalCurrentCost = params.currentCosts.reduce((s, c) => s + c.monthlyCost, 0);

  const recommendations = generateRecommendations(params.currentCosts);
  const wasteItems = detectWaste(params.currentCosts);
  const pricingComparisons = generatePricingComparisons(params.currentCosts);
  const forecast = generateForecast(params.currentCosts, totalCurrentCost);
  const rightSizingOpportunities = identifyRightSizing(params.currentCosts);

  const totalPotentialSavings = recommendations.reduce((s, r) => s + r.estimatedSavings, 0);

  const analysis: CostOptimizationAnalysis = {
    id: `coa_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    analysisPeriod: { start: params.startDate, end: params.endDate },
    totalCurrentCost: Math.round(totalCurrentCost * 100) / 100,
    totalPotentialSavings: Math.round(totalPotentialSavings * 100) / 100,
    savingsPercent: totalCurrentCost > 0 ? Math.round((totalPotentialSavings / totalCurrentCost) * 10000) / 100 : 0,
    recommendations,
    wasteItems,
    pricingComparisons,
    forecast,
    rightSizingOpportunities,
    status: "completed",
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  analyses.set(analysis.id, analysis);
  return analysis;
}

/**
 * Update recommendation status
 */
export async function updateRecommendationStatus(params: {
  analysisId: string;
  recommendationId: string;
  status: OptimizationStatus;
}): Promise<OptimizationRecommendation | null> {
  const analysis = analyses.get(params.analysisId);
  if (!analysis) return null;

  const rec = analysis.recommendations.find(r => r.id === params.recommendationId);
  if (!rec) return null;

  rec.status = params.status;
  analysis.updatedAt = new Date().toISOString();
  analyses.set(params.analysisId, analysis);
  return rec;
}

/**
 * Get cost optimization analysis by ID
 */
export async function getCostOptimizationAnalysis(analysisId: string): Promise<CostOptimizationAnalysis | null> {
  return analyses.get(analysisId) ?? null;
}

/**
 * List cost optimization analyses
 */
export async function listCostOptimizationAnalyses(organizationId: string): Promise<CostOptimizationAnalysis[]> {
  return Array.from(analyses.values()).filter(a => a.organizationId === organizationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Get cost optimization statistics
 */
export async function getCostOptimizationStats(organizationId: string): Promise<CostOptimizationStats> {
  const all = Array.from(analyses.values()).filter(a => a.organizationId === organizationId);

  let totalRecs = 0;
  let implementedRecs = 0;
  let totalPotential = 0;
  let realizedSavings = 0;
  const categories: Record<string, number> = {};
  const wasteTypes: Record<string, number> = {};
  let totalSavingsPercent = 0;

  for (const a of all) {
    totalRecs += a.recommendations.length;
    implementedRecs += a.recommendations.filter(r => r.status === "implemented").length;
    totalPotential += a.totalPotentialSavings;
    realizedSavings += a.recommendations.filter(r => r.status === "implemented").reduce((s, r) => s + r.estimatedSavings, 0);
    totalSavingsPercent += a.savingsPercent;

    for (const r of a.recommendations) categories[r.category] = (categories[r.category] || 0) + 1;
    for (const w of a.wasteItems) wasteTypes[w.type] = (wasteTypes[w.type] || 0) + 1;
  }

  return {
    totalAnalyses: all.length,
    totalRecommendations: totalRecs,
    implementedRecommendations: implementedRecs,
    totalPotentialSavings: Math.round(totalPotential * 100) / 100,
    realizedSavings: Math.round(realizedSavings * 100) / 100,
    topCategories: categories,
    topWasteTypes: wasteTypes,
    averageSavingsPercent: all.length > 0 ? Math.round(totalSavingsPercent / all.length * 100) / 100 : 0,
    forecastAccuracy: 85 + Math.round(_rng.next() * 10),
  };
}

// ─── Internal: Analysis Functions ─────────────────────────────────────────────

function generateRecommendations(costs: Array<{ modelId: string; modelName: string; provider: string; monthlyCost: number; usage: { inputTokens: number; outputTokens: number; inferenceCount: number }; config: ResourceConfig; utilization: { cpuPercent: number; gpuPercent: number; memoryPercent: number; queueDepth: number } }>): OptimizationRecommendation[] {
  const recs: OptimizationRecommendation[] = [];

  for (const model of costs) {
    // Right-sizing recommendation
    if (model.utilization.gpuPercent < 40 && model.config.gpuCount && model.config.gpuCount > 1) {
      const savings = model.monthlyCost * (1 - model.utilization.gpuPercent / 100) * 0.5;
      recs.push({
        id: `rec_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        category: "right-sizing",
        title: `Right-size ${model.modelName} GPU allocation`,
        description: `Reduce GPU count from ${model.config.gpuCount} to ${Math.max(1, Math.ceil(model.config.gpuCount * model.utilization.gpuPercent / 80))}`,
        rationale: `GPU utilization is only ${model.utilization.gpuPercent}% — significant over-provisioning detected`,
        currentCost: model.monthlyCost,
        projectedCost: Math.round((model.monthlyCost - savings) * 100) / 100,
        estimatedSavings: Math.round(savings * 100) / 100,
        savingsPercent: Math.round((savings / model.monthlyCost) * 10000) / 100,
        priority: savings > 500 ? "high" : "medium",
        status: "identified",
        effortLevel: "medium",
        implementationTimeDays: 3,
        riskLevel: model.utilization.gpuPercent < 25 ? "low" : "medium",
        affectedModels: [{ modelId: model.modelId, modelName: model.modelName, currentCost: model.monthlyCost }],
        prerequisites: ["Load testing at reduced capacity", "Monitoring alerts configured"],
        implementationSteps: ["Scale down GPU count", "Monitor for 24 hours", "Adjust if latency increases"],
        expectedImpact: { latencyImpactPercent: 5, qualityImpactPercent: 0, availabilityImpactPercent: -2 },
        roiMonths: 1,
      });
    }

    // Caching recommendation
    if (model.usage.inferenceCount > 10000) {
      const cacheHitRate = 0.2 + _rng.next() * 0.3;
      const savings = model.monthlyCost * cacheHitRate * 0.8;
      recs.push({
        id: `rec_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        category: "caching",
        title: `Implement semantic caching for ${model.modelName}`,
        description: `Add semantic cache layer with estimated ${Math.round(cacheHitRate * 100)}% hit rate`,
        rationale: `High request volume (${model.usage.inferenceCount.toLocaleString()}/month) suggests significant duplicate or similar queries`,
        currentCost: model.monthlyCost,
        projectedCost: Math.round((model.monthlyCost - savings) * 100) / 100,
        estimatedSavings: Math.round(savings * 100) / 100,
        savingsPercent: Math.round((savings / model.monthlyCost) * 10000) / 100,
        priority: savings > 300 ? "high" : "medium",
        status: "identified",
        effortLevel: "low",
        implementationTimeDays: 5,
        riskLevel: "low",
        affectedModels: [{ modelId: model.modelId, modelName: model.modelName, currentCost: model.monthlyCost }],
        prerequisites: ["Redis/semantic cache infrastructure", "Cache invalidation strategy"],
        implementationSteps: ["Deploy semantic cache", "Configure TTL and similarity threshold", "Monitor hit rate"],
        expectedImpact: { latencyImpactPercent: -30, qualityImpactPercent: 0, availabilityImpactPercent: 5 },
        roiMonths: 1,
      });
    }

    // Batching recommendation
    if (model.usage.inferenceCount > 5000 && model.config.replicaCount > 2) {
      const savings = model.monthlyCost * 0.15;
      recs.push({
        id: `rec_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        category: "batching",
        title: `Enable dynamic batching for ${model.modelName}`,
        description: "Implement dynamic request batching to improve GPU utilization",
        rationale: "High request volume with multiple replicas — batching can reduce per-request cost",
        currentCost: model.monthlyCost,
        projectedCost: Math.round((model.monthlyCost - savings) * 100) / 100,
        estimatedSavings: Math.round(savings * 100) / 100,
        savingsPercent: Math.round((savings / model.monthlyCost) * 10000) / 100,
        priority: "medium",
        status: "identified",
        effortLevel: "low",
        implementationTimeDays: 2,
        riskLevel: "low",
        affectedModels: [{ modelId: model.modelId, modelName: model.modelName, currentCost: model.monthlyCost }],
        prerequisites: ["Latency SLA allows batching window"],
        implementationSteps: ["Enable dynamic batching", "Set batch timeout to 5ms", "Monitor throughput improvement"],
        expectedImpact: { latencyImpactPercent: 5, qualityImpactPercent: 0, availabilityImpactPercent: 0 },
        roiMonths: 1,
      });
    }

    // Model selection recommendation
    if (model.monthlyCost > 1000 && model.usage.outputTokens > 0) {
      const costPerOutputToken = model.monthlyCost / model.usage.outputTokens;
      if (costPerOutputToken > 0.00003) {
        const savings = model.monthlyCost * 0.4;
        recs.push({
          id: `rec_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
          category: "model-selection",
          title: `Consider smaller model for ${model.modelName} workload`,
          description: "Evaluate smaller, more cost-effective model for this workload",
          rationale: `Cost per output token ($${costPerOutputToken.toFixed(6)}) is above average — a smaller model may suffice`,
          currentCost: model.monthlyCost,
          projectedCost: Math.round((model.monthlyCost - savings) * 100) / 100,
          estimatedSavings: Math.round(savings * 100) / 100,
          savingsPercent: Math.round((savings / model.monthlyCost) * 10000) / 100,
          priority: savings > 500 ? "high" : "medium",
          status: "identified",
          effortLevel: "high",
          implementationTimeDays: 14,
          riskLevel: "medium",
          affectedModels: [{ modelId: model.modelId, modelName: model.modelName, currentCost: model.monthlyCost }],
          prerequisites: ["Quality evaluation pipeline", "A/B testing framework", "Fallback configuration"],
          implementationSteps: ["Benchmark alternative models", "A/B test with 10% traffic", "Gradually increase if quality maintained"],
          expectedImpact: { latencyImpactPercent: -20, qualityImpactPercent: -3, availabilityImpactPercent: 0 },
          roiMonths: 2,
        });
      }
    }
  }

  // Reserved capacity recommendation
  const totalCost = costs.reduce((s, c) => s + c.monthlyCost, 0);
  if (totalCost > 5000) {
    const savings = totalCost * 0.25;
    recs.push({
      id: `rec_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      category: "reserved-capacity",
      title: "Purchase reserved GPU capacity",
      description: "Commit to 1-year reserved capacity for predictable workloads",
      rationale: `Stable monthly spend of $${totalCost.toFixed(0)} justifies reserved capacity discount (25-40%)`,
      currentCost: totalCost,
      projectedCost: Math.round((totalCost - savings) * 100) / 100,
      estimatedSavings: Math.round(savings * 100) / 100,
      savingsPercent: 25,
      priority: "high",
      status: "identified",
      effortLevel: "low",
      implementationTimeDays: 7,
      riskLevel: "medium",
      affectedModels: costs.map(c => ({ modelId: c.modelId, modelName: c.modelName, currentCost: c.monthlyCost })),
      prerequisites: ["12-month usage history", "Stable workload forecast", "Budget approval"],
      implementationSteps: ["Analyze usage patterns", "Select reservation type", "Purchase reserved capacity"],
      expectedImpact: { latencyImpactPercent: 0, qualityImpactPercent: 0, availabilityImpactPercent: 5 },
      roiMonths: 4,
    });
  }

  return recs.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
}

function detectWaste(costs: Array<{ modelId: string; modelName: string; monthlyCost: number; utilization: { cpuPercent: number; gpuPercent: number; memoryPercent: number } }>): WasteItem[] {
  const waste: WasteItem[] = [];

  for (const model of costs) {
    if (model.utilization.gpuPercent < 20 && model.monthlyCost > 100) {
      waste.push({
        id: `wst_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        type: "over-provisioned",
        description: `${model.modelName} is significantly over-provisioned (GPU utilization: ${model.utilization.gpuPercent}%)`,
        resourceId: model.modelId,
        resourceName: model.modelName,
        resourceType: "model-deployment",
        monthlyCost: model.monthlyCost,
        utilizationPercent: model.utilization.gpuPercent,
        idleSinceDays: Math.floor(_rng.next() * 30),
        recommendedAction: "Scale down GPU allocation or switch to smaller instance type",
        potentialSavings: Math.round(model.monthlyCost * (1 - model.utilization.gpuPercent / 80) * 100) / 100,
        priority: model.monthlyCost > 500 ? "high" : "medium",
      });
    }

    if (model.utilization.cpuPercent < 10 && model.utilization.gpuPercent < 10) {
      waste.push({
        id: `wst_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        type: "idle-resource",
        description: `${model.modelName} appears idle (CPU: ${model.utilization.cpuPercent}%, GPU: ${model.utilization.gpuPercent}%)`,
        resourceId: model.modelId,
        resourceName: model.modelName,
        resourceType: "model-deployment",
        monthlyCost: model.monthlyCost,
        utilizationPercent: Math.max(model.utilization.cpuPercent, model.utilization.gpuPercent),
        idleSinceDays: Math.floor(5 + _rng.next() * 25),
        recommendedAction: "Consider decommissioning or consolidating with other models",
        potentialSavings: Math.round(model.monthlyCost * 0.9 * 100) / 100,
        priority: "critical",
      });
    }
  }

  return waste.sort((a, b) => b.potentialSavings - a.potentialSavings);
}

function generatePricingComparisons(costs: Array<{ modelId: string; modelName: string; provider: string; monthlyCost: number; usage: { inputTokens: number; outputTokens: number } }>): PricingComparison[] {
  const providers = ["openai", "anthropic", "google", "aws-bedrock", "azure-openai", "cohere", "mistral"];

  return costs.filter(c => c.monthlyCost > 200).map(model => {
    const inputPricePerToken = model.monthlyCost * 0.3 / Math.max(model.usage.inputTokens, 1);
    const outputPricePerToken = model.monthlyCost * 0.7 / Math.max(model.usage.outputTokens, 1);

    const alternatives = providers.filter(p => p !== model.provider).slice(0, 4).map(p => {
      const factor = 0.5 + _rng.next() * 1.0;
      return {
        provider: p,
        inputTokenPrice: Math.round(inputPricePerToken * factor * 1000000) / 1000000,
        outputTokenPrice: Math.round(outputPricePerToken * factor * 1000000) / 1000000,
        monthlyEstimatedCost: Math.round(model.monthlyCost * factor * 100) / 100,
        latencyMs: Math.round(20 + _rng.next() * 80),
        qualityScore: Math.round((0.7 + _rng.next() * 0.25) * 100) / 100,
        sla: "99.9%",
        features: ["streaming", "function-calling", "fine-tuning"].slice(0, 1 + Math.floor(_rng.next() * 3)),
      };
    });

    const cheapest = alternatives.sort((a, b) => a.monthlyEstimatedCost - b.monthlyEstimatedCost)[0];
    const savings = cheapest ? model.monthlyCost - cheapest.monthlyEstimatedCost : 0;

    return {
      modelId: model.modelId,
      modelName: model.modelName,
      currentProvider: {
        provider: model.provider,
        inputTokenPrice: Math.round(inputPricePerToken * 1000000) / 1000000,
        outputTokenPrice: Math.round(outputPricePerToken * 1000000) / 1000000,
        monthlyEstimatedCost: model.monthlyCost,
        latencyMs: Math.round(20 + _rng.next() * 60),
        qualityScore: Math.round((0.8 + _rng.next() * 0.15) * 100) / 100,
        sla: "99.9%",
        features: ["streaming", "function-calling", "fine-tuning"],
      },
      alternativeProviders: alternatives,
      recommendedProvider: cheapest && savings > 0 ? cheapest.provider : model.provider,
      potentialSavings: Math.round(Math.max(0, savings) * 100) / 100,
      savingsPercent: savings > 0 ? Math.round((savings / model.monthlyCost) * 10000) / 100 : 0,
      migrationEffort: savings > model.monthlyCost * 0.3 ? "high" : savings > model.monthlyCost * 0.1 ? "medium" : "low",
      qualityDelta: cheapest ? Math.round((cheapest.qualityScore - 0.85) * 100) / 100 : 0,
    };
  });
}

function generateForecast(costs: Array<{ modelId: string; monthlyCost: number }>, totalCurrentCost: number): CostForecast {
  const growthRate = 5 + _rng.next() * 15;
  const periods = 6;
  const forecastedCosts: CostForecast["forecastedCosts"] = [];

  for (let i = 1; i <= periods; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() + i);
    const cost = totalCurrentCost * Math.pow(1 + growthRate / 100, i);
    const variance = cost * 0.1;
    forecastedCosts.push({
      period: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      cost: Math.round(cost * 100) / 100,
      lowerBound: Math.round((cost - variance) * 100) / 100,
      upperBound: Math.round((cost + variance) * 100) / 100,
    });
  }

  const topModels = [...costs].sort((a, b) => b.monthlyCost - a.monthlyCost).slice(0, 3);

  return {
    method: "exponential",
    currentMonthlyCost: Math.round(totalCurrentCost * 100) / 100,
    forecastedCosts,
    growthRate: Math.round(growthRate * 100) / 100,
    confidenceScore: 0.75 + _rng.next() * 0.2,
    costDrivers: topModels.map(m => ({ factor: m.modelId, contributionPercent: Math.round((m.monthlyCost / totalCurrentCost) * 10000) / 100, trend: _rng.next() > 0.5 ? "increasing" : "stable" })),
    budgetProjection: {
      monthsUntilExceeded: Math.round(12 / (1 + growthRate / 100)),
      recommendedBudget: Math.round(totalCurrentCost * 1.3 * 100) / 100,
    },
  };
}

function identifyRightSizing(costs: Array<{ modelId: string; modelName: string; monthlyCost: number; config: ResourceConfig; utilization: { cpuPercent: number; gpuPercent: number; memoryPercent: number; queueDepth: number } }>): RightSizingOpportunity[] {
  return costs
    .filter(c => c.utilization.gpuPercent < 60 || c.utilization.memoryPercent < 50)
    .map(model => {
      const utilizationFactor = Math.max(model.utilization.gpuPercent, model.utilization.memoryPercent) / 80;
      const recommendedReplicas = Math.max(1, Math.ceil(model.config.replicaCount * utilizationFactor));
      const savings = model.monthlyCost * (1 - utilizationFactor);

      return {
        modelId: model.modelId,
        modelName: model.modelName,
        currentConfig: model.config,
        recommendedConfig: { ...model.config, replicaCount: recommendedReplicas, gpuCount: model.config.gpuCount ? Math.max(1, Math.ceil(model.config.gpuCount * utilizationFactor)) : undefined },
        currentMonthlyCost: model.monthlyCost,
        recommendedMonthlyCost: Math.round((model.monthlyCost - savings) * 100) / 100,
        monthlySavings: Math.round(savings * 100) / 100,
        utilizationAnalysis: model.utilization,
        riskAssessment: {
          performanceRisk: model.utilization.queueDepth > 10 ? "high" : model.utilization.queueDepth > 5 ? "medium" : "low",
          availabilityRisk: model.config.replicaCount <= 2 ? "medium" : "low",
        },
      };
    })
    .sort((a, b) => b.monthlySavings - a.monthlySavings);
}
