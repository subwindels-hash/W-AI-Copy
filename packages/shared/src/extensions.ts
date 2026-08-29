/**
 * Session 28 — Phase 27: Extension Platform types (Slices 236–244).
 * Covers Extension Registry, Business/Industry modules, AI Skills,
 * Custom AI Agents, Workflow/Dashboard/UI-component extensions, and
 * the extension lifecycle (dev→validation→security→test→approval→deploy→version→retire).
 */

// ─── Slice 236 + 244: Extension Registry + Lifecycle ──────────────
export type ExtensionKind =
  | "business" | "industry" | "skill" | "agent"
  | "workflow" | "dashboard" | "ui-component";

export type ExtensionStatus =
  | "draft" | "submitted" | "validating" | "security_review"
  | "testing" | "approved" | "published" | "installed"
  | "enabled" | "disabled" | "deprecated" | "retired" | "rejected";

export type LifecycleStage =
  | "dev" | "validation" | "security_review" | "test"
  | "approval" | "deploy" | "version" | "retire";

export interface ExtensionVersion {
  version: string;
  releasedAt: string;
  changelog: string;
  minPlatformVersion: string;
  status: ExtensionStatus;
  downloads: number;
}

export interface ExtensionReview {
  id: string;
  author: string;
  rating: number; // 1-5
  comment: string;
  createdAt: string;
  verified: boolean;
}

export interface Extension {
  id: string;
  slug: string;
  name: string;
  kind: ExtensionKind;
  author: string;
  description: string;
  tagline: string;
  version: string;
  status: ExtensionStatus;
  lifecycleStage: LifecycleStage;
  visibility: "public" | "enterprise" | "private";
  category: string;
  tags: string[];
  icon: string; // emoji mark
  color: "azure"|"violet"|"teal"|"fuchsia"|"amber"|"emerald"|"crimson"|"slate";
  license: "MIT"|"Apache-2.0"|"Proprietary"|"Enterprise";
  minPlatformVersion: string;
  repoUrl?: string;
  docsUrl?: string;
  installCount: number;
  stars: number;
  ratingAvg: number;
  reviewCount: number;
  sizeKb: number;
  permissions: string[];
  versions: ExtensionVersion[];
  reviews: ExtensionReview[];
  certified: "community"|"enterprise"|"security"|"compliance"|"official";
  sliceNumber: number;
  installed?: boolean;
  enabled?: boolean;
  installedVersion?: string;
  installedAt?: string;
  updatedAt: string;
}

// ─── Slice 237: Business Modules ──────────────────────────────────
export type BusinessModuleCategory =
  | "crm" | "erp" | "hr" | "finance" | "billing"
  | "marketing" | "sales" | "support" | "procurement" | "legal";

export interface BusinessModule {
  id: string;
  slug: string;
  name: string;
  category: BusinessModuleCategory;
  description: string;
  features: string[];
  integrations: string[];
  entities: number;
  workflows: number;
  dashboards: number;
  users: number;
  extensionId: string;
  version: string;
  status: ExtensionStatus;
  updatedAt: string;
}

// ─── Slice 238: Industry Modules ──────────────────────────────────
export type IndustryVertical =
  | "government" | "healthcare" | "banking" | "insurance"
  | "construction" | "manufacturing" | "mining" | "oil-gas"
  | "energy" | "agriculture" | "education" | "retail"
  | "telecom" | "aviation" | "maritime" | "logistics"
  | "hospitality" | "legal-services" | "real-estate" | "pharma"
  | "media" | "nonprofit" | "defense";

export interface IndustryModule {
  id: string;
  slug: string;
  name: string;
  vertical: IndustryVertical;
  region: string;
  description: string;
  compliancePacks: string[];
  aiEmployees: number;
  workflows: number;
  dashboards: number;
  regulations: number;
  extensionId: string;
  version: string;
  status: ExtensionStatus;
  updatedAt: string;
}

// ─── Slice 239: AI Skills ─────────────────────────────────────────
export type SkillCategory =
  | "spreadsheet" | "contract-review" | "tax" | "engineering"
  | "cad" | "procurement" | "financial-modeling" | "healthcare-coding"
  | "erp" | "crm" | "marketing" | "research" | "legal"
  | "data-analysis" | "writing" | "translation" | "custom";

export interface AISkill {
  id: string;
  slug: string;
  name: string;
  category: SkillCategory;
  description: string;
  inputs: string[];
  outputs: string[];
  modelRequirements: string[];
  avgLatencyMs: number;
  accuracyPct: number;
  uses: number;
  assignableWorkforces: string[];
  extensionId: string;
  version: string;
  status: ExtensionStatus;
  updatedAt: string;
}

// ─── Slice 240: Custom AI Agents ──────────────────────────────────
export type AgentDepartment =
  | "executive" | "engineering" | "marketing" | "sales" | "support"
  | "finance" | "legal" | "hr" | "research" | "operations" | "custom";

export interface CustomAgentDef {
  id: string;
  slug: string;
  name: string;
  department: AgentDepartment;
  role: string;
  description: string;
  systemPrompt: string;
  model: string;
  skills: string[];
  tools: string[];
  memoryKb: boolean;
  voiceEnabled: boolean;
  color: string;
  tasksCompleted: number;
  avgTaskTimeMin: number;
  rating: number;
  extensionId: string;
  version: string;
  status: ExtensionStatus;
  updatedAt: string;
}

// ─── Slice 241: Workflow Extensions ───────────────────────────────
export type WorkflowExtCategory =
  | "trigger" | "action" | "condition" | "connector" | "transform"
  | "approval" | "notification" | "scheduling" | "ai-node";

export interface WorkflowExt {
  id: string;
  slug: string;
  name: string;
  category: WorkflowExtCategory;
  description: string;
  inputs: { name: string; type: string }[];
  outputs: { name: string; type: string }[];
  integrations: string[];
  invocations: number;
  avgDurationMs: number;
  errorRatePct: number;
  extensionId: string;
  version: string;
  status: ExtensionStatus;
  updatedAt: string;
}

// ─── Slice 242: Dashboard Extensions ──────────────────────────────
export type DashboardWidgetKind =
  | "kpi" | "chart" | "table" | "feed" | "map" | "timeline"
  | "gauge" | "heatmap" | "funnel" | "ai-insight";

export interface DashboardExt {
  id: string;
  slug: string;
  name: string;
  description: string;
  widgets: DashboardWidgetKind[];
  dataSources: string[];
  refreshRateSec: number;
  installations: number;
  author: string;
  roles: string[];
  extensionId: string;
  version: string;
  status: ExtensionStatus;
  updatedAt: string;
}

// ─── Slice 243: UI Component Extensions ───────────────────────────
export type UIComponentCategory =
  | "input" | "display" | "feedback" | "navigation" | "data-viz"
  | "media" | "layout" | "ai-primitives" | "form" | "chart";

export interface UIComponentExt {
  id: string;
  slug: string;
  name: string;
  category: UIComponentCategory;
  description: string;
  framework: "react" | "vue" | "svelte" | "web-component";
  a11y: boolean;
  darkMode: boolean;
  responsive: boolean;
  bundleKb: number;
  props: number;
  variants: number;
  downloads: number;
  extensionId: string;
  version: string;
  status: ExtensionStatus;
  updatedAt: string;
}

// ─── Aggregate dashboard ──────────────────────────────────────────
export interface ExtensionsDashboard {
  totalExtensions: number;
  installedCount: number;
  enabledCount: number;
  byKind: Record<ExtensionKind, number>;
  byStatus: Record<string, number>;
  avgRating: number;
  pendingReviews: number;
  businessModules: number;
  industryModules: number;
  skills: number;
  agents: number;
  workflowExts: number;
  dashboardExts: number;
  uiComponents: number;
  certifiedCount: number;
  recentInstalls: Array<{ id: string; name: string; kind: ExtensionKind; installedAt: string }>;
}

export interface LifecycleTransition {
  from: ExtensionStatus;
  to: ExtensionStatus;
  at: string;
  actor: string;
  note?: string;
}
