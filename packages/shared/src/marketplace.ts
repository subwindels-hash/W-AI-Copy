/**
 * Shared types — Enterprise Marketplace, Digital Twin & Simulation (Phase 33 / Session 34)
 *
 * Slices covered:
 *   291 — Enterprise AI Skills Marketplace (installable reusable skills)
 *   292 — Enterprise Digital Twin Platform (org/building/factory/supply-chain/city twins)
 *   293 — Enterprise Simulation & Scenario Engine (what-if analysis)
 *   294 — Enterprise AI Application Store (apps/plugins/templates/connectors)
 */

// ---------------------------------------------------------------------------
// Slice 291 — AI Skills Marketplace
// ---------------------------------------------------------------------------

export type MkSkillCategory =
  | "spreadsheet"
  | "contract-review"
  | "tax"
  | "engineering-calc"
  | "cad"
  | "procurement"
  | "financial-modeling"
  | "healthcare-coding"
  | "erp-crm"
  | "industry"
  | "custom";

export type MkSkillStatus = "draft" | "published" | "deprecated" | "disabled";
export type MkInstallStatus = "not-installed" | "installing" | "installed" | "failed" | "updating";
export type MkAssignmentScope = "workforce" | "role" | "user" | "department";

export interface MarketplaceSkill {
  id: string;
  slug: string;
  name: string;
  publisher: string;
  category: MkSkillCategory;
  version: string;
  summary: string;
  description: string;
  tags: string[];
  priceModel: "free" | "subscription" | "one-time" | "usage";
  priceUsd?: number;
  rating: number; // 0..5
  installs: number;
  status: MkSkillStatus;
  requiredCapabilities: string[];
  requiredPermissions: string[];
  documentationUrl?: string;
  repositoryUrl?: string;
  iconColor: string;
  iconEmoji?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillInstallation {
  id: string;
  skillId: string;
  orgId: string;
  installedBy: string;
  installedVersion: string;
  status: MkInstallStatus;
  configuration: Record<string, any>;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
}

export interface SkillAssignment {
  id: string;
  installationId: string;
  scope: MkAssignmentScope;
  targetId: string;
  targetName: string;
  assignedBy: string;
  assignedAt: string;
  policyBindingId?: string;
}

// ---------------------------------------------------------------------------
// Slice 292 — Enterprise Digital Twin Platform
// ---------------------------------------------------------------------------

export type TwinKind =
  | "organization"
  | "building"
  | "construction-project"
  | "factory"
  | "warehouse"
  | "supply-chain"
  | "utility-network"
  | "transportation"
  | "city"
  | "business-process"
  | "operational-workflow";

export type TwinStatus = "design" | "provisioning" | "live" | "paused" | "archived";
export type MkEntityKind = "asset" | "node" | "sensor" | "person" | "vehicle" | "process" | "zone" | "material";

export interface TwinEntity {
  id: string;
  twinId: string;
  externalId?: string;
  name: string;
  kind: MkEntityKind;
  metadata: Record<string, any>;
  tags: string[];
  position?: { x: number; y: number; z?: number };
  parentEntityId?: string;
  liveTelemetry: { sensorId: string; metric: string; value: number; unit: string; updatedAt: string }[];
  status: "ok" | "warning" | "alert" | "offline";
  lastUpdate: string;
}

export interface TwinTelemetry {
  id: string;
  twinId: string;
  entityId: string;
  metric: string;
  value: number;
  unit: string;
  source: string;
  recordedAt: string;
}

export interface DigitalTwin {
  id: string;
  name: string;
  kind: TwinKind;
  description: string;
  status: TwinStatus;
  owner: string;
  location?: string;
  entitiesCount: number;
  sensorsLive: number;
  alertsCount: number;
  uptimePct: number;
  tags: string[];
  iconColor: string;
  createdAt: string;
  lastSyncAt: string;
}

// ---------------------------------------------------------------------------
// Slice 293 — Simulation & Scenario Engine
// ---------------------------------------------------------------------------

export type ScenarioKind =
  | "revenue-forecast"
  | "budget-workforce"
  | "hiring-plan"
  | "resource-allocation"
  | "project-scheduling"
  | "supply-disruption"
  | "bcp"
  | "dr"
  | "cyber-ir"
  | "market-scenario"
  | "investment-analysis"
  | "operational-optimization";

export type ScenarioStatus = "draft" | "queued" | "running" | "completed" | "failed" | "archived";

export interface KpiImpact {
  metric: string;
  unit: string;
  baseline: number;
  simulated: number;
  deltaAbs: number;
  deltaPct: number;
  sentiment: "positive" | "neutral" | "negative";
}

export interface ScenarioAssumption {
  id: string;
  label: string;
  value: number | string | boolean;
  unit?: string;
}

export interface SimulationRun {
  id: string;
  scenarioId: string;
  startedAt: string;
  completedAt?: string;
  startedBy: string;
  status: ScenarioStatus;
  iterations: number;
  horizonDays: number;
  confidence: number;
  kpiImpacts: KpiImpact[];
  narrative: string;
  recommendedActions: string[];
  riskFlags: string[];
  feedsSuperintelligence: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  kind: ScenarioKind;
  description: string;
  owner: string;
  status: ScenarioStatus;
  assumptions: ScenarioAssumption[];
  twinId?: string;
  tags: string[];
  runsCount: number;
  lastRunAt?: string;
  lastRunConfidence?: number;
  iconColor: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Slice 294 — Enterprise AI Application Store
// ---------------------------------------------------------------------------

export type AppKind = "app" | "plugin" | "skill-pack" | "workflow-template" | "business-template" | "industry-extension" | "connector" | "integration-pack" | "automation-pack";
export type AppStatus = "draft" | "pending-review" | "published" | "suspended";

export interface AppVersion {
  id: string;
  appId: string;
  version: string;
  changelog: string;
  publishedAt: string;
  minOsVersion: string;
  packageUrl?: string;
  sizeKb: number;
}

export interface AiApplication {
  id: string;
  slug: string;
  name: string;
  publisher: string;
  kind: AppKind;
  category: string;
  shortDescription: string;
  fullDescription: string;
  latestVersion: string;
  status: AppStatus;
  priceModel: "free" | "paid" | "trial";
  priceUsd?: number;
  rating: number;
  installs: number;
  permissions: string[];
  dependencies: string[];
  tags: string[];
  iconColor: string;
  iconEmoji?: string;
  governanceApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppInstall {
  id: string;
  appId: string;
  orgId: string;
  installedBy: string;
  installedVersion: string;
  status: MkInstallStatus;
  autoUpdate: boolean;
  installedAt: string;
  lastUpdatedAt: string;
}

// ---------------------------------------------------------------------------
// Dashboard rollup
// ---------------------------------------------------------------------------

export interface MarketplaceDashboard {
  // Skills
  skillsAvailable: number;
  skillsInstalled: number;
  skillsAssigned: number;
  skillsPendingReview: number;
  // Twins
  twins: number;
  twinsLive: number;
  twinEntities: number;
  twinSensorsLive: number;
  twinAlerts: number;
  // Simulation
  scenarios: number;
  simulationsRun24h: number;
  simulationsRunning: number;
  simulationsFeedingSuperInt: number;
  // Apps
  appsAvailable: number;
  appsInstalled: number;
  appsPendingApproval: number;
  appUpdatesAvailable: number;
}
