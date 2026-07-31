/**
 * Module 103: AI Custom Integration Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides custom integration capabilities for connecting AI platform with external
 * systems including webhook management, API extensions, custom connectors, and
 * integration testing.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CustomIntegration {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  type: IntegrationType;
  status: IntegrationStatus;
  configuration: IntegrationConfiguration;
  endpoints: IntegrationEndpoint[];
  webhooks: Webhook[];
  authentication: IntegrationAuth;
  mapping: DataMapping;
  monitoring: IntegrationMonitoring;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationType =
  | 'rest_api'
  | 'webhook'
  | 'database'
  | 'message_queue'
  | 'file_storage'
  | 'saas_platform'
  | 'custom';

export type IntegrationStatus =
  | 'draft'
  | 'testing'
  | 'active'
  | 'paused'
  | 'error'
  | 'deprecated';

export interface IntegrationConfiguration {
  baseUrl?: string;
  timeout: number;
  retryPolicy: RetryPolicy;
  rateLimit?: RateLimit;
  headers: Record<string, string>;
  customConfig: Record<string, any>;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffType: 'fixed' | 'exponential' | 'linear';
  initialDelayMs: number;
  maxDelayMs: number;
}

export interface RateLimit {
  requestsPerMinute: number;
  requestsPerHour: number;
  concurrentRequests: number;
}

export interface IntegrationEndpoint {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description?: string;
  requestSchema?: Record<string, any>;
  responseSchema?: Record<string, any>;
  authentication: boolean;
  cacheTTL?: number;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  lastTriggered?: string;
  failureCount: number;
  headers: Record<string, string>;
  retryPolicy: RetryPolicy;
}

export interface IntegrationAuth {
  type: 'none' | 'api_key' | 'bearer_token' | 'basic' | 'oauth2' | 'custom';
  credentials: Record<string, any>;
  tokenEndpoint?: string;
  refreshToken?: string;
  tokenExpiry?: string;
}

export interface DataMapping {
  inputMapping: FieldMapping[];
  outputMapping: FieldMapping[];
  transformations: DataTransformation[];
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  type: 'direct' | 'transform' | 'default' | 'conditional';
  transform?: string;
  defaultValue?: any;
  condition?: string;
}

export interface DataTransformation {
  name: string;
  type: 'javascript' | 'jsonata' | 'template';
  code: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
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
  averageLatencyMs: number;
  lastRequestAt?: string;
  errorRate: number;
  throughput: number;
}

export interface IntegrationAlert {
  id: string;
  type: 'error_rate' | 'latency' | 'failure' | 'rate_limit';
  threshold: number;
  current: number;
  triggered: boolean;
  triggeredAt?: string;
  message: string;
}

export interface IntegrationLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  endpoint?: string;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface IntegrationTest {
  id: string;
  integrationId: string;
  name: string;
  type: 'connectivity' | 'endpoint' | 'webhook' | 'transformation' | 'end_to_end';
  status: 'pending' | 'running' | 'passed' | 'failed';
  request?: TestRequest;
  response?: TestResponse;
  error?: string;
  executedAt: string;
  durationMs?: number;
}

export interface TestRequest {
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
}

export interface TestResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  latencyMs: number;
}

export interface APIExtension {
  id: string;
  organizationId: string;
  integrationId: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  handler: string;
  middleware: string[];
  authentication: boolean;
  rateLimit?: RateLimit;
  cache?: CacheConfig;
  active: boolean;
  createdAt: string;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  keyPattern: string;
  invalidateOn: string[];
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const integrations = new Map<string, CustomIntegration>();
const integrationTests = new Map<string, IntegrationTest[]>();
const apiExtensions = new Map<string, APIExtension>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createIntegration(params: {
  organizationId: string;
  name: string;
  description: string;
  type: IntegrationType;
  configuration: IntegrationConfiguration;
  endpoints?: IntegrationEndpoint[];
  webhooks?: Webhook[];
  authentication?: IntegrationAuth;
  mapping?: DataMapping;
}): CustomIntegration {
  const now = new Date().toISOString();
  const id = randomUUID();

  const integration: CustomIntegration = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    type: params.type,
    status: 'draft',
    configuration: params.configuration,
    endpoints: params.endpoints || [],
    webhooks: params.webhooks || [],
    authentication: params.authentication || { type: 'none', credentials: {} },
    mapping: params.mapping || { inputMapping: [], outputMapping: [], transformations: [] },
    monitoring: {
      enabled: true,
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatencyMs: 0,
        errorRate: 0,
        throughput: 0,
      },
      alerts: [],
      logs: [],
    },
    createdAt: now,
    updatedAt: now,
  };

  integrations.set(id, integration);
  integrationTests.set(id, []);
  return integration;
}

export function getIntegration(id: string): CustomIntegration | undefined {
  return integrations.get(id);
}

export function listIntegrations(
  organizationId: string,
  filters?: { type?: IntegrationType; status?: IntegrationStatus }
): CustomIntegration[] {
  let result = Array.from(integrations.values()).filter(i => i.organizationId === organizationId);

  if (filters?.type) result = result.filter(i => i.type === filters.type);
  if (filters?.status) result = result.filter(i => i.status === filters.status);

  return result;
}

export function addEndpoint(
  integrationId: string,
  endpoint: Omit<IntegrationEndpoint, 'id'>
): IntegrationEndpoint {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  const newEndpoint: IntegrationEndpoint = {
    ...endpoint,
    id: randomUUID(),
  };

  integration.endpoints.push(newEndpoint);
  integration.updatedAt = new Date().toISOString();
  return newEndpoint;
}

export function addWebhook(
  integrationId: string,
  webhook: Omit<Webhook, 'id' | 'active' | 'failureCount'>
): Webhook {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  const newWebhook: Webhook = {
    ...webhook,
    id: randomUUID(),
    active: true,
    failureCount: 0,
  };

  integration.webhooks.push(newWebhook);
  integration.updatedAt = new Date().toISOString();
  return newWebhook;
}

export function triggerWebhook(
  integrationId: string,
  webhookId: string,
  payload: any
): { success: boolean; statusCode?: number; error?: string } {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  const webhook = integration.webhooks.find(w => w.id === webhookId);
  if (!webhook) throw new Error(`Webhook ${webhookId} not found`);
  if (!webhook.active) throw new Error(`Webhook ${webhookId} is not active`);

  // Simulate webhook trigger
  const success = Math.random() > 0.1; // 90% success rate
  const statusCode = success ? 200 : 500;

  webhook.lastTriggered = new Date().toISOString();
  if (!success) {
    webhook.failureCount += 1;
    if (webhook.failureCount >= 5) {
      webhook.active = false;
    }
  } else {
    webhook.failureCount = 0;
  }

  integration.updatedAt = new Date().toISOString();

  // Log the webhook trigger
  const log: IntegrationLog = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    level: success ? 'info' : 'error',
    message: `Webhook ${webhook.name} triggered`,
    statusCode,
    metadata: { webhookId, payload },
  };
  integration.monitoring.logs.push(log);
  if (integration.monitoring.logs.length > 1000) {
    integration.monitoring.logs.shift();
  }

  return { success, statusCode, error: success ? undefined : 'Webhook delivery failed' };
}

export function testIntegration(
  integrationId: string,
  params: {
    name: string;
    type: IntegrationTest['type'];
    endpoint?: string;
    method?: string;
    body?: any;
  }
): IntegrationTest {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  const now = new Date().toISOString();
  const test: IntegrationTest = {
    id: randomUUID(),
    integrationId,
    name: params.name,
    type: params.type,
    status: 'running',
    executedAt: now,
  };

  if (params.endpoint && params.method) {
    test.request = {
      endpoint: params.endpoint,
      method: params.method,
      headers: integration.configuration.headers,
      body: params.body,
    };
  }

  // Simulate test execution
  setTimeout(() => {
    const success = Math.random() > 0.2; // 80% success rate
    const latencyMs = 50 + Math.random() * 200;

    test.status = success ? 'passed' : 'failed';
    test.durationMs = latencyMs;

    if (test.request) {
      test.response = {
        statusCode: success ? 200 : 500,
        headers: { 'content-type': 'application/json' },
        body: success ? { success: true, data: 'test data' } : { error: 'Test failed' },
        latencyMs,
      };
    }

    if (!success) {
      test.error = 'Integration test failed';
    }

    integration.updatedAt = new Date().toISOString();
  }, 100);

  const tests = integrationTests.get(integrationId) || [];
  tests.push(test);
  integrationTests.set(integrationId, tests);

  return test;
}

export function getIntegrationTests(integrationId: string): IntegrationTest[] {
  return integrationTests.get(integrationId) || [];
}

export function activateIntegration(integrationId: string): CustomIntegration {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  integration.status = 'active';
  integration.updatedAt = new Date().toISOString();
  return integration;
}

export function pauseIntegration(integrationId: string): CustomIntegration {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  integration.status = 'paused';
  integration.updatedAt = new Date().toISOString();
  return integration;
}

export function updateIntegrationConfiguration(
  integrationId: string,
  config: Partial<IntegrationConfiguration>
): CustomIntegration {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  integration.configuration = { ...integration.configuration, ...config };
  integration.updatedAt = new Date().toISOString();
  return integration;
}

export function addDataTransformation(
  integrationId: string,
  transformation: Omit<DataTransformation, 'name'> & { name?: string }
): DataTransformation {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  const newTransformation: DataTransformation = {
    name: transformation.name || `transform_${integration.mapping.transformations.length + 1}`,
    type: transformation.type,
    code: transformation.code,
    inputSchema: transformation.inputSchema,
    outputSchema: transformation.outputSchema,
  };

  integration.mapping.transformations.push(newTransformation);
  integration.updatedAt = new Date().toISOString();
  return newTransformation;
}

export function createAPIExtension(params: {
  organizationId: string;
  integrationId: string;
  path: string;
  method: APIExtension['method'];
  handler: string;
  middleware?: string[];
  authentication?: boolean;
  rateLimit?: RateLimit;
  cache?: CacheConfig;
}): APIExtension {
  const integration = integrations.get(params.integrationId);
  if (!integration) throw new Error(`Integration ${params.integrationId} not found`);

  const now = new Date().toISOString();
  const extension: APIExtension = {
    id: randomUUID(),
    organizationId: params.organizationId,
    integrationId: params.integrationId,
    path: params.path,
    method: params.method,
    handler: params.handler,
    middleware: params.middleware || [],
    authentication: params.authentication ?? true,
    rateLimit: params.rateLimit,
    cache: params.cache,
    active: true,
    createdAt: now,
  };

  apiExtensions.set(extension.id, extension);
  return extension;
}

export function getAPIExtension(id: string): APIExtension | undefined {
  return apiExtensions.get(id);
}

export function listAPIExtensions(organizationId: string): APIExtension[] {
  return Array.from(apiExtensions.values()).filter(e => e.organizationId === organizationId);
}

export function getIntegrationMetrics(integrationId: string): IntegrationMetrics {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);
  return integration.monitoring.metrics;
}

export function getIntegrationLogs(
  integrationId: string,
  filters?: { level?: string; limit?: number }
): IntegrationLog[] {
  const integration = integrations.get(integrationId);
  if (!integration) throw new Error(`Integration ${integrationId} not found`);

  let logs = integration.monitoring.logs;

  if (filters?.level) {
    logs = logs.filter(l => l.level === filters.level);
  }

  const limit = filters?.limit || 100;
  return logs.slice(-limit).reverse();
}
