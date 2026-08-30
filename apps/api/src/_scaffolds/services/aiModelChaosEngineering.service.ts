/**
 * Module 134: AI Model Chaos Engineering Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides chaos engineering capabilities for AI models including fault injection,
 * resilience testing, failure simulation, recovery validation, and chaos experiment
 * management to ensure model reliability under adverse conditions.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ChaosExperiment {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: ChaosExperimentStatus;
  targetModel: ChaosTarget;
  hypothesis: ChaosHypothesis;
  faults: FaultInjection[];
  steadyState: SteadyStateDefinition;
  execution: ExperimentExecution;
  results?: ChaosExperimentResults;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
}

export type ChaosExperimentStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'aborted';

export interface ChaosTarget {
  modelId: string;
  modelVersion: string;
  deploymentId?: string;
  environment: 'production' | 'staging' | 'development';
  scope: TargetScope;
}

export interface TargetScope {
  instances: string[];
  percentage: number; // 0-100
  regions?: string[];
  tags?: Record<string, string>;
}

export interface ChaosHypothesis {
  statement: string;
  steadyStateMetrics: string[];
  expectedBehavior: string;
  successCriteria: SuccessCriteria[];
}

export interface SuccessCriteria {
  metric: string;
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'within';
  threshold: number;
  tolerance?: number; // for 'within' operator
}

export interface FaultInjection {
  id: string;
  name: string;
  type: FaultType;
  configuration: FaultConfiguration;
  duration: number; // seconds
  delay: number; // seconds before injection
  target: FaultTarget;
  rollback: RollbackStrategy;
}

export type FaultType =
  | 'latency_injection'
  | 'error_injection'
  | 'resource_exhaustion'
  | 'network_partition'
  | 'instance_failure'
  | 'dependency_failure'
  | 'data_corruption'
  | 'model_corruption'
  | 'traffic_spike'
  | 'custom';

export interface FaultConfiguration {
  // Latency injection
  latencyMs?: number;
  jitterMs?: number;
  
  // Error injection
  errorRate?: number; // 0-1
  errorTypes?: string[];
  
  // Resource exhaustion
  cpuPercentage?: number;
  memoryPercentage?: number;
  
  // Network partition
  partitionedInstances?: string[];
  
  // Instance failure
  instanceCount?: number;
  
  // Traffic spike
  trafficMultiplier?: number;
  
  // Custom
  customScript?: string;
  parameters?: Record<string, any>;
}

export interface FaultTarget {
  type: 'all' | 'specific' | 'random' | 'percentage';
  instances?: string[];
  percentage?: number;
  filter?: Record<string, any>;
}

export interface RollbackStrategy {
  automatic: boolean;
  trigger: RollbackTrigger;
  actions: RollbackAction[];
}

export interface RollbackTrigger {
  type: 'timeout' | 'metric_threshold' | 'error_rate' | 'manual';
  timeout?: number; // seconds
  metricThreshold?: { metric: string; threshold: number };
}

export interface RollbackAction {
  type: 'restore_state' | 'restart_instance' | 'failover' | 'custom';
  configuration: Record<string, any>;
}

export interface SteadyStateDefinition {
  metrics: SteadyStateMetric[];
  monitoringWindow: number; // seconds
  baseline: BaselineMetrics;
}

export interface SteadyStateMetric {
  name: string;
  type: 'latency' | 'error_rate' | 'throughput' | 'availability' | 'custom';
  threshold: number;
  operator: 'lt' | 'lte' | 'gt' | 'gte';
  weight: number;
}

export interface BaselineMetrics {
  collectedAt: string;
  metrics: Record<string, number>;
  sampleSize: number;
  confidence: number;
}

export interface ExperimentExecution {
  currentPhase: ExperimentPhase;
  phases: PhaseExecution[];
  timeline: ExecutionEvent[];
  pausedAt?: string;
  pauseReason?: string;
}

export type ExperimentPhase =
  | 'baseline'
  | 'injection'
  | 'observation'
  | 'rollback'
  | 'recovery'
  | 'validation'
  | 'completed';

export interface PhaseExecution {
  phase: ExperimentPhase;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  metrics: Record<string, number>;
  events: ExecutionEvent[];
}

export interface ExecutionEvent {
  id: string;
  timestamp: string;
  type: EventType;
  phase: ExperimentPhase;
  description: string;
  metadata?: Record<string, any>;
}

export type EventType =
  | 'phase_started'
  | 'phase_completed'
  | 'fault_injected'
  | 'fault_rolled_back'
  | 'metric_collected'
  | 'alert_triggered'
  | 'recovery_detected'
  | 'manual_intervention';

export interface ChaosExperimentResults {
  hypothesisValidated: boolean;
  steadyStateMaintained: boolean;
  faultImpact: FaultImpact;
  resilienceScore: ResilienceScore;
  recoveryAnalysis: RecoveryAnalysis;
  findings: ExperimentFinding[];
  recommendations: ChaosRecommendation[];
  completedAt: string;
}

export interface FaultImpact {
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedInstances: number;
  affectedRequests: number;
  downtime: number; // seconds
  errorRate: number;
  latencyIncrease: number; // percentage
  throughputDecrease: number; // percentage
}

export interface ResilienceScore {
  overall: number; // 0-100
  categories: ResilienceCategory[];
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  interpretation: string;
}

export interface ResilienceCategory {
  name: string;
  score: number;
  weight: number;
  metrics: string[];
}

export interface RecoveryAnalysis {
  recoveryTime: number; // seconds
  recoveryType: 'automatic' | 'manual' | 'partial' | 'none';
  recoverySteps: RecoveryStep[];
  recoverySuccess: boolean;
  timeToDetect: number; // seconds
  timeToRespond: number; // seconds
  timeToRecover: number; // seconds
}

export interface RecoveryStep {
  order: number;
  action: string;
  timestamp: string;
  duration: number;
  success: boolean;
  automated: boolean;
}

export interface ExperimentFinding {
  id: string;
  type: 'strength' | 'weakness' | 'observation';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  evidence: string[];
  impact: string;
}

export interface ChaosRecommendation {
  priority: 'high' | 'medium' | 'low';
  category: 'architecture' | 'monitoring' | 'automation' | 'process';
  title: string;
  description: string;
  actionItems: string[];
  expectedImprovement: string;
  effort: 'low' | 'medium' | 'high';
}

export interface ChaosExperimentTemplate {
  id: string;
  name: string;
  description: string;
  faultType: FaultType;
  defaultConfiguration: Partial<FaultConfiguration>;
  useCases: string[];
  risks: string[];
  prerequisites: string[];
}

export interface ChaosGameDay {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: GameDayStatus;
  scheduledDate: string;
  experiments: string[]; // experiment IDs
  participants: GameDayParticipant[];
  objectives: string[];
  results?: GameDayResults;
  createdAt: string;
  updatedAt: string;
}

export type GameDayStatus =
  | 'planning'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface GameDayParticipant {
  userId: string;
  userName: string;
  role: 'organizer' | 'observer' | 'responder';
  team?: string;
}

export interface GameDayResults {
  experimentsRun: number;
  experimentsSucceeded: number;
  experimentsFailed: number;
  findings: ExperimentFinding[];
  recommendations: ChaosRecommendation[];
  lessonsLearned: string[];
  completedAt: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const chaosExperiments = new Map<string, ChaosExperiment>();
const chaosTemplates = new Map<string, ChaosExperimentTemplate>();
const chaosGameDays = new Map<string, ChaosGameDay>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculateResilienceScore(
  faultImpact: FaultImpact,
  recoveryAnalysis: RecoveryAnalysis,
  steadyStateMaintained: boolean
): ResilienceScore {
  const categories: ResilienceCategory[] = [
    {
      name: 'Fault Tolerance',
      score: faultImpact.severity === 'low' ? 100
        : faultImpact.severity === 'medium' ? 75
        : faultImpact.severity === 'high' ? 50
        : 25,
      weight: 0.3,
      metrics: ['affectedInstances', 'errorRate'],
    },
    {
      name: 'Recovery Speed',
      score: recoveryAnalysis.recoveryTime < 60 ? 100
        : recoveryAnalysis.recoveryTime < 300 ? 80
        : recoveryAnalysis.recoveryTime < 600 ? 60
        : 40,
      weight: 0.3,
      metrics: ['recoveryTime', 'timeToRecover'],
    },
    {
      name: 'Detection Speed',
      score: recoveryAnalysis.timeToDetect < 30 ? 100
        : recoveryAnalysis.timeToDetect < 120 ? 80
        : recoveryAnalysis.timeToDetect < 300 ? 60
        : 40,
      weight: 0.2,
      metrics: ['timeToDetect'],
    },
    {
      name: 'Steady State Maintenance',
      score: steadyStateMaintained ? 100 : 50,
      weight: 0.2,
      metrics: ['latencyIncrease', 'throughputDecrease'],
    },
  ];

  const overall = categories.reduce((sum, cat) => sum + (cat.score * cat.weight), 0);

  const grade = overall >= 90 ? 'A'
    : overall >= 80 ? 'B'
    : overall >= 70 ? 'C'
    : overall >= 60 ? 'D'
    : 'F';

  const interpretation = grade === 'A' ? 'Excellent resilience - system handles faults gracefully'
    : grade === 'B' ? 'Good resilience - minor issues during faults'
    : grade === 'C' ? 'Fair resilience - significant impact but recovers'
    : grade === 'D' ? 'Poor resilience - major issues and slow recovery'
    : 'Critical - system fails to handle faults adequately';

  return { overall, categories, grade, interpretation };
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createChaosExperiment(params: {
  organizationId: string;
  name: string;
  description?: string;
  targetModel: ChaosTarget;
  hypothesis: ChaosHypothesis;
  faults: Omit<FaultInjection, 'id'>[];
  steadyState: SteadyStateDefinition;
  createdBy: string;
}): ChaosExperiment {
  const now = new Date().toISOString();
  const id = randomUUID();

  const faults: FaultInjection[] = params.faults.map(f => ({
    ...f,
    id: randomUUID(),
  }));

  const experiment: ChaosExperiment = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'draft',
    targetModel: params.targetModel,
    hypothesis: params.hypothesis,
    faults,
    steadyState: params.steadyState,
    execution: {
      currentPhase: 'baseline',
      phases: [
        { phase: 'baseline', status: 'pending', metrics: {}, events: [] },
        { phase: 'injection', status: 'pending', metrics: {}, events: [] },
        { phase: 'observation', status: 'pending', metrics: {}, events: [] },
        { phase: 'rollback', status: 'pending', metrics: {}, events: [] },
        { phase: 'recovery', status: 'pending', metrics: {}, events: [] },
        { phase: 'validation', status: 'pending', metrics: {}, events: [] },
        { phase: 'completed', status: 'pending', metrics: {}, events: [] },
      ],
      timeline: [],
    },
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  chaosExperiments.set(id, experiment);
  return experiment;
}

export function getChaosExperiment(id: string): ChaosExperiment | undefined {
  return chaosExperiments.get(id);
}

export function listChaosExperiments(
  organizationId: string,
  filters?: { status?: ChaosExperimentStatus; modelId?: string }
): ChaosExperiment[] {
  let result = Array.from(chaosExperiments.values()).filter(
    e => e.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(e => e.status === filters.status);
  if (filters?.modelId) result = result.filter(e => e.targetModel.modelId === filters.modelId);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function prepareChaosExperiment(experimentId: string): ChaosExperiment {
  const experiment = chaosExperiments.get(experimentId);
  if (!experiment) throw new Error(`Chaos experiment ${experimentId} not found`);

  if (experiment.status !== 'draft') {
    throw new Error('Experiment can only be prepared from draft status');
  }

  // Validate experiment configuration
  if (experiment.faults.length === 0) {
    throw new Error('At least one fault must be defined');
  }

  if (experiment.steadyState.metrics.length === 0) {
    throw new Error('At least one steady state metric must be defined');
  }

  experiment.status = 'ready';
  experiment.updatedAt = new Date().toISOString();

  return experiment;
}

export function startChaosExperiment(experimentId: string): ChaosExperiment {
  const experiment = chaosExperiments.get(experimentId);
  if (!experiment) throw new Error(`Chaos experiment ${experimentId} not found`);

  if (experiment.status !== 'ready') {
    throw new Error('Experiment must be in ready status to start');
  }

  const now = new Date().toISOString();

  experiment.status = 'running';
  experiment.startedAt = now;
  experiment.execution.currentPhase = 'baseline';

  const baselinePhase = experiment.execution.phases.find(p => p.phase === 'baseline');
  if (baselinePhase) {
    baselinePhase.status = 'running';
    baselinePhase.startedAt = now;
  }

  experiment.execution.timeline.push({
    id: randomUUID(),
    timestamp: now,
    type: 'phase_started',
    phase: 'baseline',
    description: 'Started baseline measurement phase',
  });

  experiment.updatedAt = now;

  return experiment;
}

export function progressChaosExperiment(experimentId: string): ChaosExperiment {
  const experiment = chaosExperiments.get(experimentId);
  if (!experiment) throw new Error(`Chaos experiment ${experimentId} not found`);

  if (experiment.status !== 'running') {
    throw new Error('Experiment must be running to progress');
  }

  const now = new Date().toISOString();
  const currentPhaseIndex = experiment.execution.phases.findIndex(
    p => p.phase === experiment.execution.currentPhase
  );

  // Complete current phase
  const currentPhase = experiment.execution.phases[currentPhaseIndex];
  if (currentPhase) {
    currentPhase.status = 'completed';
    currentPhase.completedAt = now;
    currentPhase.duration = currentPhase.startedAt
      ? (new Date(now).getTime() - new Date(currentPhase.startedAt).getTime()) / 1000
      : 0;

    experiment.execution.timeline.push({
      id: randomUUID(),
      timestamp: now,
      type: 'phase_completed',
      phase: experiment.execution.currentPhase,
      description: `Completed ${experiment.execution.currentPhase} phase`,
    });
  }

  // Move to next phase
  const nextPhaseIndex = currentPhaseIndex + 1;
  if (nextPhaseIndex < experiment.execution.phases.length) {
    const nextPhase = experiment.execution.phases[nextPhaseIndex];
    nextPhase.status = 'running';
    nextPhase.startedAt = now;
    experiment.execution.currentPhase = nextPhase.phase;

    experiment.execution.timeline.push({
      id: randomUUID(),
      timestamp: now,
      type: 'phase_started',
      phase: nextPhase.phase,
      description: `Started ${nextPhase.phase} phase`,
    });

    // Inject fault if entering injection phase
    if (nextPhase.phase === 'injection') {
      for (const fault of experiment.faults) {
        experiment.execution.timeline.push({
          id: randomUUID(),
          timestamp: now,
          type: 'fault_injected',
          phase: 'injection',
          description: `Injected fault: ${fault.name}`,
          metadata: { faultId: fault.id, faultType: fault.type },
        });
      }
    }
  } else {
    // All phases completed
    experiment.status = 'completed';
    experiment.completedAt = now;
    experiment.results = generateExperimentResults(experiment);
  }

  experiment.updatedAt = now;
  return experiment;
}

function generateExperimentResults(experiment: ChaosExperiment): ChaosExperimentResults {
  const now = new Date().toISOString();

  // Simulate fault impact
  const faultImpact: FaultImpact = {
    severity: 'medium',
    affectedInstances: 3,
    affectedRequests: 150,
    downtime: 45,
    errorRate: 0.15,
    latencyIncrease: 25,
    throughputDecrease: 20,
  };

  // Simulate recovery analysis
  const recoveryAnalysis: RecoveryAnalysis = {
    recoveryTime: 120,
    recoveryType: 'automatic',
    recoverySteps: [
      {
        order: 1,
        action: 'Fault detected by monitoring system',
        timestamp: now,
        duration: 5,
        success: true,
        automated: true,
      },
      {
        order: 2,
        action: 'Automatic rollback triggered',
        timestamp: now,
        duration: 15,
        success: true,
        automated: true,
      },
      {
        order: 3,
        action: 'System recovery initiated',
        timestamp: now,
        duration: 60,
        success: true,
        automated: true,
      },
      {
        order: 4,
        action: 'Steady state validation',
        timestamp: now,
        duration: 40,
        success: true,
        automated: true,
      },
    ],
    recoverySuccess: true,
    timeToDetect: 5,
    timeToRespond: 15,
    timeToRecover: 100,
  };

  const steadyStateMaintained = faultImpact.latencyIncrease < 50 && faultImpact.errorRate < 0.2;
  const resilienceScore = calculateResilienceScore(faultImpact, recoveryAnalysis, steadyStateMaintained);

  // Validate hypothesis
  const hypothesisValidated = steadyStateMaintained && recoveryAnalysis.recoverySuccess;

  const findings: ExperimentFinding[] = [
    {
      id: randomUUID(),
      type: 'strength',
      severity: 'info',
      title: 'Automatic Recovery',
      description: 'System successfully recovered automatically without manual intervention',
      evidence: ['Recovery completed in 120 seconds', 'All recovery steps succeeded'],
      impact: 'Reduced mean time to recovery (MTTR)',
    },
    {
      id: randomUUID(),
      type: 'weakness',
      severity: 'warning',
      title: 'Detection Latency',
      description: 'Fault detection took 5 seconds, which could be improved',
      evidence: ['Time to detect: 5 seconds'],
      impact: 'Delayed detection increases user impact',
    },
  ];

  const recommendations: ChaosRecommendation[] = [
    {
      priority: 'medium',
      category: 'monitoring',
      title: 'Improve Fault Detection Speed',
      description: 'Reduce time to detect faults from 5 seconds to under 2 seconds',
      actionItems: [
        'Increase monitoring frequency',
        'Add more sensitive alert thresholds',
        'Implement predictive anomaly detection',
      ],
      expectedImprovement: 'Reduce time to detect by 60%',
      effort: 'medium',
    },
    {
      priority: 'low',
      category: 'automation',
      title: 'Enhance Recovery Automation',
      description: 'Add more automated recovery steps to reduce manual intervention',
      actionItems: [
        'Implement automated scaling',
        'Add circuit breaker patterns',
        'Automate failover procedures',
      ],
      expectedImprovement: 'Reduce recovery time by 30%',
      effort: 'high',
    },
  ];

  return {
    hypothesisValidated,
    steadyStateMaintained,
    faultImpact,
    resilienceScore,
    recoveryAnalysis,
    findings,
    recommendations,
    completedAt: now,
  };
}

export function pauseChaosExperiment(experimentId: string, reason: string): ChaosExperiment {
  const experiment = chaosExperiments.get(experimentId);
  if (!experiment) throw new Error(`Chaos experiment ${experimentId} not found`);

  if (experiment.status !== 'running') {
    throw new Error('Experiment must be running to pause');
  }

  const now = new Date().toISOString();

  experiment.status = 'paused';
  experiment.execution.pausedAt = now;
  experiment.execution.pauseReason = reason;

  experiment.execution.timeline.push({
    id: randomUUID(),
    timestamp: now,
    type: 'manual_intervention',
    phase: experiment.execution.currentPhase,
    description: `Experiment paused: ${reason}`,
  });

  experiment.updatedAt = now;
  return experiment;
}

export function resumeChaosExperiment(experimentId: string): ChaosExperiment {
  const experiment = chaosExperiments.get(experimentId);
  if (!experiment) throw new Error(`Chaos experiment ${experimentId} not found`);

  if (experiment.status !== 'paused') {
    throw new Error('Experiment must be paused to resume');
  }

  const now = new Date().toISOString();

  experiment.status = 'running';
  experiment.execution.pausedAt = undefined;
  experiment.execution.pauseReason = undefined;

  experiment.execution.timeline.push({
    id: randomUUID(),
    timestamp: now,
    type: 'manual_intervention',
    phase: experiment.execution.currentPhase,
    description: 'Experiment resumed',
  });

  experiment.updatedAt = now;
  return experiment;
}

export function abortChaosExperiment(experimentId: string, reason: string): ChaosExperiment {
  const experiment = chaosExperiments.get(experimentId);
  if (!experiment) throw new Error(`Chaos experiment ${experimentId} not found`);

  if (experiment.status === 'completed' || experiment.status === 'aborted') {
    throw new Error('Cannot abort completed or already aborted experiment');
  }

  const now = new Date().toISOString();

  experiment.status = 'aborted';
  experiment.completedAt = now;

  experiment.execution.timeline.push({
    id: randomUUID(),
    timestamp: now,
    type: 'manual_intervention',
    phase: experiment.execution.currentPhase,
    description: `Experiment aborted: ${reason}`,
  });

  // Rollback any active faults
  for (const fault of experiment.faults) {
    if (fault.rollback.automatic) {
      experiment.execution.timeline.push({
        id: randomUUID(),
        timestamp: now,
        type: 'fault_rolled_back',
        phase: 'rollback',
        description: `Rolled back fault: ${fault.name}`,
        metadata: { faultId: fault.id },
      });
    }
  }

  experiment.updatedAt = now;
  return experiment;
}

export function createChaosTemplate(params: {
  name: string;
  description: string;
  faultType: FaultType;
  defaultConfiguration?: Partial<FaultConfiguration>;
  useCases: string[];
  risks: string[];
  prerequisites: string[];
}): ChaosExperimentTemplate {
  const id = randomUUID();

  const template: ChaosExperimentTemplate = {
    id,
    name: params.name,
    description: params.description,
    faultType: params.faultType,
    defaultConfiguration: params.defaultConfiguration || {},
    useCases: params.useCases,
    risks: params.risks,
    prerequisites: params.prerequisites,
  };

  chaosTemplates.set(id, template);
  return template;
}

export function getChaosTemplate(id: string): ChaosExperimentTemplate | undefined {
  return chaosTemplates.get(id);
}

export function listChaosTemplates(filters?: { faultType?: FaultType }): ChaosExperimentTemplate[] {
  let result = Array.from(chaosTemplates.values());

  if (filters?.faultType) {
    result = result.filter(t => t.faultType === filters.faultType);
  }

  return result;
}

export function createChaosGameDay(params: {
  organizationId: string;
  name: string;
  description?: string;
  scheduledDate: string;
  experiments: string[];
  participants: GameDayParticipant[];
  objectives: string[];
}): ChaosGameDay {
  const now = new Date().toISOString();
  const id = randomUUID();

  const gameDay: ChaosGameDay = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'planning',
    scheduledDate: params.scheduledDate,
    experiments: params.experiments,
    participants: params.participants,
    objectives: params.objectives,
    createdAt: now,
    updatedAt: now,
  };

  chaosGameDays.set(id, gameDay);
  return gameDay;
}

export function getChaosGameDay(id: string): ChaosGameDay | undefined {
  return chaosGameDays.get(id);
}

export function listChaosGameDays(
  organizationId: string,
  filters?: { status?: GameDayStatus }
): ChaosGameDay[] {
  let result = Array.from(chaosGameDays.values()).filter(
    g => g.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(g => g.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function startChaosGameDay(gameDayId: string): ChaosGameDay {
  const gameDay = chaosGameDays.get(gameDayId);
  if (!gameDay) throw new Error(`Chaos game day ${gameDayId} not found`);

  if (gameDay.status !== 'scheduled') {
    throw new Error('Game day must be scheduled to start');
  }

  gameDay.status = 'in_progress';
  gameDay.updatedAt = new Date().toISOString();

  return gameDay;
}

export function completeChaosGameDay(gameDayId: string): ChaosGameDay {
  const gameDay = chaosGameDays.get(gameDayId);
  if (!gameDay) throw new Error(`Chaos game day ${gameDayId} not found`);

  if (gameDay.status !== 'in_progress') {
    throw new Error('Game day must be in progress to complete');
  }

  const now = new Date().toISOString();

  // Aggregate results from all experiments
  const experimentResults = gameDay.experiments
    .map(id => chaosExperiments.get(id))
    .filter((e): e is ChaosExperiment => e !== undefined && e.results !== undefined);

  const allFindings = experimentResults.flatMap(e => e.results!.findings);
  const allRecommendations = experimentResults.flatMap(e => e.results!.recommendations);

  const lessonsLearned = [
    'Regular chaos testing improves system resilience',
    'Automated recovery reduces mean time to recovery',
    'Monitoring and alerting are critical for quick detection',
  ];

  gameDay.status = 'completed';
  gameDay.results = {
    experimentsRun: experimentResults.length,
    experimentsSucceeded: experimentResults.filter(e => e.results!.hypothesisValidated).length,
    experimentsFailed: experimentResults.filter(e => !e.results!.hypothesisValidated).length,
    findings: allFindings,
    recommendations: allRecommendations,
    lessonsLearned,
    completedAt: now,
  };

  gameDay.updatedAt = now;
  return gameDay;
}

export function cancelChaosGameDay(gameDayId: string): ChaosGameDay {
  const gameDay = chaosGameDays.get(gameDayId);
  if (!gameDay) throw new Error(`Chaos game day ${gameDayId} not found`);

  if (gameDay.status === 'completed' || gameDay.status === 'cancelled') {
    throw new Error('Cannot cancel completed or already cancelled game day');
  }

  gameDay.status = 'cancelled';
  gameDay.updatedAt = new Date().toISOString();

  return gameDay;
}

export function getExperimentTimeline(experimentId: string): ExecutionEvent[] {
  const experiment = chaosExperiments.get(experimentId);
  if (!experiment) throw new Error(`Chaos experiment ${experimentId} not found`);

  return experiment.execution.timeline;
}

export function getExperimentPhaseMetrics(
  experimentId: string,
  phase: ExperimentPhase
): Record<string, number> {
  const experiment = chaosExperiments.get(experimentId);
  if (!experiment) throw new Error(`Chaos experiment ${experimentId} not found`);

  const phaseExecution = experiment.execution.phases.find(p => p.phase === phase);
  return phaseExecution?.metrics || {};
}
