// WINDELS AI OS — AI Advertising Platform (unified, single module).
//
// This is the single source of truth for the advertising platform's request
// contracts and record shapes, exactly like `etl.ts` and `wmpcGiftCards.ts` in
// this package: the route validates against these schemas, the service derives
// its record types from them, and the web client imports the same types.
//
// The platform is ONE advertising system with multiple campaign modes, not four
// separate advertising systems. A campaign carries a `campaignMode`, a
// `billingMode` and an `automationLevel`; every other field is shared. Nothing
// here duplicates an existing module.

import { z } from "zod";

/* ── Enums (the four campaign modes + cross-cutting axes) ─────────── */

/** The four campaign modes a user can pick when creating a campaign. */
export const CAMPAIGN_MODES = ["standard", "smart", "performance", "autonomous"] as const;
export type CampaignMode = (typeof CAMPAIGN_MODES)[number];

/** Billing models offered by the platform (reused Billing & Wallet semantics). */
export const BILLING_MODES = ["standard", "usage", "subscription", "performance", "hybrid"] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

/** Human approval settings for autonomous operation. */
export const AUTOMATION_LEVELS = ["manual", "assistant", "autonomous"] as const;
export type AutomationLevel = (typeof AUTOMATION_LEVELS)[number];

export const CAMPAIGN_STATUSES = ["draft", "pending_approval", "active", "paused", "ended", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Performance-billing verification lifecycle. */
export const AD_VERIFICATION_STATUSES = ["none", "pending", "verified", "rejected"] as const;
export type AdVerificationStatus = (typeof AD_VERIFICATION_STATUSES)[number];

/**
 * Source of an AI-produced asset. `real` means it came from a configured
 * provider through the AI Kernel registry; `demo` means the provider was not
 * configured and the output is a clearly-labelled scaffold, never presented as
 * production creative.
 */
export const AI_SOURCES = ["real", "demo"] as const;
export type AiSource = (typeof AI_SOURCES)[number];

/* ── Sub-objects ─────────────────────────────────────────────────── */

export const AdCampaignMetricsSchema = z.object({
  impressions: z.number().int().nonnegative().default(0),
  clicks: z.number().int().nonnegative().default(0),
  conversions: z.number().int().nonnegative().default(0),
  spendMicros: z.number().int().nonnegative().default(0), // spend in USD micros (1e-6)
  revenueMicros: z.number().int().nonnegative().default(0),
});
export type AdCampaignMetrics = z.infer<typeof AdCampaignMetricsSchema>;

export const PerformanceBillingConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Conversion events the campaign pays for (verified sales / qualified leads / approved appointments / verified registrations / custom). */
  events: z.array(z.string()).default([]),
  payoutMicros: z.number().int().nonnegative().default(0), // payout per verified event (USD micros)
  /** Pay only for events that pass verification. */
  payOnlyVerified: z.boolean().default(true),
});
/** Explicit record shape (all fields required) — the schema default-fills them on parse. */
export interface PerformanceBillingConfig {
  enabled: boolean;
  events: string[];
  payoutMicros: number;
  payOnlyVerified: boolean;
}

export const VerificationStateSchema = z.object({
  status: z.enum(AD_VERIFICATION_STATUSES).default("none"),
  eligibilityCheckedAt: z.string().optional(),
  eligibilityReason: z.string().optional(),
  fraudChecks: z.array(z.string()).default([]),
  lastVerifiedAt: z.string().optional(),
});
export type VerificationState = z.infer<typeof VerificationStateSchema>;

/** One entry in the AI optimization history. */
export const OptimizationEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  kind: z.enum(["recommendation", "generation", "budget", "audience", "placement", "creative", "scale", "pause", "launch", "note"]),
  summary: z.string(),
  aiSource: z.enum(AI_SOURCES),
  detail: z.string().optional(),
});
export type OptimizationEntry = z.infer<typeof OptimizationEntrySchema>;

export const RecommendationSchema = z.object({
  id: z.string(),
  title: z.string(),
  rationale: z.string(),
  priority: z.enum(["high", "medium", "low"]),
  applied: z.boolean().default(false),
  aiSource: z.enum(AI_SOURCES).default("demo"),
  createdAt: z.string(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

/* ── Requests ────────────────────────────────────────────────────── */

export const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(120),
  objective: z.string().min(1).max(160),
  campaignMode: z.enum(CAMPAIGN_MODES),
  billingMode: z.enum(BILLING_MODES).default("standard"),
  automationLevel: z.enum(AUTOMATION_LEVELS).default("manual"),
  budgetMicros: z.number().int().nonnegative().default(0), // total budget, USD micros
  dailyBudgetMicros: z.number().int().nonnegative().optional(),
  currency: z.string().default("USD"),
  audience: z.record(z.any()).default({}),
  audienceIds: z.array(z.string()).default([]),
  placements: z.array(z.string()).default([]),
  creatives: z.array(z.string()).default([]),
  performanceBilling: PerformanceBillingConfigSchema.optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
});
/**
 * The caller-facing input type. `z.input` keeps `.default()`-backed fields
 * optional so a client can omit them; the schema fills them in on parse.
 */
export type CreateCampaignInput = z.input<typeof CreateCampaignSchema>;

export const UpdateCampaignSchema = CreateCampaignSchema.partial();
export type UpdateCampaignInput = z.input<typeof UpdateCampaignSchema>;

/** The validated output type — every defaulted field is present and required. */
export type CreateCampaignOutput = z.infer<typeof CreateCampaignSchema>;

export const CampaignIdSchema = z.object({ id: z.string().min(1).max(64) });

/** What to ask the AI to generate for smart/autonomous modes. */
export const AiGenerateSchema = z.object({
  contentType: z.enum(["copy", "headline", "image_prompt", "video_prompt", "audience", "budget", "placements", "full"]),
  brief: z.string().max(2000).optional(),
});

/** Record a real conversion event (used by performance billing verification). */
export const ConversionEventSchema = z.object({
  eventType: z.string().min(1).max(80), // e.g. "sale", "qualified_lead", "appointment", "registration"
  valueMicros: z.number().int().nonnegative().default(0),
  proof: z.string().optional(), // order id / lead id / booking ref
  metadata: z.record(z.any()).default({}),
});

export const AutonomousActionSchema = z.object({
  action: z.enum(["analyze", "optimize", "scale", "pause", "launch", "suggest", "generate"]),
  detail: z.string().optional(),
});

/** Ingest real delivery metrics (impressions/clicks/spend) as deltas. */
export const IngestMetricsSchema = z.object({
  impressions: z.number().int().nonnegative().default(0),
  clicks: z.number().int().nonnegative().default(0),
  conversions: z.number().int().nonnegative().default(0),
  spendMicros: z.number().int().nonnegative().default(0),
  revenueMicros: z.number().int().nonnegative().default(0),
  /** Optional source/note recorded in the audit log (e.g. "meta-ads-sync"). */
  source: z.string().max(80).optional(),
});
export type IngestMetricsInput = z.input<typeof IngestMetricsSchema>;

/** A creative variant for A/B testing against other variants. */
export const CreativeVariantSchema = z.object({
  id: z.string(),
  name: z.string(),
  headline: z.string().optional(),
  body: z.string().optional(),
  assetUrl: z.string().optional(),
  aiSource: z.enum(AI_SOURCES).default("demo"),
  createdAt: z.string(),
  metrics: AdCampaignMetricsSchema,
});
export type CreativeVariant = z.infer<typeof CreativeVariantSchema>;

/** Payload to add a new A/B creative variant to a campaign. */
export const AddVariantSchema = z.object({
  name: z.string().min(1).max(120),
  headline: z.string().max(200).optional(),
  body: z.string().max(2000).optional(),
  assetUrl: z.string().max(500).optional(),
});
export type AddVariantInput = z.input<typeof AddVariantSchema>;

/** Declare which variant won the A/B test (promote it to the primary creative). */
export const ChooseVariantSchema = z.object({
  variantId: z.string().min(1).max(64),
});

/* ── Audiences & targeting ────────────────────────────────────── */

/** Criteria that define an audience segment. All fields optional; empty = broad. */
export const AudienceCriteriaSchema = z.object({
  locations: z.array(z.string()).default([]),
  ageRange: z.enum(["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]).optional(),
  interests: z.array(z.string()).default([]),
  devices: z.array(z.enum(["mobile", "desktop", "tablet"])).default([]),
  languages: z.array(z.string()).default([]),
}).default({});
export type AudienceCriteria = z.infer<typeof AudienceCriteriaSchema>;

export const CreateAudienceSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  criteria: AudienceCriteriaSchema,
});
export type CreateAudienceInput = z.input<typeof CreateAudienceSchema>;

/** A saved, reusable audience segment. */
export interface AudienceRecord {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  description?: string;
  criteria: AudienceCriteria;
  /** Estimated reach — honest, derived (or 0 when unknown), never fabricated. */
  sizeEstimate: number;
  createdAt: string;
  updatedAt: string;
}

/* ── Performance history (time-series) ──────────────────────────── */

/** One daily performance snapshot for a campaign. */
export interface MetricsSnapshot {
  day: string; // YYYY-MM-DD
  at: string;  // ISO timestamp
  metrics: AdCampaignMetrics;
}

/** Clone an existing campaign into a new draft (same settings, zero metrics). */
export const DuplicateCampaignSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

/* ── Record ──────────────────────────────────────────────────────── */

export interface AdCampaignRecord extends CreateCampaignOutput {
  id: string;
  organizationId: string;
  createdById: string;
  status: CampaignStatus;
  metrics: AdCampaignMetrics;
  performanceBilling: PerformanceBillingConfig;
  verification: VerificationState;
  optimizationHistory: OptimizationEntry[];
  recommendations: Recommendation[];
  autonomousActions: { id: string; at: string; action: string; detail?: string }[];
  auditLog: { id: string; at: string; actorId: string; action: string; detail?: string }[];
  /** A/B creative variants (empty until a variant is added). */
  variants: CreativeVariant[];
  /** Saved audiences targeted by this campaign. */
  audiences: AudienceRecord[];
  /** Daily performance history (snapshots recorded over time). */
  history: MetricsSnapshot[];
  /** Whether a real AI provider is configured (honest flag). */
  aiConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Budget-pacing / health summary for one campaign. */
export interface AdBudgetPacing {
  totalBudgetMicros: number;
  spentMicros: number;
  remainingMicros: number;
  /** spend / budget as a 0..1 ratio (0 if budget is 0). */
  spentPct: number;
  dailyBudgetMicros?: number;
  /** Estimated daily burn (spend since updatedAt, if any). Honest approximation. */
  estDailyBurnMicros: number;
  /** days left if endAt set, else null (no hard end). */
  daysLeft: number | null;
  /** pacing verdict from real numbers. */
  pacing: "under" | "on_track" | "over" | "no_budget";
}

/** Aggregated org-level portfolio analytics across all campaigns. */
export interface AdPortfolioAnalytics {
  totalCampaigns: number;
  activeCampaigns: number;
  totalSpendMicros: number;
  totalRevenueMicros: number;
  totalConversions: number;
  totalImpressions: number;
  totalClicks: number;
  /** overall ROAS (revenue/spend) or null when spend is 0. */
  roas: number | null;
  /** total budget across campaigns (0 if none set). */
  totalBudgetMicros: number;
  byMode: Record<CampaignMode, {
    count: number;
    spendMicros: number;
    conversions: number;
    revenueMicros: number;
  }>;
  /** top campaigns by ROAS / spend, sorted by spend desc. */
  topCampaigns: Array<{
    id: string;
    name: string;
    mode: CampaignMode;
    status: CampaignStatus;
    spendMicros: number;
    conversions: number;
    revenueMicros: number;
    roas: number | null;
  }>;
}

/** Aggregated dashboard payload for one campaign (extended dashboard, not a second one). */
export interface AdCampaignDashboard {
  campaign: AdCampaignRecord;
  mode: CampaignMode;
  automationLevel: AutomationLevel;
  billingMode: BillingMode;
  performanceBillingStatus: AdVerificationStatus;
  automationHistory: OptimizationEntry[];
  autonomousActions: AdCampaignRecord["autonomousActions"];
  health: "healthy" | "watch" | "needs_attention" | "inactive";
  revenueAttribution: { spendMicros: number; revenueMicros: number; roas: number | null; perEvent: Record<string, number> };
  fraudProtection: { enabled: boolean; checksRun: number; blocked: number };
  recommendations: Recommendation[];
  pacing: AdBudgetPacing;
  variants: CreativeVariant[];
  audiences: AudienceRecord[];
  history: MetricsSnapshot[];
  aiConfigured: boolean;
}
