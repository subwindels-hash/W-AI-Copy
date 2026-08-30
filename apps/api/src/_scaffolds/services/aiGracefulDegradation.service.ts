/**
 * Module 59: AI Graceful Degradation Service
 *
 * Provides intelligent graceful degradation for AI systems including fallback model
 * chains with quality-aware selection, degraded mode management, fallback response
 * generation (cached responses, rule-based fallbacks, simplified models), quality
 * preservation strategies, degradation event tracking, and automatic recovery.
 *
 * Phase 1 — Critical Gap: AI-specific graceful degradation and fallback management
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiGracefulDegradation');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type DegradationLevel = "none" | "minimal" | "moderate" | "severe" | "critical";

export type DegradationStatus = "healthy" | "degraded" | "recovering" | "failed";

export type FallbackStrategy = "fallback-model" | "cached-response" | "rule-based" | "simplified-model" | "static-response" | "queue-and-retry";

export type DegradationTrigger = "circuit-breaker" | "latency-threshold" | "error-rate" | "resource-exhaustion" | "manual" | "dependency-failure";

export type RecoveryStrategy = "automatic" | "manual" | "gradual" | "immediate";

export interface DegradationPolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  targetModel: DegradationTarget;
  status: DegradationStatus;
  currentLevel: DegradationLevel;
  fallbackChain: FallbackModel[];
  degradationRules: DegradationRule[];
  qualityThresholds: QualityThresholds;
  recoveryConfig: RecoveryConfig;
  cachedResponses: CachedResponse[];
  degradationHistory: DegradationEvent[];
  activeFallback?: ActiveFallback;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DegradationTarget {
  modelId: string;
  modelName: string;
  deploymentId: string;
  endpoint: string;
  circuitBreakerId?: string;
}

export interface FallbackModel {
  id: string;
  modelId: string;
  modelName: string;
  endpoint: string;
  priority: number;
  qualityScore: number;
  latencyMs: number;
  costPerRequest: number;
  maxConcurrentRequests: number;
  capabilities: string[];
  limitations: string[];
  enabled: boolean;
}

export interface DegradationRule {
  id: string;
  trigger: DegradationTrigger;
  condition: DegradationCondition;
  targetLevel: DegradationLevel;
  strategy: FallbackStrategy;
  fallbackModelId?: string;
  actions: DegradationAction[];
  priority: number;
  enabled: boolean;
}

export interface DegradationCondition {
  metric: string;
  operator: "gt" | "gte" | "lt" | "lte" | "eq";
  threshold: number;
  windowSeconds: number;
  consecutiveOccurrences: number;
}

export interface DegradationAction {
  type: "switch-model" | "enable-cache" | "reduce-quality" | "limit-features" | "queue-requests" | "notify" | "scale-up";
  config: Record<string, unknown>;
}

export interface QualityThresholds {
  minimumAcceptableQuality: number;
  degradedQualityTarget: number;
  qualityMetrics: QualityMetric[];
  maxDegradationDurationMinutes: number;
  autoRecoveryEnabled: boolean;
}

export interface QualityMetric {
  name: string;
  metricPath: string;
  baselineValue: number;
  minimumAcceptable: number;
  weight: number;
  higherIsBetter: boolean;
}

export interface RecoveryConfig {
  strategy: RecoveryStrategy;
  healthCheckIntervalSeconds: number;
  recoveryThreshold: number;
  gradualRecoverySteps: Array<{ level: DegradationLevel; durationSeconds: number; qualityTarget: number }>;
  maxRecoveryAttempts: number;
  cooldownSeconds: number;
}

export interface CachedResponse {
  id: string;
  inputHash: string;
  inputPattern: string;
  response: Record<string, unknown>;
  qualityScore: number;
  ttl: number;
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  expiresAt: string;
}

export interface DegradationEvent {
  id: string;
  timestamp: string;
  trigger: DegradationTrigger;
  fromLevel: DegradationLevel;
  toLevel: DegradationLevel;
  strategy: FallbackStrategy;
  reason: string;
  metricsSnapshot: Record<string, number>;
  activeFallbackId?: string;
  recoveredAt?: string;
  durationMinutes?: number;
}

export interface ActiveFallback {
  id: string;
  strategy: FallbackStrategy;
  fallbackModelId?: string;
  fallbackModelName?: string;
  qualityScore: number;
  startedAt: string;
  requestsServed: number;
  averageLatencyMs: number;
  qualityImpact: number;
}

export interface DegradationResponse {
  originalModelId: string;
  servedBy: string;
  fallbackUsed: boolean;
  strategy?: FallbackStrategy;
  qualityScore: number;
  qualityImpact: number;
  response: Record<string, unknown>;
  latencyMs: number;
  degradationLevel: DegradationLevel;
}

export interface DegradationStats {
  totalPolicies: number;
  degradedPolicies: number;
  healthyPolicies: number;
  totalDegradationEvents: number;
  averageDegradationDurationMinutes: number;
  totalFallbackRequests: number;
  averageQualityScore: number;
  eventsByTrigger: Record<string, number>;
  eventsByStrategy: Record<string, number>;
  eventsByLevel: Record<string, number>;
  topFallbackModels: Array<{ modelId: string; modelName: string; usageCount: number }>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const policies = new Map<string, DegradationPolicy>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a degradation policy
 */
export async function createDegradationPolicy(params: {
  organizationId: string;
  name: string;
  description?: string;
  targetModel: DegradationTarget;
  fallbackChain: Omit<FallbackModel, "id">[];
  degradationRules: Omit<DegradationRule, "id">[];
  qualityThresholds: QualityThresholds;
  recoveryConfig: RecoveryConfig;
  cachedResponses?: Omit<CachedResponse, "id" | "usageCount" | "createdAt" | "expiresAt">[];
  createdBy: string;
}): Promise<DegradationPolicy> {
  const now = new Date().toISOString();

  const policy: DegradationPolicy = {
    id: `gdp_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    targetModel: params.targetModel,
    status: "healthy",
    currentLevel: "none",
    fallbackChain: params.fallbackChain.map(fb => ({ ...fb, id: `fb_${randomUUID().replace(/-/g, "").slice(0, 12)}` })),
    degradationRules: params.degradationRules.map(r => ({ ...r, id: `dr_${randomUUID().replace(/-/g, "").slice(0, 12)}` })),
    qualityThresholds: params.qualityThresholds,
    recoveryConfig: params.recoveryConfig,
    cachedResponses: (params.cachedResponses ?? []).map(cr => ({
      ...cr,
      id: `cr_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      usageCount: 0,
      createdAt: now,
      expiresAt: new Date(Date.now() + cr.ttl * 1000).toISOString(),
    })),
    degradationHistory: [],
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  policies.set(policy.id, policy);
  return policy;
}

/**
 * Handle a request with graceful degradation
 */
export async function handleRequestWithDegradation(params: {
  policyId: string;
  request: Record<string, unknown>;
  primaryExecute: (request: Record<string, unknown>) => Promise<{ success: boolean; response?: Record<string, unknown>; latencyMs: number; qualityScore: number; error?: string }>;
}): Promise<DegradationResponse> {
  const policy = policies.get(params.policyId);
  if (!policy) throw new Error(`Degradation policy ${params.policyId} not found`);

  // Try primary model if healthy
  if (policy.status === "healthy" || policy.status === "recovering") {
    try {
      const result = await params.primaryExecute(params.request);
      if (result.success && result.response) {
        return {
          originalModelId: policy.targetModel.modelId,
          servedBy: policy.targetModel.modelName,
          fallbackUsed: false,
          qualityScore: result.qualityScore,
          qualityImpact: 0,
          response: result.response,
          latencyMs: result.latencyMs,
          degradationLevel: policy.currentLevel,
        };
      }
    } catch {
      // Primary failed — fall through to degradation
    }
  }

  // Try fallback chain
  for (const fallback of policy.fallbackChain.filter(fb => fb.enabled).sort((a, b) => a.priority - b.priority)) {
    try {
      const result = await simulateFallbackExecution(fallback, params.request);
      if (result.success) {
        // Update active fallback
        if (!policy.activeFallback || policy.activeFallback.fallbackModelId !== fallback.modelId) {
          policy.activeFallback = {
            id: `af_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
            strategy: "fallback-model",
            fallbackModelId: fallback.modelId,
            fallbackModelName: fallback.modelName,
            qualityScore: fallback.qualityScore,
            startedAt: new Date().toISOString(),
            requestsServed: 0,
            averageLatencyMs: result.latencyMs,
            qualityImpact: 1 - fallback.qualityScore,
          };
        }
        policy.activeFallback.requestsServed++;

        return {
          originalModelId: policy.targetModel.modelId,
          servedBy: fallback.modelName,
          fallbackUsed: true,
          strategy: "fallback-model",
          qualityScore: fallback.qualityScore,
          qualityImpact: 1 - fallback.qualityScore,
          response: result.response ?? {},
          latencyMs: result.latencyMs,
          degradationLevel: policy.currentLevel,
        };
      }
    } catch {
      continue;
    }
  }

  // Try cached responses
  const cached = findCachedResponse(policy, params.request);
  if (cached) {
    cached.usageCount++;
    cached.lastUsedAt = new Date().toISOString();
    policies.set(policy.id, policy);

    return {
      originalModelId: policy.targetModel.modelId,
      servedBy: "cache",
      fallbackUsed: true,
      strategy: "cached-response",
      qualityScore: cached.qualityScore,
      qualityImpact: 1 - cached.qualityScore,
      response: cached.response,
      latencyMs: 1,
      degradationLevel: policy.currentLevel,
    };
  }

  // Static fallback
  return {
    originalModelId: policy.targetModel.modelId,
    servedBy: "static-fallback",
    fallbackUsed: true,
    strategy: "static-response",
    qualityScore: 0.3,
    qualityImpact: 0.7,
    response: { degraded: true, message: "Service temporarily unavailable — serving degraded response", originalModel: policy.targetModel.modelName },
    latencyMs: 1,
    degradationLevel: "critical",
  };
}

/**
 * Trigger degradation for a policy
 */
export async function triggerDegradation(params: {
  policyId: string;
  trigger: DegradationTrigger;
  reason: string;
  metricsSnapshot: Record<string, number>;
}): Promise<DegradationEvent | null> {
  const policy = policies.get(params.policyId);
  if (!policy) return null;

  // Find matching rule
  const rule = policy.degradationRules
    .filter(r => r.enabled && r.trigger === params.trigger)
    .sort((a, b) => b.priority - a.priority)[0];

  const targetLevel = rule?.targetLevel ?? getNextDegradationLevel(policy.currentLevel);
  const strategy = rule?.strategy ?? "fallback-model";

  const event: DegradationEvent = {
    id: `de_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    timestamp: new Date().toISOString(),
    trigger: params.trigger,
    fromLevel: policy.currentLevel,
    toLevel: targetLevel,
    strategy,
    reason: params.reason,
    metricsSnapshot: params.metricsSnapshot,
  };

  policy.currentLevel = targetLevel;
  policy.status = "degraded";
  policy.degradationHistory.push(event);
  policy.updatedAt = event.timestamp;
  policies.set(policy.id, policy);

  // Start recovery monitoring
  if (policy.recoveryConfig.strategy === "automatic") {
    setTimeout(() => attemptRecovery(policy.id), 200);
  }

  return event;
}

/**
 * Get degradation policy by ID
 */
export async function getDegradationPolicy(policyId: string): Promise<DegradationPolicy | null> {
  return policies.get(policyId) ?? null;
}

/**
 * List degradation policies
 */
export async function listDegradationPolicies(
  organizationId: string,
  filters?: { status?: DegradationStatus; level?: DegradationLevel; limit?: number },
): Promise<DegradationPolicy[]> {
  let result = Array.from(policies.values()).filter(p => p.organizationId === organizationId);
  if (filters?.status) result = result.filter(p => p.status === filters.status);
  if (filters?.level) result = result.filter(p => p.currentLevel === filters.level);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, filters?.limit ?? 50);
}

/**
 * Manually recover from degradation
 */
export async function recoverFromDegradation(policyId: string): Promise<DegradationPolicy | null> {
  const policy = policies.get(policyId);
  if (!policy) return null;

  policy.currentLevel = "none";
  policy.status = "healthy";
  policy.activeFallback = undefined;
  policy.updatedAt = new Date().toISOString();

  // Update last degradation event
  const lastEvent = policy.degradationHistory[policy.degradationHistory.length - 1];
  if (lastEvent && !lastEvent.recoveredAt) {
    lastEvent.recoveredAt = policy.updatedAt;
    lastEvent.durationMinutes = Math.round((new Date(policy.updatedAt).getTime() - new Date(lastEvent.timestamp).getTime()) / 60000);
  }

  policies.set(policyId, policy);
  return policy;
}

/**
 * Add cached response to a policy
 */
export async function addCachedResponse(params: {
  policyId: string;
  inputHash: string;
  inputPattern: string;
  response: Record<string, unknown>;
  qualityScore: number;
  ttl: number;
}): Promise<CachedResponse | null> {
  const policy = policies.get(params.policyId);
  if (!policy) return null;

  const now = new Date().toISOString();
  const cached: CachedResponse = {
    id: `cr_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    inputHash: params.inputHash,
    inputPattern: params.inputPattern,
    response: params.response,
    qualityScore: params.qualityScore,
    ttl: params.ttl,
    usageCount: 0,
    createdAt: now,
    expiresAt: new Date(Date.now() + params.ttl * 1000).toISOString(),
  };

  policy.cachedResponses.push(cached);
  policy.updatedAt = now;
  policies.set(params.policyId, policy);
  return cached;
}

/**
 * Get degradation statistics
 */
export async function getDegradationStats(organizationId: string): Promise<DegradationStats> {
  const all = Array.from(policies.values()).filter(p => p.organizationId === organizationId);
  const degraded = all.filter(p => p.status === "degraded");
  const healthy = all.filter(p => p.status === "healthy");

  let totalEvents = 0;
  let totalDuration = 0;
  let totalFallbackRequests = 0;
  let totalQualityScore = 0;
  let qualityCount = 0;
  const eventsByTrigger: Record<string, number> = {};
  const eventsByStrategy: Record<string, number> = {};
  const eventsByLevel: Record<string, number> = {};
  const fallbackModels: Record<string, { modelName: string; count: number }> = {};

  for (const policy of all) {
    for (const event of policy.degradationHistory) {
      totalEvents++;
      eventsByTrigger[event.trigger] = (eventsByTrigger[event.trigger] || 0) + 1;
      eventsByStrategy[event.strategy] = (eventsByStrategy[event.strategy] || 0) + 1;
      eventsByLevel[event.toLevel] = (eventsByLevel[event.toLevel] || 0) + 1;
      if (event.durationMinutes) totalDuration += event.durationMinutes;
    }

    if (policy.activeFallback) {
      totalFallbackRequests += policy.activeFallback.requestsServed;
      totalQualityScore += policy.activeFallback.qualityScore;
      qualityCount++;
      if (policy.activeFallback.fallbackModelId) {
        const key = policy.activeFallback.fallbackModelId;
        if (!fallbackModels[key]) fallbackModels[key] = { modelName: policy.activeFallback.fallbackModelName ?? "Unknown", count: 0 };
        fallbackModels[key].count += policy.activeFallback.requestsServed;
      }
    }
  }

  return {
    totalPolicies: all.length,
    degradedPolicies: degraded.length,
    healthyPolicies: healthy.length,
    totalDegradationEvents: totalEvents,
    averageDegradationDurationMinutes: totalEvents > 0 ? Math.round(totalDuration / totalEvents * 100) / 100 : 0,
    totalFallbackRequests,
    averageQualityScore: qualityCount > 0 ? Math.round(totalQualityScore / qualityCount * 100) / 100 : 0,
    eventsByTrigger,
    eventsByStrategy,
    eventsByLevel,
    topFallbackModels: Object.entries(fallbackModels).map(([modelId, data]) => ({ modelId, modelName: data.modelName, usageCount: data.count })).sort((a, b) => b.usageCount - a.usageCount).slice(0, 5),
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

async function simulateFallbackExecution(fallback: FallbackModel, _request: Record<string, unknown>): Promise<{ success: boolean; response?: Record<string, unknown>; latencyMs: number }> {
  const latency = fallback.latencyMs * (0.8 + _rng.next() * 0.4);
  await new Promise(r => setTimeout(r, Math.min(latency, 50)));
  return {
    success: _rng.next() > 0.05, // 95% success rate for fallbacks
    response: { model: fallback.modelName, fallback: true, quality: fallback.qualityScore, timestamp: new Date().toISOString() },
    latencyMs: Math.round(latency),
  };
}

function findCachedResponse(policy: DegradationPolicy, request: Record<string, unknown>): CachedResponse | null {
  const now = Date.now();
  const requestStr = JSON.stringify(request);

  for (const cached of policy.cachedResponses) {
    if (new Date(cached.expiresAt).getTime() < now) continue;
    if (cached.inputPattern === "*" || requestStr.includes(cached.inputPattern)) {
      return cached;
    }
  }
  return null;
}

function getNextDegradationLevel(current: DegradationLevel): DegradationLevel {
  const levels: DegradationLevel[] = ["none", "minimal", "moderate", "severe", "critical"];
  const idx = levels.indexOf(current);
  return levels[Math.min(idx + 1, levels.length - 1)];
}

async function attemptRecovery(policyId: string): Promise<void> {
  const policy = policies.get(policyId);
  if (!policy || policy.status !== "degraded") return;

  // Simulate health check
  const healthScore = 0.5 + _rng.next() * 0.5;

  if (healthScore >= policy.recoveryConfig.recoveryThreshold) {
    if (policy.recoveryConfig.strategy === "gradual") {
      // Gradual recovery — step down degradation level
      const levels: DegradationLevel[] = ["none", "minimal", "moderate", "severe", "critical"];
      const idx = levels.indexOf(policy.currentLevel);
      if (idx > 0) {
        policy.currentLevel = levels[idx - 1];
        policy.status = "recovering";
        policy.updatedAt = new Date().toISOString();
        policies.set(policyId, policy);

        if (policy.currentLevel !== "none") {
          setTimeout(() => attemptRecovery(policyId), 200);
        } else {
          policy.status = "healthy";
          policy.activeFallback = undefined;
          policies.set(policyId, policy);
        }
      }
    } else {
      // Immediate recovery
      policy.currentLevel = "none";
      policy.status = "healthy";
      policy.activeFallback = undefined;
      policy.updatedAt = new Date().toISOString();

      const lastEvent = policy.degradationHistory[policy.degradationHistory.length - 1];
      if (lastEvent && !lastEvent.recoveredAt) {
        lastEvent.recoveredAt = policy.updatedAt;
        lastEvent.durationMinutes = Math.round((new Date(policy.updatedAt).getTime() - new Date(lastEvent.timestamp).getTime()) / 60000);
      }

      policies.set(policyId, policy);
    }
  }
}
