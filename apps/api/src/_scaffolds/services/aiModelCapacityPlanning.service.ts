/**
 * Module 136: AI Model Capacity Planning Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides capacity planning capabilities for AI models including resource forecasting,
 * demand prediction, scaling recommendations, cost optimization, and capacity analysis
 * to ensure optimal resource allocation and performance.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CapacityPlan {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: CapacityPlanStatus;
  modelId: string;
  modelVersion: string;
  currentCapacity: CurrentCapacity;
  demandForecast: DemandForecast;
  resourceRequirements: ResourceRequirements;
  scalingStrategy: ScalingStrategy;
  costAnalysis: CostAnalysis;
  recommendations: CapacityRecommendation[];
  scenarios: CapacityScenario[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type CapacityPlanStatus =
  | 'draft'
  | 'analyzing'
  | 'completed'
  | 'approved'
  | 'implemented'
  | 'archived';

export interface CurrentCapacity {
  instances: InstanceCapacity[];
  totalResources: ResourceSummary;
  utilization: UtilizationMetrics;
  performance: PerformanceBaseline;
  collectedAt: string;
}

export interface InstanceCapacity {
  instanceId: string;
  instanceType: string;
  region: string;
  resources: ResourceAllocation;
  status: 'running' | 'stopped' | 'terminated';
  cost: number;
}

export interface ResourceAllocation {
  cpu: number; // cores
  memory: number; // GB
  gpu?: number; // count
  gpuMemory?: number; // GB
  storage: number; // GB
  network: number; // Mbps
}

export interface ResourceSummary {
  totalCpu: number;
  totalMemory: number;
  totalGpu: number;
  totalStorage: number;
  totalNetwork: number;
}

export interface UtilizationMetrics {
  cpu: UtilizationMetric;
  memory: UtilizationMetric;
  gpu?: UtilizationMetric;
  network: UtilizationMetric;
  storage: UtilizationMetric;
}

export interface UtilizationMetric {
  current: number; // percentage
  average: number;
  peak: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  forecast: number[]; // next 7 days
}

export interface PerformanceBaseline {
  throughput: number; // requests per second
  latency: number; // milliseconds
  errorRate: number; // percentage
  concurrentUsers: number;
}

export interface DemandForecast {
  period: ForecastPeriod;
  predictions: DemandPrediction[];
  confidence: number;
  methodology: string;
  assumptions: string[];
  seasonality: SeasonalityPattern;
}

export type ForecastPeriod = '7_days' | '30_days' | '90_days' | '180_days' | '365_days';

export interface DemandPrediction {
  timestamp: string;
  predictedRequests: number;
  predictedConcurrentUsers: number;
  predictedThroughput: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
}

export interface SeasonalityPattern {
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
  yearly: boolean;
  peakHours: number[];
  peakDays: number[];
}

export interface ResourceRequirements {
  current: ResourceRequirement;
  forecasted: ResourceRequirement;
  recommended: ResourceRequirement;
  gap: ResourceGap;
}

export interface ResourceRequirement {
  cpu: number;
  memory: number;
  gpu: number;
  storage: number;
  network: number;
  instances: number;
  timestamp: string;
}

export interface ResourceGap {
  cpu: number;
  memory: number;
  gpu: number;
  storage: number;
  network: number;
  instances: number;
  critical: boolean;
}

export interface ScalingStrategy {
  type: ScalingType;
  horizontal: HorizontalScaling;
  vertical: VerticalScaling;
  autoScaling: AutoScalingConfig;
  schedule: ScalingSchedule[];
}

export type ScalingType = 'horizontal' | 'vertical' | 'mixed' | 'manual';

export interface HorizontalScaling {
  enabled: boolean;
  minInstances: number;
  maxInstances: number;
  currentInstances: number;
  targetInstances: number;
  scalingIncrement: number;
  cooldownPeriod: number; // seconds
}

export interface VerticalScaling {
  enabled: boolean;
  currentInstanceType: string;
  recommendedInstanceType: string;
  upgradePath: string[];
  downtime: boolean;
}

export interface AutoScalingConfig {
  enabled: boolean;
  metrics: ScalingMetric[];
  thresholds: ScalingThresholds;
  policies: ScalingPolicy[];
}

export interface ScalingMetric {
  name: string;
  type: 'cpu' | 'memory' | 'gpu' | 'requests' | 'latency' | 'custom';
  weight: number;
}

export interface ScalingThresholds {
  scaleUp: number; // percentage
  scaleDown: number; // percentage
  stabilizationWindow: number; // seconds
}

export interface ScalingPolicy {
  name: string;
  type: 'target_tracking' | 'step_scaling' | 'simple_scaling';
  configuration: Record<string, any>;
}

export interface ScalingSchedule {
  name: string;
  schedule: string; // cron expression
  minInstances: number;
  maxInstances: number;
  timezone: string;
  enabled: boolean;
}

export interface CostAnalysis {
  current: CostBreakdown;
  forecasted: CostBreakdown;
  optimized: CostBreakdown;
  savings: CostSavings;
  roi: ROIAnalysis;
}

export interface CostBreakdown {
  compute: number;
  storage: number;
  network: number;
  gpu: number;
  other: number;
  total: number;
  period: 'hourly' | 'daily' | 'monthly' | 'yearly';
  timestamp: string;
}

export interface CostSavings {
  amount: number;
  percentage: number;
  period: 'monthly' | 'yearly';
  recommendations: string[];
}

export interface ROIAnalysis {
  investment: number;
  returns: number;
  roi: number; // percentage
  paybackPeriod: number; // months
  npv: number; // net present value
}

export interface CapacityRecommendation {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'scaling' | 'optimization' | 'cost' | 'performance' | 'reliability';
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  costImpact: number;
  timeline: string;
  actionItems: string[];
  dependencies: string[];
}

export interface CapacityScenario {
  id: string;
  name: string;
  description: string;
  assumptions: string[];
  demandMultiplier: number;
  resourceRequirements: ResourceRequirement;
  cost: CostBreakdown;
  risks: ScenarioRisk[];
  probability: number;
}

export interface ScenarioRisk {
  risk: string;
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface CapacityReport {
  id: string;
  planId: string;
  executiveSummary: string;
  currentState: CurrentCapacity;
  forecast: DemandForecast;
  recommendations: CapacityRecommendation[];
  costAnalysis: CostAnalysis;
  implementationPlan: ImplementationPlan;
  appendices: ReportAppendix[];
  generatedAt: string;
}

export interface ImplementationPlan {
  phases: ImplementationPhase[];
  timeline: string;
  totalCost: number;
  totalSavings: number;
  risks: string[];
  dependencies: string[];
}

export interface ImplementationPhase {
  phase: number;
  name: string;
  description: string;
  duration: string;
  actions: string[];
  cost: number;
  savings: number;
  dependencies: string[];
}

export interface ReportAppendix {
  title: string;
  content: string;
  data?: any;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const capacityPlans = new Map<string, CapacityPlan>();
const capacityReports = new Map<string, CapacityReport>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateDemandForecast(
  currentThroughput: number,
  period: ForecastPeriod,
  growthRate: number
): DemandForecast {
  const days = period === '7_days' ? 7 : period === '30_days' ? 30 : period === '90_days' ? 90 : period === '180_days' ? 180 : 365;
  const predictions: DemandPrediction[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const timestamp = new Date(now.getTime() + i * 24 * 60 * 60 * 1000).toISOString();
    const growthFactor = 1 + (growthRate / 100) * (i / days);
    const predictedRequests = currentThroughput * 86400 * growthFactor; // daily requests
    const predictedConcurrentUsers = Math.floor(predictedRequests / 86400 * 100); // assume 100 sec session
    const predictedThroughput = currentThroughput * growthFactor;
    const confidence = Math.max(0.5, 1 - (i / days) * 0.5);

    predictions.push({
      timestamp,
      predictedRequests: Math.floor(predictedRequests),
      predictedConcurrentUsers,
      predictedThroughput: Number(predictedThroughput.toFixed(2)),
      confidence,
      lowerBound: predictedRequests * 0.8,
      upperBound: predictedRequests * 1.2,
    });
  }

  return {
    period,
    predictions,
    confidence: 0.85,
    methodology: 'Time series analysis with trend extrapolation',
    assumptions: [
      `Growth rate: ${growthRate}% over ${period}`,
      'Seasonal patterns remain consistent',
      'No major product changes',
    ],
    seasonality: {
      daily: true,
      weekly: true,
      monthly: false,
      yearly: false,
      peakHours: [9, 10, 11, 14, 15, 16],
      peakDays: [1, 2, 3, 4, 5], // Monday to Friday
    },
  };
}

function calculateResourceRequirements(
  currentCapacity: CurrentCapacity,
  demandForecast: DemandForecast
): ResourceRequirements {
  const currentThroughput = currentCapacity.performance.throughput;
  const forecastedThroughput = demandForecast.predictions[demandForecast.predictions.length - 1].predictedThroughput;
  const growthFactor = forecastedThroughput / currentThroughput;

  const current: ResourceRequirement = {
    cpu: currentCapacity.totalResources.totalCpu,
    memory: currentCapacity.totalResources.totalMemory,
    gpu: currentCapacity.totalResources.totalGpu,
    storage: currentCapacity.totalResources.totalStorage,
    network: currentCapacity.totalResources.totalNetwork,
    instances: currentCapacity.instances.length,
    timestamp: currentCapacity.collectedAt,
  };

  const forecasted: ResourceRequirement = {
    cpu: current.cpu * growthFactor,
    memory: current.memory * growthFactor,
    gpu: current.gpu * growthFactor,
    storage: current.storage * (1 + (growthFactor - 1) * 0.5), // storage grows slower
    network: current.network * growthFactor,
    instances: Math.ceil(current.instances * growthFactor),
    timestamp: demandForecast.predictions[demandForecast.predictions.length - 1].timestamp,
  };

  const recommended: ResourceRequirement = {
    cpu: forecasted.cpu * 1.2, // 20% buffer
    memory: forecasted.memory * 1.2,
    gpu: forecasted.gpu * 1.1, // 10% buffer for GPU
    storage: forecasted.storage * 1.3, // 30% buffer for storage
    network: forecasted.network * 1.2,
    instances: Math.ceil(forecasted.instances * 1.2),
    timestamp: forecasted.timestamp,
  };

  const gap: ResourceGap = {
    cpu: recommended.cpu - current.cpu,
    memory: recommended.memory - current.memory,
    gpu: recommended.gpu - current.gpu,
    storage: recommended.storage - current.storage,
    network: recommended.network - current.network,
    instances: recommended.instances - current.instances,
    critical: growthFactor > 2, // critical if doubling
  };

  return { current, forecasted, recommended, gap };
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createCapacityPlan(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelVersion: string;
  currentCapacity: CurrentCapacity;
  forecastPeriod: ForecastPeriod;
  growthRate: number;
  createdBy: string;
}): CapacityPlan {
  const now = new Date().toISOString();
  const id = randomUUID();

  const demandForecast = generateDemandForecast(
    params.currentCapacity.performance.throughput,
    params.forecastPeriod,
    params.growthRate
  );

  const resourceRequirements = calculateResourceRequirements(
    params.currentCapacity,
    demandForecast
  );

  const plan: CapacityPlan = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'analyzing',
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    currentCapacity: params.currentCapacity,
    demandForecast,
    resourceRequirements,
    scalingStrategy: {
      type: 'horizontal',
      horizontal: {
        enabled: true,
        minInstances: params.currentCapacity.instances.length,
        maxInstances: resourceRequirements.recommended.instances * 2,
        currentInstances: params.currentCapacity.instances.length,
        targetInstances: resourceRequirements.recommended.instances,
        scalingIncrement: 1,
        cooldownPeriod: 300,
      },
      vertical: {
        enabled: false,
        currentInstanceType: params.currentCapacity.instances[0]?.instanceType || 'unknown',
        recommendedInstanceType: 'larger',
        upgradePath: [],
        downtime: true,
      },
      autoScaling: {
        enabled: true,
        metrics: [
          { name: 'CPU Utilization', type: 'cpu', weight: 0.3 },
          { name: 'Memory Utilization', type: 'memory', weight: 0.3 },
          { name: 'Request Rate', type: 'requests', weight: 0.4 },
        ],
        thresholds: {
          scaleUp: 70,
          scaleDown: 30,
          stabilizationWindow: 300,
        },
        policies: [
          {
            name: 'Target Tracking',
            type: 'target_tracking',
            configuration: {
              targetValue: 60,
              scaleInCooldown: 300,
              scaleOutCooldown: 60,
            },
          },
        ],
      },
      schedule: [
        {
          name: 'Business Hours',
          schedule: '0 9 * * 1-5', // 9 AM Monday-Friday
          minInstances: resourceRequirements.recommended.instances,
          maxInstances: resourceRequirements.recommended.instances * 1.5,
          timezone: 'UTC',
          enabled: true,
        },
      ],
    },
    costAnalysis: {
      current: {
        compute: params.currentCapacity.instances.length * 100,
        storage: params.currentCapacity.totalResources.totalStorage * 0.1,
        network: params.currentCapacity.totalResources.totalNetwork * 0.05,
        gpu: params.currentCapacity.totalResources.totalGpu * 500,
        other: 50,
        total: 0,
        period: 'monthly',
        timestamp: now,
      },
      forecasted: {
        compute: resourceRequirements.forecasted.instances * 100,
        storage: resourceRequirements.forecasted.storage * 0.1,
        network: resourceRequirements.forecasted.network * 0.05,
        gpu: resourceRequirements.forecasted.gpu * 500,
        other: 50,
        total: 0,
        period: 'monthly',
        timestamp: resourceRequirements.forecasted.timestamp,
      },
      optimized: {
        compute: resourceRequirements.recommended.instances * 80, // optimized pricing
        storage: resourceRequirements.recommended.storage * 0.08,
        network: resourceRequirements.recommended.network * 0.04,
        gpu: resourceRequirements.recommended.gpu * 450,
        other: 50,
        total: 0,
        period: 'monthly',
        timestamp: resourceRequirements.recommended.timestamp,
      },
      savings: {
        amount: 0,
        percentage: 0,
        period: 'monthly',
        recommendations: [],
      },
      roi: {
        investment: 0,
        returns: 0,
        roi: 0,
        paybackPeriod: 0,
        npv: 0,
      },
    },
    recommendations: [],
    scenarios: [],
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  // Calculate totals
  plan.costAnalysis.current.total = 
    plan.costAnalysis.current.compute +
    plan.costAnalysis.current.storage +
    plan.costAnalysis.current.network +
    plan.costAnalysis.current.gpu +
    plan.costAnalysis.current.other;

  plan.costAnalysis.forecasted.total = 
    plan.costAnalysis.forecasted.compute +
    plan.costAnalysis.forecasted.storage +
    plan.costAnalysis.forecasted.network +
    plan.costAnalysis.forecasted.gpu +
    plan.costAnalysis.forecasted.other;

  plan.costAnalysis.optimized.total = 
    plan.costAnalysis.optimized.compute +
    plan.costAnalysis.optimized.storage +
    plan.costAnalysis.optimized.network +
    plan.costAnalysis.optimized.gpu +
    plan.costAnalysis.optimized.other;

  plan.costAnalysis.savings.amount = plan.costAnalysis.forecasted.total - plan.costAnalysis.optimized.total;
  plan.costAnalysis.savings.percentage = (plan.costAnalysis.savings.amount / plan.costAnalysis.forecasted.total) * 100;

  // Generate recommendations
  if (resourceRequirements.gap.critical) {
    plan.recommendations.push({
      id: randomUUID(),
      priority: 'critical',
      category: 'scaling',
      title: 'Immediate Scaling Required',
      description: `Demand is projected to ${params.growthRate > 100 ? 'more than double' : 'grow significantly'}`,
      impact: 'Service degradation or outage if not addressed',
      effort: 'high',
      costImpact: plan.costAnalysis.forecasted.total - plan.costAnalysis.current.total,
      timeline: 'Immediate',
      actionItems: [
        'Scale horizontally to recommended instances',
        'Implement auto-scaling policies',
        'Review and optimize resource allocation',
      ],
      dependencies: [],
    });
  }

  if (plan.costAnalysis.savings.percentage > 10) {
    plan.recommendations.push({
      id: randomUUID(),
      priority: 'high',
      category: 'cost',
      title: 'Cost Optimization Opportunity',
      description: `Potential to save ${plan.costAnalysis.savings.percentage.toFixed(1)}% through optimization`,
      impact: `Save $${plan.costAnalysis.savings.amount.toFixed(2)} per month`,
      effort: 'medium',
      costImpact: -plan.costAnalysis.savings.amount,
      timeline: '30 days',
      actionItems: [
        'Use reserved instances for baseline capacity',
        'Implement spot instances for non-critical workloads',
        'Optimize resource allocation',
      ],
      dependencies: [],
    });
  }

  plan.recommendations.push({
    id: randomUUID(),
    priority: 'medium',
    category: 'scaling',
    title: 'Implement Auto-Scaling',
    description: 'Configure auto-scaling based on demand patterns',
    impact: 'Improved resource utilization and cost efficiency',
    effort: 'medium',
    costImpact: 0,
    timeline: '14 days',
    actionItems: [
      'Configure auto-scaling policies',
      'Set up monitoring and alerting',
      'Test scaling behavior',
    ],
    dependencies: [],
  });

  // Generate scenarios
  plan.scenarios = [
    {
      id: randomUUID(),
      name: 'Conservative Growth',
      description: 'Lower than expected growth',
      assumptions: ['Growth rate 50% of forecast', 'Stable usage patterns'],
      demandMultiplier: 0.5,
      resourceRequirements: {
        cpu: resourceRequirements.forecasted.cpu * 0.5,
        memory: resourceRequirements.forecasted.memory * 0.5,
        gpu: resourceRequirements.forecasted.gpu * 0.5,
        storage: resourceRequirements.forecasted.storage * 0.7,
        network: resourceRequirements.forecasted.network * 0.5,
        instances: Math.ceil(resourceRequirements.forecasted.instances * 0.5),
        timestamp: resourceRequirements.forecasted.timestamp,
      },
      cost: {
        compute: plan.costAnalysis.forecasted.compute * 0.5,
        storage: plan.costAnalysis.forecasted.storage * 0.7,
        network: plan.costAnalysis.forecasted.network * 0.5,
        gpu: plan.costAnalysis.forecasted.gpu * 0.5,
        other: plan.costAnalysis.forecasted.other,
        total: 0,
        period: 'monthly',
        timestamp: resourceRequirements.forecasted.timestamp,
      },
      risks: [
        {
          risk: 'Under-provisioning if growth exceeds expectations',
          probability: 'medium',
          impact: 'high',
          mitigation: 'Monitor closely and have scaling plan ready',
        },
      ],
      probability: 0.3,
    },
    {
      id: randomUUID(),
      name: 'Expected Growth',
      description: 'Growth matches forecast',
      assumptions: ['Growth rate as forecasted', 'Normal seasonality'],
      demandMultiplier: 1.0,
      resourceRequirements: resourceRequirements.forecasted,
      cost: plan.costAnalysis.forecasted,
      risks: [],
      probability: 0.5,
    },
    {
      id: randomUUID(),
      name: 'Aggressive Growth',
      description: 'Higher than expected growth',
      assumptions: ['Growth rate 150% of forecast', 'Increased usage'],
      demandMultiplier: 1.5,
      resourceRequirements: {
        cpu: resourceRequirements.forecasted.cpu * 1.5,
        memory: resourceRequirements.forecasted.memory * 1.5,
        gpu: resourceRequirements.forecasted.gpu * 1.5,
        storage: resourceRequirements.forecasted.storage * 1.3,
        network: resourceRequirements.forecasted.network * 1.5,
        instances: Math.ceil(resourceRequirements.forecasted.instances * 1.5),
        timestamp: resourceRequirements.forecasted.timestamp,
      },
      cost: {
        compute: plan.costAnalysis.forecasted.compute * 1.5,
        storage: plan.costAnalysis.forecasted.storage * 1.3,
        network: plan.costAnalysis.forecasted.network * 1.5,
        gpu: plan.costAnalysis.forecasted.gpu * 1.5,
        other: plan.costAnalysis.forecasted.other,
        total: 0,
        period: 'monthly',
        timestamp: resourceRequirements.forecasted.timestamp,
      },
      risks: [
        {
          risk: 'Resource constraints and capacity issues',
          probability: 'high',
          impact: 'critical',
          mitigation: 'Pre-provision additional capacity',
        },
      ],
      probability: 0.2,
    },
  ];

  // Calculate scenario totals
  plan.scenarios.forEach(scenario => {
    scenario.cost.total = 
      scenario.cost.compute +
      scenario.cost.storage +
      scenario.cost.network +
      scenario.cost.gpu +
      scenario.cost.other;
  });

  plan.status = 'completed';
  capacityPlans.set(id, plan);

  return plan;
}

export function getCapacityPlan(id: string): CapacityPlan | undefined {
  return capacityPlans.get(id);
}

export function listCapacityPlans(
  organizationId: string,
  filters?: { status?: CapacityPlanStatus; modelId?: string }
): CapacityPlan[] {
  let result = Array.from(capacityPlans.values()).filter(
    p => p.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(p => p.status === filters.status);
  if (filters?.modelId) result = result.filter(p => p.modelId === filters.modelId);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function approveCapacityPlan(planId: string): CapacityPlan {
  const plan = capacityPlans.get(planId);
  if (!plan) throw new Error(`Capacity plan ${planId} not found`);

  if (plan.status !== 'completed') {
    throw new Error('Plan must be completed before approval');
  }

  plan.status = 'approved';
  plan.updatedAt = new Date().toISOString();

  return plan;
}

export function implementCapacityPlan(planId: string): CapacityPlan {
  const plan = capacityPlans.get(planId);
  if (!plan) throw new Error(`Capacity plan ${planId} not found`);

  if (plan.status !== 'approved') {
    throw new Error('Plan must be approved before implementation');
  }

  plan.status = 'implemented';
  plan.updatedAt = new Date().toISOString();

  return plan;
}

export function generateCapacityReport(planId: string): CapacityReport {
  const plan = capacityPlans.get(planId);
  if (!plan) throw new Error(`Capacity plan ${planId} not found`);

  if (plan.status !== 'completed' && plan.status !== 'approved' && plan.status !== 'implemented') {
    throw new Error('Plan must be completed, approved, or implemented');
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  const executiveSummary = `Capacity plan "${plan.name}" forecasts ${plan.demandForecast.predictions.length} days of demand with ` +
    `${plan.resourceRequirements.gap.critical ? 'critical' : 'manageable'} resource gaps. ` +
    `Recommended scaling to ${plan.resourceRequirements.recommended.instances} instances with ` +
    `potential cost savings of $${plan.costAnalysis.savings.amount.toFixed(2)}/month (${plan.costAnalysis.savings.percentage.toFixed(1)}%).`;

  const implementationPlan: ImplementationPlan = {
    phases: [
      {
        phase: 1,
        name: 'Immediate Scaling',
        description: 'Scale to meet current demand',
        duration: '1-2 days',
        actions: [
          'Add instances to reach recommended count',
          'Configure load balancing',
          'Test scaling',
        ],
        cost: plan.costAnalysis.forecasted.total - plan.costAnalysis.current.total,
        savings: 0,
        dependencies: [],
      },
      {
        phase: 2,
        name: 'Auto-Scaling Setup',
        description: 'Implement auto-scaling policies',
        duration: '1-2 weeks',
        actions: [
          'Configure auto-scaling rules',
          'Set up monitoring',
          'Test scaling behavior',
        ],
        cost: 0,
        savings: plan.costAnalysis.savings.amount * 0.3,
        dependencies: ['Phase 1'],
      },
      {
        phase: 3,
        name: 'Cost Optimization',
        description: 'Optimize costs through reserved instances and spot instances',
        duration: '2-4 weeks',
        actions: [
          'Purchase reserved instances',
          'Configure spot instances',
          'Optimize resource allocation',
        ],
        cost: 0,
        savings: plan.costAnalysis.savings.amount * 0.7,
        dependencies: ['Phase 2'],
      },
    ],
    timeline: '4-6 weeks',
    totalCost: plan.costAnalysis.forecasted.total - plan.costAnalysis.current.total,
    totalSavings: plan.costAnalysis.savings.amount,
    risks: [
      'Scaling may cause temporary service disruption',
      'Cost optimization requires careful planning',
    ],
    dependencies: [
      'Infrastructure team approval',
      'Budget approval',
    ],
  };

  const report: CapacityReport = {
    id,
    planId,
    executiveSummary,
    currentState: plan.currentCapacity,
    forecast: plan.demandForecast,
    recommendations: plan.recommendations,
    costAnalysis: plan.costAnalysis,
    implementationPlan,
    appendices: [],
    generatedAt: now,
  };

  capacityReports.set(id, report);
  return report;
}

export function getCapacityReport(id: string): CapacityReport | undefined {
  return capacityReports.get(id);
}

export function updateCapacityForecast(
  planId: string,
  newGrowthRate: number
): CapacityPlan {
  const plan = capacityPlans.get(planId);
  if (!plan) throw new Error(`Capacity plan ${planId} not found`);

  if (plan.status === 'implemented') {
    throw new Error('Cannot update implemented plan');
  }

  plan.demandForecast = generateDemandForecast(
    plan.currentCapacity.performance.throughput,
    plan.demandForecast.period,
    newGrowthRate
  );

  plan.resourceRequirements = calculateResourceRequirements(
    plan.currentCapacity,
    plan.demandForecast
  );

  plan.updatedAt = new Date().toISOString();

  return plan;
}

export function getCapacityUtilization(planId: string): UtilizationMetrics | undefined {
  const plan = capacityPlans.get(planId);
  if (!plan) throw new Error(`Capacity plan ${planId} not found`);

  return plan.currentCapacity.utilization;
}

export function getCostProjections(planId: string): CostAnalysis | undefined {
  const plan = capacityPlans.get(planId);
  if (!plan) throw new Error(`Capacity plan ${planId} not found`);

  return plan.costAnalysis;
}
