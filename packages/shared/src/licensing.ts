// Session 52 — AI Licensing & Monetization Platform (V8.4 §7)
// Enterprise monetization of platform assets. Marketplace hook from S40.1
// + Voice Marketplace (S41.9) + S61 Data Marketplace build on these primitives.

import { z } from "zod";

export const LICENSABLE_ASSET_TYPES = [
  "ai_model",
  "ai_employee",
  "ai_agent",
  "ai_skill",
  "ai_workflow",
  "voice_pack",
  "prompt_library",
  "knowledge_pack",
  "industry_template",
  "connector",
  "plugin",
  "digital_human",
] as const;
export type LicensableAssetType = (typeof LICENSABLE_ASSET_TYPES)[number];

export const BILLING_MODELS = [
  "subscription",
  "usage",
  "revenue_share",
  "enterprise_license",
  "royalty",
] as const;
export type BillingModel = (typeof BILLING_MODELS)[number];

export interface LicensedAsset {
  id: string;
  organizationId: string;
  type: LicensableAssetType;
  externalAssetId: string;
  name: string;
  description: string;
  ownerId: string;
  billingModel: BillingModel;
  priceCents: number;
  currency: string;
  revenueSharePct?: number; // for revenue_share
  royaltyPct?: number; // for royalty
  termsUrl?: string;
  status: "draft" | "listed" | "unlisted" | "suspended";
  listings: number; // active subscriptions/grants
  revenueCents30d: number;
  createdAt: string;
  updatedAt: string;
}

export interface LicenseGrant {
  id: string;
  organizationId: string;
  assetId: string;
  licenseeOrgId: string;
  billingModel: BillingModel;
  startedAt: string;
  expiresAt?: string;
  status: "active" | "canceled" | "expired" | "trial";
  usageCount: number;
  spendCents: number;
}

export interface RoyaltyEntry {
  id: string;
  assetId: string;
  period: string; // YYYY-MM
  grossCents: number;
  platformFeeCents: number;
  revenueShareCents: number;
  ownerPayoutCents: number;
  paid: boolean;
  paidAt?: string;
}

export interface LicensingDashboard {
  totalAssets: number;
  listedAssets: number;
  activeLicenses: number;
  revenueCents30d: number;
  revenueCentsAllTime: number;
  payoutsPendingCents: number;
  topAssets: Array<{ id: string; name: string; type: LicensableAssetType; revenueCents30d: number }>;
  byBillingModel: Record<BillingModel, number>;
}

export const registerAssetSchema = z.object({
  type: z.enum(LICENSABLE_ASSET_TYPES),
  externalAssetId: z.string().min(1).max(128),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  billingModel: z.enum(BILLING_MODELS),
  priceCents: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("USD"),
  revenueSharePct: z.number().min(0).max(100).optional(),
  royaltyPct: z.number().min(0).max(100).optional(),
  termsUrl: z.string().url().optional(),
});

export const grantLicenseSchema = z.object({
  assetId: z.string(),
  licenseeOrgId: z.string(),
  expiresAt: z.string().optional(),
});

export const recordUsageSchema = z.object({
  grantId: z.string(),
  usageCents: z.number().int().min(0).default(1),
});
