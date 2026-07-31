/**
 * Model Packaging Service (Module 26 — Gap 1)
 *
 * Package AI models for distribution:
 * - Package models with dependencies, metadata, and versioning
 * - Model manifest with capabilities and requirements
 * - Dependency resolution and validation
 * - Package signing and verification
 * - Package export and import
 *
 * Enables model distribution with proper dependency management.
 */
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { redisCmd } from "../db/redis.js";
import { prisma } from "../db/client.js";
import { createHash } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { createGzip, createGunzip } from "zlib";
import { pipeline } from "stream/promises";

// ─── Types ──────────────────────────────────────────────────────

export interface ModelPackage {
  id: string;
  modelId: string;
  modelName: string;
  version: string;
  provider: string;
  description?: string;
  capabilities: string[];
  contextWindow: number;
  maxOutputTokens: number;
  costInputPer1k: number;
  costOutputPer1k: number;
  dependencies: ModelDependency[];
  requirements: ModelRequirements;
  metadata: Record<string, any>;
  packageUrl?: string;
  packageSize?: number;
  checksum?: string;
  signed: boolean;
  signature?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  publishedBy?: string;
  downloads: number;
  rating?: number;
  ratingCount?: number;
}

export interface ModelDependency {
  modelId: string;
  version: string;
  optional: boolean;
}

export interface ModelRequirements {
  minMemoryMb?: number;
  minGpuMemoryMb?: number;
  supportedPlatforms?: string[];
  supportedQuantizations?: string[];
  license?: string;
}

export interface ModelManifest {
  packageId: string;
  modelId: string;
  version: string;
  provider: string;
  capabilities: string[];
  dependencies: ModelDependency[];
  requirements: ModelRequirements;
  checksum: string;
  signature?: string;
}

export interface PackageStats {
  totalPackages: number;
  totalDownloads: number;
  byProvider: Record<string, number>;
  byCapability: Record<string, number>;
  topPackages: Array<{ packageId: string; modelName: string; downloads: number }>;
  averageRating: number;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const PACKAGE_KEY = (packageId: string) => `model:package:${packageId}`;
const PACKAGES_KEY = "model:packages";
const PACKAGES_BY_MODEL_KEY = (modelId: string) => `model:packages:model:${modelId}`;
const PACKAGE_STATS_KEY = "model:package:stats";

// ─── Package Management ─────────────────────────────────────────

/**
 * Create model package
 */
export async function createModelPackage(input: {
  modelId: string;
  modelName: string;
  version: string;
  provider: string;
  description?: string;
  capabilities: string[];
  contextWindow: number;
  maxOutputTokens: number;
  costInputPer1k: number;
  costOutputPer1k: number;
  dependencies?: ModelDependency[];
  requirements?: ModelRequirements;
  metadata?: Record<string, any>;
  packageUrl?: string;
  packageSize?: number;
}): Promise<ModelPackage> {
  const packageId = `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const pkg: ModelPackage = {
    id: packageId,
    modelId: input.modelId,
    modelName: input.modelName,
    version: input.version,
    provider: input.provider,
    description: input.description,
    capabilities: input.capabilities,
    contextWindow: input.contextWindow,
    maxOutputTokens: input.maxOutputTokens,
    costInputPer1k: input.costInputPer1k,
    costOutputPer1k: input.costOutputPer1k,
    dependencies: input.dependencies || [],
    requirements: input.requirements || {},
    metadata: input.metadata || {},
    packageUrl: input.packageUrl,
    packageSize: input.packageSize,
    signed: false,
    createdAt: now,
    updatedAt: now,
    downloads: 0,
  };

  // Calculate checksum if package URL exists
  if (input.packageUrl) {
    pkg.checksum = await calculateChecksum(input.packageUrl);
  }

  await redisCmd.set(PACKAGE_KEY(packageId), JSON.stringify(pkg));
  await redisCmd.sadd(PACKAGES_KEY, packageId);
  await redisCmd.sadd(PACKAGES_BY_MODEL_KEY(input.modelId), packageId);

  logger.info("Model package created", {
    packageId,
    modelId: input.modelId,
    modelName: input.modelName,
    version: input.version,
    dependencies: pkg.dependencies.length,
  });

  Metrics.increment("model.package.created", 1, {
    provider: input.provider,
  });

  return pkg;
}

/**
 * Get model package by ID
 */
export async function getModelPackage(packageId: string): Promise<ModelPackage | null> {
  const data = await redisCmd.get(PACKAGE_KEY(packageId));
  return data ? JSON.parse(data) : null;
}

/**
 * Get all packages for a model
 */
export async function getModelPackages(modelId: string): Promise<ModelPackage[]> {
  const packageIds = await redisCmd.smembers(PACKAGES_BY_MODEL_KEY(modelId));
  const packages: ModelPackage[] = [];

  for (const id of packageIds) {
    const pkg = await getModelPackage(id);
    if (pkg) {
      packages.push(pkg);
    }
  }

  return packages.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Get all packages
 */
export async function getAllPackages(limit: number = 100): Promise<ModelPackage[]> {
  const packageIds = await redisCmd.smembers(PACKAGES_KEY);
  const packages: ModelPackage[] = [];

  for (const id of packageIds.slice(0, limit)) {
    const pkg = await getModelPackage(id);
    if (pkg) {
      packages.push(pkg);
    }
  }

  return packages.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Update model package
 */
export async function updateModelPackage(
  packageId: string,
  updates: Partial<ModelPackage>,
): Promise<ModelPackage | null> {
  const data = await redisCmd.get(PACKAGE_KEY(packageId));
  if (!data) return null;

  const pkg: ModelPackage = { ...JSON.parse(data), ...updates, updatedAt: new Date().toISOString() };
  await redisCmd.set(PACKAGE_KEY(packageId), JSON.stringify(pkg));

  logger.info("Model package updated", {
    packageId,
    updates: Object.keys(updates),
  });

  return pkg;
}

/**
 * Delete model package
 */
export async function deleteModelPackage(packageId: string): Promise<void> {
  const pkg = await getModelPackage(packageId);
  if (!pkg) return;

  await redisCmd.del(PACKAGE_KEY(packageId));
  await redisCmd.srem(PACKAGES_KEY, packageId);
  await redisCmd.srem(PACKAGES_BY_MODEL_KEY(pkg.modelId), packageId);

  logger.info("Model package deleted", { packageId });
}

/**
 * Publish model package
 */
export async function publishModelPackage(
  packageId: string,
  publishedBy: string,
): Promise<ModelPackage | null> {
  const pkg = await getModelPackage(packageId);
  if (!pkg) return null;

  pkg.publishedAt = new Date().toISOString();
  pkg.publishedBy = publishedBy;
  pkg.updatedAt = pkg.publishedAt;

  await redisCmd.set(PACKAGE_KEY(packageId), JSON.stringify(pkg));

  logger.info("Model package published", {
    packageId,
    publishedBy,
  });

  Metrics.increment("model.package.published", 1, {
    provider: pkg.provider,
  });

  return pkg;
}

/**
 * Record package download
 */
export async function recordPackageDownload(packageId: string): Promise<void> {
  const pkg = await getModelPackage(packageId);
  if (!pkg) return;

  pkg.downloads++;
  pkg.updatedAt = new Date().toISOString();

  await redisCmd.set(PACKAGE_KEY(packageId), JSON.stringify(pkg));

  Metrics.increment("model.package.downloaded", 1, {
    provider: pkg.provider,
  });
}

// ─── Package Manifest ───────────────────────────────────────────

/**
 * Generate package manifest
 */
export async function generateManifest(packageId: string): Promise<ModelManifest | null> {
  const pkg = await getModelPackage(packageId);
  if (!pkg) return null;

  const manifest: ModelManifest = {
    packageId: pkg.id,
    modelId: pkg.modelId,
    version: pkg.version,
    provider: pkg.provider,
    capabilities: pkg.capabilities,
    dependencies: pkg.dependencies,
    requirements: pkg.requirements,
    checksum: pkg.checksum || "",
    signature: pkg.signature,
  };

  return manifest;
}

/**
 * Validate package manifest
 */
export async function validateManifest(manifest: ModelManifest): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  if (!manifest.packageId) {
    errors.push("Missing packageId");
  }

  if (!manifest.modelId) {
    errors.push("Missing modelId");
  }

  if (!manifest.version) {
    errors.push("Missing version");
  }

  if (!manifest.provider) {
    errors.push("Missing provider");
  }

  if (!manifest.checksum) {
    errors.push("Missing checksum");
  }

  // Validate dependencies exist
  for (const dep of manifest.dependencies) {
    if (!dep.optional) {
      const depPackages = await getModelPackages(dep.modelId);
      const versionExists = depPackages.some(p => p.version === dep.version);
      if (!versionExists) {
        errors.push(`Dependency ${dep.modelId}@${dep.version} not found`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Package Signing ────────────────────────────────────────────

/**
 * Sign package
 */
export async function signPackage(
  packageId: string,
  privateKey: string,
): Promise<ModelPackage | null> {
  const pkg = await getModelPackage(packageId);
  if (!pkg) return null;

  if (!pkg.checksum) {
    throw new Error("Cannot sign package without checksum");
  }

  // In production, use proper cryptographic signing
  // For now, we'll use a simple hash-based signature
  const signature = createHash("sha256")
    .update(pkg.checksum + privateKey)
    .digest("hex");

  pkg.signature = signature;
  pkg.signed = true;
  pkg.updatedAt = new Date().toISOString();

  await redisCmd.set(PACKAGE_KEY(packageId), JSON.stringify(pkg));

  logger.info("Model package signed", {
    packageId,
    signature: signature.slice(0, 16) + "...",
  });

  return pkg;
}

/**
 * Verify package signature
 */
export async function verifyPackageSignature(
  packageId: string,
  publicKey: string,
): Promise<{ valid: boolean; error?: string }> {
  const pkg = await getModelPackage(packageId);
  if (!pkg) {
    return { valid: false, error: "Package not found" };
  }

  if (!pkg.signed || !pkg.signature) {
    return { valid: false, error: "Package is not signed" };
  }

  if (!pkg.checksum) {
    return { valid: false, error: "Package has no checksum" };
  }

  // In production, use proper cryptographic verification
  // For now, we'll verify the hash-based signature
  const expectedSignature = createHash("sha256")
    .update(pkg.checksum + publicKey)
    .digest("hex");

  const valid = pkg.signature === expectedSignature;

  return {
    valid,
    error: valid ? undefined : "Signature verification failed",
  };
}

// ─── Checksum Calculation ───────────────────────────────────────

/**
 * Calculate checksum for package file
 */
async function calculateChecksum(fileUrl: string): Promise<string> {
  // In production, download file and calculate checksum
  // For now, return a placeholder
  return createHash("sha256")
    .update(fileUrl)
    .digest("hex");
}

// ─── Package Statistics ─────────────────────────────────────────

/**
 * Get package statistics
 */
export async function getPackageStats(): Promise<PackageStats> {
  const metrics = Metrics.snapshot();

  const totalPackages = metrics.counters["model.package.created"]?.total || 0;
  const totalDownloads = metrics.counters["model.package.downloaded"]?.total || 0;

  const byProvider: Record<string, number> = {};
  const byCapability: Record<string, number> = {};

  // Extract provider stats
  if (metrics.counters["model.package.created"]?.tags) {
    for (const [tag, count] of Object.entries(metrics.counters["model.package.created"].tags)) {
      const match = tag.match(/provider=(\w+)/);
      if (match) {
        byProvider[match[1]] = count as number;
      }
    }
  }

  // Calculate capability stats from packages
  const packages = await getAllPackages(1000);
  for (const pkg of packages) {
    for (const capability of pkg.capabilities) {
      byCapability[capability] = (byCapability[capability] || 0) + 1;
    }
  }

  // Get top packages by downloads
  const topPackages = packages
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, 10)
    .map(pkg => ({
      packageId: pkg.id,
      modelName: pkg.modelName,
      downloads: pkg.downloads,
    }));

  // Calculate average rating
  const ratedPackages = packages.filter(pkg => pkg.rating !== undefined);
  const averageRating = ratedPackages.length > 0
    ? ratedPackages.reduce((sum, pkg) => sum + (pkg.rating || 0), 0) / ratedPackages.length
    : 0;

  return {
    totalPackages,
    totalDownloads,
    byProvider,
    byCapability,
    topPackages,
    averageRating,
  };
}

// ─── Dependency Resolution ──────────────────────────────────────

/**
 * Resolve package dependencies
 */
export async function resolveDependencies(
  packageId: string,
): Promise<{
  resolved: ModelPackage[];
  missing: ModelDependency[];
  circular: string[];
}> {
  const pkg = await getModelPackage(packageId);
  if (!pkg) {
    return { resolved: [], missing: [], circular: [] };
  }

  const resolved: ModelPackage[] = [];
  const missing: ModelDependency[] = [];
  const circular: string[] = [];
  const visited = new Set<string>();

  async function resolve(pkgId: string, path: string[]): Promise<void> {
    if (visited.has(pkgId)) {
      if (path.includes(pkgId)) {
        circular.push(pkgId);
      }
      return;
    }

    visited.add(pkgId);

    const currentPkg = await getModelPackage(pkgId);
    if (!currentPkg) {
      return;
    }

    resolved.push(currentPkg);

    for (const dep of currentPkg.dependencies) {
      const depPackages = await getModelPackages(dep.modelId);
      const depPkg = depPackages.find(p => p.version === dep.version);

      if (!depPkg) {
        if (!dep.optional) {
          missing.push(dep);
        }
        continue;
      }

      await resolve(depPkg.id, [...path, pkgId]);
    }
  }

  await resolve(packageId, []);

  return { resolved, missing, circular };
}
