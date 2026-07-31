/**
 * Module 102: AI Self-Healing Workflows Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides self-healing capabilities for AI platform components including
 * automated health checks, failure detection, recovery workflows, circuit
 * breakers, and resilience patterns for high-availability AI systems.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SelfHealingWorkflow {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  target: HealingTarget;
  healthChecks: HealthCheck[];
  recoveryStrategies: RecoveryStrategy[];
  circuitBreaker?: CircuitBreaker;
  metrics: HealingMetrics;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowStatus = 'active' | 'paused' | 'disabled' | 'recovering';

export interface HealingTarget {
  type: 'model' | 'service' | 'infrastructure' | 'pipeline';
  id: string;
  name: string;
  criticality: 'critical' | 'high' | 'medium' | 'low';
}

export interface HealthCheck {
  id: string;
  name: string;
  type: HealthCheckType;
  interval: number; // seconds
  timeout: number; // seconds
  threshold: HealthThreshold;
  lastCheck?: HealthCheckResult;
  enabled: boolean;
}

export type HealthCheckType =
  | 'http_endpoint'
  | 'tcp_port'
  | 'model_inference'
  | 'resource_utilization'
  | 'data_quality'
  | 'custom_script';

export interface HealthThreshold {
  healthy: number;
  degraded: number;
  unhealthy: number;
  metric: 'success_rate' | 'latency' | 'error_rate' | 'availability';
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  duration: number;
  metrics: Record<string, number>;
  error?: string;
}

export interface RecoveryStrategy {
  id: string;
  name: string;
  type: RecoveryType;
  priority: number;
  conditions: RecoveryCondition[];
  actions: RecoveryAction[];
  maxAttempts: number;
  cooldownMinutes: number;
  lastAttempt?: RecoveryAttempt;
}

export type RecoveryType =
  | 'restart'
  | 'scale_up'
  | 'failover'
  | 'rollback'
  | 'retrain'
  | 'clear_state'
  | 'switch_model'
  | 'custom';

export interface RecoveryCondition {
  healthStatus: 'degraded' | 'unhealthy';
  consecutiveFailures: number;
  duration?: number; // seconds
}

export interface RecoveryAction {
  type: string;
  config: Record<string, any>;
  timeout: number;
  validateAfter: boolean;
}

export interface RecoveryAttempt {
  id: string;
  strategyId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  success: boolean;
  error?: string;
  metricsBefore?: Record<string, number>;
  metricsAfter?: Record<string, number>;
}

export interface CircuitBreaker {
  id: string;
  state: 'closed' | 'open' | 'half_open';
  failureThreshold: number;
  successThreshold: number;
  timeoutSeconds: number;
  failures: number;
  successes: number;
  lastFailureAt?: string;
  lastStateChange: string;
  config: CircuitBreakerConfig;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutSeconds: number;
  monitoringWindowSeconds: number;
}

export interface HealingMetrics {
  totalHealthChecks: number;
  successfulChecks: number;
  failedChecks: number;
  recoveryAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  meanTimeToRecovery: number; // seconds
  availability: number; // percentage
  lastIncidentAt?: string;
  incidentsLast24h: number;
}

export interface HealingIncident {
  id: string;
  workflowId: string;
  organizationId: string;
  target: HealingTarget;
  status: 'detected' | 'recovering' | 'recovered' | 'failed';
  detectedAt: string;
  recoveredAt?: string;
  duration?: number;
  healthChecksFailed: HealthCheckResult[];
  recoveryAttempts: RecoveryAttempt[];
  rootCause?: string;
  resolution?: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const selfHealingWorkflows = new Map<string, SelfHealingWorkflow>();
const healingIncidents = new Map<string, HealingIncident>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createSelfHealingWorkflow(params: {
  organizationId: string;
  name: string;
  description?: string;
  target: HealingTarget;
  healthChecks: Omit<HealthCheck, 'id'>[];
  recoveryStrategies: Omit<RecoveryStrategy, 'id' | 'lastAttempt'>[];
  circuitBreaker?: Omit<CircuitBreaker, 'id' | 'state' | 'failures' | 'successes' | 'lastStateChange'>;
}): SelfHealingWorkflow {
  const now = new Date().toISOString();
  const id = randomUUID();

  const workflow: SelfHealingWorkflow = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'active',
    target: params.target,
    healthChecks: params.healthChecks.map(hc => ({ ...hc, id: randomUUID(), enabled: true })),
    recoveryStrategies: params.recoveryStrategies.map(rs => ({ ...rs, id: randomUUID() })),
    metrics: {
      totalHealthChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      recoveryAttempts: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      meanTimeToRecovery: 0,
      availability: 100,
      incidentsLast24h: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  if (params.circuitBreaker) {
    workflow.circuitBreaker = {
      ...params.circuitBreaker,
      id: randomUUID(),
      state: 'closed',
      failures: 0,
      successes: 0,
      lastStateChange: now,
    };
  }

  selfHealingWorkflows.set(id, workflow);
  return workflow;
}

export function getSelfHealingWorkflow(id: string): SelfHealingWorkflow | undefined {
  return selfHealingWorkflows.get(id);
}

export function listSelfHealingWorkflows(organizationId: string): SelfHealingWorkflow[] {
  return Array.from(selfHealingWorkflows.values()).filter(w => w.organizationId === organizationId);
}

export function pauseSelfHealingWorkflow(workflowId: string): SelfHealingWorkflow {
  const workflow = selfHealingWorkflows.get(workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

  workflow.status = 'paused';
  workflow.updatedAt = new Date().toISOString();
  return workflow;
}

export function activateSelfHealingWorkflow(workflowId: string): SelfHealingWorkflow {
  const workflow = selfHealingWorkflows.get(workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

  workflow.status = 'active';
  workflow.updatedAt = new Date().toISOString();
  return workflow;
}

export function executeHealthCheck(
  workflowId: string,
  healthCheckId: string
): HealthCheckResult {
  const workflow = selfHealingWorkflows.get(workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

  const healthCheck = workflow.healthChecks.find(hc => hc.id === healthCheckId);
  if (!healthCheck) throw new Error(`Health check ${healthCheckId} not found`);

  const now = new Date().toISOString();
  
  // Simulate health check execution
  const successRate = 0.95 + Math.random() * 0.05; // 95-100%
  const latency = 50 + Math.random() * 200; // 50-250ms

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (successRate < healthCheck.threshold.healthy) {
    status = successRate < healthCheck.threshold.degraded ? 'unhealthy' : 'degraded';
  }

  const result: HealthCheckResult = {
    status,
    timestamp: now,
    duration: latency,
    metrics: {
      success_rate: successRate * 100,
      latency,
      availability: successRate * 100,
    },
  };

  if (status === 'unhealthy') {
    result.error = 'Health check failed: threshold exceeded';
  }

  healthCheck.lastCheck = result;
  workflow.metrics.totalHealthChecks += 1;
  if (status === 'healthy') {
    workflow.metrics.successfulChecks += 1;
  } else {
    workflow.metrics.failedChecks += 1;
  }

  // Check if recovery is needed
  if (status === 'unhealthy') {
    checkAndTriggerRecovery(workflow, result);
  }

  workflow.updatedAt = now;
  return result;
}

function checkAndTriggerRecovery(
  workflow: SelfHealingWorkflow,
  failedCheck: HealthCheckResult
): void {
  // Check circuit breaker
  if (workflow.circuitBreaker) {
    workflow.circuitBreaker.failures += 1;
    workflow.circuitBreaker.lastFailureAt = failedCheck.timestamp;

    if (workflow.circuitBreaker.failures >= workflow.circuitBreaker.failureThreshold) {
      workflow.circuitBreaker.state = 'open';
      workflow.circuitBreaker.lastStateChange = failedCheck.timestamp;
    }
  }

  // Find applicable recovery strategy
  const strategy = workflow.recoveryStrategies
    .filter(rs => {
      const condition = rs.conditions[0];
      return condition.healthStatus === failedCheck.status;
    })
    .sort((a, b) => a.priority - b.priority)[0];

  if (strategy) {
    executeRecoveryStrategy(workflow, strategy, failedCheck);
  }
}

function executeRecoveryStrategy(
  workflow: SelfHealingWorkflow,
  strategy: RecoveryStrategy,
  failedCheck: HealthCheckResult
): void {
  const now = new Date().toISOString();

  const attempt: RecoveryAttempt = {
    id: randomUUID(),
    strategyId: strategy.id,
    status: 'running',
    startedAt: now,
    success: false,
    metricsBefore: failedCheck.metrics,
  };

  strategy.lastAttempt = attempt;
  workflow.status = 'recovering';
  workflow.metrics.recoveryAttempts += 1;

  // Create incident
  const incident: HealingIncident = {
    id: randomUUID(),
    workflowId: workflow.id,
    organizationId: workflow.organizationId,
    target: workflow.target,
    status: 'recovering',
    detectedAt: failedCheck.timestamp,
    healthChecksFailed: [failedCheck],
    recoveryAttempts: [attempt],
  };

  healingIncidents.set(incident.id, incident);

  // Simulate recovery
  setTimeout(() => {
    const success = Math.random() > 0.2; // 80% success rate
    attempt.status = success ? 'completed' : 'failed';
    attempt.completedAt = new Date().toISOString();
    attempt.duration = new Date(attempt.completedAt).getTime() - new Date(attempt.startedAt).getTime();
    attempt.success = success;
    attempt.metricsAfter = {
      success_rate: success ? 99.5 : 85,
      latency: success ? 100 : 300,
      availability: success ? 99.5 : 85,
    };

    if (success) {
      workflow.status = 'active';
      workflow.metrics.successfulRecoveries += 1;
      incident.status = 'recovered';
      incident.recoveredAt = attempt.completedAt;
      incident.duration = attempt.duration;
      incident.resolution = `Successfully recovered using ${strategy.type} strategy`;

      // Reset circuit breaker on success
      if (workflow.circuitBreaker) {
        workflow.circuitBreaker.state = 'closed';
        workflow.circuitBreaker.failures = 0;
        workflow.circuitBreaker.lastStateChange = attempt.completedAt;
      }
    } else {
      workflow.metrics.failedRecoveries += 1;
      incident.status = 'failed';
      attempt.error = 'Recovery strategy failed to restore service';
    }

    workflow.updatedAt = attempt.completedAt;
  }, 100);
}

export function getHealingIncidents(
  organizationId: string,
  filters?: { workflowId?: string; status?: string }
): HealingIncident[] {
  let incidents = Array.from(healingIncidents.values()).filter(
    i => i.organizationId === organizationId
  );

  if (filters?.workflowId) incidents = incidents.filter(i => i.workflowId === filters.workflowId);
  if (filters?.status) incidents = incidents.filter(i => i.status === filters.status);

  return incidents.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

export function getHealingMetrics(workflowId: string): HealingMetrics {
  const workflow = selfHealingWorkflows.get(workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
  return workflow.metrics;
}

export function getCircuitBreakerState(workflowId: string): CircuitBreaker | undefined {
  const workflow = selfHealingWorkflows.get(workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
  return workflow.circuitBreaker;
}

export function resetCircuitBreaker(workflowId: string): CircuitBreaker {
  const workflow = selfHealingWorkflows.get(workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
  if (!workflow.circuitBreaker) throw new Error(`Workflow ${workflowId} has no circuit breaker`);

  const now = new Date().toISOString();
  workflow.circuitBreaker.state = 'closed';
  workflow.circuitBreaker.failures = 0;
  workflow.circuitBreaker.successes = 0;
  workflow.circuitBreaker.lastStateChange = now;
  workflow.updatedAt = now;

  return workflow.circuitBreaker;
}

export function updateHealthCheck(
  workflowId: string,
  healthCheckId: string,
  updates: Partial<HealthCheck>
): HealthCheck {
  const workflow = selfHealingWorkflows.get(workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

  const healthCheck = workflow.healthChecks.find(hc => hc.id === healthCheckId);
  if (!healthCheck) throw new Error(`Health check ${healthCheckId} not found`);

  Object.assign(healthCheck, updates);
  workflow.updatedAt = new Date().toISOString();
  return healthCheck;
}

export function addRecoveryStrategy(
  workflowId: string,
  strategy: Omit<RecoveryStrategy, 'id' | 'lastAttempt'>
): RecoveryStrategy {
  const workflow = selfHealingWorkflows.get(workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

  const newStrategy: RecoveryStrategy = {
    ...strategy,
    id: randomUUID(),
  };

  workflow.recoveryStrategies.push(newStrategy);
  workflow.updatedAt = new Date().toISOString();
  return newStrategy;
}
