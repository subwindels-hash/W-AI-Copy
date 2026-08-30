/**
 * Module 112: AI Model Lifecycle Insights Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides lifecycle insights, reports, and recommendations for AI models including
 * trend analysis, predictive insights, anomaly detection, and actionable recommendations.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiModelLifecycleInsights');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LifecycleInsight {
  id: string;
  organizationId: string;
  type: InsightType;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  category: InsightCategory;
  affectedModels: string[];
  metrics: InsightMetric[];
  recommendations: InsightRecommendation[];
  generatedAt: string;
  expiresAt?: string;
  acknowledged: boolean;
}

export type InsightType =
  | 'trend'
  | 'anomaly'
  | 'prediction'
  | 'optimization'
  | 'risk'
  | 'opportunity';

export type InsightCategory =
  | 'performance'
  | 'efficiency'
  | 'quality'
  | 'cost'
  | 'compliance'
  | 'resource';

export interface InsightMetric {
  name: string;
  value: number;
  baseline?: number;
  change?: number;
  changePercentage?: number;
  unit: string;
}

export interface InsightRecommendation {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  estimatedBenefit?: string;
  actionItems: string[];
}

export interface LifecycleReport {
  id: string;
  organizationId: string;
  name: string;
  type: ReportType;
  period: ReportPeriod;
  summary: ReportSummary;
  sections: ReportSection[];
  insights: LifecycleInsight[];
  generatedAt: string;
  generatedBy: string;
}

export type ReportType =
  | 'executive_summary'
  | 'detailed_analysis'
  | 'trend_report'
  | 'comparative_analysis'
  | 'compliance_report';

export interface ReportPeriod {
  start: string;
  end: string;
  granularity: 'daily' | 'weekly' | 'monthly' | 'quarterly';
}

export interface ReportSummary {
  totalModels: number;
  modelsInProduction: number;
  averageTimeToProduction: number;
  rollbackRate: number;
  keyFindings: string[];
  topRecommendations: string[];
}

export interface ReportSection {
  title: string;
  content: string;
  charts?: ReportChart[];
  tables?: ReportTable[];
}

export interface ReportChart {
  type: 'line' | 'bar' | 'pie' | 'area';
  title: string;
  data: any;
  config?: Record<string, any>;
}

export interface ReportTable {
  title: string;
  headers: string[];
  rows: any[][];
}

export interface TrendAnalysis {
  metric: string;
  period: string;
  dataPoints: TrendDataPoint[];
  trend: 'increasing' | 'decreasing' | 'stable';
  trendPercentage: number;
  forecast?: TrendForecast[];
  anomalies: TrendAnomaly[];
}

export interface TrendDataPoint {
  timestamp: string;
  value: number;
  label?: string;
}

export interface TrendForecast {
  timestamp: string;
  value: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
}

export interface TrendAnomaly {
  timestamp: string;
  value: number;
  expectedValue: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface PredictiveInsight {
  id: string;
  organizationId: string;
  modelId?: string;
  prediction: string;
  confidence: number;
  timeframe: string;
  impact: 'low' | 'medium' | 'high';
  recommendedActions: string[];
  generatedAt: string;
}

export interface ComparativeAnalysis {
  dimension: string;
  groups: ComparisonGroup[];
  insights: string[];
  recommendations: string[];
}

export interface ComparisonGroup {
  name: string;
  count: number;
  metrics: Record<string, number>;
  performance: 'above_average' | 'average' | 'below_average';
}

export interface LifecycleAlert {
  id: string;
  organizationId: string;
  modelId?: string;
  type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  condition: AlertCondition;
  status: 'active' | 'acknowledged' | 'resolved';
  triggeredAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export type AlertType =
  | 'stage_duration_exceeded'
  | 'transition_failure'
  | 'rollback_spike'
  | 'bottleneck_detected'
  | 'milestone_missed'
  | 'anomaly_detected';

export interface AlertCondition {
  metric: string;
  operator: 'greater_than' | 'less_than' | 'equals';
  threshold: number;
  duration?: number; // seconds
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const lifecycleInsights = new Map<string, LifecycleInsight[]>();
const lifecycleReports = new Map<string, LifecycleReport>();
const predictiveInsights = new Map<string, PredictiveInsight[]>();
const lifecycleAlerts = new Map<string, LifecycleAlert[]>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculateTrend(dataPoints: TrendDataPoint[]): {
  trend: 'increasing' | 'decreasing' | 'stable';
  percentage: number;
} {
  if (dataPoints.length < 2) {
    return { trend: 'stable', percentage: 0 };
  }

  const first = dataPoints[0].value;
  const last = dataPoints[dataPoints.length - 1].value;
  const change = last - first;
  const percentage = first !== 0 ? (change / first) * 100 : 0;

  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (percentage > 5) trend = 'increasing';
  else if (percentage < -5) trend = 'decreasing';

  return { trend, percentage };
}

function detectAnomalies(dataPoints: TrendDataPoint[]): TrendAnomaly[] {
  if (dataPoints.length < 3) return [];

  const values = dataPoints.map(d => d.value);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);

  const anomalies: TrendAnomaly[] = [];

  for (const point of dataPoints) {
    const deviation = Math.abs(point.value - mean) / stdDev;
    if (deviation > 2) { // 2 standard deviations
      anomalies.push({
        timestamp: point.timestamp,
        value: point.value,
        expectedValue: mean,
        deviation,
        severity: deviation > 3 ? 'high' : deviation > 2.5 ? 'medium' : 'low',
        description: `Value ${point.value} deviates ${deviation.toFixed(2)} standard deviations from mean`,
      });
    }
  }

  return anomalies;
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function generateLifecycleInsights(organizationId: string): LifecycleInsight[] {
  const insights: LifecycleInsight[] = [];
  const now = new Date().toISOString();

  // This would integrate with LifecycleMetrics service to get actual data
  // For now, generating sample insights

  // Bottleneck insight
  insights.push({
    id: randomUUID(),
    organizationId,
    type: 'optimization',
    title: 'Validation Stage Bottleneck Detected',
    description: 'Models are spending an average of 5.2 days in validation stage, which is 40% longer than the target',
    severity: 'warning',
    category: 'efficiency',
    affectedModels: ['model-1', 'model-2', 'model-3'],
    metrics: [
      { name: 'Average Validation Duration', value: 5.2, baseline: 3.7, unit: 'days', change: 1.5, changePercentage: 40 },
    ],
    recommendations: [
      {
        title: 'Automate Validation Tests',
        description: 'Implement automated test suites to reduce manual validation time',
        priority: 'high',
        effort: 'medium',
        impact: 'high',
        estimatedBenefit: 'Reduce validation time by 60%',
        actionItems: [
          'Identify manual validation steps',
          'Create automated test scripts',
          'Integrate tests into CI/CD pipeline',
        ],
      },
    ],
    generatedAt: now,
    acknowledged: false,
  });

  // Rollback rate insight
  insights.push({
    id: randomUUID(),
    organizationId,
    type: 'risk',
    title: 'Elevated Rollback Rate in Production',
    description: 'Production rollback rate has increased to 12%, exceeding the 5% target threshold',
    severity: 'critical',
    category: 'quality',
    affectedModels: ['model-4', 'model-5'],
    metrics: [
      { name: 'Rollback Rate', value: 12, baseline: 5, unit: 'percent', change: 7, changePercentage: 140 },
    ],
    recommendations: [
      {
        title: 'Strengthen Pre-Production Testing',
        description: 'Enhance staging environment testing to catch issues before production',
        priority: 'critical',
        effort: 'high',
        impact: 'high',
        estimatedBenefit: 'Reduce rollback rate to <5%',
        actionItems: [
          'Add more comprehensive test coverage',
          'Implement canary deployments',
          'Add production-like load testing',
        ],
      },
    ],
    generatedAt: now,
    acknowledged: false,
  });

  lifecycleInsights.set(organizationId, insights);
  return insights;
}

export function getLifecycleInsights(
  organizationId: string,
  filters?: { type?: InsightType; severity?: string; acknowledged?: boolean }
): LifecycleInsight[] {
  let result = lifecycleInsights.get(organizationId) || [];

  if (filters?.type) result = result.filter(i => i.type === filters.type);
  if (filters?.severity) result = result.filter(i => i.severity === filters.severity);
  if (filters?.acknowledged !== undefined) result = result.filter(i => i.acknowledged === filters.acknowledged);

  return result.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export function acknowledgeInsight(organizationId: string, insightId: string): LifecycleInsight {
  const insights = lifecycleInsights.get(organizationId) || [];
  const insight = insights.find(i => i.id === insightId);
  if (!insight) throw new Error(`Insight ${insightId} not found`);

  insight.acknowledged = true;
  return insight;
}

export function generateLifecycleReport(params: {
  organizationId: string;
  name: string;
  type: ReportType;
  period: ReportPeriod;
  generatedBy: string;
}): LifecycleReport {
  const now = new Date().toISOString();
  const id = randomUUID();

  const summary: ReportSummary = {
    totalModels: 45,
    modelsInProduction: 28,
    averageTimeToProduction: 25 * 24 * 60 * 60 * 1000, // 25 days
    rollbackRate: 8,
    keyFindings: [
      'Production deployment rate increased by 15% compared to previous period',
      'Average time to production decreased from 28 to 25 days',
      'Validation stage identified as primary bottleneck',
      'Rollback rate slightly above target at 8%',
    ],
    topRecommendations: [
      'Automate validation testing to reduce stage duration',
      'Implement canary deployments to reduce rollback rate',
      'Standardize development stage processes',
    ],
  };

  const sections: ReportSection[] = [
    {
      title: 'Executive Summary',
      content: `This report covers the lifecycle metrics for ${summary.totalModels} models during the period ${params.period.start} to ${params.period.end}. ${summary.modelsInProduction} models are currently in production, representing ${((summary.modelsInProduction / summary.totalModels) * 100).toFixed(1)}% of the total portfolio.`,
    },
    {
      title: 'Stage Distribution',
      content: 'Analysis of model distribution across lifecycle stages.',
      charts: [
        {
          type: 'pie',
          title: 'Models by Stage',
          data: {
            development: 5,
            training: 3,
            testing: 4,
            validation: 3,
            staging: 2,
            production: 28,
          },
        },
      ],
    },
    {
      title: 'Transition Analysis',
      content: 'Detailed analysis of stage transitions and durations.',
      tables: [
        {
          title: 'Average Stage Durations',
          headers: ['Stage', 'Average Duration (days)', 'Target (days)', 'Status'],
          rows: [
            ['Development', '5.2', '7', 'On Track'],
            ['Training', '2.1', '3', 'On Track'],
            ['Testing', '3.8', '4', 'On Track'],
            ['Validation', '5.2', '3', 'At Risk'],
            ['Staging', '1.5', '2', 'On Track'],
          ],
        },
      ],
    },
    {
      title: 'Key Insights',
      content: 'Major findings and recommendations from the analysis.',
    },
  ];

  const insights = generateLifecycleInsights(params.organizationId);

  const report: LifecycleReport = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    type: params.type,
    period: params.period,
    summary,
    sections,
    insights,
    generatedAt: now,
    generatedBy: params.generatedBy,
  };

  lifecycleReports.set(id, report);
  return report;
}

export function getLifecycleReport(id: string): LifecycleReport | undefined {
  return lifecycleReports.get(id);
}

export function listLifecycleReports(
  organizationId: string,
  filters?: { type?: ReportType; period?: string }
): LifecycleReport[] {
  let result = Array.from(lifecycleReports.values()).filter(
    r => r.organizationId === organizationId
  );

  if (filters?.type) result = result.filter(r => r.type === filters.type);
  if (filters?.period) result = result.filter(r => r.period.granularity === filters.period);

  return result.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export function analyzeTrends(
  organizationId: string,
  metric: string,
  period: string
): TrendAnalysis {
  // Generate sample trend data
  const dataPoints: TrendDataPoint[] = [];
  const now = Date.now();
  const daysBack = period === '30d' ? 30 : period === '90d' ? 90 : 7;

  for (let i = daysBack; i >= 0; i--) {
    const timestamp = new Date(now - i * 24 * 60 * 60 * 1000).toISOString();
    const baseValue = 50 + Math.sin(i / 5) * 10 + _rng.next() * 5;
    dataPoints.push({
      timestamp,
      value: baseValue,
      label: `Day ${daysBack - i}`,
    });
  }

  const { trend, percentage } = calculateTrend(dataPoints);
  const anomalies = detectAnomalies(dataPoints);

  // Generate forecast
  const forecast: TrendForecast[] = [];
  const lastValue = dataPoints[dataPoints.length - 1].value;
  const trendSlope = percentage / 100 / daysBack;

  for (let i = 1; i <= 7; i++) {
    const timestamp = new Date(now + i * 24 * 60 * 60 * 1000).toISOString();
    const forecastValue = lastValue * (1 + trendSlope * i);
    const confidence = Math.max(0.5, 1 - i * 0.05);
    const margin = forecastValue * 0.1 * i;

    forecast.push({
      timestamp,
      value: forecastValue,
      confidence,
      lowerBound: forecastValue - margin,
      upperBound: forecastValue + margin,
    });
  }

  return {
    metric,
    period,
    dataPoints,
    trend,
    trendPercentage: percentage,
    forecast,
    anomalies,
  };
}

export function generatePredictiveInsights(organizationId: string): PredictiveInsight[] {
  const insights: PredictiveInsight[] = [];
  const now = new Date().toISOString();

  insights.push({
    id: randomUUID(),
    organizationId,
    prediction: 'Based on current trends, 5 models are predicted to enter production in the next 30 days',
    confidence: 0.85,
    timeframe: '30 days',
    impact: 'medium',
    recommendedActions: [
      'Ensure production infrastructure can handle additional load',
      'Schedule production readiness reviews',
      'Prepare monitoring and alerting configurations',
    ],
    generatedAt: now,
  });

  insights.push({
    id: randomUUID(),
    organizationId,
    prediction: 'Validation stage duration is predicted to increase by 20% if current bottlenecks are not addressed',
    confidence: 0.75,
    timeframe: '60 days',
    impact: 'high',
    recommendedActions: [
      'Implement automated validation tests immediately',
      'Add more validation resources',
      'Review and optimize validation processes',
    ],
    generatedAt: now,
  });

  predictiveInsights.set(organizationId, insights);
  return insights;
}

export function getPredictiveInsights(organizationId: string): PredictiveInsight[] {
  return predictiveInsights.get(organizationId) || [];
}

export function performComparativeAnalysis(
  organizationId: string,
  dimension: string
): ComparativeAnalysis {
  const groups: ComparisonGroup[] = [];

  if (dimension === 'team') {
    groups.push(
      {
        name: 'Team A',
        count: 15,
        metrics: { avgTimeToProd: 22, rollbackRate: 5, prodPercentage: 70 },
        performance: 'above_average',
      },
      {
        name: 'Team B',
        count: 12,
        metrics: { avgTimeToProd: 28, rollbackRate: 10, prodPercentage: 55 },
        performance: 'average',
      },
      {
        name: 'Team C',
        count: 18,
        metrics: { avgTimeToProd: 35, rollbackRate: 15, prodPercentage: 40 },
        performance: 'below_average',
      }
    );
  }

  const insights = [
    'Team A demonstrates best practices with fastest time to production and lowest rollback rate',
    'Team C shows opportunities for improvement in development and validation processes',
    'Teams with automated testing show 30% faster time to production',
  ];

  const recommendations = [
    'Share Team A best practices across all teams',
    'Provide additional training and resources to Team C',
    'Implement automated testing across all teams',
  ];

  return {
    dimension,
    groups,
    insights,
    recommendations,
  };
}

export function createLifecycleAlert(params: {
  organizationId: string;
  modelId?: string;
  type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  condition: AlertCondition;
}): LifecycleAlert {
  const now = new Date().toISOString();
  const id = randomUUID();

  const alert: LifecycleAlert = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    type: params.type,
    severity: params.severity,
    title: params.title,
    description: params.description,
    condition: params.condition,
    status: 'active',
    triggeredAt: now,
  };

  const alerts = lifecycleAlerts.get(params.organizationId) || [];
  alerts.push(alert);
  lifecycleAlerts.set(params.organizationId, alerts);

  return alert;
}

export function getLifecycleAlerts(
  organizationId: string,
  filters?: { type?: AlertType; severity?: string; status?: string }
): LifecycleAlert[] {
  let result = lifecycleAlerts.get(organizationId) || [];

  if (filters?.type) result = result.filter(a => a.type === filters.type);
  if (filters?.severity) result = result.filter(a => a.severity === filters.severity);
  if (filters?.status) result = result.filter(a => a.status === filters.status);

  return result.sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt));
}

export function acknowledgeLifecycleAlert(
  organizationId: string,
  alertId: string
): LifecycleAlert {
  const alerts = lifecycleAlerts.get(organizationId) || [];
  const alert = alerts.find(a => a.id === alertId);
  if (!alert) throw new Error(`Alert ${alertId} not found`);

  alert.status = 'acknowledged';
  return alert;
}

export function resolveLifecycleAlert(
  organizationId: string,
  alertId: string,
  resolvedBy: string
): LifecycleAlert {
  const alerts = lifecycleAlerts.get(organizationId) || [];
  const alert = alerts.find(a => a.id === alertId);
  if (!alert) throw new Error(`Alert ${alertId} not found`);

  alert.status = 'resolved';
  alert.resolvedAt = new Date().toISOString();
  alert.resolvedBy = resolvedBy;

  return alert;
}

export function generateRecommendations(organizationId: string): InsightRecommendation[] {
  const recommendations: InsightRecommendation[] = [
    {
      title: 'Implement Automated Validation Testing',
      description: 'Create comprehensive automated test suites to reduce manual validation time and improve consistency',
      priority: 'high',
      effort: 'medium',
      impact: 'high',
      estimatedBenefit: 'Reduce validation stage duration by 60% and improve quality',
      actionItems: [
        'Audit current manual validation processes',
        'Identify testable validation criteria',
        'Develop automated test scripts',
        'Integrate tests into CI/CD pipeline',
        'Train team on new automated processes',
      ],
    },
    {
      title: 'Adopt Canary Deployment Strategy',
      description: 'Implement canary deployments to reduce production rollback rate and minimize impact of issues',
      priority: 'critical',
      effort: 'high',
      impact: 'high',
      estimatedBenefit: 'Reduce rollback rate from 12% to <5% and minimize user impact',
      actionItems: [
        'Research canary deployment best practices',
        'Set up canary deployment infrastructure',
        'Implement traffic splitting mechanisms',
        'Create monitoring and alerting for canary instances',
        'Define rollback criteria and automation',
        'Pilot with low-risk models',
      ],
    },
    {
      title: 'Standardize Development Stage Processes',
      description: 'Create standardized development workflows and checklists to improve consistency and reduce time in development',
      priority: 'medium',
      effort: 'low',
      impact: 'medium',
      estimatedBenefit: 'Reduce development stage variability and improve handoff quality',
      actionItems: [
        'Document current development practices',
        'Identify best practices from top-performing teams',
        'Create standardized checklists and templates',
        'Implement development stage gates',
        'Provide training on new standards',
      ],
    },
  ];

  return recommendations;
}
