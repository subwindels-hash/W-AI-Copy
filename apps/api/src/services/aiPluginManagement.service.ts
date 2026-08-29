/**
 * Module 103: AI Plugin Management Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides comprehensive plugin management for extending AI platform capabilities
 * including plugin registration, lifecycle management, marketplace, permissions,
 * dependencies, and versioning.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Plugin {
  id: string;
  organizationId: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: PluginAuthor;
  category: PluginCategory;
  status: PluginStatus;
  capabilities: PluginCapability[];
  permissions: PluginPermission[];
  dependencies: PluginDependency[];
  configuration: PluginConfiguration;
  metadata: PluginMetadata;
  installation: PluginInstallation;
  createdAt: string;
  updatedAt: string;
}

export interface PluginAuthor {
  name: string;
  email?: string;
  organization?: string;
  verified: boolean;
}

export type PluginCategory =
  | 'data_source'
  | 'model_provider'
  | 'monitoring'
  | 'security'
  | 'integration'
  | 'visualization'
  | 'automation'
  | 'analytics'
  | 'custom';

export type PluginStatus =
  | 'draft'
  | 'published'
  | 'installed'
  | 'active'
  | 'disabled'
  | 'deprecated'
  | 'uninstalled';

export interface PluginCapability {
  name: string;
  description: string;
  type: 'api_extension' | 'webhook' | 'scheduler' | 'middleware' | 'ui_component' | 'data_processor';
  endpoint?: string;
  config?: Record<string, any>;
}

export interface PluginPermission {
  resource: string;
  actions: ('read' | 'write' | 'delete' | 'execute')[];
  scope: 'organization' | 'project' | 'global';
  required: boolean;
}

export interface PluginDependency {
  pluginId?: string;
  pluginName?: string;
  versionRange: string;
  optional: boolean;
}

export interface PluginConfiguration {
  schema: Record<string, ConfigField>;
  values: Record<string, any>;
  encrypted: string[];
}

export interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'select' | 'secret' | 'json';
  label: string;
  description?: string;
  required: boolean;
  default?: any;
  options?: string[];
  validation?: Record<string, any>;
}

export interface PluginMetadata {
  icon?: string;
  documentation?: string;
  changelog?: string;
  license: string;
  repository?: string;
  homepage?: string;
  tags: string[];
  downloads: number;
  rating: number;
  ratingCount: number;
}

export interface PluginInstallation {
  installedAt?: string;
  installedBy?: string;
  enabled: boolean;
  lastActivatedAt?: string;
  error?: string;
  healthStatus: 'healthy' | 'degraded' | 'error' | 'unknown';
}

export interface PluginMarketplace {
  id: string;
  name: string;
  description: string;
  plugins: MarketplacePlugin[];
  categories: PluginCategory[];
  featured: string[];
  createdAt: string;
}

export interface MarketplacePlugin {
  pluginId: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: PluginAuthor;
  category: PluginCategory;
  downloads: number;
  rating: number;
  ratingCount: number;
  tags: string[];
  price: 'free' | 'paid';
  priceAmount?: number;
  installed: boolean;
}

export interface PluginReview {
  id: string;
  pluginId: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const plugins = new Map<string, Plugin>();
const pluginMarketplace = new Map<string, PluginMarketplace>();
const pluginReviews = new Map<string, PluginReview[]>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function registerPlugin(params: {
  organizationId: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: PluginAuthor;
  category: PluginCategory;
  capabilities: PluginCapability[];
  permissions: PluginPermission[];
  dependencies?: PluginDependency[];
  configuration?: PluginConfiguration;
  metadata?: Partial<PluginMetadata>;
}): Plugin {
  const now = new Date().toISOString();
  const id = randomUUID();

  const plugin: Plugin = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    displayName: params.displayName,
    description: params.description,
    version: params.version,
    author: params.author,
    category: params.category,
    status: 'draft',
    capabilities: params.capabilities,
    permissions: params.permissions,
    dependencies: params.dependencies || [],
    configuration: params.configuration || { schema: {}, values: {}, encrypted: [] },
    metadata: {
      license: 'MIT',
      tags: [],
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      ...params.metadata,
    },
    installation: {
      enabled: false,
      healthStatus: 'unknown',
    },
    createdAt: now,
    updatedAt: now,
  };

  plugins.set(id, plugin);
  pluginReviews.set(id, []);
  return plugin;
}

export function getPlugin(id: string): Plugin | undefined {
  return plugins.get(id);
}

export function listPlugins(
  organizationId: string,
  filters?: { status?: PluginStatus; category?: PluginCategory }
): Plugin[] {
  let result = Array.from(plugins.values()).filter(p => p.organizationId === organizationId);

  if (filters?.status) result = result.filter(p => p.status === filters.status);
  if (filters?.category) result = result.filter(p => p.category === filters.category);

  return result;
}

export function publishPlugin(pluginId: string): Plugin {
  const plugin = plugins.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  if (plugin.status !== 'draft') throw new Error(`Plugin ${pluginId} is not in draft status`);

  // Validate dependencies
  for (const dep of plugin.dependencies) {
    if (!dep.optional) {
      const depPlugin = Array.from(plugins.values()).find(
        p => (p.id === dep.pluginId || p.name === dep.pluginName) && p.status === 'active'
      );
      if (!depPlugin) {
        throw new Error(`Required dependency ${dep.pluginName || dep.pluginId} is not installed or active`);
      }
    }
  }

  plugin.status = 'published';
  plugin.updatedAt = new Date().toISOString();
  return plugin;
}

export function installPlugin(
  pluginId: string,
  installedBy: string,
  config?: Record<string, any>
): Plugin {
  const plugin = plugins.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  if (plugin.status !== 'published') throw new Error(`Plugin ${pluginId} is not published`);

  // Check permissions
  const requiredPermissions = plugin.permissions.filter(p => p.required);
  // In a real system, we would verify the user has these permissions

  const now = new Date().toISOString();
  plugin.status = 'installed';
  plugin.installation = {
    installedAt: now,
    installedBy,
    enabled: false,
    healthStatus: 'healthy',
  };

  if (config) {
    plugin.configuration.values = { ...plugin.configuration.values, ...config };
  }

  plugin.metadata.downloads += 1;
  plugin.updatedAt = now;
  return plugin;
}

export function activatePlugin(pluginId: string): Plugin {
  const plugin = plugins.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  if (plugin.status !== 'installed') throw new Error(`Plugin ${pluginId} is not installed`);

  const now = new Date().toISOString();
  plugin.status = 'active';
  plugin.installation.enabled = true;
  plugin.installation.lastActivatedAt = now;
  plugin.updatedAt = now;
  return plugin;
}

export function disablePlugin(pluginId: string): Plugin {
  const plugin = plugins.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  if (plugin.status !== 'active') throw new Error(`Plugin ${pluginId} is not active`);

  plugin.status = 'disabled';
  plugin.installation.enabled = false;
  plugin.updatedAt = new Date().toISOString();
  return plugin;
}

export function uninstallPlugin(pluginId: string): Plugin {
  const plugin = plugins.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

  // Check if other plugins depend on this one
  const dependents = Array.from(plugins.values()).filter(
    p => p.dependencies.some(d => d.pluginId === pluginId && !d.optional)
  );
  if (dependents.length > 0) {
    throw new Error(`Cannot uninstall: ${dependents.length} plugins depend on this plugin`);
  }

  plugin.status = 'uninstalled';
  plugin.installation = {
    enabled: false,
    healthStatus: 'unknown',
  };
  plugin.updatedAt = new Date().toISOString();
  return plugin;
}

export function updatePluginConfiguration(
  pluginId: string,
  config: Record<string, any>
): Plugin {
  const plugin = plugins.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

  // Validate configuration against schema
  for (const [key, value] of Object.entries(config)) {
    const field = plugin.configuration.schema[key];
    if (!field) continue;

    if (field.required && (value === undefined || value === null)) {
      throw new Error(`Required configuration field ${key} is missing`);
    }

    if (field.type === 'number' && typeof value !== 'number') {
      throw new Error(`Configuration field ${key} must be a number`);
    }

    if (field.type === 'boolean' && typeof value !== 'boolean') {
      throw new Error(`Configuration field ${key} must be a boolean`);
    }

    if (field.type === 'select' && field.options && !field.options.includes(value)) {
      throw new Error(`Configuration field ${key} must be one of: ${field.options.join(', ')}`);
    }
  }

  plugin.configuration.values = { ...plugin.configuration.values, ...config };
  plugin.updatedAt = new Date().toISOString();
  return plugin;
}

export function createPluginMarketplace(params: {
  name: string;
  description: string;
  pluginIds: string[];
}): PluginMarketplace {
  const now = new Date().toISOString();
  const id = randomUUID();

  const marketplacePlugins: MarketplacePlugin[] = params.pluginIds
    .map(pluginId => {
      const plugin = plugins.get(pluginId);
      if (!plugin || plugin.status !== 'published') return null;

      return {
        pluginId: plugin.id,
        name: plugin.name,
        displayName: plugin.displayName,
        description: plugin.description,
        version: plugin.version,
        author: plugin.author,
        category: plugin.category,
        downloads: plugin.metadata.downloads,
        rating: plugin.metadata.rating,
        ratingCount: plugin.metadata.ratingCount,
        tags: plugin.metadata.tags,
        price: 'free' as const,
        installed: plugin.status === 'installed' || plugin.status === 'active',
      };
    })
    .filter((p): p is MarketplacePlugin => p !== null);

  const marketplace: PluginMarketplace = {
    id,
    name: params.name,
    description: params.description,
    plugins: marketplacePlugins,
    categories: Array.from(new Set(marketplacePlugins.map(p => p.category))),
    featured: marketplacePlugins.slice(0, 5).map(p => p.pluginId),
    createdAt: now,
  };

  pluginMarketplace.set(id, marketplace);
  return marketplace;
}

export function getPluginMarketplace(id: string): PluginMarketplace | undefined {
  return pluginMarketplace.get(id);
}

export function searchMarketplace(
  marketplaceId: string,
  query: string,
  filters?: { category?: PluginCategory; minRating?: number }
): MarketplacePlugin[] {
  const marketplace = pluginMarketplace.get(marketplaceId);
  if (!marketplace) throw new Error(`Marketplace ${marketplaceId} not found`);

  let results = marketplace.plugins;

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      p =>
        p.displayName.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  if (filters?.category) {
    results = results.filter(p => p.category === filters.category);
  }

  if (filters?.minRating) {
    results = results.filter(p => p.rating >= filters.minRating!);
  }

  return results.sort((a, b) => b.downloads - a.downloads);
}

export function addPluginReview(
  pluginId: string,
  params: {
    userId: string;
    userName: string;
    rating: number;
    title: string;
    comment: string;
  }
): PluginReview {
  const plugin = plugins.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

  const now = new Date().toISOString();
  const review: PluginReview = {
    id: randomUUID(),
    pluginId,
    userId: params.userId,
    userName: params.userName,
    rating: params.rating,
    title: params.title,
    comment: params.comment,
    createdAt: now,
    updatedAt: now,
  };

  const reviews = pluginReviews.get(pluginId) || [];
  reviews.push(review);
  pluginReviews.set(pluginId, reviews);

  // Update plugin rating
  const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
  plugin.metadata.rating = totalRating / reviews.length;
  plugin.metadata.ratingCount = reviews.length;
  plugin.updatedAt = now;

  return review;
}

export function getPluginReviews(pluginId: string): PluginReview[] {
  return pluginReviews.get(pluginId) || [];
}

export function getPluginHealth(pluginId: string): {
  status: 'healthy' | 'degraded' | 'error' | 'unknown';
  lastCheck: string;
  issues: string[];
} {
  const plugin = plugins.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

  const issues: string[] = [];

  // Check dependencies
  for (const dep of plugin.dependencies) {
    if (!dep.optional) {
      const depPlugin = Array.from(plugins.values()).find(
        p => (p.id === dep.pluginId || p.name === dep.pluginName) && p.status === 'active'
      );
      if (!depPlugin) {
        issues.push(`Missing dependency: ${dep.pluginName || dep.pluginId}`);
      }
    }
  }

  // Check configuration
  for (const [key, field] of Object.entries(plugin.configuration.schema)) {
    if (field.required && !plugin.configuration.values[key]) {
      issues.push(`Missing required configuration: ${key}`);
    }
  }

  const status = issues.length === 0 ? 'healthy' : issues.length < 3 ? 'degraded' : 'error';

  return {
    status,
    lastCheck: new Date().toISOString(),
    issues,
  };
}
