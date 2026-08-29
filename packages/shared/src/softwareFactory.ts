// Session 99 — Software Factory: Five Studios & Build Farm Compilation
// Targets. Implements AI_APPLICATION_BUILDER_SPECIFICATION.md V3.0 §3–§4:
// the five enterprise studios + per-project studio plans, and the build
// farm's compilation targets as a pure, honest projection of a run's real
// state. Types are prefixed `Sf`.
//
// Single source of truth shared by the API service, the HTTP routes and the
// web client.

import { z } from "zod";

// ─── The Five Studios (spec §3 — real static catalog) ───────────────────

export const SF_STUDIO_KEYS = ["product", "engineering", "quality", "devops", "operations"] as const;
export type SfStudioKey = (typeof SF_STUDIO_KEYS)[number];

export interface SfStudio {
  key: SfStudioKey;
  name: string;
  purpose: string;
  deliverables: string[];
}

export const SF_STUDIOS: ReadonlyArray<SfStudio> = [
  {
    key: "product",
    name: "AI Product Studio",
    purpose: "Transforms business ideas into implementation-ready specifications.",
    deliverables: ["Business Requirements", "PRDs", "User Stories", "Acceptance Criteria", "Architecture Decisions", "Product Roadmaps", "Milestones", "Cost Estimates", "Risk Assessments"],
  },
  {
    key: "engineering",
    name: "AI Engineering Studio",
    purpose: "Produces production-ready software structures.",
    deliverables: ["Web Applications", "Desktop Applications", "Mobile Applications", "APIs", "Microservices", "AI Agents", "SDKs", "Browser Extensions", "CLI Tools", "Enterprise Integrations"],
  },
  {
    key: "quality",
    name: "AI Quality Studio",
    purpose: "Continuously improves software quality.",
    deliverables: ["Unit Testing", "Integration Testing", "E2E Testing", "Load Testing", "Accessibility Reviews", "Security Audits", "Static Analysis", "Regression Testing", "Performance Benchmarking"],
  },
  {
    key: "devops",
    name: "AI DevOps Studio",
    purpose: "Builds, registers, and releases software.",
    deliverables: ["Docker Image Generation", "Kubernetes Manifests", "CI/CD Pipelines", "Infrastructure as Code", "Artifact Registries", "Secret Management", "Release Automation", "Deployment Pipelines"],
  },
  {
    key: "operations",
    name: "AI Operations Studio",
    purpose: "Operates and monitors production installations.",
    deliverables: ["Monitoring & Metrics", "Alerting Rules", "Incident Management", "Feature Flags", "Cost Optimization", "Capacity Planning", "Production Analytics", "Continuous Optimization"],
  },
];

export const SF_STUDIO_BY_KEY = Object.fromEntries(SF_STUDIOS.map((s) => [s.key, s])) as Record<SfStudioKey, SfStudio>;

export const SF_STUDIO_DELIVERABLES = Object.fromEntries(
  SF_STUDIOS.map((s) => [s.key, s.deliverables])
) as unknown as Record<SfStudioKey, readonly string[]>;

// ─── Build farm targets (spec §4 — deterministic mapping) ───────────────

export interface SfTargetDef {
  platform: string;
  format: string;
  extension: string;
  requiresToolchain: string;
}

/** targetType → real declared compilation targets. */
export const SF_TARGET_MAP: Record<string, readonly SfTargetDef[]> = {
  WEB: [
    { platform: "web", format: "static-bundle", extension: "zip", requiresToolchain: "static web bundler (node/vite)" },
  ],
  DESKTOP: [
    { platform: "windows", format: "installer", extension: "exe", requiresToolchain: "windows-msi toolchain (external build farm host)" },
    { platform: "windows", format: "msix", extension: "msix", requiresToolchain: "windows-appx toolchain (external build farm host)" },
    { platform: "macos", format: "app", extension: "app", requiresToolchain: "macos-xcode toolchain (external build farm host)" },
    { platform: "macos", format: "dmg", extension: "dmg", requiresToolchain: "macos-xcode toolchain (external build farm host)" },
    { platform: "linux", format: "deb", extension: "deb", requiresToolchain: "linux-deb toolchain (external build farm host)" },
    { platform: "linux", format: "rpm", extension: "rpm", requiresToolchain: "linux-rpm toolchain (external build farm host)" },
    { platform: "linux", format: "appimage", extension: "AppImage", requiresToolchain: "linux-appimage toolchain (external build farm host)" },
  ],
  MOBILE: [
    { platform: "android", format: "apk", extension: "apk", requiresToolchain: "android-gradle toolchain (external build farm host)" },
    { platform: "android", format: "aab", extension: "aab", requiresToolchain: "android-gradle toolchain (external build farm host)" },
    { platform: "ios", format: "ipa", extension: "ipa", requiresToolchain: "ios-xcode toolchain (external build farm host)" },
  ],
  API: [
    { platform: "container", format: "docker-image", extension: "tar", requiresToolchain: "docker build host" },
  ],
  MICROSERVICE: [
    { platform: "container", format: "docker-image", extension: "tar", requiresToolchain: "docker build host" },
  ],
  BROWSER_EXTENSION: [
    { platform: "web", format: "extension", extension: "crx", requiresToolchain: "chrome-extension packager" },
    { platform: "web", format: "extension-src", extension: "zip", requiresToolchain: "static web bundler (node/vite)" },
  ],
  CLI: [
    { platform: "linux-amd64", format: "binary", extension: "bin", requiresToolchain: "linux-amd64 compile host" },
    { platform: "darwin-arm64", format: "binary", extension: "bin", requiresToolchain: "macos-arm64 compile host" },
    { platform: "win32-x64", format: "binary", extension: "exe", requiresToolchain: "windows-x64 compile host" },
  ],
};

export const SF_TARGET_STATUSES = ["pending", "compiling", "built", "failed"] as const;
export type SfTargetStatus = (typeof SF_TARGET_STATUSES)[number];

// ─── Records ────────────────────────────────────────────────────────────

export interface SfStudioPlan {
  id: string;
  organizationId: string;
  projectId: string;
  studio: SfStudioKey;
  deliverables: string[];
  status: "planned" | "in_progress" | "completed";
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SfCompileTarget {
  id: string;
  runId: string;
  projectId: string;
  platform: string;
  format: string;
  extension: string;
  fileName: string;
  manifestJson: string;
  sha256: string;
  status: SfTargetStatus;
  /** Always false — emitting a real binary requires the external build farm. */
  binaryEmitted: false;
  requiresToolchain: string;
}

export interface SfStudioCoverageRow {
  studio: SfStudioKey;
  name: string;
  plans: number;
  completed: number;
  deliverables: string[];
}

export interface SfStudioCoverage {
  projectId: string;
  plans: number;
  completedPlans: number;
  coverage: SfStudioCoverageRow[];
  allStudiosCovered: boolean;
  totalDeliverables: number;
  completedDeliverables: number;
}

export interface SfRollup {
  counts: {
    plans: number;
    plansByStatus: Record<"planned" | "in_progress" | "completed", number>;
    runsWithTargets: number;
    targetsByStatus: Record<SfTargetStatus, number>;
  };
  studiosCovered: number;
  recentPlans: SfStudioPlan[];
  lastUpdatedAt: string | null;
}

// ─── Input schemas (validated at the API boundary) ──────────────────────

export const SfStudioPlanUpsertSchema = z.object({
  projectId: z.string().trim().min(1).max(64),
  studio: z.enum(SF_STUDIO_KEYS),
  deliverables: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  status: z.enum(["planned", "in_progress", "completed"]).default("planned"),
  notes: z.string().max(2000).nullable().optional(),
});
export type SfStudioPlanUpsertInput = z.infer<typeof SfStudioPlanUpsertSchema>;
export type SfStudioPlanCreateInput = z.input<typeof SfStudioPlanUpsertSchema>;
