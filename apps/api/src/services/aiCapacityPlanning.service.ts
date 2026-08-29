/**
 * Module 67: AI Capacity Planning Service
 *
 * Provides AI-specific capacity planning including workload forecasting,
 * resource requirement calculation, capacity gap analysis, capacity runway
 * calculation, what-if scenario planning, and capacity optimization recommendations.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AICapacityPlan {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  scope: CapacityScope;
  forecast: CapacityForecast;
  currentCapacity: ResourceCapacity;
  requiredCapacity: ResourceCapacity;
  gapAnalysis: CapacityGap;
  runway: CapacityRunway;
  scenarios: CapacityScenario[];
  recommendations: CapacityRecommendation[];
  status: CapacityPlanStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type CapacityPlanStatus =
  | 'draft'
  | 'analyzing'
  | 'completed'
  | 'approved'
  | 'implementing'
  | 'completed'
  | 'archived';

export interface CapacityScope {
  workloadTypes: AIWorkloadType[];
  modelIds?: string[];
  deploymentIds?: string[];
  regions?: string[];
  timeRange: {
    start: string;
    end: string;
  };
  granularity: 'hourly' | 'daily' | 'weekly' | 'monthly';
}

export type AIWorkloadType =
  | 'inference'
  | 'training'
  | 'fine-tuning'
  | 'batch-processing'
  | 'embedding'
  | 'streaming';

export interface CapacityForecast {
  workloadForecasts: WorkloadForecast[];
  resourceForecasts: ResourceForecast[];
  forecastHorizon: number; // days
  confidenceLevel: number; // 0-1
  generatedAt: string;
}

export interface WorkloadForecast {
  workloadType: AIWorkloadType;
  modelId?: string;
  forecastPoints: ForecastPoint[];
  peakDemand: number;
  averageDemand: number;
  growthRate: number; // percentage per period
  seasonality?: SeasonalityPattern;
}

export interface ForecastPoint {
  timestamp: string;
  value: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

export interface SeasonalityPattern {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  peakPeriods: string[];
  lowPeriods: string[];
  amplitude: number; // percentage variation
}

export interface ResourceForecast {
  resourceType: ResourceType;
  forecastPoints: ForecastPoint[];
  peakRequirement: number;
  averageRequirement: number;
  unit: string;
}

export type ResourceType =
  | 'gpu-count'
  | 'gpu-memory-gb'
  | 'cpu-cores'
  | 'memory-gb'
  | 'storage-gb'
  | 'network-bandwidth-mbps'
  | 'inference-instances'
  | 'training-instances';

export interface ResourceCapacity {
  resources: ResourceAllocation[];
  totalCost: number;
  currency: string;
  utilizationPercent: number;
}

export interface ResourceAllocation {
  resourceType: ResourceType;
  allocated: number;
  used: number;
  available: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
  utilizationPercent: number;
}

export interface CapacityGap {
  hasGap: boolean;
  gaps: ResourceGap[];
  overallGapPercent: number;
  criticalGaps: number;
  estimatedTimeToExhaustion?: string; // ISO date
}

export interface ResourceGap {
  resourceType: ResourceType;
  currentCapacity: number;
  requiredCapacity: number;
  gap: number;
  gapPercent: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timeToExhaustion?: string; // ISO date
  unit: string;
}

export interface CapacityRunway {
  overallRunwayDays: number;
  resourceRunways: ResourceRunway[];
  status: 'healthy' | 'warning' | 'critical';
  recommendations: string[];
}

export interface ResourceRunway {
  resourceType: ResourceType;
  runwayDays: number;
  currentUtilization: number;
  growthRate: number;
  status: 'healthy' | 'warning' | 'critical';
  exhaustionDate?: string;
}

export interface CapacityScenario {
  id: string;
  name: string;
  description: string;
  assumptions: ScenarioAssumption[];
  projectedCapacity: ResourceCapacity;
  projectedCost: number;
  riskLevel: 'low' | 'medium' | 'high';
  probability: number; // 0-1
}

export interface ScenarioAssumption {
  type: 'growth-rate' | 'new-model' | 'traffic-spike' | 'seasonal-peak' | 'infrastructure-change';
  description: string;
  impact: {
    resourceType: ResourceType;
    multiplier: number;
  };
}

export interface CapacityRecommendation {
  id: string;
  type: RecommendationType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  resourceType: ResourceType;
  currentCapacity: number;
  recommendedCapacity: number;
  estimatedCost: number;
  estimatedSavings?: number;
  implementationEffort: 'low' | 'medium' | 'high';
  timeline: string;
  benefits: string[];
  risks: string[];
}

export type RecommendationType =
  | 'scale-up'
  | 'scale-down'
  | 'add-capacity'
  | 'remove-capacity'
  | 'right-size'
  | 'reserved-capacity'
  | 'spot-instances'
  | 'optimization';

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const capacityPlans = new Map<string, AICapacityPlan>();

// ─── Capacity Planning ─────────────────────────────────────────────────────────

/**
 * Create a capacity plan
 */
export async function createCapacityPlan(
  organizationId: string,
  plan: Omit<AICapacityPlan, 'id' | 'forecast' | 'gapAnalysis' | 'runway' | 'scenarios' | 'recommendations' | 'createdAt' | 'updatedAt'>,
  createdBy: string
): Promise<AICapacityPlan> {
  const id = `cap_${randomUUID()}`;
  const now = new Date().toISOString();

  const newPlan: AICapacityPlan = {
    ...plan,
    id,
    organizationId,
    forecast: {
      workloadForecasts: [],
      resourceForecasts: [],
      forecastHorizon: 90,
      confidenceLevel: 0.95,
      generatedAt: now,
    },
    gapAnalysis: {
      hasGap: false,
      gaps: [],
      overallGapPercent: 0,
      criticalGaps: 0,
    },
    runway: {
      overallRunwayDays: 0,
      resourceRunways: [],
      status: 'healthy',
      recommendations: [],
    },
    scenarios: [],
    recommendations: [],
    status: 'draft',
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  capacityPlans.set(id, newPlan);
  return newPlan;
}

/**
 * Generate workload forecast
 */
export async function generateWorkloadForecast(
  planId: string,
  historicalData: HistoricalWorkloadData[],
  forecastHorizon: number = 90
): Promise<WorkloadForecast[] | null> {
  const plan = capacityPlans.get(planId);
  if (!plan) return null;

  const forecasts: WorkloadForecast[] = [];

  for (const workloadType of plan.scope.workloadTypes) {
    const data = historicalData.filter((d) => d.workloadType === workloadType);
    if (data.length === 0) continue;

    // Simple linear regression forecast
    const values = data.map((d) => d.value);
    const n = values.length;
    const xValues = Array.from({ length: n }, (_, i) => i);
    
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * values[i], 0);
    const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Generate forecast points
    const forecastPoints: ForecastPoint[] = [];
    const lastTimestamp = new Date(data[data.length - 1].timestamp);
    
    for (let i = 1; i <= forecastHorizon; i++) {
      const timestamp = new Date(lastTimestamp);
      timestamp.setDate(timestamp.getDate() + i);
      
      const value = intercept + slope * (n + i);
      const confidence = Math.max(0.5, 0.95 - (i / forecastHorizon) * 0.3);
      const margin = value * (1 - confidence) * 2;

      forecastPoints.push({
        timestamp: timestamp.toISOString(),
        value: Math.max(0, value),
        lowerBound: Math.max(0, value - margin),
        upperBound: value + margin,
        confidence,
      });
    }

    const peakDemand = Math.max(...forecastPoints.map((p) => p.upperBound));
    const averageDemand = forecastPoints.reduce((sum, p) => sum + p.value, 0) / forecastPoints.length;
    const growthRate = slope > 0 ? (slope / averageDemand) * 100 : 0;

    forecasts.push({
      workloadType,
      forecastPoints,
      peakDemand,
      averageDemand,
      growthRate,
    });
  }

  plan.forecast.workloadForecasts = forecasts;
  plan.forecast.forecastHorizon = forecastHorizon;
  plan.forecast.generatedAt = new Date().toISOString();
  plan.updatedAt = new Date().toISOString();

  capacityPlans.set(planId, plan);
  return forecasts;
}

/**
 * Calculate resource requirements
 */
export async function calculateResourceRequirements(
  planId: string,
  resourceMappings: ResourceMapping[]
): Promise<ResourceCapacity | null> {
  const plan = capacityPlans.get(planId);
  if (!plan) return null;

  const resources: ResourceAllocation[] = [];
  let totalCost = 0;

  for (const mapping of resourceMappings) {
    const workloadForecast = plan.forecast.workloadForecasts.find(
      (f) => f.workloadType === mapping.workloadType
    );
    
    if (!workloadForecast) continue;

    const peakRequirement = workloadForecast.peakDemand * mapping.resourcePerUnit;
    const averageRequirement = workloadForecast.averageDemand * mapping.resourcePerUnit;
    
    // Add buffer for safety
    const allocated = Math.ceil(peakRequirement * 1.2);
    const cost = allocated * mapping.costPerUnit;

    resources.push({
      resourceType: mapping.resourceType,
      allocated,
      used: Math.ceil(averageRequirement),
      available: allocated - Math.ceil(averageRequirement),
      unit: mapping.unit,
      costPerUnit: mapping.costPerUnit,
      totalCost: cost,
      utilizationPercent: (averageRequirement / allocated) * 100,
    });

    totalCost += cost;
  }

  const averageUtilization = resources.reduce((sum, r) => sum + r.utilizationPercent, 0) / resources.length;

  plan.requiredCapacity = {
    resources,
    totalCost,
    currency: 'USD',
    utilizationPercent: averageUtilization,
  };

  plan.updatedAt = new Date().toISOString();
  capacityPlans.set(planId, plan);

  return plan.requiredCapacity;
}

/**
 * Perform gap analysis
 */
export async function performGapAnalysis(planId: string): Promise<CapacityGap | null> {
  const plan = capacityPlans.get(planId);
  if (!plan) return null;

  const gaps: ResourceGap[] = [];
  let totalGapPercent = 0;
  let criticalGaps = 0;

  for (const required of plan.requiredCapacity.resources) {
    const current = plan.currentCapacity.resources.find(
      (r) => r.resourceType === required.resourceType
    );

    const currentCapacity = current?.allocated || 0;
    const gap = required.allocated - currentCapacity;
    const gapPercent = currentCapacity > 0 ? (gap / currentCapacity) * 100 : 100;

    let severity: ResourceGap['severity'] = 'low';
    if (gapPercent > 50) {
      severity = 'critical';
      criticalGaps++;
    } else if (gapPercent > 25) {
      severity = 'high';
    } else if (gapPercent > 10) {
      severity = 'medium';
    }

    // Estimate time to exhaustion
    let timeToExhaustion: string | undefined;
    if (gap > 0 && current) {
      const workloadForecast = plan.forecast.workloadForecasts[0];
      if (workloadForecast && workloadForecast.growthRate > 0) {
        const available = currentCapacity - current.used;
        const dailyGrowth = (current.used * workloadForecast.growthRate) / 100 / 30;
        const daysToExhaustion = available / dailyGrowth;
        const exhaustionDate = new Date();
        exhaustionDate.setDate(exhaustionDate.getDate() + daysToExhaustion);
        timeToExhaustion = exhaustionDate.toISOString();
      }
    }

    gaps.push({
      resourceType: required.resourceType,
      currentCapacity,
      requiredCapacity: required.allocated,
      gap,
      gapPercent,
      severity,
      timeToExhaustion,
      unit: required.unit,
    });

    totalGapPercent += Math.abs(gapPercent);
  }

  const overallGapPercent = gaps.length > 0 ? totalGapPercent / gaps.length : 0;

  plan.gapAnalysis = {
    hasGap: gaps.some((g) => g.gap > 0),
    gaps,
    overallGapPercent,
    criticalGaps,
    estimatedTimeToExhaustion: gaps
      .filter((g) => g.timeToExhaustion)
      .sort((a, b) => a.timeToExhaustion!.localeCompare(b.timeToExhaustion!))[0]?.timeToExhaustion,
  };

  plan.updatedAt = new Date().toISOString();
  capacityPlans.set(planId, plan);

  return plan.gapAnalysis;
}

/**
 * Calculate capacity runway
 */
export async function calculateCapacityRunway(planId: string): Promise<CapacityRunway | null> {
  const plan = capacityPlans.get(planId);
  if (!plan) return null;

  const resourceRunways: ResourceRunway[] = [];
  let minRunway = Infinity;

  for (const gap of plan.gapAnalysis.gaps) {
    const current = plan.currentCapacity.resources.find(
      (r) => r.resourceType === gap.resourceType
    );

    if (!current) continue;

    const workloadForecast = plan.forecast.workloadForecasts[0];
    const growthRate = workloadForecast?.growthRate || 0;

    let runwayDays = Infinity;
    if (growthRate > 0 && gap.gap > 0) {
      const available = current.allocated - current.used;
      const dailyGrowth = (current.used * growthRate) / 100 / 30;
      runwayDays = dailyGrowth > 0 ? available / dailyGrowth : Infinity;
    }

    let status: ResourceRunway['status'] = 'healthy';
    if (runwayDays < 30) {
      status = 'critical';
    } else if (runwayDays < 90) {
      status = 'warning';
    }

    const exhaustionDate = new Date();
    exhaustionDate.setDate(exhaustionDate.getDate() + runwayDays);

    resourceRunways.push({
      resourceType: gap.resourceType,
      runwayDays: Math.round(runwayDays),
      currentUtilization: current.utilizationPercent,
      growthRate,
      status,
      exhaustionDate: runwayDays < Infinity ? exhaustionDate.toISOString() : undefined,
    });

    if (runwayDays < minRunway) {
      minRunway = runwayDays;
    }
  }

  let overallStatus: CapacityRunway['status'] = 'healthy';
  if (minRunway < 30) {
    overallStatus = 'critical';
  } else if (minRunway < 90) {
    overallStatus = 'warning';
  }

  const recommendations: string[] = [];
  if (overallStatus === 'critical') {
    recommendations.push('Immediate capacity expansion required');
    recommendations.push('Consider emergency procurement or spot instances');
  } else if (overallStatus === 'warning') {
    recommendations.push('Plan capacity expansion within 30 days');
    recommendations.push('Evaluate reserved capacity options');
  }

  plan.runway = {
    overallRunwayDays: Math.round(minRunway),
    resourceRunways,
    status: overallStatus,
    recommendations,
  };

  plan.updatedAt = new Date().toISOString();
  capacityPlans.set(planId, plan);

  return plan.runway;
}

/**
 * Create what-if scenario
 */
export async function createScenario(
  planId: string,
  scenario: Omit<CapacityScenario, 'id' | 'projectedCapacity' | 'projectedCost'>
): Promise<CapacityScenario | null> {
  const plan = capacityPlans.get(planId);
  if (!plan) return null;

  const id = `scenario_${randomUUID()}`;

  // Calculate projected capacity based on assumptions
  const projectedResources = plan.requiredCapacity.resources.map((r) => {
    let multiplier = 1;
    for (const assumption of scenario.assumptions) {
      if (assumption.impact.resourceType === r.resourceType) {
        multiplier *= assumption.impact.multiplier;
      }
    }

    const allocated = Math.ceil(r.allocated * multiplier);
    const cost = allocated * r.costPerUnit;

    return {
      ...r,
      allocated,
      totalCost: cost,
    };
  });

  const projectedCost = projectedResources.reduce((sum, r) => sum + r.totalCost, 0);

  const newScenario: CapacityScenario = {
    ...scenario,
    id,
    projectedCapacity: {
      resources: projectedResources,
      totalCost: projectedCost,
      currency: plan.requiredCapacity.currency,
      utilizationPercent: plan.requiredCapacity.utilizationPercent,
    },
    projectedCost,
  };

  plan.scenarios.push(newScenario);
  plan.updatedAt = new Date().toISOString();

  capacityPlans.set(planId, plan);
  return newScenario;
}

/**
 * Generate capacity recommendations
 */
export async function generateRecommendations(planId: string): Promise<CapacityRecommendation[] | null> {
  const plan = capacityPlans.get(planId);
  if (!plan) return null;

  const recommendations: CapacityRecommendation[] = [];

  for (const gap of plan.gapAnalysis.gaps) {
    if (gap.gap > 0) {
      // Need more capacity
      const current = plan.currentCapacity.resources.find(
        (r) => r.resourceType === gap.resourceType
      );

      recommendations.push({
        id: `rec_${randomUUID()}`,
        type: 'add-capacity',
        priority: gap.severity,
        title: `Add ${gap.resourceType} capacity`,
        description: `Current ${gap.resourceType} capacity is insufficient. Add ${gap.gap} ${gap.unit} to meet projected demand.`,
        resourceType: gap.resourceType,
        currentCapacity: gap.currentCapacity,
        recommendedCapacity: gap.requiredCapacity,
        estimatedCost: gap.gap * (current?.costPerUnit || 0),
        implementationEffort: gap.severity === 'critical' ? 'high' : 'medium',
        timeline: gap.severity === 'critical' ? '1 week' : '1 month',
        benefits: [
          'Prevent capacity exhaustion',
          'Maintain service availability',
          'Support workload growth',
        ],
        risks: [
          'Additional infrastructure cost',
          'Potential over-provisioning if growth slows',
        ],
      });
    } else if (gap.gap < -0.2 * gap.currentCapacity) {
      // Excess capacity
      const excessCapacity = Math.abs(gap.gap);
      const current = plan.currentCapacity.resources.find(
        (r) => r.resourceType === gap.resourceType
      );

      recommendations.push({
        id: `rec_${randomUUID()}`,
        type: 'remove-capacity',
        priority: 'medium',
        title: `Reduce ${gap.resourceType} capacity`,
        description: `Current ${gap.resourceType} capacity is over-provisioned. Remove ${excessCapacity} ${gap.unit} to optimize costs.`,
        resourceType: gap.resourceType,
        currentCapacity: gap.currentCapacity,
        recommendedCapacity: gap.requiredCapacity,
        estimatedCost: 0,
        estimatedSavings: excessCapacity * (current?.costPerUnit || 0),
        implementationEffort: 'low',
        timeline: '1 week',
        benefits: [
          'Reduce infrastructure costs',
          'Improve resource efficiency',
          'Optimize capacity utilization',
        ],
        risks: [
          'Reduced buffer for unexpected demand',
          'Potential capacity shortage if demand spikes',
        ],
      });
    }
  }

  // Add reserved capacity recommendation if applicable
  const totalMonthlyCost = plan.requiredCapacity.totalCost;
  if (totalMonthlyCost > 10000) {
    recommendations.push({
      id: `rec_${randomUUID()}`,
      type: 'reserved-capacity',
      priority: 'high',
      title: 'Purchase reserved capacity',
      description: 'Commit to 1-year or 3-year reserved capacity to reduce costs by 30-60%.',
      resourceType: 'gpu-count',
      currentCapacity: 0,
      recommendedCapacity: 0,
      estimatedCost: totalMonthlyCost * 12 * 0.6, // 40% discount
      estimatedSavings: totalMonthlyCost * 12 * 0.4,
      implementationEffort: 'low',
      timeline: '1 week',
      benefits: [
        'Significant cost reduction (30-60%)',
        'Capacity reservation guarantee',
        'Predictable billing',
      ],
      risks: [
        'Long-term commitment',
        'Reduced flexibility',
        'Potential over-commitment',
      ],
    });
  }

  plan.recommendations = recommendations;
  plan.status = 'completed';
  plan.updatedAt = new Date().toISOString();

  capacityPlans.set(planId, plan);
  return recommendations;
}

/**
 * Get capacity plan by ID
 */
export async function getCapacityPlan(planId: string): Promise<AICapacityPlan | null> {
  return capacityPlans.get(planId) || null;
}

/**
 * List capacity plans for an organization
 */
export async function listCapacityPlans(
  organizationId: string,
  filters?: { status?: CapacityPlanStatus }
): Promise<AICapacityPlan[]> {
  const allPlans = Array.from(capacityPlans.values()).filter(
    (p) => p.organizationId === organizationId
  );

  return allPlans.filter((p) => {
    if (filters?.status && p.status !== filters.status) return false;
    return true;
  });
}

// ─── Helper Types ──────────────────────────────────────────────────────────────

export interface HistoricalWorkloadData {
  workloadType: AIWorkloadType;
  timestamp: string;
  value: number;
}

export interface ResourceMapping {
  workloadType: AIWorkloadType;
  resourceType: ResourceType;
  resourcePerUnit: number;
  unit: string;
  costPerUnit: number;
}
