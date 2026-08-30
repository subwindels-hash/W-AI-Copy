/**
 * Module 85: AI Compression Benchmarking Service
 *
 * Provides standardized compression benchmarking and comparison including
 * multi-technique compression comparison, compression leaderboards,
 * hardware-specific benchmarking, compression trade-off analysis,
 * compression best practice recommendations, and compression ROI analysis.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CompressionBenchmarkSuite {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: BenchmarkSuiteStatus;
  baseModel: BenchmarkBaseModel;
  compressedModels: BenchmarkCompressedModel[];
  benchmarkConfig: BenchmarkConfig;
  results: BenchmarkResults;
  comparison: CompressionComparison;
  recommendations: BenchmarkRecommendation[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type BenchmarkSuiteStatus =
  | 'planned'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BenchmarkBaseModel {
  modelId: string;
  modelName: string;
  version: string;
  framework: string;
  format: string;
  sizeBytes: number;
  numParameters: number;
  architecture: string;
  metrics: BenchmarkModelMetrics;
  metadata?: Record<string, any>;
}

export interface BenchmarkCompressedModel {
  id: string;
  modelId: string;
  modelName: string;
  version: string;
  compressionTechnique: CompressionTechnique;
  compressionConfig: CompressionBenchmarkConfig;
  sizeBytes: number;
  numParameters: number;
  compressionRatio: number;
  metrics: BenchmarkModelMetrics;
  qualityDegradation: number;
  compressionTime: number;
  metadata?: Record<string, any>;
}

export type CompressionTechnique =
  | 'quantization-int8'
  | 'quantization-int16'
  | 'quantization-float16'
  | 'pruning-magnitude'
  | 'pruning-structured'
  | 'pruning-unstructured'
  | 'distillation'
  | 'weight-sharing'
  | 'low-rank-factorization'
  | 'mixed-precision'
  | 'combined';

export interface CompressionBenchmarkConfig {
  technique: CompressionTechnique;
  quantizationConfig?: QuantizationBenchmarkConfig;
  pruningConfig?: PruningBenchmarkConfig;
  distillationConfig?: DistillationBenchmarkConfig;
  combinedConfig?: CombinedCompressionConfig;
  customConfig?: Record<string, any>;
}

export interface QuantizationBenchmarkConfig {
  precision: 'int8' | 'int16' | 'float16' | 'bfloat16' | 'int4';
  scheme: 'symmetric' | 'asymmetric' | 'per-tensor' | 'per-channel';
  calibrationSamples: number;
  quantizeLayers?: string[];
}

export interface PruningBenchmarkConfig {
  method: 'magnitude' | 'gradient' | 'structured' | 'unstructured';
  targetSparsity: number;
  granularity: 'weight' | 'neuron' | 'channel' | 'filter';
  fineTuneAfterPruning: boolean;
  fineTuneEpochs?: number;
}

export interface DistillationBenchmarkConfig {
  teacherModelId: string;
  teacherModelVersion: string;
  temperature: number;
  alpha: number;
  distillationEpochs: number;
  studentArchitecture?: string;
}

export interface CombinedCompressionConfig {
  techniques: CompressionTechnique[];
  sequence: CompressionTechnique[];
  configs: Record<CompressionTechnique, CompressionBenchmarkConfig>;
}

export interface BenchmarkModelMetrics {
  accuracy: number;
  loss: number;
  f1Score?: number;
  precision?: number;
  recall?: number;
  latencyMs: number;
  throughputPerSecond: number;
  memoryUsageMb: number;
  powerConsumptionW?: number;
  startupTimeMs?: number;
  customMetrics?: Record<string, number>;
}

export interface BenchmarkConfig {
  datasets: BenchmarkDataset[];
  hardware: BenchmarkHardware[];
  metrics: BenchmarkMetric[];
  iterations: number;
  warmupIterations: number;
  statisticalSignificance: number;
  confidenceLevel: number;
}

export interface BenchmarkDataset {
  id: string;
  name: string;
  description?: string;
  numSamples: number;
  sampleShape: number[];
  dataType: string;
  storageUrl: string;
  category: 'accuracy' | 'latency' | 'throughput' | 'robustness' | 'custom';
}

export interface BenchmarkHardware {
  id: string;
  name: string;
  type: 'cpu' | 'gpu' | 'tpu' | 'edge' | 'mobile';
  architecture?: string;
  memoryMb?: number;
  computeCapability?: string;
  powerBudgetW?: number;
}

export interface BenchmarkMetric {
  name: string;
  type: 'accuracy' | 'latency' | 'throughput' | 'memory' | 'power' | 'size' | 'custom';
  unit: string;
  weight: number;
  direction: 'higher-better' | 'lower-better';
  threshold?: number;
}

export interface BenchmarkResults {
  baseModelResults: BenchmarkModelResults;
  compressedModelResults: Record<string, BenchmarkModelResults>;
  hardwareResults: Record<string, HardwareBenchmarkResults>;
  datasetResults: Record<string, DatasetBenchmarkResults>;
  statisticalAnalysis: StatisticalAnalysis;
}

export interface BenchmarkModelResults {
  modelId: string;
  modelName: string;
  metrics: BenchmarkModelMetrics;
  metricBreakdown: MetricBreakdown[];
  performanceProfile: PerformanceProfile;
  qualityMetrics: QualityMetrics;
}

export interface MetricBreakdown {
  metric: string;
  value: number;
  unit: string;
  confidence: number;
  stdDev: number;
  min: number;
  max: number;
  percentile95: number;
}

export interface PerformanceProfile {
  latencyDistribution: LatencyDistribution;
  throughputScaling: ThroughputScaling;
  memoryProfile: MemoryProfile;
  powerProfile?: PowerProfile;
}

export interface LatencyDistribution {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  p999: number;
  distribution: DistributionPoint[];
}

export interface DistributionPoint {
  percentile: number;
  value: number;
}

export interface ThroughputScaling {
  batchSizes: number[];
  throughputs: number[];
  optimalBatchSize: number;
  scalingEfficiency: number;
}

export interface MemoryProfile {
  peakUsageMb: number;
  averageUsageMb: number;
  memoryLeak: boolean;
  memoryBreakdown: MemoryBreakdown[];
}

export interface MemoryBreakdown {
  component: string;
  usageMb: number;
  percentage: number;
}

export interface PowerProfile {
  averagePowerW: number;
  peakPowerW: number;
  energyPerInferenceMj: number;
  powerBreakdown: PowerBreakdown[];
}

export interface PowerBreakdown {
  component: string;
  powerW: number;
  percentage: number;
}

export interface QualityMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  confusionMatrix?: number[][];
  rocAuc?: number;
  customMetrics?: Record<string, number>;
}

export interface HardwareBenchmarkResults {
  hardwareId: string;
  hardwareName: string;
  results: Record<string, BenchmarkModelResults>;
  utilizationMetrics: UtilizationMetrics;
}

export interface UtilizationMetrics {
  cpuUtilization: number;
  gpuUtilization?: number;
  memoryUtilization: number;
  networkBandwidth?: number;
}

export interface DatasetBenchmarkResults {
  datasetId: string;
  datasetName: string;
  results: Record<string, BenchmarkModelResults>;
  qualityMetrics: Record<string, QualityMetrics>;
}

export interface StatisticalAnalysis {
  significanceTests: SignificanceTest[];
  confidenceIntervals: ConfidenceInterval[];
  effectSizes: EffectSize[];
  recommendations: string[];
}

export interface SignificanceTest {
  model1: string;
  model2: string;
  metric: string;
  testType: 't-test' | 'wilcoxon' | 'mann-whitney';
  pValue: number;
  significant: boolean;
  confidenceLevel: number;
}

export interface ConfidenceInterval {
  model: string;
  metric: string;
  lowerBound: number;
  upperBound: number;
  confidenceLevel: number;
}

export interface EffectSize {
  model1: string;
  model2: string;
  metric: string;
  effectSize: number;
  interpretation: 'negligible' | 'small' | 'medium' | 'large';
}

export interface CompressionComparison {
  rankings: CompressionRanking[];
  tradeOffAnalysis: TradeOffAnalysis;
  paretoFront: ParetoPoint[];
  bestForUseCase: Record<string, string>;
  recommendations: CompressionRecommendation[];
}

export interface CompressionRanking {
  rank: number;
  modelId: string;
  modelName: string;
  technique: CompressionTechnique;
  overallScore: number;
  compressionRatio: number;
  qualityDegradation: number;
  latencyChangePercent: number;
  memoryReductionPercent: number;
  scores: RankingScore[];
}

export interface RankingScore {
  metric: string;
  value: number;
  normalizedScore: number;
  weight: number;
  weightedScore: number;
}

export interface TradeOffAnalysis {
  accuracyVsSize: TradeOffPoint[];
  accuracyVsLatency: TradeOffPoint[];
  sizeVsLatency: TradeOffPoint[];
  memoryVsAccuracy: TradeOffPoint[];
  powerVsAccuracy: TradeOffPoint[];
}

export interface TradeOffPoint {
  modelId: string;
  modelName: string;
  technique: CompressionTechnique;
  x: number;
  y: number;
  xLabel: string;
  yLabel: string;
}

export interface ParetoPoint {
  modelId: string;
  modelName: string;
  technique: CompressionTechnique;
  objectives: Record<string, number>;
  dominated: boolean;
  dominatedBy?: string;
}

export interface CompressionRecommendation {
  id: string;
  type: 'best-overall' | 'best-for-accuracy' | 'best-for-size' | 'best-for-latency' | 'best-for-memory' | 'best-for-power' | 'best-trade-off';
  modelId: string;
  modelName: string;
  technique: CompressionTechnique;
  reason: string;
  expectedBenefits: string[];
  expectedTradeOffs: string[];
  confidence: number;
}

export interface BenchmarkRecommendation {
  id: string;
  type: 'compression-technique' | 'hardware' | 'configuration' | 'best-practice';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  expectedImpact: string;
  implementationEffort: 'low' | 'medium' | 'high';
  confidence: number;
  references?: string[];
}

export interface CompressionLeaderboard {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  modelArchitecture: string;
  hardware: string;
  dataset: string;
  rankings: LeaderboardRanking[];
  lastUpdated: string;
  createdBy: string;
  createdAt: string;
}

export interface LeaderboardRanking {
  rank: number;
  modelId: string;
  modelName: string;
  technique: CompressionTechnique;
  compressionRatio: number;
  accuracy: number;
  latencyMs: number;
  memoryMb: number;
  overallScore: number;
  submittedBy: string;
  submittedAt: string;
}

export interface CompressionBenchmarkingDashboard {
  organizationId: string;
  totalBenchmarkSuites: number;
  completedBenchmarkSuites: number;
  totalLeaderboards: number;
  averageCompressionRatio: number;
  averageQualityDegradation: number;
  recentBenchmarkSuites: CompressionBenchmarkSuite[];
  topTechniques: TopBenchmarkTechnique[];
  benchmarkTrends: BenchmarkTrend[];
  leaderboardSummary: LeaderboardSummary;
}

export interface TopBenchmarkTechnique {
  technique: CompressionTechnique;
  benchmarkCount: number;
  averageCompressionRatio: number;
  averageQualityDegradation: number;
  averageOverallScore: number;
  bestFor: string[];
}

export interface BenchmarkTrend {
  date: string;
  benchmarkCount: number;
  averageCompressionRatio: number;
  averageQualityDegradation: number;
  topTechnique: CompressionTechnique;
}

export interface LeaderboardSummary {
  totalLeaderboards: number;
  totalSubmissions: number;
  topArchitectures: string[];
  topHardware: string[];
  topDatasets: string[];
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const benchmarkSuites = new Map<string, CompressionBenchmarkSuite>();
const leaderboards = new Map<string, CompressionLeaderboard>();

// ─── Benchmark Suite Management ────────────────────────────────────────────────

/**
 * Create a compression benchmark suite
 */
export async function createCompressionBenchmarkSuite(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    baseModel: BenchmarkBaseModel;
    compressedModels: Omit<BenchmarkCompressedModel, 'id'>[];
    benchmarkConfig: BenchmarkConfig;
    createdBy: string;
  }
): Promise<CompressionBenchmarkSuite> {
  const id = `benchsuite_${randomUUID()}`;
  const now = new Date().toISOString();

  const compressedModels: BenchmarkCompressedModel[] = params.compressedModels.map((m) => ({
    ...m,
    id: `compressed_${randomUUID()}`,
  }));

  const suite: CompressionBenchmarkSuite = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    status: 'planned',
    baseModel: params.baseModel,
    compressedModels,
    benchmarkConfig: params.benchmarkConfig,
    results: {
      baseModelResults: {
        modelId: params.baseModel.modelId,
        modelName: params.baseModel.modelName,
        metrics: params.baseModel.metrics,
        metricBreakdown: [],
        performanceProfile: {
          latencyDistribution: {
            p50: 0,
            p90: 0,
            p95: 0,
            p99: 0,
            p999: 0,
            distribution: [],
          },
          throughputScaling: {
            batchSizes: [],
            throughputs: [],
            optimalBatchSize: 0,
            scalingEfficiency: 0,
          },
          memoryProfile: {
            peakUsageMb: params.baseModel.metrics.memoryUsageMb,
            averageUsageMb: params.baseModel.metrics.memoryUsageMb * 0.8,
            memoryLeak: false,
            memoryBreakdown: [],
          },
        },
        qualityMetrics: {
          accuracy: params.baseModel.metrics.accuracy,
          precision: params.baseModel.metrics.precision || 0,
          recall: params.baseModel.metrics.recall || 0,
          f1Score: params.baseModel.metrics.f1Score || 0,
        },
      },
      compressedModelResults: {},
      hardwareResults: {},
      datasetResults: {},
      statisticalAnalysis: {
        significanceTests: [],
        confidenceIntervals: [],
        effectSizes: [],
        recommendations: [],
      },
    },
    comparison: {
      rankings: [],
      tradeOffAnalysis: {
        accuracyVsSize: [],
        accuracyVsLatency: [],
        sizeVsLatency: [],
        memoryVsAccuracy: [],
        powerVsAccuracy: [],
      },
      paretoFront: [],
      bestForUseCase: {},
      recommendations: [],
    },
    recommendations: [],
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  benchmarkSuites.set(id, suite);
  return suite;
}

/**
 * Start benchmark suite
 */
export async function startBenchmarkSuite(
  suiteId: string
): Promise<CompressionBenchmarkSuite | null> {
  const suite = benchmarkSuites.get(suiteId);
  if (!suite || suite.status !== 'planned') return null;

  suite.status = 'running';
  suite.startedAt = new Date().toISOString();
  suite.updatedAt = suite.startedAt;

  benchmarkSuites.set(suiteId, suite);
  return suite;
}

/**
 * Complete benchmark suite
 */
export async function completeBenchmarkSuite(
  suiteId: string,
  results: {
    compressedModelResults: Record<string, BenchmarkModelResults>;
    hardwareResults?: Record<string, HardwareBenchmarkResults>;
    datasetResults?: Record<string, DatasetBenchmarkResults>;
    statisticalAnalysis?: StatisticalAnalysis;
  }
): Promise<CompressionBenchmarkSuite | null> {
  const suite = benchmarkSuites.get(suiteId);
  if (!suite || suite.status !== 'running') return null;

  suite.results.compressedModelResults = results.compressedModelResults;
  if (results.hardwareResults) suite.results.hardwareResults = results.hardwareResults;
  if (results.datasetResults) suite.results.datasetResults = results.datasetResults;
  if (results.statisticalAnalysis) suite.results.statisticalAnalysis = results.statisticalAnalysis;

  // Generate comparison
  suite.comparison = generateCompressionComparison(suite);

  // Generate recommendations
  suite.recommendations = generateBenchmarkRecommendations(suite);

  suite.status = 'completed';
  suite.completedAt = new Date().toISOString();
  suite.updatedAt = suite.completedAt;

  benchmarkSuites.set(suiteId, suite);
  return suite;
}

/**
 * Cancel benchmark suite
 */
export async function cancelBenchmarkSuite(
  suiteId: string
): Promise<CompressionBenchmarkSuite | null> {
  const suite = benchmarkSuites.get(suiteId);
  if (!suite || suite.status === 'completed' || suite.status === 'cancelled') return null;

  suite.status = 'cancelled';
  suite.completedAt = new Date().toISOString();
  suite.updatedAt = suite.completedAt;

  benchmarkSuites.set(suiteId, suite);
  return suite;
}

/**
 * Get benchmark suite by ID
 */
export async function getBenchmarkSuite(
  suiteId: string
): Promise<CompressionBenchmarkSuite | null> {
  return benchmarkSuites.get(suiteId) || null;
}

/**
 * List benchmark suites for an organization
 */
export async function listBenchmarkSuites(
  organizationId: string,
  filters?: { status?: BenchmarkSuiteStatus; technique?: CompressionTechnique }
): Promise<CompressionBenchmarkSuite[]> {
  let orgSuites = Array.from(benchmarkSuites.values()).filter((s) => s.organizationId === organizationId);

  if (filters?.status) {
    orgSuites = orgSuites.filter((s) => s.status === filters.status);
  }

  if (filters?.technique) {
    orgSuites = orgSuites.filter((s) =>
      s.compressedModels.some((m) => m.compressionTechnique === filters.technique)
    );
  }

  return orgSuites;
}

/**
 * Create compression leaderboard
 */
export async function createCompressionLeaderboard(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    modelArchitecture: string;
    hardware: string;
    dataset: string;
    rankings: Omit<LeaderboardRanking, 'rank'>[];
    createdBy: string;
  }
): Promise<CompressionLeaderboard> {
  const id = `leaderboard_${randomUUID()}`;
  const now = new Date().toISOString();

  const rankings: LeaderboardRanking[] = params.rankings
    .sort((a, b) => b.overallScore - a.overallScore)
    .map((r, index) => ({
      ...r,
      rank: index + 1,
    }));

  const leaderboard: CompressionLeaderboard = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    modelArchitecture: params.modelArchitecture,
    hardware: params.hardware,
    dataset: params.dataset,
    rankings,
    lastUpdated: now,
    createdBy: params.createdBy,
    createdAt: now,
  };

  leaderboards.set(id, leaderboard);
  return leaderboard;
}

/**
 * Update compression leaderboard
 */
export async function updateCompressionLeaderboard(
  leaderboardId: string,
  newRanking: Omit<LeaderboardRanking, 'rank'>
): Promise<CompressionLeaderboard | null> {
  const leaderboard = leaderboards.get(leaderboardId);
  if (!leaderboard) return null;

  leaderboard.rankings.push({
    ...newRanking,
    rank: leaderboard.rankings.length + 1,
  });

  leaderboard.rankings.sort((a, b) => b.overallScore - a.overallScore);
  leaderboard.rankings.forEach((r, index) => {
    r.rank = index + 1;
  });

  leaderboard.lastUpdated = new Date().toISOString();
  leaderboards.set(leaderboardId, leaderboard);

  return leaderboard;
}

/**
 * Get compression leaderboard by ID
 */
export async function getCompressionLeaderboard(
  leaderboardId: string
): Promise<CompressionLeaderboard | null> {
  return leaderboards.get(leaderboardId) || null;
}

/**
 * List compression leaderboards
 */
export async function listCompressionLeaderboards(
  organizationId: string,
  filters?: { architecture?: string; hardware?: string }
): Promise<CompressionLeaderboard[]> {
  let orgLeaderboards = Array.from(leaderboards.values()).filter((l) => l.organizationId === organizationId);

  if (filters?.architecture) {
    orgLeaderboards = orgLeaderboards.filter((l) => l.modelArchitecture === filters.architecture);
  }

  if (filters?.hardware) {
    orgLeaderboards = orgLeaderboards.filter((l) => l.hardware === filters.hardware);
  }

  return orgLeaderboards;
}

/**
 * Get compression benchmarking dashboard
 */
export async function getCompressionBenchmarkingDashboard(
  organizationId: string
): Promise<CompressionBenchmarkingDashboard> {
  const orgSuites = await listBenchmarkSuites(organizationId);
  const orgLeaderboards = await listCompressionLeaderboards(organizationId);

  const completedSuites = orgSuites.filter((s) => s.status === 'completed');

  const averageCompressionRatio = completedSuites.length > 0
    ? completedSuites.reduce((sum, s) => {
        const avgRatio = s.compressedModels.reduce((rSum, m) => rSum + m.compressionRatio, 0) / s.compressedModels.length;
        return sum + avgRatio;
      }, 0) / completedSuites.length
    : 1.0;

  const averageQualityDegradation = completedSuites.length > 0
    ? completedSuites.reduce((sum, s) => {
        const avgDeg = s.compressedModels.reduce((dSum, m) => dSum + m.qualityDegradation, 0) / s.compressedModels.length;
        return sum + avgDeg;
      }, 0) / completedSuites.length
    : 0;

  const recentBenchmarkSuites = orgSuites
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  // Calculate top techniques
  const techniqueStats = new Map<CompressionTechnique, {
    benchmarkCount: number;
    totalCompressionRatio: number;
    totalQualityDegradation: number;
    totalOverallScore: number;
    bestFor: Set<string>;
  }>();

  for (const suite of completedSuites) {
    for (const model of suite.compressedModels) {
      const stats = techniqueStats.get(model.compressionTechnique) || {
        benchmarkCount: 0,
        totalCompressionRatio: 0,
        totalQualityDegradation: 0,
        totalOverallScore: 0,
        bestFor: new Set<string>(),
      };

      stats.benchmarkCount++;
      stats.totalCompressionRatio += model.compressionRatio;
      stats.totalQualityDegradation += model.qualityDegradation;

      const ranking = suite.comparison.rankings.find((r) => r.modelId === model.id);
      if (ranking) {
        stats.totalOverallScore += ranking.overallScore;
      }

      techniqueStats.set(model.compressionTechnique, stats);
    }
  }

  const topTechniques = Array.from(techniqueStats.entries())
    .map(([technique, stats]) => ({
      technique,
      benchmarkCount: stats.benchmarkCount,
      averageCompressionRatio: stats.totalCompressionRatio / stats.benchmarkCount,
      averageQualityDegradation: stats.totalQualityDegradation / stats.benchmarkCount,
      averageOverallScore: stats.totalOverallScore / stats.benchmarkCount,
      bestFor: Array.from(stats.bestFor),
    }))
    .sort((a, b) => b.benchmarkCount - a.benchmarkCount)
    .slice(0, 10);

  // Calculate benchmark trends (last 30 days)
  const benchmarkTrends: BenchmarkTrend[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const daySuites = orgSuites.filter((s) => s.createdAt.startsWith(dateStr));
    const dayCompletedSuites = daySuites.filter((s) => s.status === 'completed');

    const topTechnique = dayCompletedSuites.length > 0
      ? dayCompletedSuites[0].compressedModels.sort((a, b) => b.compressionRatio - a.compressionRatio)[0]?.compressionTechnique || 'quantization-int8'
      : 'quantization-int8';

    benchmarkTrends.push({
      date: dateStr,
      benchmarkCount: daySuites.length,
      averageCompressionRatio: dayCompletedSuites.length > 0
        ? dayCompletedSuites.reduce((sum, s) => {
            const avgRatio = s.compressedModels.reduce((rSum, m) => rSum + m.compressionRatio, 0) / s.compressedModels.length;
            return sum + avgRatio;
          }, 0) / dayCompletedSuites.length
        : 1.0,
      averageQualityDegradation: dayCompletedSuites.length > 0
        ? dayCompletedSuites.reduce((sum, s) => {
            const avgDeg = s.compressedModels.reduce((dSum, m) => dSum + m.qualityDegradation, 0) / s.compressedModels.length;
            return sum + avgDeg;
          }, 0) / dayCompletedSuites.length
        : 0,
      topTechnique,
    });
  }

  benchmarkTrends.reverse();

  // Calculate leaderboard summary
  const totalSubmissions = orgLeaderboards.reduce((sum, l) => sum + l.rankings.length, 0);
  const architectures = new Set(orgLeaderboards.map((l) => l.modelArchitecture));
  const hardwareTypes = new Set(orgLeaderboards.map((l) => l.hardware));
  const datasets = new Set(orgLeaderboards.map((l) => l.dataset));

  return {
    organizationId,
    totalBenchmarkSuites: orgSuites.length,
    completedBenchmarkSuites: completedSuites.length,
    totalLeaderboards: orgLeaderboards.length,
    averageCompressionRatio,
    averageQualityDegradation,
    recentBenchmarkSuites,
    topTechniques,
    benchmarkTrends,
    leaderboardSummary: {
      totalLeaderboards: orgLeaderboards.length,
      totalSubmissions,
      topArchitectures: Array.from(architectures).slice(0, 5),
      topHardware: Array.from(hardwareTypes).slice(0, 5),
      topDatasets: Array.from(datasets).slice(0, 5),
    },
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function generateCompressionComparison(suite: CompressionBenchmarkSuite): CompressionComparison {
  const rankings: CompressionRanking[] = [];

  for (const model of suite.compressedModels) {
    const results = suite.results.compressedModelResults[model.id];
    if (!results) continue;

    const scores: RankingScore[] = [];

    // Compression ratio score (higher is better)
    const compressionRatioScore = Math.min(100, model.compressionRatio * 20);
    scores.push({
      metric: 'compression-ratio',
      value: model.compressionRatio,
      normalizedScore: compressionRatioScore,
      weight: 0.3,
      weightedScore: compressionRatioScore * 0.3,
    });

    // Accuracy score (higher is better)
    const accuracyScore = results.metrics.accuracy * 100;
    scores.push({
      metric: 'accuracy',
      value: results.metrics.accuracy,
      normalizedScore: accuracyScore,
      weight: 0.4,
      weightedScore: accuracyScore * 0.4,
    });

    // Latency score (lower is better)
    const latencyScore = Math.max(0, 100 - (results.metrics.latencyMs / suite.baseModel.metrics.latencyMs - 1) * 100);
    scores.push({
      metric: 'latency',
      value: results.metrics.latencyMs,
      normalizedScore: latencyScore,
      weight: 0.2,
      weightedScore: latencyScore * 0.2,
    });

    // Memory score (lower is better)
    const memoryScore = Math.max(0, 100 - (results.metrics.memoryUsageMb / suite.baseModel.metrics.memoryUsageMb - 1) * 100);
    scores.push({
      metric: 'memory',
      value: results.metrics.memoryUsageMb,
      normalizedScore: memoryScore,
      weight: 0.1,
      weightedScore: memoryScore * 0.1,
    });

    const overallScore = scores.reduce((sum, s) => sum + s.weightedScore, 0);

    rankings.push({
      rank: 0,
      modelId: model.id,
      modelName: model.modelName,
      technique: model.compressionTechnique,
      overallScore,
      compressionRatio: model.compressionRatio,
      qualityDegradation: model.qualityDegradation,
      latencyChangePercent: ((results.metrics.latencyMs - suite.baseModel.metrics.latencyMs) / suite.baseModel.metrics.latencyMs) * 100,
      memoryReductionPercent: ((suite.baseModel.metrics.memoryUsageMb - results.metrics.memoryUsageMb) / suite.baseModel.metrics.memoryUsageMb) * 100,
      scores,
    });
  }

  rankings.sort((a, b) => b.overallScore - a.overallScore);
  rankings.forEach((r, index) => {
    r.rank = index + 1;
  });

  // Generate trade-off analysis
  const tradeOffAnalysis: TradeOffAnalysis = {
    accuracyVsSize: suite.compressedModels.map((m) => ({
      modelId: m.id,
      modelName: m.modelName,
      technique: m.compressionTechnique,
      x: m.sizeBytes / suite.baseModel.sizeBytes,
      y: suite.results.compressedModelResults[m.id]?.metrics.accuracy || 0,
      xLabel: 'Relative Size',
      yLabel: 'Accuracy',
    })),
    accuracyVsLatency: suite.compressedModels.map((m) => ({
      modelId: m.id,
      modelName: m.modelName,
      technique: m.compressionTechnique,
      x: suite.results.compressedModelResults[m.id]?.metrics.latencyMs || 0,
      y: suite.results.compressedModelResults[m.id]?.metrics.accuracy || 0,
      xLabel: 'Latency (ms)',
      yLabel: 'Accuracy',
    })),
    sizeVsLatency: suite.compressedModels.map((m) => ({
      modelId: m.id,
      modelName: m.modelName,
      technique: m.compressionTechnique,
      x: m.sizeBytes / suite.baseModel.sizeBytes,
      y: suite.results.compressedModelResults[m.id]?.metrics.latencyMs || 0,
      xLabel: 'Relative Size',
      yLabel: 'Latency (ms)',
    })),
    memoryVsAccuracy: suite.compressedModels.map((m) => ({
      modelId: m.id,
      modelName: m.modelName,
      technique: m.compressionTechnique,
      x: suite.results.compressedModelResults[m.id]?.metrics.memoryUsageMb || 0,
      y: suite.results.compressedModelResults[m.id]?.metrics.accuracy || 0,
      xLabel: 'Memory (MB)',
      yLabel: 'Accuracy',
    })),
    powerVsAccuracy: suite.compressedModels.map((m) => ({
      modelId: m.id,
      modelName: m.modelName,
      technique: m.compressionTechnique,
      x: suite.results.compressedModelResults[m.id]?.metrics.powerConsumptionW || 0,
      y: suite.results.compressedModelResults[m.id]?.metrics.accuracy || 0,
      xLabel: 'Power (W)',
      yLabel: 'Accuracy',
    })),
  };

  // Generate Pareto front
  const paretoFront: ParetoPoint[] = suite.compressedModels.map((m) => ({
    modelId: m.id,
    modelName: m.modelName,
    technique: m.compressionTechnique,
    objectives: {
      compressionRatio: m.compressionRatio,
      accuracy: suite.results.compressedModelResults[m.id]?.metrics.accuracy || 0,
      latency: suite.results.compressedModelResults[m.id]?.metrics.latencyMs || 0,
    },
    dominated: false,
  }));

  // Mark dominated points
  for (let i = 0; i < paretoFront.length; i++) {
    for (let j = 0; j < paretoFront.length; j++) {
      if (i === j) continue;

      const pi = paretoFront[i];
      const pj = paretoFront[j];

      if (
        pj.objectives.compressionRatio >= pi.objectives.compressionRatio &&
        pj.objectives.accuracy >= pi.objectives.accuracy &&
        pj.objectives.latency <= pi.objectives.latency &&
        (pj.objectives.compressionRatio > pi.objectives.compressionRatio ||
          pj.objectives.accuracy > pi.objectives.accuracy ||
          pj.objectives.latency < pi.objectives.latency)
      ) {
        pi.dominated = true;
        pi.dominatedBy = pj.modelId;
        break;
      }
    }
  }

  // Generate best for use case
  const bestForUseCase: Record<string, string> = {
    'best-overall': rankings[0]?.modelId || '',
    'best-for-accuracy': rankings.sort((a, b) => {
      const aAcc = suite.results.compressedModelResults[a.modelId]?.metrics.accuracy || 0;
      const bAcc = suite.results.compressedModelResults[b.modelId]?.metrics.accuracy || 0;
      return bAcc - aAcc;
    })[0]?.modelId || '',
    'best-for-size': rankings.sort((a, b) => b.compressionRatio - a.compressionRatio)[0]?.modelId || '',
    'best-for-latency': rankings.sort((a, b) => {
      const aLat = suite.results.compressedModelResults[a.modelId]?.metrics.latencyMs || Infinity;
      const bLat = suite.results.compressedModelResults[b.modelId]?.metrics.latencyMs || Infinity;
      return aLat - bLat;
    })[0]?.modelId || '',
  };

  // Generate recommendations
  const recommendations: CompressionRecommendation[] = [
    {
      id: `rec_${randomUUID()}`,
      type: 'best-overall',
      modelId: rankings[0]?.modelId || '',
      modelName: rankings[0]?.modelName || '',
      technique: rankings[0]?.technique || 'quantization-int8',
      reason: 'Highest overall score balancing compression ratio, accuracy, and latency',
      expectedBenefits: [
        `Compression ratio: ${rankings[0]?.compressionRatio.toFixed(2)}x`,
        `Quality degradation: ${rankings[0]?.qualityDegradation.toFixed(2)}%`,
      ],
      expectedTradeOffs: [
        `Latency change: ${rankings[0]?.latencyChangePercent.toFixed(2)}%`,
      ],
      confidence: 0.9,
    },
  ];

  return {
    rankings,
    tradeOffAnalysis,
    paretoFront,
    bestForUseCase,
    recommendations,
  };
}

function generateBenchmarkRecommendations(suite: CompressionBenchmarkSuite): BenchmarkRecommendation[] {
  const recommendations: BenchmarkRecommendation[] = [];

  // Recommend best technique based on results
  const bestRanking = suite.comparison.rankings[0];
  if (bestRanking) {
    recommendations.push({
      id: `rec_${randomUUID()}`,
      type: 'compression-technique',
      title: `Use ${bestRanking.technique} for best results`,
      description: `Based on benchmark results, ${bestRanking.technique} provides the best balance of compression ratio, accuracy, and latency for your model.`,
      priority: 'high',
      expectedImpact: `${bestRanking.compressionRatio.toFixed(2)}x compression with ${bestRanking.qualityDegradation.toFixed(2)}% quality degradation`,
      implementationEffort: 'medium',
      confidence: 0.9,
    });
  }

  // Recommend hardware based on results
  const hardwareResults = Object.values(suite.results.hardwareResults);
  if (hardwareResults.length > 0) {
    const bestHardware = hardwareResults.sort((a, b) => {
      const aScore = Object.values(a.results).reduce((sum, r) => sum + r.metrics.throughputPerSecond, 0);
      const bScore = Object.values(b.results).reduce((sum, r) => sum + r.metrics.throughputPerSecond, 0);
      return bScore - aScore;
    })[0];

    if (bestHardware) {
      recommendations.push({
        id: `rec_${randomUUID()}`,
        type: 'hardware',
        title: `Use ${bestHardware.hardwareName} for best performance`,
        description: `${bestHardware.hardwareName} provides the best throughput for your compressed models.`,
        priority: 'medium',
        expectedImpact: `Improved throughput and reduced latency`,
        implementationEffort: 'high',
        confidence: 0.85,
      });
    }
  }

  // Add best practice recommendations
  recommendations.push({
    id: `rec_${randomUUID()}`,
    type: 'best-practice',
    title: 'Calibrate quantized models with representative data',
    description: 'Use calibration data that represents your production data distribution for better quantization accuracy.',
    priority: 'high',
    expectedImpact: 'Improved accuracy for quantized models',
    implementationEffort: 'low',
    confidence: 0.95,
  });

  recommendations.push({
    id: `rec_${randomUUID()}`,
    type: 'best-practice',
    title: 'Fine-tune pruned models to recover accuracy',
    description: 'Fine-tuning pruned models for a few epochs can recover most of the accuracy lost during pruning.',
    priority: 'medium',
    expectedImpact: 'Reduced accuracy degradation from pruning',
    implementationEffort: 'medium',
    confidence: 0.9,
  });

  return recommendations;
}
