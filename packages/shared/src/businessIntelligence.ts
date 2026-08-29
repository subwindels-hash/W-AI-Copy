// Session 97 — Enterprise Business Intelligence & Report Builder.
//
// The master spec's Phase-4 Enterprise Operations roadmap names Analytics;
// the platform now ships a full application suite but no analysis layer.
// This module adds org-scoped data sources, KPI definitions whose values are
// computed live from the real module stores (never stored/fabricated), and a
// report builder with deterministic evaluation + real CSV export.
//
// Types are prefixed `Bi`. Single source of truth shared by the API service,
// the HTTP routes and the web client.

import { z } from "zod";

// ─── Supported source modules & metrics ─────────────────────────────────

export const BI_MODULES = ["crm", "erp", "email", "social", "helpdesk", "builder"] as const;
export type BiModule = (typeof BI_MODULES)[number];

export const BI_METRICS: Record<BiModule, readonly string[]> = {
  crm: ["contacts", "companies", "open_deals", "won_deals", "forecast"],
  erp: ["products", "stock_value", "purchase_orders", "sales_orders"],
  email: ["mailboxes", "messages", "unread", "queued_outbox"],
  social: ["posts", "comments", "reactions"],
  helpdesk: ["tickets", "open", "resolved", "overdue"],
  builder: ["projects", "builds", "artifacts", "releases"],
};

export const BI_ALL_METRICS = Object.values(BI_METRICS).flat() as readonly string[];

export const BI_PERIODS = ["all", "7d", "30d"] as const;
export type BiPeriod = (typeof BI_PERIODS)[number];

export const BI_FORMATS = ["number", "currency", "percent"] as const;
export type BiFormat = (typeof BI_FORMATS)[number];

// ─── Records ────────────────────────────────────────────────────────────

export interface BiSource {
  id: string;
  organizationId: string;
  name: string;
  module: BiModule;
  description: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BiKpi {
  id: string;
  organizationId: string;
  name: string;
  sourceModule: BiModule;
  metric: string;
  period: BiPeriod;
  format: BiFormat;
  createdAt: string;
  updatedAt: string;
}

export interface BiReportCard {
  id: string;
  title: string;
  sourceModule: BiModule;
  metric: string;
  period: BiPeriod;
}

export interface BiReport {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  cards: BiReportCard[];
  createdAt: string;
  updatedAt: string;
}

// ─── Evaluated outputs (computed per read) ──────────────────────────────

export interface BiKpiValue {
  kpiId: string;
  name: string;
  sourceModule: BiModule;
  metric: string;
  period: BiPeriod;
  value: number;
  format: BiFormat;
  sampledAt: string;
}

export interface BiReportCardValue {
  card: BiReportCard;
  value: number;
  format: BiFormat;
  sampledAt: string;
}

export interface BiReportEvaluation {
  report: BiReport;
  cards: BiReportCardValue[];
  evaluatedAt: string;
}

export interface BiRollup {
  counts: {
    sources: number;
    enabledSources: number;
    kpis: number;
    reports: number;
    cards: number;
  };
  sourceHealth: Array<{
    sourceId: string;
    name: string;
    module: BiModule;
    enabled: boolean;
    sampleCount: number;
    lastSampleAt: string | null;
  }>;
  recentReports: BiReport[];
  lastUpdatedAt: string | null;
}

// ─── Input schemas (validated at the API boundary) ──────────────────────

export const BiSourceUpsertSchema = z.object({
  name: z.string().trim().min(1).max(140),
  module: z.enum(BI_MODULES),
  description: z.string().max(1000).nullable().optional(),
  enabled: z.boolean().default(true),
});
export type BiSourceUpsertInput = z.infer<typeof BiSourceUpsertSchema>;
export type BiSourceCreateInput = z.input<typeof BiSourceUpsertSchema>;

export const BiKpiUpsertSchema = z.object({
  name: z.string().trim().min(1).max(140),
  sourceModule: z.enum(BI_MODULES),
  metric: z.string().trim().min(1).max(80),
  period: z.enum(BI_PERIODS).default("all"),
  format: z.enum(BI_FORMATS).default("number"),
});
export type BiKpiUpsertInput = z.infer<typeof BiKpiUpsertSchema>;
export type BiKpiCreateInput = z.input<typeof BiKpiUpsertSchema>;

export const BiReportCardSchema = z.object({
  title: z.string().trim().min(1).max(160),
  sourceModule: z.enum(BI_MODULES),
  metric: z.string().trim().min(1).max(80),
  period: z.enum(BI_PERIODS).default("all"),
});

export const BiReportUpsertSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().max(1000).nullable().optional(),
  cards: z.array(BiReportCardSchema).max(20).default([]),
});
export type BiReportUpsertInput = z.infer<typeof BiReportUpsertSchema>;
export type BiReportCreateInput = z.input<typeof BiReportUpsertSchema>;
