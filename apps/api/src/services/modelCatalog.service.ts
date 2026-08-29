/**
 * Model Catalog Service (Module 26 — Gap 2)
 *
 * Model catalog with search, filtering, and discovery:
 * - Search models by name, description, capabilities
 * - Filter models by provider, capabilities, requirements
 * - Discover models by popularity, rating, downloads
 * - Model recommendations based on use case
 * - Model comparison
 *
 * Enables easy model discovery and selection.
 */
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { redisCmd } from "../db/redis.js";
import {
  getModelPackage,
  getAllPackages,
  type ModelPackage,
} from "./modelPackaging.service";

// ─── Types ──────────────────────────────────────────────────────

export interface CatalogSearchFilters {
  query?: string;
  provider?: string;
  capabilities?: string[];
  minContextWindow?: number;
  maxContextWindow?: number;
  minMaxOutputTokens?: number;
  maxCostInputPer1k?: number;
  maxCostOutputPer1k?: number;
  minRating?: number;
  signed?: boolean;
  published?: boolean;
}

export interface CatalogSearchResult {
  packages: ModelPackage[];
  total: number;
  filters: CatalogSearchFilters;
  facets: {
    providers: Array<{ provider: string; count: number }>;
    capabilities: Array<{ capability: string; count: number }>;
    ratings: Array<{ rating: number; count: number }>;
  };
}

export interface ModelRecommendation {
  packageId: string;
  modelName: string;
  provider: string;
  score: number;
  reasons: string[];
}

export interface ModelComparison {
  packages: ModelPackage[];
  comparison: {
    capabilities: Record<string, boolean[]>;
    contextWindow: number[];
    maxOutputTokens: number[];
    costInputPer1k: number[];
    costOutputPer1k: number[];
    rating: (number | undefined)[];
    downloads: number[];
  };
}

export interface CatalogStats {
  totalModels: number;
  totalPackages: number;
  totalDownloads: number;
  byProvider: Record<string, number>;
  byCapability: Record<string, number>;
  averageRating: number;
  topModels: Array<{ modelId: string; modelName: string; downloads: number; rating?: number }>;
  popularCapabilities: Array<{ capability: string; count: number }>;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const CATALOG_STATS_KEY = "model:catalog:stats";
const SEARCH_INDEX_KEY = "model:catalog:search:index";

// ─── Catalog Search ─────────────────────────────────────────────

/**
 * Search model catalog
 */
export async function searchCatalog(
  filters: CatalogSearchFilters = {},
  limit: number = 50,
  offset: number = 0,
): Promise<CatalogSearchResult> {
  const allPackages = await getAllPackages(1000);
  let filteredPackages = allPackages;

  // Apply filters
  if (filters.query) {
    const query = filters.query.toLowerCase();
    filteredPackages = filteredPackages.filter(pkg =>
      pkg.modelName.toLowerCase().includes(query) ||
      pkg.description?.toLowerCase().includes(query) ||
      pkg.provider.toLowerCase().includes(query)
    );
  }

  if (filters.provider) {
    filteredPackages = filteredPackages.filter(pkg => pkg.provider === filters.provider);
  }

  if (filters.capabilities && filters.capabilities.length > 0) {
    filteredPackages = filteredPackages.filter(pkg =>
      filters.capabilities!.every(cap => pkg.capabilities.includes(cap))
    );
  }

  if (filters.minContextWindow !== undefined) {
    filteredPackages = filteredPackages.filter(pkg => pkg.contextWindow >= filters.minContextWindow!);
  }

  if (filters.maxContextWindow !== undefined) {
    filteredPackages = filteredPackages.filter(pkg => pkg.contextWindow <= filters.maxContextWindow!);
  }

  if (filters.minMaxOutputTokens !== undefined) {
    filteredPackages = filteredPackages.filter(pkg => pkg.maxOutputTokens >= filters.minMaxOutputTokens!);
  }

  if (filters.maxCostInputPer1k !== undefined) {
    filteredPackages = filteredPackages.filter(pkg => pkg.costInputPer1k <= filters.maxCostInputPer1k!);
  }

  if (filters.maxCostOutputPer1k !== undefined) {
    filteredPackages = filteredPackages.filter(pkg => pkg.costOutputPer1k <= filters.maxCostOutputPer1k!);
  }

  if (filters.minRating !== undefined) {
    filteredPackages = filteredPackages.filter(pkg => 
      pkg.rating !== undefined && pkg.rating >= filters.minRating!
    );
  }

  if (filters.signed !== undefined) {
    filteredPackages = filteredPackages.filter(pkg => pkg.signed === filters.signed);
  }

  if (filters.published !== undefined) {
    filteredPackages = filteredPackages.filter(pkg => 
      filters.published ? pkg.publishedAt !== undefined : !pkg.publishedAt
    );
  }

  const total = filteredPackages.length;

  // Apply pagination
  const paginatedPackages = filteredPackages.slice(offset, offset + limit);

  // Calculate facets
  const providers: Record<string, number> = {};
  const capabilities: Record<string, number> = {};
  const ratings: Record<number, number> = {};

  for (const pkg of filteredPackages) {
    providers[pkg.provider] = (providers[pkg.provider] || 0) + 1;

    for (const capability of pkg.capabilities) {
      capabilities[capability] = (capabilities[capability] || 0) + 1;
    }

    if (pkg.rating !== undefined) {
      const ratingBucket = Math.floor(pkg.rating);
      ratings[ratingBucket] = (ratings[ratingBucket] || 0) + 1;
    }
  }

  const result: CatalogSearchResult = {
    packages: paginatedPackages,
    total,
    filters,
    facets: {
      providers: Object.entries(providers)
        .map(([provider, count]) => ({ provider, count }))
        .sort((a, b) => b.count - a.count),
      capabilities: Object.entries(capabilities)
        .map(([capability, count]) => ({ capability, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      ratings: Object.entries(ratings)
        .map(([rating, count]) => ({ rating: parseInt(rating), count }))
        .sort((a, b) => b.rating - a.rating),
    },
  };

  Metrics.increment("model.catalog.search", 1);

  logger.info("Catalog search performed", {
    total,
    returned: paginatedPackages.length,
    filters: Object.keys(filters).length,
  });

  return result;
}

/**
 * Get model recommendations based on use case
 */
export async function getModelRecommendations(
  useCase: string,
  limit: number = 10,
): Promise<ModelRecommendation[]> {
  const allPackages = await getAllPackages(1000);
  const publishedPackages = allPackages.filter(pkg => pkg.publishedAt !== undefined);

  const recommendations: ModelRecommendation[] = [];

  for (const pkg of publishedPackages) {
    let score = 0;
    const reasons: string[] = [];

    // Score based on use case
    const useCaseLower = useCase.toLowerCase();

    if (useCaseLower.includes("chat") && pkg.capabilities.includes("chat")) {
      score += 30;
      reasons.push("Supports chat capability");
    }

    if (useCaseLower.includes("vision") && pkg.capabilities.includes("vision")) {
      score += 30;
      reasons.push("Supports vision capability");
    }

    if (useCaseLower.includes("tools") && pkg.capabilities.includes("tools")) {
      score += 25;
      reasons.push("Supports tools capability");
    }

    if (useCaseLower.includes("code") && pkg.capabilities.includes("code")) {
      score += 25;
      reasons.push("Supports code capability");
    }

    // Score based on context window
    if (useCaseLower.includes("long") || useCaseLower.includes("large")) {
      if (pkg.contextWindow >= 128000) {
        score += 20;
        reasons.push("Large context window");
      }
    }

    // Score based on rating
    if (pkg.rating !== undefined) {
      score += pkg.rating * 5;
      reasons.push(`High rating: ${pkg.rating}/5`);
    }

    // Score based on popularity
    score += Math.min(pkg.downloads / 100, 20);
    if (pkg.downloads > 100) {
      reasons.push(`Popular: ${pkg.downloads} downloads`);
    }

    // Score based on cost
    if (useCaseLower.includes("cheap") || useCaseLower.includes("cost")) {
      if (pkg.costInputPer1k === 0 && pkg.costOutputPer1k === 0) {
        score += 15;
        reasons.push("Free to use");
      }
    }

    // Score based on signed
    if (pkg.signed) {
      score += 10;
      reasons.push("Signed package");
    }

    if (score > 0) {
      recommendations.push({
        packageId: pkg.id,
        modelName: pkg.modelName,
        provider: pkg.provider,
        score,
        reasons,
      });
    }
  }

  // Sort by score and limit
  recommendations.sort((a, b) => b.score - a.score);

  Metrics.increment("model.catalog.recommendations", 1, {
    useCase,
  });

  logger.info("Model recommendations generated", {
    useCase,
    recommendations: recommendations.length,
  });

  return recommendations.slice(0, limit);
}

/**
 * Compare multiple models
 */
export async function compareModels(
  packageIds: string[],
): Promise<ModelComparison | null> {
  if (packageIds.length < 2) {
    return null;
  }

  const packages: ModelPackage[] = [];

  for (const packageId of packageIds) {
    const pkg = await getModelPackage(packageId);
    if (pkg) {
      packages.push(pkg);
    }
  }

  if (packages.length < 2) {
    return null;
  }

  // Build comparison
  const allCapabilities = new Set<string>();
  for (const pkg of packages) {
    for (const capability of pkg.capabilities) {
      allCapabilities.add(capability);
    }
  }

  const capabilities: Record<string, boolean[]> = {};
  for (const capability of allCapabilities) {
    capabilities[capability] = packages.map(pkg => pkg.capabilities.includes(capability));
  }

  const comparison: ModelComparison = {
    packages,
    comparison: {
      capabilities,
      contextWindow: packages.map(pkg => pkg.contextWindow),
      maxOutputTokens: packages.map(pkg => pkg.maxOutputTokens),
      costInputPer1k: packages.map(pkg => pkg.costInputPer1k),
      costOutputPer1k: packages.map(pkg => pkg.costOutputPer1k),
      rating: packages.map(pkg => pkg.rating),
      downloads: packages.map(pkg => pkg.downloads),
    },
  };

  Metrics.increment("model.catalog.comparison", 1, {
    modelCount: packages.length,
  });

  logger.info("Model comparison performed", {
    modelCount: packages.length,
  });

  return comparison;
}

// ─── Catalog Statistics ─────────────────────────────────────────

/**
 * Get catalog statistics
 */
export async function getCatalogStats(): Promise<CatalogStats> {
  const allPackages = await getAllPackages(1000);

  const uniqueModels = new Set<string>();
  const byProvider: Record<string, number> = {};
  const byCapability: Record<string, number> = {};
  let totalDownloads = 0;
  let totalRating = 0;
  let ratingCount = 0;

  for (const pkg of allPackages) {
    uniqueModels.add(pkg.modelId);
    byProvider[pkg.provider] = (byProvider[pkg.provider] || 0) + 1;

    for (const capability of pkg.capabilities) {
      byCapability[capability] = (byCapability[capability] || 0) + 1;
    }

    totalDownloads += pkg.downloads;

    if (pkg.rating !== undefined) {
      totalRating += pkg.rating;
      ratingCount++;
    }
  }

  const averageRating = ratingCount > 0 ? totalRating / ratingCount : 0;

  // Get top models by downloads
  const modelDownloads: Record<string, { modelName: string; downloads: number; rating?: number }> = {};
  for (const pkg of allPackages) {
    if (!modelDownloads[pkg.modelId] || pkg.downloads > modelDownloads[pkg.modelId].downloads) {
      modelDownloads[pkg.modelId] = {
        modelName: pkg.modelName,
        downloads: pkg.downloads,
        rating: pkg.rating,
      };
    }
  }

  const topModels = Object.entries(modelDownloads)
    .map(([modelId, data]) => ({ modelId, ...data }))
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, 10);

  const popularCapabilities = Object.entries(byCapability)
    .map(([capability, count]) => ({ capability, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    totalModels: uniqueModels.size,
    totalPackages: allPackages.length,
    totalDownloads,
    byProvider,
    byCapability,
    averageRating,
    topModels,
    popularCapabilities,
  };
}

// ─── Catalog Browsing ───────────────────────────────────────────

/**
 * Get featured models (high rating + high downloads)
 */
export async function getFeaturedModels(limit: number = 10): Promise<ModelPackage[]> {
  const allPackages = await getAllPackages(1000);
  const publishedPackages = allPackages.filter(pkg => pkg.publishedAt !== undefined);

  // Score packages by rating and downloads
  const scored = publishedPackages.map(pkg => ({
    pkg,
    score: (pkg.rating || 0) * 20 + Math.min(pkg.downloads / 10, 50),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(s => s.pkg);
}

/**
 * Get trending models (high recent downloads)
 */
export async function getTrendingModels(limit: number = 10): Promise<ModelPackage[]> {
  const allPackages = await getAllPackages(1000);
  const publishedPackages = allPackages.filter(pkg => pkg.publishedAt !== undefined);

  // Sort by downloads (would need timestamp for true trending)
  publishedPackages.sort((a, b) => b.downloads - a.downloads);

  return publishedPackages.slice(0, limit);
}

/**
 * Get models by provider
 */
export async function getModelsByProvider(
  provider: string,
  limit: number = 50,
): Promise<ModelPackage[]> {
  const allPackages = await getAllPackages(1000);
  const providerPackages = allPackages.filter(pkg => pkg.provider === provider);

  return providerPackages.slice(0, limit);
}

/**
 * Get models by capability
 */
export async function getModelsByCapability(
  capability: string,
  limit: number = 50,
): Promise<ModelPackage[]> {
  const allPackages = await getAllPackages(1000);
  const capabilityPackages = allPackages.filter(pkg => pkg.capabilities.includes(capability));

  return capabilityPackages.slice(0, limit);
}
