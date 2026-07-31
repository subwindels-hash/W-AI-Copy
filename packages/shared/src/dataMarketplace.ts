/**
 * Session 61 — Enterprise Data & Knowledge Marketplace.
 * Shared primitives for datasets, knowledge packs, RAG collections, prompt
 * libraries, business templates, synthetic data, licensed data products.
 * This is the general-purpose Marketplace (completes S40.1); the Voice
 * Marketplace (S41.9) and S52 Licensing share its licensing primitives.
 */

export const MKT_ASSET_KINDS = [
  "dataset", "knowledge_pack", "industry_model", "rag_collection",
  "prompt_library", "business_template", "synthetic_data",
  "public_dataset", "internal_exchange", "licensed_data_product",
] as const;
export type MktAssetKind = typeof MKT_ASSET_KINDS[number];

export const MKT_LICENSE_MODELS = [
  "free", "subscription", "one_time", "royalty", "revenue_share", "enterprise",
] as const;
export type MktLicenseModel = typeof MKT_LICENSE_MODELS[number];

export const MKT_ASSET_STATUS = ["draft","review","published","deprecated","removed"] as const;
export type MktAssetStatus = typeof MKT_ASSET_STATUS[number];

export interface MarketplaceAsset {
  id: string;
  organizationId: string;
  name: string;
  kind: MktAssetKind;
  publisher: string;
  publisherUserId?: string;
  description: string;
  version: string;
  licenseModel: MktLicenseModel;
  priceUsd?: number;
  royaltyPct?: number;       // 0..1 for revenue_share
  subscriptionMonthlyUsd?: number;
  rating: number;            // 0..5
  installs: number;
  qualityScore: number;      // 0..1
  lineageStatus: "verified" | "self_attested" | "unverified";
  complianceTags: string[];  // gdpr, hipaa, soc2, etc
  tags: string[];
  sizeBytes?: number;
  rows?: number;
  signed: boolean;
  status: MktAssetStatus;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceInstall {
  id: string;
  assetId: string;
  organizationId: string;
  installedBy: string;
  installedAt: string;
  version: string;
  status: "installed" | "updating" | "failed" | "removed";
}

export interface MarketplaceReview {
  id: string;
  assetId: string;
  userId: string;
  rating: number; // 1..5
  comment?: string;
  at: string;
}

export interface DmDashboard {
  totalAssets: number;
  published: number;
  installsTotal: number;
  byKind: Record<MktAssetKind, number>;
  byLicense: Record<MktLicenseModel, number>;
  topAssets: MarketplaceAsset[];
  recentInstalls: MarketplaceInstall[];
  categories: Array<{ tag: string; count: number }>;
  revenue30dUsd: number;
  featuredPublishers: Array<{ name: string; assets: number; installs: number }>;
}
