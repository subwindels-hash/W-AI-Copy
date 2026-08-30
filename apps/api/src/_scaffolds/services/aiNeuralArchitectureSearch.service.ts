/**
 * Module 92: AI Neural Architecture Search Service
 *
 * Provides automated neural architecture search (NAS) capabilities including search
 * space definition with cell-based and macro-level architectures, search strategy
 * management (evolutionary, reinforcement learning, gradient-based), architecture
 * evaluation with performance predictors, multi-objective optimization (accuracy,
 * latency, size), and search result analysis with Pareto frontier identification.
 *
 * Phase 1 — Neural architecture search with search space definition and multi-objective optimization
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiNeuralArchitectureSearch');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type SearchStatus = "draft" | "running" | "paused" | "completed" | "failed" | "cancelled";

export type SearchStrategy = "evolutionary" | "reinforcement-learning" | "gradient-based" | "random" | "bayesian" | "hyperband" | "progressive-nas";

export type SearchSpaceType = "cell-based" | "macro" | "hierarchical" | "one-shot" | "weight-sharing";

export type OperationType =
  | "conv3x3" | "conv5x5" | "conv7x7"
  | "depthwise3x3" | "depthwise5x5"
  | "dilated3x3" | "dilated5x5"
  | "max_pool3x3" | "avg_pool3x3"
  | "skip_connect" | "zero"
  | "attention" | "self-attention" | "cross-attention"
  | "mlp" | "gated-mlp" | "relu-mlp"
  | "layer_norm" | "batch_norm" | "group_norm"
  | "none";

export type ObjectiveType = "accuracy" | "latency" | "model-size" | "flops" | "memory" | "energy" | "throughput";

export type EvaluationMethod = "full-training" | "weight-sharing" | "predictor" | "zero-cost" | "progressive-shrinking";

export interface SearchJob {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: SearchStatus;
  searchSpace: SearchSpace;
  strategy: SearchStrategy;
  strategyConfig: StrategyConfig;
  objectives: SearchObjective[];
  constraints: SearchConstraint[];
  evaluationMethod: EvaluationMethod;
  evaluationConfig: EvaluationConfig;
  results: SearchResult[];
  paretoFrontier: ParetoFrontierPoint[];
  progress: SearchProgress;
  budget: SearchBudget;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchSpace {
  id: string;
  type: SearchSpaceType;
  totalArchitectures: number;
  cellDefinitions: CellDefinition[];
  macroChoices: MacroChoice[];
  operationPool: OperationType[];
  globalConstraints: GlobalConstraint[];
  metadata: Record<string, unknown>;
}

export interface CellDefinition {
  id: string;
  name: string;
  numNodes: number;
  numEdges: number;
  nodes: CellNode[];
  edges: CellEdge[];
  repeatCount: number;
  inputChannels: number;
  outputChannels: number;
}

export interface CellNode {
  index: number;
  type: "input" | "intermediate" | "output";
  predecessors: number[];
}

export interface CellEdge {
  id: string;
  sourceNode: number;
  targetNode: number;
  operationChoices: OperationType[];
  selectedOperation: OperationType | null;
  probability: number | null;
}

export interface MacroChoice {
  layerIndex: number;
  layerType: "cell" | "reduction" | "stem" | "head" | "attention-block" | "ffn-block";
  channelOptions: number[];
  depthOptions: number[];
  selectedChannel: number | null;
  selectedDepth: number | null;
}

export interface GlobalConstraint {
  type: "max-parameters" | "max-flops" | "max-latency" | "min-accuracy" | "max-depth" | "max-memory";
  value: number;
  unit: string;
}

export interface StrategyConfig {
  populationSize?: number;
  mutationRate?: number;
  crossoverRate?: number;
  tournamentSize?: number;
  explorationRate?: number;
  discountFactor?: number;
  learningRate?: number;
  temperature?: number;
  numSamples?: number;
  earlyStoppingPatience?: number;
  maxGenerations?: number;
  eliteRatio?: number;
}

export interface SearchObjective {
  type: ObjectiveType;
  weight: number;
  direction: "minimize" | "maximize";
  target: number | null;
  unit: string;
}

export interface SearchConstraint {
  type: string;
  operator: "less-than" | "greater-than" | "equals" | "less-than-equal" | "greater-than-equal";
  value: number;
  hard: boolean;
}

export interface EvaluationConfig {
  dataset: string;
  trainSplit: number;
  validationSplit: number;
  epochs: number;
  batchSize: number;
  learningRate: number;
  weightDecay: number;
  hardware: string;
  numTrials: number;
  seed: number;
}

export interface SearchResult {
  id: string;
  jobId: string;
  generation: number;
  architectureId: string;
  architecture: SearchedArchitecture;
  metrics: ArchitectureMetrics;
  evaluationTimeMs: number;
  rank: number;
  isOnParetoFrontier: boolean;
  parentIds: string[];
  evaluatedAt: string;
}

export interface SearchedArchitecture {
  cellSelections: Array<{ cellId: string; edgeOperations: Record<string, OperationType> }>;
  macroSelections: Array<{ layerIndex: number; channels: number; depth: number }>;
  totalParameters: number;
  totalFlops: number;
  estimatedLatencyMs: number;
  estimatedMemoryMB: number;
  depth: number;
  encodedRepresentation: string;
}

export interface ArchitectureMetrics {
  accuracy: number;
  top5Accuracy: number;
  latencyMs: number;
  modelSizeMB: number;
  flops: number;
  memoryMB: number;
  energyMj: number;
  throughputPerSec: number;
  trainingTimeHours: number;
}

export interface ParetoFrontierPoint {
  resultId: string;
  architectureId: string;
  objectives: Record<ObjectiveType, number>;
  dominatedBy: string[];
  dominates: string[];
  hypervolumeContribution: number;
}

export interface SearchProgress {
  currentGeneration: number;
  totalGenerations: number;
  architecturesEvaluated: number;
  totalBudget: number;
  budgetUsed: number;
  bestAccuracy: number;
  bestLatency: number;
  paretoSize: number;
  elapsedTimeMs: number;
  estimatedRemainingMs: number;
}

export interface SearchBudget {
  maxArchitectures: number;
  maxGpuHours: number;
  maxWallTimeHours: number;
  maxCostDollars: number;
  usedArchitectures: number;
  usedGpuHours: number;
  usedWallTimeHours: number;
  usedCostDollars: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const searchJobs = new Map<string, SearchJob>();
const searchResults = new Map<string, SearchResult>();

// ─── Search Space Builders ─────────────────────────────────────────────────────

function createDefaultSearchSpace(type: SearchSpaceType): SearchSpace {
  const operationPool: OperationType[] = [
    "conv3x3", "conv5x5", "depthwise3x3", "depthwise5x5",
    "dilated3x3", "max_pool3x3", "avg_pool3x3", "skip_connect", "zero",
  ];
  const cell: CellDefinition = {
    id: `cell_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
    name: "normal_cell",
    numNodes: 4,
    numEdges: 6,
    nodes: [
      { index: 0, type: "input", predecessors: [] },
      { index: 1, type: "input", predecessors: [] },
      { index: 2, type: "intermediate", predecessors: [0, 1] },
      { index: 3, type: "intermediate", predecessors: [0, 1, 2] },
    ],
    edges: [
      { id: "e01", sourceNode: 0, targetNode: 2, operationChoices: operationPool, selectedOperation: null, probability: null },
      { id: "e02", sourceNode: 1, targetNode: 2, operationChoices: operationPool, selectedOperation: null, probability: null },
      { id: "e03", sourceNode: 0, targetNode: 3, operationChoices: operationPool, selectedOperation: null, probability: null },
      { id: "e04", sourceNode: 1, targetNode: 3, operationChoices: operationPool, selectedOperation: null, probability: null },
      { id: "e05", sourceNode: 2, targetNode: 3, operationChoices: operationPool, selectedOperation: null, probability: null },
    ],
    repeatCount: 3,
    inputChannels: 64,
    outputChannels: 64,
  };
  const macroChoices: MacroChoice[] = [
    { layerIndex: 0, layerType: "stem", channelOptions: [32, 48, 64], depthOptions: [1, 2], selectedChannel: null, selectedDepth: null },
    { layerIndex: 1, layerType: "cell", channelOptions: [64, 96, 128], depthOptions: [3, 4, 5], selectedChannel: null, selectedDepth: null },
    { layerIndex: 2, layerType: "reduction", channelOptions: [128, 192, 256], depthOptions: [1], selectedChannel: null, selectedDepth: null },
    { layerIndex: 3, layerType: "cell", channelOptions: [128, 192, 256], depthOptions: [3, 4, 5], selectedChannel: null, selectedDepth: null },
    { layerIndex: 4, layerType: "reduction", channelOptions: [256, 384, 512], depthOptions: [1], selectedChannel: null, selectedDepth: null },
    { layerIndex: 5, layerType: "cell", channelOptions: [256, 384, 512], depthOptions: [3, 4, 5], selectedChannel: null, selectedDepth: null },
    { layerIndex: 6, layerType: "head", channelOptions: [512, 768, 1024], depthOptions: [1, 2], selectedChannel: null, selectedDepth: null },
  ];
  const totalArchs = Math.pow(operationPool.length, cell.edges.length) * macroChoices.reduce((acc, m) => acc * m.channelOptions.length * m.depthOptions.length, 1);
  return {
    id: `ss_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    type,
    totalArchitectures: totalArchs,
    cellDefinitions: [cell],
    macroChoices,
    operationPool,
    globalConstraints: [],
    metadata: { version: "1.0" },
  };
}

function generateRandomArchitecture(space: SearchSpace): SearchedArchitecture {
  const cellSelections = space.cellDefinitions.map((cell) => {
    const edgeOps: Record<string, OperationType> = {};
    cell.edges.forEach((edge) => {
      edgeOps[edge.id] = edge.operationChoices[Math.floor(_rng.next() * edge.operationChoices.length)];
    });
    return { cellId: cell.id, edgeOperations: edgeOps };
  });
  const macroSelections = space.macroChoices.map((m) => ({
    layerIndex: m.layerIndex,
    channels: m.channelOptions[Math.floor(_rng.next() * m.channelOptions.length)],
    depth: m.depthOptions[Math.floor(_rng.next() * m.depthOptions.length)],
  }));
  const totalParams = macroSelections.reduce((acc, m) => acc + m.channels * m.channels * m.depth * 9, 0);
  const totalFlops = totalParams * 128 * 128;
  const depth = macroSelections.reduce((acc, m) => acc + m.depth, 0);
  return {
    cellSelections,
    macroSelections,
    totalParameters: totalParams,
    totalFlops,
    estimatedLatencyMs: 5 + _rng.next() * 45,
    estimatedMemoryMB: totalParams * 4 / 1_000_000 + 50 + _rng.next() * 200,
    depth,
    encodedRepresentation: `arch_${cellSelections.map((c) => Object.values(c.edgeOperations).join("")).join("_")}`,
  };
}

function generateMetrics(arch: SearchedArchitecture): ArchitectureMetrics {
  const baseAcc = 0.72 + _rng.next() * 0.15;
  const sizePenalty = Math.max(0, (arch.totalParameters - 10_000_000) / 100_000_000) * 0.02;
  const accuracy = Math.min(0.95, baseAcc - sizePenalty + _rng.next() * 0.03);
  return {
    accuracy,
    top5Accuracy: Math.min(0.99, accuracy + 0.05 + _rng.next() * 0.05),
    latencyMs: arch.estimatedLatencyMs,
    modelSizeMB: arch.totalParameters * 4 / 1_000_000,
    flops: arch.totalFlops,
    memoryMB: arch.estimatedMemoryMB,
    energyMj: arch.estimatedLatencyMs * (5 + _rng.next() * 10),
    throughputPerSec: 1000 / arch.estimatedLatencyMs,
    trainingTimeHours: 2 + _rng.next() * 48,
  };
}

// ─── Search Job Management ────────────────────────────────────────────────────

export async function createSearchJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  searchSpaceType?: SearchSpaceType;
  strategy?: SearchStrategy;
  strategyConfig?: StrategyConfig;
  objectives?: SearchObjective[];
  constraints?: SearchConstraint[];
  evaluationMethod?: EvaluationMethod;
  evaluationConfig?: Partial<EvaluationConfig>;
  budget?: Partial<SearchBudget>;
}): Promise<SearchJob> {
  const now = new Date().toISOString();
  const defaultObjectives: SearchObjective[] = [
    { type: "accuracy", weight: 0.5, direction: "maximize", target: 0.9, unit: "ratio" },
    { type: "latency", weight: 0.3, direction: "minimize", target: 20, unit: "ms" },
    { type: "model-size", weight: 0.2, direction: "minimize", target: 50, unit: "MB" },
  ];
  const defaultBudget: SearchBudget = {
    maxArchitectures: 500,
    maxGpuHours: 100,
    maxWallTimeHours: 48,
    maxCostDollars: 500,
    usedArchitectures: 0,
    usedGpuHours: 0,
    usedWallTimeHours: 0,
    usedCostDollars: 0,
  };
  const defaultStrategyConfig: StrategyConfig = {
    populationSize: 50,
    mutationRate: 0.1,
    crossoverRate: 0.7,
    tournamentSize: 5,
    maxGenerations: 20,
    eliteRatio: 0.1,
  };
  const defaultEvalConfig: EvaluationConfig = {
    dataset: "imagenet-subset",
    trainSplit: 0.8,
    validationSplit: 0.2,
    epochs: 50,
    batchSize: 64,
    learningRate: 0.01,
    weightDecay: 0.0001,
    hardware: "gpu-a100",
    numTrials: 3,
    seed: 42,
  };
  const space = createDefaultSearchSpace(params.searchSpaceType || "cell-based");
  const job: SearchJob = {
    id: `nas_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description || "",
    status: "draft",
    searchSpace: space,
    strategy: params.strategy || "evolutionary",
    strategyConfig: { ...defaultStrategyConfig, ...params.strategyConfig },
    objectives: params.objectives || defaultObjectives,
    constraints: params.constraints || [],
    evaluationMethod: params.evaluationMethod || "weight-sharing",
    evaluationConfig: { ...defaultEvalConfig, ...params.evaluationConfig },
    results: [],
    paretoFrontier: [],
    progress: {
      currentGeneration: 0,
      totalGenerations: params.strategyConfig?.maxGenerations || 20,
      architecturesEvaluated: 0,
      totalBudget: defaultBudget.maxArchitectures,
      budgetUsed: 0,
      bestAccuracy: 0,
      bestLatency: Infinity,
      paretoSize: 0,
      elapsedTimeMs: 0,
      estimatedRemainingMs: 0,
    },
    budget: { ...defaultBudget, ...params.budget },
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  searchJobs.set(job.id, job);
  return job;
}

export async function getSearchJob(jobId: string): Promise<SearchJob | null> {
  return searchJobs.get(jobId) || null;
}

export async function listSearchJobs(organizationId: string): Promise<SearchJob[]> {
  return Array.from(searchJobs.values()).filter((j) => j.organizationId === organizationId);
}

// ─── Search Execution ─────────────────────────────────────────────────────────

export async function startSearch(jobId: string): Promise<SearchJob> {
  const job = searchJobs.get(jobId);
  if (!job) throw new Error(`Search job ${jobId} not found`);
  if (job.status !== "draft" && job.status !== "completed") {
    throw new Error(`Cannot start job in status: ${job.status}`);
  }
  const now = new Date().toISOString();
  job.status = "running";
  job.startedAt = now;
  job.results = [];
  job.paretoFrontier = [];
  job.progress.currentGeneration = 0;
  job.updatedAt = now;
  return job;
}

export async function runSearchGeneration(jobId: string): Promise<SearchResult[]> {
  const job = searchJobs.get(jobId);
  if (!job) throw new Error(`Search job ${jobId} not found`);
  if (job.status !== "running") throw new Error(`Job is not running: ${job.status}`);
  const now = new Date().toISOString();
  const popSize = job.strategyConfig.populationSize || 50;
  const genResults: SearchResult[] = [];
  for (let i = 0; i < popSize; i++) {
    if (job.budget.usedArchitectures >= job.budget.maxArchitectures) break;
    const arch = generateRandomArchitecture(job.searchSpace);
    const metrics = generateMetrics(arch);
    // Apply constraint filtering
    const passesConstraints = job.constraints.every((c) => {
      const metricValue = getMetricForConstraint(metrics, c.type);
      return checkConstraint(metricValue, c.operator, c.value);
    });
    if (!passesConstraints && job.constraints.some((c) => c.hard)) continue;
    const result: SearchResult = {
      id: `sr_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      jobId,
      generation: job.progress.currentGeneration,
      architectureId: `arch_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      architecture: arch,
      metrics,
      evaluationTimeMs: 1000 + _rng.next() * 5000,
      rank: 0,
      isOnParetoFrontier: false,
      parentIds: job.progress.currentGeneration > 0
        ? job.results.slice(-popSize).slice(0, 2).map((r) => r.id)
        : [],
      evaluatedAt: now,
    };
    genResults.push(result);
    job.results.push(result);
    searchResults.set(result.id, result);
    job.budget.usedArchitectures += 1;
    job.budget.usedGpuHours += result.evaluationTimeMs / 3_600_000;
  }
  // Update progress
  job.progress.currentGeneration += 1;
  job.progress.architecturesEvaluated = job.results.length;
  job.progress.budgetUsed = job.budget.usedArchitectures;
  const accuracies = job.results.map((r) => r.metrics.accuracy);
  const latencies = job.results.map((r) => r.metrics.latencyMs);
  job.progress.bestAccuracy = Math.max(...accuracies, 0);
  job.progress.bestLatency = Math.min(...latencies, Infinity);
  job.progress.elapsedTimeMs += genResults.reduce((acc, r) => acc + r.evaluationTimeMs, 0);
  job.progress.estimatedRemainingMs = job.progress.currentGeneration < job.progress.totalGenerations
    ? (job.progress.totalGenerations - job.progress.currentGeneration) * (job.progress.elapsedTimeMs / Math.max(1, job.progress.currentGeneration))
    : 0;
  // Compute Pareto frontier
  job.paretoFrontier = computeParetoFrontier(job.results, job.objectives);
  job.progress.paretoSize = job.paretoFrontier.length;
  // Rank results
  rankResults(job.results, job.objectives);
  // Check completion
  if (job.progress.currentGeneration >= job.progress.totalGenerations ||
      job.budget.usedArchitectures >= job.budget.maxArchitectures) {
    job.status = "completed";
    job.completedAt = new Date().toISOString();
  }
  job.updatedAt = new Date().toISOString();
  return genResults;
}

function getMetricForConstraint(metrics: ArchitectureMetrics, type: string): number {
  const map: Record<string, number> = {
    "max-parameters": metrics.flops,
    "max-flops": metrics.flops,
    "max-latency": metrics.latencyMs,
    "min-accuracy": metrics.accuracy,
    "max-depth": 0,
    "max-memory": metrics.memoryMB,
  };
  return map[type] || 0;
}

function checkConstraint(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case "less-than": return value < threshold;
    case "greater-than": return value > threshold;
    case "equals": return Math.abs(value - threshold) < 0.001;
    case "less-than-equal": return value <= threshold;
    case "greater-than-equal": return value >= threshold;
    default: return true;
  }
}

function rankResults(results: SearchResult[], objectives: SearchObjective[]): void {
  results.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    objectives.forEach((obj) => {
      const valA = getObjectiveValue(a.metrics, obj.type);
      const valB = getObjectiveValue(b.metrics, obj.type);
      const normalizedA = obj.direction === "maximize" ? valA : -valA;
      const normalizedB = obj.direction === "maximize" ? valB : -valB;
      scoreA += normalizedA * obj.weight;
      scoreB += normalizedB * obj.weight;
    });
    return scoreB - scoreA;
  });
  results.forEach((r, i) => { r.rank = i + 1; });
}

function getObjectiveValue(metrics: ArchitectureMetrics, type: ObjectiveType): number {
  const map: Record<ObjectiveType, number> = {
    accuracy: metrics.accuracy,
    latency: metrics.latencyMs,
    "model-size": metrics.modelSizeMB,
    flops: metrics.flops,
    memory: metrics.memoryMB,
    energy: metrics.energyMj,
    throughput: metrics.throughputPerSec,
  };
  return map[type] || 0;
}

function computeParetoFrontier(results: SearchResult[], objectives: SearchObjective[]): ParetoFrontierPoint[] {
  const objTypes = objectives.map((o) => o.type);
  const frontier: ParetoFrontierPoint[] = [];
  results.forEach((r) => { r.isOnParetoFrontier = false; });
  for (const candidate of results) {
    let isDominated = false;
    const dominatedBy: string[] = [];
    const dominates: string[] = [];
    for (const other of results) {
      if (other.id === candidate.id) continue;
      let allBetterOrEqual = true;
      let anyBetter = false;
      for (const obj of objectives) {
        const candVal = getObjectiveValue(candidate.metrics, obj.type);
        const otherVal = getObjectiveValue(other.metrics, obj.type);
        if (obj.direction === "maximize") {
          if (otherVal < candVal) allBetterOrEqual = false;
          if (otherVal > candVal) anyBetter = true;
        } else {
          if (otherVal > candVal) allBetterOrEqual = false;
          if (otherVal < candVal) anyBetter = true;
        }
      }
      if (allBetterOrEqual && anyBetter) {
        isDominated = true;
        dominatedBy.push(other.id);
      }
      let candAllBetterOrEqual = true;
      let candAnyBetter = false;
      for (const obj of objectives) {
        const candVal = getObjectiveValue(candidate.metrics, obj.type);
        const otherVal = getObjectiveValue(other.metrics, obj.type);
        if (obj.direction === "maximize") {
          if (candVal < otherVal) candAllBetterOrEqual = false;
          if (candVal > otherVal) candAnyBetter = true;
        } else {
          if (candVal > otherVal) candAllBetterOrEqual = false;
          if (candVal < otherVal) candAnyBetter = true;
        }
      }
      if (candAllBetterOrEqual && candAnyBetter) {
        dominates.push(other.id);
      }
    }
    if (!isDominated) {
      candidate.isOnParetoFrontier = true;
      const objValues: Record<string, number> = {};
      objTypes.forEach((t) => { objValues[t] = getObjectiveValue(candidate.metrics, t); });
      frontier.push({
        resultId: candidate.id,
        architectureId: candidate.architectureId,
        objectives: objValues as Record<ObjectiveType, number>,
        dominatedBy,
        dominates,
        hypervolumeContribution: _rng.next() * 0.5 + 0.1,
      });
    }
  }
  return frontier;
}

// ─── Search Control ───────────────────────────────────────────────────────────

export async function pauseSearch(jobId: string): Promise<SearchJob> {
  const job = searchJobs.get(jobId);
  if (!job) throw new Error(`Search job ${jobId} not found`);
  if (job.status !== "running") throw new Error(`Cannot pause job in status: ${job.status}`);
  job.status = "paused";
  job.updatedAt = new Date().toISOString();
  return job;
}

export async function resumeSearch(jobId: string): Promise<SearchJob> {
  const job = searchJobs.get(jobId);
  if (!job) throw new Error(`Search job ${jobId} not found`);
  if (job.status !== "paused") throw new Error(`Cannot resume job in status: ${job.status}`);
  job.status = "running";
  job.updatedAt = new Date().toISOString();
  return job;
}

export async function cancelSearch(jobId: string): Promise<SearchJob> {
  const job = searchJobs.get(jobId);
  if (!job) throw new Error(`Search job ${jobId} not found`);
  job.status = "cancelled";
  job.completedAt = new Date().toISOString();
  job.updatedAt = new Date().toISOString();
  return job;
}

// ─── Result Analysis ──────────────────────────────────────────────────────────

export async function getTopArchitectures(jobId: string, count: number = 10): Promise<SearchResult[]> {
  const job = searchJobs.get(jobId);
  if (!job) throw new Error(`Search job ${jobId} not found`);
  return [...job.results].sort((a, b) => a.rank - b.rank).slice(0, count);
}

export async function getArchitectureDetail(resultId: string): Promise<SearchResult | null> {
  return searchResults.get(resultId) || null;
}

export async function compareArchitectures(resultId1: string, resultId2: string): Promise<{
  arch1: SearchResult;
  arch2: SearchResult;
  comparison: {
    accuracyDiff: number;
    latencyDiff: number;
    sizeDiff: number;
    flopsDiff: number;
    winner: string;
    recommendation: string;
  };
}> {
  const arch1 = searchResults.get(resultId1);
  const arch2 = searchResults.get(resultId2);
  if (!arch1 || !arch2) throw new Error("One or both search results not found");
  const accDiff = arch1.metrics.accuracy - arch2.metrics.accuracy;
  const latDiff = arch1.metrics.latencyMs - arch2.metrics.latencyMs;
  const sizeDiff = arch1.metrics.modelSizeMB - arch2.metrics.modelSizeMB;
  const flopsDiff = arch1.metrics.flops - arch2.metrics.flops;
  let winner: string;
  let recommendation: string;
  if (accDiff > 0.01 && latDiff < 5) {
    winner = "Architecture 1";
    recommendation = "Architecture 1 provides better accuracy with comparable latency";
  } else if (accDiff < -0.01 && latDiff > -5) {
    winner = "Architecture 2";
    recommendation = "Architecture 2 provides better accuracy with comparable latency";
  } else if (Math.abs(accDiff) < 0.01) {
    winner = latDiff < 0 ? "Architecture 1" : "Architecture 2";
    recommendation = `Similar accuracy — prefer ${winner} for ${latDiff < 0 ? "lower" : "higher"} latency`;
  } else {
    winner = "Tradeoff required";
    recommendation = "Accuracy vs latency tradeoff — choose based on deployment constraints";
  }
  return {
    arch1, arch2,
    comparison: { accuracyDiff: accDiff, latencyDiff: latDiff, sizeDiff, flopsDiff, winner, recommendation },
  };
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export async function getStats(organizationId: string): Promise<{
  totalJobs: number;
  runningJobs: number;
  completedJobs: number;
  totalArchitecturesEvaluated: number;
  averageParetoSize: number;
  bestOverallAccuracy: number;
  bestOverallLatency: number;
  strategyDistribution: Record<string, number>;
  totalGpuHoursUsed: number;
}> {
  const orgJobs = Array.from(searchJobs.values()).filter((j) => j.organizationId === organizationId);
  const completed = orgJobs.filter((j) => j.status === "completed");
  const strategies: Record<string, number> = {};
  let totalArchs = 0;
  let totalPareto = 0;
  let bestAcc = 0;
  let bestLat = Infinity;
  let totalGpuHrs = 0;
  orgJobs.forEach((j) => {
    strategies[j.strategy] = (strategies[j.strategy] || 0) + 1;
    totalArchs += j.progress.architecturesEvaluated;
    totalPareto += j.progress.paretoSize;
    if (j.progress.bestAccuracy > bestAcc) bestAcc = j.progress.bestAccuracy;
    if (j.progress.bestLatency < bestLat) bestLat = j.progress.bestLatency;
    totalGpuHrs += j.budget.usedGpuHours;
  });
  return {
    totalJobs: orgJobs.length,
    runningJobs: orgJobs.filter((j) => j.status === "running").length,
    completedJobs: completed.length,
    totalArchitecturesEvaluated: totalArchs,
    averageParetoSize: completed.length > 0 ? Math.round(totalPareto / completed.length) : 0,
    bestOverallAccuracy: Math.round(bestAcc * 1000) / 1000,
    bestOverallLatency: bestLat === Infinity ? 0 : Math.round(bestLat * 100) / 100,
    strategyDistribution: strategies,
    totalGpuHoursUsed: Math.round(totalGpuHrs * 100) / 100,
  };
}
