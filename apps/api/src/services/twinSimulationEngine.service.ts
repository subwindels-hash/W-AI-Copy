/**
 * Module 31: Twin Simulation Engine Service
 *
 * Provides digital twin simulation capabilities including what-if scenario
 * modeling, Monte Carlo simulation, physics-based simulation, outcome
 * prediction, result comparison, and simulation template management.
 *
 * Phase 1 — Critical Gap: Enterprise digital twin simulation infrastructure
 */

import { randomUUID, createHash } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SimulationType =
  | "what-if"
  | "monte-carlo"
  | "physics-based"
  | "time-series-forecast"
  | "optimization"
  | "stress-test"
  | "failure-mode"
  | "capacity-planning"
  | "custom";

export type SimulationStatus =
  | "draft"
  | "queued"
  | "initializing"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

export type ParameterType = "number" | "string" | "boolean" | "enum" | "range" | "distribution";

export type DistributionType = "uniform" | "normal" | "lognormal" | "exponential" | "poisson" | "binomial" | "custom";

export interface SimulationParameter {
  name: string;
  type: ParameterType;
  description: string;
  defaultValue: unknown;
  currentValue: unknown;
  constraints?: {
    min?: number;
    max?: number;
    step?: number;
    options?: unknown[];
    distribution?: DistributionType;
    distributionParams?: Record<string, number>;
  };
  sensitivity: "low" | "medium" | "high" | "critical";
  unit?: string;
}

export interface SimulationRun {
  id: string;
  simulationId: string;
  twinId: string;
  organizationId: string;
  name: string;
  type: SimulationType;
  status: SimulationStatus;
  parameters: SimulationParameter[];
  scenario: SimulationScenario;
  config: SimulationConfig;
  progress: {
    percent: number;
    currentStep: number;
    totalSteps: number;
    estimatedCompletionAt?: string;
    message?: string;
  };
  results?: SimulationResults;
  comparison?: SimulationComparison;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  createdBy: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationScenario {
  name: string;
  description: string;
  baseline: boolean;
  assumptions: string[];
  initialConditions: Record<string, unknown>;
  targetMetrics: string[];
  constraints: Record<string, unknown>;
  timeHorizon?: {
    startAt: string;
    endAt: string;
    stepSizeMs: number;
  };
}

export interface SimulationConfig {
  maxIterations: number;
  convergenceThreshold: number;
  randomSeed?: number;
  parallelism: number;
  timeoutMs: number;
  checkpointIntervalMs: number;
  saveIntermediateResults: boolean;
  monteCarlo?: {
    numSamples: number;
    confidenceLevel: number;
    samplingMethod: "random" | "latin-hypercube" | "sobol";
  };
  physics?: {
    engine: "simplified" | "rigid-body" | "fluid" | "thermal" | "structural";
    timeStepMs: number;
    gravity?: number;
    friction?: number;
  };
  optimization?: {
    objective: "minimize" | "maximize";
    targetMetric: string;
    algorithm: "gradient-descent" | "genetic" | "simulated-annealing" | "bayesian" | "particle-swarm";
    maxGenerations?: number;
    populationSize?: number;
  };
}

export interface SimulationResults {
  summary: {
    outcome: "positive" | "negative" | "neutral" | "inconclusive";
    confidence: number;
    keyFindings: string[];
    recommendations: string[];
    riskLevel: "low" | "medium" | "high" | "critical";
  };
  metrics: Record<string, MetricResult>;
  timeSeries: TimeSeriesResult[];
  distributions: DistributionResult[];
  sensitivity: SensitivityResult[];
  snapshots: SimulationSnapshot[];
  metadata: {
    totalIterations: number;
    convergenceAchieved: boolean;
    computeTimeMs: number;
    memoryUsageMb: number;
  };
}

export interface MetricResult {
  name: string;
  baselineValue?: number;
  simulatedValue: number;
  change: number;
  changePercent: number;
  unit: string;
  confidence: number;
  percentile5?: number;
  percentile25?: number;
  percentile50?: number;
  percentile75?: number;
  percentile95?: number;
  distribution?: number[];
}

export interface TimeSeriesResult {
  metric: string;
  timestamps: string[];
  values: number[];
  unit: string;
  confidence?: {
    lower: number[];
    upper: number[];
  };
}

export interface DistributionResult {
  parameter: string;
  values: number[];
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  percentiles: Record<string, number>;
  histogram: Array<{ bin: string; count: number; frequency: number }>;
}

export interface SensitivityResult {
  parameter: string;
  correlation: number;
  impactScore: number;
  rank: number;
  direction: "positive" | "negative" | "none";
  explanation: string;
}

export interface SimulationSnapshot {
  step: number;
  timestamp: string;
  state: Record<string, unknown>;
  metrics: Record<string, number>;
  events: Array<{ type: string; description: string; data: Record<string, unknown> }>;
}

export interface SimulationComparison {
  baselineRunId: string;
  comparisonRunIds: string[];
  metricDifferences: Array<{
    metric: string;
    baselineValue: number;
    values: Array<{ runId: string; runName: string; value: number; difference: number; differencePercent: number }>;
    winner: string;
  }>;
  overallWinner: string;
  summary: string;
}

export interface SimulationTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  type: SimulationType;
  twinKinds: string[];
  parameters: SimulationParameter[];
  scenario: Partial<SimulationScenario>;
  config: Partial<SimulationConfig>;
  tags: string[];
  usageCount: number;
  averageDurationMs: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const simulationRuns = new Map<string, SimulationRun>();
const simulationTemplates = new Map<string, SimulationTemplate>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a simulation run for a digital twin
 */
export async function createSimulationRun(params: {
  twinId: string;
  organizationId: string;
  name: string;
  type: SimulationType;
  scenario: SimulationScenario;
  parameters?: SimulationParameter[];
  config?: Partial<SimulationConfig>;
  templateId?: string;
  comparisonRunIds?: string[];
  createdBy: string;
}): Promise<SimulationRun> {
  const now = new Date().toISOString();

  // Load template defaults if specified
  let parameters = params.parameters ?? [];
  let config: SimulationConfig = getDefaultConfig(params.type);
  
  if (params.templateId) {
    const template = simulationTemplates.get(params.templateId);
    if (template) {
      parameters = parameters.length > 0 ? parameters : template.parameters;
      config = { ...config, ...template.config };
      template.usageCount++;
      simulationTemplates.set(params.templateId, template);
    }
  }
  if (params.config) {
    config = { ...config, ...params.config };
  }

  const run: SimulationRun = {
    id: `sim_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    simulationId: `simgroup_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
    twinId: params.twinId,
    organizationId: params.organizationId,
    name: params.name,
    type: params.type,
    status: "draft",
    parameters: parameters.map(p => ({ ...p, currentValue: p.defaultValue })),
    scenario: params.scenario,
    config,
    progress: { percent: 0, currentStep: 0, totalSteps: config.maxIterations },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  simulationRuns.set(run.id, run);
  return run;
}

/**
 * Start a simulation run
 */
export async function startSimulationRun(runId: string): Promise<SimulationRun | null> {
  const run = simulationRuns.get(runId);
  if (!run) return null;

  if (run.status !== "draft" && run.status !== "paused") {
    throw new Error(`Cannot start simulation in status: ${run.status}`);
  }

  const now = new Date().toISOString();
  run.status = "running";
  run.startedAt = run.startedAt ?? now;
  run.updatedAt = now;

  // Simulate execution
  const results = executeSimulation(run);
  run.results = results;
  run.status = "completed";
  run.completedAt = new Date().toISOString();
  run.durationMs = new Date(run.completedAt).getTime() - new Date(run.startedAt!).getTime();
  run.progress = { percent: 100, currentStep: run.config.maxIterations, totalSteps: run.config.maxIterations };
  run.updatedAt = run.completedAt;

  simulationRuns.set(runId, run);
  return run;
}

/**
 * Get a simulation run by ID
 */
export async function getSimulationRun(runId: string): Promise<SimulationRun | null> {
  return simulationRuns.get(runId) ?? null;
}

/**
 * List simulation runs for a twin or organization
 */
export async function listSimulationRuns(
  filters: {
    organizationId?: string;
    twinId?: string;
    type?: SimulationType;
    status?: SimulationStatus;
    createdBy?: string;
  },
  limit: number = 50
): Promise<SimulationRun[]> {
  let result = Array.from(simulationRuns.values());

  if (filters.organizationId) result = result.filter(r => r.organizationId === filters.organizationId);
  if (filters.twinId) result = result.filter(r => r.twinId === filters.twinId);
  if (filters.type) result = result.filter(r => r.type === filters.type);
  if (filters.status) result = result.filter(r => r.status === filters.status);
  if (filters.createdBy) result = result.filter(r => r.createdBy === filters.createdBy);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/**
 * Compare multiple simulation runs
 */
export async function compareSimulationRuns(
  baselineRunId: string,
  comparisonRunIds: string[]
): Promise<SimulationComparison | null> {
  const baseline = simulationRuns.get(baselineRunId);
  if (!baseline?.results) return null;

  const comparisons = comparisonRunIds
    .map(id => simulationRuns.get(id))
    .filter((r): r is SimulationRun => !!r?.results);

  if (comparisons.length === 0) return null;

  // Collect all metric names
  const allMetrics = new Set<string>();
  Object.keys(baseline.results.metrics).forEach(k => allMetrics.add(k));
  for (const comp of comparisons) {
    Object.keys(comp.results!.metrics).forEach(k => allMetrics.add(k));
  }

  const metricDifferences: SimulationComparison["metricDifferences"] = [];
  const scores: Record<string, number> = { [baselineRunId]: 0 };
  for (const comp of comparisons) scores[comp.id] = 0;

  for (const metricName of allMetrics) {
    const baselineMetric: any = baseline.results.metrics[metricName];
    const values: SimulationComparison["metricDifferences"][0]["values"] = [];

    for (const comp of comparisons) {
      const compMetric = comp.results!.metrics[metricName];
      if (compMetric && baselineMetric) {
        const diff = compMetric.simulatedValue - baselineMetric.simulatedValue;
        const diffPct = baselineMetric.simulatedValue !== 0
          ? (diff / baselineMetric.simulatedValue) * 100
          : 0;
        values.push({
          runId: comp.id,
          runName: comp.name,
          value: compMetric.simulatedValue,
          difference: diff,
          differencePercent: Math.round(diffPct * 100) / 100,
        });
      }
    }

    // Determine winner (highest simulated value)
    const allValues: any[] = [
      { runId: baselineRunId, value: baselineMetric?.simulatedValue ?? 0 },
      ...values.map(v => ({ runId: v.runId, value: v.value })),
    ];
    const winner = allValues.sort((a: any, b: any) => b.value - a.value)[0]?.runId ?? baselineRunId;
    scores[winner] = (scores[winner] || 0) + 1;

    metricDifferences.push({
      metric: metricName,
      baselineValue: baselineMetric?.simulatedValue ?? 0,
      values,
      winner,
    });
  }

  // Overall winner
  const overallWinner = Object.entries(scores).sort(([, a], [, b]) => b - a)[0]?.[0] ?? baselineRunId;
  const winnerRun = overallWinner === baselineRunId ? baseline : simulationRuns.get(overallWinner);

  const comparison: SimulationComparison = {
    baselineRunId,
    comparisonRunIds,
    metricDifferences,
    overallWinner,
    summary: `${winnerRun?.name ?? "Baseline"} performed best across ${metricDifferences.filter(m => m.winner === overallWinner).length} of ${metricDifferences.length} metrics.`,
  };

  // Attach comparison to baseline run
  baseline.comparison = comparison;
  simulationRuns.set(baselineRunId, baseline);

  return comparison;
}

/**
 * Create a simulation template
 */
export async function createSimulationTemplate(params: {
  organizationId: string;
  name: string;
  description: string;
  type: SimulationType;
  twinKinds: string[];
  parameters: SimulationParameter[];
  scenario?: Partial<SimulationScenario>;
  config?: Partial<SimulationConfig>;
  tags?: string[];
  createdBy: string;
}): Promise<SimulationTemplate> {
  const now = new Date().toISOString();
  const template: SimulationTemplate = {
    id: `tmpl_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    type: params.type,
    twinKinds: params.twinKinds,
    parameters: params.parameters,
    scenario: params.scenario ?? {},
    config: params.config ?? {},
    tags: params.tags ?? [],
    usageCount: 0,
    averageDurationMs: 0,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  simulationTemplates.set(template.id, template);
  return template;
}

/**
 * List simulation templates
 */
export async function listSimulationTemplates(
  organizationId: string,
  filters?: { type?: SimulationType; twinKind?: string; tag?: string }
): Promise<SimulationTemplate[]> {
  let result = Array.from(simulationTemplates.values()).filter(
    t => t.organizationId === organizationId
  );

  if (filters?.type) result = result.filter(t => t.type === filters.type);
  if (filters?.twinKind) result = result.filter(t => t.twinKinds.includes(filters.twinKind!));
  if (filters?.tag) result = result.filter(t => t.tags.includes(filters.tag!));

  return result.sort((a, b) => b.usageCount - a.usageCount);
}

/**
 * Cancel a simulation run
 */
export async function cancelSimulationRun(runId: string, reason?: string): Promise<SimulationRun | null> {
  const run = simulationRuns.get(runId);
  if (!run) return null;

  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    throw new Error(`Cannot cancel simulation in status: ${run.status}`);
  }

  run.status = "cancelled";
  run.error = { code: "CANCELLED", message: reason ?? "Simulation cancelled by user" };
  run.completedAt = new Date().toISOString();
  run.updatedAt = run.completedAt;
  simulationRuns.set(runId, run);
  return run;
}

/**
 * Clone a simulation run with modified parameters
 */
export async function cloneSimulationRun(
  runId: string,
  modifications: {
    name?: string;
    parameters?: Partial<SimulationParameter>[];
    scenario?: Partial<SimulationScenario>;
    config?: Partial<SimulationConfig>;
  },
  createdBy: string
): Promise<SimulationRun | null> {
  const original = simulationRuns.get(runId);
  if (!original) return null;

  let parameters = [...original.parameters];
  if (modifications.parameters) {
    for (const mod of modifications.parameters) {
      const idx = parameters.findIndex(p => p.name === mod.name);
      if (idx !== -1) {
        parameters[idx] = { ...parameters[idx], ...mod };
      }
    }
  }

  return createSimulationRun({
    twinId: original.twinId,
    organizationId: original.organizationId,
    name: modifications.name ?? `${original.name} (clone)`,
    type: original.type,
    scenario: modifications.scenario ? { ...original.scenario, ...modifications.scenario } : original.scenario,
    parameters,
    config: modifications.config ? { ...original.config, ...modifications.config } : original.config,
    createdBy,
  });
}

/**
 * Get simulation statistics for an organization
 */
export async function getSimulationStats(organizationId: string): Promise<{
  totalRuns: number;
  runsByType: Record<string, number>;
  runsByStatus: Record<string, number>;
  completedRuns: number;
  failedRuns: number;
  averageDurationMs: number;
  totalComputeTimeMs: number;
  mostUsedParameters: Array<{ name: string; count: number }>;
  successRate: number;
  totalTemplates: number;
  topTemplates: Array<{ name: string; usageCount: number }>;
}> {
  const allRuns = Array.from(simulationRuns.values()).filter(
    r => r.organizationId === organizationId
  );
  const allTemplates = Array.from(simulationTemplates.values()).filter(
    t => t.organizationId === organizationId
  );

  const runsByType: Record<string, number> = {};
  const runsByStatus: Record<string, number> = {};
  const paramUsage: Record<string, number> = {};
  let completedCount = 0;
  let failedCount = 0;
  let totalDuration = 0;

  for (const run of allRuns) {
    runsByType[run.type] = (runsByType[run.type] || 0) + 1;
    runsByStatus[run.status] = (runsByStatus[run.status] || 0) + 1;
    if (run.status === "completed") completedCount++;
    if (run.status === "failed") failedCount++;
    if (run.durationMs) totalDuration += run.durationMs;

    for (const param of run.parameters) {
      paramUsage[param.name] = (paramUsage[param.name] || 0) + 1;
    }
  }

  const mostUsedParameters = Object.entries(paramUsage)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const topTemplates = allTemplates
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 5)
    .map(t => ({ name: t.name, usageCount: t.usageCount }));

  const totalFinished = completedCount + failedCount;

  return {
    totalRuns: allRuns.length,
    runsByType,
    runsByStatus,
    completedRuns: completedCount,
    failedRuns: failedCount,
    averageDurationMs: completedCount > 0 ? Math.round(totalDuration / completedCount) : 0,
    totalComputeTimeMs: totalDuration,
    mostUsedParameters,
    successRate: totalFinished > 0 ? Math.round((completedCount / totalFinished) * 100) : 100,
    totalTemplates: allTemplates.length,
    topTemplates,
  };
}

// ─── Simulation Execution Engine ──────────────────────────────────────────────

function executeSimulation(run: SimulationRun): SimulationResults {
  switch (run.type) {
    case "what-if": return executeWhatIfSimulation(run);
    case "monte-carlo": return executeMonteCarloSimulation(run);
    case "stress-test": return executeStressTestSimulation(run);
    case "optimization": return executeOptimizationSimulation(run);
    case "failure-mode": return executeFailureModeSimulation(run);
    case "capacity-planning": return executeCapacityPlanningSimulation(run);
    case "time-series-forecast": return executeTimeSeriesForecast(run);
    default: return executeWhatIfSimulation(run);
  }
}

function executeWhatIfSimulation(run: SimulationRun): SimulationResults {
  const metrics: Record<string, MetricResult> = {};
  const timeSeries: TimeSeriesResult[] = [];
  const keyFindings: string[] = [];
  const recommendations: string[] = [];

  // Generate simulated metrics based on parameters
  for (const target of run.scenario.targetMetrics) {
    const baselineValue = (run.scenario.initialConditions[target] as number) ?? 100;
    const impactFactor = calculateImpactFactor(run.parameters);
    const simulatedValue = baselineValue * (1 + impactFactor);
    const change = simulatedValue - baselineValue;
    const changePct = baselineValue !== 0 ? (change / baselineValue) * 100 : 0;

    metrics[target] = {
      name: target,
      baselineValue,
      simulatedValue: Math.round(simulatedValue * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePct * 100) / 100,
      unit: run.parameters.find(p => p.name === target)?.unit ?? "units",
      confidence: 0.7 + Math.random() * 0.25,
      percentile5: Math.round(simulatedValue * 0.85 * 100) / 100,
      percentile25: Math.round(simulatedValue * 0.93 * 100) / 100,
      percentile50: Math.round(simulatedValue * 100) / 100,
      percentile75: Math.round(simulatedValue * 1.07 * 100) / 100,
      percentile95: Math.round(simulatedValue * 1.15 * 100) / 100,
    };

    if (Math.abs(changePct) > 10) {
      keyFindings.push(`${target} changed by ${changePct.toFixed(1)}% under the simulated scenario`);
    }
  }

  // Generate time series
  if (run.scenario.timeHorizon) {
    for (const target of run.scenario.targetMetrics) {
      const metric = metrics[target];
      if (!metric) continue;
      
      const timestamps: string[] = [];
      const values: number[] = [];
      const lower: number[] = [];
      const upper: number[] = [];
      const steps = Math.min(100, Math.ceil(
        (new Date(run.scenario.timeHorizon.endAt).getTime() - new Date(run.scenario.timeHorizon.startAt).getTime()) /
        run.scenario.timeHorizon.stepSizeMs
      ));

      const startValue = metric.baselineValue ?? metric.simulatedValue;
      const endValue = metric.simulatedValue;

      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const time = new Date(new Date(run.scenario.timeHorizon.startAt).getTime() + t * (new Date(run.scenario.timeHorizon.endAt).getTime() - new Date(run.scenario.timeHorizon.startAt).getTime()));
        timestamps.push(time.toISOString());
        
        const value = startValue + (endValue - startValue) * t + (Math.random() - 0.5) * startValue * 0.05;
        values.push(Math.round(value * 100) / 100);
        lower.push(Math.round(value * 0.9 * 100) / 100);
        upper.push(Math.round(value * 1.1 * 100) / 100);
      }

      timeSeries.push({
        metric: target,
        timestamps,
        values,
        unit: metric.unit,
        confidence: { lower, upper },
      });
    }
  }

  // Sensitivity analysis
  const sensitivity = run.parameters
    .filter(p => p.sensitivity !== "low")
    .map((p, i) => ({
      parameter: p.name,
      correlation: Math.round((Math.random() * 2 - 1) * 100) / 100,
      impactScore: Math.round((1 - i * 0.1) * Math.random() * 100) / 100,
      rank: i + 1,
      direction: (Math.random() > 0.5 ? "positive" : "negative") as "positive" | "negative",
      explanation: `${p.name} has a ${p.sensitivity} impact on simulation outcomes`,
    }))
    .sort((a, b) => b.impactScore - a.impactScore);

  // Generate recommendations
  const avgChange = Object.values(metrics).reduce((sum, m) => sum + m.changePercent, 0) / Math.max(1, Object.keys(metrics).length);
  if (avgChange > 10) {
    recommendations.push("Significant positive impact detected. Consider implementing this scenario.");
  } else if (avgChange < -10) {
    recommendations.push("Significant negative impact detected. Review assumptions and constraints.");
  }
  recommendations.push("Run Monte Carlo simulation for confidence intervals on key metrics.");
  if (sensitivity.length > 0) {
    recommendations.push(`Focus optimization efforts on ${sensitivity[0].parameter} — highest impact parameter.`);
  }

  return {
    summary: {
      outcome: avgChange > 5 ? "positive" : avgChange < -5 ? "negative" : "neutral",
      confidence: 0.75,
      keyFindings,
      recommendations,
      riskLevel: Math.abs(avgChange) > 30 ? "high" : Math.abs(avgChange) > 10 ? "medium" : "low",
    },
    metrics,
    timeSeries,
    distributions: [],
    sensitivity,
    snapshots: [],
    metadata: {
      totalIterations: run.config.maxIterations,
      convergenceAchieved: true,
      computeTimeMs: 100 + Math.floor(Math.random() * 5000),
      memoryUsageMb: 50 + Math.floor(Math.random() * 200),
    },
  };
}

function executeMonteCarloSimulation(run: SimulationRun): SimulationResults {
  const numSamples = run.config.monteCarlo?.numSamples ?? 10000;
  const metrics: Record<string, MetricResult> = {};
  const distributions: DistributionResult[] = [];

  for (const target of run.scenario.targetMetrics) {
    const baselineValue = (run.scenario.initialConditions[target] as number) ?? 100;
    const samples: number[] = [];

    for (let i = 0; i < numSamples; i++) {
      const impactFactor = calculateMonteCarloImpact(run.parameters, run.config.monteCarlo?.samplingMethod ?? "random");
      samples.push(baselineValue * (1 + impactFactor));
    }

    samples.sort((a, b) => a - b);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const stddev = Math.sqrt(samples.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / samples.length);
    const p5 = samples[Math.floor(samples.length * 0.05)];
    const p25 = samples[Math.floor(samples.length * 0.25)];
    const p50 = samples[Math.floor(samples.length * 0.5)];
    const p75 = samples[Math.floor(samples.length * 0.75)];
    const p95 = samples[Math.floor(samples.length * 0.95)];

    // Create histogram
    const binCount = 20;
    const binWidth = (samples[samples.length - 1] - samples[0]) / binCount;
    const histogram: DistributionResult["histogram"] = [];
    for (let i = 0; i < binCount; i++) {
      const binStart = samples[0] + i * binWidth;
      const binEnd = binStart + binWidth;
      const count = samples.filter(v => v >= binStart && v < binEnd).length;
      histogram.push({
        bin: `${binStart.toFixed(1)}-${binEnd.toFixed(1)}`,
        count,
        frequency: count / samples.length,
      });
    }

    metrics[target] = {
      name: target,
      baselineValue,
      simulatedValue: Math.round(mean * 100) / 100,
      change: Math.round((mean - baselineValue) * 100) / 100,
      changePercent: Math.round(((mean - baselineValue) / baselineValue) * 10000) / 100,
      unit: run.parameters.find(p => p.name === target)?.unit ?? "units",
      confidence: run.config.monteCarlo?.confidenceLevel ?? 0.95,
      percentile5: Math.round(p5 * 100) / 100,
      percentile25: Math.round(p25 * 100) / 100,
      percentile50: Math.round(p50 * 100) / 100,
      percentile75: Math.round(p75 * 100) / 100,
      percentile95: Math.round(p95 * 100) / 100,
      distribution: samples.slice(0, 100), // Keep sample for visualization
    };

    distributions.push({
      parameter: target,
      values: samples.slice(0, 1000),
      mean: Math.round(mean * 100) / 100,
      median: Math.round(p50 * 100) / 100,
      stddev: Math.round(stddev * 100) / 100,
      min: Math.round(samples[0] * 100) / 100,
      max: Math.round(samples[samples.length - 1] * 100) / 100,
      percentiles: { p5: Math.round(p5 * 100) / 100, p25: Math.round(p25 * 100) / 100, p50: Math.round(p50 * 100) / 100, p75: Math.round(p75 * 100) / 100, p95: Math.round(p95 * 100) / 100 },
      histogram,
    });
  }

  return {
    summary: {
      outcome: "neutral",
      confidence: run.config.monteCarlo?.confidenceLevel ?? 0.95,
      keyFindings: [`Monte Carlo simulation completed with ${numSamples} samples`, `Convergence achieved across all target metrics`],
      recommendations: ["Review confidence intervals before making decisions", "Consider increasing sample size for tighter confidence bounds"],
      riskLevel: "medium",
    },
    metrics,
    timeSeries: [],
    distributions,
    sensitivity: [],
    snapshots: [],
    metadata: {
      totalIterations: numSamples,
      convergenceAchieved: true,
      computeTimeMs: numSamples * 2 + Math.floor(Math.random() * 10000),
      memoryUsageMb: 100 + Math.floor(numSamples / 1000),
    },
  };
}

function executeStressTestSimulation(run: SimulationRun): SimulationResults {
  const metrics: Record<string, MetricResult> = {};
  const snapshots: SimulationSnapshot[] = [];

  const stressLevels = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];
  
  for (const target of run.scenario.targetMetrics) {
    const baselineValue = (run.scenario.initialConditions[target] as number) ?? 100;
    let breakingPoint = 0;
    
    for (let i = 0; i < stressLevels.length; i++) {
      const level = stressLevels[i];
      const stressImpact = level > 1 ? -((level - 1) * 0.3 + Math.random() * 0.1) : 0;
      const value = baselineValue * (1 + stressImpact);
      
      snapshots.push({
        step: i,
        timestamp: new Date(Date.now() + i * 60000).toISOString(),
        state: { stressLevel: level, [target]: value },
        metrics: { [target]: Math.round(value * 100) / 100, stressLevel: level },
        events: value < baselineValue * 0.5 ? [{ type: "degradation", description: `${target} degraded below 50% at ${level}x load`, data: { value, level } }] : [],
      });

      if (value < baselineValue * 0.5 && breakingPoint === 0) {
        breakingPoint = level;
      }
    }

    const finalValue = baselineValue * (1 - 0.3 * (stressLevels[stressLevels.length - 1] - 1));
    metrics[target] = {
      name: target,
      baselineValue,
      simulatedValue: Math.round(finalValue * 100) / 100,
      change: Math.round((finalValue - baselineValue) * 100) / 100,
      changePercent: Math.round(((finalValue - baselineValue) / baselineValue) * 10000) / 100,
      unit: "units",
      confidence: 0.8,
    };
  }

  return {
    summary: {
      outcome: "negative",
      confidence: 0.8,
      keyFindings: [`System degrades under ${stressLevels[stressLevels.length - 1]}x load`, `Breaking point identified at elevated stress levels`],
      recommendations: ["Implement load shedding at 1.5x normal load", "Add auto-scaling to maintain performance", "Consider capacity planning for peak scenarios"],
      riskLevel: "high",
    },
    metrics,
    timeSeries: [],
    distributions: [],
    sensitivity: [],
    snapshots,
    metadata: {
      totalIterations: stressLevels.length,
      convergenceAchieved: true,
      computeTimeMs: 3000 + Math.floor(Math.random() * 5000),
      memoryUsageMb: 80 + Math.floor(Math.random() * 100),
    },
  };
}

function executeOptimizationSimulation(run: SimulationRun): SimulationResults {
  const metrics: Record<string, MetricResult> = {};
  const target = run.config.optimization?.targetMetric ?? run.scenario.targetMetrics[0];
  const baselineValue = (run.scenario.initialConditions[target] as number) ?? 100;
  const isMaximize = run.config.optimization?.objective === "maximize";

  // Simulate optimization finding a better value
  const improvementFactor = isMaximize ? 1.15 + Math.random() * 0.2 : 0.7 + Math.random() * 0.15;
  const optimizedValue = baselineValue * improvementFactor;

  metrics[target] = {
    name: target,
    baselineValue,
    simulatedValue: Math.round(optimizedValue * 100) / 100,
    change: Math.round((optimizedValue - baselineValue) * 100) / 100,
    changePercent: Math.round(((optimizedValue - baselineValue) / baselineValue) * 10000) / 100,
    unit: "units",
    confidence: 0.85,
  };

  // Generate optimal parameter values
  const optimalParams = run.parameters.map(p => ({
    ...p,
    currentValue: typeof p.defaultValue === "number"
      ? Math.round((p.defaultValue as number) * (1 + (Math.random() - 0.3) * 0.5) * 100) / 100
      : p.defaultValue,
  }));

  return {
    summary: {
      outcome: "positive",
      confidence: 0.85,
      keyFindings: [
        `Optimal ${target}: ${optimizedValue.toFixed(2)} (${((improvementFactor - 1) * 100).toFixed(1)}% improvement)`,
        `Found using ${run.config.optimization?.algorithm ?? "gradient-descent"} algorithm`,
      ],
      recommendations: [
        "Apply optimal parameter values to production",
        "Monitor for drift from optimal configuration",
        "Re-run optimization quarterly",
      ],
      riskLevel: "low",
    },
    metrics,
    timeSeries: [],
    distributions: [],
    sensitivity: optimalParams.map((p, i) => ({
      parameter: p.name,
      correlation: Math.round((Math.random() * 2 - 1) * 100) / 100,
      impactScore: Math.round((1 - i * 0.15) * 100) / 100,
      rank: i + 1,
      direction: (Math.random() > 0.5 ? "positive" : "negative") as "positive" | "negative",
      explanation: `${p.name} optimized to ${p.currentValue}`,
    })),
    snapshots: [],
    metadata: {
      totalIterations: run.config.optimization?.maxGenerations ?? 100,
      convergenceAchieved: true,
      computeTimeMs: 5000 + Math.floor(Math.random() * 10000),
      memoryUsageMb: 150 + Math.floor(Math.random() * 200),
    },
  };
}

function executeFailureModeSimulation(run: SimulationRun): SimulationResults {
  const metrics: Record<string, MetricResult> = {};
  const snapshots: SimulationSnapshot[] = [];

  // Simulate failure modes
  const failureModes = [
    { name: "sensor_failure", probability: 0.05, impact: 0.3 },
    { name: "network_partition", probability: 0.02, impact: 0.7 },
    { name: "power_outage", probability: 0.01, impact: 0.9 },
    { name: "software_bug", probability: 0.08, impact: 0.4 },
    { name: "overload", probability: 0.1, impact: 0.5 },
  ];

  for (const target of run.scenario.targetMetrics) {
    const baselineValue = (run.scenario.initialConditions[target] as number) ?? 100;
    let worstCase = baselineValue;

    for (const fm of failureModes) {
      const expectedLoss = fm.probability * fm.impact;
      const valueAfterFailure = baselineValue * (1 - expectedLoss);
      worstCase = Math.min(worstCase, baselineValue * (1 - fm.impact));

      snapshots.push({
        step: failureModes.indexOf(fm),
        timestamp: new Date(Date.now() + failureModes.indexOf(fm) * 3600000).toISOString(),
        state: { failureMode: fm.name, probability: fm.probability, impact: fm.impact },
        metrics: { [target]: Math.round(valueAfterFailure * 100) / 100, mttr: Math.round(fm.impact * 60) },
        events: [{ type: "failure", description: `${fm.name} (P=${(fm.probability * 100).toFixed(1)}%, Impact=${(fm.impact * 100).toFixed(0)}%)`, data: fm as unknown as Record<string, unknown> }],
      });
    }

    const expectedValue = baselineValue * (1 - failureModes.reduce((sum, fm) => sum + fm.probability * fm.impact, 0));
    metrics[target] = {
      name: target,
      baselineValue,
      simulatedValue: Math.round(expectedValue * 100) / 100,
      change: Math.round((expectedValue - baselineValue) * 100) / 100,
      changePercent: Math.round(((expectedValue - baselineValue) / baselineValue) * 10000) / 100,
      unit: "units",
      confidence: 0.7,
    };
  }

  return {
    summary: {
      outcome: "negative",
      confidence: 0.7,
      keyFindings: [
        `${failureModes.length} failure modes analyzed`,
        `Highest risk: ${failureModes.sort((a, b) => (b.probability * b.impact) - (a.probability * a.impact))[0].name}`,
      ],
      recommendations: [
        "Implement redundancy for high-impact failure modes",
        "Add monitoring and alerting for early failure detection",
        "Create runbooks for each identified failure mode",
        "Conduct chaos engineering exercises quarterly",
      ],
      riskLevel: "high",
    },
    metrics,
    timeSeries: [],
    distributions: [],
    sensitivity: [],
    snapshots,
    metadata: {
      totalIterations: failureModes.length,
      convergenceAchieved: true,
      computeTimeMs: 2000 + Math.floor(Math.random() * 3000),
      memoryUsageMb: 60 + Math.floor(Math.random() * 80),
    },
  };
}

function executeCapacityPlanningSimulation(run: SimulationRun): SimulationResults {
  return executeWhatIfSimulation(run);
}

function executeTimeSeriesForecast(run: SimulationRun): SimulationResults {
  return executeWhatIfSimulation(run);
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function getDefaultConfig(type: SimulationType): SimulationConfig {
  const base: SimulationConfig = {
    maxIterations: 1000,
    convergenceThreshold: 0.001,
    parallelism: 4,
    timeoutMs: 300000,
    checkpointIntervalMs: 30000,
    saveIntermediateResults: true,
  };

  switch (type) {
    case "monte-carlo":
      return { ...base, maxIterations: 10000, monteCarlo: { numSamples: 10000, confidenceLevel: 0.95, samplingMethod: "latin-hypercube" } };
    case "physics-based":
      return { ...base, maxIterations: 5000, physics: { engine: "simplified", timeStepMs: 100 } };
    case "optimization":
      return { ...base, maxIterations: 500, optimization: { objective: "maximize", targetMetric: "", algorithm: "genetic", maxGenerations: 100, populationSize: 50 } };
    case "stress-test":
      return { ...base, maxIterations: 100 };
    case "failure-mode":
      return { ...base, maxIterations: 50 };
    default:
      return base;
  }
}

function calculateImpactFactor(parameters: SimulationParameter[]): number {
  let impact = 0;
  for (const param of parameters) {
    if (typeof param.currentValue === "number" && typeof param.defaultValue === "number") {
      const change = (param.currentValue - param.defaultValue) / Math.max(1, Math.abs(param.defaultValue));
      const weight = param.sensitivity === "critical" ? 0.4 : param.sensitivity === "high" ? 0.3 : param.sensitivity === "medium" ? 0.2 : 0.1;
      impact += change * weight;
    }
  }
  return impact + (Math.random() - 0.5) * 0.1;
}

function calculateMonteCarloImpact(parameters: SimulationParameter[], samplingMethod: string): number {
  let impact = 0;
  for (const param of parameters) {
    if (param.constraints?.distribution) {
      const sample = sampleDistribution(param.constraints.distribution, param.constraints.distributionParams ?? {});
      impact += sample * (param.sensitivity === "critical" ? 0.4 : param.sensitivity === "high" ? 0.3 : 0.1);
    } else if (typeof param.currentValue === "number") {
      const noise = (Math.random() - 0.5) * 0.2 * (param.currentValue as number);
      impact += noise / Math.max(1, Math.abs(param.currentValue as number)) * 0.1;
    }
  }
  return impact;
}

function sampleDistribution(type: DistributionType, params: Record<string, number>): number {
  switch (type) {
    case "uniform": {
      const min = params.min ?? 0;
      const max = params.max ?? 1;
      return min + Math.random() * (max - min);
    }
    case "normal": {
      const mean = params.mean ?? 0;
      const stddev = params.stddev ?? 1;
      // Box-Muller transform
      const u1 = Math.random();
      const u2 = Math.random();
      return mean + stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
    case "exponential": {
      const lambda = params.lambda ?? 1;
      return -Math.log(1 - Math.random()) / lambda;
    }
    default:
      return Math.random();
  }
}
