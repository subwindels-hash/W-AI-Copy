// Session 100 — Enterprise FinOps depth.
//
// Org-scoped budgets, cost centers, actual cost ledger entries and an
// allocation ledger. Chargebacks and budget utilization are projections of
// those real records; they are never persisted as a second source of truth.

import { z } from "zod";

export const EFO_COST_CENTER_STATUSES = ["active", "archived"] as const;
export type EfoCostCenterStatus = (typeof EFO_COST_CENTER_STATUSES)[number];

export const EFO_BUDGET_PERIODS = ["monthly", "quarterly", "annual", "custom"] as const;
export type EfoBudgetPeriod = (typeof EFO_BUDGET_PERIODS)[number];

export const EFO_BUDGET_STATUSES = ["active", "closed"] as const;
export type EfoBudgetStatus = (typeof EFO_BUDGET_STATUSES)[number];

export const EFO_ALLOCATION_METHODS = ["direct", "shared", "usage", "proportional"] as const;
export type EfoAllocationMethod = (typeof EFO_ALLOCATION_METHODS)[number];

export const EFO_COST_PROVIDERS = ["aws", "gcp", "azure", "windels", "on-prem", "other"] as const;
export type EfoCostProvider = (typeof EFO_COST_PROVIDERS)[number];

export const EFO_COST_CATEGORIES = ["compute", "storage", "network", "database", "ml", "saas", "support", "other"] as const;
export type EfoCostCategory = (typeof EFO_COST_CATEGORIES)[number];

export const EFO_COST_SOURCES = ["manual", "provider_import", "metered", "adjustment"] as const;
export type EfoCostSource = (typeof EFO_COST_SOURCES)[number];

export const EFO_CHARGEBACK_STATUSES = ["no_budget", "on_track", "warning", "over"] as const;
export type EfoChargebackStatus = (typeof EFO_CHARGEBACK_STATUSES)[number];

// ─── Stored records ──────────────────────────────────────────────────────

export interface EfoCostCenter {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  owner: string;
  currency: string;
  status: EfoCostCenterStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EfoBudget {
  id: string;
  organizationId: string;
  costCenterId: string;
  name: string;
  period: EfoBudgetPeriod;
  periodStart: string;
  periodEnd: string;
  amountMinor: number;
  currency: string;
  status: EfoBudgetStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A real provider or metering observation. It is not a chargeback. */
export interface EfoCostEntry {
  id: string;
  organizationId: string;
  provider: EfoCostProvider;
  category: EfoCostCategory;
  service: string;
  amountMinor: number;
  currency: string;
  occurredAt: string;
  source: EfoCostSource;
  description: string | null;
  tags: Record<string, string>;
  createdAt: string;
}

/** Immutable allocation ledger row linking an actual cost to a cost center. */
export interface EfoAllocation {
  id: string;
  organizationId: string;
  costId: string;
  costCenterId: string;
  amountMinor: number;
  currency: string;
  method: EfoAllocationMethod;
  driver: string | null;
  createdBy: string | null;
  createdAt: string;
}

// ─── Computed outputs ────────────────────────────────────────────────────

export interface EfoChargeback {
  costCenterId: string;
  name: string;
  code: string;
  currency: string;
  budgetMinor: number;
  actualMinor: number;
  varianceMinor: number;
  utilizationPct: number;
  status: EfoChargebackStatus;
  costCount: number;
  allocationCount: number;
  byMethod: Record<EfoAllocationMethod, number>;
}

export interface EfoCurrencyTotals {
  costMinor: number;
  allocatedMinor: number;
  unallocatedMinor: number;
  budgetMinor: number;
}

export interface EfoRollup {
  counts: {
    costCenters: number;
    activeCostCenters: number;
    budgets: number;
    activeBudgets: number;
    costs: number;
    allocations: number;
  };
  totalsByCurrency: Record<string, EfoCurrencyTotals>;
  chargebacks: EfoChargeback[];
  recentCosts: EfoCostEntry[];
  lastUpdatedAt: string | null;
}

// ─── Shared request contracts ────────────────────────────────────────────

const CurrencySchema = z.string().trim().regex(/^[A-Za-z]{3}$/, "currency must be a 3-letter code").transform((v) => v.toUpperCase());
const IsoDateSchema = z.string().trim().min(1).refine((v) => !Number.isNaN(Date.parse(v)), "invalid ISO date");
const MinorAmountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const EfoCostCenterUpsertSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "code contains invalid characters"),
  owner: z.string().trim().min(1).max(120),
  currency: CurrencySchema.default("USD"),
  status: z.enum(EFO_COST_CENTER_STATUSES).default("active"),
});
export type EfoCostCenterUpsertInput = z.infer<typeof EfoCostCenterUpsertSchema>;
export type EfoCostCenterCreateInput = z.input<typeof EfoCostCenterUpsertSchema>;

export const EfoBudgetUpsertSchema = z.object({
  costCenterId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(140),
  period: z.enum(EFO_BUDGET_PERIODS).default("monthly"),
  periodStart: IsoDateSchema,
  periodEnd: IsoDateSchema,
  amountMinor: MinorAmountSchema,
  currency: CurrencySchema.default("USD"),
  status: z.enum(EFO_BUDGET_STATUSES).default("active"),
  notes: z.string().max(2000).nullable().optional(),
});
export type EfoBudgetUpsertInput = z.infer<typeof EfoBudgetUpsertSchema>;
export type EfoBudgetCreateInput = z.input<typeof EfoBudgetUpsertSchema>;

export const EfoCostEntryUpsertSchema = z.object({
  provider: z.enum(EFO_COST_PROVIDERS),
  category: z.enum(EFO_COST_CATEGORIES),
  service: z.string().trim().min(1).max(140),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: CurrencySchema.default("USD"),
  occurredAt: IsoDateSchema.optional(),
  source: z.enum(EFO_COST_SOURCES).default("manual"),
  description: z.string().max(2000).nullable().optional(),
  tags: z.record(z.string().max(120)).default({}),
  /** Optional convenience: create a direct allocation with the cost. */
  costCenterId: z.string().trim().min(1).max(64).nullable().optional(),
  allocationMethod: z.enum(EFO_ALLOCATION_METHODS).optional(),
  allocationDriver: z.string().trim().max(200).nullable().optional(),
});
export type EfoCostEntryUpsertInput = z.infer<typeof EfoCostEntryUpsertSchema>;
export type EfoCostEntryCreateInput = z.input<typeof EfoCostEntryUpsertSchema>;

export const EfoAllocationCreateSchema = z.object({
  costId: z.string().trim().min(1).max(64),
  costCenterId: z.string().trim().min(1).max(64),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: CurrencySchema.default("USD"),
  method: z.enum(EFO_ALLOCATION_METHODS).default("direct"),
  driver: z.string().trim().max(200).nullable().optional(),
});
export type EfoAllocationCreateInput = z.input<typeof EfoAllocationCreateSchema>;

export const EfoChargebackQuerySchema = z.object({
  costCenterId: z.string().trim().min(1).max(64).optional(),
  from: IsoDateSchema.optional(),
  to: IsoDateSchema.optional(),
});
export type EfoChargebackQuery = z.input<typeof EfoChargebackQuerySchema>;
