/**
 * Module 74: AI Feature Serving Service
 *
 * Provides feature serving capabilities including online serving (low-latency),
 * offline serving (batch), feature caching strategies, point-in-time retrieval,
 * feature transformation at serving time, feature monitoring and drift detection,
 * feature quality validation, and performance metrics for comprehensive feature
 * serving operations.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiFeatureServing');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FeatureServingConfig {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  features: string[]; // Feature IDs
  servingType: ServingType;
  onlineConfig?: OnlineServingConfig;
  offlineConfig?: OfflineServingConfig;
  caching: CachingConfig;
  monitoring: MonitoringConfig;
  status: ServingStatus;
  metrics: ServingMetrics;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastServedAt?: string;
}

export type ServingType = 'online' | 'offline' | 'hybrid';

export type ServingStatus = 'active' | 'inactive' | 'error' | 'maintenance';

export interface OnlineServingConfig {
  maxLatencyMs: number;
  timeoutMs: number;
  retryAttempts: number;
  fallbackStrategy: 'default-value' | 'last-known' | 'error';
  consistencyLevel: 'strong' | 'eventual';
  batchSize: number;
}

export interface OfflineServingConfig {
  outputFormat: 'parquet' | 'csv' | 'json' | 'tfrecord';
  partitionBy: string[];
  compression: 'none' | 'snappy' | 'gzip' | 'zstd';
  pointInTimeCorrectness: boolean;
  incrementalUpdates: boolean;
}

export interface CachingConfig {
  enabled: boolean;
  ttl: number; // seconds
  maxSize: number; // MB
  evictionPolicy: 'lru' | 'lfu' | 'fifo';
  warmingStrategy: 'none' | 'periodic' | 'on-demand';
  warmingSchedule?: string; // cron expression
}

export interface MonitoringConfig {
  enabled: boolean;
  driftDetection: DriftDetectionConfig;
  qualityValidation: QualityValidationConfig;
  performanceMonitoring: PerformanceMonitoringConfig;
  alerting: AlertingConfig;
}

export interface DriftDetectionConfig {
  enabled: boolean;
  methods: DriftDetectionMethod[];
  threshold: number;
  baselineWindow: number; // days
  checkFrequency: 'hourly' | 'daily' | 'weekly';
}

export type DriftDetectionMethod =
  | 'ks-test'
  | 'psi'
  | 'wasserstein'
  | 'kl-divergence'
  | 'chi-square'
  | 'custom';

export interface QualityValidationConfig {
  enabled: boolean;
  checks: QualityCheck[];
  validationFrequency: 'per-request' | 'batch' | 'periodic';
}

export interface QualityCheck {
  type: 'null-rate' | 'outlier-rate' | 'schema' | 'range' | 'custom';
  threshold: number;
  action: 'warn' | 'error' | 'fallback';
}

export interface PerformanceMonitoringConfig {
  enabled: boolean;
  metrics: PerformanceMetric[];
  collectionFrequency: 'real-time' | 'minute' | 'hour';
}

export type PerformanceMetric =
  | 'latency'
  | 'throughput'
  | 'cache-hit-rate'
  | 'error-rate'
  | 'timeout-rate';

export interface AlertingConfig {
  enabled: boolean;
  channels: AlertChannel[];
  rules: AlertRule[];
}

export interface AlertChannel {
  type: 'email' | 'slack' | 'webhook' | 'pagerduty';
  config: Record<string, any>;
}

export interface AlertRule {
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  cooldown: number; // minutes
}

export interface ServingMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cacheHits: number;
  cacheMisses: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  throughputPerSecond: number;
  errorRate: number;
  timeoutRate: number;
  driftDetections: number;
  qualityViolations: number;
  lastUpdated: string;
}

export interface FeatureRequest {
  id: string;
  servingConfigId: string;
  entityKeys: Record<string, any>;
  featureIds?: string[]; // Subset of features if not all
  timestamp?: string; // For point-in-time retrieval
  context?: Record<string, any>;
}

export interface FeatureResponse {
  requestId: string;
  features: Record<string, FeatureValue>;
  metadata: ResponseMetadata;
}

export interface FeatureValue {
  value: any;
  timestamp: string;
  source: 'cache' | 'online-store' | 'offline-store' | 'computed';
  quality?: {
    valid: boolean;
    issues?: string[];
  };
}

export interface ResponseMetadata {
  latencyMs: number;
  cacheHit: boolean;
  featuresRequested: number;
  featuresReturned: number;
  timestamp: string;
}

export interface BatchFeatureRequest {
  id: string;
  servingConfigId: string;
  entityKeys: Array<Record<string, any>>;
  featureIds?: string[];
  timestamp?: string;
  outputLocation?: string;
}

export interface BatchFeatureResponse {
  requestId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  outputLocation?: string;
  recordCount?: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface FeatureDrift {
  id: string;
  servingConfigId: string;
  featureId: string;
  featureName: string;
  detectionMethod: DriftDetectionMethod;
  driftScore: number;
  threshold: number;
  baselineStats: FeatureStatistics;
  currentStats: FeatureStatistics;
  detectedAt: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'detected' | 'investigating' | 'resolved' | 'ignored';
}

export interface FeatureStatistics {
  count: number;
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
  median?: number;
  percentiles?: Record<string, number>;
  nullRate: number;
  distribution?: {
    type: string;
    parameters: Record<string, number>;
  };
}

export interface FeatureQualityViolation {
  id: string;
  servingConfigId: string;
  featureId: string;
  featureName: string;
  checkType: QualityCheck['type'];
  expected: any;
  actual: any;
  severity: 'warning' | 'error';
  detectedAt: string;
  status: 'detected' | 'investigating' | 'resolved' | 'ignored';
  resolution?: string;
}

export interface CacheEntry {
  key: string;
  features: Record<string, FeatureValue>;
  createdAt: string;
  expiresAt: string;
  accessCount: number;
  lastAccessedAt: string;
}

export interface ServingDashboard {
  organizationId: string;
  totalServingConfigs: number;
  activeServingConfigs: number;
  totalRequests: number;
  averageLatencyMs: number;
  cacheHitRate: number;
  errorRate: number;
  driftDetections: number;
  qualityViolations: number;
  recentDrifts: FeatureDrift[];
  recentViolations: FeatureQualityViolation[];
  topFeatures: Array<{ featureId: string; name: string; requestCount: number }>;
  performanceMetrics: {
    latencyTrend: Array<{ timestamp: string; value: number }>;
    throughputTrend: Array<{ timestamp: string; value: number }>;
    errorRateTrend: Array<{ timestamp: string; value: number }>;
  };
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const servingConfigs = new Map<string, FeatureServingConfig>();
const cache = new Map<string, CacheEntry>();
const drifts = new Map<string, FeatureDrift>();
const violations = new Map<string, FeatureQualityViolation>();
const batchRequests = new Map<string, BatchFeatureResponse>();

// ─── Serving Configuration Management ──────────────────────────────────────────

/**
 * Create a feature serving configuration
 */
export async function createServingConfig(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    features: string[];
    servingType: ServingType;
    onlineConfig?: OnlineServingConfig;
    offlineConfig?: OfflineServingConfig;
    caching?: Partial<CachingConfig>;
    monitoring?: Partial<MonitoringConfig>;
    createdBy: string;
  }
): Promise<FeatureServingConfig> {
  const id = `serving_${randomUUID()}`;
  const now = new Date().toISOString();

  const config: FeatureServingConfig = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    features: params.features,
    servingType: params.servingType,
    onlineConfig: params.onlineConfig,
    offlineConfig: params.offlineConfig,
    caching: {
      enabled: params.caching?.enabled ?? true,
      ttl: params.caching?.ttl ?? 3600,
      maxSize: params.caching?.maxSize ?? 1000,
      evictionPolicy: params.caching?.evictionPolicy ?? 'lru',
      warmingStrategy: params.caching?.warmingStrategy ?? 'none',
    },
    monitoring: {
      enabled: params.monitoring?.enabled ?? true,
      driftDetection: params.monitoring?.driftDetection ?? {
        enabled: true,
        methods: ['ks-test', 'psi'],
        threshold: 0.1,
        baselineWindow: 30,
        checkFrequency: 'daily',
      },
      qualityValidation: params.monitoring?.qualityValidation ?? {
        enabled: true,
        checks: [
          { type: 'null-rate', threshold: 0.1, action: 'warn' },
          { type: 'outlier-rate', threshold: 0.05, action: 'warn' },
        ],
        validationFrequency: 'batch',
      },
      performanceMonitoring: params.monitoring?.performanceMonitoring ?? {
        enabled: true,
        metrics: ['latency', 'throughput', 'cache-hit-rate', 'error-rate'],
        collectionFrequency: 'minute',
      },
      alerting: params.monitoring?.alerting ?? {
        enabled: true,
        channels: [],
        rules: [],
      },
    },
    status: 'active',
    metrics: {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      throughputPerSecond: 0,
      errorRate: 0,
      timeoutRate: 0,
      driftDetections: 0,
      qualityViolations: 0,
      lastUpdated: now,
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  servingConfigs.set(id, config);
  return config;
}

/**
 * Update serving configuration
 */
export async function updateServingConfig(
  configId: string,
  updates: Partial<Omit<FeatureServingConfig, 'id' | 'organizationId' | 'createdAt'>>
): Promise<FeatureServingConfig | null> {
  const config = servingConfigs.get(configId);
  if (!config) return null;

  Object.assign(config, updates);
  config.updatedAt = new Date().toISOString();

  servingConfigs.set(configId, config);
  return config;
}

/**
 * Get serving configuration by ID
 */
export async function getServingConfig(configId: string): Promise<FeatureServingConfig | null> {
  return servingConfigs.get(configId) || null;
}

/**
 * List serving configurations
 */
export async function listServingConfigs(
  organizationId: string,
  filters?: { status?: ServingStatus; servingType?: ServingType }
): Promise<FeatureServingConfig[]> {
  const allConfigs = Array.from(servingConfigs.values()).filter(
    (c) => c.organizationId === organizationId
  );

  return allConfigs.filter((c) => {
    if (filters?.status && c.status !== filters.status) return false;
    if (filters?.servingType && c.servingType !== filters.servingType) return false;
    return true;
  });
}

// ─── Online Feature Serving ────────────────────────────────────────────────────

/**
 * Serve features online (low-latency)
 */
export async function serveFeaturesOnline(
  request: FeatureRequest
): Promise<FeatureResponse> {
  const startTime = Date.now();
  const config = servingConfigs.get(request.servingConfigId);

  if (!config) {
    throw new Error(`Serving config ${request.servingConfigId} not found`);
  }

  if (config.status !== 'active') {
    throw new Error(`Serving config ${config.name} is not active`);
  }

  const featureIds = request.featureIds || config.features;
  const features: Record<string, FeatureValue> = {};
  let cacheHit = true;

  // Try to get from cache first
  if (config.caching.enabled) {
    const cacheKey = generateCacheKey(request.entityKeys, featureIds);
    const cached = cache.get(cacheKey);

    if (cached && new Date(cached.expiresAt) > new Date()) {
      // Cache hit
      cached.accessCount++;
      cached.lastAccessedAt = new Date().toISOString();
      cache.set(cacheKey, cached);

      config.metrics.cacheHits++;
      config.lastServedAt = new Date().toISOString();
      config.updatedAt = config.lastServedAt;
      servingConfigs.set(config.id, config);

      return {
        requestId: request.id,
        features: cached.features,
        metadata: {
          latencyMs: Date.now() - startTime,
          cacheHit: true,
          featuresRequested: featureIds.length,
          featuresReturned: Object.keys(cached.features).length,
          timestamp: new Date().toISOString(),
        },
      };
    } else {
      cacheHit = false;
      config.metrics.cacheMisses++;
    }
  }

  // Fetch from online store (simulated)
  for (const featureId of featureIds) {
    // In a real implementation, this would fetch from a feature store
    const value = simulateFeatureFetch(featureId, request.entityKeys, request.timestamp);
    features[featureId] = value;
  }

  // Validate quality if enabled
  if (config.monitoring.qualityValidation.enabled) {
    await validateFeatureQuality(config.id, features);
  }

  // Cache the result
  if (config.caching.enabled && !cacheHit) {
    const cacheKey = generateCacheKey(request.entityKeys, featureIds);
    const cacheEntry: CacheEntry = {
      key: cacheKey,
      features,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + config.caching.ttl * 1000).toISOString(),
      accessCount: 1,
      lastAccessedAt: new Date().toISOString(),
    };
    cache.set(cacheKey, cacheEntry);
  }

  // Update metrics
  const latency = Date.now() - startTime;
  config.metrics.totalRequests++;
  config.metrics.successfulRequests++;
  config.metrics.averageLatencyMs =
    (config.metrics.averageLatencyMs * (config.metrics.totalRequests - 1) + latency) /
    config.metrics.totalRequests;
  config.lastServedAt = new Date().toISOString();
  config.updatedAt = config.lastServedAt;
  servingConfigs.set(config.id, config);

  return {
    requestId: request.id,
    features,
    metadata: {
      latencyMs: latency,
      cacheHit: false,
      featuresRequested: featureIds.length,
      featuresReturned: Object.keys(features).length,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Serve features offline (batch)
 */
export async function serveFeaturesOffline(
  request: BatchFeatureRequest
): Promise<BatchFeatureResponse> {
  const config = servingConfigs.get(request.servingConfigId);

  if (!config) {
    throw new Error(`Serving config ${request.servingConfigId} not found`);
  }

  const response: BatchFeatureResponse = {
    requestId: request.id,
    status: 'processing',
    progress: 0,
    startedAt: new Date().toISOString(),
  };

  batchRequests.set(request.id, response);

  // Simulate batch processing
  setTimeout(async () => {
    const featureIds = request.featureIds || config.features;
    const recordCount = request.entityKeys.length;

    // Simulate processing
    for (let i = 0; i <= 100; i += 10) {
      response.progress = i;
      batchRequests.set(request.id, response);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    response.status = 'completed';
    response.progress = 100;
    response.recordCount = recordCount;
    response.outputLocation = request.outputLocation || `s3://features/${request.id}.parquet`;
    response.completedAt = new Date().toISOString();

    batchRequests.set(request.id, response);

    // Update metrics
    config.metrics.totalRequests++;
    config.metrics.successfulRequests++;
    config.lastServedAt = new Date().toISOString();
    config.updatedAt = config.lastServedAt;
    servingConfigs.set(config.id, config);
  }, 100);

  return response;
}

/**
 * Get batch request status
 */
export async function getBatchRequestStatus(requestId: string): Promise<BatchFeatureResponse | null> {
  return batchRequests.get(requestId) || null;
}

// ─── Feature Monitoring ────────────────────────────────────────────────────────

/**
 * Detect feature drift
 */
export async function detectFeatureDrift(
  configId: string,
  featureId: string,
  currentStats: FeatureStatistics
): Promise<FeatureDrift | null> {
  const config = servingConfigs.get(configId);
  if (!config || !config.monitoring.driftDetection.enabled) return null;

  // In a real implementation, this would compare with baseline statistics
  const baselineStats: FeatureStatistics = {
    count: 10000,
    mean: 50,
    std: 10,
    min: 0,
    max: 100,
    nullRate: 0.01,
  };

  // Calculate drift score (simplified)
  const driftScore = calculateDriftScore(baselineStats, currentStats, config.monitoring.driftDetection.methods[0]);

  if (driftScore > config.monitoring.driftDetection.threshold) {
    const drift: FeatureDrift = {
      id: `drift_${randomUUID()}`,
      servingConfigId: configId,
      featureId,
      featureName: featureId, // Would fetch actual name
      detectionMethod: config.monitoring.driftDetection.methods[0],
      driftScore,
      threshold: config.monitoring.driftDetection.threshold,
      baselineStats,
      currentStats,
      detectedAt: new Date().toISOString(),
      severity: driftScore > 0.5 ? 'critical' : driftScore > 0.3 ? 'high' : driftScore > 0.1 ? 'medium' : 'low',
      status: 'detected',
    };

    drifts.set(drift.id, drift);
    config.metrics.driftDetections++;
    config.updatedAt = drift.detectedAt;
    servingConfigs.set(configId, config);

    return drift;
  }

  return null;
}

/**
 * Validate feature quality
 */
async function validateFeatureQuality(
  configId: string,
  features: Record<string, FeatureValue>
): Promise<void> {
  const config = servingConfigs.get(configId);
  if (!config || !config.monitoring.qualityValidation.enabled) return;

  for (const [featureId, featureValue] of Object.entries(features)) {
    for (const check of config.monitoring.qualityValidation.checks) {
      let valid = true;
      let expected: any = check.threshold;
      let actual: any = null;

      switch (check.type) {
        case 'null-rate':
          actual = featureValue.value === null ? 1 : 0;
          valid = actual <= check.threshold;
          break;
        case 'schema':
          // Schema validation would go here
          break;
      }

      if (!valid) {
        const violation: FeatureQualityViolation = {
          id: `violation_${randomUUID()}`,
          servingConfigId: configId,
          featureId,
          featureName: featureId,
          checkType: check.type,
          expected,
          actual,
          severity: check.action === 'error' ? 'error' : 'warning',
          detectedAt: new Date().toISOString(),
          status: 'detected',
        };

        violations.set(violation.id, violation);
        config.metrics.qualityViolations++;
        config.updatedAt = violation.detectedAt;
        servingConfigs.set(configId, config);
      }
    }
  }
}

/**
 * Get feature drifts
 */
export async function getFeatureDrifts(
  configId: string,
  filters?: { severity?: FeatureDrift['severity']; status?: FeatureDrift['status'] }
): Promise<FeatureDrift[]> {
  const allDrifts = Array.from(drifts.values()).filter((d) => d.servingConfigId === configId);

  return allDrifts.filter((d) => {
    if (filters?.severity && d.severity !== filters.severity) return false;
    if (filters?.status && d.status !== filters.status) return false;
    return true;
  });
}

/**
 * Get feature quality violations
 */
export async function getFeatureQualityViolations(
  configId: string,
  filters?: { severity?: FeatureQualityViolation['severity']; status?: FeatureQualityViolation['status'] }
): Promise<FeatureQualityViolation[]> {
  const allViolations = Array.from(violations.values()).filter((v) => v.servingConfigId === configId);

  return allViolations.filter((v) => {
    if (filters?.severity && v.severity !== filters.severity) return false;
    if (filters?.status && v.status !== filters.status) return false;
    return true;
  });
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

/**
 * Get serving dashboard
 */
export async function getServingDashboard(organizationId: string): Promise<ServingDashboard> {
  const allConfigs = await listServingConfigs(organizationId);

  let totalRequests = 0;
  let totalLatency = 0;
  let totalCacheHits = 0;
  let totalCacheMisses = 0;
  let totalErrors = 0;
  let totalDrifts = 0;
  let totalViolations = 0;

  for (const config of allConfigs) {
    totalRequests += config.metrics.totalRequests;
    totalLatency += config.metrics.averageLatencyMs * config.metrics.totalRequests;
    totalCacheHits += config.metrics.cacheHits;
    totalCacheMisses += config.metrics.cacheMisses;
    totalErrors += config.metrics.failedRequests;
    totalDrifts += config.metrics.driftDetections;
    totalViolations += config.metrics.qualityViolations;
  }

  const allDrifts = Array.from(drifts.values())
    .filter((d) => allConfigs.some((c) => c.id === d.servingConfigId))
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, 10);

  const allViolations = Array.from(violations.values())
    .filter((v) => allConfigs.some((c) => c.id === v.servingConfigId))
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, 10);

  return {
    organizationId,
    totalServingConfigs: allConfigs.length,
    activeServingConfigs: allConfigs.filter((c) => c.status === 'active').length,
    totalRequests,
    averageLatencyMs: totalRequests > 0 ? totalLatency / totalRequests : 0,
    cacheHitRate: totalCacheHits + totalCacheMisses > 0 ? (totalCacheHits / (totalCacheHits + totalCacheMisses)) * 100 : 0,
    errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
    driftDetections: totalDrifts,
    qualityViolations: totalViolations,
    recentDrifts: allDrifts,
    recentViolations: allViolations,
    topFeatures: [], // Would be populated with usage data
    performanceMetrics: {
      latencyTrend: [],
      throughputTrend: [],
      errorRateTrend: [],
    },
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function generateCacheKey(entityKeys: Record<string, any>, featureIds: string[]): string {
  const entityPart = Object.entries(entityKeys)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
  const featurePart = featureIds.sort().join(',');
  return `${entityPart}::${featurePart}`;
}

function simulateFeatureFetch(
  featureId: string,
  entityKeys: Record<string, any>,
  timestamp?: string
): FeatureValue {
  // Simulate feature value generation
  const value = _rng.next() * 100;
  return {
    value,
    timestamp: timestamp || new Date().toISOString(),
    source: 'online-store',
    quality: {
      valid: true,
    },
  };
}

function calculateDriftScore(
  baseline: FeatureStatistics,
  current: FeatureStatistics,
  method: DriftDetectionMethod
): number {
  // Simplified drift score calculation
  if (!baseline.mean || !current.mean || !baseline.std || !current.std) {
    return 0;
  }

  const meanDiff = Math.abs(baseline.mean - current.mean);
  const normalizedDiff = meanDiff / baseline.std;

  return Math.min(1, normalizedDiff / 3); // Normalize to 0-1
}
