/**
 * Developer / API Platform contracts.
 *
 * Builds on the existing Session 104 API-key contracts and the Session 120
 * public gateway. Adds fine-grained scope management, developer applications,
 * API products (marketplace), a persistent usage ledger and dashboard metrics,
 * plus the developer-facing gateway endpoints (agent execution, workflows,
 * knowledge, trading, media, voice).
 *
 * Everything here maps to the existing Prisma-backed services — there are no
 * disconnected mock surfaces.
 */
import { z } from "zod";

/* ── Granular capability scopes ─────────────────────────────────────────── */

export const API_SCOPE_CATALOG = [
  "ai:read",
  "ai:execute",
  "models:read",
  "tools:execute",
  "agents:read",
  "agents:execute",
  "workflows:read",
  "workflows:execute",
  "memory:read",
  "memory:write",
  "knowledge:read",
  "knowledge:write",
  "knowledge:search",
  "search:read",
  "files:read",
  "files:write",
  "images:generate",
  "audio:generate",
  "audio:transcribe",
  "media:generate",
  "voice:generate",
  "documents:generate",
  "analytics:read",
  "billing:read",
  "marketplace:read",
  "marketplace:write",
  "nfc:read",
  "nfc:write",
  "nfc:admin",
] as const;
export type ApiScope = (typeof API_SCOPE_CATALOG)[number];

export const API_SCOPE_GROUPS: Record<string, string[]> = {
  AI: ["ai:read", "ai:execute", "models:read", "tools:execute"],
  Agents: ["agents:read", "agents:execute"],
  Workflows: ["workflows:read", "workflows:execute"],
  Memory: ["memory:read", "memory:write"],
  Knowledge: ["knowledge:read", "knowledge:write", "knowledge:search"],
  Search: ["search:read"],
  Files: ["files:read", "files:write", "documents:generate"],
  Media: ["media:generate", "images:generate"],
  Voice: ["voice:generate", "audio:generate", "audio:transcribe"],
  Analytics: ["analytics:read"],
  Billing: ["billing:read"],
  Marketplace: ["marketplace:read", "marketplace:write"],
  NFC: ["nfc:read", "nfc:write", "nfc:admin"],
};

/** Map a granular scope to the legacy scope it needs for backward-compat
 *  gateway routing (READ for reads, WRITE/ADMIN for writes). */
export function scopeLegacy(s: string): "READ" | "WRITE" | "ADMIN" {
  if (s.endsWith(":admin")) return "ADMIN";
  if (s.endsWith(":read")) return "READ";
  if (s.endsWith(":execute") || s.endsWith(":write") || s.endsWith(":generate")) return "WRITE";
  return "READ";
}

export const APP_ENVIRONMENTS = ["development", "test", "production"] as const;
export type DeveloperAppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export const API_PRODUCT_CATEGORIES = [
  "agents", "workforce", "trading", "media", "voice", "knowledge",
  "workflows", "documents", "business", "search", "marketplace", "communication", "hardware",
] as const;
export type ApiProductCategory = (typeof API_PRODUCT_CATEGORIES)[number];

/* ── Developer applications ─────────────────────────────────────────────── */

export interface DeveloperAppRow {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  environment: DeveloperAppEnvironment;
  redirectUrls: string[];
  allowedScopes: string[];
  active: boolean;
  productionApproved: boolean;
  apiKeyCount: number;
  owner: { id: string; displayName: string };
  createdAt: string;
  updatedAt: string;
}

export const DeveloperAppCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().max(500).optional().nullable(),
  environment: z.enum(APP_ENVIRONMENTS).default("development"),
  redirectUrls: z.array(z.string().url().max(500)).max(20).default([]),
  allowedScopes: z.array(z.enum(API_SCOPE_CATALOG)).max(50).default([]),
});
export type DeveloperAppCreateInput = z.input<typeof DeveloperAppCreateSchema>;

export const DeveloperAppUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  logoUrl: z.string().url().max(500).optional().nullable(),
  environment: z.enum(APP_ENVIRONMENTS).optional(),
  redirectUrls: z.array(z.string().url().max(500)).max(20).optional(),
  allowedScopes: z.array(z.enum(API_SCOPE_CATALOG)).max(50).optional(),
  active: z.boolean().optional(),
});
export type DeveloperAppUpdateInput = z.input<typeof DeveloperAppUpdateSchema>;

/* ── API products (marketplace) ─────────────────────────────────────────── */

export interface ApiProductRow {
  id: string;
  slug: string;
  name: string;
  category: ApiProductCategory;
  description: string | null;
  version: string;
  requiredScopes: string[];
  basePriceUsd: number;
  enabled: boolean;
  rateLimitPerMin: number;
  docsUrl: string | null;
  example: unknown;
}

export interface ApiSubscriptionRow {
  id: string;
  appId: string | null;
  product: ApiProductRow;
  status: string;
  quota: number;
  usedThisMonth: number;
}

/* ── Usage ledger & dashboard metrics ───────────────────────────────────── */

export interface ApiUsageRecordRow {
  id: string;
  apiKeyId: string | null;
  appId: string | null;
  method: string;
  path: string;
  endpoint: string;
  status: number;
  durationMs: number;
  channel: string;
  productSlug: string | null;
  tokensIn: number;
  tokensOut: number;
  aiCostMicros: number;
  sourceIp: string | null;
  environment: string;
  permission: string | null;
  requestId: string | null;
  model: string | null;
  provider: string | null;
  toolCalls: number;
  actualCostMicros: number | null;
  errorCode: string | null;
  agentRuns: number;
  workflowExecutions: number;
  images: number;
  audioSeconds: number;
  storageBytes: number;
  createdAt: string;
}

export interface ApiDashboardMetrics {
  generatedAt: string;
  windowDays: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRatePct: number | null;
  avgDurationMs: number | null;
  totalTokensIn: number;
  totalTokensOut: number;
  estimatedCostUsd: number;
  actualCostUsd: number | null;
  agentRuns: number;
  toolExecutions: number;
  workflowExecutions: number;
  images: number;
  audioSeconds: number;
  storageBytes: number;
  byEndpoint: Array<{ endpoint: string; count: number; success: number }>;
  byChannel: Array<{ channel: string; count: number }>;
  daily: Array<{ date: string; requests: number; success: number; failed: number }>;
  keyUsage: Array<{ apiKeyId: string; name: string | null; count: number }>;
  recent: ApiUsageRecordRow[];
  rateLimitStatus: { hit: boolean; current: number; limit: number };
}

export const ApiUsageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  appId: z.string().cuid().optional(),
  apiKeyId: z.string().cuid().optional(),
  model: z.string().max(120).optional(),
  endpoint: z.string().max(160).optional(),
  environment: z.enum(["development", "test", "production"]).optional(),
  status: z.coerce.number().int().min(100).max(599).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});
export type ApiUsageQuery = z.input<typeof ApiUsageQuerySchema>;

/* ── Gateway request/response contracts ─────────────────────────────────── */

export interface ApiAgentExecuteResult {
  executionId: string;
  agentId: string;
  agentName: string;
  status: string;
  content: string;
  modelId: string | null;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  createdAt: string;
}

export const ApiAgentExecuteSchema = z.object({
  input: z.union([z.string(), z.record(z.unknown())]).optional(),
  message: z.string().min(1).max(20000).optional(),
  systemPrompt: z.string().max(10000).optional(),
  modelId: z.string().optional(),
});
export type ApiAgentExecuteInput = z.input<typeof ApiAgentExecuteSchema>;

export const ApiWorkflowExecuteSchema = z.object({
  input: z.record(z.unknown()).optional(),
  inputs: z.record(z.unknown()).optional(),
});
export type ApiWorkflowExecuteInput = z.input<typeof ApiWorkflowExecuteSchema>;

export const ApiTradingAnalysisQuerySchema = z.object({
  symbol: z.string().min(1).max(40),
  exchange: z.string().max(40).optional(),
  timeframe: z.string().max(20).optional(),
  indicators: z.array(z.string().max(40)).optional(),
});
export type ApiTradingAnalysisQuery = z.input<typeof ApiTradingAnalysisQuerySchema>;
