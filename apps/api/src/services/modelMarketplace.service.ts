/**
 * Module 46: Model Marketplace Service
 *
 * Provides a comprehensive marketplace for ML models with publishing, discovery,
 * versioning, pricing, licensing, usage tracking, revenue sharing, performance
 * tracking, and deployment orchestration.
 *
 * Phase 1 — Critical Gap: ML model marketplace infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModelMarketplaceStatus = "draft" | "pending_review" | "published" | "deprecated" | "archived";

export type ModelPricingModel = "free" | "one_time" | "subscription" | "usage_based" | "per_request" | "enterprise" | "tiered";

export type ModelLicense = "open_source" | "proprietary" | "commercial" | "academic" | "custom";

export type ModelFramework = "pytorch" | "tensorflow" | "jax" | "onnx" | "scikit_learn" | "xgboost" | "lightgbm" | "custom";

export type ModelTask = "classification" | "regression" | "object_detection" | "segmentation" | "generation" | "translation" | "summarization" | "embedding" | "clustering" | "reinforcement_learning" | "custom";

export interface ModelListing {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  publisherId: string;
  publisherName: string;
  status: ModelMarketplaceStatus;
  versions: ModelVersion[];
  latestVersion: string;
  pricing: ModelPricing;
  license: ModelLicenseConfig;
  metadata: ModelMetadata;
  performance: ModelPerformance;
  usage: ModelUsage;
  revenue: ModelRevenue;
  reviews: ModelReview[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface ModelVersion {
  version: string;
  modelId: string;
  framework: ModelFramework;
  task: ModelTask;
  sizeBytes: number;
  downloadUrl: string;
  checksum: string;
  metadata: {
    inputShape?: number[];
    outputShape?: number[];
    inputTypes?: string[];
    outputTypes?: string[];
    dependencies?: string[];
    hardwareRequirements?: {
      minCpuCores?: number;
      minMemoryMb?: number;
      minGpuMemoryMb?: number;
      recommendedGpu?: string;
    };
  };
  changelog: string;
  publishedAt: string;
  downloads: number;
}

export interface ModelPricing {
  model: ModelPricingModel;
  free?: {
    usageLimits?: {
      requestsPerDay?: number;
      requestsPerMonth?: number;
    };
  };
  oneTime?: {
    priceUsd: number;
    currency: string;
  };
  subscription?: {
    monthlyPriceUsd: number;
    yearlyPriceUsd?: number;
    currency: string;
    trial?: {
      durationDays: number;
      usageLimits?: {
        requestsPerDay?: number;
      };
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
      maxRequestsPerMonth: number;
      monthlyPriceUsd: number;
      features: string[];
    }>;
    currency: string;
  };
  enterprise?: {
    contactForPricing: boolean;
    customTerms: boolean;
    sla: boolean;
    support: boolean;
  };
}

export interface ModelLicenseConfig {
  type: ModelLicense;
  name?: string;
  url?: string;
  restrictions?: {
    commercialUse?: boolean;
    modification?: boolean;
    distribution?: boolean;
    privateUse?: boolean;
  };
  customTerms?: string;
}

export interface ModelMetadata {
  framework: ModelFramework;
  task: ModelTask;
  languages?: string[];
  domains?: string[];
  inputModalities?: string[];
  outputModalities?: string[];
  trainingData?: {
    name?: string;
    size?: string;
    source?: string;
    license?: string;
  };
  architecture?: string;
  parameters?: string;
  paperUrl?: string;
  repositoryUrl?: string;
  documentationUrl?: string;
  examples?: Array<{
    name: string;
    description: string;
    code: string;
  }>;
}

export interface ModelPerformance {
  benchmarks: Array<{
    name: string;
    dataset: string;
    metric: string;
    value: number;
    unit: string;
    comparison?: {
      baselineModel?: string;
      baselineValue?: number;
      improvement?: number;
    };
  }>;
  latency?: {
    averageMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    hardware: string;
  };
  throughput?: {
    requestsPerSecond: number;
    hardware: string;
  };
  resourceUsage?: {
    cpuPercent: number;
    memoryMb: number;
    gpuMemoryMb?: number;
    hardware: string;
  };
}

export interface ModelUsage {
  totalDownloads: number;
  totalRequests: number;
  uniqueUsers: number;
  activeSubscriptions: number;
  requestsLast30Days: number;
  revenueLast30DaysUsd: number;
  topConsumers: Array<{
    organizationId: string;
    organizationName: string;
    requests: number;
    revenue: number;
  }>;
}

export interface ModelRevenue {
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

export interface ModelReview {
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

export interface ModelPurchase {
  id: string;
  modelId: string;
  modelVersion: string;
  organizationId: string;
  userId: string;
  pricingModel: ModelPricingModel;
  amountUsd: number;
  currency: string;
  status: "pending" | "completed" | "refunded" | "failed";
  subscriptionId?: string;
  purchasedAt: string;
  expiresAt?: string;
}

export interface ModelUsageRecord {
  id: string;
  modelId: string;
  modelVersion: string;
  organizationId: string;
  userId: string;
  requestId: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  timestamp: string;
  costUsd: number;
}

export interface ModelMarketplaceStats {
  totalModels: number;
  publishedModels: number;
  totalDownloads: number;
  totalRequests: number;
  totalRevenueUsd: number;
  revenueLast30DaysUsd: number;
  topModels: Array<{
    modelId: string;
    name: string;
    downloads: number;
    requests: number;
    revenue: number;
  }>;
  topPublishers: Array<{
    publisherId: string;
    publisherName: string;
    models: number;
    revenue: number;
  }>;
  modelsByFramework: Record<string, number>;
  modelsByTask: Record<string, number>;
  modelsByPricingModel: Record<string, number>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const modelListings = new Map<string, ModelListing>();
const modelPurchases = new Map<string, ModelPurchase>();
const modelUsageRecords = new Map<string, ModelUsageRecord[]>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a model listing
 */
export async function createModelListing(params: {
  organizationId: string;
  name: string;
  description: string;
  publisherId: string;
  publisherName: string;
  pricing: ModelPricing;
  license: ModelLicenseConfig;
  metadata: ModelMetadata;
  tags?: string[];
}): Promise<ModelListing> {
  const now = new Date().toISOString();

  const listing: ModelListing = {
    id: `model_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    publisherId: params.publisherId,
    publisherName: params.publisherName,
    status: "draft",
    versions: [],
    latestVersion: "",
    pricing: params.pricing,
    license: params.license,
    metadata: params.metadata,
    performance: {
      benchmarks: [],
    },
    usage: {
      totalDownloads: 0,
      totalRequests: 0,
      uniqueUsers: 0,
      activeSubscriptions: 0,
      requestsLast30Days: 0,
      revenueLast30DaysUsd: 0,
      topConsumers: [],
    },
    revenue: {
      totalRevenueUsd: 0,
      revenueLast30DaysUsd: 0,
      revenueLast12MonthsUsd: 0,
      publisherShare: 0.7, // 70% to publisher
      platformShare: 0.3, // 30% to platform
      pendingPayoutUsd: 0,
      totalPayoutsUsd: 0,
      payoutHistory: [],
    },
    reviews: [],
    tags: params.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };

  modelListings.set(listing.id, listing);
  return listing;
}

/**
 * Publish a model version
 */
export async function publishModelVersion(
  modelId: string,
  version: Omit<ModelVersion, "version" | "modelId" | "publishedAt" | "downloads">
): Promise<ModelVersion> {
  const listing = modelListings.get(modelId);
  if (!listing) throw new Error(`Model ${modelId} not found`);

  const versionNumber = `${listing.versions.length + 1}.0.0`;
  const modelVersion: ModelVersion = {
    ...version,
    version: versionNumber,
    modelId,
    publishedAt: new Date().toISOString(),
    downloads: 0,
  };

  listing.versions.push(modelVersion);
  listing.latestVersion = versionNumber;
  listing.metadata.framework = version.framework;
  listing.metadata.task = version.task;
  listing.updatedAt = modelVersion.publishedAt;

  modelListings.set(modelId, listing);
  return modelVersion;
}

/**
 * Publish model to marketplace
 */
export async function publishModel(modelId: string): Promise<ModelListing | null> {
  const listing = modelListings.get(modelId);
  if (!listing) return null;

  if (listing.versions.length === 0) {
    throw new Error("Cannot publish model without any versions");
  }

  listing.status = "published";
  listing.publishedAt = new Date().toISOString();
  listing.updatedAt = listing.publishedAt;

  modelListings.set(modelId, listing);
  return listing;
}

/**
 * Get model listing by ID
 */
export async function getModelListing(modelId: string): Promise<ModelListing | null> {
  return modelListings.get(modelId) ?? null;
}

/**
 * List model listings
 */
export async function listModelListings(
  filters?: {
    organizationId?: string;
    status?: ModelMarketplaceStatus;
    framework?: ModelFramework;
    task?: ModelTask;
    pricingModel?: ModelPricingModel;
    tags?: string[];
    search?: string;
    limit?: number;
  }
): Promise<ModelListing[]> {
  let result = Array.from(modelListings.values());

  if (filters?.organizationId) result = result.filter(m => m.organizationId === filters.organizationId);
  if (filters?.status) result = result.filter(m => m.status === filters.status);
  if (filters?.framework) result = result.filter(m => m.metadata.framework === filters.framework);
  if (filters?.task) result = result.filter(m => m.metadata.task === filters.task);
  if (filters?.pricingModel) result = result.filter(m => m.pricing.model === filters.pricingModel);
  if (filters?.tags) result = result.filter(m => filters.tags!.some(tag => m.tags.includes(tag)));
  if (filters?.search) {
    const search = filters.search.toLowerCase();
    result = result.filter(m =>
      m.name.toLowerCase().includes(search) ||
      m.description.toLowerCase().includes(search)
    );
  }

  return result
    .sort((a, b) => b.usage.totalDownloads - a.usage.totalDownloads)
    .slice(0, filters?.limit ?? 50);
}

/**
 * Purchase a model
 */
export async function purchaseModel(params: {
  modelId: string;
  modelVersion: string;
  organizationId: string;
  userId: string;
  pricingModel: ModelPricingModel;
}): Promise<ModelPurchase> {
  const listing = modelListings.get(params.modelId);
  if (!listing) throw new Error(`Model ${params.modelId} not found`);

  const now = new Date().toISOString();
  let amountUsd = 0;

  // Calculate price based on pricing model
  switch (params.pricingModel) {
    case "free":
      amountUsd = 0;
      break;
    case "one_time":
      amountUsd = listing.pricing.oneTime?.priceUsd ?? 0;
      break;
    case "subscription":
      amountUsd = listing.pricing.subscription?.monthlyPriceUsd ?? 0;
      break;
    default:
      amountUsd = 0;
  }

  const purchase: ModelPurchase = {
    id: `purchase_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    organizationId: params.organizationId,
    userId: params.userId,
    pricingModel: params.pricingModel,
    amountUsd,
    currency: "USD",
    status: "completed",
    purchasedAt: now,
    expiresAt: params.pricingModel === "subscription"
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : undefined,
  };

  modelPurchases.set(purchase.id, purchase);

  // Update model usage
  listing.usage.totalDownloads++;
  listing.usage.uniqueUsers++;
  listing.revenue.totalRevenueUsd += amountUsd;
  listing.revenue.revenueLast30DaysUsd += amountUsd;
  listing.revenue.pendingPayoutUsd += amountUsd * listing.revenue.publisherShare;
  listing.updatedAt = now;

  // Update version downloads
  const version = listing.versions.find(v => v.version === params.modelVersion);
  if (version) {
    version.downloads++;
  }

  modelListings.set(params.modelId, listing);
  return purchase;
}

/**
 * Record model usage
 */
export async function recordModelUsage(params: {
  modelId: string;
  modelVersion: string;
  organizationId: string;
  userId: string;
  requestId: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}): Promise<ModelUsageRecord> {
  const listing = modelListings.get(params.modelId);
  if (!listing) throw new Error(`Model ${params.modelId} not found`);

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

  const usageRecord: ModelUsageRecord = {
    id: `usage_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    organizationId: params.organizationId,
    userId: params.userId,
    requestId: params.requestId,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    latencyMs: params.latencyMs,
    timestamp: new Date().toISOString(),
    costUsd,
  };

  const records = modelUsageRecords.get(params.modelId) ?? [];
  records.push(usageRecord);
  modelUsageRecords.set(params.modelId, records);

  // Update model usage
  listing.usage.totalRequests++;
  listing.usage.requestsLast30Days++;
  listing.revenue.totalRevenueUsd += costUsd;
  listing.revenue.revenueLast30DaysUsd += costUsd;
  listing.revenue.pendingPayoutUsd += costUsd * listing.revenue.publisherShare;
  listing.updatedAt = usageRecord.timestamp;

  modelListings.set(params.modelId, listing);
  return usageRecord;
}

/**
 * Add model review
 */
export async function addModelReview(
  modelId: string,
  review: Omit<ModelReview, "id" | "createdAt" | "helpful">
): Promise<ModelReview> {
  const listing = modelListings.get(modelId);
  if (!listing) throw new Error(`Model ${modelId} not found`);

  const modelReview: ModelReview = {
    ...review,
    id: `review_${randomUUID().slice(0, 8)}`,
    helpful: 0,
    createdAt: new Date().toISOString(),
  };

  listing.reviews.push(modelReview);
  listing.updatedAt = modelReview.createdAt;

  modelListings.set(modelId, listing);
  return modelReview;
}

/**
 * Get model usage records
 */
export async function getModelUsageRecords(
  modelId: string,
  filters?: {
    organizationId?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }
): Promise<ModelUsageRecord[]> {
  let records = modelUsageRecords.get(modelId) ?? [];

  if (filters?.organizationId) {
    records = records.filter(r => r.organizationId === filters.organizationId);
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
 * Get model marketplace statistics
 */
export async function getModelMarketplaceStats(): Promise<ModelMarketplaceStats> {
  const allModels = Array.from(modelListings.values());
  const publishedModels = allModels.filter(m => m.status === "published");

  let totalDownloads = 0;
  let totalRequests = 0;
  let totalRevenueUsd = 0;
  let revenueLast30DaysUsd = 0;
  const modelsByFramework: Record<string, number> = {};
  const modelsByTask: Record<string, number> = {};
  const modelsByPricingModel: Record<string, number> = {};
  const publisherStats: Record<string, { name: string; models: number; revenue: number }> = {};

  for (const model of allModels) {
    totalDownloads += model.usage.totalDownloads;
    totalRequests += model.usage.totalRequests;
    totalRevenueUsd += model.revenue.totalRevenueUsd;
    revenueLast30DaysUsd += model.revenue.revenueLast30DaysUsd;

    modelsByFramework[model.metadata.framework] = (modelsByFramework[model.metadata.framework] || 0) + 1;
    modelsByTask[model.metadata.task] = (modelsByTask[model.metadata.task] || 0) + 1;
    modelsByPricingModel[model.pricing.model] = (modelsByPricingModel[model.pricing.model] || 0) + 1;

    if (!publisherStats[model.publisherId]) {
      publisherStats[model.publisherId] = {
        name: model.publisherName,
        models: 0,
        revenue: 0,
      };
    }
    publisherStats[model.publisherId].models++;
    publisherStats[model.publisherId].revenue += model.revenue.totalRevenueUsd;
  }

  const topModels = publishedModels
    .sort((a, b) => b.usage.totalDownloads - a.usage.totalDownloads)
    .slice(0, 10)
    .map(m => ({
      modelId: m.id,
      name: m.name,
      downloads: m.usage.totalDownloads,
      requests: m.usage.totalRequests,
      revenue: m.revenue.totalRevenueUsd,
    }));

  const topPublishers = Object.entries(publisherStats)
    .map(([id, stats]) => ({
      publisherId: id,
      publisherName: stats.name,
      models: stats.models,
      revenue: stats.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    totalModels: allModels.length,
    publishedModels: publishedModels.length,
    totalDownloads,
    totalRequests,
    totalRevenueUsd,
    revenueLast30DaysUsd,
    topModels,
    topPublishers,
    modelsByFramework,
    modelsByTask,
    modelsByPricingModel,
  };
}

/**
 * Process publisher payouts
 */
export async function processPublisherPayouts(publisherId: string): Promise<{
  payoutId: string;
  amountUsd: number;
  status: "completed" | "failed";
}> {
  const publisherModels = Array.from(modelListings.values()).filter(
    m => m.publisherId === publisherId
  );

  let totalPayout = 0;
  for (const model of publisherModels) {
    totalPayout += model.revenue.pendingPayoutUsd;
    model.revenue.totalPayoutsUsd += model.revenue.pendingPayoutUsd;
    model.revenue.pendingPayoutUsd = 0;
    model.revenue.payoutHistory.push({
      date: new Date().toISOString(),
      amountUsd: model.revenue.pendingPayoutUsd,
      status: "completed",
    });
    modelListings.set(model.id, model);
  }

  return {
    payoutId: `payout_${randomUUID().slice(0, 8)}`,
    amountUsd: totalPayout,
    status: "completed",
  };
}
