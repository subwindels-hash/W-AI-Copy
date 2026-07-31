/**
 * Session 29 — Phase 28: Enterprise Platform Services types (Slices 245–257).
 * Covers Config Platform, Feature Flags, Runtime Config, Policy Management,
 * Multi-Tenant, Tenant Isolation, Enterprise Licensing, Commercial Billing,
 * Feature Management, Runtime Policy Engine, Capability Registry,
 * Semantic Ontology, and Blueprint Library.
 */

// ─── Slice 245 + 247: Config Platform + Runtime Configuration ─────
export type ConfigScope = "global" | "org" | "user" | "tenant" | "environment";
export type ConfigValueType = "string" | "number" | "boolean" | "json" | "secret";
export type ConfigSource = "default" | "bootstrap" | "env" | "db" | "runtime" | "feature-flag";

export interface ConfigEntry {
  id: string;
  key: string;
  scope: ConfigScope;
  valueType: ConfigValueType;
  value: string | number | boolean | unknown;
  defaultValue?: string | number | boolean | unknown;
  description: string;
  source: ConfigSource;
  encrypted: boolean;
  hotReload: boolean; // runtime-changeable without restart (Slice 247)
  updatedAt: string;
  updatedBy: string;
  tags: string[];
}

// ─── Slice 246 + 253: Feature Flags + Feature Management ──────────
export type FlagRolloutStrategy = "boolean" | "percentage" | "user-segment" | "org-segment" | "tenant" | "kill-switch";
export type FlagStatus = "draft" | "active" | "paused" | "archived";

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  status: FlagStatus;
  enabled: boolean;
  rolloutPct: number; // 0-100
  strategy: FlagRolloutStrategy;
  overrides: Array<{ subject: string; kind: "user" | "org" | "tenant" | "segment"; enabled: boolean }>;
  segments: string[];
  tags: string[];
  owner: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  sliceNumber?: number;
}

// ─── Slice 248 + 254: Policy Management + Runtime Policy Engine ───
export type PolicyType =
  | "access-control" | "data-residency" | "rate-limit" | "quota"
  | "compliance" | "retention" | "content-filter" | "budget" | "approval";
export type PolicyEffect = "allow" | "deny" | "enforce" | "audit" | "throttle" | "block";
export type PolicyStatus = "draft" | "active" | "simulation" | "disabled" | "archived";

export interface PolicyCondition {
  field: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "contains" | "regex" | "exists";
  value: unknown;
}

export interface Policy {
  id: string;
  key: string;
  name: string;
  description: string;
  type: PolicyType;
  effect: PolicyEffect;
  status: PolicyStatus;
  priority: number; // higher = evaluated first
  conditions: PolicyCondition[];
  action?: { kind: string; params: Record<string, unknown> };
  version: number;
  activeSince?: string;
  scope: ConfigScope;
  violations30d: number;
  evaluations30d: number;
  updatedAt: string;
  owner: string;
}

export interface PolicyEvaluationResult {
  policyId: string;
  key: string;
  effect: PolicyEffect;
  matched: boolean;
  reason?: string;
}

// ─── Slice 249 + 250: Multi-Tenant Platform + Tenant Isolation ────
export type TenantPlan = "free" | "team" | "business" | "enterprise" | "dedicated";
export type TenantStatus = "provisioning" | "active" | "suspended" | "degraded" | "offboarded";
export type IsolationLevel = "shared" | "schema" | "database" | "dedicated-vpc";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  plan: TenantPlan;
  status: TenantStatus;
  isolation: IsolationLevel;
  region: string;
  createdAt: string;
  seats: number;
  seatsUsed: number;
  usersActive30d: number;
  mrr: number;
  isolated: boolean;
  dataResidency: string[];
  customDomain?: string;
  ssoEnabled: boolean;
  flags: Record<string, boolean>;
}

// ─── Slice 251: Enterprise Licensing ──────────────────────────────
export type LicenseTier = "core" | "pro" | "enterprise" | "unlimited";
export type LicenseStatus = "active" | "trial" | "expired" | "suspended" | "revoked";

export interface License {
  id: string;
  key: string;
  holder: string;
  tenantId: string;
  tier: LicenseTier;
  seats: number;
  seatsUsed: number;
  issuedAt: string;
  expiresAt: string;
  status: LicenseStatus;
  features: string[];
  flags: Record<string, boolean>;
  capabilities: string[];
  signature: string;
  autoRenew: boolean;
}

// ─── Slice 252: Commercial Billing ────────────────────────────────
export type BillingPlan = "free" | "starter" | "growth" | "scale" | "enterprise";
export type BillingPeriod = "monthly" | "annual";
export type BillingStatus = "current" | "past_due" | "delinquent" | "canceled" | "trial";

export interface Invoice {
  id: string;
  number: string;
  amount: number;
  currency: string;
  status: "paid" | "open" | "void" | "uncollectible";
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
  lineItems: Array<{ description: string; amount: number; qty: number }>;
}

export interface BillingAccount {
  id: string;
  tenantId: string;
  plan: BillingPlan;
  period: BillingPeriod;
  status: BillingStatus;
  mrr: number;
  arr: number;
  seats: number;
  nextBillAt: string;
  currency: string;
  taxRate: number;
  discountPct: number;
  dunningLevel: number;
  lastFour?: string;
  invoices: Invoice[];
  usageThisPeriod: Record<string, number>;
}

// ─── Slice 255: Capability Registry ───────────────────────────────
export type CapabilityHealth = "healthy" | "degraded" | "down" | "unknown";
export type CapabilityKind =
  | "api" | "service" | "module" | "skill" | "agent" | "workflow"
  | "dashboard" | "integration" | "model" | "storage" | "queue" | "event";

export interface CapabilityRecord {
  id: string;
  name: string;
  kind: CapabilityKind;
  version: string;
  producer: string; // service/module that exposes it
  consumers: string[]; // services/modules consuming it
  health: CapabilityHealth;
  slaMs?: number;
  p95Ms: number;
  errorRatePct: number;
  requestsPerMin: number;
  deprecated: boolean;
  docsUrl?: string;
  sliceNumber?: number;
  updatedAt: string;
}

// ─── Slice 256: Semantic Ontology ─────────────────────────────────
export type OntologyPropertyType = "string" | "number" | "boolean" | "date" | "ref" | "enum" | "struct";
export interface OntologyProperty {
  name: string;
  type: OntologyPropertyType;
  refClass?: string;
  required: boolean;
  description: string;
}

export interface OntologyClass {
  id: string;
  uri: string;
  label: string;
  parentUri?: string;
  description: string;
  color: "azure"|"violet"|"teal"|"fuchsia"|"amber"|"emerald"|"crimson"|"slate";
  icon: string;
  properties: OntologyProperty[];
  aliases: string[];
  instances: number;
  updatedAt: string;
}

// ─── Slice 257: Blueprint Library ─────────────────────────────────
export type BlueprintCategory =
  | "startup" | "enterprise" | "industry" | "compliance"
  | "ai-workforce" | "workflow" | "data" | "migration";
export type BlueprintCompatibility = "core" | "pro" | "enterprise";

export interface BlueprintSlice {
  id: string;
  name: string;
  sessionNumber?: number;
  required: boolean;
  config: Record<string, unknown>;
}

export interface Blueprint {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: BlueprintCategory;
  industry?: string;
  compatibility: BlueprintCompatibility;
  version: string;
  author: string;
  icon: string;
  color: "azure"|"violet"|"teal"|"fuchsia"|"amber"|"emerald"|"crimson"|"slate";
  slices: BlueprintSlice[];
  modules: string[];
  agents: string[];
  skills: string[];
  workflows: string[];
  dashboards: string[];
  estimatedDeployMin: number;
  installs: number;
  stars: number;
  certified: "official" | "partner" | "community";
  updatedAt: string;
}

// ─── Aggregate dashboard ──────────────────────────────────────────
export interface PlatformServicesDashboard {
  configEntries: number;
  hotReloadable: number;
  featureFlags: number;
  flagsActive: number;
  runtimeOverrides: number;
  policies: number;
  policiesActive: number;
  evaluations24h: number;
  violations24h: number;
  tenants: number;
  tenantsActive: number;
  isolatedTenants: number;
  licenses: number;
  licensesActive: number;
  expiringLicenses30d: number;
  accounts: number;
  totalMrr: number;
  totalArr: number;
  delinquentAccounts: number;
  capabilities: number;
  capabilitiesHealthy: number;
  ontologyClasses: number;
  ontologyProperties: number;
  blueprints: number;
  blueprintsCertified: number;
}
