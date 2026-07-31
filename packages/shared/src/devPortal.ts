/**
 * Session 27 — Enterprise Developer Platform / Dev Portal types
 * (Phase 26, Slices 216–235).
 */

// ─── Slice 216-229: SDK Registry ──────────────────────────────
export type SDKCategory =
  | "agent" | "plugin" | "workflow" | "marketplace"
  | "knowledge" | "memory" | "automation" | "dashboard"
  | "web" | "mobile" | "desktop" | "voice" | "api";
export type SDKStatus = "ga" | "beta" | "preview" | "deprecated";
export type SDKLanguage = "typescript" | "python" | "go" | "rust" | "java" | "kotlin" | "swift" | "dart" | "cli" | "curl";

export interface SDKPackage {
  id: string;
  slug: string;
  name: string;
  category: SDKCategory;
  version: string;
  status: SDKStatus;
  language: SDKLanguage;
  installSnippet: string;
  docsUrl: string;
  description: string;
  weeklyDownloads: number;
  stars: number;
  bundleSizeKb?: number;
  minPlatformVersion?: string;
  repoUrl?: string;
  exampleSnippet?: string;
  features: string[];
  sliceNumber: number;
  maintainer: string;
  updatedAt: string;
}

// ─── Slice 230: CLI ───────────────────────────────────────────
export type CLICommandGroup = "auth" | "app" | "agent" | "workflow" | "deploy" | "env" | "plugin" | "dev" | "db" | "help";

export interface CLICommand {
  id: string;
  name: string;
  group: CLICommandGroup;
  summary: string;
  usage: string;
  flags: { name: string; description: string; required?: boolean; default?: string }[];
  examples: string[];
  sinceVersion: string;
}

// ─── Slice 231-233: Local / Sandbox / Emulator environments ──
export type DevEnvKind = "local" | "sandbox" | "emulator";
export type DevEnvStatus = "stopped" | "starting" | "running" | "error";

export interface DevEnvironment {
  id: string;
  kind: DevEnvKind;
  name: string;
  status: DevEnvStatus;
  ports: { name: string; port: number }[];
  services: string[];
  uptimeSec?: number;
  cpuPct?: number;
  memMb?: number;
  url?: string;
  logs: string[];
  startedAt?: string;
}

// ─── Slice 234-235: Testing + Deployment toolkit ─────────────
export type ToolkitRunStatus = "queued" | "running" | "passed" | "failed";

export interface TestSuiteRun {
  id: string;
  name: string;
  target: string;
  status: ToolkitRunStatus;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  coveragePct?: number;
  startedAt: string;
  finishedAt?: string;
}

export interface DeploymentKitRun {
  id: string;
  target: "dev" | "staging" | "canary" | "production";
  service: string;
  version: string;
  status: ToolkitRunStatus;
  durationMs: number;
  url?: string;
  logs: string[];
  startedAt: string;
  finishedAt?: string;
}

// ─── Aggregate dashboard ─────────────────────────────────────
export interface DevPortalDashboard {
  totalSdks: number;
  gaCount: number;
  betaCount: number;
  previewCount: number;
  totalCliCommands: number;
  runningEnvironments: number;
  latestSdkVersion: string;
  recentRuns: TestSuiteRun[];
  recentDeploys: DeploymentKitRun[];
  weeklyDownloadsTotal: number;
}
