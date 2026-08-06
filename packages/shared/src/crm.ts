// Session 90 — Enterprise CRM (Customer Relationship Management).
//
// The master spec's Phase-3 Enterprise Applications list ("CRM, ERP, Website
// Builder, Email Intelligence, Social Platform, Trading Intelligence,
// Marketplace") names CRM as a first-class platform surface, and Session 32's
// meeting intelligence writes through "to CRM, Project, Knowledge Graph, and
// Enterprise Memory". Until now the platform had no CRM application layer.
//
// This module ships contacts, companies, a stage-aware deal pipeline and an
// activity ledger as real, org-scoped records (Redis, `crm:*` namespaces)
// plus a deterministic dashboard rollup computed from what is actually
// stored — never fabricated.
//
// Types are prefixed `Crm`. These are the single source of truth shared by
// the API service, the HTTP routes and the web client.

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────────

export const CRM_CONTACT_SOURCES = [
  "referral",
  "website",
  "event",
  "inbound",
  "outbound",
  "partner",
  "other",
] as const;
export type CrmContactSource = (typeof CRM_CONTACT_SOURCES)[number];

export const CRM_CONTACT_STATUSES = ["lead", "prospect", "customer", "churned"] as const;
export type CrmContactStatus = (typeof CRM_CONTACT_STATUSES)[number];

export const CRM_COMPANY_SIZE_BANDS = ["micro", "small", "mid", "large", "enterprise", "unknown"] as const;
export type CrmCompanySizeBand = (typeof CRM_COMPANY_SIZE_BANDS)[number];

export const CRM_DEAL_STAGE_KEYS = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;
export type CrmDealStageKey = (typeof CRM_DEAL_STAGE_KEYS)[number];

export const CRM_ACTIVITY_KINDS = ["note", "email", "call", "meeting", "task"] as const;
export type CrmActivityKind = (typeof CRM_ACTIVITY_KINDS)[number];

/** Default pipeline definition — ordered, with default win probabilities. */
export const CRM_DEFAULT_STAGES: ReadonlyArray<{
  key: CrmDealStageKey;
  label: string;
  order: number;
  probabilityPct: number;
}> = [
  { key: "lead", label: "Lead", order: 0, probabilityPct: 10 },
  { key: "qualified", label: "Qualified", order: 1, probabilityPct: 30 },
  { key: "proposal", label: "Proposal", order: 2, probabilityPct: 50 },
  { key: "negotiation", label: "Negotiation", order: 3, probabilityPct: 70 },
  { key: "closed_won", label: "Closed Won", order: 4, probabilityPct: 100 },
  { key: "closed_lost", label: "Closed Lost", order: 5, probabilityPct: 0 },
] as const;

export const CRM_DEFAULT_STAGE_PROBABILITY: Record<CrmDealStageKey, number> = Object.fromEntries(
  CRM_DEFAULT_STAGES.map((s) => [s.key, s.probabilityPct])
) as Record<CrmDealStageKey, number>;

// ─── Records ────────────────────────────────────────────────────────────

export interface CrmContact {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyId: string | null;
  title: string | null;
  source: CrmContactSource;
  status: CrmContactStatus;
  tags: string[];
  ownerId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmCompany {
  id: string;
  organizationId: string;
  name: string;
  domain: string | null;
  industry: string | null;
  sizeBand: CrmCompanySizeBand;
  website: string | null;
  city: string | null;
  country: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CrmDeal {
  id: string;
  organizationId: string;
  name: string;
  companyId: string;
  contactId: string | null;
  amountCents: number;
  currency: string;
  stage: CrmDealStageKey;
  probabilityPct: number;
  expectedCloseAt: string | null;
  tags: string[];
  ownerId: string | null;
  stageChangedAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmActivity {
  id: string;
  organizationId: string;
  kind: CrmActivityKind;
  subject: string;
  body: string | null;
  contactId: string | null;
  dealId: string | null;
  companyId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface CrmPipelineStage {
  key: CrmDealStageKey;
  label: string;
  order: number;
  probabilityPct: number;
}

export interface CrmStageRollup {
  stageKey: CrmDealStageKey;
  label: string;
  order: number;
  count: number;
  sumCents: number;
}

export interface CrmDashboardRollup {
  counts: {
    contacts: number;
    companies: number;
    openDeals: number;
    closedWonDeals: number;
    closedLostDeals: number;
    activities: number;
  };
  pipeline: CrmStageRollup[];
  forecastCents: number;
  openPipelineCents: number;
  closedWonCents: number;
  /** 0–1, or null when there are no closed deals yet. */
  conversionRate: number | null;
  topDeals: CrmDeal[];
  recentActivities: CrmActivity[];
  lastUpdatedAt: string | null;
}

// ─── Input schemas (validated at the API boundary) ──────────────────────

const isoDateOrNull = z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).nullable().optional();

export const CrmContactUpsertSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  companyId: z.string().trim().max(64).nullable().optional(),
  title: z.string().trim().max(120).nullable().optional(),
  source: z.enum(CRM_CONTACT_SOURCES).default("other"),
  status: z.enum(CRM_CONTACT_STATUSES).default("lead"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  ownerId: z.string().trim().max(64).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});
export type CrmContactUpsertInput = z.infer<typeof CrmContactUpsertSchema>;
/** Pre-parse input (defaulted fields optional) — used by the service directly. */
export type CrmContactCreateInput = z.input<typeof CrmContactUpsertSchema>;

export const CrmCompanyUpsertSchema = z.object({
  name: z.string().trim().min(1).max(140),
  domain: z.string().trim().max(200).nullable().optional(),
  industry: z.string().trim().max(100).nullable().optional(),
  sizeBand: z.enum(CRM_COMPANY_SIZE_BANDS).default("unknown"),
  website: z.string().trim().url().max(300).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type CrmCompanyUpsertInput = z.infer<typeof CrmCompanyUpsertSchema>;
/** Pre-parse input (defaulted fields optional) — used by the service directly. */
export type CrmCompanyCreateInput = z.input<typeof CrmCompanyUpsertSchema>;

export const CrmDealUpsertSchema = z.object({
  name: z.string().trim().min(1).max(160),
  companyId: z.string().trim().min(1).max(64),
  contactId: z.string().trim().max(64).nullable().optional(),
  amountCents: z.number().int().min(0).max(10_000_000_000_000),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("USD"),
  stage: z.enum(CRM_DEAL_STAGE_KEYS).default("lead"),
  probabilityPct: z.number().int().min(0).max(100).optional(),
  expectedCloseAt: isoDateOrNull,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  ownerId: z.string().trim().max(64).nullable().optional(),
});
export type CrmDealUpsertInput = z.infer<typeof CrmDealUpsertSchema>;
/** Pre-parse input (defaulted fields optional) — used by the service directly. */
export type CrmDealCreateInput = z.input<typeof CrmDealUpsertSchema>;

export const CrmActivityCreateSchema = z.object({
  kind: z.enum(CRM_ACTIVITY_KINDS),
  subject: z.string().trim().min(1).max(200),
  body: z.string().max(8000).nullable().optional(),
  contactId: z.string().trim().max(64).nullable().optional(),
  dealId: z.string().trim().max(64).nullable().optional(),
  companyId: z.string().trim().max(64).nullable().optional(),
  dueAt: isoDateOrNull,
  completedAt: isoDateOrNull,
});
export type CrmActivityCreateInput = z.infer<typeof CrmActivityCreateSchema>;
