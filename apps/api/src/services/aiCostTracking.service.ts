/**
 * Module 62: AI Cost Tracking Service
 *
 * Provides granular cost tracking for AI workloads including per-model and per-request
 * cost metering, usage tracking across multiple dimensions (tokens, GPU hours, API calls),
 * budget management with configurable thresholds and alerts, cost allocation by
 * team/project/deployment, and comprehensive cost reports and dashboards.
 *
 * Phase 1 — Critical Gap: AI-specific cost tracking and budget management
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CostEventType = "inference" | "training" | "fine-tuning" | "embedding" | "storage" | "compute" | "network" | "api-call" | "token-generation" | "batch-job";

export type BudgetStatus = "on-track" | "warning" | "exceeded" | "critical";

export type BillingPeriod = "hourly" | "daily" | "weekly" | "monthly" | "quarterly" | "annual";

export type CostAllocationType = "team" | "project" | "deployment" | "model" | "environment" | "custom";

export type AlertChannel = "email" | "slack" | "webhook" | "dashboard";

export interface CostEvent {
  id: string;
  organizationId: string;
  type: CostEventType;
  model: CostModel;
  usage: CostUsage;
  pricing: CostPricing;
  totalCost: number;
  allocation: CostAllocation;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface CostModel {
  modelId: string;
  modelName: string;
  modelVersion: string;
  provider: string;
  deploymentId?: string;
  endpoint?: string;
  hardware?: string;
}

export interface CostUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  gpuHours?: number;
  cpuHours?: number;
  memoryGbHours?: number;
  storageGbHours?: number;
  networkGb?: number;
  apiCalls?: number;
  inferenceCount?: number;
  batchJobs?: number;
  durationMs?: number;
}

export interface CostPricing {
  inputTokenPrice?: number;
  outputTokenPrice?: number;
  gpuHourPrice?: number;
  cpuHourPrice?: number;
  memoryGbHourPrice?: number;
  storageGbHourPrice?: number;
  networkGbPrice?: number;
  apiCallPrice?: number;
  inferencePrice?: number;
  currency: string;
  pricingTier?: string;
  discountPercent?: number;
}

export interface CostAllocation {
  teamId?: string;
  teamName?: string;
  projectId?: string;
  projectName?: string;
  deploymentId?: string;
  deploymentName?: string;
  environment?: string;
  costCenter?: string;
  tags: Record<string, string>;
}

export interface Budget {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  period: BillingPeriod;
  scope: BudgetScope;
  status: BudgetStatus;
  alerts: BudgetAlert[];
  currentSpend: number;
  forecastedSpend: number;
  utilizationPercent: number;
  startDate: string;
  endDate: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetScope {
  type: CostAllocationType;
  targetIds: string[];
  modelIds?: string[];
  costEventTypes?: CostEventType[];
  environments?: string[];
  tags?: Record<string, string>;
}

export interface BudgetAlert {
  id: string;
  thresholdPercent: number;
  channels: AlertChannel[];
  recipients: string[];
  triggeredAt?: string;
  acknowledgedAt?: string;
  message: string;
}

export interface CostReport {
  id: string;
  organizationId: string;
  name: string;
  period: { start: string; end: string };
  totalCost: number;
  currency: string;
  breakdown: CostBreakdown;
  trends: CostTrend[];
  topCostDrivers: CostDriver[];
  budgetCompliance: BudgetCompliance[];
  generatedAt: string;
}

export interface CostBreakdown {
  byModel: Array<{ modelId: string; modelName: string; cost: number; percent: number; usageCount: number }>;
  byType: Array<{ type: CostEventType; cost: number; percent: number; count: number }>;
  byTeam: Array<{ teamId: string; teamName: string; cost: number; percent: number }>;
  byProject: Array<{ projectId: string; projectName: string; cost: number; percent: number }>;
  byEnvironment: Array<{ environment: string; cost: number; percent: number }>;
  byProvider: Array<{ provider: string; cost: number; percent: number }>;
}

export interface CostTrend {
  period: string;
  cost: number;
  previousCost: number;
  changePercent: number;
  usageCount: number;
}

export interface CostDriver {
  modelId: string;
  modelName: string;
  cost: number;
  percentOfTotal: number;
  usageCount: number;
  averageCostPerRequest: number;
  trend: "increasing" | "stable" | "decreasing";
}

export interface BudgetCompliance {
  budgetId: string;
  budgetName: string;
  allocatedAmount: number;
  actualSpend: number;
  utilizationPercent: number;
  status: BudgetStatus;
  forecastedSpend: number;
  forecastedOverage: number;
}

export interface CostTrackingStats {
  totalEvents: number;
  totalCost: number;
  averageCostPerRequest: number;
  costByModel: Record<string, number>;
  costByType: Record<string, number>;
  costByTeam: Record<string, number>;
  budgetCount: number;
  budgetsExceeded: number;
  dailyCostTrend: Array<{ date: string; cost: number }>;
  topModels: Array<{ modelId: string; modelName: string; cost: number; requestCount: number }>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const costEvents = new Map<string, CostEvent>();
const budgets = new Map<string, Budget>();
const reports = new Map<string, CostReport>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Record a cost event
 */
export async function recordCostEvent(params: {
  organizationId: string;
  type: CostEventType;
  model: CostModel;
  usage: CostUsage;
  pricing: CostPricing;
  allocation: CostAllocation;
  metadata?: Record<string, unknown>;
}): Promise<CostEvent> {
  const totalCost = calculateCost(params.usage, params.pricing);

  const event: CostEvent = {
    id: `ce_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    type: params.type,
    model: params.model,
    usage: params.usage,
    pricing: params.pricing,
    totalCost,
    allocation: params.allocation,
    metadata: params.metadata ?? {},
    timestamp: new Date().toISOString(),
  };

  costEvents.set(event.id, event);

  // Update budget tracking
  await updateBudgetSpend(params.organizationId, event);

  return event;
}

/**
 * Create a budget
 */
export async function createBudget(params: {
  organizationId: string;
  name: string;
  description?: string;
  amount: number;
  currency?: string;
  period: BillingPeriod;
  scope: BudgetScope;
  alerts?: Omit<BudgetAlert, "id">[];
  startDate?: string;
  createdBy: string;
}): Promise<Budget> {
  const now = new Date().toISOString();
  const startDate = params.startDate ?? now;
  const endDate = calculateEndDate(startDate, params.period);

  const budget: Budget = {
    id: `bgt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    amount: params.amount,
    currency: params.currency ?? "USD",
    period: params.period,
    scope: params.scope,
    status: "on-track",
    alerts: (params.alerts ?? [
      { thresholdPercent: 80, channels: ["email"], recipients: [], message: "Budget at 80% utilization" },
      { thresholdPercent: 100, channels: ["email", "slack"], recipients: [], message: "Budget exceeded!" },
    ]).map(a => ({ ...a, id: `ba_${randomUUID().replace(/-/g, "").slice(0, 12)}` })),
    currentSpend: 0,
    forecastedSpend: 0,
    utilizationPercent: 0,
    startDate,
    endDate,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  budgets.set(budget.id, budget);
  return budget;
}

/**
 * Get cost report for a period
 */
export async function generateCostReport(params: {
  organizationId: string;
  name: string;
  startDate: string;
  endDate: string;
}): Promise<CostReport> {
  const events = Array.from(costEvents.values()).filter(
    e => e.organizationId === params.organizationId && e.timestamp >= params.startDate && e.timestamp <= params.endDate,
  );

  const totalCost = events.reduce((s, e) => s + e.totalCost, 0);
  const breakdown = generateCostBreakdown(events, totalCost);
  const trends = generateCostTrends(events, params.startDate, params.endDate);
  const topCostDrivers = generateTopCostDrivers(events, totalCost);
  const budgetCompliance = generateBudgetCompliance(params.organizationId, events);

  const report: CostReport = {
    id: `rpt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    period: { start: params.startDate, end: params.endDate },
    totalCost: Math.round(totalCost * 100) / 100,
    currency: "USD",
    breakdown,
    trends,
    topCostDrivers,
    budgetCompliance,
    generatedAt: new Date().toISOString(),
  };

  reports.set(report.id, report);
  return report;
}

/**
 * Get cost tracking statistics
 */
export async function getCostTrackingStats(organizationId: string): Promise<CostTrackingStats> {
  const events = Array.from(costEvents.values()).filter(e => e.organizationId === organizationId);
  const totalCost = events.reduce((s, e) => s + e.totalCost, 0);

  const costByModel: Record<string, number> = {};
  const costByType: Record<string, number> = {};
  const costByTeam: Record<string, number> = {};
  const modelStats: Record<string, { modelName: string; cost: number; count: number }> = {};
  const dailyCost: Record<string, number> = {};

  for (const e of events) {
    costByModel[e.model.modelId] = (costByModel[e.model.modelId] || 0) + e.totalCost;
    costByType[e.type] = (costByType[e.type] || 0) + e.totalCost;
    if (e.allocation.teamId) costByTeam[e.allocation.teamId] = (costByTeam[e.allocation.teamId] || 0) + e.totalCost;

    if (!modelStats[e.model.modelId]) modelStats[e.model.modelId] = { modelName: e.model.modelName, cost: 0, count: 0 };
    modelStats[e.model.modelId].cost += e.totalCost;
    modelStats[e.model.modelId].count++;

    const day = e.timestamp.slice(0, 10);
    dailyCost[day] = (dailyCost[day] || 0) + e.totalCost;
  }

  const orgBudgets = Array.from(budgets.values()).filter(b => b.organizationId === organizationId);

  return {
    totalEvents: events.length,
    totalCost: Math.round(totalCost * 100) / 100,
    averageCostPerRequest: events.length > 0 ? Math.round(totalCost / events.length * 10000) / 10000 : 0,
    costByModel: roundRecord(costByModel),
    costByType: roundRecord(costByType),
    costByTeam: roundRecord(costByTeam),
    budgetCount: orgBudgets.length,
    budgetsExceeded: orgBudgets.filter(b => b.status === "exceeded" || b.status === "critical").length,
    dailyCostTrend: Object.entries(dailyCost).sort().map(([date, cost]) => ({ date, cost: Math.round(cost * 100) / 100 })),
    topModels: Object.entries(modelStats)
      .map(([modelId, d]) => ({ modelId, modelName: d.modelName, cost: Math.round(d.cost * 100) / 100, requestCount: d.count }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10),
  };
}

/**
 * Get budget by ID
 */
export async function getBudget(budgetId: string): Promise<Budget | null> {
  return budgets.get(budgetId) ?? null;
}

/**
 * List budgets
 */
export async function listBudgets(organizationId: string): Promise<Budget[]> {
  return Array.from(budgets.values()).filter(b => b.organizationId === organizationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Get cost report by ID
 */
export async function getCostReport(reportId: string): Promise<CostReport | null> {
  return reports.get(reportId) ?? null;
}

// ─── Internal Functions ───────────────────────────────────────────────────────

function calculateCost(usage: CostUsage, pricing: CostPricing): number {
  let cost = 0;
  if (usage.inputTokens && pricing.inputTokenPrice) cost += usage.inputTokens * pricing.inputTokenPrice;
  if (usage.outputTokens && pricing.outputTokenPrice) cost += usage.outputTokens * pricing.outputTokenPrice;
  if (usage.gpuHours && pricing.gpuHourPrice) cost += usage.gpuHours * pricing.gpuHourPrice;
  if (usage.cpuHours && pricing.cpuHourPrice) cost += usage.cpuHours * pricing.cpuHourPrice;
  if (usage.memoryGbHours && pricing.memoryGbHourPrice) cost += usage.memoryGbHours * pricing.memoryGbHourPrice;
  if (usage.storageGbHours && pricing.storageGbHourPrice) cost += usage.storageGbHours * pricing.storageGbHourPrice;
  if (usage.networkGb && pricing.networkGbPrice) cost += usage.networkGb * pricing.networkGbPrice;
  if (usage.apiCalls && pricing.apiCallPrice) cost += usage.apiCalls * pricing.apiCallPrice;
  if (usage.inferenceCount && pricing.inferencePrice) cost += usage.inferenceCount * pricing.inferencePrice;

  if (pricing.discountPercent) cost *= (1 - pricing.discountPercent / 100);
  return Math.round(cost * 1000000) / 1000000;
}

async function updateBudgetSpend(organizationId: string, event: CostEvent): Promise<void> {
  const orgBudgets = Array.from(budgets.values()).filter(b => b.organizationId === organizationId);

  for (const budget of orgBudgets) {
    if (event.timestamp < budget.startDate || event.timestamp > budget.endDate) continue;
    if (!matchesBudgetScope(budget.scope, event)) continue;

    budget.currentSpend += event.totalCost;
    budget.utilizationPercent = Math.round((budget.currentSpend / budget.amount) * 10000) / 100;

    // Forecast based on current rate
    const elapsed = (Date.now() - new Date(budget.startDate).getTime()) / (1000 * 60 * 60 * 24);
    const totalDays = (new Date(budget.endDate).getTime() - new Date(budget.startDate).getTime()) / (1000 * 60 * 60 * 24);
    const dailyRate = elapsed > 0 ? budget.currentSpend / elapsed : 0;
    budget.forecastedSpend = Math.round(dailyRate * totalDays * 100) / 100;

    // Update status
    if (budget.utilizationPercent >= 100) budget.status = "exceeded";
    else if (budget.utilizationPercent >= 90) budget.status = "critical";
    else if (budget.utilizationPercent >= 80) budget.status = "warning";
    else budget.status = "on-track";

    // Check alerts
    for (const alert of budget.alerts) {
      if (!alert.triggeredAt && budget.utilizationPercent >= alert.thresholdPercent) {
        alert.triggeredAt = new Date().toISOString();
      }
    }

    budget.updatedAt = new Date().toISOString();
    budgets.set(budget.id, budget);
  }
}

function matchesBudgetScope(scope: BudgetScope, event: CostEvent): boolean {
  if (scope.modelIds?.length && !scope.modelIds.includes(event.model.modelId)) return false;
  if (scope.costEventTypes?.length && !scope.costEventTypes.includes(event.type)) return false;
  if (scope.environments?.length && !scope.environments.includes(event.allocation.environment ?? "")) return false;

  switch (scope.type) {
    case "team": return scope.targetIds.includes(event.allocation.teamId ?? "");
    case "project": return scope.targetIds.includes(event.allocation.projectId ?? "");
    case "deployment": return scope.targetIds.includes(event.allocation.deploymentId ?? "");
    default: return true;
  }
}

function calculateEndDate(startDate: string, period: BillingPeriod): string {
  const date = new Date(startDate);
  switch (period) {
    case "hourly": date.setHours(date.getHours() + 1); break;
    case "daily": date.setDate(date.getDate() + 1); break;
    case "weekly": date.setDate(date.getDate() + 7); break;
    case "monthly": date.setMonth(date.getMonth() + 1); break;
    case "quarterly": date.setMonth(date.getMonth() + 3); break;
    case "annual": date.setFullYear(date.getFullYear() + 1); break;
  }
  return date.toISOString();
}

function generateCostBreakdown(events: CostEvent[], totalCost: number): CostBreakdown {
  const byModel: Record<string, { modelName: string; cost: number; count: number }> = {};
  const byType: Record<string, { cost: number; count: number }> = {};
  const byTeam: Record<string, { teamName: string; cost: number }> = {};
  const byProject: Record<string, { projectName: string; cost: number }> = {};
  const byEnv: Record<string, number> = {};
  const byProvider: Record<string, number> = {};

  for (const e of events) {
    if (!byModel[e.model.modelId]) byModel[e.model.modelId] = { modelName: e.model.modelName, cost: 0, count: 0 };
    byModel[e.model.modelId].cost += e.totalCost;
    byModel[e.model.modelId].count++;

    if (!byType[e.type]) byType[e.type] = { cost: 0, count: 0 };
    byType[e.type].cost += e.totalCost;
    byType[e.type].count++;

    if (e.allocation.teamId) {
      if (!byTeam[e.allocation.teamId]) byTeam[e.allocation.teamId] = { teamName: e.allocation.teamName ?? e.allocation.teamId, cost: 0 };
      byTeam[e.allocation.teamId].cost += e.totalCost;
    }
    if (e.allocation.projectId) {
      if (!byProject[e.allocation.projectId]) byProject[e.allocation.projectId] = { projectName: e.allocation.projectName ?? e.allocation.projectId, cost: 0 };
      byProject[e.allocation.projectId].cost += e.totalCost;
    }
    if (e.allocation.environment) byEnv[e.allocation.environment] = (byEnv[e.allocation.environment] || 0) + e.totalCost;
    byProvider[e.model.provider] = (byProvider[e.model.provider] || 0) + e.totalCost;
  }

  const pct = (v: number) => totalCost > 0 ? Math.round((v / totalCost) * 10000) / 100 : 0;

  return {
    byModel: Object.entries(byModel).map(([modelId, d]) => ({ modelId, modelName: d.modelName, cost: Math.round(d.cost * 100) / 100, percent: pct(d.cost), usageCount: d.count })).sort((a, b) => b.cost - a.cost),
    byType: Object.entries(byType).map(([type, d]) => ({ type: type as CostEventType, cost: Math.round(d.cost * 100) / 100, percent: pct(d.cost), count: d.count })).sort((a, b) => b.cost - a.cost),
    byTeam: Object.entries(byTeam).map(([teamId, d]) => ({ teamId, teamName: d.teamName, cost: Math.round(d.cost * 100) / 100, percent: pct(d.cost) })).sort((a, b) => b.cost - a.cost),
    byProject: Object.entries(byProject).map(([projectId, d]) => ({ projectId, projectName: d.projectName, cost: Math.round(d.cost * 100) / 100, percent: pct(d.cost) })).sort((a, b) => b.cost - a.cost),
    byEnvironment: Object.entries(byEnv).map(([environment, cost]) => ({ environment, cost: Math.round(cost * 100) / 100, percent: pct(cost) })).sort((a, b) => b.cost - a.cost),
    byProvider: Object.entries(byProvider).map(([provider, cost]) => ({ provider, cost: Math.round(cost * 100) / 100, percent: pct(cost) })).sort((a, b) => b.cost - a.cost),
  };
}

function generateCostTrends(events: CostEvent[], start: string, end: string): CostTrend[] {
  const dailyCost: Record<string, number> = {};
  const dailyCount: Record<string, number> = {};
  for (const e of events) {
    const day = e.timestamp.slice(0, 10);
    dailyCost[day] = (dailyCost[day] || 0) + e.totalCost;
    dailyCount[day] = (dailyCount[day] || 0) + 1;
  }

  const days = Object.keys(dailyCost).sort();
  return days.map((day, i) => ({
    period: day,
    cost: Math.round((dailyCost[day] ?? 0) * 100) / 100,
    previousCost: i > 0 ? Math.round((dailyCost[days[i - 1]] ?? 0) * 100) / 100 : 0,
    changePercent: i > 0 && dailyCost[days[i - 1]] ? Math.round(((dailyCost[day] - dailyCost[days[i - 1]]) / dailyCost[days[i - 1]]) * 10000) / 100 : 0,
    usageCount: dailyCount[day] ?? 0,
  }));
}

function generateTopCostDrivers(events: CostEvent[], totalCost: number): CostDriver[] {
  const modelStats: Record<string, { modelName: string; cost: number; count: number; recentCost: number }> = {};
  const now = Date.now();

  for (const e of events) {
    if (!modelStats[e.model.modelId]) modelStats[e.model.modelId] = { modelName: e.model.modelName, cost: 0, count: 0, recentCost: 0 };
    modelStats[e.model.modelId].cost += e.totalCost;
    modelStats[e.model.modelId].count++;
    if (now - new Date(e.timestamp).getTime() < 7 * 24 * 3600 * 1000) modelStats[e.model.modelId].recentCost += e.totalCost;
  }

  return Object.entries(modelStats)
    .map(([modelId, d]) => {
      const avgRecent = d.recentCost / Math.max(d.count * 0.3, 1);
      const avgTotal = d.cost / d.count;
      const trend: CostDriver["trend"] = avgRecent > avgTotal * 1.1 ? "increasing" : avgRecent < avgTotal * 0.9 ? "decreasing" : "stable";
      return { modelId, modelName: d.modelName, cost: Math.round(d.cost * 100) / 100, percentOfTotal: totalCost > 0 ? Math.round((d.cost / totalCost) * 10000) / 100 : 0, usageCount: d.count, averageCostPerRequest: Math.round((d.cost / d.count) * 10000) / 10000, trend };
    })
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);
}

function generateBudgetCompliance(organizationId: string, events: CostEvent[]): BudgetCompliance[] {
  const orgBudgets = Array.from(budgets.values()).filter(b => b.organizationId === organizationId);
  return orgBudgets.map(b => ({
    budgetId: b.id,
    budgetName: b.name,
    allocatedAmount: b.amount,
    actualSpend: Math.round(b.currentSpend * 100) / 100,
    utilizationPercent: b.utilizationPercent,
    status: b.status,
    forecastedSpend: b.forecastedSpend,
    forecastedOverage: Math.max(0, Math.round((b.forecastedSpend - b.amount) * 100) / 100),
  }));
}

function roundRecord(obj: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) result[k] = Math.round(v * 100) / 100;
  return result;
}
