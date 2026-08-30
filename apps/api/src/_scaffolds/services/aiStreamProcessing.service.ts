/**
 * Module 101: AI Stream Processing Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides real-time stream processing for AI model events including event ingestion,
 * windowed aggregation, stream transformations, event routing, and real-time
 * analytics computation for live AI platform monitoring.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiStreamProcessing');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface StreamPipeline {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: PipelineStatus;
  sources: StreamSource[];
  processors: StreamProcessor[];
  sinks: StreamSink[];
  config: PipelineConfig;
  metrics: PipelineMetrics;
  createdAt: string;
  updatedAt: string;
}

export type PipelineStatus = 'stopped' | 'starting' | 'running' | 'paused' | 'error' | 'stopping';

export interface StreamSource {
  id: string;
  type: 'model_event' | 'metric' | 'log' | 'custom';
  topic: string;
  filter?: StreamFilter;
  deserialization: 'json' | 'avro' | 'protobuf' | 'raw';
}

export interface StreamFilter {
  conditions: FilterCondition[];
  operator: 'and' | 'or';
}

export interface FilterCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'regex';
  value: any;
}

export interface StreamProcessor {
  id: string;
  type: ProcessorType;
  config: Record<string, any>;
  order: number;
}

export type ProcessorType =
  | 'aggregation'
  | 'transformation'
  | 'filter'
  | 'enrichment'
  | 'windowing'
  | 'join'
  | 'alerting'
  | 'ml_inference';

export interface StreamSink {
  id: string;
  type: 'dashboard' | 'database' | 'webhook' | 'alert' | 'storage' | 'downstream_pipeline';
  config: Record<string, any>;
  batchSize: number;
  flushIntervalMs: number;
}

export interface PipelineConfig {
  parallelism: number;
  checkpointIntervalMs: number;
  maxOutOfOrdernessMs: number;
  watermarkStrategy: 'event_time' | 'processing_time';
  backpressureEnabled: boolean;
  maxBacklogSize: number;
  errorHandling: 'skip' | 'retry' | 'dead_letter_queue';
}

export interface PipelineMetrics {
  eventsProcessed: number;
  eventsPerSecond: number;
  processingLatencyMs: number;
  backpressureRatio: number;
  errorRate: number;
  uptime: number;
  lastCheckpointAt?: string;
}

export interface StreamEvent {
  id: string;
  pipelineId: string;
  timestamp: string;
  source: string;
  type: string;
  data: Record<string, any>;
  metadata: EventMetadata;
}

export interface EventMetadata {
  eventId: string;
  sequenceNumber: number;
  partition: number;
  processingTimeMs: number;
  pipelineId: string;
  traceId?: string;
}

export interface WindowedAggregation {
  id: string;
  pipelineId: string;
  windowType: 'tumbling' | 'sliding' | 'session';
  windowSize: string;
  windowStart: string;
  windowEnd: string;
  aggregations: AggregationResult[];
  eventCount: number;
  computedAt: string;
}

export interface AggregationResult {
  field: string;
  function: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'percentile' | 'distinct_count';
  value: number;
  parameters?: Record<string, any>;
}

export interface DeadLetterEvent {
  id: string;
  pipelineId: string;
  originalEvent: StreamEvent;
  error: string;
  processorId: string;
  timestamp: string;
  retryCount: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const streamPipelines = new Map<string, StreamPipeline>();
const streamEvents = new Map<string, StreamEvent[]>();
const windowedAggregations = new Map<string, WindowedAggregation[]>();
const deadLetterQueues = new Map<string, DeadLetterEvent[]>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createStreamPipeline(params: {
  organizationId: string;
  name: string;
  description?: string;
  sources: Omit<StreamSource, 'id'>[];
  processors: Omit<StreamProcessor, 'id'>[];
  sinks: Omit<StreamSink, 'id'>[];
  config?: Partial<PipelineConfig>;
}): StreamPipeline {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultConfig: PipelineConfig = {
    parallelism: 4,
    checkpointIntervalMs: 60000,
    maxOutOfOrdernessMs: 5000,
    watermarkStrategy: 'event_time',
    backpressureEnabled: true,
    maxBacklogSize: 10000,
    errorHandling: 'dead_letter_queue',
  };

  const pipeline: StreamPipeline = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'stopped',
    sources: params.sources.map(s => ({ ...s, id: randomUUID() })),
    processors: params.processors.map(p => ({ ...p, id: randomUUID() })),
    sinks: params.sinks.map(s => ({ ...s, id: randomUUID() })),
    config: { ...defaultConfig, ...params.config },
    metrics: {
      eventsProcessed: 0,
      eventsPerSecond: 0,
      processingLatencyMs: 0,
      backpressureRatio: 0,
      errorRate: 0,
      uptime: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  streamPipelines.set(id, pipeline);
  streamEvents.set(id, []);
  windowedAggregations.set(id, []);
  deadLetterQueues.set(id, []);
  return pipeline;
}

export function getStreamPipeline(id: string): StreamPipeline | undefined {
  return streamPipelines.get(id);
}

export function listStreamPipelines(organizationId: string): StreamPipeline[] {
  return Array.from(streamPipelines.values()).filter(p => p.organizationId === organizationId);
}

export function startPipeline(pipelineId: string): StreamPipeline {
  const pipeline = streamPipelines.get(pipelineId);
  if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`);
  if (pipeline.status === 'running') throw new Error(`Pipeline ${pipelineId} is already running`);

  pipeline.status = 'running';
  pipeline.updatedAt = new Date().toISOString();
  return pipeline;
}

export function stopPipeline(pipelineId: string): StreamPipeline {
  const pipeline = streamPipelines.get(pipelineId);
  if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`);
  if (pipeline.status !== 'running') throw new Error(`Pipeline ${pipelineId} is not running`);

  pipeline.status = 'stopped';
  pipeline.updatedAt = new Date().toISOString();
  return pipeline;
}

export function pausePipeline(pipelineId: string): StreamPipeline {
  const pipeline = streamPipelines.get(pipelineId);
  if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`);
  if (pipeline.status !== 'running') throw new Error(`Pipeline ${pipelineId} is not running`);

  pipeline.status = 'paused';
  pipeline.updatedAt = new Date().toISOString();
  return pipeline;
}

export function ingestEvent(
  pipelineId: string,
  params: { source: string; type: string; data: Record<string, any> }
): StreamEvent {
  const pipeline = streamPipelines.get(pipelineId);
  if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`);
  if (pipeline.status !== 'running') throw new Error(`Pipeline ${pipelineId} is not running`);

  const now = new Date().toISOString();
  const events = streamEvents.get(pipelineId) || [];

  const event: StreamEvent = {
    id: randomUUID(),
    pipelineId,
    timestamp: now,
    source: params.source,
    type: params.type,
    data: params.data,
    metadata: {
      eventId: randomUUID(),
      sequenceNumber: events.length,
      partition: Math.floor(_rng.next() * pipeline.config.parallelism),
      processingTimeMs: _rng.next() * 10,
      pipelineId,
      traceId: randomUUID(),
    },
  };

  events.push(event);
  if (events.length > 10000) events.shift(); // Keep last 10k events

  // Update metrics
  pipeline.metrics.eventsProcessed += 1;
  pipeline.metrics.eventsPerSecond = events.length > 1
    ? events.length / ((new Date(events[events.length - 1].timestamp).getTime() - new Date(events[0].timestamp).getTime()) / 1000)
    : 0;
  pipeline.metrics.processingLatencyMs = event.metadata.processingTimeMs;
  pipeline.updatedAt = now;

  return event;
}

export function computeWindowedAggregation(
  pipelineId: string,
  params: {
    windowType: 'tumbling' | 'sliding' | 'session';
    windowSize: string;
    fields: Array<{ field: string; function: string; parameters?: Record<string, any> }>;
  }
): WindowedAggregation {
  const pipeline = streamPipelines.get(pipelineId);
  if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`);

  const events = streamEvents.get(pipelineId) || [];
  const now = new Date();
  const windowMs = parseWindowSize(params.windowSize);
  const windowStart = new Date(now.getTime() - windowMs);

  const windowEvents = events.filter(e => new Date(e.timestamp) >= windowStart);

  const aggregations: AggregationResult[] = params.fields.map(f => {
    const values = windowEvents.map(e => (e.data as any)[f.field]).filter(v => typeof v === 'number');

    let value = 0;
    switch (f.function) {
      case 'count': value = windowEvents.length; break;
      case 'sum': value = values.reduce((a, b) => a + b, 0); break;
      case 'avg': value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0; break;
      case 'min': value = values.length > 0 ? Math.min(...values) : 0; break;
      case 'max': value = values.length > 0 ? Math.max(...values) : 0; break;
      case 'distinct_count': value = new Set(windowEvents.map(e => (e.data as any)[f.field])).size; break;
      default: value = 0;
    }

    return {
      field: f.field,
      function: f.function as any,
      value,
      parameters: f.parameters,
    };
  });

  const aggregation: WindowedAggregation = {
    id: randomUUID(),
    pipelineId,
    windowType: params.windowType,
    windowSize: params.windowSize,
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    aggregations,
    eventCount: windowEvents.length,
    computedAt: now.toISOString(),
  };

  const aggregationsList = windowedAggregations.get(pipelineId) || [];
  aggregationsList.push(aggregation);
  if (aggregationsList.length > 1000) aggregationsList.shift();

  return aggregation;
}

function parseWindowSize(size: string): number {
  const match = size.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 60000;
  const value = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 60000;
  }
}

export function getPipelineEvents(
  pipelineId: string,
  limit: number = 100,
  offset: number = 0
): StreamEvent[] {
  const events = streamEvents.get(pipelineId) || [];
  return events.slice(-limit - offset, events.length - offset).reverse();
}

export function getWindowedAggregations(pipelineId: string, limit: number = 100): WindowedAggregation[] {
  const aggregations = windowedAggregations.get(pipelineId) || [];
  return aggregations.slice(-limit).reverse();
}

export function getDeadLetterQueue(pipelineId: string): DeadLetterEvent[] {
  return deadLetterQueues.get(pipelineId) || [];
}

export function reprocessDeadLetter(pipelineId: string, deadLetterId: string): StreamEvent | null {
  const dlq = deadLetterQueues.get(pipelineId) || [];
  const index = dlq.findIndex(d => d.id === deadLetterId);
  if (index === -1) return null;

  const deadLetter = dlq[index];
  dlq.splice(index, 1);

  // Re-ingest the original event
  return ingestEvent(pipelineId, {
    source: deadLetter.originalEvent.source,
    type: deadLetter.originalEvent.type,
    data: deadLetter.originalEvent.data,
  });
}

export function getPipelineMetrics(pipelineId: string): PipelineMetrics {
  const pipeline = streamPipelines.get(pipelineId);
  if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`);
  return pipeline.metrics;
}
