/**
 * Session 59 — Enterprise AI Operating System SDK (V8).
 * Workforce/Agent/Plugin/Skills/Workflow/App/Extension/Connector/Marketplace/Testing/Cert SDKs,
 * CLI, emulator, docs generator, debugger, profiler.
 */

export const SDK_KINDS = [
  "workforce", "agent", "plugin", "skill", "workflow", "app", "extension",
  "connector", "marketplace", "testing", "certification",
] as const;
export type SdkKind = typeof SDK_KINDS[number];

export interface SdkPackage {
  id: string;
  kind: SdkKind;
  name: string;
  version: string;
  language: "typescript" | "python" | "go" | "rust" | "java" | "csharp";
  sizeBytes: number;
  downloads: number;
  docsUrl: string;
  repoUrl?: string;
  publishedAt: string;
  compatibility: string[]; // e.g. ["node20","python3.11"]
  signed: boolean;
}

export interface CliCommand {
  name: string;
  description: string;
  group: string; // auth|agent|workflow|deploy|pkg|...
  flags: Array<{ flag: string; desc: string; required?: boolean }>;
}

export interface EmulatorInstance {
  id: string;
  name: string;
  sdkKind: SdkKind;
  status: "starting" | "running" | "stopped" | "error";
  port: number;
  startedAt?: string;
  logsTail: string[];
}

export interface DebugSession {
  id: string;
  target: string;
  kind: "agent" | "workflow" | "skill" | "plugin";
  breakpoints: number;
  startedAt: string;
  events: number;
  status: "running" | "paused" | "stopped";
}

export interface ProfileRun {
  id: string;
  target: string;
  durationMs: number;
  cpuMs: number;
  memPeakMb: number;
  tokensIn: number;
  tokensOut: number;
  llmCalls: number;
  costUsd: number;
  bottlenecks: string[];
  ranAt: string;
}

export interface CodeTemplate {
  id: string;
  sdkKind: SdkKind;
  name: string;
  description: string;
  language: string;
  stars: number;
  fileCount: number;
}

export interface SdkDashboard {
  packages: SdkPackage[];
  commands: CliCommand[];
  emulatorsRunning: number;
  debugSessionsActive: number;
  profileRuns30d: number;
  templates: CodeTemplate[];
  totalDownloads: number;
  latestCliVersion: string;
  docsCoveragePct: number;
}
