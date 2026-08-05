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
  aiConfigured: boolean;
  createdAt: string;
  updatedAt: string;
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
  aiConfigured: boolean;
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
  settings: () => api<Record<string, unknown>>("/advertising/settings"),
  updateSettings: (patch: Record<string, unknown>) => api<Record<string, unknown>>("/advertising/settings", { method: "PATCH", json: patch }),
};
