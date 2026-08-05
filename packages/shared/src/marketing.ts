// WINDELS AI OS — AI Marketing Intelligence & Campaign Management (single source of truth).
//
// A Tier-1 module integrated into the existing architecture. It reuses:
//   - AI Workforce pattern for the 28 specialized marketing agents
//   - the AI registry (aiRegistry) for copywriting / creative generation
//   - Redis job/tenant pattern for org-scoped campaigns, personas, A/B tests
//   - the Media Generation Studio for ad creative generation (not duplicated here)
//
// Honest design: campaign metrics are ingested (or recorded as measured), never
// fabricated. AI copy/creative is flagged `aiSource: "demo"` when no real
// provider is configured. Everything is org-scoped (multi-tenant).

import { z } from "zod";

/* ── Marketing agents (28 specialized workforce) ────────────────── */

export type MarketingAgentKey =
  | "strategist" | "campaign-manager" | "copywriter" | "creative-designer" | "brand-strategist"
  | "seo" | "ppc" | "social-media" | "content-strategist" | "email" | "funnel-optimizer"
  | "customer-research" | "market-intel" | "performance-analyst" | "cro" | "growth"
  | "video-marketing" | "influencer" | "community-manager" | "analytics-expert"
  | "landing-page" | "automation" | "ad-compliance" | "audience-targeting" | "remarketing"
  | "budget-optimizer" | "reporting" | "executive-advisor";

export interface MarketingAgent {
  key: MarketingAgentKey;
  name: string;
  description: string;
  domain: string;
  routable: true;
  status: "online" | "paused";
  lastHeartbeat: string;
  runs24h: number;
  decisions24h: number;
}

/* ── Platforms ─────────────────────────────────────────────────── */

export const MARKETING_PLATFORMS = [
  "facebook", "instagram", "youtube", "google_ads", "linkedin", "tiktok", "x", "pinterest", "snapchat", "microsoft_ads",
] as const;
export type MarketingPlatform = (typeof MARKETING_PLATFORMS)[number];

/* ── Copywriting frameworks (10 proven) ────────────────────────── */

export const COPY_FRAMEWORKS = [
  "aida", "pas", "bab", "storybrand", "pas_agitate", "fab", "four_ps", "quest", "acca", "direct",
] as const;
export type CopyFramework = (typeof COPY_FRAMEWORKS)[number];

/* ── Campaigns ─────────────────────────────────────────────────── */

export const MARKETING_CAMPAIGN_STATUS = ["draft", "active", "paused", "completed", "archived"] as const;
export type MarketingCampaignStatus = (typeof MARKETING_CAMPAIGN_STATUS)[number];

export interface MarketingCampaignMetrics {
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  spendMicros: number;
  revenueMicros: number;
  engagement: number;
}

export interface MarketingCampaign {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  objective: string;
  platform: MarketingPlatform;
  status: MarketingCampaignStatus;
  budgetMicros: number;
  startAt?: string;
  endAt?: string;
  audienceIds: string[];
  metrics: MarketingCampaignMetrics;
  creatives: string[];
  createdAt: string;
  updatedAt: string;
}

/* ── Customer personas ─────────────────────────────────────────── */

export interface Persona {
  id: string;
  organizationId: string;
  name: string;
  demographics: Record<string, string>;
  interests: string[];
  behaviors: string[];
  painPoints: string[];
  motivations: string[];
  goals: string[];
  buyingTriggers: string[];
  objections: string[];
  aiSource: "real" | "demo";
  createdAt: string;
}

/* ── A/B test ─────────────────────────────────────────────────── */

export interface AbTestVariant {
  id: string;
  name: string;
  creativeRef?: string;
  copy: string;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface AbTest {
  id: string;
  organizationId: string;
  campaignId: string;
  name: string;
  variants: AbTestVariant[];
  status: "running" | "completed";
  winnerVariantId?: string;
  createdAt: string;
  updatedAt: string;
}

/* ── AI recommendation ─────────────────────────────────────────── */

export interface MarketingRecommendation {
  id: string;
  campaignId: string;
  title: string;
  rationale: string;
  kind: "budget" | "audience" | "creative" | "copy" | "schedule" | "bid" | "scale" | "other";
  priority: "high" | "medium" | "low";
  aiSource: "real" | "demo";
  createdAt: string;
}

/* ── Requests ─────────────────────────────────────────────────── */

export const CreateMarketingCampaignSchema = z.object({
  name: z.string().min(1).max(120),
  objective: z.string().min(1).max(200),
  platform: z.enum(MARKETING_PLATFORMS),
  budgetMicros: z.number().int().nonnegative().default(0),
  audienceIds: z.array(z.string()).default([]),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
});
export type CreateMarketingCampaignInput = z.input<typeof CreateMarketingCampaignSchema>;

export const GenerateCopySchema = z.object({
  framework: z.enum(COPY_FRAMEWORKS).default("aida"),
  product: z.string().min(1).max(200),
  audience: z.string().min(1).max(200),
  goal: z.string().min(1).max(200),
  tone: z.string().max(80).optional(),
});
export type GenerateCopyInput = z.input<typeof GenerateCopySchema>;

export const CreatePersonaSchema = z.object({
  name: z.string().min(1).max(120),
  product: z.string().min(1).max(200),
  audience: z.string().min(1).max(200),
});
export type CreatePersonaInput = z.input<typeof CreatePersonaSchema>;

export const CreateAbTestSchema = z.object({
  campaignId: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  variants: z.array(z.object({
    name: z.string().min(1).max(80),
    copy: z.string().min(1).max(2000),
  })).min(2).max(6),
});
export type CreateAbTestInput = z.input<typeof CreateAbTestSchema>;

export const IngestCampaignMetricsSchema = z.object({
  impressions: z.number().int().nonnegative().default(0),
  reach: z.number().int().nonnegative().default(0),
  clicks: z.number().int().nonnegative().default(0),
  conversions: z.number().int().nonnegative().default(0),
  spendMicros: z.number().int().nonnegative().default(0),
  revenueMicros: z.number().int().nonnegative().default(0),
  engagement: z.number().int().nonnegative().default(0),
});
export type IngestCampaignMetricsInput = z.input<typeof IngestCampaignMetricsSchema>;

/* ── Dashboard ─────────────────────────────────────────────────── */

export interface MarketingDashboard {
  totalCampaigns: number;
  activeCampaigns: number;
  totalSpendMicros: number;
  totalRevenueMicros: number;
  totalConversions: number;
  totalImpressions: number;
  totalClicks: number;
  totalCtr: number; // percent
  roas: number | null;
  cpaMicros: number | null;
  byPlatform: Record<string, { count: number; spendMicros: number; conversions: number; revenueMicros: number }>;
  recentCampaigns: MarketingCampaign[];
  topRecommendations: MarketingRecommendation[];
  agents: { total: number; online: number };
}

/* ── Id params ─────────────────────────────────────────────────── */

export const MarketingCampaignIdSchema = z.object({ id: z.string().min(1).max(64) });
export const MarketingAgentKeySchema = z.object({ key: z.string().min(1).max(40) });
