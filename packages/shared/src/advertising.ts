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
  aiConfigured: boolean; // whether a real AI provider is configured (honest flag)
  createdAt: string;
  updatedAt: string;
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
  aiConfigured: boolean;
}
