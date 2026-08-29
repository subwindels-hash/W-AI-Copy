/** WINDELS AI OS — AI Advertising Platform client (unified multi-mode). */
import { api } from "./api";

export type CampaignMode = "standard" | "smart" | "performance" | "autonomous";
export type BillingMode = "standard" | "usage" | "subscription" | "performance" | "hybrid";
export type AutomationLevel = "manual" | "assistant" | "autonomous";
export type CampaignStatus = "draft" | "pending_approval" | "active" | "paused" | "ended" | "archived";
export type AdVerificationStatus = "none" | "pending" | "verified" | "rejected";
export type AiSource = "real" | "demo";

export interface AdCampaignMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  spendMicros: number;
  revenueMicros: number;
}

export interface PerformanceBillingConfig {
  enabled: boolean;
  events: string[];
  payoutMicros: number;
  payOnlyVerified: boolean;
}

export interface VerificationState {
  status: AdVerificationStatus;
  eligibilityCheckedAt?: string;
  eligibilityReason?: string;
  fraudChecks: string[];
  lastVerifiedAt?: string;
}

export interface OptimizationEntry {
  id: string;
  at: string;
  kind: string;
  summary: string;
  aiSource: AiSource;
  detail?: string;
}

export interface Recommendation {
  id: string;
  title: string;
  rationale: string;
  priority: "high" | "medium" | "low";
  applied: boolean;
  aiSource: AiSource;
  createdAt: string;
}

export interface AdCampaignRecord {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  objective: string;
  campaignMode: CampaignMode;
  billingMode: BillingMode;
  automationLevel: AutomationLevel;
  status: CampaignStatus;
  budgetMicros: number;
  dailyBudgetMicros?: number;
  currency: string;
  audience: Record<string, any>;
  placements: string[];
  creatives: string[];
  performanceBilling: PerformanceBillingConfig;
  verification: VerificationState;
  metrics: AdCampaignMetrics;
  optimizationHistory: OptimizationEntry[];
  recommendations: Recommendation[];
  autonomousActions: { id: string; at: string; action: string; detail?: string }[];
  auditLog: { id: string; at: string; actorId: string; action: string; detail?: string }[];
  variants: CreativeVariant[];
  audienceIds: string[];
  audiences: AudienceRecord[];
  history: MetricsSnapshot[];
  aiConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AudienceCriteria {
  locations: string[];
  ageRange?: string;
  interests: string[];
  devices: string[];
  languages: string[];
}

export interface AudienceRecord {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  description?: string;
  criteria: AudienceCriteria;
  sizeEstimate: number;
  createdAt: string;
  updatedAt: string;
}

export interface MetricsSnapshot {
  day: string;
  at: string;
  metrics: AdCampaignMetrics;
}

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

export interface CreativeVariant {
  id: string;
  name: string;
  headline?: string;
  body?: string;
  assetUrl?: string;
  aiSource: AiSource;
  createdAt: string;
  metrics: AdCampaignMetrics;
}

export interface AdBudgetPacing {
  totalBudgetMicros: number;
  spentMicros: number;
  remainingMicros: number;
  spentPct: number;
  dailyBudgetMicros?: number;
  estDailyBurnMicros: number;
  daysLeft: number | null;
  pacing: "under" | "on_track" | "over" | "no_budget";
}

export interface AdPortfolioAnalytics {
  totalCampaigns: number;
  activeCampaigns: number;
  totalSpendMicros: number;
  totalRevenueMicros: number;
  totalConversions: number;
  totalImpressions: number;
  totalClicks: number;
  roas: number | null;
  totalBudgetMicros: number;
  byMode: Record<CampaignMode, { count: number; spendMicros: number; conversions: number; revenueMicros: number }>;
  topCampaigns: Array<{
    id: string; name: string; mode: CampaignMode; status: CampaignStatus;
    spendMicros: number; conversions: number; revenueMicros: number; roas: number | null;
  }>;
}

export const CAMPAIGN_MODES: { value: CampaignMode; label: string; blurb: string }[] = [
  { value: "standard", label: "Standard Campaign", blurb: "Manual creation, AI-assisted optimization, real-time analytics." },
  { value: "smart", label: "AI Smart Campaign", blurb: "The AI builds and optimizes the campaign automatically." },
  { value: "performance", label: "Performance Campaign", blurb: "Pay for verified sales, leads, appointments, registrations." },
  { value: "autonomous", label: "Fully Autonomous AI Campaign", blurb: "WINDELS operates as your AI marketing team." },
];

export const BILLING_MODES: { value: BillingMode; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "usage", label: "Usage" },
  { value: "subscription", label: "Subscription" },
  { value: "performance", label: "Performance" },
  { value: "hybrid", label: "Hybrid" },
];

export const advertisingApi = {
  list: () => api<AdCampaignRecord[]>("/advertising/campaigns"),
  get: (id: string) => api<AdCampaignRecord>(`/advertising/campaigns/${id}`),
  create: (input: Partial<AdCampaignRecord> & { name: string; objective: string; campaignMode: CampaignMode }) =>
    api<AdCampaignRecord>("/advertising/campaigns", { method: "POST", json: input }),
  update: (id: string, input: Record<string, unknown>) =>
    api<AdCampaignRecord>(`/advertising/campaigns/${id}`, { method: "PATCH", json: input }),
  launch: (id: string) => api<AdCampaignRecord>(`/advertising/campaigns/${id}/launch`, { method: "POST" }),
  pause: (id: string, reason?: string) => api<AdCampaignRecord>(`/advertising/campaigns/${id}/pause`, { method: "POST", json: { reason } }),
  submit: (id: string) => api<AdCampaignRecord>(`/advertising/campaigns/${id}/submit`, { method: "POST" }),
  approve: (id: string) => api<AdCampaignRecord>(`/advertising/campaigns/${id}/approve`, { method: "POST" }),
  reject: (id: string, reason: string) => api<AdCampaignRecord>(`/advertising/campaigns/${id}/reject`, { method: "POST", json: { reason } }),
  generate: (id: string, contentType: string, brief?: string) =>
    api<{ content: string; aiSource: AiSource; mode: CampaignMode }>(`/advertising/campaigns/${id}/generate`, { method: "POST", json: { contentType, brief } }),
  recommend: (id: string) => api<Recommendation[]>(`/advertising/campaigns/${id}/recommend`, { method: "POST" }),
  autonomousCycle: (id: string) => api<AdCampaignRecord>(`/advertising/campaigns/${id}/autonomous`, { method: "POST" }),
  reportConversion: (id: string, event: { eventType: string; valueMicros: number; proof?: string; metadata?: Record<string, any> }) =>
    api<{ recorded: boolean; verificationStatus: AdVerificationStatus; blocked: boolean }>(`/advertising/campaigns/${id}/conversions`, { method: "POST", json: event }),
  dashboard: (id: string) => api<AdCampaignDashboard>(`/advertising/campaigns/${id}/dashboard`),
  ingestMetrics: (id: string, input: { impressions?: number; clicks?: number; spendMicros?: number; revenueMicros?: number; source?: string }) =>
    api<AdCampaignRecord>(`/advertising/campaigns/${id}/metrics`, { method: "POST", json: input }),
  addVariant: (id: string, input: { name: string; headline?: string; body?: string; assetUrl?: string }) =>
    api<CreativeVariant[]>(`/advertising/campaigns/${id}/variants`, { method: "POST", json: input }),
  recordVariantMetrics: (id: string, variantId: string, input: { impressions?: number; clicks?: number; conversions?: number; spendMicros?: number; revenueMicros?: number }) =>
    api<CreativeVariant>(`/advertising/campaigns/${id}/variants/${variantId}/metrics`, { method: "POST", json: input }),
  chooseVariant: (id: string, variantId: string) =>
    api<AdCampaignRecord>(`/advertising/campaigns/${id}/variants/choose`, { method: "POST", json: { variantId } }),
  analytics: () => api<AdPortfolioAnalytics>("/advertising/analytics"),
  /** Download analytics as a file (csv|json|txt|pdf|docx) as a blob download. */
  exportFile: async (format: "csv" | "json" | "txt" | "pdf" | "docx"): Promise<void> => {
    const { useAuthStore } = await import("@/store/auth");
    const token = useAuthStore.getState().accessToken;
    const base = import.meta.env.VITE_API_URL ?? "/api/v1";
    const res = await fetch(`${base}/advertising/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const cd = res.headers.get("Content-Disposition") ?? "";
    const match = cd.match(/filename="?([^";]+)"?/);
    a.download = match?.[1] ?? `windels-ads-analytics.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  audiences: () => api<AudienceRecord[]>("/advertising/audiences"),
  createAudience: (input: { name: string; description?: string; criteria: Partial<AudienceCriteria> }) =>
    api<AudienceRecord>("/advertising/audiences", { method: "POST", json: input }),
  deleteAudience: (id: string) => api<void>(`/advertising/audiences/${id}`, { method: "DELETE" }),
  addAudienceToCampaign: (campaignId: string, audienceId: string) =>
    api<AdCampaignRecord>(`/advertising/campaigns/${campaignId}/audiences/${audienceId}`, { method: "POST" }),
  removeAudienceFromCampaign: (campaignId: string, audienceId: string) =>
    api<AdCampaignRecord>(`/advertising/campaigns/${campaignId}/audiences/${audienceId}`, { method: "DELETE" }),
  snapshot: (id: string) => api<MetricsSnapshot>(`/advertising/campaigns/${id}/snapshot`, { method: "POST" }),
  duplicate: (id: string, name?: string) =>
    api<AdCampaignRecord>(`/advertising/campaigns/${id}/duplicate`, { method: "POST", json: name ? { name } : undefined }),
  settings: () => api<Record<string, unknown>>("/advertising/settings"),
  updateSettings: (patch: Record<string, unknown>) => api<Record<string, unknown>>("/advertising/settings", { method: "PATCH", json: patch }),
};
