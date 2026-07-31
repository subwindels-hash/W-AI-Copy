/**
 * Module 46: AI Service Marketplace Service
 *
 * Provides a marketplace for AI services and APIs with publishing, discovery,
 * usage tracking, metering, billing, SLA management, API key management,
 * rate limiting, and performance monitoring.
 *
 * Phase 1 — Critical Gap: AI service marketplace infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceMarketplaceStatus = "draft" | "pending_review" | "published" | "deprecated" | "archived";

export type ServicePricingModel = "free" | "subscription" | "usage_based" | "per_request" | "tiered" | "enterprise";

export type ServiceCategory = "nlp" | "computer_vision" | "speech" | "translation" | "recommendation" | "prediction" | "generation" | "analytics" | "custom";

export type ServiceProtocol = "rest" | "grpc" | "graphql" | "websocket" | "custom";

export type SLASeverity = "low" | "medium" | "high" | "critical";

export interface ServiceListing {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  publisherId: string;
  publisherName: string;
  status: ServiceMarketplaceStatus;
  category: ServiceCategory;
  protocol: ServiceProtocol;
  endpoint: string;
  documentation: ServiceDocumentation;
  pricing: ServicePricing;
  sla: ServiceSLA;
  usage: ServiceUsage;
  revenue: ServiceRevenue;
  reviews: ServiceReview[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface ServiceDocumentation {
  overview: string;
  quickstart?: string;
  authentication?: string;
  endpoints?: Array<{
    method: string;
    path: string;
    description: string;
    parameters?: Array<{
      name: string;
      type: string;
      required: boolean;
      description: string;
    }>;
    response?: {
      type: string;
      description: string;
      example?: string;
    };
  }>;
  examples?: Array<{
    name: string;
    description: string;
    code: string;
    language: string;
  }>;
  sdkSupport?: {
    python?: boolean;
    javascript?: boolean;
    java?: boolean;
    go?: boolean;
    csharp?: boolean;
  };
  documentationUrl?: string;
  openApiSpec?: string;
}

export interface ServicePricing {
  model: ServicePricingModel;
  free?: {
    rateLimits?: {
      requestsPerMinute?: number;
      requestsPerHour?: number;
      requestsPerDay?: number;
    };
    features?: string[];
  };
  subscription?: {
    monthlyPriceUsd: number;
    yearlyPriceUsd?: number;
    currency: string;
    rateLimits?: {
      requestsPerMinute?: number;
      requestsPerHour?: number;
      requestsPerDay?: number;
    };
    features?: string[];
    trial?: {
      durationDays: number;
    };
  };
  usageBased?: {
    pricePerRequestUsd: number;
    pricePerTokenUsd?: number;
    currency: string;
    minimumChargeUsd?: number;
    volumeDiscounts?: Array<{
      minRequests: number;
      discountPercent: number;
    }>;
  };
  perRequest?: {
    pricePerRequestUsd: number;
    currency: string;
    tiers?: Array<{
      maxRequests: number;
      pricePerRequestUsd: number;
    }>;
  };
  tiered?: {
    tiers: Array<{
      name: string;
      monthlyPriceUsd: number;
      requestsPerMonth: number;
      rateLimits?: {
        requestsPerMinute?: number;
        requestsPerHour?: number;
      };
      features: string[];
    }>;
    currency: string;
  };
  enterprise?: {
    contactForPricing: boolean;
    customTerms: boolean;
    dedicatedSupport: boolean;
    customSLA: boolean;
  };
}

export interface ServiceSLA {
  uptime: {
    target: number; // 0-1 (e.g., 0.999 for 99.9%)
    measurement: "monthly" | "quarterly" | "yearly";
    creditPolicy?: {
      downtimePercent: number;
      creditPercent: number;
    };
  };
  latency?: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
  };
  support?: {
    responseTime: {
      critical: number; // hours
      high: number;
      medium: number;
      low: number;
    };
    channels: string[]; // email, phone, chat, etc.
    hours: string; // 24/7, business hours, etc.
  };
  dataRetention?: {
    duration: string;
    policy: string;
  };
}

export interface ServiceUsage {
  totalRequests: number;
  uniqueUsers: number;
  activeSubscriptions: number;
  requestsLast30Days: number;
  revenueLast30DaysUsd: number;
  averageLatencyMs: number;
  errorRate: number; // 0-1
  topConsumers: Array<{
    organizationId: string;
    organizationName: string;
    requests: number;
    revenue: number;
  }>;
}

export interface ServiceRevenue {
  totalRevenueUsd: number;
  revenueLast30DaysUsd: number;
  revenueLast12MonthsUsd: number;
  publisherShare: number; // 0-1
  platformShare: number; // 0-1
  pendingPayoutUsd: number;
  totalPayoutsUsd: number;
  payoutHistory: Array<{
    date: string;
    amountUsd: number;
    status: "pending" | "processing" | "completed" | "failed";
  }>;
}

export interface ServiceReview {
  id: string;
  userId: string;
  userName: string;
  rating: number; // 1-5
  title: string;
  comment: string;
  helpful: number;
  createdAt: string;
  verifiedPurchase: boolean;
}

export interface ServiceSubscription {
  id: string;
  serviceId: string;
  organizationId: string;
  userId: string;
  pricingModel: ServicePricingModel;
  tier?: string;
  status: "active" | "cancelled" | "expired" | "suspended";
  amountUsd: number;
  currency: string;
  startDate: string;
  endDate?: string;
  autoRenew: boolean;
  apiKey: ServiceAPIKey;
}

export interface ServiceAPIKey {
  id: string;
  key: string;
  name: string;
  serviceId: string;
  organizationId: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  rateLimits?: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
    requestsPerDay?: number;
  };
  permissions?: string[];
  status: "active" | "revoked" | "expired";
}

export interface ServiceUsageRecord {
  id: string;
  serviceId: string;
  organizationId: string;
  userId: string;
  apiKeyId: string;
  requestId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  timestamp: string;
  costUsd: number;
}

export interface ServiceSLAViolation {
  id: string;
  serviceId: string;
  organizationId: string;
  violationType: "uptime" | "latency" | "error_rate" | "support_response";
  severity: SLASeverity;
  description: string;
  metric: {
    target: number;
    actual: number;
    unit: string;
  };
  detectedAt: string;
  resolvedAt?: string;
  creditIssued?: {
    amountUsd: number;
    issuedAt: string;
  };
}

export interface ServiceMarketplaceStats {
  totalServices: number;
  publishedServices: number;
  totalRequests: number;
  totalRevenueUsd: number;
  revenueLast30DaysUsd: number;
  topServices: Array<{
    serviceId: string;
    name: string;
    requests: number;
    revenue: number;
    averageLatencyMs: number;
  }>;
  topPublishers: Array<{
    publisherId: string;
    publisherName: string;
    services: number;
    revenue: number;
  }>;
  servicesByCategory: Record<string, number>;
  servicesByProtocol: Record<string, number>;
  servicesByPricingModel: Record<string, number>;
  averageUptime: number;
  averageLatencyMs: number;
  totalSLAViolations: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const serviceListings = new Map<string, ServiceListing>();
const serviceSubscriptions = new Map<string, ServiceSubscription>();
const serviceAPIKeys = new Map<string, ServiceAPIKey>();
const serviceUsageRecords = new Map<string, ServiceUsageRecord[]>();
const serviceSLAViolations = new Map<string, ServiceSLAViolation[]>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a service listing
 */
export async function createServiceListing(params: {
  organizationId: string;
  name: string;
  description: string;
  publisherId: string;
  publisherName: string;
  category: ServiceCategory;
  protocol: ServiceProtocol;
  endpoint: string;
  documentation: ServiceDocumentation;
  pricing: ServicePricing;
  sla: ServiceSLA;
  tags?: string[];
}): Promise<ServiceListing> {
  const now = new Date().toISOString();

  const listing: ServiceListing = {
    id: `service_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    publisherId: params.publisherId,
    publisherName: params.publisherName,
    status: "draft",
    category: params.category,
    protocol: params.protocol,
    endpoint: params.endpoint,
    documentation: params.documentation,
    pricing: params.pricing,
    sla: params.sla,
    usage: {
      totalRequests: 0,
      uniqueUsers: 0,
      activeSubscriptions: 0,
      requestsLast30Days: 0,
      revenueLast30DaysUsd: 0,
      averageLatencyMs: 0,
      errorRate: 0,
      topConsumers: [],
    },
    revenue: {
      totalRevenueUsd: 0,
      revenueLast30DaysUsd: 0,
      revenueLast12MonthsUsd: 0,
      publisherShare: 0.7,
      platformShare: 0.3,
      pendingPayoutUsd: 0,
      totalPayoutsUsd: 0,
      payoutHistory: [],
    },
    reviews: [],
    tags: params.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };

  serviceListings.set(listing.id, listing);
  return listing;
}

/**
 * Publish service to marketplace
 */
export async function publishService(serviceId: string): Promise<ServiceListing | null> {
  const listing = serviceListings.get(serviceId);
  if (!listing) return null;

  listing.status = "published";
  listing.publishedAt = new Date().toISOString();
  listing.updatedAt = listing.publishedAt;

  serviceListings.set(serviceId, listing);
  return listing;
}

/**
 * Get service listing by ID
 */
export async function getServiceListing(serviceId: string): Promise<ServiceListing | null> {
  return serviceListings.get(serviceId) ?? null;
}

/**
 * List service listings
 */
export async function listServiceListings(
  filters?: {
    organizationId?: string;
    status?: ServiceMarketplaceStatus;
    category?: ServiceCategory;
    protocol?: ServiceProtocol;
    pricingModel?: ServicePricingModel;
    tags?: string[];
    search?: string;
    limit?: number;
  }
): Promise<ServiceListing[]> {
  let result = Array.from(serviceListings.values());

  if (filters?.organizationId) result = result.filter(s => s.organizationId === filters.organizationId);
  if (filters?.status) result = result.filter(s => s.status === filters.status);
  if (filters?.category) result = result.filter(s => s.category === filters.category);
  if (filters?.protocol) result = result.filter(s => s.protocol === filters.protocol);
  if (filters?.pricingModel) result = result.filter(s => s.pricing.model === filters.pricingModel);
  if (filters?.tags) result = result.filter(s => filters.tags!.some(tag => s.tags.includes(tag)));
  if (filters?.search) {
    const search = filters.search.toLowerCase();
    result = result.filter(s =>
      s.name.toLowerCase().includes(search) ||
      s.description.toLowerCase().includes(search)
    );
  }

  return result
    .sort((a, b) => b.usage.totalRequests - a.usage.totalRequests)
    .slice(0, filters?.limit ?? 50);
}

/**
 * Subscribe to a service
 */
export async function subscribeToService(params: {
  serviceId: string;
  organizationId: string;
  userId: string;
  pricingModel: ServicePricingModel;
  tier?: string;
  autoRenew?: boolean;
}): Promise<ServiceSubscription> {
  const listing = serviceListings.get(params.serviceId);
  if (!listing) throw new Error(`Service ${params.serviceId} not found`);

  const now = new Date().toISOString();
  let amountUsd = 0;

  // Calculate price based on pricing model
  switch (params.pricingModel) {
    case "subscription":
      amountUsd = listing.pricing.subscription?.monthlyPriceUsd ?? 0;
      break;
    case "tiered":
      const tier = listing.pricing.tiered?.tiers.find(t => t.name === params.tier);
      amountUsd = tier?.monthlyPriceUsd ?? 0;
      break;
    default:
      amountUsd = 0;
  }

  // Generate API key
  const apiKey: ServiceAPIKey = {
    id: `key_${randomUUID().slice(0, 8)}`,
    key: `sk_${randomUUID().replace(/-/g, "")}`,
    name: `${listing.name} API Key`,
    serviceId: params.serviceId,
    organizationId: params.organizationId,
    createdAt: now,
    status: "active",
    rateLimits: listing.pricing.subscription?.rateLimits ?? listing.pricing.free?.rateLimits,
  };

  serviceAPIKeys.set(apiKey.id, apiKey);

  const subscription: ServiceSubscription = {
    id: `sub_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    serviceId: params.serviceId,
    organizationId: params.organizationId,
    userId: params.userId,
    pricingModel: params.pricingModel,
    tier: params.tier,
    status: "active",
    amountUsd,
    currency: "USD",
    startDate: now,
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    autoRenew: params.autoRenew ?? true,
    apiKey,
  };

  serviceSubscriptions.set(subscription.id, subscription);

  // Update service usage
  listing.usage.activeSubscriptions++;
  listing.usage.uniqueUsers++;
  listing.revenue.totalRevenueUsd += amountUsd;
  listing.revenue.revenueLast30DaysUsd += amountUsd;
  listing.revenue.pendingPayoutUsd += amountUsd * listing.revenue.publisherShare;
  listing.updatedAt = now;

  serviceListings.set(params.serviceId, listing);
  return subscription;
}

/**
 * Generate API key for service
 */
export async function generateAPIKey(params: {
  serviceId: string;
  organizationId: string;
  name: string;
  rateLimits?: ServiceAPIKey["rateLimits"];
  permissions?: string[];
  expiresAt?: string;
}): Promise<ServiceAPIKey> {
  const listing = serviceListings.get(params.serviceId);
  if (!listing) throw new Error(`Service ${params.serviceId} not found`);

  const apiKey: ServiceAPIKey = {
    id: `key_${randomUUID().slice(0, 8)}`,
    key: `sk_${randomUUID().replace(/-/g, "")}`,
    name: params.name,
    serviceId: params.serviceId,
    organizationId: params.organizationId,
    createdAt: new Date().toISOString(),
    expiresAt: params.expiresAt,
    rateLimits: params.rateLimits,
    permissions: params.permissions,
    status: "active",
  };

  serviceAPIKeys.set(apiKey.id, apiKey);
  return apiKey;
}

/**
 * Record service usage
 */
export async function recordServiceUsage(params: {
  serviceId: string;
  organizationId: string;
  userId: string;
  apiKeyId: string;
  requestId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<ServiceUsageRecord> {
  const listing = serviceListings.get(params.serviceId);
  if (!listing) throw new Error(`Service ${params.serviceId} not found`);

  // Calculate cost based on pricing model
  let costUsd = 0;
  if (listing.pricing.model === "usage_based") {
    costUsd = listing.pricing.usageBased?.pricePerRequestUsd ?? 0;
    if (params.inputTokens && listing.pricing.usageBased?.pricePerTokenUsd) {
      costUsd += params.inputTokens * listing.pricing.usageBased.pricePerTokenUsd;
    }
    if (params.outputTokens && listing.pricing.usageBased?.pricePerTokenUsd) {
      costUsd += params.outputTokens * listing.pricing.usageBased.pricePerTokenUsd;
    }
  } else if (listing.pricing.model === "per_request") {
    costUsd = listing.pricing.perRequest?.pricePerRequestUsd ?? 0;
  }

  const usageRecord: ServiceUsageRecord = {
    id: `usage_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    serviceId: params.serviceId,
    organizationId: params.organizationId,
    userId: params.userId,
    apiKeyId: params.apiKeyId,
    requestId: params.requestId,
    endpoint: params.endpoint,
    method: params.method,
    statusCode: params.statusCode,
    latencyMs: params.latencyMs,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    timestamp: new Date().toISOString(),
    costUsd,
  };

  const records = serviceUsageRecords.get(params.serviceId) ?? [];
  records.push(usageRecord);
  serviceUsageRecords.set(params.serviceId, records);

  // Update service usage
  listing.usage.totalRequests++;
  listing.usage.requestsLast30Days++;
  listing.usage.averageLatencyMs = (listing.usage.averageLatencyMs * (listing.usage.totalRequests - 1) + params.latencyMs) / listing.usage.totalRequests;
  
  if (params.statusCode >= 400) {
    listing.usage.errorRate = (listing.usage.errorRate * (listing.usage.totalRequests - 1) + 1) / listing.usage.totalRequests;
  }

  listing.revenue.totalRevenueUsd += costUsd;
  listing.revenue.revenueLast30DaysUsd += costUsd;
  listing.revenue.pendingPayoutUsd += costUsd * listing.revenue.publisherShare;
  listing.updatedAt = usageRecord.timestamp;

  // Update API key last used
  const apiKey = serviceAPIKeys.get(params.apiKeyId);
  if (apiKey) {
    apiKey.lastUsedAt = usageRecord.timestamp;
    serviceAPIKeys.set(params.apiKeyId, apiKey);
  }

  serviceListings.set(params.serviceId, listing);
  return usageRecord;
}

/**
 * Record SLA violation
 */
export async function recordSLAViolation(params: {
  serviceId: string;
  organizationId: string;
  violationType: ServiceSLAViolation["violationType"];
  severity: SLASeverity;
  description: string;
  metric: ServiceSLAViolation["metric"];
}): Promise<ServiceSLAViolation> {
  const listing = serviceListings.get(params.serviceId);
  if (!listing) throw new Error(`Service ${params.serviceId} not found`);

  const violation: ServiceSLAViolation = {
    id: `violation_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    serviceId: params.serviceId,
    organizationId: params.organizationId,
    violationType: params.violationType,
    severity: params.severity,
    description: params.description,
    metric: params.metric,
    detectedAt: new Date().toISOString(),
  };

  const violations = serviceSLAViolations.get(params.serviceId) ?? [];
  violations.push(violation);
  serviceSLAViolations.set(params.serviceId, violations);

  // Calculate credit if applicable
  if (listing.sla.uptime.creditPolicy && params.violationType === "uptime") {
    const downtimePercent = ((params.metric.actual - params.metric.target) / params.metric.target) * 100;
    if (downtimePercent >= listing.sla.uptime.creditPolicy.downtimePercent) {
      const creditAmount = listing.revenue.revenueLast30DaysUsd * (listing.sla.uptime.creditPolicy.creditPercent / 100);
      violation.creditIssued = {
        amountUsd: creditAmount,
        issuedAt: new Date().toISOString(),
      };
    }
  }

  serviceSLAViolations.set(params.serviceId, violations);
  return violation;
}

/**
 * Get service usage records
 */
export async function getServiceUsageRecords(
  serviceId: string,
  filters?: {
    organizationId?: string;
    apiKeyId?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }
): Promise<ServiceUsageRecord[]> {
  let records = serviceUsageRecords.get(serviceId) ?? [];

  if (filters?.organizationId) {
    records = records.filter(r => r.organizationId === filters.organizationId);
  }
  if (filters?.apiKeyId) {
    records = records.filter(r => r.apiKeyId === filters.apiKeyId);
  }
  if (filters?.startTime) {
    records = records.filter(r => r.timestamp >= filters.startTime!);
  }
  if (filters?.endTime) {
    records = records.filter(r => r.timestamp <= filters.endTime!);
  }

  return records
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, filters?.limit ?? 100);
}

/**
 * Get SLA violations
 */
export async function getSLAViolations(
  serviceId: string,
  filters?: {
    organizationId?: string;
    severity?: SLASeverity;
    resolved?: boolean;
    limit?: number;
  }
): Promise<ServiceSLAViolation[]> {
  let violations = serviceSLAViolations.get(serviceId) ?? [];

  if (filters?.organizationId) {
    violations = violations.filter(v => v.organizationId === filters.organizationId);
  }
  if (filters?.severity) {
    violations = violations.filter(v => v.severity === filters.severity);
  }
  if (filters?.resolved !== undefined) {
    violations = violations.filter(v => (v.resolvedAt !== undefined) === filters.resolved);
  }

  return violations
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Get service marketplace statistics
 */
export async function getServiceMarketplaceStats(): Promise<ServiceMarketplaceStats> {
  const allServices = Array.from(serviceListings.values());
  const publishedServices = allServices.filter(s => s.status === "published");

  let totalRequests = 0;
  let totalRevenueUsd = 0;
  let revenueLast30DaysUsd = 0;
  let totalLatency = 0;
  let totalSLAViolations = 0;
  const servicesByCategory: Record<string, number> = {};
  const servicesByProtocol: Record<string, number> = {};
  const servicesByPricingModel: Record<string, number> = {};
  const publisherStats: Record<string, { name: string; services: number; revenue: number }> = {};

  for (const service of allServices) {
    totalRequests += service.usage.totalRequests;
    totalRevenueUsd += service.revenue.totalRevenueUsd;
    revenueLast30DaysUsd += service.revenue.revenueLast30DaysUsd;
    totalLatency += service.usage.averageLatencyMs;

    servicesByCategory[service.category] = (servicesByCategory[service.category] || 0) + 1;
    servicesByProtocol[service.protocol] = (servicesByProtocol[service.protocol] || 0) + 1;
    servicesByPricingModel[service.pricing.model] = (servicesByPricingModel[service.pricing.model] || 0) + 1;

    if (!publisherStats[service.publisherId]) {
      publisherStats[service.publisherId] = {
        name: service.publisherName,
        services: 0,
        revenue: 0,
      };
    }
    publisherStats[service.publisherId].services++;
    publisherStats[service.publisherId].revenue += service.revenue.totalRevenueUsd;

    const violations = serviceSLAViolations.get(service.id) ?? [];
    totalSLAViolations += violations.length;
  }

  const topServices = publishedServices
    .sort((a, b) => b.usage.totalRequests - a.usage.totalRequests)
    .slice(0, 10)
    .map(s => ({
      serviceId: s.id,
      name: s.name,
      requests: s.usage.totalRequests,
      revenue: s.revenue.totalRevenueUsd,
      averageLatencyMs: s.usage.averageLatencyMs,
    }));

  const topPublishers = Object.entries(publisherStats)
    .map(([id, stats]) => ({
      publisherId: id,
      publisherName: stats.name,
      services: stats.services,
      revenue: stats.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    totalServices: allServices.length,
    publishedServices: publishedServices.length,
    totalRequests,
    totalRevenueUsd,
    revenueLast30DaysUsd,
    topServices,
    topPublishers,
    servicesByCategory,
    servicesByProtocol,
    servicesByPricingModel,
    averageUptime: 0.999, // Default
    averageLatencyMs: allServices.length > 0 ? totalLatency / allServices.length : 0,
    totalSLAViolations,
  };
}

/**
 * Revoke API key
 */
export async function revokeAPIKey(apiKeyId: string): Promise<ServiceAPIKey | null> {
  const apiKey = serviceAPIKeys.get(apiKeyId);
  if (!apiKey) return null;

  apiKey.status = "revoked";
  serviceAPIKeys.set(apiKeyId, apiKey);
  return apiKey;
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(subscriptionId: string): Promise<ServiceSubscription | null> {
  const subscription = serviceSubscriptions.get(subscriptionId);
  if (!subscription) return null;

  subscription.status = "cancelled";
  subscription.endDate = new Date().toISOString();
  serviceSubscriptions.set(subscriptionId, subscription);

  // Update service usage
  const listing = serviceListings.get(subscription.serviceId);
  if (listing) {
    listing.usage.activeSubscriptions--;
    listing.updatedAt = new Date().toISOString();
    serviceListings.set(subscription.serviceId, listing);
  }

  return subscription;
}
