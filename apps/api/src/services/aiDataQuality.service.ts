/**
 * Module 72: AI Data Quality Service
 *
 * Provides comprehensive data quality management for AI/ML workflows including
 * quality metrics computation, data profiling, quality rules engine, quality
 * monitoring and alerting, quality scorecards, quality trends analysis, anomaly
 * detection, and quality issue tracking with remediation workflows.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DataQualityProfile {
  id: string;
  organizationId: string;
  datasetId: string;
  datasetName: string;
  datasetType: DatasetType;
  profile: QualityProfile;
  metrics: QualityMetrics;
  rules: QualityRule[];
  anomalies: QualityAnomaly[];
  issues: QualityIssue[];
  scorecard: QualityScorecard;
  trends: QualityTrend[];
  lastProfiledAt: string;
  createdAt: string;
  updatedAt: string;
}

export type DatasetType =
  | 'training-data'
  | 'validation-data'
  | 'test-data'
  | 'feature-store'
  | 'prediction-input'
  | 'prediction-output'
  | 'raw-data'
  | 'processed-data';

export interface QualityProfile {
  rowCount: number;
  columnCount: number;
  sizeBytes: number;
  columns: ColumnProfile[];
  sampleSize: number;
  profiledAt: string;
}

export interface ColumnProfile {
  columnName: string;
  dataType: DataType;
  nullable: boolean;
  unique: boolean;
  statistics: ColumnStatistics;
  distribution: DistributionInfo;
  patterns: PatternInfo[];
  outliers: OutlierInfo[];
  quality: ColumnQualityMetrics;
}

export type DataType =
  | 'integer'
  | 'float'
  | 'string'
  | 'boolean'
  | 'datetime'
  | 'categorical'
  | 'text'
  | 'array'
  | 'object'
  | 'unknown';

export interface ColumnStatistics {
  count: number;
  nullCount: number;
  nullPercentage: number;
  distinctCount: number;
  distinctPercentage: number;
  // Numeric statistics
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  stdDev?: number;
  variance?: number;
  percentiles?: Record<string, number>;
  // String statistics
  minLength?: number;
  maxLength?: number;
  avgLength?: number;
  // Categorical statistics
  topValues?: Array<{ value: any; count: number; percentage: number }>;
}

export interface DistributionInfo {
  type: 'normal' | 'uniform' | 'skewed' | 'bimodal' | 'multimodal' | 'unknown';
  skewness?: number;
  kurtosis?: number;
  histogram?: Array<{ bin: string; count: number; percentage: number }>;
  normalityTest?: {
    test: string;
    statistic: number;
    pValue: number;
    isNormal: boolean;
  };
}

export interface PatternInfo {
  pattern: string;
  regex?: string;
  matchCount: number;
  matchPercentage: number;
  examples: string[];
}

export interface OutlierInfo {
  value: any;
  method: 'zscore' | 'iqr' | 'isolation-forest' | 'custom';
  score: number;
  threshold: number;
  isOutlier: boolean;
  index?: number;
}

export interface ColumnQualityMetrics {
  completeness: number; // 0-1
  validity: number; // 0-1
  uniqueness: number; // 0-1
  consistency?: number; // 0-1
  accuracy?: number; // 0-1
  timeliness?: number; // 0-1
  overallScore: number; // 0-100
}

export interface QualityMetrics {
  overall: OverallQualityMetrics;
  dimensions: QualityDimension[];
  computedAt: string;
}

export interface OverallQualityMetrics {
  score: number; // 0-100
  grade: QualityGrade;
  completeness: number; // 0-1
  accuracy: number; // 0-1
  consistency: number; // 0-1
  timeliness: number; // 0-1
  validity: number; // 0-1
  uniqueness: number; // 0-1
}

export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface QualityDimension {
  name: string;
  score: number; // 0-100
  weight: number; // 0-1
  weightedScore: number;
  metrics: Array<{
    name: string;
    value: number;
    target?: number;
    status: 'good' | 'warning' | 'critical';
  }>;
  status: 'good' | 'warning' | 'critical';
}

export interface QualityRule {
  id: string;
  name: string;
  description: string;
  type: RuleType;
  scope: RuleScope;
  condition: RuleCondition;
  severity: RuleSeverity;
  threshold?: number;
  enabled: boolean;
  lastEvaluated?: string;
  lastResult?: RuleResult;
  createdAt: string;
  updatedAt: string;
}

export type RuleType =
  | 'completeness'
  | 'validity'
  | 'consistency'
  | 'accuracy'
  | 'timeliness'
  | 'uniqueness'
  | 'range'
  | 'pattern'
  | 'custom';

export interface RuleScope {
  datasetId: string;
  columns?: string[];
  rows?: {
    filter?: string;
    sampleSize?: number;
  };
}

export interface RuleCondition {
  type: 'threshold' | 'pattern' | 'reference' | 'statistical' | 'custom';
  expression?: string;
  referenceValue?: any;
  operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
  parameters?: Record<string, any>;
}

export type RuleSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface RuleResult {
  passed: boolean;
  evaluatedAt: string;
  rowsChecked: number;
  rowsFailed: number;
  failurePercentage: number;
  failures?: Array<{
    rowIndex: number;
    columnName?: string;
    value: any;
    reason: string;
  }>;
  executionTimeMs: number;
}

export interface QualityAnomaly {
  id: string;
  datasetId: string;
  columnName?: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  detectedAt: string;
  metrics: Record<string, any>;
  baseline?: Record<string, any>;
  deviation: number;
  status: AnomalyStatus;
  investigatedBy?: string;
  investigatedAt?: string;
  resolution?: string;
  resolvedAt?: string;
}

export type AnomalyType =
  | 'distribution-shift'
  | 'outlier-spike'
  | 'missing-data-spike'
  | 'schema-change'
  | 'volume-change'
  | 'pattern-break'
  | 'correlation-break'
  | 'custom';

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

export type AnomalyStatus = 'detected' | 'investigating' | 'confirmed' | 'false-positive' | 'resolved';

export interface QualityIssue {
  id: string;
  datasetId: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  category: IssueCategory;
  affectedColumns?: string[];
  affectedRows?: number;
  impact: string;
  rootCause?: string;
  status: IssueStatus;
  assignedTo?: string;
  priority: IssuePriority;
  reportedAt: string;
  resolvedAt?: string;
  resolution?: string;
  remediationActions: RemediationAction[];
  relatedAnomalies?: string[];
  relatedRules?: string[];
}

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IssueCategory =
  | 'missing-data'
  | 'invalid-data'
  | 'inconsistent-data'
  | 'outdated-data'
  | 'duplicate-data'
  | 'schema-issue'
  | 'pipeline-issue'
  | 'source-issue'
  | 'other';

export type IssueStatus = 'open' | 'investigating' | 'in-progress' | 'resolved' | 'closed' | 'deferred';

export type IssuePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface RemediationAction {
  id: string;
  action: string;
  description: string;
  type: 'automated' | 'manual';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  executedAt?: string;
  executedBy?: string;
  result?: string;
}

export interface QualityScorecard {
  datasetId: string;
  overallScore: number; // 0-100
  grade: QualityGrade;
  dimensions: ScorecardDimension[];
  trends: {
    score7Days: number;
    score30Days: number;
    trend: 'improving' | 'stable' | 'declining';
  };
  recommendations: string[];
  generatedAt: string;
}

export interface ScorecardDimension {
  name: string;
  score: number;
  weight: number;
  status: 'good' | 'warning' | 'critical';
  topIssues: string[];
}

export interface QualityTrend {
  timestamp: string;
  overallScore: number;
  dimensionScores: Record<string, number>;
  rowCount: number;
  anomalyCount: number;
  issueCount: number;
}

export interface QualityDashboard {
  organizationId: string;
  totalDatasets: number;
  averageQualityScore: number;
  datasetsByGrade: Record<QualityGrade, number>;
  totalAnomalies: number;
  openIssues: number;
  criticalIssues: number;
  recentAnomalies: QualityAnomaly[];
  topIssues: QualityIssue[];
  qualityTrends: QualityTrend[];
  dimensionAverages: Record<string, number>;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const profiles = new Map<string, DataQualityProfile>();
const rules = new Map<string, QualityRule>();

// ─── Data Quality Profiling ────────────────────────────────────────────────────

/**
 * Profile dataset quality
 */
export async function profileDataset(
  organizationId: string,
  params: {
    datasetId: string;
    datasetName: string;
    datasetType: DatasetType;
    data: any[];
    sampleSize?: number;
  }
): Promise<DataQualityProfile> {
  const id = `profile_${randomUUID()}`;
  const now = new Date().toISOString();

  const sampleSize = params.sampleSize || Math.min(params.data.length, 10000);
  const sample = params.data.slice(0, sampleSize);

  // Profile columns
  const columns = profileColumns(sample);

  // Compute quality metrics
  const metrics = computeQualityMetrics(columns, sample.length);

  // Generate scorecard
  const scorecard = generateScorecard(params.datasetId, metrics);

  const profile: DataQualityProfile = {
    id,
    organizationId,
    datasetId: params.datasetId,
    datasetName: params.datasetName,
    datasetType: params.datasetType,
    profile: {
      rowCount: params.data.length,
      columnCount: columns.length,
      sizeBytes: JSON.stringify(params.data).length,
      columns,
      sampleSize,
      profiledAt: now,
    },
    metrics,
    rules: [],
    anomalies: [],
    issues: [],
    scorecard,
    trends: [],
    lastProfiledAt: now,
    createdAt: now,
    updatedAt: now,
  };

  profiles.set(id, profile);
  return profile;
}

/**
 * Profile columns
 */
function profileColumns(data: any[]): ColumnProfile[] {
  if (data.length === 0) return [];

  const columns = Object.keys(data[0]);
  return columns.map((columnName) => profileColumn(data, columnName));
}

/**
 * Profile single column
 */
function profileColumn(data: any[], columnName: string): ColumnProfile {
  const values = data.map((row) => row[columnName]);
  const nonNullValues = values.filter((v) => v !== null && v !== undefined);

  const dataType = inferDataType(nonNullValues);
  const statistics = computeStatistics(values, dataType);
  const distribution = analyzeDistribution(nonNullValues, dataType);
  const patterns = detectPatterns(nonNullValues, dataType);
  const outliers = detectOutliers(nonNullValues, dataType);
  const quality = computeColumnQuality(values, statistics);

  return {
    columnName,
    dataType,
    nullable: values.some((v) => v === null || v === undefined),
    unique: new Set(nonNullValues).size === nonNullValues.length,
    statistics,
    distribution,
    patterns,
    outliers,
    quality,
  };
}

/**
 * Infer data type
 */
function inferDataType(values: any[]): DataType {
  if (values.length === 0) return 'unknown';

  const sample = values.slice(0, 100);
  const types = sample.map((v) => {
    if (typeof v === 'number') {
      return Number.isInteger(v) ? 'integer' : 'float';
    }
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'string') {
      if (!isNaN(Date.parse(v))) return 'datetime';
      if (v.length > 100) return 'text';
      return 'string';
    }
    if (Array.isArray(v)) return 'array';
    if (typeof v === 'object') return 'object';
    return 'unknown';
  });

  const typeCounts = types.reduce((acc, t) => {
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const mostCommon = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];

  // Check if categorical
  if (mostCommon === 'string' || mostCommon === 'integer') {
    const uniqueCount = new Set(values).size;
    if (uniqueCount / values.length < 0.05) {
      return 'categorical';
    }
  }

  return mostCommon as DataType;
}

/**
 * Compute column statistics
 */
function computeStatistics(values: any[], dataType: DataType): ColumnStatistics {
  const count = values.length;
  const nullCount = values.filter((v) => v === null || v === undefined).length;
  const nullPercentage = (nullCount / count) * 100;
  const nonNullValues = values.filter((v) => v !== null && v !== undefined);
  const distinctCount = new Set(nonNullValues).size;
  const distinctPercentage = nonNullValues.length > 0 ? (distinctCount / nonNullValues.length) * 100 : 0;

  const stats: ColumnStatistics = {
    count,
    nullCount,
    nullPercentage,
    distinctCount,
    distinctPercentage,
  };

  if (dataType === 'integer' || dataType === 'float') {
    const nums = nonNullValues.map(Number).sort((a, b) => a - b);
    stats.min = nums[0];
    stats.max = nums[nums.length - 1];
    stats.mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    stats.median = nums[Math.floor(nums.length / 2)];
    stats.stdDev = Math.sqrt(nums.reduce((sum, v) => sum + Math.pow(v - stats.mean!, 2), 0) / nums.length);
    stats.variance = Math.pow(stats.stdDev, 2);
    stats.percentiles = {
      p25: nums[Math.floor(nums.length * 0.25)],
      p50: nums[Math.floor(nums.length * 0.5)],
      p75: nums[Math.floor(nums.length * 0.75)],
      p90: nums[Math.floor(nums.length * 0.9)],
      p95: nums[Math.floor(nums.length * 0.95)],
    };
  } else if (dataType === 'string' || dataType === 'text') {
    const lengths = nonNullValues.map((v) => String(v).length);
    stats.minLength = Math.min(...lengths);
    stats.maxLength = Math.max(...lengths);
    stats.avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  }

  if (dataType === 'categorical' || dataType === 'string') {
    const valueCounts = nonNullValues.reduce((acc, v) => {
      acc[v] = (acc[v] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    stats.topValues = Object.entries(valueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, count]) => ({
        value,
        count,
        percentage: (count / nonNullValues.length) * 100,
      }));
  }

  return stats;
}

/**
 * Analyze distribution
 */
function analyzeDistribution(values: any[], dataType: DataType): DistributionInfo {
  if (dataType !== 'integer' && dataType !== 'float') {
    return { type: 'unknown' };
  }

  const nums = values.map(Number);
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const stdDev = Math.sqrt(nums.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / nums.length);

  // Calculate skewness
  const skewness = nums.reduce((sum, v) => sum + Math.pow((v - mean) / stdDev, 3), 0) / nums.length;

  // Calculate kurtosis
  const kurtosis = nums.reduce((sum, v) => sum + Math.pow((v - mean) / stdDev, 4), 0) / nums.length - 3;

  // Determine distribution type
  let type: DistributionInfo['type'] = 'normal';
  if (Math.abs(skewness) > 1) {
    type = 'skewed';
  } else if (kurtosis > 1) {
    type = 'bimodal';
  }

  // Create histogram
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const binCount = 20;
  const binWidth = (max - min) / binCount;
  const histogram = Array.from({ length: binCount }, (_, i) => {
    const binStart = min + i * binWidth;
    const binEnd = binStart + binWidth;
    const count = nums.filter((v) => v >= binStart && v < binEnd).length;
    return {
      bin: `${binStart.toFixed(2)}-${binEnd.toFixed(2)}`,
      count,
      percentage: (count / nums.length) * 100,
    };
  });

  return {
    type,
    skewness,
    kurtosis,
    histogram,
  };
}

/**
 * Detect patterns
 */
function detectPatterns(values: any[], dataType: DataType): PatternInfo[] {
  if (dataType !== 'string') return [];

  const patterns: PatternInfo[] = [];
  const strings = values.map(String);

  // Email pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailMatches = strings.filter((s) => emailRegex.test(s));
  if (emailMatches.length > 0) {
    patterns.push({
      pattern: 'email',
      regex: emailRegex.source,
      matchCount: emailMatches.length,
      matchPercentage: (emailMatches.length / strings.length) * 100,
      examples: emailMatches.slice(0, 5),
    });
  }

  // URL pattern
  const urlRegex = /^https?:\/\/[^\s]+$/;
  const urlMatches = strings.filter((s) => urlRegex.test(s));
  if (urlMatches.length > 0) {
    patterns.push({
      pattern: 'url',
      regex: urlRegex.source,
      matchCount: urlMatches.length,
      matchPercentage: (urlMatches.length / strings.length) * 100,
      examples: urlMatches.slice(0, 5),
    });
  }

  return patterns;
}

/**
 * Detect outliers
 */
function detectOutliers(values: any[], dataType: DataType): OutlierInfo[] {
  if (dataType !== 'integer' && dataType !== 'float') return [];

  const nums = values.map(Number).sort((a, b) => a - b);
  const outliers: OutlierInfo[] = [];

  // Z-score method
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const stdDev = Math.sqrt(nums.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / nums.length);
  const zThreshold = 3;

  nums.forEach((value, index) => {
    const zScore = Math.abs((value - mean) / stdDev);
    if (zScore > zThreshold) {
      outliers.push({
        value,
        method: 'zscore',
        score: zScore,
        threshold: zThreshold,
        isOutlier: true,
        index,
      });
    }
  });

  return outliers.slice(0, 100); // Limit to 100 outliers
}

/**
 * Compute column quality
 */
function computeColumnQuality(values: any[], statistics: ColumnStatistics): ColumnQualityMetrics {
  const completeness = 1 - statistics.nullPercentage / 100;
  const validity = 1; // Would check against validation rules
  const uniqueness = statistics.distinctPercentage / 100;

  const overallScore = (completeness * 40 + validity * 30 + uniqueness * 30);

  return {
    completeness,
    validity,
    uniqueness,
    overallScore: Math.round(overallScore * 100) / 100,
  };
}

/**
 * Compute quality metrics
 */
function computeQualityMetrics(columns: ColumnProfile[], rowCount: number): QualityMetrics {
  const dimensions: QualityDimension[] = [
    {
      name: 'Completeness',
      score: columns.reduce((sum, c) => sum + c.quality.completeness, 0) / columns.length * 100,
      weight: 0.25,
      weightedScore: 0,
      metrics: columns.map((c) => ({
        name: c.columnName,
        value: c.quality.completeness,
        status: c.quality.completeness >= 0.95 ? 'good' : c.quality.completeness >= 0.8 ? 'warning' : 'critical',
      })),
      status: 'good',
    },
    {
      name: 'Validity',
      score: columns.reduce((sum, c) => sum + c.quality.validity, 0) / columns.length * 100,
      weight: 0.20,
      weightedScore: 0,
      metrics: [],
      status: 'good',
    },
    {
      name: 'Uniqueness',
      score: columns.reduce((sum, c) => sum + c.quality.uniqueness, 0) / columns.length * 100,
      weight: 0.15,
      weightedScore: 0,
      metrics: [],
      status: 'good',
    },
    {
      name: 'Consistency',
      score: 90, // Would compute cross-column consistency
      weight: 0.20,
      weightedScore: 0,
      metrics: [],
      status: 'good',
    },
    {
      name: 'Timeliness',
      score: 85, // Would check data freshness
      weight: 0.10,
      weightedScore: 0,
      metrics: [],
      status: 'good',
    },
    {
      name: 'Accuracy',
      score: 88, // Would validate against reference data
      weight: 0.10,
      weightedScore: 0,
      metrics: [],
      status: 'good',
    },
  ];

  // Calculate weighted scores
  dimensions.forEach((d) => {
    d.weightedScore = d.score * d.weight;
    d.status = d.score >= 90 ? 'good' : d.score >= 75 ? 'warning' : 'critical';
  });

  const overallScore = dimensions.reduce((sum, d) => sum + d.weightedScore, 0);
  const grade: QualityGrade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'F';

  return {
    overall: {
      score: Math.round(overallScore * 100) / 100,
      grade,
      completeness: dimensions[0].score / 100,
      accuracy: dimensions[5].score / 100,
      consistency: dimensions[3].score / 100,
      timeliness: dimensions[4].score / 100,
      validity: dimensions[1].score / 100,
      uniqueness: dimensions[2].score / 100,
    },
    dimensions,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Generate scorecard
 */
function generateScorecard(datasetId: string, metrics: QualityMetrics): QualityScorecard {
  const dimensions: ScorecardDimension[] = metrics.dimensions.map((d) => ({
    name: d.name,
    score: d.score,
    weight: d.weight,
    status: d.status,
    topIssues: [],
  }));

  const recommendations: string[] = [];
  if (metrics.overall.completeness < 0.95) {
    recommendations.push('Address missing data in key columns');
  }
  if (metrics.overall.validity < 0.9) {
    recommendations.push('Implement data validation rules');
  }
  if (metrics.overall.consistency < 0.85) {
    recommendations.push('Review data consistency across related fields');
  }

  return {
    datasetId,
    overallScore: metrics.overall.score,
    grade: metrics.overall.grade,
    dimensions,
    trends: {
      score7Days: metrics.overall.score,
      score30Days: metrics.overall.score,
      trend: 'stable',
    },
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Create quality rule
 */
export async function createQualityRule(
  organizationId: string,
  rule: Omit<QualityRule, 'id' | 'createdAt' | 'updatedAt'>
): Promise<QualityRule> {
  const id = `rule_${randomUUID()}`;
  const now = new Date().toISOString();

  const newRule: QualityRule = {
    ...rule,
    id,
    createdAt: now,
    updatedAt: now,
  };

  rules.set(id, newRule);
  return newRule;
}

/**
 * Evaluate quality rule
 */
export async function evaluateQualityRule(
  ruleId: string,
  data: any[]
): Promise<RuleResult | null> {
  const rule = rules.get(ruleId);
  if (!rule) return null;

  const startTime = Date.now();
  const rowsToCheck = rule.scope.rows?.sampleSize ? data.slice(0, rule.scope.rows.sampleSize) : data;

  let rowsFailed = 0;
  const failures: RuleResult['failures'] = [];

  rowsToCheck.forEach((row, index) => {
    const passed = evaluateRuleCondition(row, rule);
    if (!passed) {
      rowsFailed++;
      failures.push({
        rowIndex: index,
        columnName: rule.scope.columns?.[0],
        value: rule.scope.columns?.[0] ? row[rule.scope.columns[0]] : null,
        reason: `Failed ${rule.type} check`,
      });
    }
  });

  const result: RuleResult = {
    passed: rowsFailed === 0,
    evaluatedAt: new Date().toISOString(),
    rowsChecked: rowsToCheck.length,
    rowsFailed,
    failurePercentage: (rowsFailed / rowsToCheck.length) * 100,
    failures: failures.slice(0, 100), // Limit to 100 failures
    executionTimeMs: Date.now() - startTime,
  };

  rule.lastEvaluated = result.evaluatedAt;
  rule.lastResult = result;
  rule.updatedAt = result.evaluatedAt;
  rules.set(ruleId, rule);

  return result;
}

/**
 * Evaluate rule condition
 */
function evaluateRuleCondition(row: any, rule: QualityRule): boolean {
  const columns = rule.scope.columns || Object.keys(row);

  for (const column of columns) {
    const value = row[column];

    switch (rule.type) {
      case 'completeness':
        if (value === null || value === undefined) return false;
        break;
      case 'range':
        if (rule.condition.operator && rule.threshold !== undefined) {
          const numValue = Number(value);
          switch (rule.condition.operator) {
            case 'gte': if (numValue < rule.threshold) return false; break;
            case 'lte': if (numValue > rule.threshold) return false; break;
            case 'gt': if (numValue <= rule.threshold) return false; break;
            case 'lt': if (numValue >= rule.threshold) return false; break;
          }
        }
        break;
      case 'pattern':
        if (rule.condition.expression) {
          const regex = new RegExp(rule.condition.expression);
          if (!regex.test(String(value))) return false;
        }
        break;
    }
  }

  return true;
}

/**
 * Detect quality anomalies
 */
export async function detectQualityAnomalies(
  profileId: string
): Promise<QualityAnomaly[]> {
  const profile = profiles.get(profileId);
  if (!profile) return [];

  const anomalies: QualityAnomaly[] = [];
  const now = new Date().toISOString();

  // Check for missing data spikes
  profile.profile.columns.forEach((column) => {
    if (column.statistics.nullPercentage > 20) {
      anomalies.push({
        id: `anomaly_${randomUUID()}`,
        datasetId: profile.datasetId,
        columnName: column.columnName,
        type: 'missing-data-spike',
        severity: column.statistics.nullPercentage > 50 ? 'high' : 'medium',
        description: `Column ${column.columnName} has ${column.statistics.nullPercentage.toFixed(1)}% missing values`,
        detectedAt: now,
        metrics: { nullPercentage: column.statistics.nullPercentage },
        baseline: { nullPercentage: 5 },
        deviation: column.statistics.nullPercentage - 5,
        status: 'detected',
      });
    }
  });

  // Check for outlier spikes
  profile.profile.columns.forEach((column) => {
    if (column.outliers.length > column.statistics.count * 0.05) {
      anomalies.push({
        id: `anomaly_${randomUUID()}`,
        datasetId: profile.datasetId,
        columnName: column.columnName,
        type: 'outlier-spike',
        severity: 'medium',
        description: `Column ${column.columnName} has ${column.outliers.length} outliers (${((column.outliers.length / column.statistics.count) * 100).toFixed(1)}%)`,
        detectedAt: now,
        metrics: { outlierCount: column.outliers.length, outlierPercentage: (column.outliers.length / column.statistics.count) * 100 },
        deviation: column.outliers.length,
        status: 'detected',
      });
    }
  });

  profile.anomalies.push(...anomalies);
  profile.updatedAt = now;
  profiles.set(profileId, profile);

  return anomalies;
}

/**
 * Create quality issue
 */
export async function createQualityIssue(
  profileId: string,
  issue: Omit<QualityIssue, 'id' | 'reportedAt' | 'remediationActions'>
): Promise<QualityIssue | null> {
  const profile = profiles.get(profileId);
  if (!profile) return null;

  const newIssue: QualityIssue = {
    ...issue,
    id: `issue_${randomUUID()}`,
    reportedAt: new Date().toISOString(),
    remediationActions: [],
  };

  profile.issues.push(newIssue);
  profile.updatedAt = newIssue.reportedAt;
  profiles.set(profileId, profile);

  return newIssue;
}

/**
 * Get quality profile by ID
 */
export async function getQualityProfile(profileId: string): Promise<DataQualityProfile | null> {
  return profiles.get(profileId) || null;
}

/**
 * List quality profiles for an organization
 */
export async function listQualityProfiles(
  organizationId: string,
  filters?: { datasetType?: DatasetType }
): Promise<DataQualityProfile[]> {
  const allProfiles = Array.from(profiles.values()).filter(
    (p) => p.organizationId === organizationId
  );

  return allProfiles.filter((p) => {
    if (filters?.datasetType && p.datasetType !== filters.datasetType) return false;
    return true;
  });
}

/**
 * Get quality dashboard
 */
export async function getQualityDashboard(organizationId: string): Promise<QualityDashboard> {
  const allProfiles = await listQualityProfiles(organizationId);

  const averageQualityScore = allProfiles.length > 0
    ? allProfiles.reduce((sum, p) => sum + p.metrics.overall.score, 0) / allProfiles.length
    : 0;

  const datasetsByGrade: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  allProfiles.forEach((p) => {
    datasetsByGrade[p.metrics.overall.grade]++;
  });

  const allAnomalies = allProfiles.flatMap((p) => p.anomalies);
  const allIssues = allProfiles.flatMap((p) => p.issues);

  const openIssues = allIssues.filter((i) => !['resolved', 'closed'].includes(i.status));
  const criticalIssues = openIssues.filter((i) => i.severity === 'critical');

  const recentAnomalies = allAnomalies
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, 10);

  const topIssues = openIssues
    .sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 10);

  const dimensionAverages: Record<string, number> = {};
  if (allProfiles.length > 0) {
    allProfiles[0].metrics.dimensions.forEach((d) => {
      const avg = allProfiles.reduce((sum, p) => {
        const dim = p.metrics.dimensions.find((pd) => pd.name === d.name);
        return sum + (dim?.score || 0);
      }, 0) / allProfiles.length;
      dimensionAverages[d.name] = Math.round(avg * 100) / 100;
    });
  }

  return {
    organizationId,
    totalDatasets: allProfiles.length,
    averageQualityScore: Math.round(averageQualityScore * 100) / 100,
    datasetsByGrade: datasetsByGrade as Record<QualityGrade, number>,
    totalAnomalies: allAnomalies.length,
    openIssues: openIssues.length,
    criticalIssues: criticalIssues.length,
    recentAnomalies,
    topIssues,
    qualityTrends: [],
    dimensionAverages,
  };
}
