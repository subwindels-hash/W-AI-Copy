/**
 * Module 60: AI Distributed Tracing Service
 *
 * Provides AI-specific distributed tracing including inference span types (preprocessing,
 * tokenization, model-inference, postprocessing, GPU-kernel), cross-service trace
 * propagation for model chaining and ensembles, AI-specific span attributes (model,
 * tokens, batch size, GPU utilization), trace search and filtering, trace-level
 * analytics with bottleneck identification, and intelligent sampling strategies.
 *
 * Phase 1 — Critical Gap: AI-specific distributed tracing infrastructure
 */

import { randomUUID, randomBytes } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AISpanType = "inference" | "preprocessing" | "postprocessing" | "tokenization" | "model-loading" | "gpu-kernel" | "batching" | "model-chaining" | "ensemble" | "embedding-lookup" | "decoding" | "validation" | "routing" | "fallback" | "custom";

export type SpanKind = "server" | "client" | "internal" | "producer" | "consumer";

export type SpanStatus = "ok" | "error" | "timeout" | "cancelled";

export type SamplingStrategy = "always-on" | "rate-limiting" | "latency-based" | "error-based" | "probabilistic" | "adaptive";

export type TraceType = "single-model" | "model-chain" | "ensemble" | "multi-step" | "streaming";

export interface AITrace {
  id: string;
  traceId: string;
  organizationId: string;
  name: string;
  traceType: TraceType;
  rootSpan: AISpan;
  spans: AISpan[];
  totalDurationMs: number;
  spanCount: number;
  errorCount: number;
  models: string[];
  inputTokens?: number;
  outputTokens?: number;
  tags: Record<string, string>;
  sampledBy: SamplingStrategy;
  startedAt: string;
  completedAt?: string;
}

export interface AISpan {
  id: string;
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  spanType: AISpanType;
  kind: SpanKind;
  status: SpanStatus;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  attributes: AISpanAttributes;
  events: SpanEvent[];
  links: SpanLink[];
  children: string[];
  errorMessage?: string;
  statusCode?: number;
}

export interface AISpanAttributes {
  "ai.model.name"?: string;
  "ai.model.version"?: string;
  "ai.model.framework"?: string;
  "ai.model.size_bytes"?: number;
  "ai.input.tokens"?: number;
  "ai.output.tokens"?: number;
  "ai.batch.size"?: number;
  "ai.request.count"?: number;
  "ai.gpu.utilization"?: number;
  "ai.gpu.memory_used_mb"?: number;
  "ai.inference.latency_ms"?: number;
  "ai.preprocessing.latency_ms"?: number;
  "ai.postprocessing.latency_ms"?: number;
  "ai.queue.wait_ms"?: number;
  "ai.endpoint"?: string;
  "ai.deployment_id"?: string;
  "ai.hardware"?: string;
  "ai.precision"?: string;
  "ai.response.quality_score"?: number;
  "ai.fallback.used"?: boolean;
  "ai.fallback.model"?: string;
  "http.method"?: string;
  "http.url"?: string;
  "http.status_code"?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes: Record<string, string | number | boolean>;
}

export interface SpanLink {
  traceId: string;
  spanId: string;
  relationship: "parent" | "follows-from" | "caused-by" | "correlated";
  attributes?: Record<string, string>;
}

export interface TraceSearchResult {
  traces: AITrace[];
  totalCount: number;
  query: TraceSearchQuery;
}

export interface TraceSearchQuery {
  organizationId: string;
  modelName?: string;
  spanType?: AISpanType;
  minDurationMs?: number;
  maxDurationMs?: number;
  status?: SpanStatus;
  tags?: Record<string, string>;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

export interface TraceAnalytics {
  totalTraces: number;
  averageDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  errorRate: number;
  tracesByType: Record<string, number>;
  tracesByModel: Record<string, number>;
  spanTypeBreakdown: Record<string, { count: number; avgDurationMs: number }>;
  bottleneckSpans: Array<{ spanType: string; modelName: string; avgDurationMs: number; count: number }>;
  slowestTraces: Array<{ traceId: string; name: string; durationMs: number; errorCount: number }>;
  tokenThroughput: { inputPerSecond: number; outputPerSecond: number };
}

export interface SamplingConfig {
  strategy: SamplingStrategy;
  rateLimitPerSecond?: number;
  probabilityPercent?: number;
  latencyThresholdMs?: number;
  errorSamplingEnabled: boolean;
  adaptiveTargetRate?: number;
}

export interface TracingStats {
  totalTraces: number;
  totalSpans: number;
  sampledTraces: number;
  samplingRate: number;
  averageSpansPerTrace: number;
  averageTraceDurationMs: number;
  errorTraceRate: number;
  topModels: Record<string, number>;
  topSpanTypes: Record<string, number>;
  tracesByType: Record<string, number>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const traces = new Map<string, AITrace>();
const spanIndex = new Map<string, AISpan>();
const MAX_TRACES = 2000;

// ─── Service Implementation ───────────────────────────────────────────────────

function hex(n: number) { return randomBytes(n).toString("hex"); }

/**
 * Start a new AI trace
 */
export async function startAITrace(params: {
  organizationId: string;
  name: string;
  traceType: TraceType;
  rootSpanName: string;
  rootSpanType: AISpanType;
  attributes?: AISpanAttributes;
  tags?: Record<string, string>;
  samplingConfig?: SamplingConfig;
}): Promise<{ trace: AITrace; rootSpan: AISpan }> {
  const traceId = hex(16);
  const spanId = hex(8);
  const now = new Date().toISOString();

  const rootSpan: AISpan = {
    id: `span_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    spanId,
    traceId,
    name: params.rootSpanName,
    spanType: params.rootSpanType,
    kind: "server",
    status: "ok",
    startTime: now,
    attributes: params.attributes ?? {},
    events: [],
    links: [],
    children: [],
  };

  const trace: AITrace = {
    id: `trace_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    traceId,
    organizationId: params.organizationId,
    name: params.name,
    traceType: params.traceType,
    rootSpan,
    spans: [rootSpan],
    totalDurationMs: 0,
    spanCount: 1,
    errorCount: 0,
    models: params.attributes?.["ai.model.name"] ? [params.attributes["ai.model.name"]] : [],
    tags: params.tags ?? {},
    sampledBy: params.samplingConfig?.strategy ?? "always-on",
    startedAt: now,
  };

  spanIndex.set(spanId, rootSpan);
  traces.set(trace.id, trace);
  enforceMaxTraces();

  return { trace, rootSpan };
}

/**
 * Add a child span to an existing span
 */
export async function addSpan(params: {
  traceId: string;
  parentSpanId: string;
  name: string;
  spanType: AISpanType;
  kind?: SpanKind;
  attributes?: AISpanAttributes;
}): Promise<AISpan | null> {
  const trace = findTraceByTraceId(params.traceId);
  if (!trace) return null;

  const parentSpan = spanIndex.get(params.parentSpanId);
  if (!parentSpan) return null;

  const spanId = hex(8);
  const now = new Date().toISOString();

  const span: AISpan = {
    id: `span_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    spanId,
    traceId: params.traceId,
    parentSpanId: params.parentSpanId,
    name: params.name,
    spanType: params.spanType,
    kind: params.kind ?? "internal",
    status: "ok",
    startTime: now,
    attributes: params.attributes ?? {},
    events: [],
    links: [],
    children: [],
  };

  parentSpan.children.push(spanId);
  trace.spans.push(span);
  trace.spanCount++;

  if (params.attributes?.["ai.model.name"] && !trace.models.includes(params.attributes["ai.model.name"])) {
    trace.models.push(params.attributes["ai.model.name"]);
  }

  spanIndex.set(spanId, span);
  traces.set(trace.id, trace);
  return span;
}

/**
 * End a span with status and optional error
 */
export async function endSpan(params: {
  spanId: string;
  status: SpanStatus;
  errorMessage?: string;
  statusCode?: number;
  additionalAttributes?: AISpanAttributes;
  events?: SpanEvent[];
}): Promise<AISpan | null> {
  const span = spanIndex.get(params.spanId);
  if (!span) return null;

  const now = new Date().toISOString();
  span.endTime = now;
  span.durationMs = new Date(now).getTime() - new Date(span.startTime).getTime();
  span.status = params.status;
  span.errorMessage = params.errorMessage;
  span.statusCode = params.statusCode;

  if (params.additionalAttributes) {
    Object.assign(span.attributes, params.additionalAttributes);
  }
  if (params.events) {
    span.events.push(...params.events);
  }

  // Update trace metrics
  const trace = findTraceByTraceId(span.traceId);
  if (trace) {
    if (params.status === "error") trace.errorCount++;
    trace.totalDurationMs = Math.max(trace.totalDurationMs, span.durationMs);

    if (span.attributes["ai.input.tokens"]) {
      trace.inputTokens = (trace.inputTokens ?? 0) + (span.attributes["ai.input.tokens"] as number);
    }
    if (span.attributes["ai.output.tokens"]) {
      trace.outputTokens = (trace.outputTokens ?? 0) + (span.attributes["ai.output.tokens"] as number);
    }

    // Complete trace if root span ended
    if (!span.parentSpanId) {
      trace.completedAt = now;
    }

    traces.set(trace.id, trace);
  }

  return span;
}

/**
 * Search traces with filters
 */
export async function searchTraces(query: TraceSearchQuery): Promise<TraceSearchResult> {
  let result = Array.from(traces.values()).filter(t => t.organizationId === query.organizationId);

  if (query.modelName) result = result.filter(t => t.models.includes(query.modelName!));
  if (query.spanType) result = result.filter(t => t.spans.some(s => s.spanType === query.spanType));
  if (query.minDurationMs) result = result.filter(t => t.totalDurationMs >= query.minDurationMs!);
  if (query.maxDurationMs) result = result.filter(t => t.totalDurationMs <= query.maxDurationMs!);
  if (query.status) result = result.filter(t => t.spans.some(s => s.status === query.status));
  if (query.startTime) result = result.filter(t => t.startedAt >= query.startTime!);
  if (query.endTime) result = result.filter(t => t.startedAt <= query.endTime!);
  if (query.tags) {
    for (const [k, v] of Object.entries(query.tags)) {
      result = result.filter(t => t.tags[k] === v);
    }
  }

  const totalCount = result.length;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 50;
  result = result.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(offset, offset + limit);

  return { traces: result, totalCount, query };
}

/**
 * Get trace analytics for an organization
 */
export async function getTraceAnalytics(organizationId: string): Promise<TraceAnalytics> {
  const all = Array.from(traces.values()).filter(t => t.organizationId === organizationId);
  const completed = all.filter(t => t.completedAt);

  const durations = completed.map(t => t.totalDurationMs).sort((a, b) => a - b);
  const errors = all.filter(t => t.errorCount > 0);

  const tracesByType: Record<string, number> = {};
  const tracesByModel: Record<string, number> = {};
  const spanTypeStats: Record<string, { totalDuration: number; count: number }> = {};
  const modelSpanStats: Record<string, { totalDuration: number; count: number }> = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTimeSeconds = 0;

  for (const trace of all) {
    tracesByType[trace.traceType] = (tracesByType[trace.traceType] || 0) + 1;
    for (const model of trace.models) {
      tracesByModel[model] = (tracesByModel[model] || 0) + 1;
    }
    totalInputTokens += trace.inputTokens ?? 0;
    totalOutputTokens += trace.outputTokens ?? 0;
    if (trace.completedAt) {
      totalTimeSeconds += (new Date(trace.completedAt).getTime() - new Date(trace.startedAt).getTime()) / 1000;
    }

    for (const span of trace.spans) {
      if (span.durationMs) {
        if (!spanTypeStats[span.spanType]) spanTypeStats[span.spanType] = { totalDuration: 0, count: 0 };
        spanTypeStats[span.spanType].totalDuration += span.durationMs;
        spanTypeStats[span.spanType].count++;

        const model = span.attributes["ai.model.name"] as string;
        if (model) {
          const key = `${span.spanType}:${model}`;
          if (!modelSpanStats[key]) modelSpanStats[key] = { totalDuration: 0, count: 0 };
          modelSpanStats[key].totalDuration += span.durationMs;
          modelSpanStats[key].count++;
        }
      }
    }
  }

  const spanTypeBreakdown: TraceAnalytics["spanTypeBreakdown"] = {};
  for (const [type, stats] of Object.entries(spanTypeStats)) {
    spanTypeBreakdown[type] = { count: stats.count, avgDurationMs: Math.round(stats.totalDuration / stats.count * 100) / 100 };
  }

  const bottleneckSpans = Object.entries(modelSpanStats)
    .map(([key, stats]) => {
      const [spanType, modelName] = key.split(":");
      return { spanType, modelName, avgDurationMs: Math.round(stats.totalDuration / stats.count * 100) / 100, count: stats.count };
    })
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, 10);

  const slowestTraces = all
    .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
    .slice(0, 10)
    .map(t => ({ traceId: t.traceId, name: t.name, durationMs: t.totalDurationMs, errorCount: t.errorCount }));

  return {
    totalTraces: all.length,
    averageDurationMs: durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length * 100) / 100 : 0,
    p50DurationMs: durations[Math.floor(durations.length * 0.5)] ?? 0,
    p95DurationMs: durations[Math.floor(durations.length * 0.95)] ?? 0,
    p99DurationMs: durations[Math.floor(durations.length * 0.99)] ?? 0,
    errorRate: all.length > 0 ? Math.round((errors.length / all.length) * 10000) / 100 : 0,
    tracesByType,
    tracesByModel,
    spanTypeBreakdown,
    bottleneckSpans,
    slowestTraces,
    tokenThroughput: {
      inputPerSecond: totalTimeSeconds > 0 ? Math.round(totalInputTokens / totalTimeSeconds * 100) / 100 : 0,
      outputPerSecond: totalTimeSeconds > 0 ? Math.round(totalOutputTokens / totalTimeSeconds * 100) / 100 : 0,
    },
  };
}

/**
 * Get a full trace by trace ID
 */
export async function getTrace(traceId: string): Promise<AITrace | null> {
  return findTraceByTraceId(traceId);
}

/**
 * Get tracing statistics
 */
export async function getTracingStats(organizationId: string): Promise<TracingStats> {
  const all = Array.from(traces.values()).filter(t => t.organizationId === organizationId);
  const totalSpans = all.reduce((s, t) => s + t.spanCount, 0);
  const errorTraces = all.filter(t => t.errorCount > 0);
  const topModels: Record<string, number> = {};
  const topSpanTypes: Record<string, number> = {};
  const tracesByType: Record<string, number> = {};

  for (const t of all) {
    tracesByType[t.traceType] = (tracesByType[t.traceType] || 0) + 1;
    for (const m of t.models) topModels[m] = (topModels[m] || 0) + 1;
    for (const s of t.spans) topSpanTypes[s.spanType] = (topSpanTypes[s.spanType] || 0) + 1;
  }

  return {
    totalTraces: all.length,
    totalSpans,
    sampledTraces: all.filter(t => t.sampledBy !== "always-on").length,
    samplingRate: all.length > 0 ? Math.round((all.filter(t => t.sampledBy !== "always-on").length / all.length) * 10000) / 100 : 0,
    averageSpansPerTrace: all.length > 0 ? Math.round(totalSpans / all.length * 100) / 100 : 0,
    averageTraceDurationMs: all.length > 0 ? Math.round(all.reduce((s, t) => s + t.totalDurationMs, 0) / all.length * 100) / 100 : 0,
    errorTraceRate: all.length > 0 ? Math.round((errorTraces.length / all.length) * 10000) / 100 : 0,
    topModels,
    topSpanTypes,
    tracesByType,
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function findTraceByTraceId(traceId: string): AITrace | null {
  for (const trace of traces.values()) {
    if (trace.traceId === traceId) return trace;
  }
  return null;
}

function enforceMaxTraces(): void {
  if (traces.size <= MAX_TRACES) return;
  const sorted = Array.from(traces.entries()).sort((a, b) => a[1].startedAt.localeCompare(b[1].startedAt));
  const toRemove = sorted.slice(0, sorted.length - MAX_TRACES);
  for (const [key] of toRemove) {
    traces.delete(key);
  }
}
