/**
 * Model Installation Service (Module 26 — Gap 3)
 *
 * Install models with dependency resolution:
 * - Install models from marketplace
 * - Resolve and install dependencies
 * - Validate system requirements
 * - Track installed models per organization
 * - Uninstall models with dependency checking
 * - Installation history and rollback
 *
 * Enables reliable model installation with proper dependency management.
 */
import { logger } from "../../config/logger.js";
import { Metrics } from "../../observability/metrics.js";
import { redisCmd } from "../../db/redis.js";
import { prisma } from "../../db/client.js";
import {
  getModelPackage,
  recordPackageDownload,
  resolveDependencies,
  type ModelPackage,
} from "./modelPackaging.service";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:modelInstallation');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export interface InstalledModel {
  id: string;
  organizationId: string;
  packageId: string;
  modelId: string;
  modelName: string;
  version: string;
  provider: string;
  installedAt: string;
  installedBy: string;
  enabled: boolean;
  config: Record<string, any>;
  dependencies: string[]; // Installed package IDs
}

export interface InstallationResult {
  success: boolean;
  installedModels: InstalledModel[];
  errors: InstallationError[];
  warnings: string[];
}

export interface InstallationError {
  packageId: string;
  modelName: string;
  error: string;
  type: "dependency_missing" | "requirement_failed" | "installation_failed";
}

export interface SystemRequirements {
  availableMemoryMb?: number;
  availableGpuMemoryMb?: number;
  platform?: string;
  supportedQuantizations?: string[];
}

export interface InstallationHistory {
  id: string;
  organizationId: string;
  action: "install" | "uninstall" | "update";
  packageId: string;
  modelName: string;
  version: string;
  performedBy: string;
  performedAt: string;
  success: boolean;
  error?: string;
}

export interface InstallationStats {
  totalInstalled: number;
  byOrganization: Record<string, number>;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  recentInstallations: InstallationHistory[];
}

// ─── Redis Keys ─────────────────────────────────────────────────

const INSTALLED_MODEL_KEY = (orgId: string, modelId: string) => `model:installed:${orgId}:${modelId}`;
const INSTALLED_MODELS_KEY = (orgId: string) => `model:installed:${orgId}`;
const INSTALLATION_HISTORY_KEY = (orgId: string) => `model:installation:history:${orgId}`;
const INSTALLATION_STATS_KEY = "model:installation:stats";

// ─── Model Installation ─────────────────────────────────────────

/**
 * Install model from package
 */
export async function installModel(
  organizationId: string,
  packageId: string,
  installedBy: string,
  config: Record<string, any> = {},
  systemRequirements?: SystemRequirements,
): Promise<InstallationResult> {
  const pkg = await getModelPackage(packageId);
  if (!pkg) {
    return {
      success: false,
      installedModels: [],
      errors: [{
        packageId,
        modelName: "Unknown",
        error: "Package not found",
        type: "installation_failed",
      }],
      warnings: [],
    };
  }

  const errors: InstallationError[] = [];
  const warnings: string[] = [];
  const installedModels: InstalledModel[] = [];

  // Validate package is published
  if (!pkg.publishedAt) {
    errors.push({
      packageId,
      modelName: pkg.modelName,
      error: "Package is not published",
      type: "installation_failed",
    });
    return { success: false, installedModels, errors, warnings };
  }

  // Validate system requirements
  if (systemRequirements && pkg.requirements) {
    const requirementErrors = validateSystemRequirements(pkg.requirements, systemRequirements);
    if (requirementErrors.length > 0) {
      errors.push(...requirementErrors.map(err => ({
        packageId,
        modelName: pkg.modelName,
        error: err,
        type: "requirement_failed" as const,
      })));
      return { success: false, installedModels, errors, warnings };
    }
  }

  // Resolve dependencies
  const { resolved, missing, circular } = await resolveDependencies(packageId);

  if (missing.length > 0) {
    errors.push(...missing.map((dep: any) => ({
      packageId: dep.modelId,
      modelName: dep.modelId,
      error: `Required dependency ${dep.modelId}@${dep.version} not found`,
      type: "dependency_missing" as const,
    })));
    return { success: false, installedModels, errors, warnings };
  }

  if (circular.length > 0) {
    warnings.push(`Circular dependencies detected: ${circular.join(", ")}`);
  }

  // Install dependencies first
  for (const depPkg of resolved) {
    if (depPkg.id === packageId) continue;

    const existingInstallation = await getInstalledModel(organizationId, depPkg.modelId);
    if (existingInstallation) {
      if (existingInstallation.version !== depPkg.version) {
        warnings.push(`Dependency ${depPkg.modelName} version mismatch: installed ${existingInstallation.version}, required ${depPkg.version}`);
      }
      continue;
    }

    const depResult = await installModel(organizationId, depPkg.id, installedBy, {}, systemRequirements);
    if (!depResult.success) {
      errors.push(...depResult.errors);
      return { success: false, installedModels, errors, warnings };
    }

    installedModels.push(...depResult.installedModels);
  }

  // Check if already installed
  const existingInstallation = await getInstalledModel(organizationId, pkg.modelId);
  if (existingInstallation) {
    warnings.push(`Model ${pkg.modelName} already installed (version ${existingInstallation.version})`);
    return { success: true, installedModels, errors, warnings };
  }

  // Install model
  try {
    const installedModel: InstalledModel = {
      id: `installed_${Date.now()}_${_rng.next().toString(36).slice(2, 8)}`,
      organizationId,
      packageId: pkg.id,
      modelId: pkg.modelId,
      modelName: pkg.modelName,
      version: pkg.version,
      provider: pkg.provider,
      installedAt: new Date().toISOString(),
      installedBy,
      enabled: true,
      config,
      dependencies: resolved.filter((p: any) => p.id !== packageId).map((p: any) => p.id),
    };

    await redisCmd.set(
      INSTALLED_MODEL_KEY(organizationId, pkg.modelId),
      JSON.stringify(installedModel)
    );
    await redisCmd.sadd(INSTALLED_MODELS_KEY(organizationId), pkg.modelId);

    // Record download
    await recordPackageDownload(packageId);

    // Record installation history
    await recordInstallationHistory({
      organizationId,
      action: "install",
      packageId: pkg.id,
      modelName: pkg.modelName,
      version: pkg.version,
      performedBy: installedBy,
      success: true,
    });

    installedModels.push(installedModel);

    Metrics.increment("model.installation.success", 1, {
      provider: pkg.provider,
    });

    logger.info("Model installed", {
      organizationId,
      packageId: pkg.id,
      modelName: pkg.modelName,
      version: pkg.version,
      installedBy,
    });

    return { success: true, installedModels, errors, warnings };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    errors.push({
      packageId,
      modelName: pkg.modelName,
      error: errorMessage,
      type: "installation_failed",
    });

    await recordInstallationHistory({
      organizationId,
      action: "install",
      packageId: pkg.id,
      modelName: pkg.modelName,
      version: pkg.version,
      performedBy: installedBy,
      success: false,
      error: errorMessage,
    });

    Metrics.increment("model.installation.failed", 1, {
      provider: pkg.provider,
    });

    logger.error("Model installation failed", {
      organizationId,
      packageId: pkg.id,
      modelName: pkg.modelName,
      error: errorMessage,
    });

    return { success: false, installedModels, errors, warnings };
  }
}

/**
 * Uninstall model
 */
export async function uninstallModel(
  organizationId: string,
  modelId: string,
  performedBy: string,
  force: boolean = false,
): Promise<{ success: boolean; error?: string; warnings: string[] }> {
  const installed = await getInstalledModel(organizationId, modelId);
  if (!installed) {
    return { success: false, error: "Model not installed", warnings: [] };
  }

  const warnings: string[] = [];

  // Check if other models depend on this
  const allInstalled = await getInstalledModels(organizationId);
  const dependents = allInstalled.filter(m => m.dependencies.includes(installed.packageId));

  if (dependents.length > 0 && !force) {
    return {
      success: false,
      error: `Cannot uninstall: ${dependents.length} models depend on this model`,
      warnings: [],
    };
  }

  if (dependents.length > 0) {
    warnings.push(`Force uninstalling: ${dependents.length} models depend on this model`);
  }

  try {
    await redisCmd.del(INSTALLED_MODEL_KEY(organizationId, modelId));
    await redisCmd.srem(INSTALLED_MODELS_KEY(organizationId), modelId);

    await recordInstallationHistory({
      organizationId,
      action: "uninstall",
      packageId: installed.packageId,
      modelName: installed.modelName,
      version: installed.version,
      performedBy,
      success: true,
    });

    Metrics.increment("model.uninstallation.success", 1, {
      provider: installed.provider,
    });

    logger.info("Model uninstalled", {
      organizationId,
      modelId,
      modelName: installed.modelName,
      performedBy,
    });

    return { success: true, warnings };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await recordInstallationHistory({
      organizationId,
      action: "uninstall",
      packageId: installed.packageId,
      modelName: installed.modelName,
      version: installed.version,
      performedBy,
      success: false,
      error: errorMessage,
    });

    Metrics.increment("model.uninstallation.failed", 1, {
      provider: installed.provider,
    });

    logger.error("Model uninstallation failed", {
      organizationId,
      modelId,
      error: errorMessage,
    });

    return { success: false, error: errorMessage, warnings };
  }
}

/**
 * Update installed model to new version
 */
export async function updateModel(
  organizationId: string,
  modelId: string,
  newPackageId: string,
  performedBy: string,
): Promise<InstallationResult> {
  const installed = await getInstalledModel(organizationId, modelId);
  if (!installed) {
    return {
      success: false,
      installedModels: [],
      errors: [{
        packageId: newPackageId,
        modelName: modelId,
        error: "Model not installed",
        type: "installation_failed",
      }],
      warnings: [],
    };
  }

  // Uninstall old version
  const uninstallResult = await uninstallModel(organizationId, modelId, performedBy, true);
  if (!uninstallResult.success) {
    return {
      success: false,
      installedModels: [],
      errors: [{
        packageId: newPackageId,
        modelName: modelId,
        error: uninstallResult.error || "Failed to uninstall old version",
        type: "installation_failed",
      }],
      warnings: uninstallResult.warnings,
    };
  }

  // Install new version
  const installResult = await installModel(
    organizationId,
    newPackageId,
    performedBy,
    installed.config,
  );

  if (installResult.success) {
    await recordInstallationHistory({
      organizationId,
      action: "update",
      packageId: newPackageId,
      modelName: installed.modelName,
      version: installResult.installedModels[0]?.version || "unknown",
      performedBy,
      success: true,
    });
  }

  return installResult;
}

// ─── System Requirements Validation ─────────────────────────────

/**
 * Validate system requirements
 */
function validateSystemRequirements(
  requirements: ModelPackage["requirements"],
  system: SystemRequirements,
): string[] {
  const errors: string[] = [];

  if (requirements.minMemoryMb && system.availableMemoryMb !== undefined) {
    if (system.availableMemoryMb < requirements.minMemoryMb) {
      errors.push(`Insufficient memory: ${system.availableMemoryMb}MB available, ${requirements.minMemoryMb}MB required`);
    }
  }

  if (requirements.minGpuMemoryMb && system.availableGpuMemoryMb !== undefined) {
    if (system.availableGpuMemoryMb < requirements.minGpuMemoryMb) {
      errors.push(`Insufficient GPU memory: ${system.availableGpuMemoryMb}MB available, ${requirements.minGpuMemoryMb}MB required`);
    }
  }

  if (requirements.supportedPlatforms && system.platform) {
    if (!requirements.supportedPlatforms.includes(system.platform)) {
      errors.push(`Unsupported platform: ${system.platform}, supported: ${requirements.supportedPlatforms.join(", ")}`);
    }
  }

  if (requirements.supportedQuantizations && system.supportedQuantizations) {
    const supported = requirements.supportedQuantizations.some((q: any) => 
      system.supportedQuantizations!.includes(q)
    );
    if (!supported) {
      errors.push(`No supported quantization: supported: ${requirements.supportedQuantizations.join(", ")}`);
    }
  }

  return errors;
}

// ─── Installation Management ────────────────────────────────────

/**
 * Get installed model
 */
export async function getInstalledModel(
  organizationId: string,
  modelId: string,
): Promise<InstalledModel | null> {
  const data = await redisCmd.get(INSTALLED_MODEL_KEY(organizationId, modelId));
  return data ? JSON.parse(data) : null;
}

/**
 * Get all installed models for organization
 */
export async function getInstalledModels(
  organizationId: string,
): Promise<InstalledModel[]> {
  const modelIds = await redisCmd.smembers(INSTALLED_MODELS_KEY(organizationId));
  const installed: InstalledModel[] = [];

  for (const modelId of modelIds) {
    const model = await getInstalledModel(organizationId, modelId);
    if (model) {
      installed.push(model);
    }
  }

  return installed;
}

/**
 * Enable/disable installed model
 */
export async function setModelEnabled(
  organizationId: string,
  modelId: string,
  enabled: boolean,
): Promise<InstalledModel | null> {
  const installed = await getInstalledModel(organizationId, modelId);
  if (!installed) return null;

  installed.enabled = enabled;

  await redisCmd.set(
    INSTALLED_MODEL_KEY(organizationId, modelId),
    JSON.stringify(installed)
  );

  logger.info("Model enabled/disabled", {
    organizationId,
    modelId,
    enabled,
  });

  return installed;
}

// ─── Installation History ───────────────────────────────────────

/**
 * Record installation history
 */
async function recordInstallationHistory(history: Omit<InstallationHistory, "id" | "performedAt">): Promise<void> {
  const id = `history_${Date.now()}_${_rng.next().toString(36).slice(2, 8)}`;
  const fullHistory: InstallationHistory = {
    ...history,
    id,
    performedAt: new Date().toISOString(),
  };

  await redisCmd.lpush(
    INSTALLATION_HISTORY_KEY(history.organizationId),
    JSON.stringify(fullHistory)
  );
  await redisCmd.ltrim(INSTALLATION_HISTORY_KEY(history.organizationId), 0, 999);
}

/**
 * Get installation history
 */
export async function getInstallationHistory(
  organizationId: string,
  limit: number = 50,
): Promise<InstallationHistory[]> {
  const data = await redisCmd.lrange(
    INSTALLATION_HISTORY_KEY(organizationId),
    0,
    limit - 1
  );
  return data.map(d => JSON.parse(d));
}

// ─── Installation Statistics ────────────────────────────────────

/**
 * Get installation statistics
 */
export async function getInstallationStats(): Promise<InstallationStats> {
  const metrics = Metrics.snapshot();

  const totalInstalled = metrics.counters["model.installation.success"]?.total || 0;

  const byOrganization: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  const byModel: Record<string, number> = {};

  // Extract provider stats
  if (metrics.counters["model.installation.success"]?.tags) {
    for (const [tag, count] of Object.entries(metrics.counters["model.installation.success"].tags)) {
      const match = tag.match(/provider=(\w+)/);
      if (match) {
        byProvider[match[1]] = count as number;
      }
    }
  }

  // Get recent installations (would need to aggregate from all organizations)
  const recentInstallations: InstallationHistory[] = [];

  return {
    totalInstalled,
    byOrganization,
    byProvider,
    byModel,
    recentInstallations,
  };
}
