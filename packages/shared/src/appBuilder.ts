// Session 96 — Enterprise AI Software Factory & Application Builder.
//
// Implements the core of docs/AI_APPLICATION_BUILDER_SPECIFICATION.md (V3.0):
// app-builder projects, AI-workforce tasks (6 clusters / 17 personas), build
// farm runs with an honest state machine, an immutable version-gated artifact
// registry (real SHA-256 / SBOM / byte size), and the Human Decision Inbox
// approval gate. Types are prefixed `Ab`.
//
// Single source of truth shared by the API service, the HTTP routes and the
// web client.

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────────

export const AB_TARGET_TYPES = ["WEB", "DESKTOP", "MOBILE", "API", "MICROSERVICE", "BROWSER_EXTENSION", "CLI"] as const;
export type AbTargetType = (typeof AB_TARGET_TYPES)[number];

export const AB_BUILD_STATUSES = ["QUEUED", "GENERATING_CODE", "TESTING", "COMPILING", "SIGNING", "SUCCEEDED", "FAILED"] as const;
export type AbBuildStatus = (typeof AB_BUILD_STATUSES)[number];

export const AB_APPROVAL_STATUSES = ["pending", "approved", "denied"] as const;
export type AbApprovalStatus = (typeof AB_APPROVAL_STATUSES)[number];

export const AB_GENERATION_SOURCES = ["manual", "real", "echo-demo"] as const;
export type AbGenerationSource = (typeof AB_GENERATION_SOURCES)[number];

/** The 6 functional workforce clusters + their 17 personas (spec §6). */
export const AB_AGENT_CATALOG: ReadonlyArray<{ group: string; agents: string[] }> = [
  { group: "Product", agents: ["PM", "Business Analyst", "Solution Architect"] },
  { group: "Design", agents: ["UX Researcher", "UI Designer"] },
  { group: "Engineer", agents: ["Frontend Engineer", "Backend Engineer", "Mobile Engineer", "Desktop Engineer", "Database Engineer", "AI Engineer"] },
  { group: "Quality", agents: ["QA Engineer", "Security Engineer"] },
  { group: "Platform", agents: ["DevOps Engineer", "Site Reliability Engineer"] },
  { group: "Delivery", agents: ["Technical Writer", "Release Manager"] },
];

export const AB_GROUPS = AB_AGENT_CATALOG.map((c) => c.group) as readonly string[];
export const AB_AGENTS = AB_AGENT_CATALOG.flatMap((c) => c.agents) as readonly string[];

/** Real pinned versions for the declared dependency SBOM catalog. */
export const AB_SBOM_CATALOG: Record<string, string> = {
  react: "18.3.1",
  express: "4.21.1",
  postgres: "16.4",
  redis: "8.0",
  typescript: "5.6.3",
  node: "20.11",
  python: "3.12",
  nextjs: "14.2.5",
  vite: "5.4.0",
  tailwind: "4.0.0",
  prisma: "5.22.0",
  docker: "27.0",
  kubernetes: "1.31",
};

// ─── Records ────────────────────────────────────────────────────────────

export interface AbProject {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  targetType: AbTargetType;
  techStack: Record<string, string>;
  systemPrompt: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AbTask {
  id: string;
  organizationId: string;
  projectId: string;
  assignedAgent: string;
  group: string;
  title: string;
  description: string | null;
  isCompleted: boolean;
  outputCode: string | null;
  generationSource: AbGenerationSource;
  completedAt: string | null;
  createdAt: string;
}

export interface AbLogEntry {
  at: string;
  step: string;
  actor: string;
  detail: string;
}

export interface AbBuildRun {
  id: string;
  organizationId: string;
  projectId: string;
  version: string;
  status: AbBuildStatus;
  logs: AbLogEntry[];
  errorLog: string[];
  artifactId: string | null;
  requestedBy: string | null;
  startedAt: string | null;
  finalizedAt: string | null;
  createdAt: string;
}

export interface AbSbomEntry {
  name: string;
  version: string;
  declared: boolean;
}

export interface AbArtifact {
  id: string;
  organizationId: string;
  projectId: string;
  runId: string;
  version: string;
  name: string;
  targetType: AbTargetType;
  manifestJson: string;
  sbom: AbSbomEntry[];
  sha256: string;
  sizeBytes: number;
  published: boolean;
  releasedAt: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface AbApproval {
  id: string;
  organizationId: string;
  artifactId: string;
  projectId: string;
  runId: string;
  status: AbApprovalStatus;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface AbRollup {
  counts: {
    projects: number;
    tasks: number;
    tasksCompleted: number;
    runs: number;
    runsByStatus: Record<AbBuildStatus, number>;
    artifacts: number;
    releasedArtifacts: number;
    pendingApprovals: number;
  };
  avgBuildTimeMs: number | null;
  recentProjects: AbProject[];
  recentRuns: AbBuildRun[];
  latestArtifacts: AbArtifact[];
  lastUpdatedAt: string | null;
}

// ─── Input schemas (validated at the API boundary) ──────────────────────

export const AbProjectUpsertSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().max(2000).nullable().optional(),
  targetType: z.enum(AB_TARGET_TYPES).default("WEB"),
  techStack: z.record(z.string().min(1), z.string().min(1)).default({}),
  systemPrompt: z.string().trim().min(1).max(20_000),
});
export type AbProjectUpsertInput = z.infer<typeof AbProjectUpsertSchema>;
export type AbProjectCreateInput = z.input<typeof AbProjectUpsertSchema>;

export const AbTaskUpsertSchema = z.object({
  assignedAgent: z.enum(AB_AGENTS as unknown as [string, ...string[]]),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  isCompleted: z.boolean().default(false),
  outputCode: z.string().max(50_000).nullable().optional(),
});
export type AbTaskUpsertInput = z.infer<typeof AbTaskUpsertSchema>;
export type AbTaskCreateInput = z.input<typeof AbTaskUpsertSchema>;

export const AbBuildCreateSchema = z.object({
  version: z.string().trim().regex(/^v\d+\.\d+\.\d+$/).default("v1.0.0"),
});
export type AbBuildCreateInput = z.infer<typeof AbBuildCreateSchema>;
export type AbBuildCreateRequest = z.input<typeof AbBuildCreateSchema>;

export const AbDecideSchema = z.object({
  approved: z.boolean(),
  decidedBy: z.string().trim().min(1).max(120),
  note: z.string().max(500).nullable().optional(),
});
export type AbDecideInput = z.infer<typeof AbDecideSchema>;
