/**
 * Module 113: AI Model Integration Hub Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides external integration management for AI models including webhooks,
 * connectors, third-party integrations, event routing, and integration monitoring.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiModelIntegrationHub');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Integration {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: IntegrationType;
  provider: string;
  status: IntegrationStatus;
  configuration: IntegrationConfiguration;
  authentication: IntegrationAuth;
  endpoints: IntegrationEndpoint[];
  webhooks: Webhook[];
  monitoring: IntegrationMonitoring;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationType =
  | 'webhook'
  | 'api'
  | 'message_queue'
  | 'database'
  | 'storage'
  | 'monitoring'
  | 'notification'
  | 'analytics'
  | 'custom';

export type IntegrationStatus = 'active' | 'inactive' | 'error' | 'pending' | 'deprecated';

export interface IntegrationConfiguration {
  baseUrl?: string;
  timeout: number; // milliseconds
  retryPolicy: RetryPolicy;
  rateLimit?: RateLimit;
  headers?: Record<string, string>;
  customConfig?: Record<string, any>;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffType: 'fixed' | 'exponential' | 'linear';
  initialDelay: number; // milliseconds
  maxDelay: number; // milliseconds
}

export interface RateLimit {
  requests: number;
  period: 'second' | 'minute' | 'hour' | 'day';
  burst?: number;
}

export interface IntegrationAuth {
  type: 'none' | 'api_key' | 'bearer_token' | 'basic' | 'oauth2' | 'custom';
  credentials?: Record<string, string>;
  tokenEndpoint?: string;
  refreshToken?: string;
  tokenExpiry?: string;
}

export interface IntegrationEndpoint {
  id: string;
  name: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  description?: string;
  requestSchema?: Record<string, any>;
  responseSchema?: Record<string, any>;
  enabled: boolean;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret?: string;
  headers?: Record<string, string>;
  active: boolean;
  retryPolicy: RetryPolicy;
  lastTriggeredAt?: string;
  failureCount: number;
  successCount: number;
}

export interface IntegrationMonitoring {
  enabled: boolean;
  metrics: IntegrationMetrics;
  alerts: IntegrationAlert[];
  logs: IntegrationLog[];
}

export interface IntegrationMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number; // milliseconds
  errorRate: number; // percentage
  lastRequestAt?: string;
  uptimePercentage: number;
}

export interface IntegrationAlert {
  id: string;
  type: 'error_rate' | 'latency' | 'availability' | 'rate_limit';
  severity: 'warning' | 'critical';
  threshold: number;
  currentValue: number;
  triggeredAt: string;
  resolvedAt?: string;
  message: string;
}

export interface IntegrationLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  latency?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface WebhookEvent {
  id: string;
  integrationId: string;
  webhookId: string;
  eventType: string;
  payload: any;
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
  attempts: number;
  lastAttemptAt?: string;
  response?: {
    statusCode: number;
    body?: string;
    latency: number;
  };
  createdAt: string;
}

export interface IntegrationTemplate {
  id: string;
  name: string;
  description: string;
  type: IntegrationType;
  provider: string;
  configuration: Partial<IntegrationConfiguration>;
  authentication: Partial<IntegrationAuth>;
  endpoints: Omit<IntegrationEndpoint, 'id'>[];
  webhooks: Omit<Webhook, 'id' | 'lastTriggeredAt' | 'failureCount' | 'successCount'>[];
  documentation: string;
}

export interface IntegrationTest {
  id: string;
  integrationId: string;
  name: string;
  type: 'connectivity' | 'endpoint' | 'webhook' | 'authentication';
  status: 'pending' | 'running' | 'passed' | 'failed';
  request?: any;
  response?: any;
  error?: string;
  duration?: number;
  executedAt: string;
}

export interface EventRoute {
  id: string;
  organizationId: string;
  name: string;
  sourceEvent: string;
  targetIntegrations: string[];
  filters?: EventFilter[];
  transformations?: EventTransformation[];
  enabled: boolean;
  priority: number;
}

export interface EventFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than';
  value: any;
}

export interface EventTransformation {
  type: 'map' | 'filter' | 'enrich' | 'format';
  configuration: Record<string, any>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const integrations = new Map<string, Integration>();
const webhookEvents = new Map<string, WebhookEvent[]>();
const integrationTests = new Map<string, IntegrationTest[]>();
const integrationTemplates = new Map<string, IntegrationTemplate>();
const eventRoutes = new Map<string, EventRoute[]>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createIntegration(params: {
  organizationId: string;
  name: string;
  description?: string;
  type: IntegrationType;
  provider: string;
  configuration?: Partial<IntegrationConfiguration>;
  authentication?: Partial<IntegrationAuth>;
  endpoints?: Omit<IntegrationEndpoint, 'id'>[];
  webhooks?: Omit<Webhook, 'id' | 'lastTriggeredAt' | 'failureCount' | 'successCount'>[];
}): Integration {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultConfig: IntegrationConfiguration = {
    timeout: 30000,
    retryPolicy: {
      maxRetries: 3,
      backoffType: 'exponential',
      initialDelay: 1000,
      maxDelay: 30000,
    },
  };

  const defaultAuth: IntegrationAuth = {
    type: 'none',
  };

  const integration: Integration = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    type: params.type,
    provider: params.provider,
    status: 'pending',
    configuration: { ...defaultConfig, ...params.configuration },
    authentication: { ...defaultAuth, ...params.authentication },
    endpoints: params.endpoints?.map(e => ({ ...e, id: randomUUID() })) || [],
    webhooks: params.webhooks?.map(w => ({
      ...w,
      id: randomUUID(),
      lastTriggeredAt: undefined,
      failureCount: 0,
      successCount: 0,
    })) || [],
    monitoring: {
      enabled: true,
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        errorRate: 0,
        uptimePercentage: 100,
      },
      alerts: [],
      logs: [],
    },
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  integrations.set(id, integration);
  webhookEvents.set(id, []);
  integrationTests.set(id, []);

  return integration;
}

export function getIntegration(id: string): Integration | undefined {
  return integrations.get(id);
}

export function listIntegrations(
  organizationId: string,
  filters?: { type?: IntegrationType; status?: IntegrationStatus; provider?: string }
): Integration[] {
  let result = Array.from(integrations.values()).filter(
    i => i.organizationId === organizationId
  );

  if (filters?.type) result = result.filter(i => i.type === filters.type);
  if (filters?.status) result = result.filter(i => i.status === filters.status);
  if (filters?.provider) result = result.filter(i => i.provider === filters.provider);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateIntegration(
  integrationId: string,
  updates: Partial<Integration>
): Integration {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  Object.assign(integration, updates, { updatedAt: new Date().toISOString() });
  return integration;
}

export function activateIntegration(integrationId: string): Integration {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  integration.status = 'active';
  integration.updatedAt = new Date().toISOString();
  return integration;
}

export function deactivateIntegration(integrationId: string): Integration {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  integration.status = 'inactive';
  integration.updatedAt = new Date().toISOString();
  return integration;
}

export function addEndpoint(
  integrationId: string,
  endpoint: Omit<IntegrationEndpoint, 'id'>
): Integration {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  const newEndpoint: IntegrationEndpoint = {
    ...endpoint,
    id: randomUUID(),
  };

  integration.endpoints.push(newEndpoint);
  integration.updatedAt = new Date().toISOString();
  return integration;
}

export function addWebhook(
  integrationId: string,
  webhook: Omit<Webhook, 'id' | 'lastTriggeredAt' | 'failureCount' | 'successCount'>
): Integration {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  const newWebhook: Webhook = {
    ...webhook,
    id: randomUUID(),
    lastTriggeredAt: undefined,
    failureCount: 0,
    successCount: 0,
  };

  integration.webhooks.push(newWebhook);
  integration.updatedAt = new Date().toISOString();
  return integration;
}

export function triggerWebhook(
  integrationId: string,
  webhookId: string,
  eventType: string,
  payload: any
): WebhookEvent {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  const webhook = integration.webhooks.find(w => w.id === webhookId);
  if (!webhook) throw new Error(`Webhook ${webhookId} not found`);
  if (!webhook.active) throw new Error('Webhook is not active');

  const now = new Date().toISOString();
  const id = randomUUID();

  const event: WebhookEvent = {
    id,
    integrationId,
    webhookId,
    eventType,
    payload,
    status: 'pending',
    attempts: 0,
    createdAt: now,
  };

  const events = webhookEvents.get(integrationId) || [];
  events.push(event);
  webhookEvents.set(integrationId, events);

  // Simulate webhook delivery
  setTimeout(() => {
    deliverWebhook(event, webhook, integration);
  }, 100);

  return event;
}

function deliverWebhook(
  event: WebhookEvent,
  webhook: Webhook,
  integration: Integration
): void {
  event.attempts++;
  event.lastAttemptAt = new Date().toISOString();
  event.status = 'retrying';

  // Simulate success/failure
  const success = _rng.next() > 0.1; // 90% success rate

  if (success) {
    event.status = 'delivered';
    event.response = {
      statusCode: 200,
      body: '{"status": "ok"}',
      latency: _rng.next() * 500,
    };
    webhook.successCount++;
    webhook.lastTriggeredAt = event.lastAttemptAt;
  } else {
    event.status = 'failed';
    event.response = {
      statusCode: 500,
      body: '{"error": "Internal server error"}',
      latency: _rng.next() * 1000,
    };
    webhook.failureCount++;

    // Retry logic
    if (event.attempts < webhook.retryPolicy.maxRetries) {
      const delay = webhook.retryPolicy.initialDelay * Math.pow(2, event.attempts - 1);
      setTimeout(() => {
        deliverWebhook(event, webhook, integration);
      }, delay);
    }
  }

  integration.updatedAt = new Date().toISOString();
}

export function getWebhookEvents(
  integrationId: string,
  filters?: { webhookId?: string; status?: string; limit?: number }
): WebhookEvent[] {
  let result = webhookEvents.get(integrationId) || [];

  if (filters?.webhookId) result = result.filter(e => e.webhookId === filters.webhookId);
  if (filters?.status) result = result.filter(e => e.status === filters.status);

  result = result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (filters?.limit) {
    result = result.slice(0, filters.limit);
  }

  return result;
}

export function testIntegration(
  integrationId: string,
  testName: string,
  testType: IntegrationTest['type']
): IntegrationTest {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const test: IntegrationTest = {
    id,
    integrationId,
    name: testName,
    type: testType,
    status: 'running',
    executedAt: now,
  };

  const tests = integrationTests.get(integrationId) || [];
  tests.push(test);
  integrationTests.set(integrationId, tests);

  // Simulate test execution
  setTimeout(() => {
    const success = _rng.next() > 0.2; // 80% success rate
    test.status = success ? 'passed' : 'failed';
    test.duration = _rng.next() * 1000;

    if (success) {
      test.response = { status: 'ok', message: 'Test passed' };
    } else {
      test.error = 'Connection timeout';
    }
  }, 500);

  return test;
}

export function getIntegrationTests(
  integrationId: string,
  filters?: { type?: string; status?: string }
): IntegrationTest[] {
  let result = integrationTests.get(integrationId) || [];

  if (filters?.type) result = result.filter(t => t.type === filters.type);
  if (filters?.status) result = result.filter(t => t.status === filters.status);

  return result.sort((a, b) => b.executedAt.localeCompare(a.executedAt));
}

export function logIntegrationEvent(
  integrationId: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  metadata?: Record<string, any>
): void {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  const log: IntegrationLog = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    message,
    metadata,
  };

  integration.monitoring.logs.push(log);

  // Keep only last 1000 logs
  if (integration.monitoring.logs.length > 1000) {
    integration.monitoring.logs = integration.monitoring.logs.slice(-1000);
  }

  integration.updatedAt = new Date().toISOString();
}

export function updateIntegrationMetrics(
  integrationId: string,
  metrics: Partial<IntegrationMetrics>
): Integration {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  Object.assign(integration.monitoring.metrics, metrics);
  integration.updatedAt = new Date().toISOString();

  return integration;
}

export function createIntegrationTemplate(params: {
  name: string;
  description: string;
  type: IntegrationType;
  provider: string;
  configuration?: Partial<IntegrationConfiguration>;
  authentication?: Partial<IntegrationAuth>;
  endpoints?: Omit<IntegrationEndpoint, 'id'>[];
  webhooks?: Omit<Webhook, 'id' | 'lastTriggeredAt' | 'failureCount' | 'successCount'>[];
  documentation?: string;
}): IntegrationTemplate {
  const id = randomUUID();

  const template: IntegrationTemplate = {
    id,
    name: params.name,
    description: params.description,
    type: params.type,
    provider: params.provider,
    configuration: params.configuration || {},
    authentication: params.authentication || {},
    endpoints: params.endpoints || [],
    webhooks: params.webhooks || [],
    documentation: params.documentation || '',
  };

  integrationTemplates.set(id, template);
  return template;
}

export function getIntegrationTemplate(id: string): IntegrationTemplate | undefined {
  return integrationTemplates.get(id);
}

export function listIntegrationTemplates(
  filters?: { type?: IntegrationType; provider?: string }
): IntegrationTemplate[] {
  let result = Array.from(integrationTemplates.values());

  if (filters?.type) result = result.filter(t => t.type === filters.type);
  if (filters?.provider) result = result.filter(t => t.provider === filters.provider);

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function createIntegrationFromTemplate(
  templateId: string,
  organizationId: string,
  name: string,
  customConfig?: Record<string, any>
): Integration {
  const template = integrationTemplates.get(templateId);
  if (!template) throw new Error(`Integration template ${templateId} not found`);

  return createIntegration({
    organizationId,
    name,
    description: template.description,
    type: template.type,
    provider: template.provider,
    configuration: { ...template.configuration, ...customConfig },
    authentication: template.authentication,
    endpoints: template.endpoints,
    webhooks: template.webhooks,
  });
}

export function createEventRoute(params: {
  organizationId: string;
  name: string;
  sourceEvent: string;
  targetIntegrations: string[];
  filters?: EventFilter[];
  transformations?: EventTransformation[];
  enabled?: boolean;
  priority?: number;
}): EventRoute {
  const id = randomUUID();

  const route: EventRoute = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    sourceEvent: params.sourceEvent,
    targetIntegrations: params.targetIntegrations,
    filters: params.filters,
    transformations: params.transformations,
    enabled: params.enabled ?? true,
    priority: params.priority ?? 100,
  };

  const routes = eventRoutes.get(params.organizationId) || [];
  routes.push(route);
  routes.sort((a, b) => a.priority - b.priority);
  eventRoutes.set(params.organizationId, routes);

  return route;
}

export function getEventRoutes(
  organizationId: string,
  filters?: { sourceEvent?: string; enabled?: boolean }
): EventRoute[] {
  let result = eventRoutes.get(organizationId) || [];

  if (filters?.sourceEvent) result = result.filter(r => r.sourceEvent === filters.sourceEvent);
  if (filters?.enabled !== undefined) result = result.filter(r => r.enabled === filters.enabled);

  return result;
}

export function routeEvent(
  organizationId: string,
  eventType: string,
  payload: any
): WebhookEvent[] {
  const routes = getEventRoutes(organizationId, { sourceEvent: eventType, enabled: true });
  const events: WebhookEvent[] = [];

  for (const route of routes) {
    // Apply filters
    let shouldRoute = true;
    if (route.filters && route.filters.length > 0) {
      shouldRoute = route.filters.every(filter => {
        const value = payload[filter.field];
        switch (filter.operator) {
          case 'equals':
            return value === filter.value;
          case 'not_equals':
            return value !== filter.value;
          case 'contains':
            return String(value).includes(filter.value);
          case 'not_contains':
            return !String(value).includes(filter.value);
          case 'greater_than':
            return value > filter.value;
          case 'less_than':
            return value < filter.value;
          default:
            return true;
        }
      });
    }

    if (!shouldRoute) continue;

    // Apply transformations
    let transformedPayload = { ...payload };
    if (route.transformations) {
      for (const transform of route.transformations) {
        // Simplified transformation logic
        if (transform.type === 'map' && transform.configuration.mapping) {
          const mapping = transform.configuration.mapping;
          const newPayload: any = {};
          for (const [target, source] of Object.entries(mapping)) {
            newPayload[target] = transformedPayload[source as string];
          }
          transformedPayload = newPayload;
        }
      }
    }

    // Route to target integrations
    for (const integrationId of route.targetIntegrations) {
      const integration = integrations.get(integrationId);
      if (!integration || integration.status !== 'active') continue;

      for (const webhook of integration.webhooks) {
        if (webhook.active && webhook.events.includes(eventType)) {
          const event = triggerWebhook(integrationId, webhook.id, eventType, transformedPayload);
          events.push(event);
        }
      }
    }
  }

  return events;
}

export function getIntegrationHealth(integrationId: string): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics: IntegrationMetrics;
  alerts: IntegrationAlert[];
  recommendations: string[];
} {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  const { metrics, alerts } = integration.monitoring;

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (metrics.errorRate > 10 || metrics.uptimePercentage < 95) {
    status = 'unhealthy';
  } else if (metrics.errorRate > 5 || metrics.uptimePercentage < 99) {
    status = 'degraded';
  }

  const recommendations: string[] = [];
  if (metrics.errorRate > 5) {
    recommendations.push('Investigate high error rate and check integration logs');
  }
  if (metrics.averageLatency > 1000) {
    recommendations.push('High latency detected - consider optimizing requests or increasing timeout');
  }
  if (metrics.uptimePercentage < 99) {
    recommendations.push('Low uptime - check connectivity and retry policies');
  }

  return {
    status,
    metrics,
    alerts: alerts.filter(a => !a.resolvedAt),
    recommendations,
  };
}
