/**
 * Module 30: IoT Data Pipeline Service
 *
 * Manages IoT telemetry data ingestion, validation, transformation, routing,
 * buffering, aggregation, and real-time stream processing.
 *
 * Phase 1 — Critical Gap: Enterprise IoT data infrastructure
 */

import { randomUUID, createHash } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TelemetryDataType = "numeric" | "string" | "boolean" | "json" | "binary" | "geolocation";

export type PipelineStatus = "active" | "paused" | "error" | "stopped" | "draining";

export type RoutingTarget = "storage" | "analytics" | "alert" | "webhook" | "digital-twin" | "stream" | "custom";

export type AggregationType = "count" | "sum" | "avg" | "min" | "max" | "last" | "first" | "stddev" | "percentile";

export type AlertSeverity = "info" | "warning" | "error" | "critical";

export interface TelemetryMessage {
  id: string;
  deviceId: string;
  organizationId: string;
  timestamp: string;
  receivedAt: string;
  sequenceNumber: number;
  dataType: TelemetryDataType;
  payload: Record<string, unknown>;
  metadata: {
    protocol: string;
    topic?: string;
    qos?: number;
    retained?: boolean;
    sourceIp?: string;
    messageSize: number;
  };
  validated: boolean;
  enriched: boolean;
  routed: boolean;
  pipelineId?: string;
}

export interface DataPipeline {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: PipelineStatus;
  sourceConfig: {
    deviceIds?: string[]; // Empty means all devices
    deviceCategories?: string[];
    deviceGroups?: string[];
    protocols?: string[];
    topics?: string[];
  };
  transformations: DataTransformation[];
  validationRules: ValidationRule[];
  routingRules: RoutingRule[];
  aggregationConfig?: AggregationConfig;
  buffering: {
    enabled: boolean;
    maxBufferSize: number;
    flushIntervalMs: number;
    currentBufferSize: number;
  };
  metrics: {
    messagesIngested: number;
    messagesProcessed: number;
    messagesRouted: number;
    messagesDropped: number;
    messagesFailed: number;
    averageLatencyMs: number;
    throughputPerSecond: number;
    lastProcessedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DataTransformation {
  id: string;
  name: string;
  type: "rename" | "map" | "filter" | "enrich" | "convert" | "flatten" | "aggregate" | "custom";
  config: Record<string, unknown>;
  order: number;
  enabled: boolean;
}

export interface ValidationRule {
  id: string;
  name: string;
  field: string;
  type: "required" | "range" | "regex" | "enum" | "custom";
  config: {
    min?: number;
    max?: number;
    pattern?: string;
    values?: unknown[];
    customValidator?: string;
  };
  action: "drop" | "flag" | "correct" | "alert";
  enabled: boolean;
}

export interface RoutingRule {
  id: string;
  name: string;
  target: RoutingTarget;
  targetConfig: {
    endpoint?: string;
    database?: string;
    table?: string;
    topic?: string;
    webhookUrl?: string;
    twinId?: string;
    headers?: Record<string, string>;
  };
  condition?: {
    field: string;
    operator: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "contains" | "regex";
    value: unknown;
  };
  enabled: boolean;
}

export interface AggregationConfig {
  enabled: boolean;
  windowSizeMs: number; // Time window for aggregation
  intervalMs: number; // How often to flush aggregated data
  fields: Array<{
    fieldName: string;
    aggregations: AggregationType[];
  }>;
  groupBy?: string[];
}

export interface TelemetryAlert {
  id: string;
  pipelineId: string;
  deviceId: string;
  ruleName: string;
  severity: AlertSeverity;
  field: string;
  value: unknown;
  threshold?: unknown;
  message: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  triggeredAt: string;
}

export interface IngestionStats {
  totalMessages: number;
  messagesPerSecond: number;
  messagesByDevice: Record<string, number>;
  messagesByProtocol: Record<string, number>;
  messagesByDataType: Record<string, number>;
  validationErrors: number;
  routingErrors: number;
  droppedMessages: number;
  averagePayloadSize: number;
  peakThroughput: number;
  activePipelines: number;
  totalPipelines: number;
  alertsTriggered: number;
  alertsAcknowledged: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const pipelines = new Map<string, DataPipeline>();
const telemetryBuffer: TelemetryMessage[] = [];
const alerts: TelemetryAlert[] = [];
const aggregationBuckets = new Map<string, AggregationBucket>();
let messageSequence = 0;

interface AggregationBucket {
  pipelineId: string;
  windowStart: string;
  windowEnd: string;
  values: Record<string, number[]>;
  count: number;
}

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a data pipeline
 */
export async function createDataPipeline(params: {
  organizationId: string;
  name: string;
  description?: string;
  sourceConfig?: DataPipeline["sourceConfig"];
  transformations?: DataTransformation[];
  validationRules?: ValidationRule[];
  routingRules?: RoutingRule[];
  aggregationConfig?: AggregationConfig;
  buffering?: Partial<DataPipeline["buffering"]>;
}): Promise<DataPipeline> {
  const now = new Date().toISOString();
  const pipeline: DataPipeline = {
    id: `pipe_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    status: "active",
    sourceConfig: {
      deviceIds: params.sourceConfig?.deviceIds ?? [],
      deviceCategories: params.sourceConfig?.deviceCategories ?? [],
      deviceGroups: params.sourceConfig?.deviceGroups ?? [],
      protocols: params.sourceConfig?.protocols ?? [],
      topics: params.sourceConfig?.topics ?? [],
    },
    transformations: params.transformations ?? [],
    validationRules: params.validationRules ?? [],
    routingRules: params.routingRules ?? [],
    aggregationConfig: params.aggregationConfig,
    buffering: {
      enabled: params.buffering?.enabled ?? true,
      maxBufferSize: params.buffering?.maxBufferSize ?? 10000,
      flushIntervalMs: params.buffering?.flushIntervalMs ?? 5000,
      currentBufferSize: 0,
    },
    metrics: {
      messagesIngested: 0,
      messagesProcessed: 0,
      messagesRouted: 0,
      messagesDropped: 0,
      messagesFailed: 0,
      averageLatencyMs: 0,
      throughputPerSecond: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  pipelines.set(pipeline.id, pipeline);
  return pipeline;
}

/**
 * Ingest telemetry data from a device
 */
export async function ingestTelemetry(params: {
  deviceId: string;
  organizationId: string;
  payload: Record<string, unknown>;
  dataType?: TelemetryDataType;
  protocol?: string;
  topic?: string;
  qos?: number;
  sourceIp?: string;
  timestamp?: string;
}): Promise<{
  messageId: string;
  processed: boolean;
  validated: boolean;
  routed: boolean;
  alerts: TelemetryAlert[];
}> {
  const now = new Date().toISOString();
  const messageSize = JSON.stringify(params.payload).length;
  
  const message: TelemetryMessage = {
    id: `tel_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    deviceId: params.deviceId,
    organizationId: params.organizationId,
    timestamp: params.timestamp ?? now,
    receivedAt: now,
    sequenceNumber: ++messageSequence,
    dataType: params.dataType ?? "json",
    payload: params.payload,
    metadata: {
      protocol: params.protocol ?? "mqtt",
      topic: params.topic,
      qos: params.qos,
      sourceIp: params.sourceIp,
      messageSize,
    },
    validated: false,
    enriched: false,
    routed: false,
  };

  // Add to buffer
  telemetryBuffer.push(message);

  // Find matching pipelines
  const matchingPipelines = findMatchingPipelines(params.organizationId, params.deviceId, params.protocol ?? "mqtt", params.topic);
  
  let allValidated = true;
  let allRouted = true;
  const triggeredAlerts: TelemetryAlert[] = [];

  for (const pipeline of matchingPipelines) {
    if (pipeline.status !== "active") continue;

    const startTime = Date.now();

    // Step 1: Validate
    const validationResult = validateMessage(message, pipeline.validationRules);
    message.validated = validationResult.valid;
    
    if (!validationResult.valid) {
      allValidated = false;
      pipeline.metrics.messagesDropped += validationResult.dropped ? 1 : 0;
      
      // Trigger alerts for validation failures
      for (const violation of validationResult.violations) {
        const alert = createAlert(pipeline.id, params.deviceId, violation, params.payload);
        triggeredAlerts.push(alert);
      }
    }

    // Step 2: Transform
    let transformedPayload = { ...params.payload };
    for (const transform of pipeline.transformations.filter(t => t.enabled).sort((a, b) => a.order - b.order)) {
      transformedPayload = applyTransformation(transformedPayload, transform);
    }
    message.payload = transformedPayload;
    message.enriched = true;

    // Step 3: Route
    if (message.validated || !validationResult.dropped) {
      const routed = routeMessage(message, pipeline.routingRules);
      message.routed = routed;
      if (!routed) allRouted = false;
      pipeline.metrics.messagesRouted += routed ? 1 : 0;
    }

    // Step 4: Aggregate (if enabled)
    if (pipeline.aggregationConfig?.enabled) {
      addToAggregationBucket(pipeline.id, message, pipeline.aggregationConfig);
    }

    // Update pipeline metrics
    const latency = Date.now() - startTime;
    pipeline.metrics.messagesIngested++;
    pipeline.metrics.messagesProcessed++;
    pipeline.metrics.averageLatencyMs = Math.round(
      (pipeline.metrics.averageLatencyMs * (pipeline.metrics.messagesProcessed - 1) + latency) /
      pipeline.metrics.messagesProcessed
    );
    pipeline.metrics.lastProcessedAt = now;
    pipeline.metrics.throughputPerSecond = calculateThroughput(pipeline);
    pipeline.updatedAt = now;
    pipelines.set(pipeline.id, pipeline);

    message.pipelineId = pipeline.id;
  }

  return {
    messageId: message.id,
    processed: matchingPipelines.length > 0,
    validated: allValidated,
    routed: allRouted,
    alerts: triggeredAlerts,
  };
}

/**
 * Batch ingest telemetry data
 */
export async function batchIngestTelemetry(
  messages: Array<{
    deviceId: string;
    organizationId: string;
    payload: Record<string, unknown>;
    dataType?: TelemetryDataType;
    protocol?: string;
    topic?: string;
    timestamp?: string;
  }>
): Promise<{
  totalReceived: number;
  totalProcessed: number;
  totalValidated: number;
  totalRouted: number;
  totalAlerts: number;
  results: Array<{ messageId: string; processed: boolean; validated: boolean; routed: boolean }>;
}> {
  const results = await Promise.all(
    messages.map(msg => ingestTelemetry(msg))
  );

  return {
    totalReceived: messages.length,
    totalProcessed: results.filter(r => r.processed).length,
    totalValidated: results.filter(r => r.validated).length,
    totalRouted: results.filter(r => r.routed).length,
    totalAlerts: results.reduce((sum, r) => sum + r.alerts.length, 0),
    results: results.map(r => ({
      messageId: r.messageId,
      processed: r.processed,
      validated: r.validated,
      routed: r.routed,
    })),
  };
}

/**
 * Get a data pipeline by ID
 */
export async function getDataPipeline(pipelineId: string): Promise<DataPipeline | null> {
  return pipelines.get(pipelineId) ?? null;
}

/**
 * List all data pipelines for an organization
 */
export async function listDataPipelines(
  organizationId: string,
  status?: PipelineStatus
): Promise<DataPipeline[]> {
  let result = Array.from(pipelines.values()).filter(
    p => p.organizationId === organizationId
  );
  if (status) result = result.filter(p => p.status === status);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Update a data pipeline
 */
export async function updateDataPipeline(
  pipelineId: string,
  updates: Partial<Pick<DataPipeline, "name" | "description" | "sourceConfig" | "transformations" | "validationRules" | "routingRules" | "aggregationConfig" | "buffering">>
): Promise<DataPipeline | null> {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return null;

  const updated: DataPipeline = {
    ...pipeline,
    ...updates,
    buffering: updates.buffering ? { ...pipeline.buffering, ...updates.buffering } : pipeline.buffering,
    updatedAt: new Date().toISOString(),
  };

  pipelines.set(pipelineId, updated);
  return updated;
}

/**
 * Pause/resume a data pipeline
 */
export async function setPipelineStatus(
  pipelineId: string,
  status: PipelineStatus
): Promise<DataPipeline | null> {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return null;

  pipeline.status = status;
  pipeline.updatedAt = new Date().toISOString();
  pipelines.set(pipelineId, pipeline);
  return pipeline;
}

/**
 * Delete a data pipeline
 */
export async function deleteDataPipeline(pipelineId: string): Promise<boolean> {
  return pipelines.delete(pipelineId);
}

/**
 * Add a transformation to a pipeline
 */
export async function addPipelineTransformation(
  pipelineId: string,
  transformation: Omit<DataTransformation, "id">
): Promise<DataPipeline | null> {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return null;

  pipeline.transformations.push({
    ...transformation,
    id: `tf_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
  });
  pipeline.updatedAt = new Date().toISOString();
  pipelines.set(pipelineId, pipeline);
  return pipeline;
}

/**
 * Add a validation rule to a pipeline
 */
export async function addPipelineValidationRule(
  pipelineId: string,
  rule: Omit<ValidationRule, "id">
): Promise<DataPipeline | null> {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return null;

  pipeline.validationRules.push({
    ...rule,
    id: `vr_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
  });
  pipeline.updatedAt = new Date().toISOString();
  pipelines.set(pipelineId, pipeline);
  return pipeline;
}

/**
 * Add a routing rule to a pipeline
 */
export async function addPipelineRoutingRule(
  pipelineId: string,
  rule: Omit<RoutingRule, "id">
): Promise<DataPipeline | null> {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return null;

  pipeline.routingRules.push({
    ...rule,
    id: `rr_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
  });
  pipeline.updatedAt = new Date().toISOString();
  pipelines.set(pipelineId, pipeline);
  return pipeline;
}

/**
 * Get recent telemetry for a device
 */
export async function getDeviceTelemetry(
  deviceId: string,
  filters?: {
    from?: string;
    to?: string;
    limit?: number;
    fields?: string[];
  }
): Promise<TelemetryMessage[]> {
  let result = telemetryBuffer.filter(m => m.deviceId === deviceId);
  
  if (filters?.from) result = result.filter(m => m.timestamp >= filters.from!);
  if (filters?.to) result = result.filter(m => m.timestamp <= filters.to!);
  if (filters?.fields) {
    result = result.map(m => ({
      ...m,
      payload: Object.fromEntries(
        Object.entries(m.payload).filter(([k]) => filters.fields!.includes(k))
      ),
    }));
  }

  return result
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, filters?.limit ?? 100);
}

/**
 * Get pipeline alerts
 */
export async function getPipelineAlerts(
  pipelineId: string,
  filters?: { severity?: AlertSeverity; acknowledged?: boolean; limit?: number }
): Promise<TelemetryAlert[]> {
  let result = alerts.filter(a => a.pipelineId === pipelineId);
  
  if (filters?.severity) result = result.filter(a => a.severity === filters.severity);
  if (filters?.acknowledged !== undefined) result = result.filter(a => a.acknowledged === filters.acknowledged);
  
  return result
    .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Acknowledge a pipeline alert
 */
export async function acknowledgeAlert(
  alertId: string,
  acknowledgedBy: string
): Promise<TelemetryAlert | null> {
  const index = alerts.findIndex(a => a.id === alertId);
  if (index === -1) return null;

  alerts[index].acknowledged = true;
  alerts[index].acknowledgedAt = new Date().toISOString();
  alerts[index].acknowledgedBy = acknowledgedBy;
  return alerts[index];
}

/**
 * Get aggregation results for a pipeline
 */
export async function getAggregationResults(
  pipelineId: string,
  fieldName?: string
): Promise<Array<{
  windowStart: string;
  windowEnd: string;
  count: number;
  results: Record<string, Record<string, number>>;
}>> {
  const buckets = Array.from(aggregationBuckets.values())
    .filter(b => b.pipelineId === pipelineId)
    .sort((a, b) => b.windowStart.localeCompare(a.windowStart));

  return buckets.map(bucket => {
    const results: Record<string, Record<string, number>> = {};
    
    for (const [field, values] of Object.entries(bucket.values)) {
      if (fieldName && field !== fieldName) continue;
      
      results[field] = {
        count: values.length,
        sum: values.reduce((a, b) => a + b, 0),
        avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
        min: Math.min(...values),
        max: Math.max(...values),
        stddev: calculateStddev(values),
      };
    }

    return {
      windowStart: bucket.windowStart,
      windowEnd: bucket.windowEnd,
      count: bucket.count,
      results,
    };
  });
}

/**
 * Get overall ingestion statistics
 */
export async function getIngestionStats(organizationId: string): Promise<IngestionStats> {
  const orgPipelines = Array.from(pipelines.values()).filter(
    p => p.organizationId === organizationId
  );
  const orgMessages = telemetryBuffer.filter(m => m.organizationId === organizationId);
  const orgAlerts = alerts.filter(a => orgPipelines.some(p => p.id === a.pipelineId));

  const messagesByDevice: Record<string, number> = {};
  const messagesByProtocol: Record<string, number> = {};
  const messagesByDataType: Record<string, number> = {};
  let totalPayloadSize = 0;

  for (const msg of orgMessages) {
    messagesByDevice[msg.deviceId] = (messagesByDevice[msg.deviceId] || 0) + 1;
    messagesByProtocol[msg.metadata.protocol] = (messagesByProtocol[msg.metadata.protocol] || 0) + 1;
    messagesByDataType[msg.dataType] = (messagesByDataType[msg.dataType] || 0) + 1;
    totalPayloadSize += msg.metadata.messageSize;
  }

  const totalIngested = orgPipelines.reduce((sum, p) => sum + p.metrics.messagesIngested, 0);
  const totalDropped = orgPipelines.reduce((sum, p) => sum + p.metrics.messagesDropped, 0);
  const totalFailed = orgPipelines.reduce((sum, p) => sum + p.metrics.messagesFailed, 0);
  const peakThroughput = orgPipelines.reduce((max, p) => Math.max(max, p.metrics.throughputPerSecond), 0);

  // Calculate messages per second (last minute)
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  const recentMessages = orgMessages.filter(m => m.receivedAt >= oneMinuteAgo);
  const messagesPerSecond = Math.round(recentMessages.length / 60 * 10) / 10;

  return {
    totalMessages: orgMessages.length,
    messagesPerSecond,
    messagesByDevice,
    messagesByProtocol,
    messagesByDataType,
    validationErrors: totalFailed,
    routingErrors: totalDropped,
    droppedMessages: totalDropped,
    averagePayloadSize: orgMessages.length > 0 ? Math.round(totalPayloadSize / orgMessages.length) : 0,
    peakThroughput: Math.round(peakThroughput),
    activePipelines: orgPipelines.filter(p => p.status === "active").length,
    totalPipelines: orgPipelines.length,
    alertsTriggered: orgAlerts.length,
    alertsAcknowledged: orgAlerts.filter(a => a.acknowledged).length,
  };
}

/**
 * Flush buffered messages (force processing)
 */
export async function flushBuffer(pipelineId: string): Promise<{
  flushed: number;
  processed: number;
  failed: number;
}> {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`);

  const buffered = telemetryBuffer.filter(
    m => m.pipelineId === pipelineId && !m.routed
  );

  let processed = 0;
  let failed = 0;

  for (const message of buffered) {
    try {
      const routed = routeMessage(message, pipeline.routingRules);
      if (routed) {
        message.routed = true;
        processed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  pipeline.buffering.currentBufferSize = Math.max(0, pipeline.buffering.currentBufferSize - processed);
  pipeline.updatedAt = new Date().toISOString();
  pipelines.set(pipelineId, pipeline);

  return { flushed: buffered.length, processed, failed };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function findMatchingPipelines(
  organizationId: string,
  deviceId: string,
  protocol: string,
  topic?: string
): DataPipeline[] {
  return Array.from(pipelines.values()).filter(p => {
    if (p.organizationId !== organizationId) return false;
    if (p.status !== "active") return false;

    const { deviceIds, protocols, topics } = p.sourceConfig;
    
    // If no filters, match all
    if (deviceIds!.length === 0 && protocols!.length === 0 && topics!.length === 0) return true;
    
    // Check device filter
    if (deviceIds!.length > 0 && !deviceIds!.includes(deviceId)) return false;
    
    // Check protocol filter
    if (protocols!.length > 0 && !protocols!.includes(protocol)) return false;
    
    // Check topic filter
    if (topics!.length > 0 && topic && !topics!.some(t => topic!.startsWith(t))) return false;
    
    return true;
  });
}

function validateMessage(
  message: TelemetryMessage,
  rules: ValidationRule[]
): { valid: boolean; dropped: boolean; violations: Array<{ rule: ValidationRule; value: unknown; message: string }> } {
  const violations: Array<{ rule: ValidationRule; value: unknown; message: string }> = [];
  let dropped = false;

  for (const rule of rules.filter(r => r.enabled)) {
    const value = getNestedValue(message.payload, rule.field);
    let isValid = true;

    switch (rule.type) {
      case "required":
        isValid = value !== undefined && value !== null;
        break;
      case "range":
        if (typeof value === "number") {
          isValid = (rule.config.min === undefined || value >= rule.config.min) &&
                    (rule.config.max === undefined || value <= rule.config.max);
        } else {
          isValid = false;
        }
        break;
      case "regex":
        if (typeof value === "string" && rule.config.pattern) {
          isValid = new RegExp(rule.config.pattern).test(value);
        }
        break;
      case "enum":
        isValid = rule.config.values?.includes(value) ?? true;
        break;
    }

    if (!isValid) {
      violations.push({
        rule,
        value,
        message: `Validation failed for field "${rule.field}": ${rule.type} check`,
      });
      if (rule.action === "drop") dropped = true;
    }
  }

  return { valid: violations.length === 0, dropped, violations };
}

function applyTransformation(
  payload: Record<string, unknown>,
  transform: DataTransformation
): Record<string, unknown> {
  const result = { ...payload };

  switch (transform.type) {
    case "rename": {
      const mapping = transform.config.mapping as Record<string, string> ?? {};
      for (const [oldKey, newKey] of Object.entries(mapping)) {
        if (oldKey in result) {
          result[newKey] = result[oldKey];
          delete result[oldKey];
        }
      }
      break;
    }
    case "map": {
      const fieldMapping = transform.config.fieldMapping as Record<string, (v: unknown) => unknown> ?? {};
      for (const [field, fn] of Object.entries(fieldMapping)) {
        if (field in result) {
          result[field] = typeof fn === "function" ? fn(result[field]) : result[field];
        }
      }
      break;
    }
    case "filter": {
      const includeFields = transform.config.include as string[] ?? [];
      const excludeFields = transform.config.exclude as string[] ?? [];
      if (includeFields.length > 0) {
        for (const key of Object.keys(result)) {
          if (!includeFields.includes(key)) delete result[key];
        }
      }
      for (const key of excludeFields) {
        delete result[key];
      }
      break;
    }
    case "enrich": {
      const enrichments = transform.config.enrichments as Record<string, unknown> ?? {};
      Object.assign(result, enrichments);
      break;
    }
    case "convert": {
      const conversions = transform.config.conversions as Record<string, string> ?? {};
      for (const [field, targetType] of Object.entries(conversions)) {
        if (field in result) {
          switch (targetType) {
            case "number": result[field] = Number(result[field]); break;
            case "string": result[field] = String(result[field]); break;
            case "boolean": result[field] = Boolean(result[field]); break;
          }
        }
      }
      break;
    }
    case "flatten": {
      // Flatten nested objects
      const flattened: Record<string, unknown> = {};
      flattenObject(result, "", flattened);
      return flattened;
    }
  }

  return result;
}

function routeMessage(message: TelemetryMessage, rules: RoutingRule[]): boolean {
  let routed = false;

  for (const rule of rules.filter(r => r.enabled)) {
    // Check condition
    if (rule.condition) {
      const value = getNestedValue(message.payload, rule.condition.field);
      if (!evaluateCondition(value, rule.condition.operator, rule.condition.value)) {
        continue;
      }
    }

    // Route to target (simulated)
    routed = true;
    // In production, this would send to the actual target:
    // - storage: write to database
    // - analytics: push to analytics engine
    // - webhook: HTTP POST to webhook URL
    // - digital-twin: update twin state
    // - stream: publish to message stream
  }

  return routed;
}

function addToAggregationBucket(
  pipelineId: string,
  message: TelemetryMessage,
  config: AggregationConfig
): void {
  const now = Date.now();
  const windowStart = now - (now % config.windowSizeMs);
  const bucketKey = `${pipelineId}:${windowStart}`;

  let bucket = aggregationBuckets.get(bucketKey);
  if (!bucket) {
    bucket = {
      pipelineId,
      windowStart: new Date(windowStart).toISOString(),
      windowEnd: new Date(windowStart + config.windowSizeMs).toISOString(),
      values: {},
      count: 0,
    };
    aggregationBuckets.set(bucketKey, bucket);
  }

  bucket.count++;

  for (const field of config.fields) {
    const value = getNestedValue(message.payload, field.fieldName);
    if (typeof value === "number") {
      if (!bucket.values[field.fieldName]) bucket.values[field.fieldName] = [];
      bucket.values[field.fieldName].push(value);
    }
  }
}

function createAlert(
  pipelineId: string,
  deviceId: string,
  violation: { rule: ValidationRule; value: unknown; message: string },
  payload: Record<string, unknown>
): TelemetryAlert {
  const now = new Date().toISOString();
  let severity: AlertSeverity = "warning";
  if (violation.rule.action === "drop") severity = "error";

  const alert: TelemetryAlert = {
    id: `alert_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    pipelineId,
    deviceId,
    ruleName: violation.rule.name,
    severity,
    field: violation.rule.field,
    value: violation.value,
    threshold: violation.rule.config.min ?? violation.rule.config.max ?? violation.rule.config.values,
    message: violation.message,
    acknowledged: false,
    triggeredAt: now,
  };

  alerts.push(alert);
  return alert;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(value: unknown, operator: string, target: unknown): boolean {
  switch (operator) {
    case "eq": return value === target;
    case "ne": return value !== target;
    case "gt": return typeof value === "number" && typeof target === "number" && value > target;
    case "lt": return typeof value === "number" && typeof target === "number" && value < target;
    case "gte": return typeof value === "number" && typeof target === "number" && value >= target;
    case "lte": return typeof value === "number" && typeof target === "number" && value <= target;
    case "contains": return typeof value === "string" && typeof target === "string" && value.includes(target);
    case "regex": return typeof value === "string" && typeof target === "string" && new RegExp(target).test(value);
    default: return false;
  }
}

function flattenObject(obj: Record<string, unknown>, prefix: string, result: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      flattenObject(value as Record<string, unknown>, newKey, result);
    } else {
      result[newKey] = value;
    }
  }
}

function calculateStddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

function calculateThroughput(pipeline: DataPipeline): number {
  // Simple throughput calculation based on recent processing
  return Math.round(pipeline.metrics.messagesProcessed / Math.max(1, (Date.now() - new Date(pipeline.createdAt).getTime()) / 1000));
}
