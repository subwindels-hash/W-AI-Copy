/**
 * Module 75: AI Experiment Analysis Service
 *
 * Provides advanced experiment analytics including statistical analysis, parameter
 * importance analysis, experiment clustering, anomaly detection, trend analysis,
 * automated insights generation, visualization data generation, and experiment
 * recommendations for data-driven experiment management.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiExperimentAnalysis');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ExperimentAnalysis {
  id: string;
  organizationId: string;
  experimentIds: string[];
  analysisType: AnalysisType;
  results: AnalysisResults;
  insights: Insight[];
  recommendations: Recommendation[];
  visualizations: VisualizationData[];
  createdAt: string;
  createdBy: string;
}

export type AnalysisType =
  | 'statistical'
  | 'parameter-importance'
  | 'correlation'
  | 'clustering'
  | 'anomaly-detection'
  | 'trend'
  | 'comparison'
  | 'comprehensive';

export interface AnalysisResults {
  statistical?: StatisticalAnalysis;
  parameterImportance?: ParameterImportanceAnalysis;
  correlation?: CorrelationAnalysis;
  clustering?: ClusteringAnalysis;
  anomalies?: AnomalyDetectionResults;
  trends?: TrendAnalysis;
  comparison?: ComparisonAnalysis;
}

export interface StatisticalAnalysis {
  experiments: Array<{
    experimentId: string;
    experimentName: string;
    metrics: Record<string, MetricStatistics>;
  }>;
  significanceTests: SignificanceTest[];
  confidenceIntervals: Record<string, ConfidenceInterval>;
}

export interface MetricStatistics {
  count: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
  percentiles: Record<string, number>;
  distribution: DistributionInfo;
}

export interface DistributionInfo {
  type: 'normal' | 'skewed' | 'bimodal' | 'uniform' | 'unknown';
  skewness: number;
  kurtosis: number;
  normalityTest: {
    statistic: number;
    pValue: number;
    isNormal: boolean;
  };
}

export interface SignificanceTest {
  metric: string;
  experiment1Id: string;
  experiment2Id: string;
  testType: 't-test' | 'mann-whitney' | 'wilcoxon' | 'anova';
  statistic: number;
  pValue: number;
  significant: boolean;
  effectSize: number;
  confidence: number;
}

export interface ConfidenceInterval {
  metric: string;
  lower: number;
  upper: number;
  confidence: number;
  mean: number;
}

export interface ParameterImportanceAnalysis {
  method: ImportanceMethod;
  importances: ParameterImportance[];
  interactions: ParameterInteraction[];
  topParameters: ParameterImportance[];
}

export type ImportanceMethod = 'shap' | 'permutation' | 'correlation' | 'mutual-info' | 'anova';

export interface ParameterImportance {
  parameter: string;
  importance: number;
  rank: number;
  direction: 'positive' | 'negative' | 'none';
  confidence: number;
  pValue?: number;
}

export interface ParameterInteraction {
  parameter1: string;
  parameter2: string;
  interactionStrength: number;
  type: 'synergistic' | 'antagonistic' | 'independent';
}

export interface CorrelationAnalysis {
  parameterCorrelations: CorrelationMatrix;
  metricCorrelations: CorrelationMatrix;
  parameterMetricCorrelations: CorrelationMatrix;
  significantCorrelations: SignificantCorrelation[];
}

export interface CorrelationMatrix {
  labels: string[];
  matrix: number[][];
  pValues?: number[][];
}

export interface SignificantCorrelation {
  variable1: string;
  variable2: string;
  correlation: number;
  pValue: number;
  type: 'positive' | 'negative';
  strength: 'weak' | 'moderate' | 'strong';
}

export interface ClusteringAnalysis {
  method: ClusteringMethod;
  nClusters: number;
  clusters: ExperimentCluster[];
  silhouetteScore: number;
  optimalClusters: number;
}

export type ClusteringMethod = 'kmeans' | 'hierarchical' | 'dbscan' | 'spectral';

export interface ExperimentCluster {
  clusterId: number;
  experimentIds: string[];
  size: number;
  centroid: Record<string, number>;
  characteristics: ClusterCharacteristic[];
  label?: string;
}

export interface ClusterCharacteristic {
  feature: string;
  value: number;
  significance: number;
  description: string;
}

export interface AnomalyDetectionResults {
  method: AnomalyDetectionMethod;
  anomalies: ExperimentAnomaly[];
  totalAnomalies: number;
  anomalyRate: number;
}

export type AnomalyDetectionMethod = 'isolation-forest' | 'local-outlier-factor' | 'z-score' | 'dbscan';

export interface ExperimentAnomaly {
  experimentId: string;
  experimentName: string;
  anomalyScore: number;
  affectedMetrics: string[];
  affectedParameters: string[];
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export interface TrendAnalysis {
  metric: string;
  trends: MetricTrend[];
  overallTrend: TrendDirection;
  changePoints: ChangePoint[];
  seasonality: SeasonalityInfo;
}

export interface MetricTrend {
  experimentId: string;
  experimentName: string;
  direction: TrendDirection;
  slope: number;
  r2: number;
  significant: boolean;
}

export type TrendDirection = 'increasing' | 'decreasing' | 'stable' | 'fluctuating';

export interface ChangePoint {
  index: number;
  timestamp: string;
  valueBefore: number;
  valueAfter: number;
  magnitude: number;
}

export interface SeasonalityInfo {
  detected: boolean;
  period?: number;
  amplitude?: number;
  phase?: number;
}

export interface ComparisonAnalysis {
  experiments: Array<{
    experimentId: string;
    experimentName: string;
    parameters: Record<string, any>;
    metrics: Record<string, number>;
  }>;
  bestExperiment: {
    experimentId: string;
    experimentName: string;
    metric: string;
    value: number;
  };
  parameterDifferences: ParameterDifference[];
  metricDifferences: MetricDifference[];
  tradeoffs: Tradeoff[];
}

export interface ParameterDifference {
  parameter: string;
  values: Array<{ experimentId: string; value: any }>;
  variance: number;
  impact: 'high' | 'medium' | 'low';
}

export interface MetricDifference {
  metric: string;
  values: Array<{ experimentId: string; value: number }>;
  bestExperimentId: string;
  worstExperimentId: string;
  range: number;
}

export interface Tradeoff {
  metric1: string;
  metric2: string;
  correlation: number;
  description: string;
  paretoFront: string[]; // Experiment IDs on Pareto front
}

export interface Insight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  importance: 'high' | 'medium' | 'low';
  evidence: string[];
  metrics?: string[];
  parameters?: string[];
  experiments?: string[];
}

export type InsightType =
  | 'performance'
  | 'parameter'
  | 'correlation'
  | 'anomaly'
  | 'trend'
  | 'optimization'
  | 'reproducibility';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  expectedImpact: string;
  effort: 'low' | 'medium' | 'high';
  parameters?: Record<string, any>;
  experiments?: string[];
}

export type RecommendationType =
  | 'hyperparameter'
  | 'experiment-design'
  | 'optimization-strategy'
  | 'resource-allocation'
  | 'investigation';

export interface VisualizationData {
  id: string;
  type: VisualizationType;
  title: string;
  description?: string;
  data: any;
  config: VisualizationConfig;
}

export type VisualizationType =
  | 'parallel-coordinates'
  | 'hyperparameter-importance'
  | 'correlation-heatmap'
  | 'learning-curve'
  | 'optimization-trajectory'
  | 'metric-distribution'
  | 'parameter-interaction'
  | 'experiment-comparison'
  | 'trend-line'
  | 'cluster-scatter';

export interface VisualizationConfig {
  width?: number;
  height?: number;
  colorScheme?: string;
  interactive?: boolean;
  exportFormats?: string[];
}

export interface AnalysisDashboard {
  organizationId: string;
  totalAnalyses: number;
  recentAnalyses: ExperimentAnalysis[];
  topInsights: Insight[];
  topRecommendations: Recommendation[];
  parameterImportanceSummary: Array<{
    parameter: string;
    averageImportance: number;
    frequency: number;
  }>;
  metricTrends: Array<{
    metric: string;
    trend: TrendDirection;
    bestExperimentId?: string;
  }>;
  anomalySummary: {
    totalAnomalies: number;
    anomalyRate: number;
    recentAnomalies: ExperimentAnomaly[];
  };
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const analyses = new Map<string, ExperimentAnalysis>();

// ─── Analysis Functions ────────────────────────────────────────────────────────

/**
 * Perform statistical analysis on experiments
 */
export async function performStatisticalAnalysis(
  organizationId: string,
  experimentIds: string[],
  metrics: string[],
  createdBy: string
): Promise<ExperimentAnalysis> {
  const id = `analysis_${randomUUID()}`;
  const now = new Date().toISOString();

  // Simulate statistical analysis
  const experiments = experimentIds.map((expId) => ({
    experimentId: expId,
    experimentName: `Experiment ${expId.slice(0, 8)}`,
    metrics: metrics.reduce((acc, metric) => {
      acc[metric] = generateMetricStatistics();
      return acc;
    }, {} as Record<string, MetricStatistics>),
  }));

  const significanceTests: SignificanceTest[] = [];
  for (let i = 0; i < experimentIds.length; i++) {
    for (let j = i + 1; j < experimentIds.length; j++) {
      for (const metric of metrics) {
        significanceTests.push({
          metric,
          experiment1Id: experimentIds[i],
          experiment2Id: experimentIds[j],
          testType: 't-test',
          statistic: _rng.next() * 5,
          pValue: _rng.next(),
          significant: _rng.next() > 0.5,
          effectSize: _rng.next() * 2,
          confidence: 0.95,
        });
      }
    }
  }

  const confidenceIntervals = metrics.reduce((acc, metric) => {
    const mean = _rng.next() * 100;
    const margin = _rng.next() * 10;
    acc[metric] = {
      metric,
      lower: mean - margin,
      upper: mean + margin,
      confidence: 0.95,
      mean,
    };
    return acc;
  }, {} as Record<string, ConfidenceInterval>);

  const insights: Insight[] = [
    {
      id: `insight_${randomUUID()}`,
      type: 'performance',
      title: 'Significant Performance Difference Detected',
      description: `Statistical analysis reveals significant differences in ${metrics[0]} between experiments`,
      importance: 'high',
      evidence: significanceTests.filter((t) => t.significant).map((t) => `${t.metric}: p=${t.pValue.toFixed(3)}`),
      metrics,
      experiments: experimentIds,
    },
  ];

  const recommendations: Recommendation[] = [
    {
      id: `rec_${randomUUID()}`,
      type: 'investigation',
      title: 'Investigate Performance Differences',
      description: 'Analyze parameters that contribute to significant performance differences',
      priority: 'high',
      expectedImpact: 'Better understanding of performance drivers',
      effort: 'medium',
      experiments: experimentIds,
    },
  ];

  const analysis: ExperimentAnalysis = {
    id,
    organizationId,
    experimentIds,
    analysisType: 'statistical',
    results: {
      statistical: {
        experiments,
        significanceTests,
        confidenceIntervals,
      },
    },
    insights,
    recommendations,
    visualizations: generateStatisticalVisualizations(experiments, significanceTests),
    createdAt: now,
    createdBy,
  };

  analyses.set(id, analysis);
  return analysis;
}

/**
 * Analyze parameter importance
 */
export async function analyzeParameterImportance(
  organizationId: string,
  experimentIds: string[],
  targetMetric: string,
  method: ImportanceMethod,
  createdBy: string
): Promise<ExperimentAnalysis> {
  const id = `analysis_${randomUUID()}`;
  const now = new Date().toISOString();

  // Simulate parameter importance analysis
  const parameters = ['learning_rate', 'batch_size', 'num_layers', 'dropout', 'optimizer'];
  const importances: ParameterImportance[] = parameters
    .map((param, idx) => ({
      parameter: param,
      importance: _rng.next(),
      rank: idx + 1,
      direction: (_rng.next() > 0.5 ? 'positive' : 'negative') as 'positive' | 'negative',
      confidence: 0.7 + _rng.next() * 0.3,
      pValue: _rng.next() * 0.1,
    }))
    .sort((a, b) => b.importance - a.importance)
    .map((imp, idx) => ({ ...imp, rank: idx + 1 }));

  const interactions: ParameterInteraction[] = [
    {
      parameter1: 'learning_rate',
      parameter2: 'batch_size',
      interactionStrength: 0.6,
      type: 'synergistic',
    },
    {
      parameter1: 'num_layers',
      parameter2: 'dropout',
      interactionStrength: 0.4,
      type: 'antagonistic',
    },
  ];

  const insights: Insight[] = [
    {
      id: `insight_${randomUUID()}`,
      type: 'parameter',
      title: `${importances[0].parameter} is Most Important`,
      description: `${importances[0].parameter} has the highest impact on ${targetMetric} with importance ${importances[0].importance.toFixed(3)}`,
      importance: 'high',
      evidence: [`Importance: ${importances[0].importance.toFixed(3)}`, `Direction: ${importances[0].direction}`],
      parameters: [importances[0].parameter],
    },
  ];

  const recommendations: Recommendation[] = [
    {
      id: `rec_${randomUUID()}`,
      type: 'hyperparameter',
      title: `Focus on Tuning ${importances[0].parameter}`,
      description: `${importances[0].parameter} has the highest impact on ${targetMetric}. Consider fine-tuning this parameter.`,
      priority: 'high',
      expectedImpact: `Potential ${targetMetric} improvement`,
      effort: 'low',
      parameters: { [importances[0].parameter]: 'tune' },
    },
  ];

  const analysis: ExperimentAnalysis = {
    id,
    organizationId,
    experimentIds,
    analysisType: 'parameter-importance',
    results: {
      parameterImportance: {
        method,
        importances,
        interactions,
        topParameters: importances.slice(0, 5),
      },
    },
    insights,
    recommendations,
    visualizations: generateImportanceVisualizations(importances, interactions),
    createdAt: now,
    createdBy,
  };

  analyses.set(id, analysis);
  return analysis;
}

/**
 * Perform correlation analysis
 */
export async function performCorrelationAnalysis(
  organizationId: string,
  experimentIds: string[],
  variables: string[],
  createdBy: string
): Promise<ExperimentAnalysis> {
  const id = `analysis_${randomUUID()}`;
  const now = new Date().toISOString();

  // Simulate correlation matrix
  const n = variables.length;
  const matrix: number[][] = [];
  const pValues: number[][] = [];

  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    pValues[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
        pValues[i][j] = 0;
      } else if (j < i) {
        matrix[i][j] = matrix[j][i];
        pValues[i][j] = pValues[j][i];
      } else {
        matrix[i][j] = (_rng.next() - 0.5) * 2;
        pValues[i][j] = _rng.next();
      }
    }
  }

  const significantCorrelations: SignificantCorrelation[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (pValues[i][j] < 0.05) {
        const corr = matrix[i][j];
        significantCorrelations.push({
          variable1: variables[i],
          variable2: variables[j],
          correlation: corr,
          pValue: pValues[i][j],
          type: corr > 0 ? 'positive' : 'negative',
          strength: Math.abs(corr) > 0.7 ? 'strong' : Math.abs(corr) > 0.4 ? 'moderate' : 'weak',
        });
      }
    }
  }

  const insights: Insight[] = significantCorrelations
    .filter((c) => c.strength === 'strong')
    .map((c) => ({
      id: `insight_${randomUUID()}`,
      type: 'correlation',
      title: `Strong ${c.type} Correlation: ${c.variable1} and ${c.variable2}`,
      description: `${c.variable1} and ${c.variable2} have a strong ${c.type} correlation (r=${c.correlation.toFixed(3)})`,
      importance: 'high',
      evidence: [`Correlation: ${c.correlation.toFixed(3)}`, `P-value: ${c.pValue.toFixed(3)}`],
      parameters: [c.variable1, c.variable2],
    }));

  const analysis: ExperimentAnalysis = {
    id,
    organizationId,
    experimentIds,
    analysisType: 'correlation',
    results: {
      correlation: {
        parameterCorrelations: { labels: variables, matrix, pValues },
        metricCorrelations: { labels: [], matrix: [] },
        parameterMetricCorrelations: { labels: [], matrix: [] },
        significantCorrelations,
      },
    },
    insights,
    recommendations: [],
    visualizations: [
      {
        id: `viz_${randomUUID()}`,
        type: 'correlation-heatmap',
        title: 'Correlation Heatmap',
        data: { labels: variables, matrix },
        config: { width: 800, height: 600, colorScheme: 'RdBu', interactive: true },
      },
    ],
    createdAt: now,
    createdBy,
  };

  analyses.set(id, analysis);
  return analysis;
}

/**
 * Detect anomalies in experiments
 */
export async function detectExperimentAnomalies(
  organizationId: string,
  experimentIds: string[],
  method: AnomalyDetectionMethod,
  createdBy: string
): Promise<ExperimentAnalysis> {
  const id = `analysis_${randomUUID()}`;
  const now = new Date().toISOString();

  // Simulate anomaly detection
  const anomalies: ExperimentAnomaly[] = experimentIds
    .filter(() => _rng.next() > 0.8) // 20% anomaly rate
    .map((expId) => ({
      experimentId: expId,
      experimentName: `Experiment ${expId.slice(0, 8)}`,
      anomalyScore: 0.7 + _rng.next() * 0.3,
      affectedMetrics: ['accuracy', 'loss'],
      affectedParameters: ['learning_rate'],
      reason: 'Unusual metric values detected',
      severity: (_rng.next() > 0.7 ? 'high' : _rng.next() > 0.4 ? 'medium' : 'low') as any,
    }));

  const insights: Insight[] = anomalies.length > 0
    ? [
        {
          id: `insight_${randomUUID()}`,
          type: 'anomaly',
          title: `${anomalies.length} Anomalous Experiments Detected`,
          description: `${anomalies.length} experiments show unusual behavior patterns`,
          importance: anomalies.some((a) => a.severity === 'high') ? 'high' : 'medium',
          evidence: anomalies.map((a) => `${a.experimentName}: score=${a.anomalyScore.toFixed(3)}`),
          experiments: anomalies.map((a) => a.experimentId),
        },
      ]
    : [];

  const recommendations: Recommendation[] = anomalies.length > 0
    ? [
        {
          id: `rec_${randomUUID()}`,
          type: 'investigation',
          title: 'Investigate Anomalous Experiments',
          description: `${anomalies.length} experiments show unusual patterns. Review these experiments for errors or insights.`,
          priority: anomalies.some((a) => a.severity === 'high') ? 'high' : 'medium',
          expectedImpact: 'Identify errors or discover novel patterns',
          effort: 'medium',
          experiments: anomalies.map((a) => a.experimentId),
        },
      ]
    : [];

  const analysis: ExperimentAnalysis = {
    id,
    organizationId,
    experimentIds,
    analysisType: 'anomaly-detection',
    results: {
      anomalies: {
        method,
        anomalies,
        totalAnomalies: anomalies.length,
        anomalyRate: anomalies.length / experimentIds.length,
      },
    },
    insights,
    recommendations,
    visualizations: [],
    createdAt: now,
    createdBy,
  };

  analyses.set(id, analysis);
  return analysis;
}

/**
 * Get analysis by ID
 */
export async function getExperimentAnalysis(analysisId: string): Promise<ExperimentAnalysis | null> {
  return analyses.get(analysisId) || null;
}

/**
 * List analyses for an organization
 */
export async function listExperimentAnalyses(
  organizationId: string,
  filters?: { analysisType?: AnalysisType; limit?: number }
): Promise<ExperimentAnalysis[]> {
  const allAnalyses = Array.from(analyses.values()).filter(
    (a) => a.organizationId === organizationId
  );

  let filtered = allAnalyses;
  if (filters?.analysisType) {
    filtered = filtered.filter((a) => a.analysisType === filters.analysisType);
  }

  return filtered
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit || 50);
}

/**
 * Get analysis dashboard
 */
export async function getAnalysisDashboard(organizationId: string): Promise<AnalysisDashboard> {
  const allAnalyses = await listExperimentAnalyses(organizationId, { limit: 100 });

  const recentAnalyses = allAnalyses.slice(0, 10);

  const allInsights = allAnalyses.flatMap((a) => a.insights);
  const topInsights = allInsights
    .filter((i) => i.importance === 'high')
    .slice(0, 10);

  const allRecommendations = allAnalyses.flatMap((a) => a.recommendations);
  const topRecommendations = allRecommendations
    .filter((r) => r.priority === 'high')
    .slice(0, 10);

  const parameterImportanceMap = new Map<string, { total: number; count: number }>();
  for (const analysis of allAnalyses) {
    if (analysis.results.parameterImportance) {
      for (const imp of analysis.results.parameterImportance.importances) {
        const current = parameterImportanceMap.get(imp.parameter) || { total: 0, count: 0 };
        parameterImportanceMap.set(imp.parameter, {
          total: current.total + imp.importance,
          count: current.count + 1,
        });
      }
    }
  }

  const parameterImportanceSummary = Array.from(parameterImportanceMap.entries())
    .map(([param, data]) => ({
      parameter: param,
      averageImportance: data.total / data.count,
      frequency: data.count,
    }))
    .sort((a, b) => b.averageImportance - a.averageImportance)
    .slice(0, 10);

  const allAnomalies = allAnalyses
    .filter((a) => a.results.anomalies)
    .flatMap((a) => a.results.anomalies!.anomalies);

  return {
    organizationId,
    totalAnalyses: allAnalyses.length,
    recentAnalyses,
    topInsights,
    topRecommendations,
    parameterImportanceSummary,
    metricTrends: [],
    anomalySummary: {
      totalAnomalies: allAnomalies.length,
      anomalyRate: allAnalyses.length > 0 ? allAnomalies.length / allAnalyses.length : 0,
      recentAnomalies: allAnomalies.slice(0, 10),
    },
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function generateMetricStatistics(): MetricStatistics {
  const mean = _rng.next() * 100;
  const std = _rng.next() * 20;
  return {
    count: 100 + Math.floor(_rng.next() * 900),
    mean,
    std,
    min: mean - std * 3,
    max: mean + std * 3,
    median: mean + (_rng.next() - 0.5) * std,
    percentiles: {
      p25: mean - std * 0.67,
      p50: mean,
      p75: mean + std * 0.67,
      p90: mean + std * 1.28,
      p95: mean + std * 1.64,
    },
    distribution: {
      type: 'normal',
      skewness: (_rng.next() - 0.5) * 2,
      kurtosis: 3 + (_rng.next() - 0.5) * 2,
      normalityTest: {
        statistic: _rng.next(),
        pValue: _rng.next(),
        isNormal: _rng.next() > 0.5,
      },
    },
  };
}

function generateStatisticalVisualizations(
  experiments: any[],
  tests: SignificanceTest[]
): VisualizationData[] {
  return [
    {
      id: `viz_${randomUUID()}`,
      type: 'metric-distribution',
      title: 'Metric Distributions',
      data: { experiments },
      config: { width: 800, height: 600, interactive: true },
    },
    {
      id: `viz_${randomUUID()}`,
      type: 'experiment-comparison',
      title: 'Experiment Comparison',
      data: { experiments, tests },
      config: { width: 1000, height: 600, interactive: true },
    },
  ];
}

function generateImportanceVisualizations(
  importances: ParameterImportance[],
  interactions: ParameterInteraction[]
): VisualizationData[] {
  return [
    {
      id: `viz_${randomUUID()}`,
      type: 'hyperparameter-importance',
      title: 'Parameter Importance',
      data: { importances },
      config: { width: 800, height: 600, interactive: true },
    },
    {
      id: `viz_${randomUUID()}`,
      type: 'parameter-interaction',
      title: 'Parameter Interactions',
      data: { interactions },
      config: { width: 800, height: 600, interactive: true },
    },
  ];
}
