/**
 * Module 119: AI Model Ensemble Service
 * WINDELS AI OS - Phase 3
 * 
 * Provides ensemble learning capabilities including model combination strategies,
 * ensemble optimization, diversity metrics, and ensemble performance analysis.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiModelEnsemble');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Ensemble {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: EnsembleStatus;
  strategy: EnsembleStrategy;
  models: EnsembleModel[];
  configuration: EnsembleConfiguration;
  performance: EnsemblePerformance;
  createdAt: string;
  updatedAt: string;
}

export type EnsembleStatus =
  | 'initializing'
  | 'training'
  | 'ready'
  | 'optimizing'
  | 'failed';

export type EnsembleStrategy =
  | 'voting'
  | 'averaging'
  | 'stacking'
  | 'boosting'
  | 'bagging'
  | 'weighted_average'
  | 'dynamic_selection';

export interface EnsembleModel {
  id: string;
  modelId: string;
  modelVersion: string;
  modelName: string;
  weight: number;
  status: 'active' | 'inactive' | 'training';
  individualPerformance: ModelPerformance;
  contribution: number;
  diversity: number;
}

export interface ModelPerformance {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  inferenceTimeMs: number;
}

export interface EnsembleConfiguration {
  votingType?: 'hard' | 'soft';
  aggregationMethod?: 'mean' | 'median' | 'weighted_mean' | 'geometric_mean';
  stackingMetaLearner?: string;
  diversityThreshold?: number;
  maxModels?: number;
  dynamicSelectionK?: number;
  correlationPenalty?: number;
}

export interface EnsemblePerformance {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  inferenceTimeMs: number;
  improvementOverBest: number;
  diversityScore: number;
  robustness: number;
}

export interface EnsembleOptimization {
  id: string;
  ensembleId: string;
  optimizationType: 'weight_tuning' | 'model_selection' | 'pruning';
  status: 'pending' | 'running' | 'completed' | 'failed';
  iterations: OptimizationIteration[];
  bestConfiguration: Record<string, any>;
  improvement: number;
  createdAt: string;
  completedAt?: string;
}

export interface OptimizationIteration {
  iteration: number;
  configuration: Record<string, any>;
  performance: EnsemblePerformance;
  improvement: number;
}

export interface DiversityMetrics {
  qStatistic: number;
  correlationCoefficient: number;
  disagreementMeasure: number;
  doubleFaultMeasure: number;
  entropyMeasure: number;
  overallDiversity: number;
}

export interface EnsemblePrediction {
  ensembleId: string;
  inputId: string;
  individualPredictions: IndividualPrediction[];
  ensemblePrediction: number;
  ensembleConfidence: number;
  disagreement: number;
  inferenceTimeMs: number;
}

export interface IndividualPrediction {
  modelId: string;
  modelName: string;
  prediction: number;
  confidence: number;
  weight: number;
  weightedPrediction: number;
}

export interface EnsembleComparison {
  ensembleId: string;
  individualModels: ModelComparison[];
  ensembleVsBest: PerformanceComparison;
  ensembleVsAverage: PerformanceComparison;
  costBenefit: CostBenefitAnalysis;
}

export interface ModelComparison {
  modelId: string;
  modelName: string;
  accuracy: number;
  inferenceTime: number;
}

export interface PerformanceComparison {
  accuracyImprovement: number;
  latencyOverhead: number;
  relativeImprovement: number;
}

export interface CostBenefitAnalysis {
  accuracyGain: number;
  latencyCost: number;
  computationalCost: number;
  overallBenefit: number;
  recommendation: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const ensembles = new Map<string, Ensemble>();
const ensembleOptimizations = new Map<string, EnsembleOptimization[]>();
const ensemblePredictions = new Map<string, EnsemblePrediction[]>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculateDiversity(predictions: number[][]): DiversityMetrics {
  const numModels = predictions.length;
  const numSamples = predictions[0].length;

  // Q-statistic
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < numModels; i++) {
    for (let j = i + 1; j < numModels; j++) {
      for (let k = 0; k < numSamples; k++) {
        if (predictions[i][k] === predictions[j][k]) concordant++;
        else discordant++;
      }
    }
  }
  const qStatistic = (concordant - discordant) / (concordant + discordant);

  // Correlation coefficient
  const correlationCoefficient = 1 - Math.abs(qStatistic);

  // Disagreement measure
  const disagreementMeasure = discordant / (concordant + discordant);

  // Overall diversity (simplified)
  const overallDiversity = (1 - Math.abs(qStatistic) + disagreementMeasure) / 2;

  return {
    qStatistic,
    correlationCoefficient,
    disagreementMeasure,
    doubleFaultMeasure: 0.1, // Simplified
    entropyMeasure: overallDiversity,
    overallDiversity,
  };
}

function aggregatePredictions(
  predictions: IndividualPrediction[],
  strategy: EnsembleStrategy,
  config: EnsembleConfiguration
): { prediction: number; confidence: number } {
  const weightedPredictions = predictions.map(p => p.weightedPrediction);
  const confidences = predictions.map(p => p.confidence);

  let prediction: number;
  let confidence: number;

  switch (strategy) {
    case 'voting':
      if (config.votingType === 'hard') {
        // Majority voting
        const counts = new Map<number, number>();
        predictions.forEach(p => {
          const rounded = Math.round(p.prediction);
          counts.set(rounded, (counts.get(rounded) || 0) + p.weight);
        });
        prediction = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
      } else {
        // Soft voting (weighted average of probabilities)
        prediction = weightedPredictions.reduce((sum, p) => sum + p, 0) / predictions.length;
      }
      confidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
      break;

    case 'averaging':
      if (config.aggregationMethod === 'median') {
        const sorted = [...weightedPredictions].sort((a, b) => a - b);
        prediction = sorted[Math.floor(sorted.length / 2)];
      } else if (config.aggregationMethod === 'geometric_mean') {
        prediction = Math.exp(weightedPredictions.reduce((sum, p) => sum + Math.log(p), 0) / predictions.length);
      } else {
        // Mean or weighted_mean
        prediction = weightedPredictions.reduce((sum, p) => sum + p, 0) / predictions.length;
      }
      confidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
      break;

    case 'weighted_average':
      const totalWeight = predictions.reduce((sum, p) => sum + p.weight, 0);
      prediction = weightedPredictions.reduce((sum, p) => sum + p, 0) / totalWeight;
      confidence = predictions.reduce((sum, p) => sum + p.confidence * p.weight, 0) / totalWeight;
      break;

    default:
      prediction = weightedPredictions.reduce((sum, p) => sum + p, 0) / predictions.length;
      confidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  }

  return { prediction, confidence };
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createEnsemble(params: {
  organizationId: string;
  name: string;
  description?: string;
  strategy: EnsembleStrategy;
  models: Array<{
    modelId: string;
    modelVersion: string;
    modelName: string;
    weight?: number;
  }>;
  configuration?: EnsembleConfiguration;
}): Ensemble {
  const now = new Date().toISOString();
  const id = randomUUID();

  const ensembleModels: EnsembleModel[] = params.models.map(m => ({
    id: randomUUID(),
    modelId: m.modelId,
    modelVersion: m.modelVersion,
    modelName: m.modelName,
    weight: m.weight || 1.0 / params.models.length,
    status: 'active',
    individualPerformance: {
      accuracy: 0.85 + _rng.next() * 0.1,
      precision: 0.83 + _rng.next() * 0.1,
      recall: 0.84 + _rng.next() * 0.1,
      f1Score: 0.84 + _rng.next() * 0.1,
      inferenceTimeMs: 20 + _rng.next() * 30,
    },
    contribution: 0,
    diversity: 0,
  }));

  const defaultConfig: EnsembleConfiguration = {
    votingType: 'soft',
    aggregationMethod: 'weighted_mean',
    diversityThreshold: 0.3,
    maxModels: 10,
  };

  // Calculate ensemble performance (simplified)
  const avgAccuracy = ensembleModels.reduce((sum, m) => sum + m.individualPerformance.accuracy, 0) / ensembleModels.length;
  const ensembleAccuracy = avgAccuracy + 0.03; // Ensemble typically improves by 3%

  const ensemble: Ensemble = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'ready',
    strategy: params.strategy,
    models: ensembleModels,
    configuration: { ...defaultConfig, ...params.configuration },
    performance: {
      accuracy: ensembleAccuracy,
      precision: avgAccuracy + 0.02,
      recall: avgAccuracy + 0.02,
      f1Score: avgAccuracy + 0.02,
      inferenceTimeMs: ensembleModels.reduce((sum, m) => sum + m.individualPerformance.inferenceTimeMs, 0) / ensembleModels.length * 1.2,
      improvementOverBest: 0.03,
      diversityScore: 0.5,
      robustness: 0.85,
    },
    createdAt: now,
    updatedAt: now,
  };

  ensembles.set(id, ensemble);
  ensembleOptimizations.set(id, []);
  ensemblePredictions.set(id, []);

  return ensemble;
}

export function getEnsemble(id: string): Ensemble | undefined {
  return ensembles.get(id);
}

export function listEnsembles(
  organizationId: string,
  filters?: { strategy?: EnsembleStrategy; status?: EnsembleStatus }
): Ensemble[] {
  let result = Array.from(ensembles.values()).filter(
    e => e.organizationId === organizationId
  );

  if (filters?.strategy) result = result.filter(e => e.strategy === filters.strategy);
  if (filters?.status) result = result.filter(e => e.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addModelToEnsemble(
  ensembleId: string,
  model: {
    modelId: string;
    modelVersion: string;
    modelName: string;
    weight?: number;
  }
): Ensemble {
  const ensemble = ensembles.get(ensembleId);
  if (!ensemble) throw new Error(`Ensemble ${ensembleId} not found`);

  if (ensemble.configuration.maxModels && ensemble.models.length >= ensemble.configuration.maxModels) {
    throw new Error(`Ensemble already has maximum number of models (${ensemble.configuration.maxModels})`);
  }

  const ensembleModel: EnsembleModel = {
    id: randomUUID(),
    modelId: model.modelId,
    modelVersion: model.modelVersion,
    modelName: model.modelName,
    weight: model.weight || 1.0 / (ensemble.models.length + 1),
    status: 'active',
    individualPerformance: {
      accuracy: 0.85 + _rng.next() * 0.1,
      precision: 0.83 + _rng.next() * 0.1,
      recall: 0.84 + _rng.next() * 0.1,
      f1Score: 0.84 + _rng.next() * 0.1,
      inferenceTimeMs: 20 + _rng.next() * 30,
    },
    contribution: 0,
    diversity: 0,
  };

  ensemble.models.push(ensembleModel);

  // Recalculate weights if not specified
  if (!model.weight) {
    const equalWeight = 1.0 / ensemble.models.length;
    ensemble.models.forEach(m => { m.weight = equalWeight; });
  }

  ensemble.updatedAt = new Date().toISOString();
  return ensemble;
}

export function removeModelFromEnsemble(ensembleId: string, modelId: string): Ensemble {
  const ensemble = ensembles.get(ensembleId);
  if (!ensemble) throw new Error(`Ensemble ${ensembleId} not found`);

  ensemble.models = ensemble.models.filter(m => m.modelId !== modelId);

  if (ensemble.models.length === 0) {
    throw new Error('Cannot remove last model from ensemble');
  }

  // Recalculate weights
  const equalWeight = 1.0 / ensemble.models.length;
  ensemble.models.forEach(m => { m.weight = equalWeight; });

  ensemble.updatedAt = new Date().toISOString();
  return ensemble;
}

export function updateModelWeights(
  ensembleId: string,
  weights: Record<string, number>
): Ensemble {
  const ensemble = ensembles.get(ensembleId);
  if (!ensemble) throw new Error(`Ensemble ${ensembleId} not found`);

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

  ensemble.models.forEach(model => {
    if (weights[model.modelId] !== undefined) {
      model.weight = weights[model.modelId] / totalWeight;
    }
  });

  ensemble.updatedAt = new Date().toISOString();
  return ensemble;
}

export function makeEnsemblePrediction(
  ensembleId: string,
  inputId: string,
  individualPredictions: Array<{
    modelId: string;
    prediction: number;
    confidence: number;
  }>
): EnsemblePrediction {
  const ensemble = ensembles.get(ensembleId);
  if (!ensemble) throw new Error(`Ensemble ${ensembleId} not found`);

  const startTime = Date.now();

  const predictions: IndividualPrediction[] = individualPredictions.map(ip => {
    const model = ensemble.models.find(m => m.modelId === ip.modelId);
    if (!model) throw new Error(`Model ${ip.modelId} not in ensemble`);

    return {
      modelId: ip.modelId,
      modelName: model.modelName,
      prediction: ip.prediction,
      confidence: ip.confidence,
      weight: model.weight,
      weightedPrediction: ip.prediction * model.weight,
    };
  });

  const { prediction, confidence } = aggregatePredictions(
    predictions,
    ensemble.strategy,
    ensemble.configuration
  );

  // Calculate disagreement
  const predValues = predictions.map(p => p.prediction);
  const mean = predValues.reduce((sum, p) => sum + p, 0) / predValues.length;
  const variance = predValues.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / predValues.length;
  const disagreement = Math.sqrt(variance);

  const ensemblePrediction: EnsemblePrediction = {
    ensembleId,
    inputId,
    individualPredictions: predictions,
    ensemblePrediction: prediction,
    ensembleConfidence: confidence,
    disagreement,
    inferenceTimeMs: Date.now() - startTime,
  };

  const predictions_log = ensemblePredictions.get(ensembleId) || [];
  predictions_log.push(ensemblePrediction);
  ensemblePredictions.set(ensembleId, predictions_log);

  return ensemblePrediction;
}

export function getEnsemblePredictions(
  ensembleId: string,
  limit?: number
): EnsemblePrediction[] {
  let predictions = ensemblePredictions.get(ensembleId) || [];
  predictions = predictions.sort((a, b) => b.inferenceTimeMs - a.inferenceTimeMs);

  if (limit) predictions = predictions.slice(0, limit);

  return predictions;
}

export function optimizeEnsembleWeights(ensembleId: string): EnsembleOptimization {
  const ensemble = ensembles.get(ensembleId);
  if (!ensemble) throw new Error(`Ensemble ${ensembleId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const optimization: EnsembleOptimization = {
    id,
    ensembleId,
    optimizationType: 'weight_tuning',
    status: 'running',
    iterations: [],
    bestConfiguration: {},
    improvement: 0,
    createdAt: now,
  };

  const optimizations = ensembleOptimizations.get(ensembleId) || [];
  optimizations.push(optimization);
  ensembleOptimizations.set(ensembleId, optimizations);

  // Simulate optimization
  setTimeout(() => {
    const iterations: OptimizationIteration[] = [];
    let bestAccuracy = ensemble.performance.accuracy;
    let bestWeights: Record<string, number> = {};

    for (let i = 0; i < 10; i++) {
      const weights: Record<string, number> = {};
      let totalWeight = 0;

      ensemble.models.forEach(model => {
        const w = _rng.next();
        weights[model.modelId] = w;
        totalWeight += w;
      });

      // Normalize
      Object.keys(weights).forEach(k => {
        weights[k] /= totalWeight;
      });

      const accuracy = ensemble.performance.accuracy + (_rng.next() - 0.5) * 0.02;

      iterations.push({
        iteration: i + 1,
        configuration: { weights },
        performance: { ...ensemble.performance, accuracy },
        improvement: accuracy - ensemble.performance.accuracy,
      });

      if (accuracy > bestAccuracy) {
        bestAccuracy = accuracy;
        bestWeights = weights;
      }
    }

    optimization.iterations = iterations;
    optimization.bestConfiguration = { weights: bestWeights };
    optimization.improvement = bestAccuracy - ensemble.performance.accuracy;
    optimization.status = 'completed';
    optimization.completedAt = new Date().toISOString();

    // Apply best weights
    updateModelWeights(ensembleId, bestWeights);
  }, 500);

  return optimization;
}

export function calculateDiversityMetrics(ensembleId: string): DiversityMetrics {
  const ensemble = ensembles.get(ensembleId);
  if (!ensemble) throw new Error(`Ensemble ${ensembleId} not found`);

  // Simulate predictions from each model
  const predictions: number[][] = ensemble.models.map(() =>
    Array(100).fill(0).map(() => _rng.next())
  );

  return calculateDiversity(predictions);
}

export function compareEnsemble(ensembleId: string): EnsembleComparison {
  const ensemble = ensembles.get(ensembleId);
  if (!ensemble) throw new Error(`Ensemble ${ensembleId} not found`);

  const individualModels = ensemble.models.map(m => ({
    modelId: m.modelId,
    modelName: m.modelName,
    accuracy: m.individualPerformance.accuracy,
    inferenceTime: m.individualPerformance.inferenceTimeMs,
  }));

  const bestModel = individualModels.reduce((best, m) => m.accuracy > best.accuracy ? m : best);
  const avgAccuracy = individualModels.reduce((sum, m) => sum + m.accuracy, 0) / individualModels.length;

  return {
    ensembleId,
    individualModels,
    ensembleVsBest: {
      accuracyImprovement: ensemble.performance.accuracy - bestModel.accuracy,
      latencyOverhead: ensemble.performance.inferenceTimeMs - bestModel.inferenceTime,
      relativeImprovement: ((ensemble.performance.accuracy - bestModel.accuracy) / bestModel.accuracy) * 100,
    },
    ensembleVsAverage: {
      accuracyImprovement: ensemble.performance.accuracy - avgAccuracy,
      latencyOverhead: ensemble.performance.inferenceTimeMs - (individualModels.reduce((sum, m) => sum + m.inferenceTime, 0) / individualModels.length),
      relativeImprovement: ((ensemble.performance.accuracy - avgAccuracy) / avgAccuracy) * 100,
    },
    costBenefit: {
      accuracyGain: ensemble.performance.accuracy - bestModel.accuracy,
      latencyCost: ensemble.performance.inferenceTimeMs / bestModel.inferenceTime,
      computationalCost: ensemble.models.length,
      overallBenefit: (ensemble.performance.accuracy - bestModel.accuracy) * 100 - (ensemble.models.length - 1) * 5,
      recommendation: ensemble.performance.accuracy > bestModel.accuracy + 0.01
        ? 'Ensemble provides significant improvement - recommended'
        : 'Marginal improvement - consider cost-benefit tradeoff',
    },
  };
}
