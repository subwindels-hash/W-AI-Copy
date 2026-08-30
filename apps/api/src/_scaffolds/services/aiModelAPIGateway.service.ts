/**
 * Module 113: AI Model API Gateway Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides API gateway functionality for AI models including rate limiting,
 * authentication, request routing, caching, load balancing, and API analytics.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiModelAPIGateway');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface APIGateway {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: GatewayStatus;
  configuration: GatewayConfiguration;
  routes: APIRoute[];
  authentication: GatewayAuth;
  rateLimiting: RateLimitingConfig;
  caching: CachingConfig;
  loadBalancing: LoadBalancingConfig;
  analytics: GatewayAnalytics;
  createdAt: string;
  updatedAt: string;
}

export type GatewayStatus = 'active' | 'inactive' | 'maintenance' | 'error';

export interface GatewayConfiguration {
  baseUrl: string;
  port: number;
  sslEnabled: boolean;
  corsEnabled: boolean;
  corsOrigins?: string[];
  requestTimeout: number; // milliseconds
  maxRequestSize: number; // bytes
  enableCompression: boolean;
  enableLogging: boolean;
}

export interface APIRoute {
  id: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  targetModelId: string;
  targetModelVersion?: string;
  backend: RouteBackend;
  middleware: RouteMiddleware[];
  rateLimit?: RouteRateLimit;
  caching?: RouteCaching;
  authentication?: RouteAuth;
  enabled: boolean;
  priority: number;
}

export interface RouteBackend {
  type: 'model' | 'service' | 'function';
  targetId: string;
  timeout: number;
  retries: number;
  healthCheck?: HealthCheckConfig;
}

export interface HealthCheckConfig {
  enabled: boolean;
  path: string;
  interval: number; // seconds
  timeout: number; // milliseconds
  healthyThreshold: number;
  unhealthyThreshold: number;
}

export type RouteMiddleware =
  | 'rate_limiter'
  | 'auth_validator'
  | 'request_logger'
  | 'response_cache'
  | 'request_transformer'
  | 'response_transformer'
  | 'cors_handler'
  | 'compression';

export interface RouteRateLimit {
  enabled: boolean;
  requests: number;
  period: 'second' | 'minute' | 'hour' | 'day';
  burst?: number;
  keyStrategy: 'ip' | 'user' | 'api_key' | 'custom';
  customKeyExtractor?: string;
}

export interface RouteCaching {
  enabled: boolean;
  ttl: number; // seconds
  cacheKeyStrategy: 'url' | 'url+params' | 'url+body' | 'custom';
  customKeyExtractor?: string;
  invalidateOn?: string[];
}

export interface RouteAuth {
  enabled: boolean;
  type: 'none' | 'api_key' | 'bearer_token' | 'basic' | 'oauth2' | 'custom';
  required: boolean;
  scopes?: string[];
  customValidator?: string;
}

export interface GatewayAuth {
  type: 'api_key' | 'bearer_token' | 'oauth2' | 'custom';
  configuration: Record<string, any>;
  tokenValidation: TokenValidation;
}

export interface TokenValidation {
  issuer?: string;
  audience?: string;
  algorithms?: string[];
  publicKey?: string;
  jwksUri?: string;
}

export interface RateLimitingConfig {
  enabled: boolean;
  global: GlobalRateLimit;
  perRoute: boolean;
  perUser: boolean;
  storage: 'memory' | 'redis';
}

export interface GlobalRateLimit {
  requests: number;
  period: 'second' | 'minute' | 'hour' | 'day';
  burst?: number;
}

export interface CachingConfig {
  enabled: boolean;
  storage: 'memory' | 'redis';
  defaultTTL: number; // seconds
  maxCacheSize: number; // bytes
  cacheableMethods: string[];
  cacheableStatusCodes: number[];
}

export interface LoadBalancingConfig {
  enabled: boolean;
  strategy: 'round_robin' | 'least_connections' | 'random' | 'weighted' | 'ip_hash';
  healthCheck: boolean;
  stickySession: boolean;
  sessionTTL?: number; // seconds
}

export interface GatewayAnalytics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number; // milliseconds
  p95Latency: number;
  p99Latency: number;
  cacheHitRate: number; // percentage
  rateLimitHits: number;
  authFailures: number;
  topRoutes: RouteAnalytics[];
  lastUpdated: string;
}

export interface RouteAnalytics {
  routeId: string;
  path: string;
  method: string;
  requests: number;
  averageLatency: number;
  errorRate: number;
  cacheHitRate: number;
}

export interface APIKey {
  id: string;
  organizationId: string;
  name: string;
  key: string;
  scopes: string[];
  rateLimit?: RateLimit;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  createdBy: string;
  status: 'active' | 'revoked' | 'expired';
}

export interface RateLimit {
  requests: number;
  period: 'second' | 'minute' | 'hour' | 'day';
}

export interface APIRequest {
  id: string;
  gatewayId: string;
  routeId: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: any;
  clientIp: string;
  apiKey?: string;
  userId?: string;
  timestamp: string;
}

export interface APIResponse {
  requestId: string;
  statusCode: number;
  headers: Record<string, string>;
  body?: any;
  latency: number; // milliseconds
  cached: boolean;
  timestamp: string;
}

export interface RequestLog {
  id: string;
  gatewayId: string;
  requestId: string;
  routeId: string;
  method: string;
  path: string;
  statusCode: number;
  latency: number;
  clientIp: string;
  apiKey?: string;
  userId?: string;
  cached: boolean;
  rateLimited: boolean;
  authFailed: boolean;
  error?: string;
  timestamp: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const apiGateways = new Map<string, APIGateway>();
const apiKeys = new Map<string, APIKey[]>();
const requestLogs = new Map<string, RequestLog[]>();
const rateLimitCounters = new Map<string, Map<string, { count: number; resetAt: number }>>();
const cache = new Map<string, { response: APIResponse; expiresAt: number }>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateAPIKey(): string {
  return `wak_${randomUUID().replace(/-/g, '')}`;
}

function getRateLimitKey(
  route: APIRoute,
  request: APIRequest,
  strategy: string
): string {
  switch (strategy) {
    case 'ip':
      return `${route.id}:ip:${request.clientIp}`;
    case 'user':
      return `${route.id}:user:${request.userId || 'anonymous'}`;
    case 'api_key':
      return `${route.id}:apikey:${request.apiKey || 'none'}`;
    default:
      return `${route.id}:global`;
  }
}

function checkRateLimit(
  gatewayId: string,
  key: string,
  limit: number,
  period: string
): { allowed: boolean; remaining: number; resetAt: number } {
  const periodMs = {
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
  }[period] || 60000;

  const now = Date.now();
  const counters = rateLimitCounters.get(gatewayId) || new Map();
  const counter = counters.get(key);

  if (!counter || now > counter.resetAt) {
    // Reset counter
    const resetAt = now + periodMs;
    counters.set(key, { count: 1, resetAt });
    rateLimitCounters.set(gatewayId, counters);
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (counter.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: counter.resetAt };
  }

  counter.count++;
  return { allowed: true, remaining: limit - counter.count, resetAt: counter.resetAt };
}

function getCacheKey(route: APIRoute, request: APIRequest, strategy: string): string {
  switch (strategy) {
    case 'url':
      return `${route.id}:${request.path}`;
    case 'url+params':
      const params = Object.entries(request.query).sort().map(([k, v]) => `${k}=${v}`).join('&');
      return `${route.id}:${request.path}?${params}`;
    case 'url+body':
      const body = JSON.stringify(request.body || {});
      return `${route.id}:${request.path}:${body}`;
    default:
      return `${route.id}:${request.path}`;
  }
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createAPIGateway(params: {
  organizationId: string;
  name: string;
  description?: string;
  configuration?: Partial<GatewayConfiguration>;
  authentication?: Partial<GatewayAuth>;
  rateLimiting?: Partial<RateLimitingConfig>;
  caching?: Partial<CachingConfig>;
  loadBalancing?: Partial<LoadBalancingConfig>;
}): APIGateway {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultConfig: GatewayConfiguration = {
    baseUrl: 'https://api.windels.ai',
    port: 443,
    sslEnabled: true,
    corsEnabled: true,
    corsOrigins: ['*'],
    requestTimeout: 30000,
    maxRequestSize: 10 * 1024 * 1024, // 10MB
    enableCompression: true,
    enableLogging: true,
  };

  const defaultAuth: GatewayAuth = {
    type: 'api_key',
    configuration: {},
    tokenValidation: {},
  };

  const defaultRateLimiting: RateLimitingConfig = {
    enabled: true,
    global: {
      requests: 1000,
      period: 'minute',
    },
    perRoute: true,
    perUser: true,
    storage: 'memory',
  };

  const defaultCaching: CachingConfig = {
    enabled: true,
    storage: 'memory',
    defaultTTL: 300, // 5 minutes
    maxCacheSize: 100 * 1024 * 1024, // 100MB
    cacheableMethods: ['GET'],
    cacheableStatusCodes: [200, 203, 204, 206, 300, 301, 404, 405, 410, 414, 501],
  };

  const defaultLoadBalancing: LoadBalancingConfig = {
    enabled: true,
    strategy: 'round_robin',
    healthCheck: true,
    stickySession: false,
  };

  const gateway: APIGateway = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'active',
    configuration: { ...defaultConfig, ...params.configuration },
    routes: [],
    authentication: { ...defaultAuth, ...params.authentication },
    rateLimiting: { ...defaultRateLimiting, ...params.rateLimiting },
    caching: { ...defaultCaching, ...params.caching },
    loadBalancing: { ...defaultLoadBalancing, ...params.loadBalancing },
    analytics: {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      cacheHitRate: 0,
      rateLimitHits: 0,
      authFailures: 0,
      topRoutes: [],
      lastUpdated: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  apiGateways.set(id, gateway);
  apiKeys.set(id, []);
  requestLogs.set(id, []);

  return gateway;
}

export function getAPIGateway(id: string): APIGateway | undefined {
  return apiGateways.get(id);
}

export function listAPIGateways(
  organizationId: string,
  filters?: { status?: GatewayStatus }
): APIGateway[] {
  let result = Array.from(apiGateways.values()).filter(
    g => g.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(g => g.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateAPIGateway(
  gatewayId: string,
  updates: Partial<APIGateway>
): APIGateway {
  const gateway = apiGateways.get(gatewayId);
  if (!gateway) throw new Error(`API gateway ${gatewayId} not found`);

  Object.assign(gateway, updates, { updatedAt: new Date().toISOString() });
  return gateway;
}

export function addRoute(
  gatewayId: string,
  route: Omit<APIRoute, 'id'>
): APIGateway {
  const gateway = apiGateways.get(gatewayId);
  if (!gateway) throw new Error(`API gateway ${gatewayId} not found`);

  const newRoute: APIRoute = {
    ...route,
    id: randomUUID(),
  };

  gateway.routes.push(newRoute);
  gateway.routes.sort((a, b) => a.priority - b.priority);
  gateway.updatedAt = new Date().toISOString();

  return gateway;
}

export function updateRoute(
  gatewayId: string,
  routeId: string,
  updates: Partial<APIRoute>
): APIGateway {
  const gateway = apiGateways.get(gatewayId);
  if (!gateway) throw new Error(`API gateway ${gatewayId} not found`);

  const route = gateway.routes.find(r => r.id === routeId);
  if (!route) throw new Error(`Route ${routeId} not found`);

  Object.assign(route, updates);
  gateway.routes.sort((a, b) => a.priority - b.priority);
  gateway.updatedAt = new Date().toISOString();

  return gateway;
}

export function removeRoute(gatewayId: string, routeId: string): APIGateway {
  const gateway = apiGateways.get(gatewayId);
  if (!gateway) throw new Error(`API gateway ${gatewayId} not found`);

  gateway.routes = gateway.routes.filter(r => r.id !== routeId);
  gateway.updatedAt = new Date().toISOString();

  return gateway;
}

export function createAPIKey(params: {
  organizationId: string;
  gatewayId: string;
  name: string;
  scopes?: string[];
  rateLimit?: RateLimit;
  expiresAt?: string;
  createdBy: string;
}): APIKey {
  const gateway = apiGateways.get(params.gatewayId);
  if (!gateway) throw new Error(`API gateway ${params.gatewayId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const apiKey: APIKey = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    key: generateAPIKey(),
    scopes: params.scopes || [],
    rateLimit: params.rateLimit,
    expiresAt: params.expiresAt,
    createdAt: now,
    createdBy: params.createdBy,
    status: 'active',
  };

  const keys = apiKeys.get(params.gatewayId) || [];
  keys.push(apiKey);
  apiKeys.set(params.gatewayId, keys);

  return apiKey;
}

export function getAPIKeys(
  gatewayId: string,
  filters?: { status?: string }
): APIKey[] {
  let result = apiKeys.get(gatewayId) || [];

  if (filters?.status) result = result.filter(k => k.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function revokeAPIKey(gatewayId: string, keyId: string): APIKey {
  const keys = apiKeys.get(gatewayId) || [];
  const key = keys.find(k => k.id === keyId);
  if (!key) throw new Error(`API key ${keyId} not found`);

  key.status = 'revoked';
  return key;
}

export function validateAPIKey(gatewayId: string, apiKey: string): {
  valid: boolean;
  key?: APIKey;
  reason?: string;
} {
  const keys = apiKeys.get(gatewayId) || [];
  const key = keys.find(k => k.key === apiKey);

  if (!key) {
    return { valid: false, reason: 'API key not found' };
  }

  if (key.status === 'revoked') {
    return { valid: false, key, reason: 'API key has been revoked' };
  }

  if (key.status === 'expired' || (key.expiresAt && new Date(key.expiresAt) < new Date())) {
    key.status = 'expired';
    return { valid: false, key, reason: 'API key has expired' };
  }

  key.lastUsedAt = new Date().toISOString();
  return { valid: true, key };
}

export function processRequest(
  gatewayId: string,
  request: Omit<APIRequest, 'id' | 'gatewayId' | 'timestamp'>
): APIResponse {
  const gateway = apiGateways.get(gatewayId);
  if (!gateway) throw new Error(`API gateway ${gatewayId} not found`);

  const now = new Date().toISOString();
  const requestId = randomUUID();

  const fullRequest: APIRequest = {
    ...request,
    id: requestId,
    gatewayId,
    timestamp: now,
  };

  // Find matching route
  const route = gateway.routes.find(r => {
    if (!r.enabled) return false;
    if (r.method !== request.method) return false;
    if (r.path !== request.path) return false;
    return true;
  });

  if (!route) {
    return createErrorResponse(requestId, 404, 'Route not found', false);
  }

  // Check authentication
  if (route.authentication?.enabled && route.authentication.required) {
    if (request.apiKey) {
      const validation = validateAPIKey(gatewayId, request.apiKey);
      if (!validation.valid) {
        gateway.analytics.authFailures++;
        logRequest(gatewayId, fullRequest, 401, 0, false, false, true, validation.reason);
        return createErrorResponse(requestId, 401, validation.reason || 'Unauthorized', false);
      }
    } else {
      gateway.analytics.authFailures++;
      logRequest(gatewayId, fullRequest, 401, 0, false, false, true, 'API key required');
      return createErrorResponse(requestId, 401, 'API key required', false);
    }
  }

  // Check rate limiting
  if (route.rateLimit?.enabled) {
    const key = getRateLimitKey(route, fullRequest, route.rateLimit.keyStrategy);
    const rateCheck = checkRateLimit(
      gatewayId,
      key,
      route.rateLimit.requests,
      route.rateLimit.period
    );

    if (!rateCheck.allowed) {
      gateway.analytics.rateLimitHits++;
      logRequest(gatewayId, fullRequest, 429, 0, false, true, false, 'Rate limit exceeded');
      return createErrorResponse(requestId, 429, 'Rate limit exceeded', false, {
        'X-RateLimit-Limit': String(route.rateLimit.requests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(rateCheck.resetAt / 1000)),
      });
    }
  }

  // Check cache
  if (route.caching?.enabled && request.method === 'GET' && gateway.caching.cacheableMethods.includes('GET')) {
    const cacheKey = getCacheKey(route, fullRequest, route.caching.cacheKeyStrategy);
    const cached = cache.get(cacheKey);

    if (cached && Date.now() < cached.expiresAt) {
      gateway.analytics.cacheHitRate = calculateCacheHitRate(gatewayId);
      logRequest(gatewayId, fullRequest, cached.response.statusCode, cached.response.latency, true, false, false);
      return { ...cached.response, cached: true };
    }
  }

  // Process request (simulated)
  const startTime = Date.now();
  const latency = _rng.next() * 500 + 50; // 50-550ms

  const response: APIResponse = {
    requestId,
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
    },
    body: { success: true, data: 'Mock response' },
    latency,
    cached: false,
    timestamp: new Date().toISOString(),
  };

  // Cache response if applicable
  if (route.caching?.enabled && request.method === 'GET' && response.statusCode === 200) {
    const cacheKey = getCacheKey(route, fullRequest, route.caching.cacheKeyStrategy);
    const ttl = route.caching.ttl || gateway.caching.defaultTTL;
    cache.set(cacheKey, {
      response,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  // Update analytics
  gateway.analytics.totalRequests++;
  if (response.statusCode >= 200 && response.statusCode < 400) {
    gateway.analytics.successfulRequests++;
  } else {
    gateway.analytics.failedRequests++;
  }

  gateway.analytics.averageLatency = calculateAverageLatency(gatewayId);
  gateway.analytics.lastUpdated = new Date().toISOString();

  logRequest(gatewayId, fullRequest, response.statusCode, latency, false, false, false);

  return response;
}

function createErrorResponse(
  requestId: string,
  statusCode: number,
  message: string,
  cached: boolean,
  additionalHeaders?: Record<string, string>
): APIResponse {
  return {
    requestId,
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      ...additionalHeaders,
    },
    body: { error: message },
    latency: 0,
    cached,
    timestamp: new Date().toISOString(),
  };
}

function logRequest(
  gatewayId: string,
  request: APIRequest,
  statusCode: number,
  latency: number,
  cached: boolean,
  rateLimited: boolean,
  authFailed: boolean,
  error?: string
): void {
  const log: RequestLog = {
    id: randomUUID(),
    gatewayId,
    requestId: request.id,
    routeId: '',
    method: request.method,
    path: request.path,
    statusCode,
    latency,
    clientIp: request.clientIp,
    apiKey: request.apiKey,
    userId: request.userId,
    cached,
    rateLimited,
    authFailed,
    error,
    timestamp: new Date().toISOString(),
  };

  const logs = requestLogs.get(gatewayId) || [];
  logs.push(log);

  // Keep only last 10000 logs
  if (logs.length > 10000) {
    requestLogs.set(gatewayId, logs.slice(-10000));
  } else {
    requestLogs.set(gatewayId, logs);
  }
}

function calculateAverageLatency(gatewayId: string): number {
  const logs = requestLogs.get(gatewayId) || [];
  const recentLogs = logs.slice(-100);
  if (recentLogs.length === 0) return 0;
  return recentLogs.reduce((sum, log) => sum + log.latency, 0) / recentLogs.length;
}

function calculateCacheHitRate(gatewayId: string): number {
  const logs = requestLogs.get(gatewayId) || [];
  const recentLogs = logs.slice(-100);
  if (recentLogs.length === 0) return 0;
  const cacheHits = recentLogs.filter(log => log.cached).length;
  return (cacheHits / recentLogs.length) * 100;
}

export function getRequestLogs(
  gatewayId: string,
  filters?: {
    routeId?: string;
    statusCode?: number;
    clientIp?: string;
    apiKey?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }
): RequestLog[] {
  let result = requestLogs.get(gatewayId) || [];

  if (filters?.routeId) result = result.filter(l => l.routeId === filters.routeId);
  if (filters?.statusCode) result = result.filter(l => l.statusCode === filters.statusCode);
  if (filters?.clientIp) result = result.filter(l => l.clientIp === filters.clientIp);
  if (filters?.apiKey) result = result.filter(l => l.apiKey === filters.apiKey);
  if (filters?.startTime) result = result.filter(l => l.timestamp >= filters.startTime!);
  if (filters?.endTime) result = result.filter(l => l.timestamp <= filters.endTime!);

  result = result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (filters?.limit) {
    result = result.slice(0, filters.limit);
  }

  return result;
}

export function getGatewayAnalytics(gatewayId: string): GatewayAnalytics {
  const gateway = apiGateways.get(gatewayId);
  if (!gateway) throw new Error(`API gateway ${gatewayId} not found`);

  const logs = requestLogs.get(gatewayId) || [];
  const recentLogs = logs.slice(-1000);

  const latencies = recentLogs.map(l => l.latency).sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);
  const p99Index = Math.floor(latencies.length * 0.99);

  gateway.analytics.averageLatency = calculateAverageLatency(gatewayId);
  gateway.analytics.p95Latency = latencies[p95Index] || 0;
  gateway.analytics.p99Latency = latencies[p99Index] || 0;
  gateway.analytics.cacheHitRate = calculateCacheHitRate(gatewayId);

  // Calculate top routes
  const routeStats = new Map<string, { requests: number; latency: number; errors: number; cacheHits: number }>();
  for (const log of recentLogs) {
    const stats = routeStats.get(log.routeId) || { requests: 0, latency: 0, errors: 0, cacheHits: 0 };
    stats.requests++;
    stats.latency += log.latency;
    if (log.statusCode >= 400) stats.errors++;
    if (log.cached) stats.cacheHits++;
    routeStats.set(log.routeId, stats);
  }

  gateway.analytics.topRoutes = Array.from(routeStats.entries())
    .map(([routeId, stats]) => {
      const route = gateway.routes.find(r => r.id === routeId);
      return {
        routeId,
        path: route?.path || 'unknown',
        method: route?.method || 'unknown',
        requests: stats.requests,
        averageLatency: stats.latency / stats.requests,
        errorRate: (stats.errors / stats.requests) * 100,
        cacheHitRate: (stats.cacheHits / stats.requests) * 100,
      };
    })
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 10);

  return gateway.analytics;
}

export function invalidateCache(gatewayId: string, pattern?: string): number {
  let invalidated = 0;

  if (pattern) {
    for (const [key] of cache.entries()) {
      if (key.includes(pattern)) {
        cache.delete(key);
        invalidated++;
      }
    }
  } else {
    invalidated = cache.size;
    cache.clear();
  }

  return invalidated;
}

export function getGatewayHealth(gatewayId: string): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics: GatewayAnalytics;
  recommendations: string[];
} {
  const gateway = apiGateways.get(gatewayId);
  if (!gateway) throw new Error(`API gateway ${gatewayId} not found`);

  const analytics = getGatewayAnalytics(gatewayId);
  const errorRate = analytics.totalRequests > 0
    ? (analytics.failedRequests / analytics.totalRequests) * 100
    : 0;

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (errorRate > 10 || analytics.p99Latency > 5000) {
    status = 'unhealthy';
  } else if (errorRate > 5 || analytics.p99Latency > 2000) {
    status = 'degraded';
  }

  const recommendations: string[] = [];
  if (errorRate > 5) {
    recommendations.push('High error rate detected - investigate failing routes');
  }
  if (analytics.p99Latency > 2000) {
    recommendations.push('High latency detected - consider optimizing backend services');
  }
  if (analytics.cacheHitRate < 20 && gateway.caching.enabled) {
    recommendations.push('Low cache hit rate - review caching configuration');
  }
  if (analytics.rateLimitHits > 100) {
    recommendations.push('High rate limit hits - consider increasing limits or optimizing clients');
  }

  return {
    status,
    metrics: analytics,
    recommendations,
  };
}
