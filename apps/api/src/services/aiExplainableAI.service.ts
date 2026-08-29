/**
 * Module 116: AI Explainable AI (XAI) Service
 * WINDELS AI OS - Phase 3
 * 
 * Provides model interpretability and explanation capabilities including feature
 * importance, SHAP values, LIME explanations, partial dependence plots, and
 * model-agnostic explanation methods.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiExplainableAI');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Explanation {
  id: string;
  organizationId: string;
  modelId: string;
  modelVersion: string;
  explanationType: ExplanationType;
  scope: 'global' | 'local';
  status: ExplanationStatus;
  configuration: ExplanationConfiguration;
  results?: ExplanationResults;
  createdAt: string;
  completedAt?: string;
}

export type ExplanationType =
  | 'feature_importance'
  | 'shap'
  | 'lime'
  | 'partial_dependence'
  | 'ice_plots'
  | 'surrogate_model'
  | 'anchor'
  | 'counterfactual';

export type ExplanationStatus =
  | 'pending'
  | 'computing'
  | 'completed'
  | 'failed';

export interface ExplanationConfiguration {
  sampleSize?: number;
  backgroundData?: string;
  featureNames: string[];
  targetFeatures?: string[];
  numSamples?: number;
  randomSeed?: number;
}

export interface ExplanationResults {
  featureImportance?: FeatureImportanceResult;
  shapValues?: SHAPResult;
  limeExplanation?: LIMEResult;
  partialDependence?: PartialDependenceResult;
  surrogateModel?: SurrogateModelResult;
  counterfactuals?: CounterfactualResult;
  summary: ExplanationSummary;
}

export interface ExplanationSummary {
  topFeatures: FeatureContribution[];
  modelComplexity: number;
  explanationQuality: number;
  computationTime: number;
  recommendations: string[];
}

export interface FeatureImportanceResult {
  method: 'permutation' | 'impurity' | 'coefficients' | 'custom';
  importances: FeatureContribution[];
  normalized: boolean;
}

export interface FeatureContribution {
  feature: string;
  importance: number;
  rank: number;
  direction?: 'positive' | 'negative';
  confidence?: number;
}

export interface SHAPResult {
  method: 'kernel' | 'tree' | 'deep' | 'linear';
  shapValues: number[][];
  baseValue: number;
  featureContributions: FeatureContribution[];
  summaryPlot: SummaryPlotData;
  dependencePlots: DependencePlotData[];
  forcePlot?: ForcePlotData;
}

export interface SummaryPlotData {
  features: string[];
  meanAbsShap: number[];
  maxShap: number[];
  minShap: number[];
}

export interface DependencePlotData {
  feature: string;
  interactionFeature?: string;
  xValues: number[];
  yValues: number[];
  shapValues: number[];
}

export interface ForcePlotData {
  baseValue: number;
  prediction: number;
  features: Array<{
    name: string;
    value: number;
    shapValue: number;
    direction: 'positive' | 'negative';
  }>;
}

export interface LIMEResult {
  instanceId: string;
  prediction: number;
  explanation: LIMEFeatureContribution[];
  fidelity: number;
  intercept: number;
  localSurrogate: SurrogateModelInfo;
}

export interface LIMEFeatureContribution {
  feature: string;
  weight: number;
  value: number;
  direction: 'positive' | 'negative';
}

export interface SurrogateModelInfo {
  type: 'linear' | 'tree' | 'rule_based';
  complexity: number;
  r2Score: number;
}

export interface PartialDependenceResult {
  features: string[];
  pdpData: PDPData[];
  icePlots?: ICEPlotData[];
}

export interface PDPData {
  feature: string;
  gridValues: number[];
  pdpValues: number[];
  confidenceInterval?: {
    lower: number[];
    upper: number[];
  };
}

export interface ICEPlotData {
  feature: string;
  instanceId: string;
  gridValues: number[];
  iceValues: number[];
}

export interface SurrogateModelResult {
  surrogateType: 'decision_tree' | 'linear_model' | 'rule_list';
  fidelity: number;
  complexity: number;
  rules?: DecisionRule[];
  treeStructure?: TreeNode;
  coefficients?: Record<string, number>;
}

export interface DecisionRule {
  condition: string;
  prediction: number;
  support: number;
  confidence: number;
}

export interface TreeNode {
  feature?: string;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  prediction?: number;
  samples?: number;
}

export interface CounterfactualResult {
  originalInstance: Record<string, any>;
  originalPrediction: number;
  counterfactuals: Counterfactual[];
  diversity: number;
  proximity: number;
}

export interface Counterfactual {
  id: string;
  changes: Record<string, { original: any; counterfactual: any }>;
  prediction: number;
  distance: number;
  validity: boolean;
}

export interface ExplanationRequest {
  id: string;
  modelId: string;
  instanceId: string;
  instance: Record<string, any>;
  prediction: number;
  explanationTypes: ExplanationType[];
  createdAt: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const explanations = new Map<string, Explanation>();
const explanationRequests = new Map<string, ExplanationRequest[]>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateFeatureImportance(
  features: string[],
  method: string
): FeatureImportanceResult {
  const importances = features.map(feature => ({
    feature,
    importance: _rng.next(),
    rank: 0,
    direction: _rng.next() > 0.5 ? 'positive' : 'negative' as const,
    confidence: _rng.next() * 0.3 + 0.7,
  }));

  // Normalize and rank
  const totalImportance = importances.reduce((sum, f) => sum + f.importance, 0);
  importances.forEach(f => {
    f.importance = f.importance / totalImportance;
  });

  importances.sort((a, b) => b.importance - a.importance);
  importances.forEach((f, i) => {
    f.rank = i + 1;
  });

  return {
    method: method as any,
    importances,
    normalized: true,
  };
}

function generateSHAPValues(
  features: string[],
  numSamples: number
): SHAPResult {
  const shapValues = Array(numSamples).fill(0).map(() =>
    features.map(() => (_rng.next() - 0.5) * 2)
  );

  const featureContributions = features.map((feature, i) => {
    const meanAbsShap = shapValues.reduce((sum, sample) => sum + Math.abs(sample[i]), 0) / numSamples;
    return {
      feature,
      importance: meanAbsShap,
      rank: 0,
      confidence: _rng.next() * 0.3 + 0.7,
    };
  });

  featureContributions.sort((a, b) => b.importance - a.importance);
  featureContributions.forEach((f, i) => {
    f.rank = i + 1;
  });

  return {
    method: 'kernel',
    shapValues,
    baseValue: _rng.next() * 0.5,
    featureContributions,
    summaryPlot: {
      features,
      meanAbsShap: featureContributions.map(f => f.importance),
      maxShap: features.map(() => _rng.next() * 2),
      minShap: features.map(() => -_rng.next() * 2),
    },
    dependencePlots: features.slice(0, 3).map(feature => ({
      feature,
      xValues: Array(50).fill(0).map((_, i) => i / 50),
      yValues: Array(50).fill(0).map(() => _rng.next()),
      shapValues: Array(50).fill(0).map(() => (_rng.next() - 0.5) * 2),
    })),
  };
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createExplanation(params: {
  organizationId: string;
  modelId: string;
  modelVersion: string;
  explanationType: ExplanationType;
  scope: 'global' | 'local';
  configuration: ExplanationConfiguration;
}): Explanation {
  const now = new Date().toISOString();
  const id = randomUUID();

  const explanation: Explanation = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    explanationType: params.explanationType,
    scope: params.scope,
    status: 'pending',
    configuration: params.configuration,
    createdAt: now,
  };

  explanations.set(id, explanation);

  // Start computation
  setTimeout(() => {
    computeExplanation(explanation);
  }, 100);

  return explanation;
}

function computeExplanation(explanation: Explanation): void {
  explanation.status = 'computing';
  const startTime = Date.now();

  const features = explanation.configuration.featureNames;
  const numSamples = explanation.configuration.numSamples || 100;

  let results: ExplanationResults;

  switch (explanation.explanationType) {
    case 'feature_importance':
      results = {
        featureImportance: generateFeatureImportance(features, 'permutation'),
        summary: {
          topFeatures: generateFeatureImportance(features, 'permutation').importances.slice(0, 5),
          modelComplexity: _rng.next() * 100,
          explanationQuality: _rng.next() * 0.3 + 0.7,
          computationTime: (Date.now() - startTime) / 1000,
          recommendations: [
            'Focus on top 5 features for model interpretation',
            'Consider feature engineering for low-importance features',
          ],
        },
      };
      break;

    case 'shap':
      const shapResult = generateSHAPValues(features, numSamples);
      results = {
        shapValues: shapResult,
        summary: {
          topFeatures: shapResult.featureContributions.slice(0, 5),
          modelComplexity: _rng.next() * 100,
          explanationQuality: _rng.next() * 0.3 + 0.7,
          computationTime: (Date.now() - startTime) / 1000,
          recommendations: [
            'Review SHAP summary plot for global feature importance',
            'Use force plots for individual prediction explanations',
            'Check dependence plots for feature interactions',
          ],
        },
      };
      break;

    case 'lime':
      results = {
        limeExplanation: {
          instanceId: randomUUID(),
          prediction: _rng.next(),
          explanation: features.slice(0, 10).map(feature => ({
            feature,
            weight: (_rng.next() - 0.5) * 2,
            value: _rng.next(),
            direction: _rng.next() > 0.5 ? 'positive' : 'negative' as const,
          })),
          fidelity: _rng.next() * 0.3 + 0.7,
          intercept: _rng.next() * 0.5,
          localSurrogate: {
            type: 'linear',
            complexity: features.length,
            r2Score: _rng.next() * 0.3 + 0.7,
          },
        },
        summary: {
          topFeatures: features.slice(0, 5).map((feature, i) => ({
            feature,
            importance: (5 - i) / 5,
            rank: i + 1,
          })),
          modelComplexity: features.length,
          explanationQuality: _rng.next() * 0.3 + 0.7,
          computationTime: (Date.now() - startTime) / 1000,
          recommendations: [
            'LIME provides local explanations for individual predictions',
            'Check fidelity score to ensure explanation quality',
            'Compare with SHAP for comprehensive understanding',
          ],
        },
      };
      break;

    case 'partial_dependence':
      results = {
        partialDependence: {
          features: features.slice(0, 3),
          pdpData: features.slice(0, 3).map(feature => ({
            feature,
            gridValues: Array(50).fill(0).map((_, i) => i / 50),
            pdpValues: Array(50).fill(0).map(() => _rng.next()),
            confidenceInterval: {
              lower: Array(50).fill(0).map(() => _rng.next() * 0.5),
              upper: Array(50).fill(0).map(() => _rng.next() * 0.5 + 0.5),
            },
          })),
        },
        summary: {
          topFeatures: features.slice(0, 3).map((feature, i) => ({
            feature,
            importance: (3 - i) / 3,
            rank: i + 1,
          })),
          modelComplexity: _rng.next() * 100,
          explanationQuality: _rng.next() * 0.3 + 0.7,
          computationTime: (Date.now() - startTime) / 1000,
          recommendations: [
            'PDP shows marginal effect of features on predictions',
            'Look for non-linear relationships in PDP plots',
            'Use ICE plots to understand individual instance effects',
          ],
        },
      };
      break;

    default:
      results = {
        summary: {
          topFeatures: [],
          modelComplexity: 0,
          explanationQuality: 0,
          computationTime: (Date.now() - startTime) / 1000,
          recommendations: [],
        },
      };
  }

  explanation.results = results;
  explanation.status = 'completed';
  explanation.completedAt = new Date().toISOString();
}

export function getExplanation(id: string): Explanation | undefined {
  return explanations.get(id);
}

export function listExplanations(
  organizationId: string,
  filters?: { modelId?: string; explanationType?: ExplanationType; status?: ExplanationStatus }
): Explanation[] {
  let result = Array.from(explanations.values()).filter(
    e => e.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(e => e.modelId === filters.modelId);
  if (filters?.explanationType) result = result.filter(e => e.explanationType === filters.explanationType);
  if (filters?.status) result = result.filter(e => e.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function explainPrediction(params: {
  organizationId: string;
  modelId: string;
  modelVersion: string;
  instanceId: string;
  instance: Record<string, any>;
  prediction: number;
  explanationTypes: ExplanationType[];
}): ExplanationRequest {
  const now = new Date().toISOString();
  const id = randomUUID();

  const request: ExplanationRequest = {
    id,
    modelId: params.modelId,
    instanceId: params.instanceId,
    instance: params.instance,
    prediction: params.prediction,
    explanationTypes: params.explanationTypes,
    createdAt: now,
  };

  const requests = explanationRequests.get(params.modelId) || [];
  requests.push(request);
  explanationRequests.set(params.modelId, requests);

  // Create explanations for each type
  const features = Object.keys(params.instance);
  params.explanationTypes.forEach(type => {
    createExplanation({
      organizationId: params.organizationId,
      modelId: params.modelId,
      modelVersion: params.modelVersion,
      explanationType: type,
      scope: 'local',
      configuration: {
        featureNames: features,
        numSamples: 100,
      },
    });
  });

  return request;
}

export function getExplanationRequest(modelId: string, requestId: string): ExplanationRequest | undefined {
  const requests = explanationRequests.get(modelId) || [];
  return requests.find(r => r.id === requestId);
}

export function generateExplanationReport(explanationId: string): {
  summary: string;
  keyFindings: string[];
  visualizations: string[];
  recommendations: string[];
} {
  const explanation = explanations.get(explanationId);
  if (!explanation) throw new Error(`Explanation ${explanationId} not found`);

  const topFeatures = explanation.results?.summary.topFeatures || [];
  const keyFindings = topFeatures.slice(0, 3).map(f =>
    `Feature "${f.feature}" has importance ${f.importance.toFixed(3)} (rank ${f.rank})`
  );

  return {
    summary: `This ${explanation.explanationType} explanation analyzes the ${explanation.scope} behavior of the model.`,
    keyFindings,
    visualizations: [
      'Feature importance bar chart',
      'SHAP summary plot',
      'Force plot for individual predictions',
    ],
    recommendations: explanation.results?.summary.recommendations || [],
  };
}

export function compareExplanations(
  explanationId1: string,
  explanationId2: string
): {
  similarities: string[];
  differences: string[];
  topFeatures1: FeatureContribution[];
  topFeatures2: FeatureContribution[];
} {
  const exp1 = explanations.get(explanationId1);
  const exp2 = explanations.get(explanationId2);

  if (!exp1 || !exp2) throw new Error('One or both explanations not found');

  const topFeatures1 = exp1.results?.summary.topFeatures || [];
  const topFeatures2 = exp2.results?.summary.topFeatures || [];

  const commonFeatures = topFeatures1.filter(f1 =>
    topFeatures2.some(f2 => f2.feature === f1.feature)
  );

  return {
    similarities: commonFeatures.map(f => `Feature "${f.feature}" is important in both explanations`),
    differences: [
      `Explanation 1 focuses on ${topFeatures1[0]?.feature || 'unknown'}`,
      `Explanation 2 focuses on ${topFeatures2[0]?.feature || 'unknown'}`,
    ],
    topFeatures1,
    topFeatures2,
  };
}
