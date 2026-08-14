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

/**
 * S164 — the platform's cut of every metered transaction.
 *
 * This was a bare `usageCents * 0.2` inside `recordUsage`: a fifth of every
 * payment, declared nowhere, visible in no type and echoed in no response.
 * A fee that cannot be read cannot be audited, so it lives here and is
 * recorded on every `RoyaltyEntry` as `platformFeePct`.
 */
export const PLATFORM_FEE_PCT = 20;

/** S164 — how a licensed asset came to exist. */
export const LICENSED_ASSET_SOURCES = ["operator_registered", "demo_seed"] as const;
export type LicensedAssetSource = (typeof LICENSED_ASSET_SOURCES)[number];

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
  /**
   * S164 — revenue inside a real rolling 30-day window, summed from the
   * royalty ledger. This used to be a counter incremented on every usage event
   * and never decayed, so it was a lifetime total labelled "30d" (and always
   * exactly equal to the all-time figure, which was the tell).
   */
  revenueCents30d: number;
  /** S164 — lifetime revenue, reported separately instead of disguised as 30d. */
  revenueCentsAllTime: number;
  /** S164 — demo-seeded assets are labelled; nobody registered them. */
  source: LicensedAssetSource;
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
  /** S164 — the grant this entry was metered against. */
  grantId: string;
  assetId: string;
  period: string; // YYYY-MM
  grossCents: number;
  platformFeeCents: number;
  revenueShareCents: number;
  ownerPayoutCents: number;
  /**
   * S164 — the rates actually applied, so a payout can be audited without
   * reading the source. `revenueSharePct` used to default to an invented 10%
   * for assets that declared none; it is now 0 unless the asset sets it.
   */
  platformFeePct: number;
  revenueSharePct: number;
  paid: boolean;
  paidAt?: string;
  /** S164 — when the usage occurred, so the 30-day window is computable. */
  at: string;
}

export interface LicensingDashboard {
  totalAssets: number;
  listedAssets: number;
  /** S164 — excludes grants that are canceled or past `expiresAt`. */
  activeLicenses: number;
  /** S164 — a real rolling window over the royalty ledger, not a counter. */
  revenueCents30d: number;
  revenueCentsAllTime: number;
  /**
   * S164 — derived from unpaid royalty entries. This was a counter that only
   * ever grew: nothing could settle a payout, so the figure was a liability
   * that could never be discharged.
   */
  payoutsPendingCents: number;
  /** S164 — payouts already settled, so the pending figure has a counterpart. */
  payoutsPaidCents: number;
  topAssets: Array<{ id: string; name: string; type: LicensableAssetType; revenueCents30d: number }>;
  byBillingModel: Record<BillingModel, number>;
  /**
   * S164 — no payment processor is wired. Settling marks the ledger and moves
   * no money; surfaced so a dollar figure is never mistaken for a transfer.
   */
  payoutsSettleable: boolean;
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
