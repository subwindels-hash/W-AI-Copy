/**
 * Session 31 — Phase 30: Enterprise Foundation types (Slices 271–284).
 * Data Fabric, Identity Fabric/Federation/AI Identity, FinOps + Cost Intelligence
 * + Resource Optimization, Resilience + Self-Healing + BCP, AI Quality/Eval Metrics,
 * Global Operations Center + Executive Ops Dashboard.
 */

// ─── Slice 271: Enterprise Data Fabric ───────────────────────────
export type FabricConnectorKind =
  | "postgres" | "mysql" | "snowflake" | "bigquery" | "redshift" | "databricks"
  | "s3" | "gcs" | "azure-blob" | "kafka" | "api" | "salesforce" | "sap" | "workday";
export type ConnectorStatus = "connected" | "degraded" | "error" | "syncing" | "paused";

export interface FabricConnector {
  id: string;
  name: string;
  kind: FabricConnectorKind;
  status: ConnectorStatus;
  region: string;
  host?: string;
  database?: string;
  catalog?: string;
  datasets: number;
  rowsProcessed24h: number;
  bytesProcessed24h: number;
  latencyMs: number;
  errorRatePct: number;
  lastSyncAt?: string;
  owner: string;
  encrypted: boolean;
  tags: string[];
}

export interface DataProduct {
  id: string;
  name: string;
  domain: string;
  description: string;
  owner: string;
  sources: string[]; // connector ids
  schema: string; // logical schema JSON stringified
  freshnessMinutes: number;
  rows: number;
  consumers: number;
  certified: "official" | "partner" | "community";
  sla: string;
  updatedAt: string;
}

export interface DataLineage {
  id: string;
  from: string;
  to: string;
  type: "ingest" | "transform" | "serve" | "join";
  job: string;
  rows: number;
}

// ─── Slice 272+273+274: Identity Fabric/Federation/AI Identity ──
export type PrincipalKind = "human" | "service" | "ai-agent" | "api-key" | "device";
export type IdpProvider =
  | "local" | "saml" | "oidc" | "google" | "microsoft" | "okta" | "auth0" | "scim" | "windels-federation";
export type IdentityStatus = "active" | "pending" | "suspended" | "offboarded";
export type AiAgentIdentityClass = "trusted" | "sandboxed" | "read-only" | "quarantined";

export interface IdentityPrincipal {
  id: string;
  principalId: string;
  kind: PrincipalKind;
  displayName: string;
  email?: string;
  provider: IdpProvider;
  tenantId: string;
  status: IdentityStatus;
  mfaEnabled: boolean;
  lastLoginAt?: string;
  scopes: string[];
  groups: string[];
  aiClass?: AiAgentIdentityClass;
  modelId?: string;
  agentId?: string;
  riskScore: number; // 0-100
  createdAt: string;
  lastRotatedAt?: string;
}

export interface IdentityProviderRec {
  id: string;
  name: string;
  kind: IdpProvider;
  domain: string;
  status: "active" | "error" | "provisioning";
  ssoUrl?: string;
  scimEnabled: boolean;
  usersSynced: number;
  groupsSynced: number;
  lastSyncAt?: string;
  createdAt: string;
}

export interface ServiceAccount {
  id: string;
  name: string;
  principalId: string;
  scopes: string[];
  lastUsedAt?: string;
  expiresAt?: string;
  rotatedAt: string;
  createdBy: string;
}

// ─── Slice 275+276+277: FinOps + Cost Intelligence + Optimization
export type CloudProvider = "aws" | "gcp" | "azure" | "windels" | "on-prem";
export type CostCategory = "compute" | "storage" | "network" | "database" | "ml" | "saas" | "support" | "other";

export interface FinOpsAccount {
  id: string;
  provider: CloudProvider;
  name: string;
  accountId: string;
  region: string;
  monthToDate: number;
  forecast: number;
  budget: number;
  trendPct: number;
  status: "on-track" | "over" | "under" | "alert";
  currency: string;
}

export interface CostEntry {
  id: string;
  date: string;
  provider: CloudProvider;
  category: CostCategory;
  service: string;
  amount: number;
  currency: string;
  tenantId?: string;
  tags: Record<string, string>;
}

export interface CostAnomaly {
  id: string;
  detectedAt: string;
  provider: CloudProvider;
  service: string;
  category: CostCategory;
  expectedAmount: number;
  actualAmount: number;
  deltaPct: number;
  severity: "info" | "warn" | "critical";
  status: "open" | "acknowledged" | "resolved";
}

export interface Optimization {
  id: string;
  title: string;
  provider: CloudProvider;
  category: CostCategory;
  resource: string;
  region: string;
  savingMonthly: number;
  effort: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  status: "recommended" | "applied" | "dismissed";
  description: string;
}

// ─── Slice 278+279+280: Resilience + Self-Healing + Business Continuity
export type IncidentSeverity = "sev1" | "sev2" | "sev3" | "sev4";
export type IncidentStatus = "open" | "investigating" | "mitigated" | "resolved" | "postmortem";

export interface ResilienceIncident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  service: string;
  region: string;
  openedAt: string;
  mitigatedAt?: string;
  resolvedAt?: string;
  commander?: string;
  impactedCustomers: number;
  rca?: string;
  playbookId?: string;
  notesCount: number;
}

export interface SelfHealingPlaybook {
  id: string;
  name: string;
  trigger: string; // signal name
  action: string;
  autoRun: boolean;
  lastRunAt?: string;
  runsLast30d: number;
  successRatePct: number;
  avgResolveSec: number;
  description: string;
}

export interface BcpPlan {
  id: string;
  name: string;
  rtoMinutes: number;
  rpoMinutes: number;
  criticalSystems: string[];
  failoverRegion: string;
  lastDrillAt?: string;
  lastDrillPassed?: boolean;
  owner: string;
  status: "ready" | "drill-scheduled" | "needs-updating" | "failover-active";
  updatedAt: string;
}

// ─── Slice 281+282: AI Quality Intelligence + Eval Metrics ──────
export type EvalDimension = "accuracy" | "hallucination" | "toxicity" | "groundedness" | "relevance" | "latency" | "cost" | "safety" | "bias" | "multilingual";

export interface AiQualityScorecard {
  id: string;
  modelId: string;
  modelName: string;
  evaluatedAt: string;
  evaluator: string; // auto|human|llm-judge|red-team
  dataset: string;
  samples: number;
  scores: Partial<Record<EvalDimension, number>>; // 0-100
  passPct: number;
  regression: boolean;
  approved: boolean;
}

export interface EvalRun {
  id: string;
  name: string;
  modelId: string;
  dataset: string;
  startedAt: string;
  finishedAt?: string;
  status: "queued" | "running" | "passed" | "failed";
  samples: number;
  passedSamples: number;
  passPct: number;
  dimensions: EvalDimension[];
  triggeredBy: string;
}

// ─── Slice 283+284: Global Operations Center + Exec Dashboard ───
export interface GlobalStatus {
  servicesTotal: number;
  servicesHealthy: number;
  servicesDegraded: number;
  servicesDown: number;
  activeIncidents: number;
  openAlerts: number;
  openAnomalies: number;
  regions: Array<{ region: string; status: "healthy" | "degraded" | "down"; latencyMs: number; trafficPct: number }>;
  trafficRps: number;
  errorRatePct: number;
  p95Ms: number;
  activeUsers: number;
  aiRequestsPerMin: number;
  costToday: number;
  monthlyRunRate: number;
}

export interface ExecKpi {
  id: string;
  label: string;
  value: number;
  unit?: string;
  trend: number;
  target?: number;
  tone: "positive" | "negative" | "neutral";
  updatedAt: string;
}

// ─── Aggregate dashboard ─────────────────────────────────────────
export interface EnterpriseFoundationDashboard {
  connectors: number;
  connectorsHealthy: number;
  dataProducts: number;
  principals: number;
  activePrincipals: number;
  aiAgents: number;
  idps: number;
  monthlyCost: number;
  budgetUsedPct: number;
  anomaliesOpen: number;
  savingsOpportunity: number;
  activeIncidents: number;
  autoHealingPlaybooks: number;
  bcpPlans: number;
  qualityScorecards: number;
  avgQualityScore: number;
  qualityRegressions: number;
  regionsHealthy: number;
  globalRps: number;
  globalP95Ms: number;
}
