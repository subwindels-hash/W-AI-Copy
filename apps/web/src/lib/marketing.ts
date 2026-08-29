/** WINDELS AI OS — AI Marketing Intelligence & Campaign Management client. */
import { api } from "./api";

export type MarketingPlatform = "facebook" | "instagram" | "youtube" | "google_ads" | "linkedin" | "tiktok" | "x" | "pinterest" | "snapchat" | "microsoft_ads";
export type CopyFramework = "aida" | "pas" | "bab" | "storybrand" | "pas_agitate" | "fab" | "four_ps" | "quest" | "acca" | "direct";
export type MarketingCampaignStatus = "draft" | "active" | "paused" | "completed" | "archived";

export interface MarketingAgent {
  key: string;
  name: string;
  description: string;
  domain: string;
  routable: true;
  status: "online" | "paused";
  lastHeartbeat: string;
  runs24h: number;
  decisions24h: number;
}

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

export interface MarketingRecommendation {
  id: string;
  campaignId: string;
  title: string;
  rationale: string;
  kind: string;
  priority: "high" | "medium" | "low";
  aiSource: "real" | "demo";
  createdAt: string;
}

export interface MarketingDashboard {
  totalCampaigns: number;
  activeCampaigns: number;
  totalSpendMicros: number;
  totalRevenueMicros: number;
  totalConversions: number;
  totalImpressions: number;
  totalClicks: number;
  totalCtr: number;
  roas: number | null;
  cpaMicros: number | null;
  byPlatform: Record<string, { count: number; spendMicros: number; conversions: number; revenueMicros: number }>;
  recentCampaigns: MarketingCampaign[];
  topRecommendations: MarketingRecommendation[];
  agents: { total: number; online: number };
}

export const MARKETING_PLATFORMS: { value: MarketingPlatform; label: string }[] = [
  "facebook", "instagram", "youtube", "google_ads", "linkedin", "tiktok", "x", "pinterest", "snapchat", "microsoft_ads",
].map((p) => ({ value: p as MarketingPlatform, label: p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));

export const COPY_FRAMEWORKS: { value: CopyFramework; label: string }[] = [
  "aida", "pas", "bab", "storybrand", "pas_agitate", "fab", "four_ps", "quest", "acca", "direct",
].map((f) => ({ value: f as CopyFramework, label: f.toUpperCase().replace(/_/g, " ") }));

export const marketingApi = {
  dashboard: () => api<MarketingDashboard>("/marketing/dashboard"),
  agents: () => api<MarketingAgent[]>("/marketing/agents"),
  runAgent: (key: string, payload?: Record<string, any>) => api<{ agent: string; verdict: string; detail: string; data?: any }>(`/marketing/agents/${key}/run`, { method: "POST", json: payload ?? {} }),
  campaigns: () => api<MarketingCampaign[]>("/marketing/campaigns"),
  createCampaign: (input: { name: string; objective: string; platform: MarketingPlatform; budgetMicros?: number; audienceIds?: string[] }) =>
    api<MarketingCampaign>("/marketing/campaigns", { method: "POST", json: input }),
  updateStatus: (id: string, status: MarketingCampaignStatus) => api<MarketingCampaign>(`/marketing/campaigns/${id}/status`, { method: "PATCH", json: { status } }),
  ingestMetrics: (id: string, input: Partial<MarketingCampaignMetrics>) => api<MarketingCampaign>(`/marketing/campaigns/${id}/metrics`, { method: "POST", json: input }),
  removeCampaign: (id: string) => api<void>(`/marketing/campaigns/${id}`, { method: "DELETE" }),
  copy: (input: { product: string; audience: string; goal: string; framework?: CopyFramework; tone?: string }) =>
    api<{ copy: string; framework: CopyFramework; aiSource: "real" | "demo" }>("/marketing/copy", { method: "POST", json: input }),
  personas: () => api<Persona[]>("/marketing/personas"),
  createPersona: (input: { name: string; product: string; audience: string }) => api<Persona>("/marketing/personas", { method: "POST", json: input }),
  removePersona: (id: string) => api<void>(`/marketing/personas/${id}`, { method: "DELETE" }),
  abTests: () => api<AbTest[]>("/marketing/ab-tests"),
  createAbTest: (input: { campaignId: string; name: string; variants: { name: string; copy: string }[] }) => api<AbTest>("/marketing/ab-tests", { method: "POST", json: input }),
  recordAbVariant: (testId: string, variantId: string, input: { impressions?: number; clicks?: number; conversions?: number }) =>
    api<AbTest>(`/marketing/ab-tests/${testId}/variants/${variantId}/metrics`, { method: "POST", json: input }),
  declareWinner: (testId: string, variantId?: string) => api<AbTest>(`/marketing/ab-tests/${testId}/winner`, { method: "POST", json: variantId ? { variantId } : {} }),
  recommendations: () => api<MarketingRecommendation[]>("/marketing/recommendations"),
  generateRecommendations: () => api<MarketingRecommendation[]>("/marketing/recommendations", { method: "POST" }),
  platforms: () => api<{ id: string; label: string }[]>("/marketing/platforms"),
};
