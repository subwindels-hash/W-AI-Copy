/**
 * Module 104: AI Multi-Armed Bandit Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides adaptive experimentation using multi-armed bandit algorithms for
 * dynamic traffic allocation based on performance, balancing exploration
 * and exploitation to maximize rewards.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiMultiArmedBandit');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BanditExperiment {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: BanditStatus;
  algorithm: BanditAlgorithm;
  arms: BanditArm[];
  configuration: BanditConfiguration;
  metrics: BanditMetrics;
  history: BanditHistory[];
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type BanditStatus =
  | 'draft'
  | 'running'
  | 'paused'
  | 'converged'
  | 'completed'
  | 'cancelled';

export type BanditAlgorithm =
  | 'epsilon_greedy'
  | 'ucb1'
  | 'thompson_sampling'
  | 'softmax'
  | 'gradient_bandit';

export interface BanditArm {
  id: string;
  name: string;
  modelId: string;
  modelVersion: string;
  pulls: number;
  rewards: number[];
  meanReward: number;
  variance: number;
  trafficAllocation: number; // current allocation (0-1)
  confidence: number; // algorithm-specific confidence
  isWinner: boolean;
}

export interface BanditConfiguration {
  epsilon?: number; // for epsilon-greedy (0-1)
  temperature?: number; // for softmax
  explorationRate?: number; // for UCB
  priorAlpha?: number; // for Thompson sampling (Beta prior)
  priorBeta?: number; // for Thompson sampling (Beta prior)
  convergenceThreshold?: number; // stop when best arm has X% confidence
  minPullsPerArm?: number;
  maxTotalPulls?: number;
  updateFrequency: 'every_pull' | 'batch';
  batchSize?: number;
}

export interface BanditMetrics {
  totalPulls: number;
  totalReward: number;
  averageReward: number;
  regret: number; // cumulative regret
  bestArmId?: string;
  bestArmConfidence: number;
  convergenceProgress: number; // 0-1
}

export interface BanditHistory {
  timestamp: string;
  armId: string;
  armName: string;
  action: 'pull' | 'update';
  reward?: number;
  trafficAllocation: Record<string, number>;
  metrics: {
    meanReward: number;
    regret: number;
  };
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const banditExperiments = new Map<string, BanditExperiment>();

// ─── Algorithm Implementations ────────────────────────────────────────────────

function epsilonGreedySelect(
  arms: BanditArm[],
  epsilon: number
): BanditArm {
  // Exploration: random arm with probability epsilon
  if (_rng.next() < epsilon) {
    return arms[Math.floor(_rng.next() * arms.length)];
  }

  // Exploitation: best arm with probability 1-epsilon
  return arms.reduce((best, arm) => 
    arm.meanReward > best.meanReward ? arm : best
  );
}

function ucb1Select(arms: BanditArm[], totalPulls: number): BanditArm {
  return arms.reduce((best, arm) => {
    if (arm.pulls === 0) return arm; // Explore untried arms first
    
    const exploitation = arm.meanReward;
    const exploration = Math.sqrt(2 * Math.log(totalPulls) / arm.pulls);
    const ucbValue = exploitation + exploration;

    const bestExploitation = best.meanReward;
    const bestExploration = best.pulls === 0 ? Infinity : 
      Math.sqrt(2 * Math.log(totalPulls) / best.pulls);
    const bestUCB = bestExploitation + bestExploration;

    return ucbValue > bestUCB ? arm : best;
  });
}

function thompsonSamplingSelect(
  arms: BanditArm[],
  priorAlpha: number = 1,
  priorBeta: number = 1
): BanditArm {
  // Sample from Beta distribution for each arm
  const samples = arms.map(arm => {
    const successes = arm.rewards.filter(r => r > 0).length;
    const failures = arm.pulls - successes;
    
    const alpha = priorAlpha + successes;
    const beta = priorBeta + failures;
    
    // Simplified Beta sampling using Gamma approximation
    const sample = gammaSample(alpha) / (gammaSample(alpha) + gammaSample(beta));
    
    return { arm, sample };
  });

  // Select arm with highest sample
  return samples.reduce((best, current) => 
    current.sample > best.sample ? current : best
  ).arm;
}

function gammaSample(shape: number): number {
  // Simplified Gamma sampling (Marsaglia and Tsang's method)
  if (shape < 1) {
    return gammaSample(shape + 1) * Math.pow(_rng.next(), 1 / shape);
  }

  const d = shape - 1/3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;

    do {
      x = randomNormal();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = _rng.next();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

function randomNormal(): number {
  // Box-Muller transform
  const u1 = _rng.next();
  const u2 = _rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function softmaxSelect(arms: BanditArm[], temperature: number): BanditArm {
  const maxReward = Math.max(...arms.map(a => a.meanReward));
  const expRewards = arms.map(arm => 
    Math.exp((arm.meanReward - maxReward) / temperature)
  );
  const sumExp = expRewards.reduce((a, b) => a + b, 0);
  const probabilities = expRewards.map(e => e / sumExp);

  // Select based on probabilities
  const random = _rng.next();
  let cumulative = 0;

  for (let i = 0; i < arms.length; i++) {
    cumulative += probabilities[i];
    if (random <= cumulative) {
      return arms[i];
    }
  }

  return arms[arms.length - 1];
}

function updateTrafficAllocation(experiment: BanditExperiment): void {
  const totalReward = experiment.arms.reduce((sum, arm) => sum + arm.meanReward * arm.pulls, 0);
  const totalPulls = experiment.arms.reduce((sum, arm) => sum + arm.pulls, 0);

  if (totalPulls === 0) {
    // Equal allocation initially
    const equalShare = 1 / experiment.arms.length;
    experiment.arms.forEach(arm => {
      arm.trafficAllocation = equalShare;
    });
    return;
  }

  // Allocate based on performance
  experiment.arms.forEach(arm => {
    if (arm.pulls === 0) {
      arm.trafficAllocation = 0.01; // Minimum allocation for exploration
    } else {
      const weight = arm.meanReward * arm.pulls / totalReward;
      arm.trafficAllocation = Math.max(0.01, Math.min(0.99, weight));
    }
  });

  // Normalize to sum to 1
  const totalAllocation = experiment.arms.reduce((sum, arm) => sum + arm.trafficAllocation, 0);
  experiment.arms.forEach(arm => {
    arm.trafficAllocation /= totalAllocation;
  });
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createBanditExperiment(params: {
  organizationId: string;
  name: string;
  description: string;
  algorithm: BanditAlgorithm;
  arms: Omit<BanditArm, 'id' | 'pulls' | 'rewards' | 'meanReward' | 'variance' | 'trafficAllocation' | 'confidence' | 'isWinner'>[];
  configuration?: BanditConfiguration;
}): BanditExperiment {
  const now = new Date().toISOString();
  const id = randomUUID();

  const arms: BanditArm[] = params.arms.map(arm => ({
    ...arm,
    id: randomUUID(),
    pulls: 0,
    rewards: [],
    meanReward: 0,
    variance: 0,
    trafficAllocation: 1 / params.arms.length, // Equal initial allocation
    confidence: 0,
    isWinner: false,
  }));

  const experiment: BanditExperiment = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'draft',
    algorithm: params.algorithm,
    arms,
    configuration: params.configuration || {
      epsilon: 0.1,
      temperature: 1.0,
      explorationRate: 2.0,
      priorAlpha: 1,
      priorBeta: 1,
      convergenceThreshold: 0.95,
      minPullsPerArm: 10,
      updateFrequency: 'every_pull',
    },
    metrics: {
      totalPulls: 0,
      totalReward: 0,
      averageReward: 0,
      regret: 0,
      bestArmConfidence: 0,
      convergenceProgress: 0,
    },
    history: [],
    createdAt: now,
    updatedAt: now,
  };

  banditExperiments.set(id, experiment);
  return experiment;
}

export function getBanditExperiment(id: string): BanditExperiment | undefined {
  return banditExperiments.get(id);
}

export function listBanditExperiments(
  organizationId: string,
  filters?: { status?: BanditStatus; algorithm?: BanditAlgorithm }
): BanditExperiment[] {
  let result = Array.from(banditExperiments.values()).filter(
    e => e.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(e => e.status === filters.status);
  if (filters?.algorithm) result = result.filter(e => e.algorithm === filters.algorithm);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function startBanditExperiment(experimentId: string): BanditExperiment {
  const experiment = banditExperiments.get(experimentId);
  if (!experiment) throw new Error(`Bandit experiment ${experimentId} not found`);
  if (experiment.status !== 'draft') throw new Error(`Experiment is not in draft status`);

  experiment.status = 'running';
  experiment.startedAt = new Date().toISOString();
  experiment.updatedAt = new Date().toISOString();
  return experiment;
}

export function pauseBanditExperiment(experimentId: string): BanditExperiment {
  const experiment = banditExperiments.get(experimentId);
  if (!experiment) throw new Error(`Bandit experiment ${experimentId} not found`);
  if (experiment.status !== 'running') throw new Error(`Experiment is not running`);

  experiment.status = 'paused';
  experiment.updatedAt = new Date().toISOString();
  return experiment;
}

export function selectArm(experimentId: string): BanditArm {
  const experiment = banditExperiments.get(experimentId);
  if (!experiment) throw new Error(`Bandit experiment ${experimentId} not found`);
  if (experiment.status !== 'running') throw new Error(`Experiment is not running`);

  let selectedArm: BanditArm;

  switch (experiment.algorithm) {
    case 'epsilon_greedy':
      selectedArm = epsilonGreedySelect(
        experiment.arms,
        experiment.configuration.epsilon || 0.1
      );
      break;

    case 'ucb1':
      selectedArm = ucb1Select(experiment.arms, experiment.metrics.totalPulls);
      break;

    case 'thompson_sampling':
      selectedArm = thompsonSamplingSelect(
        experiment.arms,
        experiment.configuration.priorAlpha,
        experiment.configuration.priorBeta
      );
      break;

    case 'softmax':
      selectedArm = softmaxSelect(
        experiment.arms,
        experiment.configuration.temperature || 1.0
      );
      break;

    default:
      selectedArm = epsilonGreedySelect(experiment.arms, 0.1);
  }

  return selectedArm;
}

export function recordReward(
  experimentId: string,
  armId: string,
  reward: number
): BanditExperiment {
  const experiment = banditExperiments.get(experimentId);
  if (!experiment) throw new Error(`Bandit experiment ${experimentId} not found`);
  if (experiment.status !== 'running') throw new Error(`Experiment is not running`);

  const arm = experiment.arms.find(a => a.id === armId);
  if (!arm) throw new Error(`Arm ${armId} not found`);

  // Update arm statistics
  arm.pulls += 1;
  arm.rewards.push(reward);
  
  // Update mean reward
  arm.meanReward = arm.rewards.reduce((a, b) => a + b, 0) / arm.pulls;
  
  // Update variance
  if (arm.pulls > 1) {
    arm.variance = arm.rewards.reduce((sum, r) => sum + Math.pow(r - arm.meanReward, 2), 0) / (arm.pulls - 1);
  }

  // Update experiment metrics
  experiment.metrics.totalPulls += 1;
  experiment.metrics.totalReward += reward;
  experiment.metrics.averageReward = experiment.metrics.totalReward / experiment.metrics.totalPulls;

  // Calculate regret (difference from best possible reward)
  const bestPossibleReward = Math.max(...experiment.arms.map(a => a.meanReward));
  experiment.metrics.regret += (bestPossibleReward - reward);

  // Update traffic allocation
  if (experiment.configuration.updateFrequency === 'every_pull' ||
      (experiment.configuration.updateFrequency === 'batch' && 
       experiment.metrics.totalPulls % (experiment.configuration.batchSize || 10) === 0)) {
    updateTrafficAllocation(experiment);
  }

  // Update confidence and check for convergence
  updateArmConfidence(experiment);
  checkConvergence(experiment);

  // Record history
  const historyEntry: BanditHistory = {
    timestamp: new Date().toISOString(),
    armId: arm.id,
    armName: arm.name,
    action: 'pull',
    reward,
    trafficAllocation: Object.fromEntries(
      experiment.arms.map(a => [a.id, a.trafficAllocation])
    ),
    metrics: {
      meanReward: arm.meanReward,
      regret: experiment.metrics.regret,
    },
  };
  experiment.history.push(historyEntry);

  experiment.updatedAt = new Date().toISOString();
  return experiment;
}

function updateArmConfidence(experiment: BanditExperiment): void {
  const totalPulls = experiment.metrics.totalPulls;

  experiment.arms.forEach(arm => {
    if (arm.pulls === 0) {
      arm.confidence = 0;
      return;
    }

    // Confidence based on number of pulls and variance
    const pullConfidence = Math.min(1, arm.pulls / (experiment.configuration.minPullsPerArm || 10));
    const variancePenalty = arm.variance > 0 ? 1 / (1 + arm.variance) : 1;
    
    arm.confidence = pullConfidence * variancePenalty;
  });

  // Identify best arm
  const bestArm = experiment.arms.reduce((best, arm) => 
    arm.meanReward > best.meanReward ? arm : best
  );

  experiment.metrics.bestArmId = bestArm.id;
  experiment.metrics.bestArmConfidence = bestArm.confidence;

  // Mark winner if confidence is high enough
  experiment.arms.forEach(arm => {
    arm.isWinner = arm.id === bestArm.id && 
                   arm.confidence >= (experiment.configuration.convergenceThreshold || 0.95);
  });
}

function checkConvergence(experiment: BanditExperiment): void {
  const threshold = experiment.configuration.convergenceThreshold || 0.95;
  const minPulls = experiment.configuration.minPullsPerArm || 10;
  const maxPulls = experiment.configuration.maxTotalPulls;

  // Check if all arms have minimum pulls
  const allArmsPulled = experiment.arms.every(arm => arm.pulls >= minPulls);

  // Check if best arm has high confidence
  const bestArm = experiment.arms.find(a => a.id === experiment.metrics.bestArmId);
  const highConfidence = bestArm && bestArm.confidence >= threshold;

  // Check if max pulls reached
  const maxPullsReached = maxPulls && experiment.metrics.totalPulls >= maxPulls;

  // Calculate convergence progress
  const pullProgress = allArmsPulled ? 0.5 : 
    experiment.arms.reduce((sum, arm) => sum + Math.min(1, arm.pulls / minPulls), 0) / 
    (experiment.arms.length * 2);
  const confidenceProgress = highConfidence ? 0.5 : (bestArm?.confidence || 0) / (threshold * 2);
  experiment.metrics.convergenceProgress = Math.min(1, pullProgress + confidenceProgress);

  // Check for convergence
  if ((allArmsPulled && highConfidence) || maxPullsReached) {
    experiment.status = 'converged';
    experiment.endedAt = new Date().toISOString();
  }
}

export function completeBanditExperiment(experimentId: string): BanditExperiment {
  const experiment = banditExperiments.get(experimentId);
  if (!experiment) throw new Error(`Bandit experiment ${experimentId} not found`);

  experiment.status = 'completed';
  experiment.endedAt = new Date().toISOString();
  experiment.updatedAt = new Date().toISOString();
  return experiment;
}

export function cancelBanditExperiment(experimentId: string): BanditExperiment {
  const experiment = banditExperiments.get(experimentId);
  if (!experiment) throw new Error(`Bandit experiment ${experimentId} not found`);

  experiment.status = 'cancelled';
  experiment.endedAt = new Date().toISOString();
  experiment.updatedAt = new Date().toISOString();
  return experiment;
}

export function getBanditExperimentHistory(
  experimentId: string,
  limit: number = 100
): BanditHistory[] {
  const experiment = banditExperiments.get(experimentId);
  if (!experiment) throw new Error(`Bandit experiment ${experimentId} not found`);

  return experiment.history.slice(-limit).reverse();
}

export function getBanditExperimentMetrics(experimentId: string): BanditMetrics {
  const experiment = banditExperiments.get(experimentId);
  if (!experiment) throw new Error(`Bandit experiment ${experimentId} not found`);

  return experiment.metrics;
}
