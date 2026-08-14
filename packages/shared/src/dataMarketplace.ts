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
  /** Session 168 — `null` until the first review. The prior code initialised
   *  published assets to 0 and then averaged over the INSTALL count, so real
   *  five-star reviews left the rating pinned near zero. */
  rating: number | null;     // 0..5
  /** Session 168 — the correct denominator for `rating`. */
  reviewCount: number;
  installs: number;
  /** Session 168 — `null` unless attested. publish() hard-coded 0.75, an
   *  unearned score presented as a measurement. */
  qualityScore: number | null; // 0..1
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

// Session 168: an unused `MarketplaceReview { ..., at: string }` was declared
// here. It was never persisted, never imported and never implemented — the
// review route discarded its payload — and because a second, real
// MarketplaceReview is now declared below, TypeScript DECLARATION-MERGED the
// two into one interface requiring both `at` and `createdAt`. The dead
// declaration is removed rather than left to merge silently; the live shape is
// the one further down this file.

export interface DmDashboard {
  totalAssets: number;
  published: number;
  installsTotal: number;
  byKind: Record<MktAssetKind, number>;
  byLicense: Record<MktLicenseModel, number>;
  topAssets: MarketplaceAsset[];
  recentInstalls: MarketplaceInstall[];
  categories: Array<{ tag: string; count: number }>;
  /** Session 168 — genuinely a 30-day window. The prior code applied the
   *  window to subscriptions only and added every one_time price forever. */
  revenue30dUsd: number;
  featuredPublishers: Array<{ name: string; assets: number; installs: number }>;
  /** Session 168 — field-by-field basis for every number above. */
  provenance?: DmProvenance;
}

/* ═════════════════════════════════════════════════════════════════════════
 * Session 168 — reviews and provenance
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * A persisted review. Before Session 168 the `comment` accepted by
 * POST /assets/:id/review was validated by zod and then discarded, and the
 * rating was folded into a running average with the wrong denominator.
 */
export interface MarketplaceReview {
  id: string;
  assetId: string;
  organizationId: string;
  userId: string;
  rating: number;            // 1..5
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export const DM_PROVENANCE_BASES = ["measured", "not_measured", "demo_seed"] as const;
export type DmProvenanceBasis = (typeof DM_PROVENANCE_BASES)[number];

export interface DmProvenanceEntry {
  field: string;
  basis: DmProvenanceBasis;
  detail: string;
}

export interface DmProvenance {
  entries: DmProvenanceEntry[];
  note: string;
}

export const DM_PROVENANCE_NOTE =
  "Ratings are the arithmetic mean of persisted reviews and are null until a first " +
  "review exists. Quality scores are null: nothing in this platform assesses asset " +
  "quality. Revenue counts install records inside a real 30-day window only.";
