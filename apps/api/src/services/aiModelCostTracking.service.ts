/**
 * Module 109: AI Model Cost Tracking Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides comprehensive cost tracking for AI models including compute costs,
 * storage costs, inference costs, training costs, and cost allocation across
 * teams, projects, and models.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CostTracker {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  status: TrackerStatus;
  configuration: CostConfiguration;
  costCategories: CostCategory[];
  budgets: Budget[];
  createdAt: string;
  updatedAt: string;
}

export type TrackerStatus = 'active' | 'paused' | 'disabled';

export interface CostConfiguration {
  currency: string;
  costAllocationMethod: 'direct' | 'shared' | 'hybrid';
  taggingEnabled: boolean;
  alertThresholds: AlertThreshold[];
  reportingFrequency: 'daily' | 'weekly' | 'monthly';
  retentionDays: number;
}

export interface AlertThreshold {
  type: 'budget' | 'daily_spend' | 'anomaly' | 'forecast';
  threshold: number;
  percentage?: number;
  notificationChannels: string[];
}

export interface CostCategory {
  id: string;
  name: string;
  type: CostType;
  unit: string;
  unitCost: number;
  enabled: boolean;
}

export type CostType =
  | 'compute_training'
  | 'compute_inference'
  | 'storage'
  | 'network'
  | 'api_calls'
  | 'data_processing'
  | 'gpu_hours'
  | 'memory_hours'
  | 'custom';

export interface Budget {
  id: string;
  name: string;
  amount: number;
  currency: string;
  period: BudgetPeriod;
  startDate: string;
  endDate: string;
  allocatedTo: BudgetAllocation[];
  alerts: BudgetAlert[];
  status: 'active' | 'exceeded' | 'completed';
}

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

export interface BudgetAllocation {
  type: 'model' | 'team' | 'project' | 'department';
  id: string;
  name: string;
  allocatedAmount: number;
  spentAmount: number;
  remainingAmount: number;
}

export interface BudgetAlert {
  id: string;
  type: 'warning' | 'critical' | 'exceeded';
  threshold: number;
  triggeredAt: string;
  currentSpend: number;
  message: string;
}

export interface CostRecord {
  id: string;
  trackerId: string;
  organizationId: string;
  modelId: string;
  timestamp: string;
  category: string;
  amount: number;
  currency: string;
  quantity: number;
  unit: string;
  unitCost: number;
  dimensions: Record<string, string>;
  tags: Record<string, string>;
  metadata: Record<string, any>;
}

export interface CostQuery {
  organizationId: string;
  modelId?: string;
  startTime: string;
  endTime: string;
  categories?: string[];
  dimensions?: Record<string, string>;
  tags?: Record<string, string>;
  groupBy?: string[];
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

export interface CostQueryResult {
  totalCost: number;
  currency: string;
  breakdown: CostBreakdown[];
  timeSeries: CostTimeSeries[];
  statistics: CostStatistics;
}

export interface CostBreakdown {
  category: string;
  amount: number;
  percentage: number;
  dimensions?: Record<string, string>;
}

export interface CostTimeSeries {
  timestamp: string;
  amount: number;
  cumulative: number;
}

export interface CostStatistics {
  average: number;
  min: number;
  max: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  trendPercentage: number;
  forecast?: number;
}

export interface CostAllocation {
  id: string;
  organizationId: string;
  period: string;
  totalCost: number;
  allocations: AllocationEntry[];
  sharedCosts: SharedCost[];
  createdAt: string;
}

export interface AllocationEntry {
  type: 'model' | 'team' | 'project' | 'department';
  id: string;
  name: string;
  directCost: number;
  sharedCost: number;
  totalCost: number;
  percentage: number;
}

export interface SharedCost {
  category: string;
  totalAmount: number;
  allocationMethod: 'equal' | 'usage_based' | 'revenue_based' | 'custom';
  allocations: Array<{
    targetId: string;
    targetName: string;
    amount: number;
    percentage: number;
  }>;
}

export interface CostForecast {
  id: string;
  organizationId: string;
  modelId?: string;
  forecastDate: string;
  period: string;
  forecastedCost: number;
  confidence: number;
  breakdown: CostBreakdown[];
  assumptions: string[];
  recommendations: string[];
  createdAt: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const costTrackers = new Map<string, CostTracker>();
const costRecords = new Map<string, CostRecord[]>();
const budgets = new Map<string, Budget>();
const costAllocations = new Map<string, CostAllocation>();
const costForecasts = new Map<string, CostForecast>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createCostTracker(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  configuration?: Partial<CostConfiguration>;
  costCategories?: Omit<CostCategory, 'id'>[];
}): CostTracker {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultCategories: CostCategory[] = [
    {
      id: randomUUID(),
      name: 'GPU Training Hours',
      type: 'gpu_hours',
      unit: 'hour',
      unitCost: 2.50,
      enabled: true,
    },
    {
      id: randomUUID(),
      name: 'GPU Inference Hours',
      type: 'compute_inference',
      unit: 'hour',
      unitCost: 1.80,
      enabled: true,
    },
    {
      id: randomUUID(),
      name: 'Storage',
      type: 'storage',
      unit: 'GB-month',
      unitCost: 0.023,
      enabled: true,
    },
    {
      id: randomUUID(),
      name: 'Data Transfer',
      type: 'network',
      unit: 'GB',
      unitCost: 0.09,
      enabled: true,
    },
    {
      id: randomUUID(),
      name: 'API Calls',
      type: 'api_calls',
      unit: '1000 calls',
      unitCost: 0.40,
      enabled: true,
    },
  ];

  const tracker: CostTracker = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    status: 'active',
    configuration: {
      currency: 'USD',
      costAllocationMethod: 'direct',
      taggingEnabled: true,
      alertThresholds: [
        { type: 'budget', threshold: 80, percentage: 80, notificationChannels: ['email'] },
        { type: 'daily_spend', threshold: 100, notificationChannels: ['email', 'slack'] },
      ],
      reportingFrequency: 'daily',
      retentionDays: 365,
      ...params.configuration,
    },
    costCategories: params.costCategories?.map(c => ({ ...c, id: randomUUID() })) || defaultCategories,
    budgets: [],
    createdAt: now,
    updatedAt: now,
  };

  costTrackers.set(id, tracker);
  costRecords.set(id, []);

  return tracker;
}

export function getCostTracker(id: string): CostTracker | undefined {
  return costTrackers.get(id);
}

export function listCostTrackers(
  organizationId: string,
  filters?: { modelId?: string; status?: TrackerStatus }
): CostTracker[] {
  let result = Array.from(costTrackers.values()).filter(
    t => t.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(t => t.modelId === filters.modelId);
  if (filters?.status) result = result.filter(t => t.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function recordCost(params: {
  trackerId: string;
  category: string;
  quantity: number;
  dimensions?: Record<string, string>;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
}): CostRecord {
  const tracker = costTrackers.get(params.trackerId);
  if (!tracker) throw new Error(`Cost tracker ${params.trackerId} not found`);

  const costCategory = tracker.costCategories.find(c => c.name === params.category);
  if (!costCategory) throw new Error(`Cost category ${params.category} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const amount = params.quantity * costCategory.unitCost;

  const record: CostRecord = {
    id,
    trackerId: params.trackerId,
    organizationId: tracker.organizationId,
    modelId: tracker.modelId,
    timestamp: now,
    category: params.category,
    amount,
    currency: tracker.configuration.currency,
    quantity: params.quantity,
    unit: costCategory.unit,
    unitCost: costCategory.unitCost,
    dimensions: params.dimensions || {},
    tags: params.tags || {},
    metadata: params.metadata || {},
  };

  const records = costRecords.get(params.trackerId) || [];
  records.push(record);

  // Keep only records within retention period
  const retentionMs = tracker.configuration.retentionDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - retentionMs;
  const filtered = records.filter(r => new Date(r.timestamp).getTime() > cutoff);
  costRecords.set(params.trackerId, filtered);

  // Check budget alerts
  checkBudgetAlerts(tracker, amount);

  return record;
}

function checkBudgetAlerts(tracker: CostTracker, newCost: number): void {
  for (const budget of tracker.budgets) {
    if (budget.status !== 'active') continue;

    const totalSpent = budget.allocatedTo.reduce((sum, a) => sum + a.spentAmount, 0) + newCost;
    const percentage = (totalSpent / budget.amount) * 100;

    for (const alert of budget.alerts) {
      if (percentage >= alert.threshold && !alert.triggeredAt) {
        alert.triggeredAt = new Date().toISOString();
        alert.currentSpend = totalSpent;
        alert.message = `Budget ${budget.name} is ${percentage.toFixed(1)}% utilized`;
      }
    }

    if (totalSpent >= budget.amount) {
      budget.status = 'exceeded';
    }
  }
}

export function queryCosts(query: CostQuery): CostQueryResult {
  const allRecords: CostRecord[] = [];

  for (const [trackerId, records] of costRecords.entries()) {
    const tracker = costTrackers.get(trackerId);
    if (!tracker || tracker.organizationId !== query.organizationId) continue;
    if (query.modelId && tracker.modelId !== query.modelId) continue;

    const filtered = records.filter(r => {
      const ts = new Date(r.timestamp).getTime();
      if (ts < new Date(query.startTime).getTime() || ts > new Date(query.endTime).getTime()) {
        return false;
      }

      if (query.categories && !query.categories.includes(r.category)) return false;

      if (query.dimensions) {
        for (const [key, value] of Object.entries(query.dimensions)) {
          if (r.dimensions[key] !== value) return false;
        }
      }

      if (query.tags) {
        for (const [key, value] of Object.entries(query.tags)) {
          if (r.tags[key] !== value) return false;
        }
      }

      return true;
    });

    allRecords.push(...filtered);
  }

  const totalCost = allRecords.reduce((sum, r) => sum + r.amount, 0);

  // Breakdown by category
  const categoryBreakdown = new Map<string, number>();
  for (const record of allRecords) {
    const current = categoryBreakdown.get(record.category) || 0;
    categoryBreakdown.set(record.category, current + record.amount);
  }

  const breakdown: CostBreakdown[] = Array.from(categoryBreakdown.entries()).map(([category, amount]) => ({
    category,
    amount,
    percentage: totalCost > 0 ? (amount / totalCost) * 100 : 0,
  }));

  // Time series
  const timeSeriesMap = new Map<string, number>();
  for (const record of allRecords) {
    const date = record.timestamp.split('T')[0];
    const current = timeSeriesMap.get(date) || 0;
    timeSeriesMap.set(date, current + record.amount);
  }

  let cumulative = 0;
  const timeSeries: CostTimeSeries[] = Array.from(timeSeriesMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([timestamp, amount]) => {
      cumulative += amount;
      return { timestamp, amount, cumulative };
    });

  // Statistics
  const amounts = allRecords.map(r => r.amount);
  const average = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const min = amounts.length > 0 ? Math.min(...amounts) : 0;
  const max = amounts.length > 0 ? Math.max(...amounts) : 0;

  // Calculate trend
  const firstHalf = timeSeries.slice(0, Math.floor(timeSeries.length / 2));
  const secondHalf = timeSeries.slice(Math.floor(timeSeries.length / 2));
  const firstHalfAvg = firstHalf.length > 0 ? firstHalf.reduce((sum, t) => sum + t.amount, 0) / firstHalf.length : 0;
  const secondHalfAvg = secondHalf.length > 0 ? secondHalf.reduce((sum, t) => sum + t.amount, 0) / secondHalf.length : 0;
  const trendPercentage = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;
  const trend = trendPercentage > 10 ? 'increasing' : trendPercentage < -10 ? 'decreasing' : 'stable';

  return {
    totalCost,
    currency: allRecords[0]?.currency || 'USD',
    breakdown,
    timeSeries,
    statistics: {
      average,
      min,
      max,
      trend,
      trendPercentage,
      forecast: secondHalfAvg * timeSeries.length,
    },
  };
}

export function createBudget(params: {
  trackerId: string;
  name: string;
  amount: number;
  currency?: string;
  period: BudgetPeriod;
  startDate: string;
  endDate: string;
  allocatedTo?: Omit<BudgetAllocation, 'spentAmount' | 'remainingAmount'>[];
}): Budget {
  const tracker = costTrackers.get(params.trackerId);
  if (!tracker) throw new Error(`Cost tracker ${params.trackerId} not found`);

  const id = randomUUID();

  const budget: Budget = {
    id,
    name: params.name,
    amount: params.amount,
    currency: params.currency || tracker.configuration.currency,
    period: params.period,
    startDate: params.startDate,
    endDate: params.endDate,
    allocatedTo: params.allocatedTo?.map(a => ({
      ...a,
      spentAmount: 0,
      remainingAmount: a.allocatedAmount,
    })) || [],
    alerts: [
      {
        id: randomUUID(),
        type: 'warning',
        threshold: 80,
        triggeredAt: '',
        currentSpend: 0,
        message: '',
      },
      {
        id: randomUUID(),
        type: 'critical',
        threshold: 95,
        triggeredAt: '',
        currentSpend: 0,
        message: '',
      },
    ],
    status: 'active',
  };

  tracker.budgets.push(budget);
  budgets.set(id, budget);
  tracker.updatedAt = new Date().toISOString();

  return budget;
}

export function getBudget(id: string): Budget | undefined {
  return budgets.get(id);
}

export function listBudgets(
  organizationId: string,
  filters?: { status?: Budget['status']; period?: BudgetPeriod }
): Budget[] {
  let result = Array.from(budgets.values());

  // Filter by organization through trackers
  const orgTrackerIds = new Set(
    Array.from(costTrackers.values())
      .filter(t => t.organizationId === organizationId)
      .map(t => t.id)
  );

  result = result.filter(b => {
    const tracker = Array.from(costTrackers.values()).find(t => t.budgets.some(budget => budget.id === b.id));
    return tracker && orgTrackerIds.has(tracker.id);
  });

  if (filters?.status) result = result.filter(b => b.status === filters.status);
  if (filters?.period) result = result.filter(b => b.period === filters.period);

  return result.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function updateBudgetSpent(budgetId: string, allocationId: string, amount: number): Budget {
  const budget = budgets.get(budgetId);
  if (!budget) throw new Error(`Budget ${budgetId} not found`);

  const allocation = budget.allocatedTo.find(a => a.id === allocationId);
  if (!allocation) throw new Error(`Allocation ${allocationId} not found`);

  allocation.spentAmount += amount;
  allocation.remainingAmount = allocation.allocatedAmount - allocation.spentAmount;

  return budget;
}

export function allocateCosts(params: {
  organizationId: string;
  period: string;
  sharedCostAllocationMethod?: 'equal' | 'usage_based' | 'revenue_based';
}): CostAllocation {
  const now = new Date().toISOString();
  const id = randomUUID();

  const trackers = Array.from(costTrackers.values()).filter(
    t => t.organizationId === params.organizationId
  );

  let totalCost = 0;
  const allocations: AllocationEntry[] = [];

  for (const tracker of trackers) {
    const records = costRecords.get(tracker.id) || [];
    const periodRecords = records.filter(r => {
      const month = r.timestamp.substring(0, 7);
      return month === params.period;
    });

    const directCost = periodRecords.reduce((sum, r) => sum + r.amount, 0);
    totalCost += directCost;

    allocations.push({
      type: 'model',
      id: tracker.modelId,
      name: tracker.modelName,
      directCost,
      sharedCost: 0,
      totalCost: directCost,
      percentage: 0,
    });
  }

  // Calculate percentages
  for (const allocation of allocations) {
    allocation.percentage = totalCost > 0 ? (allocation.totalCost / totalCost) * 100 : 0;
  }

  const allocation: CostAllocation = {
    id,
    organizationId: params.organizationId,
    period: params.period,
    totalCost,
    allocations,
    sharedCosts: [],
    createdAt: now,
  };

  costAllocations.set(id, allocation);
  return allocation;
}

export function getCostAllocation(id: string): CostAllocation | undefined {
  return costAllocations.get(id);
}

export function listCostAllocations(
  organizationId: string,
  filters?: { period?: string }
): CostAllocation[] {
  let result = Array.from(costAllocations.values()).filter(
    a => a.organizationId === organizationId
  );

  if (filters?.period) result = result.filter(a => a.period === filters.period);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function generateCostForecast(params: {
  organizationId: string;
  modelId?: string;
  period: string;
  monthsAhead?: number;
}): CostForecast {
  const now = new Date().toISOString();
  const id = randomUUID();

  const query: CostQuery = {
    organizationId: params.organizationId,
    modelId: params.modelId,
    startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    endTime: now,
  };

  const historicalData = queryCosts(query);
  const monthlyAverage = historicalData.totalCost / 3; // 3 months of data

  const monthsAhead = params.monthsAhead || 3;
  const forecastedCost = monthlyAverage * monthsAhead;

  const forecast: CostForecast = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    forecastDate: now,
    period: params.period,
    forecastedCost,
    confidence: 0.75,
    breakdown: historicalData.breakdown,
    assumptions: [
      'Historical spending patterns will continue',
      'No major changes in usage or pricing',
      'Seasonal patterns are consistent',
    ],
    recommendations: [
      forecastedCost > monthlyAverage * 4 ? 'Consider cost optimization strategies' : 'Current spending is within expected range',
      historicalData.statistics.trend === 'increasing' ? 'Investigate increasing cost trend' : 'Cost trend is stable',
    ],
    createdAt: now,
  };

  costForecasts.set(id, forecast);
  return forecast;
}

export function getCostForecast(id: string): CostForecast | undefined {
  return costForecasts.get(id);
}

export function listCostForecasts(
  organizationId: string,
  filters?: { modelId?: string }
): CostForecast[] {
  let result = Array.from(costForecasts.values()).filter(
    f => f.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(f => f.modelId === filters.modelId);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCostSummary(
  organizationId: string,
  period: string
): {
  totalCost: number;
  byModel: Array<{ modelId: string; modelName: string; cost: number; percentage: number }>;
  byCategory: Array<{ category: string; cost: number; percentage: number }>;
  trend: 'increasing' | 'decreasing' | 'stable';
  budgetUtilization: number;
} {
  const trackers = Array.from(costTrackers.values()).filter(
    t => t.organizationId === organizationId
  );

  let totalCost = 0;
  const byModel = new Map<string, { modelName: string; cost: number }>();
  const byCategory = new Map<string, number>();

  for (const tracker of trackers) {
    const records = costRecords.get(tracker.id) || [];
    const periodRecords = records.filter(r => r.timestamp.substring(0, 7) === period);

    for (const record of periodRecords) {
      totalCost += record.amount;

      const modelEntry = byModel.get(tracker.modelId) || { modelName: tracker.modelName, cost: 0 };
      modelEntry.cost += record.amount;
      byModel.set(tracker.modelId, modelEntry);

      const categoryCost = byCategory.get(record.category) || 0;
      byCategory.set(record.category, categoryCost + record.amount);
    }
  }

  const byModelArray = Array.from(byModel.entries()).map(([modelId, data]) => ({
    modelId,
    modelName: data.modelName,
    cost: data.cost,
    percentage: totalCost > 0 ? (data.cost / totalCost) * 100 : 0,
  }));

  const byCategoryArray = Array.from(byCategory.entries()).map(([category, cost]) => ({
    category,
    cost,
    percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
  }));

  // Calculate budget utilization
  const activeBudgets = Array.from(budgets.values()).filter(b => b.status === 'active');
  const totalBudget = activeBudgets.reduce((sum, b) => sum + b.amount, 0);
  const budgetUtilization = totalBudget > 0 ? (totalCost / totalBudget) * 100 : 0;

  return {
    totalCost,
    byModel: byModelArray,
    byCategory: byCategoryArray,
    trend: 'stable', // Would calculate from time series
    budgetUtilization,
  };
}
