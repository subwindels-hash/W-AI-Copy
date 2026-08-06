/**
 * Session 124 — AI Software Engineering Workforce.
 *
 * A complete autonomous engineering department inside Windels AI OS: 18
 * specialized AI engineers plus an orchestrator, coordinated across
 * multi-repository workspaces, with GitHub as one (pluggable) capability,
 * repository intelligence, a central engineering memory and a command
 * center.
 *
 * Honesty rules encoded here:
 *   - every generated artefact (plans, patches, summaries) carries
 *     `aiGenerated` or `basis: "heuristic"` — nothing is presented as
 *     measured unless it is;
 *   - GitHub connections store their token only inside the org-scoped
 *     store; every read returns `tokenMasked`, never the token;
 *   - repository intelligence nodes state their basis (`observed` from real
 *     scanning vs `heuristic` from pattern matching) and their
 *     `confidence`;
 *   - a command-center metric with no backing data is `null`, never 0.
 */

import { z } from "zod";

/* ── The workforce ──────────────────────────────────────────────────────── */

export const AI_ENGINEERING_ROLES = [
  { id: "product_manager",   title: "AI Product Manager",     category: "product",       focus: "requirements, priorities, acceptance criteria" },
  { id: "business_analyst",  title: "AI Business Analyst",    category: "product",       focus: "process mapping, data flows, stakeholder needs" },
  { id: "solution_architect",title: "AI Solution Architect",  category: "architecture",  focus: "end-to-end solution design, integration, trade-offs" },
  { id: "system_architect",  title: "AI System Architect",    category: "architecture",  focus: "system topology, scalability, resilience" },
  { id: "backend_engineer",  title: "AI Backend Engineer",    category: "backend",       focus: "services, business logic, APIs" },
  { id: "frontend_engineer", title: "AI Frontend Engineer",   category: "frontend",      focus: "pages, components, state, UX flows" },
  { id: "mobile_engineer",   title: "AI Mobile Engineer",     category: "mobile",        focus: "mobile apps, offline sync, device APIs" },
  { id: "database_engineer", title: "AI Database Engineer",   category: "data",          focus: "schemas, migrations, indexes, queries" },
  { id: "api_engineer",      title: "AI API Engineer",        category: "api",           focus: "contracts, versioning, gateway, SDKs" },
  { id: "ui_ux_designer",    title: "AI UI/UX Designer",      category: "design",        focus: "design system, accessibility, usability" },
  { id: "devops_engineer",   title: "AI DevOps Engineer",     category: "devops",        focus: "CI/CD, infrastructure as code, environments" },
  { id: "security_engineer", title: "AI Security Engineer",   category: "security",      focus: "threats, authz, secrets, hardening" },
  { id: "qa_engineer",       title: "AI QA & Test Engineer",  category: "qa",            focus: "unit/integration/e2e tests, coverage" },
  { id: "performance_engineer", title: "AI Performance Engineer", category: "perf",      focus: "latency, throughput, bottlenecks" },
  { id: "code_reviewer",     title: "AI Code Reviewer",        category: "review",        focus: "correctness, style, standards, risks" },
  { id: "docs_engineer",     title: "AI Documentation Engineer", category: "docs",       focus: "READMEs, guides, API docs, changelogs" },
  { id: "deployment_engineer", title: "AI Deployment Engineer", category: "deploy",      focus: "releases, rollouts, rollbacks" },
  { id: "monitoring_engineer", title: "AI Monitoring Engineer", category: "monitor",     focus: "health, alerts, SLOs, incident response" },
  { id: "orchestrator",      title: "AI Orchestrator",         category: "orchestration", focus: "planning, coordination, pipeline, reporting" },
] as const;

export type AiEngineeringRoleId = (typeof AI_ENGINEERING_ROLES)[number]["id"];
export const AI_ENGINEERING_ROLE_IDS = AI_ENGINEERING_ROLES.map((r) => r.id);
export const AI_ENGINEERING_SPECIALIST_ROLES = AI_ENGINEERING_ROLE_IDS.filter((id) => id !== "orchestrator");

export interface AiEngineeringRole {
  id: AiEngineeringRoleId;
  title: string;
  category: string;
  focus: string;
}

/* ── GitHub connections ─────────────────────────────────────────────────── */

export const AI_ENGINEERING_PROVIDERS = ["github"] as const;
export type AiEngineeringProvider = (typeof AI_ENGINEERING_PROVIDERS)[number];

export interface AiEngineeringConnection {
  id: string;
  provider: AiEngineeringProvider;
  /** Human label, e.g. "Acme Engineering org". */
  accountLabel: string;
  /** GitHub orgs/accounts the token can see, or [] when unverified. */
  organizations: string[];
  /** The first ~10 characters of the token — the full token never leaves
   *  the org-scoped store and is never returned by any read. */
  tokenMasked: string;
  status: "connected" | "unverified" | "failed";
  addedBy: string;
  createdAt: string;
  updatedAt: string;
}

/* ── Repositories (multi-repo workspace) ────────────────────────────────── */

export const AI_ENGINEERING_REPO_STATUSES = [
  "not_connected", "connected", "scanning", "ready", "error",
] as const;
export type AiEngineeringRepoStatus = (typeof AI_ENGINEERING_REPO_STATUSES)[number];

export interface AiEngineeringRepo {
  id: string;
  provider: AiEngineeringProvider;
  connectionId: string | null;
  /** Full name as the provider knows it: "owner/repo". */
  name: string;
  url: string | null;
  /** Local clone path, when the repo is scanned locally. */
  localPath: string | null;
  defaultBranch: string | null;
  status: AiEngineeringRepoStatus;
  /** Per-repo engineering team: role id → engineer assignment id. */
  team: Record<string, string>;
  /** Last intelligence scan summary (node counts per kind). */
  intelSummary: Record<string, number> | null;
  lastScanAt: string | null;
  lastError: string | null;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
}

/* ── Tasks & the autonomous pipeline ────────────────────────────────────── */

export const AI_ENGINEERING_TASK_STATUSES = [
  "queued", "planning", "implementing", "testing", "reviewing", "fixing",
  "pr_ready", "pr_open", "done", "failed", "blocked",
] as const;
export type AiEngineeringTaskStatus = (typeof AI_ENGINEERING_TASK_STATUSES)[number];

export interface AiEngineeringTaskStep {
  role: AiEngineeringRoleId;
  action: string;
  /** "advisory" = plan/heuristic output; "executed" = real command/result. */
  mode: "advisory" | "executed";
  /** True when an AI provider produced the content (vs a deterministic
   *  template). */
  aiGenerated: boolean;
  output: string;
  at: string;
}

export interface AiEngineeringTask {
  id: string;
  repoId: string;
  repoName: string;
  title: string;
  description: string;
  /** The engineer role driving the task (orchestrator delegates). */
  leadRole: AiEngineeringRoleId;
  status: AiEngineeringTaskStatus;
  /** What the orchestrator produced in the planning phase. */
  plan: { summary: string; steps: string[]; aiGenerated: boolean } | null;
  steps: AiEngineeringTaskStep[];
  /** Result of the testing phase. */
  testResult: { executed: boolean; passed: number; failed: number; detail: string } | null;
  /** Pull request opened for the task, when any. */
  pr: { number: number; url: string; state: string } | null;
  /** Failure/blocker reason. */
  error: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/* ── GitHub entities (issues, PRs, milestones, releases, actions) ───────── */

export interface AiEngineeringPullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
  headBranch: string;
  baseBranch: string;
  author: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiEngineeringIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AiEngineeringMilestone {
  number: number;
  title: string;
  state: string;
  dueOn: string | null;
  openIssues: number;
  closedIssues: number;
  url: string;
}

export interface AiEngineeringRelease {
  id: number;
  tagName: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  publishedAt: string | null;
  url: string;
}

export interface AiEngineeringWorkflowRun {
  id: number;
  name: string | null;
  status: string;
  conclusion: string | null;
  headBranch: string;
  createdAt: string;
  url: string;
}

export interface AiEngineeringCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
}

/* ── Repository intelligence (knowledge graph) ──────────────────────────── */

export const AI_ENGINEERING_INTEL_KINDS = [
  "structure", "architecture", "backend", "frontend", "mobile", "database", "api",
  "auth", "dependency", "business_logic", "service", "controller", "model",
  "component", "workflow", "documentation", "tech_debt", "duplicate",
  "dead_code", "security", "performance", "test", "devops", "deployment", "monitoring",
] as const;
export type AiEngineeringIntelKind = (typeof AI_ENGINEERING_INTEL_KINDS)[number];

export interface AiEngineeringIntelNode {
  id: string;
  repoId: string;
  kind: AiEngineeringIntelKind;
  label: string;
  detail: string;
  /** "observed" = read directly from the repository; "heuristic" = inferred
   *  by pattern matching and may be wrong. */
  basis: "observed" | "heuristic";
  confidence: "high" | "medium" | "low";
  meta: Record<string, string | number | boolean>;
  detectedAt: string;
}

/* ── Engineering memory ─────────────────────────────────────────────────── */

export const AI_ENGINEERING_MEMORY_KINDS = [
  "decision", "standard", "pattern", "instruction", "lesson", "bugfix",
] as const;
export type AiEngineeringMemoryKind = (typeof AI_ENGINEERING_MEMORY_KINDS)[number];

export interface AiEngineeringMemoryEntry {
  id: string;
  kind: AiEngineeringMemoryKind;
  /** "org" = shared across all repositories; "repo" = scoped to repoId. */
  scope: "org" | "repo";
  repoId: string | null;
  title: string;
  body: string;
  tags: string[];
  /** Where the knowledge came from — never invented. */
  source: "user" | "orchestrator" | "review" | "task";
  author: string;
  createdAt: string;
}

/* ── Command center ─────────────────────────────────────────────────────── */

export interface AiEngineeringCommandCenter {
  generatedAt: string;
  repositories: { connected: number; total: number; scanning: number };
  engineers: { total: number; active: number; byRole: Record<string, number> };
  tasks: Record<string, number>;
  pullRequests: { open: number; merged: number };
  issues: { open: number };
  builds: { runs: number; failed: number };
  coverage: { reposScanned: number; avgCoveragePct: number | null };
  securityAlerts: number;
  performanceFlags: number;
  deployments: { total: number; last: string | null };
  releases: { total: number; latest: string | null };
  memory: { entries: number; byKind: Record<string, number> };
  productionHealth: "healthy" | "degraded" | "unknown";
  recentActivity: Array<{ at: string; kind: string; label: string }>;
  note: string;
}

/* ── Zod schemas ────────────────────────────────────────────────────────── */

export const AewConnectSchema = z.object({
  provider: z.enum(AI_ENGINEERING_PROVIDERS),
  accountLabel: z.string().trim().min(1).max(80),
  token: z.string().trim().min(8).max(500),
});
export type AewConnectInput = z.infer<typeof AewConnectSchema>;

export const AewAddRepoSchema = z.object({
  connectionId: z.string().min(1).max(64).optional(),
  /** Provider full name ("owner/repo") or a local directory path. */
  name: z.string().trim().min(1).max(200),
  localPath: z.string().trim().max(500).optional(),
  defaultBranch: z.string().trim().max(100).optional(),
});
export type AewAddRepoInput = z.infer<typeof AewAddRepoSchema>;

export const AewTeamUpdateSchema = z.object({
  /** role id → engineer assignment id ("" removes). */
  assignments: z.record(z.string().max(64)).optional(),
});
export type AewTeamUpdateInput = z.infer<typeof AewTeamUpdateSchema>;

export const AewTaskCreateSchema = z.object({
  repoId: z.string().min(1).max(64),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(5000),
  leadRole: z.enum(AI_ENGINEERING_ROLE_IDS as unknown as [string, ...string[]]).optional(),
});
export type AewTaskCreateInput = z.infer<typeof AewTaskCreateSchema>;

export const AewMemoryCreateSchema = z.object({
  kind: z.enum(AI_ENGINEERING_MEMORY_KINDS),
  scope: z.enum(["org", "repo"]).default("org"),
  repoId: z.string().min(1).max(64).optional(),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(10000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type AewMemoryCreateInput = z.infer<typeof AewMemoryCreateSchema>;

export const AewMemoryQuerySchema = z.object({
  kind: z.enum(AI_ENGINEERING_MEMORY_KINDS).optional(),
  repoId: z.string().min(1).max(64).optional(),
  tag: z.string().trim().max(40).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const AewIntelQuerySchema = z.object({
  repoId: z.string().min(1).max(64).optional(),
  kind: z.enum(AI_ENGINEERING_INTEL_KINDS).optional(),
  basis: z.enum(["observed", "heuristic"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const AewListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  status: z.string().max(40).optional(),
});
