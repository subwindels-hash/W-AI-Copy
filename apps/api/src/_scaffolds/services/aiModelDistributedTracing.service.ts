/**
 * Module 107: AI Model Distributed Tracing Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides distributed tracing capabilities for AI model inference pipelines including
 * request tracing, span management, service dependency mapping, and performance
 * analysis across distributed systems.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Trace {
  id: string;
  traceId: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  rootSpan: Span;
  spans: Span[];
  status: TraceStatus;
  duration: number; // milliseconds
  startTime: string;
  endTime: string;
  tags: Record<string, string>;
  metadata: TraceMetadata;
  createdAt: string;
}

export type TraceStatus = 'ok' | 'error' | 'timeout' | 'cancelled';

export interface Span {
  id: string;
  traceId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  serviceVersion?: string;
  startTime: string;
  endTime: string;
  duration: number; // milliseconds
  status: SpanStatus;
  tags: Record<string, string>;
  logs: SpanLog[];
  events: SpanEvent[];
  references: SpanReference[];
}

export type SpanStatus = 'ok' | 'error' | 'cancelled' | 'timeout';

export interface SpanLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  fields?: Record<string, any>;
}

export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes?: Record<string, any>;
}

export interface SpanReference {
  type: 'child_of' | 'follows_from';
  traceId: string;
  spanId: string;
}

export interface TraceMetadata {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  clientIp?: string;
  userAgent?: string;
  environment: string;
  region?: string;
}

export interface TracingConfiguration {
  id: string;
  organizationId: string;
  modelId: string;
  samplingRate: number; // 0-1
  maxSpansPerTrace: number;
  maxTagLength: number;
  maxLogLength: number;
  retentionDays: number;
  excludedServices: string[];
  sensitiveTags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ServiceDependency {
  serviceName: string;
  serviceVersion?: string;
  dependencies: Array<{
    serviceName: string;
    serviceVersion?: string;
    callCount: number;
    averageLatency: number;
    errorRate: number;
  }>;
}

export interface TraceQuery {
  organizationId: string;
  modelId?: string;
  serviceName?: string;
  operationName?: string;
  status?: TraceStatus;
  minDuration?: number;
  maxDuration?: number;
  startTime: string;
  endTime: string;
  tags?: Record<string, string>;
  limit?: number;
  offset?: number;
}

export interface TraceQueryResult {
  traces: Trace[];
  total: number;
  statistics: {
    averageDuration: number;
    p50Duration: number;
    p95Duration: number;
    p99Duration: number;
    errorRate: number;
  };
}

export interface ServiceMap {
  services: ServiceNode[];
  connections: ServiceConnection[];
  timeRange: { start: string; end: string };
}

export interface ServiceNode {
  serviceName: string;
  serviceVersion?: string;
  requestCount: number;
  errorCount: number;
  averageLatency: number;
  p95Latency: number;
}

export interface ServiceConnection {
  source: string;
  target: string;
  requestCount: number;
  errorCount: number;
  averageLatency: number;
}

export interface PerformanceAnalysis {
  traceId: string;
  totalDuration: number;
  criticalPath: Span[];
  bottlenecks: Bottleneck[];
  serviceBreakdown: ServiceBreakdown[];
  recommendations: string[];
}

export interface Bottleneck {
  spanId: string;
  operationName: string;
  serviceName: string;
  duration: number;
  percentageOfTotal: number;
  reason: string;
}

export interface ServiceBreakdown {
  serviceName: string;
  totalDuration: number;
  spanCount: number;
  percentageOfTotal: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const traces = new Map<string, Trace>();
const tracingConfigurations = new Map<string, TracingConfiguration>();
const spansByTrace = new Map<string, Span[]>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateTraceId(): string {
  return randomUUID().replace(/-/g, '');
}

function generateSpanId(): string {
  return randomUUID().replace(/-/g, '').substring(0, 16);
}

function calculateDuration(startTime: string, endTime: string): number {
  return new Date(endTime).getTime() - new Date(startTime).getTime();
}

function findCriticalPath(spans: Span[]): Span[] {
  // Build span tree
  const spanMap = new Map<string, Span>();
  const childrenMap = new Map<string, Span[]>();

  for (const span of spans) {
    spanMap.set(span.id, span);
    const parentId = span.parentSpanId || 'root';
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId)!.push(span);
  }

  // Find longest path using DFS
  function findLongestPath(spanId: string): Span[] {
    const span = spanMap.get(spanId);
    if (!span) return [];

    const children = childrenMap.get(spanId) || [];
    if (children.length === 0) {
      return [span];
    }

    let longestPath: Span[] = [];
    for (const child of children) {
      const childPath = findLongestPath(child.id);
      if (childPath.reduce((sum, s) => sum + s.duration, 0) > 
          longestPath.reduce((sum, s) => sum + s.duration, 0)) {
        longestPath = childPath;
      }
    }

    return [span, ...longestPath];
  }

  const rootSpans = spans.filter(s => !s.parentSpanId);
  if (rootSpans.length === 0) return [];

  return findLongestPath(rootSpans[0].id);
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createTracingConfiguration(params: {
  organizationId: string;
  modelId: string;
  samplingRate?: number;
  maxSpansPerTrace?: number;
  retentionDays?: number;
}): TracingConfiguration {
  const now = new Date().toISOString();
  const id = randomUUID();

  const config: TracingConfiguration = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    samplingRate: params.samplingRate ?? 1.0,
    maxSpansPerTrace: params.maxSpansPerTrace ?? 1000,
    maxTagLength: 256,
    maxLogLength: 1024,
    retentionDays: params.retentionDays ?? 7,
    excludedServices: [],
    sensitiveTags: ['password', 'token', 'secret', 'api_key'],
    createdAt: now,
    updatedAt: now,
  };

  tracingConfigurations.set(id, config);
  return config;
}

export function getTracingConfiguration(id: string): TracingConfiguration | undefined {
  return tracingConfigurations.get(id);
}

export function updateTracingConfiguration(
  configId: string,
  updates: Partial<TracingConfiguration>
): TracingConfiguration {
  const config = tracingConfigurations.get(configId);
  if (!config) throw new Error(`Configuration ${configId} not found`);

  Object.assign(config, updates, { updatedAt: new Date().toISOString() });
  return config;
}

export function startTrace(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  operationName: string;
  serviceName: string;
  tags?: Record<string, string>;
  metadata?: TraceMetadata;
}): { trace: Trace; rootSpan: Span } {
  const now = new Date().toISOString();
  const traceId = generateTraceId();
  const spanId = generateSpanId();

  const rootSpan: Span = {
    id: spanId,
    traceId,
    operationName: params.operationName,
    serviceName: params.serviceName,
    startTime: now,
    endTime: now,
    duration: 0,
    status: 'ok',
    tags: params.tags || {},
    logs: [],
    events: [],
    references: [],
  };

  const trace: Trace = {
    id: randomUUID(),
    traceId,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    rootSpan,
    spans: [rootSpan],
    status: 'ok',
    duration: 0,
    startTime: now,
    endTime: now,
    tags: params.tags || {},
    metadata: params.metadata || { environment: 'production' },
    createdAt: now,
  };

  traces.set(traceId, trace);
  spansByTrace.set(traceId, [rootSpan]);

  return { trace, rootSpan };
}

export function startSpan(params: {
  traceId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  serviceVersion?: string;
  tags?: Record<string, string>;
}): Span {
  const trace = traces.get(params.traceId);
  if (!trace) throw new Error(`Trace ${params.traceId} not found`);

  const now = new Date().toISOString();
  const span: Span = {
    id: generateSpanId(),
    traceId: params.traceId,
    parentSpanId: params.parentSpanId,
    operationName: params.operationName,
    serviceName: params.serviceName,
    serviceVersion: params.serviceVersion,
    startTime: now,
    endTime: now,
    duration: 0,
    status: 'ok',
    tags: params.tags || {},
    logs: [],
    events: [],
    references: params.parentSpanId ? [
      {
        type: 'child_of',
        traceId: params.traceId,
        spanId: params.parentSpanId,
      }
    ] : [],
  };

  trace.spans.push(span);
  const spans = spansByTrace.get(params.traceId) || [];
  spans.push(span);
  spansByTrace.set(params.traceId, spans);

  return span;
}

export function finishSpan(
  traceId: string,
  spanId: string,
  status?: SpanStatus,
  tags?: Record<string, string>
): Span {
  const trace = traces.get(traceId);
  if (!trace) throw new Error(`Trace ${traceId} not found`);

  const span = trace.spans.find(s => s.id === spanId);
  if (!span) throw new Error(`Span ${spanId} not found`);

  const now = new Date().toISOString();
  span.endTime = now;
  span.duration = calculateDuration(span.startTime, now);
  
  if (status) span.status = status;
  if (tags) span.tags = { ...span.tags, ...tags };

  // Update trace duration and status
  trace.endTime = now;
  trace.duration = calculateDuration(trace.startTime, now);
  
  if (span.status === 'error' && trace.status === 'ok') {
    trace.status = 'error';
  }

  return span;
}

export function addSpanLog(
  traceId: string,
  spanId: string,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  fields?: Record<string, any>
): SpanLog {
  const trace = traces.get(traceId);
  if (!trace) throw new Error(`Trace ${traceId} not found`);

  const span = trace.spans.find(s => s.id === spanId);
  if (!span) throw new Error(`Span ${spanId} not found`);

  const log: SpanLog = {
    timestamp: new Date().toISOString(),
    level,
    message,
    fields,
  };

  span.logs.push(log);
  return log;
}

export function addSpanEvent(
  traceId: string,
  spanId: string,
  name: string,
  attributes?: Record<string, any>
): SpanEvent {
  const trace = traces.get(traceId);
  if (!trace) throw new Error(`Trace ${traceId} not found`);

  const span = trace.spans.find(s => s.id === spanId);
  if (!span) throw new Error(`Span ${spanId} not found`);

  const event: SpanEvent = {
    name,
    timestamp: new Date().toISOString(),
    attributes,
  };

  span.events.push(event);
  return event;
}

export function getTrace(traceId: string): Trace | undefined {
  return traces.get(traceId);
}

export function queryTraces(query: TraceQuery): TraceQueryResult {
  let result = Array.from(traces.values()).filter(t => {
    if (t.organizationId !== query.organizationId) return false;
    if (query.modelId && t.modelId !== query.modelId) return false;
    
    const startTime = new Date(t.startTime).getTime();
    const queryStart = new Date(query.startTime).getTime();
    const queryEnd = new Date(query.endTime).getTime();
    
    if (startTime < queryStart || startTime > queryEnd) return false;
    
    if (query.status && t.status !== query.status) return false;
    if (query.minDuration && t.duration < query.minDuration) return false;
    if (query.maxDuration && t.duration > query.maxDuration) return false;
    
    if (query.serviceName) {
      const hasService = t.spans.some(s => s.serviceName === query.serviceName);
      if (!hasService) return false;
    }
    
    if (query.operationName) {
      const hasOperation = t.spans.some(s => s.operationName === query.operationName);
      if (!hasOperation) return false;
    }
    
    if (query.tags) {
      for (const [key, value] of Object.entries(query.tags)) {
        if (t.tags[key] !== value) return false;
      }
    }
    
    return true;
  });

  const total = result.length;

  // Calculate statistics
  const durations = result.map(t => t.duration).sort((a, b) => a - b);
  const errorCount = result.filter(t => t.status === 'error').length;

  const statistics = {
    averageDuration: durations.length > 0 ? 
      durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    p50Duration: durations[Math.floor(durations.length * 0.5)] || 0,
    p95Duration: durations[Math.floor(durations.length * 0.95)] || 0,
    p99Duration: durations[Math.floor(durations.length * 0.99)] || 0,
    errorRate: durations.length > 0 ? (errorCount / durations.length) * 100 : 0,
  };

  // Apply pagination
  const limit = query.limit || 100;
  const offset = query.offset || 0;
  result = result.slice(offset, offset + limit);

  return {
    traces: result,
    total,
    statistics,
  };
}

export function getServiceMap(
  organizationId: string,
  startTime: string,
  endTime: string
): ServiceMap {
  const relevantTraces = Array.from(traces.values()).filter(t => {
    if (t.organizationId !== organizationId) return false;
    const ts = new Date(t.startTime).getTime();
    return ts >= new Date(startTime).getTime() && ts <= new Date(endTime).getTime();
  });

  const serviceStats = new Map<string, {
    requestCount: number;
    errorCount: number;
    latencies: number[];
  }>();

  const connectionStats = new Map<string, {
    requestCount: number;
    errorCount: number;
    latencies: number[];
  }>();

  for (const trace of relevantTraces) {
    for (const span of trace.spans) {
      // Service stats
      if (!serviceStats.has(span.serviceName)) {
        serviceStats.set(span.serviceName, {
          requestCount: 0,
          errorCount: 0,
          latencies: [],
        });
      }
      const serviceStat = serviceStats.get(span.serviceName)!;
      serviceStat.requestCount++;
      if (span.status === 'error') serviceStat.errorCount++;
      serviceStat.latencies.push(span.duration);

      // Connection stats
      if (span.parentSpanId) {
        const parentSpan = trace.spans.find(s => s.id === span.parentSpanId);
        if (parentSpan && parentSpan.serviceName !== span.serviceName) {
          const key = `${parentSpan.serviceName}->${span.serviceName}`;
          if (!connectionStats.has(key)) {
            connectionStats.set(key, {
              requestCount: 0,
              errorCount: 0,
              latencies: [],
            });
          }
          const connStat = connectionStats.get(key)!;
          connStat.requestCount++;
          if (span.status === 'error') connStat.errorCount++;
          connStat.latencies.push(span.duration);
        }
      }
    }
  }

  const services: ServiceNode[] = Array.from(serviceStats.entries()).map(([name, stats]) => {
    const sortedLatencies = stats.latencies.sort((a, b) => a - b);
    return {
      serviceName: name,
      requestCount: stats.requestCount,
      errorCount: stats.errorCount,
      averageLatency: stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length,
      p95Latency: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
    };
  });

  const connections: ServiceConnection[] = Array.from(connectionStats.entries()).map(([key, stats]) => {
    const [source, target] = key.split('->');
    return {
      source,
      target,
      requestCount: stats.requestCount,
      errorCount: stats.errorCount,
      averageLatency: stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length,
    };
  });

  return {
    services,
    connections,
    timeRange: { start: startTime, end: endTime },
  };
}

export function analyzeTracePerformance(traceId: string): PerformanceAnalysis {
  const trace = traces.get(traceId);
  if (!trace) throw new Error(`Trace ${traceId} not found`);

  const criticalPath = findCriticalPath(trace.spans);
  
  // Identify bottlenecks
  const bottlenecks: Bottleneck[] = trace.spans
    .filter(s => s.duration > trace.duration * 0.1) // Spans taking >10% of total time
    .map(s => ({
      spanId: s.id,
      operationName: s.operationName,
      serviceName: s.serviceName,
      duration: s.duration,
      percentageOfTotal: (s.duration / trace.duration) * 100,
      reason: s.duration > 1000 ? 'High latency operation' : 'Frequent operation',
    }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5);

  // Service breakdown
  const serviceDurations = new Map<string, { duration: number; count: number }>();
  for (const span of trace.spans) {
    if (!serviceDurations.has(span.serviceName)) {
      serviceDurations.set(span.serviceName, { duration: 0, count: 0 });
    }
    const stat = serviceDurations.get(span.serviceName)!;
    stat.duration += span.duration;
    stat.count++;
  }

  const serviceBreakdown: ServiceBreakdown[] = Array.from(serviceDurations.entries())
    .map(([name, stats]) => ({
      serviceName: name,
      totalDuration: stats.duration,
      spanCount: stats.count,
      percentageOfTotal: (stats.duration / trace.duration) * 100,
    }))
    .sort((a, b) => b.totalDuration - a.totalDuration);

  // Generate recommendations
  const recommendations: string[] = [];
  
  if (bottlenecks.length > 0 && bottlenecks[0].percentageOfTotal > 50) {
    recommendations.push(
      `Optimize ${bottlenecks[0].operationName} in ${bottlenecks[0].serviceName} - it takes ${bottlenecks[0].percentageOfTotal.toFixed(1)}% of total time`
    );
  }

  const errorSpans = trace.spans.filter(s => s.status === 'error');
  if (errorSpans.length > 0) {
    recommendations.push(
      `Investigate ${errorSpans.length} error spans, particularly in ${errorSpans[0].serviceName}`
    );
  }

  if (trace.spans.length > 50) {
    recommendations.push(
      'Consider reducing the number of service calls - trace has high span count'
    );
  }

  return {
    traceId,
    totalDuration: trace.duration,
    criticalPath,
    bottlenecks,
    serviceBreakdown,
    recommendations,
  };
}

export function getServiceDependencies(
  organizationId: string,
  modelId: string,
  startTime: string,
  endTime: string
): ServiceDependency[] {
  const relevantTraces = Array.from(traces.values()).filter(t => {
    if (t.organizationId !== organizationId) return false;
    if (t.modelId !== modelId) return false;
    const ts = new Date(t.startTime).getTime();
    return ts >= new Date(startTime).getTime() && ts <= new Date(endTime).getTime();
  });

  const dependencies = new Map<string, Map<string, {
    callCount: number;
    latencies: number[];
    errorCount: number;
  }>>();

  for (const trace of relevantTraces) {
    for (const span of trace.spans) {
      if (span.parentSpanId) {
        const parentSpan = trace.spans.find(s => s.id === span.parentSpanId);
        if (parentSpan && parentSpan.serviceName !== span.serviceName) {
          if (!dependencies.has(parentSpan.serviceName)) {
            dependencies.set(parentSpan.serviceName, new Map());
          }
          const parentDeps = dependencies.get(parentSpan.serviceName)!;
          
          if (!parentDeps.has(span.serviceName)) {
            parentDeps.set(span.serviceName, {
              callCount: 0,
              latencies: [],
              errorCount: 0,
            });
          }
          
          const dep = parentDeps.get(span.serviceName)!;
          dep.callCount++;
          dep.latencies.push(span.duration);
          if (span.status === 'error') dep.errorCount++;
        }
      }
    }
  }

  return Array.from(dependencies.entries()).map(([serviceName, deps]) => ({
    serviceName,
    dependencies: Array.from(deps.entries()).map(([depName, stats]) => ({
      serviceName: depName,
      callCount: stats.callCount,
      averageLatency: stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length,
      errorRate: (stats.errorCount / stats.callCount) * 100,
    })),
  }));
}
