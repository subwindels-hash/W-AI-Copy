/**
 * Module 32: 3D Asset Management Service
 *
 * Manages 3D models, textures, materials, animations, and other AR/VR assets.
 * Provides upload, format conversion, LOD generation, optimization, versioning,
 * asset library management, and AR/VR-optimized delivery.
 *
 * Phase 1 — Critical Gap: Enterprise 3D asset infrastructure
 */

import { randomUUID, createHash } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Asset3DFormat = "gltf" | "glb" | "fbx" | "obj" | "usdz" | "usd" | "stl" | "dae" | "3ds" | "blend";

export type Asset3DCategory =
  | "model" | "scene" | "texture" | "material" | "animation"
  | "audio" | "shader" | "prefab" | "environment" | "avatar" | "ui";

export type Asset3DStatus = "uploading" | "processing" | "ready" | "failed" | "optimizing" | "archived";

export type TextureFormat = "png" | "jpg" | "webp" | "ktx2" | "basis" | "exr" | "hdr";

export type OptimizationProfile = "web-ar" | "mobile-vr" | "desktop-vr" | "high-fidelity" | "custom";

export interface Asset3D {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  category: Asset3DCategory;
  format: Asset3DFormat;
  status: Asset3DStatus;
  fileSizeBytes: number;
  uploadUrl?: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  metadata: Asset3DMetadata;
  versions: Asset3DVersion[];
  currentVersion: string;
  lods: AssetLOD[];
  tags: string[];
  license: string;
  author: string;
  optimizedProfiles: Record<OptimizationProfile, AssetOptimizedVariant>;
  permissions: {
    read: string[];
    write: string[];
    share: string[];
  };
  usageStats: {
    downloadCount: number;
    viewCount: number;
    referenceCount: number;
    lastAccessedAt?: string;
  };
  processingErrors: Array<{
    step: string;
    message: string;
    timestamp: string;
  }>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Asset3DMetadata {
  // Geometry
  vertexCount?: number;
  triangleCount?: number;
  meshCount?: number;
  
  // Dimensions
  boundingBox?: {
    width: number;
    height: number;
    depth: number;
    center: { x: number; y: number; z: number };
  };
  
  // Materials & Textures
  materialCount?: number;
  textureCount?: number;
  textureResolutions?: string[];
  
  // Animation
  animationCount?: number;
  animationNames?: string[];
  totalDurationMs?: number;
  
  // Scene
  nodeCount?: number;
  lightCount?: number;
  cameraCount?: number;
  
  // AR/VR specific
  hasPhysics?: boolean;
  hasColliders?: boolean;
  hasLODs?: boolean;
  isARReady?: boolean;
  isVRReady?: boolean;
  polyCount?: "low" | "medium" | "high" | "ultra";
  
  // Tools & Software
  software?: string;
  softwareVersion?: string;
  exportSettings?: Record<string, unknown>;
  
  custom: Record<string, unknown>;
}

export interface Asset3DVersion {
  version: string;
  fileSizeBytes: number;
  downloadUrl: string;
  changeNotes: string;
  format: Asset3DFormat;
  checksum: string;
  createdAt: string;
  createdBy: string;
}

export interface AssetLOD {
  level: number;
  name: string;
  triangleCount: number;
  fileSizeBytes: number;
  downloadUrl: string;
  distanceThreshold: number; // meters
  quality: number; // 0-100
}

export interface AssetOptimizedVariant {
  profile: OptimizationProfile;
  format: Asset3DFormat;
  fileSizeBytes: number;
  downloadUrl: string;
  triangleCount: number;
  textureResolution: string;
  compressionType: string;
  qualityScore: number; // 0-100
  generatedAt: string;
}

export interface TextureAsset {
  id: string;
  organizationId: string;
  name: string;
  format: TextureFormat;
  resolution: { width: number; height: number };
  channels: "rgb" | "rgba" | "grayscale" | "normal" | "metallic" | "roughness";
  fileSizeBytes: number;
  downloadUrl: string;
  compressedUrl?: string;
  isPBR: boolean;
  tags: string[];
  createdBy: string;
  createdAt: string;
}

export interface MaterialAsset {
  id: string;
  organizationId: string;
  name: string;
  shaderType: "pbr-metallic" | "pbr-specular" | "unlit" | "custom";
  properties: Record<string, unknown>;
  textureMaps: {
    albedo?: string;
    normal?: string;
    metallic?: string;
    roughness?: string;
    ao?: string;
    emissive?: string;
    height?: string;
  };
  tags: string[];
  createdBy: string;
  createdAt: string;
}

export interface AssetCollection {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  assetIds: string[];
  tags: string[];
  isPublic: boolean;
  coverAssetId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const assets3D = new Map<string, Asset3D>();
const textures = new Map<string, TextureAsset>();
const materials = new Map<string, MaterialAsset>();
const collections = new Map<string, AssetCollection>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Upload a 3D asset
 */
export async function uploadAsset3D(params: {
  organizationId: string;
  name: string;
  description?: string;
  category: Asset3DCategory;
  format: Asset3DFormat;
  fileSizeBytes: number;
  uploadUrl?: string;
  metadata?: Partial<Asset3DMetadata>;
  tags?: string[];
  license?: string;
  author?: string;
  createdBy: string;
}): Promise<Asset3D> {
  const now = new Date().toISOString();
  const checksum = createHash("sha256")
    .update(`${params.name}-${params.fileSizeBytes}-${now}`)
    .digest("hex");

  const asset: Asset3D = {
    id: `asset3d_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    category: params.category,
    format: params.format,
    status: "processing",
    fileSizeBytes: params.fileSizeBytes,
    uploadUrl: params.uploadUrl ?? `https://assets.example.com/uploads/${randomUUID()}.${params.format}`,
    downloadUrl: params.uploadUrl ?? `https://assets.example.com/uploads/${randomUUID()}.${params.format}`,
    thumbnailUrl: `https://assets.example.com/thumbnails/${randomUUID()}.jpg`,
    previewUrl: `https://assets.example.com/previews/${randomUUID()}.glb`,
    metadata: {
      vertexCount: params.metadata?.vertexCount,
      triangleCount: params.metadata?.triangleCount ?? estimateTriangleCount(params.fileSizeBytes, params.format),
      meshCount: params.metadata?.meshCount,
      boundingBox: params.metadata?.boundingBox ?? generateDefaultBoundingBox(),
      materialCount: params.metadata?.materialCount ?? 1,
      textureCount: params.metadata?.textureCount ?? 0,
      textureResolutions: params.metadata?.textureResolutions ?? [],
      animationCount: params.metadata?.animationCount ?? 0,
      animationNames: params.metadata?.animationNames ?? [],
      nodeCount: params.metadata?.nodeCount,
      hasPhysics: params.metadata?.hasPhysics ?? false,
      hasColliders: params.metadata?.hasColliders ?? false,
      hasLODs: params.metadata?.hasLODs ?? false,
      isARReady: params.metadata?.isARReady ?? false,
      isVRReady: params.metadata?.isVRReady ?? false,
      polyCount: params.metadata?.polyCount ?? estimatePolyCount(params.metadata?.triangleCount ?? 0),
      software: params.metadata?.software,
      softwareVersion: params.metadata?.softwareVersion,
      custom: params.metadata?.custom ?? {},
    },
    versions: [{
      version: "1.0.0",
      fileSizeBytes: params.fileSizeBytes,
      downloadUrl: params.uploadUrl ?? `https://assets.example.com/uploads/${randomUUID()}.${params.format}`,
      changeNotes: "Initial upload",
      format: params.format,
      checksum,
      createdAt: now,
      createdBy: params.createdBy,
    }],
    currentVersion: "1.0.0",
    lods: [],
    tags: params.tags ?? [],
    license: params.license ?? "proprietary",
    author: params.author ?? params.createdBy,
    optimizedProfiles: {} as Record<OptimizationProfile, AssetOptimizedVariant>,
    permissions: {
      read: [params.organizationId],
      write: [params.createdBy],
      share: [params.createdBy],
    },
    usageStats: {
      downloadCount: 0,
      viewCount: 0,
      referenceCount: 0,
    },
    processingErrors: [],
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  assets3D.set(asset.id, asset);

  // Simulate processing pipeline
  await processAsset(asset.id);

  return asset;
}

/**
 * Get a 3D asset by ID
 */
export async function getAsset3D(assetId: string): Promise<Asset3D | null> {
  return assets3D.get(assetId) ?? null;
}

/**
 * List 3D assets for an organization
 */
export async function listAssets3D(
  organizationId: string,
  filters?: {
    category?: Asset3DCategory;
    format?: Asset3DFormat;
    status?: Asset3DStatus;
    tag?: string;
    polyCount?: "low" | "medium" | "high" | "ultra";
    isARReady?: boolean;
    isVRReady?: boolean;
    search?: string;
  },
  sort?: { field: "name" | "createdAt" | "fileSizeBytes" | "downloadCount"; order: "asc" | "desc" },
  limit: number = 50,
  offset: number = 0
): Promise<{ assets: Asset3D[]; total: number }> {
  let result = Array.from(assets3D.values()).filter(
    a => a.organizationId === organizationId
  );

  if (filters?.category) result = result.filter(a => a.category === filters.category);
  if (filters?.format) result = result.filter(a => a.format === filters.format);
  if (filters?.status) result = result.filter(a => a.status === filters.status);
  if (filters?.tag) result = result.filter(a => a.tags.includes(filters.tag!));
  if (filters?.polyCount) result = result.filter(a => a.metadata.polyCount === filters.polyCount);
  if (filters?.isARReady !== undefined) result = result.filter(a => a.metadata.isARReady === filters.isARReady);
  if (filters?.isVRReady !== undefined) result = result.filter(a => a.metadata.isVRReady === filters.isVRReady);
  if (filters?.search) {
    const search = filters.search.toLowerCase();
    result = result.filter(a =>
      a.name.toLowerCase().includes(search) ||
      a.description.toLowerCase().includes(search) ||
      a.tags.some(t => t.toLowerCase().includes(search))
    );
  }

  // Sort
  const sortField = sort?.field ?? "createdAt";
  const sortOrder = sort?.order ?? "desc";
  result.sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case "name": comparison = a.name.localeCompare(b.name); break;
      case "createdAt": comparison = a.createdAt.localeCompare(b.createdAt); break;
      case "fileSizeBytes": comparison = a.fileSizeBytes - b.fileSizeBytes; break;
      case "downloadCount": comparison = a.usageStats.downloadCount - b.usageStats.downloadCount; break;
    }
    return sortOrder === "desc" ? -comparison : comparison;
  });

  const total = result.length;
  result = result.slice(offset, offset + limit);

  return { assets: result, total };
}

/**
 * Update asset metadata
 */
export async function updateAsset3D(
  assetId: string,
  updates: Partial<Pick<Asset3D, "name" | "description" | "tags" | "license" | "metadata" | "permissions">>
): Promise<Asset3D | null> {
  const asset = assets3D.get(assetId);
  if (!asset) return null;

  const updated: Asset3D = {
    ...asset,
    ...updates,
    metadata: updates.metadata ? { ...asset.metadata, ...updates.metadata } : asset.metadata,
    permissions: updates.permissions ? { ...asset.permissions, ...updates.permissions } : asset.permissions,
    updatedAt: new Date().toISOString(),
  };

  assets3D.set(assetId, updated);
  return updated;
}

/**
 * Upload a new version of an asset
 */
export async function uploadAsset3DVersion(
  assetId: string,
  params: {
    fileSizeBytes: number;
    uploadUrl?: string;
    changeNotes: string;
    metadata?: Partial<Asset3DMetadata>;
    createdBy: string;
  }
): Promise<Asset3D | null> {
  const asset = assets3D.get(assetId);
  if (!asset) return null;

  const now = new Date().toISOString();
  const checksum = createHash("sha256")
    .update(`${assetId}-${params.fileSizeBytes}-${now}`)
    .digest("hex");

  // Increment version
  const versionParts = asset.currentVersion.split(".").map(Number);
  versionParts[1]++;
  const newVersion = versionParts.join(".");

  const version: Asset3DVersion = {
    version: newVersion,
    fileSizeBytes: params.fileSizeBytes,
    downloadUrl: params.uploadUrl ?? `https://assets.example.com/uploads/${randomUUID()}.${asset.format}`,
    changeNotes: params.changeNotes,
    format: asset.format,
    checksum,
    createdAt: now,
    createdBy: params.createdBy,
  };

  asset.versions.push(version);
  asset.currentVersion = newVersion;
  asset.fileSizeBytes = params.fileSizeBytes;
  if (params.uploadUrl) {
    asset.downloadUrl = params.uploadUrl;
    asset.uploadUrl = params.uploadUrl;
  }
  if (params.metadata) {
    asset.metadata = { ...asset.metadata, ...params.metadata };
  }
  asset.status = "processing";
  asset.updatedAt = now;

  assets3D.set(assetId, asset);

  // Reprocess
  await processAsset(assetId);

  return asset;
}

/**
 * Generate LODs for an asset
 */
export async function generateLODs(
  assetId: string,
  levels: Array<{ level: number; targetTriangles: number; distanceThreshold: number }>
): Promise<Asset3D | null> {
  const asset = assets3D.get(assetId);
  if (!asset) return null;

  const now = new Date().toISOString();
  const lods: AssetLOD[] = [];

  for (const config of levels) {
    const qualityReduction = config.targetTriangles / (asset.metadata.triangleCount ?? 10000);
    const fileSize = Math.round(asset.fileSizeBytes * qualityReduction);

    lods.push({
      level: config.level,
      name: `LOD${config.level}`,
      triangleCount: config.targetTriangles,
      fileSizeBytes: fileSize,
      downloadUrl: `https://assets.example.com/lods/${assetId}_lod${config.level}.${asset.format}`,
      distanceThreshold: config.distanceThreshold,
      quality: Math.round(qualityReduction * 100),
    });
  }

  asset.lods = lods.sort((a, b) => a.level - b.level);
  asset.metadata.hasLODs = true;
  asset.updatedAt = now;
  assets3D.set(assetId, asset);

  return asset;
}

/**
 * Generate optimized variants for different platforms
 */
export async function generateOptimizedVariants(
  assetId: string,
  profiles: OptimizationProfile[]
): Promise<Asset3D | null> {
  const asset = assets3D.get(assetId);
  if (!asset) return null;

  const now = new Date().toISOString();

  const profileConfigs: Record<OptimizationProfile, {
    format: Asset3DFormat;
    triangleMultiplier: number;
    textureRes: string;
    compression: string;
  }> = {
    "web-ar": { format: "glb", triangleMultiplier: 0.3, textureRes: "1024x1024", compression: "draco" },
    "mobile-vr": { format: "glb", triangleMultiplier: 0.5, textureRes: "2048x2048", compression: "draco" },
    "desktop-vr": { format: "glb", triangleMultiplier: 0.8, textureRes: "4096x4096", compression: "meshopt" },
    "high-fidelity": { format: "gltf", triangleMultiplier: 1.0, textureRes: "8192x8192", compression: "none" },
    "custom": { format: "glb", triangleMultiplier: 0.5, textureRes: "2048x2048", compression: "draco" },
  };

  for (const profile of profiles) {
    const config = profileConfigs[profile];
    const triangleCount = Math.round((asset.metadata.triangleCount ?? 10000) * config.triangleMultiplier);
    const fileSize = Math.round(asset.fileSizeBytes * config.triangleMultiplier);

    asset.optimizedProfiles[profile] = {
      profile,
      format: config.format,
      fileSizeBytes: fileSize,
      downloadUrl: `https://assets.example.com/optimized/${assetId}_${profile}.${config.format}`,
      triangleCount,
      textureResolution: config.textureRes,
      compressionType: config.compression,
      qualityScore: Math.round(config.triangleMultiplier * 100),
      generatedAt: now,
    };
  }

  asset.status = "ready";
  asset.updatedAt = now;
  assets3D.set(assetId, asset);

  return asset;
}

/**
 * Record asset usage (download, view, reference)
 */
export async function recordAssetUsage(
  assetId: string,
  type: "download" | "view" | "reference"
): Promise<void> {
  const asset = assets3D.get(assetId);
  if (!asset) return;

  const now = new Date().toISOString();
  switch (type) {
    case "download": asset.usageStats.downloadCount++; break;
    case "view": asset.usageStats.viewCount++; break;
    case "reference": asset.usageStats.referenceCount++; break;
  }
  asset.usageStats.lastAccessedAt = now;
  asset.updatedAt = now;
  assets3D.set(assetId, asset);
}

/**
 * Create an asset collection
 */
export async function createAssetCollection(params: {
  organizationId: string;
  name: string;
  description?: string;
  assetIds?: string[];
  tags?: string[];
  isPublic?: boolean;
  coverAssetId?: string;
  createdBy: string;
}): Promise<AssetCollection> {
  const now = new Date().toISOString();
  const collection: AssetCollection = {
    id: `col_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    assetIds: params.assetIds ?? [],
    tags: params.tags ?? [],
    isPublic: params.isPublic ?? false,
    coverAssetId: params.coverAssetId,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  collections.set(collection.id, collection);
  return collection;
}

/**
 * Get asset collection
 */
export async function getAssetCollection(collectionId: string): Promise<AssetCollection | null> {
  return collections.get(collectionId) ?? null;
}

/**
 * List asset collections
 */
export async function listAssetCollections(organizationId: string): Promise<AssetCollection[]> {
  return Array.from(collections.values())
    .filter(c => c.organizationId === organizationId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Archive an asset
 */
export async function archiveAsset3D(assetId: string): Promise<Asset3D | null> {
  const asset = assets3D.get(assetId);
  if (!asset) return null;

  asset.status = "archived";
  asset.updatedAt = new Date().toISOString();
  assets3D.set(assetId, asset);
  return asset;
}

/**
 * Get 3D asset statistics for an organization
 */
export async function getAsset3DStats(organizationId: string): Promise<{
  totalAssets: number;
  assetsByCategory: Record<string, number>;
  assetsByFormat: Record<string, number>;
  assetsByStatus: Record<string, number>;
  assetsByPolyCount: Record<string, number>;
  totalFileSizeBytes: number;
  totalVersions: number;
  totalDownloads: number;
  totalViews: number;
  arReadyCount: number;
  vrReadyCount: number;
  withLODs: number;
  optimizedProfileCount: Record<string, number>;
  totalCollections: number;
  topAssets: Array<{ id: string; name: string; downloadCount: number }>;
}> {
  const allAssets = Array.from(assets3D.values()).filter(
    a => a.organizationId === organizationId
  );
  const allCollections = Array.from(collections.values()).filter(
    c => c.organizationId === organizationId
  );

  const assetsByCategory: Record<string, number> = {};
  const assetsByFormat: Record<string, number> = {};
  const assetsByStatus: Record<string, number> = {};
  const assetsByPolyCount: Record<string, number> = {};
  const optimizedProfileCount: Record<string, number> = {};
  let totalFileSize = 0;
  let totalVersions = 0;
  let totalDownloads = 0;
  let totalViews = 0;
  let arReadyCount = 0;
  let vrReadyCount = 0;
  let withLODs = 0;

  for (const asset of allAssets) {
    assetsByCategory[asset.category] = (assetsByCategory[asset.category] || 0) + 1;
    assetsByFormat[asset.format] = (assetsByFormat[asset.format] || 0) + 1;
    assetsByStatus[asset.status] = (assetsByStatus[asset.status] || 0) + 1;
    if (asset.metadata.polyCount) {
      assetsByPolyCount[asset.metadata.polyCount] = (assetsByPolyCount[asset.metadata.polyCount] || 0) + 1;
    }
    totalFileSize += asset.fileSizeBytes;
    totalVersions += asset.versions.length;
    totalDownloads += asset.usageStats.downloadCount;
    totalViews += asset.usageStats.viewCount;
    if (asset.metadata.isARReady) arReadyCount++;
    if (asset.metadata.isVRReady) vrReadyCount++;
    if (asset.metadata.hasLODs) withLODs++;
    for (const profile of Object.keys(asset.optimizedProfiles)) {
      optimizedProfileCount[profile] = (optimizedProfileCount[profile] || 0) + 1;
    }
  }

  const topAssets = allAssets
    .sort((a, b) => b.usageStats.downloadCount - a.usageStats.downloadCount)
    .slice(0, 10)
    .map(a => ({ id: a.id, name: a.name, downloadCount: a.usageStats.downloadCount }));

  return {
    totalAssets: allAssets.length,
    assetsByCategory,
    assetsByFormat,
    assetsByStatus,
    assetsByPolyCount,
    totalFileSizeBytes: totalFileSize,
    totalVersions,
    totalDownloads,
    totalViews,
    arReadyCount,
    vrReadyCount,
    withLODs,
    optimizedProfileCount,
    totalCollections: allCollections.length,
    topAssets,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function processAsset(assetId: string): Promise<void> {
  const asset = assets3D.get(assetId);
  if (!asset) return;

  // Simulate processing pipeline
  const steps = [
    "validating-format",
    "parsing-geometry",
    "extracting-materials",
    "generating-thumbnail",
    "optimizing-mesh",
    "generating-preview",
  ];

  try {
    for (const step of steps) {
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    asset.status = "ready";
    asset.metadata.isARReady = (asset.metadata.triangleCount ?? 0) < 100000;
    asset.metadata.isVRReady = (asset.metadata.triangleCount ?? 0) < 500000;
    asset.updatedAt = new Date().toISOString();
    assets3D.set(assetId, asset);
  } catch (err) {
    asset.status = "failed";
    asset.processingErrors.push({
      step: "processing",
      message: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
    asset.updatedAt = new Date().toISOString();
    assets3D.set(assetId, asset);
  }
}

function estimateTriangleCount(fileSizeBytes: number, format: Asset3DFormat): number {
  const bytesPerTriangle: Record<string, number> = {
    gltf: 100, glb: 80, fbx: 120, obj: 60, usdz: 150, stl: 50, dae: 90, "3ds": 70, blend: 110,
  };
  return Math.round(fileSizeBytes / (bytesPerTriangle[format] || 100));
}

function estimatePolyCount(triangles: number): "low" | "medium" | "high" | "ultra" {
  if (triangles < 10000) return "low";
  if (triangles < 100000) return "medium";
  if (triangles < 1000000) return "high";
  return "ultra";
}

function generateDefaultBoundingBox(): Asset3DMetadata["boundingBox"] {
  return {
    width: 1,
    height: 1,
    depth: 1,
    center: { x: 0, y: 0.5, z: 0 },
  };
}
