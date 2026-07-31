/**
 * Session 84 — Project Continuity Engine (import existing projects, verify real
 * condition, continue building module-by-module). Types prefixed `Pc`.
 */

export type PcIntakeStatus = "accepted" | "quarantined" | "rejected" | "extracted";

export interface PcFinding {
  /** Finding kind (intake scan) OR category (static verification) — one of the two is set. */
  kind?: string;
  severity: "high" | "medium" | "low";
  message: string;
  file?: string;
  /** Category label used by static verification findings (e.g. "demo_data"). */
  category?: string;
}

/** Archive metadata inspection — read BEFORE any extraction (bomb/path safety). */
export interface PcArchiveInspection {
  inspectedAt: string;
  kind: string;
  entries: number;
  totalUncompressedBytes: number;
  maxEntryBytes: number;
  /** Entry names flagged as unsafe (traversal/absolute/null/symlink). */
  unsafeEntries: Array<{ name: string; reason: string }>;
  /** verdict: ok | bomb | unsafe | invalid | tool_missing */
  verdict: "ok" | "bomb" | "unsafe" | "invalid" | "tool_missing";
  /** Limits applied (from env, with defaults). */
  limits: { maxEntries: number; maxUncompressedMb: number; maxEntryMb: number };
  note?: string;
}

export interface PcQuarantineInfo {
  path?: string;
  encrypted: boolean;
  expiresAt?: string;
  reason?: string;
}

export interface PcProject {
  id: string;
  organizationId: string;
  uploadedById: string;
  filename: string;
  archiveKind: string;
  sizeBytes: number;
  sha256: string;
  status: PcIntakeStatus;
  findings: PcFinding[];
  inspection?: PcArchiveInspection;
  quarantine?: PcQuarantineInfo;
  archivePath?: string;
  extraction?: {
    entries: number;
    files: number;
    bytes: number;
    workspacePath: string;
    extractedAt: string;
  };
  inventory?: PcInventory;
  verification?: PcVerification;
  sandboxValidation?: PcSandboxResult;
  health?: PcHealthReport;
  architecture?: PcArchitectureMap;
  createdAt: string;
  nextStep: string;
}

export interface PcPackageManifest {
  file: string;
  name?: string;
  scripts: string[];
  dependencies: string[];
}

export interface PcInventory {
  scannedAt: string;
  totalFiles: number;
  languages: Record<string, number>;
  manifests: string[];
  packages: PcPackageManifest[];
  routeCandidates: string[];
  serviceCandidates: string[];
  testFiles: string[];
}

export interface PcVerificationExecution {
  build: PcExecStatus;
  typecheck: PcExecStatus;
  tests: PcExecStatus;
}

export type PcExecStatus = "passed" | "failed" | "timeout" | "skipped" | "not_run_requires_sandbox" | "not_configured";

export interface PcVerification {
  verifiedAt: string;
  status: "needs_security_review" | "partial" | "static_checks_passed";
  summary: { high: number; medium: number; low: number };
  findings: PcFinding[];
  execution: PcVerificationExecution;
}

/** Sandboxed build/typecheck/test validation (S84.11 gate). */
export interface PcSandboxStageResult {
  command: string;
  status: "passed" | "failed" | "skipped" | "not_configured" | "timeout";
  exitCode?: number;
  durationMs?: number;
  outputTail?: string;
  note?: string;
}

export interface PcSandboxResult {
  ranAt: string;
  mode: "docker" | "local" | "none";
  stages: PcSandboxStageResult[];
  overall: "passed" | "failed" | "not_configured";
}

export interface PcManifestEntry {
  path: string;
  size: number;
  sha256: string;
}

export interface PcSnapshot {
  id: string;
  projectId: string;
  createdAt: string;
  actorId: string;
  files: number;
  totalBytes: number;
  archiveSnapshotPath: string;
  note?: string;
}

export type PcDiffKind = "added" | "removed" | "changed";

export interface PcDiffEntry {
  path: string;
  kind: PcDiffKind;
  from?: { size: number; sha256: string };
  to?: { size: number; sha256: string };
}

export interface PcDiffResult {
  fromSnapshot: string;
  toSnapshot: string;
  added: number;
  removed: number;
  changed: number;
  entries: PcDiffEntry[];
}

export interface PcChangeLogEntry {
  id: string;
  at: string;
  actorId: string;
  action: "intake" | "extract" | "verify" | "inventory" | "snapshot" | "rollback" | "delete" | "sandbox";
  summary: string;
  detail?: string;
}

/** Aggregate health report (S84.6). */
export interface PcHealthReport {
  reportedAt: string;
  projectStatus: {
    type: string;
    languages: string[];
    framework?: string;
    architecture: string;
  };
  completion: {
    status: "completed" | "partial" | "incomplete" | "broken" | "unknown";
    verified: boolean;
    explanation: string;
  };
  technicalDebt: "high" | "medium" | "low";
  build: PcExecStatus;
  typecheck: PcExecStatus;
  tests: PcExecStatus;
  database: { present: boolean; kind?: string };
  security: { highSeverityFindings: number; quarantined: boolean; clamav: string };
  deployment: { present: boolean; kinds: string[] };
  recommendedBuildOrder: string[];
}

/** Inferred architecture graph (S84.3/84.4) — always labeled "inferred". */
export interface PcArchitectureNode {
  id: string;
  label: string;
  kind: "frontend" | "backend" | "database" | "ai" | "queue" | "cli" | "service" | "unknown";
  evidence: string[];
}

export interface PcArchitectureEdge {
  from: string;
  to: string;
  label: string;
}

export interface PcArchitectureMap {
  projectId: string;
  inferredAt: string;
  method: "inferred_from_inventory";
  nodes: PcArchitectureNode[];
  edges: PcArchitectureEdge[];
}
