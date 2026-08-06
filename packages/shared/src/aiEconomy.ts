// Session 71 / 103 — Enterprise AI Economy and GPU capacity contracts.
//
// Session 103 completes the originally thin ledger with org-scoped usage,
// allocation and compute-offer records. Dashboard values remain projections of
// those real records; unavailable revenue/marketplace data stays explicitly 0.

import { z } from "zod";

export const AI_ECONOMY_RESOURCES = ["gpu", "cpu", "ram", "storage", "bandwidth", "tokens"] as const;
export type AiEconomyResource = (typeof AI_ECONOMY_RESOURCES)[number];

export const AI_ECONOMY_PROVIDERS = ["internal", "aws", "gcp", "azure", "lambda_labs", "peer"] as const;
export type AiEconomyProvider = (typeof AI_ECONOMY_PROVIDERS)[number];

export interface AiCredit {
  id: string;
  owner: string;
  balance: number;
  earned: number;
  spent: number;
  tier: "free" | "pro" | "enterprise" | "unlimited";
}

export interface ComputeOffer {
  id: string;
  provider: AiEconomyProvider;
  gpuType: string;
  vramGb: number;
  pricePerHour: number;
  region: string;
  available: boolean;
  utilizationPct: number;
  updatedAt?: string;
}

export interface GpuAllocation {
  id: string;
  cluster: string;
  gpuType: string;
  assignedTo: string;
  job?: string;
  utilizationPct: number;
  vramUsedGb: number;
  costPerHour: number;
  startedAt: string;
}

export interface ResourceUsage {
  id?: string;
  resource: AiEconomyResource;
  allocated: number;
  used: number;
  unit: string;
  costPerUnit: number;
  department: string;
  recordedAt?: string;
}

export interface AiUsageEntry {
  id: string;
  resource: AiEconomyResource;
  quantity: number;
  unit: string;
  costCents: number;
  department: string;
  recordedAt: string;
}

export type AiAllocation = GpuAllocation;

export interface EconomyDashboard {
  creditsInCirculation: number;
  creditsSpent30d: number;
  creditsEarned30d: number;
  computeRevenue30d: number;
  computeCost30d: number;
  marginPct: number;
  gpuUtilizationPct: number;
  gpusAvailable: number;
  gpusTotal: number;
  activeAllocations: number;
  forecasts: Array<{ month: string; costUsd: number; usageTokens: number }>;
  /** Explains that forecasts are a projection of observed usage, not a quote. */
  forecastKind: "observed_run_rate" | "no_observation";
  topDepartments: Array<{ department: string; spend: number; credits: number }>;
  offers: ComputeOffer[];
  allocations: GpuAllocation[];
  usage: ResourceUsage[];
  marketplaceVolume30d: number;
}

export const AiEconomyUsageSchema = z.object({
  resource: z.enum(AI_ECONOMY_RESOURCES),
  quantity: z.number().positive().max(Number.MAX_SAFE_INTEGER),
  unit: z.string().trim().min(1).max(32),
  costCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  department: z.string().trim().min(1).max(64),
});
export type AiEconomyUsageInput = z.infer<typeof AiEconomyUsageSchema>;

export const AiEconomyAllocationSchema = z.object({
  cluster: z.string().trim().min(1).max(120),
  gpuType: z.string().trim().min(1).max(64),
  assignedTo: z.string().trim().min(1).max(160),
  job: z.string().trim().min(1).max(200),
  utilizationPct: z.number().min(0).max(100),
  vramUsedGb: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER),
  costPerHour: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type AiEconomyAllocationInput = z.infer<typeof AiEconomyAllocationSchema>;

export const AiEconomyOfferSchema = z.object({
  provider: z.enum(AI_ECONOMY_PROVIDERS),
  gpuType: z.string().trim().min(1).max(64),
  vramGb: z.number().positive().max(Number.MAX_SAFE_INTEGER),
  pricePerHour: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER),
  region: z.string().trim().min(1).max(80),
  available: z.boolean().default(true),
  utilizationPct: z.number().min(0).max(100).default(0),
});
export type AiEconomyOfferInput = z.infer<typeof AiEconomyOfferSchema>;
export const AiEconomyOfferUpdateSchema = AiEconomyOfferSchema.partial();
export const AiEconomyRecordIdSchema = z.object({ id: z.string().min(1).max(96) });
export const AiEconomyLimitQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });
